import { BadRequestException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, desc, eq, sql } from 'drizzle-orm';
import type { AuthContext } from '../auth/auth.types';
import { AuditService } from '../audit/audit.service';
import { sha256Hex } from '../common/crypto';
import { stableStringify } from '../common/stable-json';
import { ContractsService } from '../contracts/contracts.service';
import { DB, Db, DbExecutor } from '../db/db';
import { ExportLot, exportLots, lotEvents, quoteCostLines, quotes, Settlement, settlements } from '../db/schema';
import { saleSummary } from '../quotes/quote.rules';
import { LotFinanceService } from './lot-finance.service';
import { computeSettlement, directorReview } from './settlement.rules';

const STATUS_LABEL: Record<string, string> = { cho_ktt: 'chờ Kế toán trưởng duyệt', cho_gd: 'chờ Giám đốc duyệt', da_duyet: 'đã duyệt', tra_lai: 'bị trả lại' };

/**
 * Quyết toán lô: kế toán lập khi đủ 6 điều kiện; Kế toán trưởng duyệt; Giám đốc duyệt thêm khi lô lỗ hoặc biên
 * thấp hơn dự toán quá 10% (GĐ-23). Duyệt xong thì số liệu tiền của lô bị khoá và bản quyết toán ghi vào sổ cái
 * của hợp đồng đối ứng.
 */
@Injectable()
export class SettlementsService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly fin: LotFinanceService,
    private readonly contracts: ContractsService,
    private readonly audit: AuditService,
  ) {}

  /** Biên dự toán (%) từ báo giá bán đã chấp nhận sinh ra hợp đồng đối ứng (chỉ mua đứt). */
  async quoteEstimate(lot: ExportLot, exec: DbExecutor = this.db): Promise<{ pct: number; quoteCode: string } | null> {
    if (lot.dealType !== 'mua_dut') return null;
    const [q] = await exec
      .select()
      .from(quotes)
      .where(and(eq(quotes.kind, 'ban'), sql`${quotes.contractIds} @> ${JSON.stringify([lot.counterContractId])}::jsonb`))
      .orderBy(desc(quotes.createdAt))
      .limit(1);
    if (!q) return null;
    const [src] = q.sourceQuoteId ? await exec.select().from(quotes).where(eq(quotes.id, q.sourceQuoteId)) : [];
    const costs = await exec.select().from(quoteCostLines).where(eq(quoteCostLines.quoteId, q.id));
    const s = saleSummary(q, src ?? null, costs);
    return s.bienPhanTram === null ? null : { pct: s.bienPhanTram, quoteCode: q.code };
  }

  async view(lotId: string, ctx: AuthContext) {
    const lot = await this.fin.findLot(lotId);
    this.fin.assertCanView(lot, ctx);
    const r = computeSettlement(await this.fin.settlementInput(lot));
    const estimate = await this.quoteEstimate(lot);
    const history = await this.db
      .select({
        s: settlements,
        preparedByName: sql<string>`(select full_name from users u where u.id = ${settlements.preparedBy})`,
        kttName: sql<string | null>`(select full_name from users u where u.id = ${settlements.chiefAccountantBy})`,
        gdName: sql<string | null>`(select full_name from users u where u.id = ${settlements.directorBy})`,
        returnedByName: sql<string | null>`(select full_name from users u where u.id = ${settlements.returnedBy})`,
      })
      .from(settlements)
      .where(eq(settlements.exportLotId, lotId))
      .orderBy(desc(settlements.preparedAt));
    const active = history.find((h) => h.s.status !== 'tra_lai');
    const ready = r.dieuKien.every((d) => d.dat);
    return {
      loaiGiaoDich: lot.dealType,
      dieuKien: r.dieuKien,
      duThao: { dong: r.dong, bienUsd: r.bienUsd, bienPhanTram: r.bienPhanTram, tongHop: r.tongHop },
      duToan: estimate ? { phanTram: estimate.pct, nguon: `báo giá ${estimate.quoteCode}` } : null,
      banQuyetToan: history.map((h) => ({
        ...h.s,
        trangThai: STATUS_LABEL[h.s.status],
        preparedByName: h.preparedByName,
        kttName: h.kttName,
        gdName: h.gdName,
        returnedByName: h.returnedByName,
        quyen: this.rights(h.s, ctx),
      })),
      quyen: { lap: ctx.permissions.includes('QUYET_TOAN_LAP') && ready && !active, canNhapDuToan: !estimate },
    };
  }

  private rights(s: Settlement, ctx: AuthContext) {
    const ktt = s.status === 'cho_ktt' && ctx.permissions.includes('QUYET_TOAN_DUYET') && s.preparedBy !== ctx.user.id;
    const gd = s.status === 'cho_gd' && ctx.permissions.includes('QUYET_TOAN_DUYET_GD') && s.preparedBy !== ctx.user.id;
    return { duyet: ktt || gd, traLai: ktt || gd };
  }

  async list(ctx: AuthContext, status?: string) {
    if (!ctx.permissions.includes('QUYET_TOAN_LAP') && !ctx.permissions.includes('QUYET_TOAN_DUYET') && !ctx.permissions.includes('QUYET_TOAN_DUYET_GD')) {
      throw new ForbiddenException('Bạn không xem được danh sách quyết toán');
    }
    const rows = await this.db
      .select({ s: settlements, lotCode: exportLots.code, dealType: exportLots.dealType, preparedByName: sql<string>`(select full_name from users u where u.id = ${settlements.preparedBy})` })
      .from(settlements)
      .innerJoin(exportLots, eq(exportLots.id, settlements.exportLotId))
      .where(status ? eq(settlements.status, status) : undefined)
      .orderBy(desc(settlements.preparedAt))
      .limit(200);
    return rows.map((x) => ({
      id: x.s.id,
      exportLotId: x.s.exportLotId,
      lotCode: x.lotCode,
      dealType: x.dealType,
      status: x.s.status,
      trangThai: STATUS_LABEL[x.s.status],
      marginUsd: x.s.marginUsd,
      marginPct: x.s.marginPct,
      estimateMarginPct: x.s.estimateMarginPct,
      needsDirector: x.s.needsDirector,
      directorReason: x.s.directorReason,
      preparedByName: x.preparedByName,
      preparedAt: x.s.preparedAt,
      quyen: this.rights(x.s, ctx),
    }));
  }

  async prepare(lotId: string, input: { estimatePct: number | null; note: string | null }, ctx: AuthContext) {
    this.fin.assertCan(ctx, 'QUYET_TOAN_LAP', 'Chỉ kế toán lập quyết toán');
    return this.db.transaction(async (tx) => {
      const lot = await this.fin.lockLot(lotId, tx);
      await this.fin.assertUnlocked(lot, tx);
      const r = computeSettlement(await this.fin.settlementInput(lot, tx));
      const missing = r.dieuKien.filter((d) => !d.dat);
      if (missing.length) throw new BadRequestException(`Chưa đủ điều kiện quyết toán: ${missing.map((d) => `${d.ten} (${d.chiTiet})`).join('; ')}`);
      const q = await this.quoteEstimate(lot, tx);
      if (!q && input.estimatePct === null) throw new BadRequestException('Lô không có báo giá làm dự toán; ghi biên dự toán (%) theo phương án kinh doanh đã duyệt');
      const estimatePct = q ? q.pct : input.estimatePct;
      const review = directorReview(r.bienUsd, r.bienPhanTram, estimatePct);
      const data = {
        lo: lot.code,
        loaiGiaoDich: lot.dealType,
        dieuKien: r.dieuKien,
        dong: r.dong,
        tongHop: r.tongHop,
        bienUsd: r.bienUsd,
        bienPhanTram: r.bienPhanTram,
        duToanPhanTram: estimatePct,
        nguonDuToan: q ? `báo giá ${q.quoteCode}` : 'nhập tay',
        lapLuc: new Date().toISOString(),
      };
      const hash = sha256Hex(stableStringify(data));
      const [s] = await tx
        .insert(settlements)
        .values({
          exportLotId: lotId,
          status: 'cho_ktt',
          data,
          contentHash: hash,
          marginUsd: r.bienUsd,
          marginPct: r.bienPhanTram,
          estimateMarginPct: estimatePct,
          estimateSource: q ? 'bao_gia' : 'nhap_tay',
          needsDirector: review.can,
          directorReason: review.lyDo,
          note: input.note,
          preparedBy: ctx.user.id,
        })
        .returning();
      await tx.insert(lotEvents).values({ exportLotId: lotId, kind: 'quyet_toan_lap', note: `Biên ${r.bienUsd.toLocaleString('en-US')} USD${review.can ? `; cần Giám đốc duyệt thêm: ${review.lyDo}` : ''}`, actorUserId: ctx.user.id });
      await this.audit.record({ actorUserId: ctx.user.id, action: 'quyet_toan.lap', entityType: 'settlement', entityId: s.id, detail: { lo: lot.code, bienUsd: r.bienUsd, duToan: estimatePct, canGiamDoc: review.can, maBam: hash } }, tx);
      return { id: s.id, canGiamDoc: review.can, lyDo: review.lyDo };
    });
  }

  async approve(id: string, ctx: AuthContext) {
    await this.db.transaction(async (tx) => {
      const { s, lot } = await this.lock(id, tx);
      const r = this.rights(s, ctx);
      if (s.status !== 'cho_ktt' && s.status !== 'cho_gd') throw new BadRequestException(`Quyết toán ${STATUS_LABEL[s.status]}`);
      if (s.preparedBy === ctx.user.id) throw new ForbiddenException('Người lập quyết toán không tự duyệt (nguyên tắc 4 mắt)');
      if (!r.duyet) throw new ForbiddenException(s.status === 'cho_ktt' ? 'Chỉ Kế toán trưởng duyệt quyết toán' : 'Quyết toán này cần Giám đốc duyệt thêm');
      const now = new Date();
      const finalStep = s.status === 'cho_gd' || !s.needsDirector;
      const patch =
        s.status === 'cho_ktt'
          ? { status: finalStep ? 'da_duyet' : 'cho_gd', chiefAccountantBy: ctx.user.id, chiefAccountantAt: now }
          : { status: 'da_duyet', directorBy: ctx.user.id, directorAt: now };
      await tx.update(settlements).set(patch).where(eq(settlements.id, id));
      if (finalStep) {
        await this.contracts.appendLedgerEvent(lot.counterContractId, 'quyet_toan', s.contentHash, `Quyết toán lô ${lot.code}: biên ${s.marginUsd.toLocaleString('en-US')} USD`, ctx, tx);
        await tx.insert(lotEvents).values({ exportLotId: lot.id, kind: 'quyet_toan_duyet', note: `Đã duyệt quyết toán, biên ${s.marginUsd.toLocaleString('en-US')} USD; số liệu tiền của lô đã khoá`, actorUserId: ctx.user.id });
      } else {
        await tx.insert(lotEvents).values({ exportLotId: lot.id, kind: 'quyet_toan_duyet', note: `Kế toán trưởng đã duyệt; chờ Giám đốc duyệt thêm (${s.directorReason})`, actorUserId: ctx.user.id });
      }
      await this.audit.record({ actorUserId: ctx.user.id, action: 'quyet_toan.duyet', entityType: 'settlement', entityId: id, detail: { lo: lot.code, buoc: s.status, xong: finalStep } }, tx);
    });
  }

  async returnBack(id: string, reason: string, ctx: AuthContext) {
    await this.db.transaction(async (tx) => {
      const { s, lot } = await this.lock(id, tx);
      if (s.status !== 'cho_ktt' && s.status !== 'cho_gd') throw new BadRequestException(`Quyết toán ${STATUS_LABEL[s.status]}`);
      if (!this.rights(s, ctx).traLai) throw new ForbiddenException('Chỉ người duyệt ở bước hiện tại trả lại được quyết toán');
      await tx.update(settlements).set({ status: 'tra_lai', returnedBy: ctx.user.id, returnedAt: new Date(), returnReason: reason }).where(eq(settlements.id, id));
      await tx.insert(lotEvents).values({ exportLotId: lot.id, kind: 'quyet_toan_tra_lai', note: reason, actorUserId: ctx.user.id });
      await this.audit.record({ actorUserId: ctx.user.id, action: 'quyet_toan.tra_lai', entityType: 'settlement', entityId: id, detail: { lo: lot.code, lyDo: reason } }, tx);
    });
  }

  private async lock(id: string, tx: DbExecutor) {
    const [head] = await tx.select({ lotId: settlements.exportLotId }).from(settlements).where(eq(settlements.id, id));
    if (!head) throw new NotFoundException('Không tìm thấy quyết toán');
    const lot = await this.fin.lockLot(head.lotId, tx);
    const [s] = await tx.select().from(settlements).where(eq(settlements.id, id)).for('update');
    return { s, lot };
  }
}

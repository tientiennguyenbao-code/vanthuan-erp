import { BadRequestException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, desc, eq, sql } from 'drizzle-orm';
import type { AuthContext } from '../auth/auth.types';
import { AuditService } from '../audit/audit.service';
import { sha256Hex } from '../common/crypto';
import { stableStringify } from '../common/stable-json';
import { ContractsService } from '../contracts/contracts.service';
import { DB, Db, DbExecutor } from '../db/db';
import { complaints, ExportLot, exportLots, lotEvents, purchaseLots } from '../db/schema';
import { LotFinanceService } from './lot-finance.service';
import { faultHint } from './settlement.rules';

export interface OpenInput {
  kind: string;
  description: string;
  claimedAmount: number | null;
  evidence: string | null;
}

export interface CloseInput {
  fault: string;
  agreedAmount: number;
  passBackPurchaseLotId: string | null;
  passBackAmount: number | null;
  amendmentRef: string | null;
  resolution: string;
}

const FAULT_LABEL: Record<string, string> = { ncc: 'nhà cung cấp', van_chuyen: 'vận chuyển, bảo hiểm', nguoi_mua: 'người mua', van_thuan: 'Vạn Thuận', khong_co_loi: 'không có lỗi' };

/** Khiếu nại sau giao hàng: mở, xét lỗi đối chiếu giám định cảng đi, kết luận giảm trừ và chuyển trách nhiệm cho nhà cung cấp. */
@Injectable()
export class ComplaintsService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly fin: LotFinanceService,
    private readonly contracts: ContractsService,
    private readonly audit: AuditService,
  ) {}

  private canOpen(lot: ExportLot, ctx: AuthContext) {
    return ctx.permissions.includes('KHIEU_NAI_MO') && (ctx.permissions.includes('LO_HANG_PHAN_CONG') || lot.ownerUserId === ctx.user.id);
  }

  async listForLot(lotId: string, ctx: AuthContext) {
    const lot = await this.fin.findLot(lotId);
    this.fin.assertCanView(lot, ctx);
    const state = await this.fin.lotState(lot);
    const locked = !!(await this.fin.activeSettlement(lotId));
    const rows = await this.rows(eq(complaints.exportLotId, lotId));
    const shipped = lot.status === 'xep_tau' || lot.status === 'hoan_tat';
    const resolve = ctx.permissions.includes('KHIEU_NAI_GIAI_QUYET');
    const v = await this.fin.lotValues(lot);
    return {
      khieuNai: rows.map((c) => ({
        ...c,
        goiY: c.status === 'mo' ? faultHint(c.kind, state.inspection) : null,
        quyen: { dong: resolve && !locked && c.status === 'mo' && c.openedBy !== ctx.user.id },
      })),
      giamDinhCangDi: state.inspection,
      tienTe: v.currency,
      loMua: v.purchaseLots.map((p) => ({ id: p.purchaseLotId, code: p.code, supplierName: p.supplierName })),
      quyen: { mo: this.canOpen(lot, ctx) && shipped && !locked },
    };
  }

  async list(ctx: AuthContext, status?: string) {
    const all = this.fin.canSeeAll(ctx);
    if (!all && !ctx.permissions.includes('PHI_XEM_CUA_MINH')) throw new ForbiddenException('Bạn không xem được khiếu nại');
    return this.rows(and(status ? eq(complaints.status, status) : undefined, all ? undefined : eq(exportLots.ownerUserId, ctx.user.id)));
  }

  private async rows(where: ReturnType<typeof and>) {
    const r = await this.db
      .select({
        c: complaints,
        lotCode: exportLots.code,
        passBackLotCode: purchaseLots.code,
        openedByName: sql<string>`(select full_name from users u where u.id = ${complaints.openedBy})`,
        closedByName: sql<string | null>`(select full_name from users u where u.id = ${complaints.closedBy})`,
      })
      .from(complaints)
      .innerJoin(exportLots, eq(exportLots.id, complaints.exportLotId))
      .leftJoin(purchaseLots, eq(purchaseLots.id, complaints.passBackPurchaseLotId))
      .where(where)
      .orderBy(desc(complaints.openedAt));
    return r.map((x) => ({ ...x.c, lotCode: x.lotCode, passBackLotCode: x.passBackLotCode, openedByName: x.openedByName, closedByName: x.closedByName }));
  }

  async open(lotId: string, input: OpenInput, ctx: AuthContext) {
    return this.db.transaction(async (tx) => {
      const lot = await this.fin.lockLot(lotId, tx);
      if (!this.canOpen(lot, ctx)) throw new ForbiddenException('Bạn chỉ mở được khiếu nại cho lô do mình phụ trách');
      if (lot.status !== 'xep_tau' && lot.status !== 'hoan_tat') throw new BadRequestException('Chỉ mở khiếu nại sau khi hàng đã xếp tàu');
      await this.fin.assertUnlocked(lot, tx);
      const v = await this.fin.lotValues(lot, tx);
      const code = await this.nextCode(tx);
      const [c] = await tx
        .insert(complaints)
        .values({ code, exportLotId: lotId, kind: input.kind, description: input.description, claimedAmount: input.claimedAmount, currency: v.currency, evidence: input.evidence, openedBy: ctx.user.id })
        .returning();
      await tx.insert(lotEvents).values({ exportLotId: lotId, kind: 'khieu_nai_mo', note: `${code}: ${input.description}`, actorUserId: ctx.user.id });
      await this.audit.record({ actorUserId: ctx.user.id, action: 'khieu_nai.mo', entityType: 'complaint', entityId: c.id, detail: { lo: lot.code, ma: code, loai: input.kind, soTienYeuCau: input.claimedAmount } }, tx);
      return { id: c.id, code };
    });
  }

  async close(id: string, input: CloseInput, ctx: AuthContext) {
    this.fin.assertCan(ctx, 'KHIEU_NAI_GIAI_QUYET', 'Chỉ Trưởng phòng kinh doanh hoặc Ban Giám đốc kết luận khiếu nại');
    await this.db.transaction(async (tx) => {
      const [head] = await tx.select({ lotId: complaints.exportLotId }).from(complaints).where(eq(complaints.id, id));
      if (!head) throw new NotFoundException('Không tìm thấy khiếu nại');
      const lot = await this.fin.lockLot(head.lotId, tx);
      const [c] = await tx.select().from(complaints).where(eq(complaints.id, id)).for('update');
      if (c.status !== 'mo') throw new BadRequestException('Khiếu nại đã đóng');
      if (c.openedBy === ctx.user.id) throw new ForbiddenException('Người mở khiếu nại không tự kết luận (nguyên tắc 4 mắt)');
      await this.fin.assertUnlocked(lot, tx);
      if (c.claimedAmount !== null && input.agreedAmount > c.claimedAmount) throw new BadRequestException('Số giảm trừ lớn hơn số người mua yêu cầu');
      if (input.agreedAmount > 0 && (input.fault === 'nguoi_mua' || input.fault === 'khong_co_loi')) throw new BadRequestException('Lỗi của người mua hoặc không có lỗi thì không giảm trừ');
      if (input.agreedAmount > 0 && !input.amendmentRef) throw new BadRequestException('Ghi số phụ lục hợp đồng đối ứng ghi nhận khoản giảm trừ');
      let passBackLot: string | null = null;
      let passBack: number | null = null;
      if (input.passBackPurchaseLotId || input.passBackAmount) {
        if (input.fault !== 'ncc') throw new BadRequestException('Chỉ chuyển trách nhiệm cho nhà cung cấp khi lỗi do hàng hoá của nhà cung cấp');
        if (!input.passBackPurchaseLotId || !input.passBackAmount) throw new BadRequestException('Chọn lô mua và ghi số tiền chuyển cho nhà cung cấp');
        if (input.passBackAmount > input.agreedAmount) throw new BadRequestException('Số chuyển cho nhà cung cấp không vượt số giảm trừ cho người mua');
        const v = await this.fin.lotValues(lot, tx);
        if (!v.purchaseLots.some((p) => p.purchaseLotId === input.passBackPurchaseLotId)) throw new BadRequestException('Lô mua không có hàng trong lô xuất này');
        passBackLot = input.passBackPurchaseLotId;
        passBack = input.passBackAmount;
      }
      const now = new Date();
      const patch = {
        status: 'da_dong',
        fault: input.fault,
        agreedAmount: input.agreedAmount,
        passBackPurchaseLotId: passBackLot,
        passBackAmount: passBack,
        amendmentRef: input.amendmentRef,
        resolution: input.resolution,
        closedBy: ctx.user.id,
        closedAt: now,
      };
      await tx.update(complaints).set(patch).where(eq(complaints.id, id));
      const hash = sha256Hex(stableStringify({ khieuNai: c.code, lo: lot.code, ...patch, closedAt: now.toISOString() }));
      const note = `${c.code}: lỗi ${FAULT_LABEL[input.fault]}, giảm trừ ${input.agreedAmount.toLocaleString('vi-VN')} ${c.currency}${input.amendmentRef ? ` (phụ lục ${input.amendmentRef})` : ''}`;
      await this.contracts.appendLedgerEvent(lot.counterContractId, 'khieu_nai', hash, note, ctx, tx);
      await tx.insert(lotEvents).values({ exportLotId: lot.id, purchaseLotId: passBackLot, kind: 'khieu_nai_dong', note, actorUserId: ctx.user.id });
      await this.audit.record({ actorUserId: ctx.user.id, action: 'khieu_nai.dong', entityType: 'complaint', entityId: id, detail: { lo: lot.code, ma: c.code, loi: input.fault, giamTru: input.agreedAmount, chuyenNcc: passBack, maBam: hash } }, tx);
    });
  }

  private async nextCode(tx: DbExecutor) {
    const p = `KN-${new Date().getUTCFullYear()}-`;
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${'complaint_code:' + p}))`);
    const [{ max }] = await tx
      .select({ max: sql<number | null>`max(substring(${complaints.code}, ${p.length + 1}::int)::int)` })
      .from(complaints)
      .where(sql`${complaints.code} like ${p + '%'}`);
    return `${p}${String((max ?? 0) + 1).padStart(4, '0')}`;
  }
}

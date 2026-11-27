import { BadRequestException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, asc, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import { AuditService } from '../audit/audit.service';
import type { AuthContext } from '../auth/auth.types';
import { DB, Db, DbExecutor } from '../db/db';
import { commodities, exportLots, facilities, facilityKeepers, goodsIssueLines, goodsIssues, lotAllocations, partners, purchaseLots, stockLotOrigins, stockLots, stockMoves, users } from '../db/schema';
import { LotsService } from '../lots/lots.service';
import { issueRefusal, toPurchaseLots } from './kho.rules';
import { returnIssuedStock } from './stock-return';

const r2 = (n: number) => Math.round(n * 100) / 100;
const fmt = (n: number) => r2(n).toLocaleString('vi-VN', { maximumFractionDigits: 2 });

export interface IssueInput {
  exportLotId: string;
  facilityId: string;
  issuedOn: string;
  vehicleNo: string | null;
  containerNo: string | null;
  lines: { stockLotId: string; quantityKg: number }[];
  note: string | null;
}

/** Phiếu xuất kho (KS-5): lô xuất lấy hàng từ lô tồn, phần mềm quy về lô mua theo tỷ lệ nguồn gốc. */
@Injectable()
export class IssueService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly audit: AuditService,
    private readonly lots: LotsService,
  ) {}

  private assertView(ctx: AuthContext) {
    if (!ctx.permissions.includes('KHO_XEM')) throw new ForbiddenException('Bạn không có quyền xem kho');
  }

  private async assertKeeper(facilityId: string, ctx: AuthContext, exec: DbExecutor) {
    if (!ctx.permissions.includes('KHO_GHI_PHIEU')) throw new ForbiddenException('Chỉ thủ kho ghi phiếu xuất kho');
    const [k] = await exec.select().from(facilityKeepers).where(and(eq(facilityKeepers.facilityId, facilityId), eq(facilityKeepers.userId, ctx.user.id)));
    if (!k) throw new ForbiddenException('Bạn chưa được giao kho này');
  }

  /** Lô xuất đang đóng gói, để thủ kho chọn khi xuất: khối lượng hợp đồng, đã phân bổ, còn thiếu. */
  async targets(ctx: AuthContext) {
    this.assertView(ctx);
    const rows = await this.db
      .select({ e: exportLots, commodityName: commodities.name, sector: commodities.sector, buyerName: partners.name })
      .from(exportLots)
      .innerJoin(commodities, eq(commodities.id, exportLots.commodityId))
      .innerJoin(partners, eq(partners.id, exportLots.buyerPartnerId))
      .where(eq(exportLots.status, 'dong_goi'))
      .orderBy(asc(exportLots.code));
    const out = [];
    for (const r of rows) {
      const w = await this.lots.contractWindow(r.e, this.db);
      const [{ kg }] = await this.db
        .select({ kg: sql<number>`coalesce(sum(${lotAllocations.quantityKg}), 0)::float8` })
        .from(lotAllocations)
        .where(and(eq(lotAllocations.exportLotId, r.e.id), isNull(lotAllocations.cancelledAt)));
      out.push({
        id: r.e.id,
        code: r.e.code,
        market: r.e.market,
        dealType: r.e.dealType,
        commodityId: r.e.commodityId,
        commodityName: r.commodityName,
        sector: r.sector,
        buyerName: r.buyerName,
        etd: r.e.etd,
        contractKg: w?.contractKg ?? null,
        tolerancePct: w?.tolerancePct ?? null,
        allocatedKg: r2(kg),
      });
    }
    return out;
  }

  async create(input: IssueInput, ctx: AuthContext) {
    if (input.issuedOn > new Date().toISOString().slice(0, 10)) throw new BadRequestException('Ngày xuất không được ở tương lai');
    if (new Set(input.lines.map((l) => l.stockLotId)).size !== input.lines.length) throw new BadRequestException('Một lô tồn chỉ ghi một lần trong phiếu');
    return this.db.transaction(async (tx) => {
      await this.assertKeeper(input.facilityId, ctx, tx);
      const [exp] = await tx.select().from(exportLots).where(eq(exportLots.id, input.exportLotId)).for('update');
      if (!exp) throw new NotFoundException('Không tìm thấy lô xuất');
      const [{ sector }] = await tx.select({ sector: commodities.sector }).from(commodities).where(eq(commodities.id, exp.commodityId));
      const ids = input.lines.map((l) => l.stockLotId).sort();
      const lots = await tx.select().from(stockLots).where(inArray(stockLots.id, ids)).orderBy(asc(stockLots.id)).for('update');
      if (lots.length !== ids.length) throw new NotFoundException('Không tìm thấy lô tồn');
      const byId = new Map(lots.map((l) => [l.id, l]));
      for (const l of input.lines) {
        const s = byId.get(l.stockLotId)!;
        const bad = issueRefusal({ ...s, quantityKg: l.quantityKg }, exp, input.facilityId, sector);
        if (bad) throw new BadRequestException(bad);
      }
      const total = r2(input.lines.reduce((s, l) => s + l.quantityKg, 0));
      const w = await this.lots.contractWindow(exp, tx);
      if (!w) throw new BadRequestException('Hợp đồng đối ứng của lô xuất không còn hiệu lực');
      const [{ kg }] = await tx
        .select({ kg: sql<number>`coalesce(sum(${lotAllocations.quantityKg}), 0)::float8` })
        .from(lotAllocations)
        .where(and(eq(lotAllocations.exportLotId, exp.id), isNull(lotAllocations.cancelledAt)));
      const max = w.contractKg * (1 + w.tolerancePct / 100);
      if (kg + total > max + 0.005) throw new BadRequestException(`Lô xuất chỉ cần thêm tối đa ${fmt(Math.max(0, max - kg))} kg (hợp đồng ${fmt(w.contractKg)} kg, dung sai ±${w.tolerancePct}%)`);

      const origins = await tx.select().from(stockLotOrigins).where(inArray(stockLotOrigins.stockLotId, ids));
      const rows = toPurchaseLots(input.lines.map((l) => ({ quantityKg: l.quantityKg, origins: origins.filter((o) => o.stockLotId === l.stockLotId) })));
      const code = await this.nextCode(tx, `PXK-${input.issuedOn.slice(0, 4)}-`);
      const [g] = await tx
        .insert(goodsIssues)
        .values({ code, exportLotId: exp.id, facilityId: input.facilityId, issuedOn: input.issuedOn, vehicleNo: input.vehicleNo, containerNo: input.containerNo, quantityKg: total, note: input.note, createdBy: ctx.user.id })
        .returning({ id: goodsIssues.id });
      for (const l of input.lines) {
        const s = byId.get(l.stockLotId)!;
        await tx.insert(goodsIssueLines).values({ issueId: g.id, stockLotId: s.id, quantityKg: r2(l.quantityKg) });
        await tx.update(stockLots).set({ remainingKg: r2(s.remainingKg - l.quantityKg) }).where(eq(stockLots.id, s.id));
        await tx.insert(stockMoves).values({ stockLotId: s.id, kind: 'xuat_kho', quantityKg: -r2(l.quantityKg), fromZoneId: s.zoneId, refId: g.id, note: `${code} → ${exp.code}`, actorUserId: ctx.user.id });
      }
      await this.lots.allocateFromIssue(exp, rows, { id: g.id, code }, ctx, tx);
      await this.audit.record({ actorUserId: ctx.user.id, action: 'kho.xuat_kho', entityType: 'goods_issue', entityId: g.id, detail: { ma: code, loXuat: exp.code, kg: total } }, tx);
      return { id: g.id, code, quantityKg: total, loMua: rows };
    });
  }

  async void(id: string, reason: string, ctx: AuthContext) {
    await this.db.transaction(async (tx) => {
      const [g] = await tx.select().from(goodsIssues).where(eq(goodsIssues.id, id)).for('update');
      if (!g) throw new NotFoundException('Không tìm thấy phiếu xuất kho');
      await this.assertKeeper(g.facilityId, ctx, tx);
      if (g.voidedAt) throw new BadRequestException('Phiếu đã huỷ');
      const [exp] = await tx.select().from(exportLots).where(eq(exportLots.id, g.exportLotId)).for('update');
      if (exp.status !== 'dong_goi') throw new BadRequestException('Lô xuất đã qua bước đóng gói, không huỷ phiếu xuất kho được');
      await returnIssuedStock(tx, id, ctx.user.id, reason);
      await this.lots.releaseIssue(exp, { id, code: g.code }, reason, ctx, tx);
      await this.audit.record({ actorUserId: ctx.user.id, action: 'kho.huy_xuat_kho', entityType: 'goods_issue', entityId: id, detail: { ma: g.code, lyDo: reason } }, tx);
    });
  }

  async list(ctx: AuthContext, filter: { facilityId?: string; exportLotId?: string }) {
    this.assertView(ctx);
    const conds = [];
    if (filter.facilityId) conds.push(eq(goodsIssues.facilityId, filter.facilityId));
    if (filter.exportLotId) conds.push(eq(goodsIssues.exportLotId, filter.exportLotId));
    const rows = await this.db
      .select({ g: goodsIssues, exportCode: exportLots.code, exportStatus: exportLots.status, facilityName: facilities.name, by: users.fullName })
      .from(goodsIssues)
      .innerJoin(exportLots, eq(exportLots.id, goodsIssues.exportLotId))
      .innerJoin(facilities, eq(facilities.id, goodsIssues.facilityId))
      .innerJoin(users, eq(users.id, goodsIssues.createdBy))
      .where(conds.length ? and(...conds) : undefined)
      .orderBy(desc(goodsIssues.createdAt))
      .limit(500);
    const ids = rows.map((r) => r.g.id);
    const lines = ids.length
      ? await this.db.select({ issueId: goodsIssueLines.issueId, stockLotId: goodsIssueLines.stockLotId, kg: goodsIssueLines.quantityKg, code: stockLots.code, grade: stockLots.grade }).from(goodsIssueLines).innerJoin(stockLots, eq(stockLots.id, goodsIssueLines.stockLotId)).where(inArray(goodsIssueLines.issueId, ids))
      : [];
    const allocs = ids.length
      ? await this.db
          .select({ issueId: lotAllocations.goodsIssueId, purchaseLotId: lotAllocations.purchaseLotId, kg: lotAllocations.quantityKg, code: purchaseLots.code, approved: lotAllocations.approvedAt, cancelled: lotAllocations.cancelledAt })
          .from(lotAllocations)
          .innerJoin(purchaseLots, eq(purchaseLots.id, lotAllocations.purchaseLotId))
          .where(inArray(lotAllocations.goodsIssueId, ids))
          .orderBy(desc(lotAllocations.quantityKg))
      : [];
    const mine = new Set(
      (await this.db.select({ f: facilityKeepers.facilityId }).from(facilityKeepers).where(eq(facilityKeepers.userId, ctx.user.id))).map((x) => x.f),
    );
    return rows.map((r) => ({
      ...r.g,
      exportCode: r.exportCode,
      exportStatus: r.exportStatus,
      facilityName: r.facilityName,
      createdByName: r.by,
      dong: lines.filter((l) => l.issueId === r.g.id).map((l) => ({ stockLotId: l.stockLotId, code: l.code, grade: l.grade, quantityKg: l.kg })),
      loMua: allocs.filter((a) => a.issueId === r.g.id).map((a) => ({ purchaseLotId: a.purchaseLotId, code: a.code, quantityKg: a.kg, approved: !!a.approved, cancelled: !!a.cancelled })),
      quyen: { huy: !r.g.voidedAt && r.exportStatus === 'dong_goi' && mine.has(r.g.facilityId) && ctx.permissions.includes('KHO_GHI_PHIEU') },
    }));
  }

  private async nextCode(tx: DbExecutor, prefix: string) {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${'kho_code:' + prefix}))`);
    const [{ max }] = await tx
      .select({ max: sql<number | null>`max(substring(${goodsIssues.code}, ${prefix.length + 1}::int)::int)` })
      .from(goodsIssues)
      .where(sql`${goodsIssues.code} like ${prefix + '%'}`);
    return `${prefix}${String((max ?? 0) + 1).padStart(4, '0')}`;
  }
}

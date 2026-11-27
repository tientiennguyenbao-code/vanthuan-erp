import { BadRequestException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, asc, desc, eq, gt, inArray, sql } from 'drizzle-orm';
import { AuditService } from '../audit/audit.service';
import type { AuthContext } from '../auth/auth.types';
import { DB, Db, DbExecutor } from '../db/db';
import { commodities, facilities, facilityZones, StockCount, stockCountLines, stockCounts, stockLots, stockMoves, users } from '../db/schema';
import { COUNT_TOLERANCE_PCT, countPeriod, countVariance } from './kho.rules';
import { assertKeeperOf, keeperFacilityIds, nextKhoCode, r2 } from './kho.shared';

/**
 * Kiểm kê tháng (KS-6). Mở đợt thì chụp số sổ của mọi lô tồn còn hàng; thủ kho ghi số đếm từng lô rồi chốt.
 * Không lô nào lệch quá 0,5% thì điều chỉnh ngay; có thì Kế toán trưởng duyệt hoặc trả lại.
 * Điều chỉnh theo phần chênh (đếm − sổ lúc mở), nên hàng ra vào giữa chừng vẫn giữ đúng.
 */
@Injectable()
export class CountService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly audit: AuditService,
  ) {}

  async open(facilityId: string, countedOn: string, note: string | null, ctx: AuthContext) {
    if (countedOn > new Date().toISOString().slice(0, 10)) throw new BadRequestException('Ngày kiểm kê không được ở tương lai');
    return this.db.transaction(async (tx) => {
      await assertKeeperOf(facilityId, ctx, tx, 'mở đợt kiểm kê');
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${'kiem_ke:' + facilityId}))`);
      const [busy] = await tx.select({ code: stockCounts.code }).from(stockCounts).where(and(eq(stockCounts.facilityId, facilityId), inArray(stockCounts.status, ['dang_dem', 'cho_duyet'])));
      if (busy) throw new BadRequestException(`Kho đang có đợt kiểm kê ${busy.code} chưa xong`);
      const lots = await tx.select().from(stockLots).where(and(eq(stockLots.facilityId, facilityId), gt(stockLots.remainingKg, 0)));
      if (!lots.length) throw new BadRequestException('Kho không có lô tồn nào còn hàng để kiểm kê');
      const code = await nextKhoCode(tx, stockCounts, stockCounts.code, `KK-${countedOn.slice(0, 4)}-`, 4);
      const [c] = await tx.insert(stockCounts).values({ code, facilityId, period: countPeriod(countedOn), countedOn, note, createdBy: ctx.user.id }).returning({ id: stockCounts.id });
      await tx.insert(stockCountLines).values(lots.map((l) => ({ countId: c.id, stockLotId: l.id, bookKg: l.remainingKg })));
      await this.audit.record({ actorUserId: ctx.user.id, action: 'kho.mo_kiem_ke', entityType: 'stock_count', entityId: c.id, detail: { ma: code, soLo: lots.length } }, tx);
      return { id: c.id, code, lines: lots.length };
    });
  }

  /** Ghi số đếm cho một số lô (có thể ghi nhiều lần trước khi chốt). */
  async record(id: string, lines: { stockLotId: string; countedKg: number; note: string | null }[], ctx: AuthContext) {
    await this.db.transaction(async (tx) => {
      const c = await this.lock(id, tx);
      await assertKeeperOf(c.facilityId, ctx, tx, 'ghi số kiểm kê');
      if (c.status !== 'dang_dem') throw new BadRequestException('Đợt kiểm kê đã chốt, không sửa số đếm được');
      for (const l of lines) {
        const r = await tx
          .update(stockCountLines)
          .set({ countedKg: r2(l.countedKg), note: l.note })
          .where(and(eq(stockCountLines.countId, id), eq(stockCountLines.stockLotId, l.stockLotId)))
          .returning({ id: stockCountLines.stockLotId });
        if (!r.length) throw new BadRequestException('Lô tồn không có trong đợt kiểm kê này');
      }
    });
  }

  /** Thủ kho chốt: không lô nào lệch quá ngưỡng thì điều chỉnh ngay, có thì chờ Kế toán trưởng. */
  async submit(id: string, ctx: AuthContext) {
    return this.db.transaction(async (tx) => {
      const c = await this.lock(id, tx);
      await assertKeeperOf(c.facilityId, ctx, tx, 'chốt kiểm kê');
      if (c.status !== 'dang_dem') throw new BadRequestException('Đợt kiểm kê đã chốt');
      const lines = await tx.select().from(stockCountLines).where(eq(stockCountLines.countId, id));
      const missing = lines.filter((l) => l.countedKg === null).length;
      if (missing) throw new BadRequestException(`Còn ${missing} lô chưa ghi số đếm`);
      const over = lines.filter((l) => countVariance(l.bookKg, l.countedKg!).overTolerance);
      const now = new Date();
      if (over.length) {
        await tx.update(stockCounts).set({ status: 'cho_duyet', submittedAt: now }).where(eq(stockCounts.id, id));
      } else {
        await this.apply(c, ctx, tx);
        await tx.update(stockCounts).set({ status: 'da_dieu_chinh', submittedAt: now }).where(eq(stockCounts.id, id));
      }
      await this.audit.record({ actorUserId: ctx.user.id, action: 'kho.chot_kiem_ke', entityType: 'stock_count', entityId: id, detail: { ma: c.code, loVuotNguong: over.length } }, tx);
      return { status: over.length ? 'cho_duyet' : 'da_dieu_chinh', overTolerance: over.length };
    });
  }

  /** Kế toán trưởng duyệt (điều chỉnh sổ) hoặc trả lại (không điều chỉnh, thủ kho mở đợt đếm lại). */
  async decide(id: string, approve: boolean, note: string | null, ctx: AuthContext) {
    if (!ctx.permissions.includes('KIEM_KE_DUYET')) throw new ForbiddenException('Chỉ Kế toán trưởng duyệt kết quả kiểm kê');
    if (!approve && !note) throw new BadRequestException('Ghi lý do trả lại');
    await this.db.transaction(async (tx) => {
      const c = await this.lock(id, tx);
      if (c.status !== 'cho_duyet') throw new BadRequestException('Đợt kiểm kê không ở trạng thái chờ duyệt');
      if (approve) await this.apply(c, ctx, tx);
      await tx.update(stockCounts).set({ status: approve ? 'da_dieu_chinh' : 'tu_choi', decidedBy: ctx.user.id, decidedAt: new Date(), decisionNote: note }).where(eq(stockCounts.id, id));
      await this.audit.record({ actorUserId: ctx.user.id, action: approve ? 'kho.duyet_kiem_ke' : 'kho.tra_lai_kiem_ke', entityType: 'stock_count', entityId: id, detail: { ma: c.code, ghiChu: note } }, tx);
    });
  }

  private async apply(c: StockCount, ctx: AuthContext, tx: DbExecutor) {
    const lines = await tx.select().from(stockCountLines).where(eq(stockCountLines.countId, c.id)).orderBy(asc(stockCountLines.stockLotId));
    for (const l of lines) {
      const { diffKg } = countVariance(l.bookKg, l.countedKg!);
      if (Math.abs(diffKg) < 0.005) continue;
      const [s] = await tx.select().from(stockLots).where(eq(stockLots.id, l.stockLotId)).for('update');
      const after = r2(s.remainingKg + diffKg);
      if (after < -0.005) throw new BadRequestException(`${s.code}: số trên sổ đã thay đổi sau khi mở đợt, điều chỉnh sẽ âm. Trả lại để đếm lại.`);
      await tx.update(stockLots).set({ remainingKg: Math.max(0, after) }).where(eq(stockLots.id, s.id));
      await tx.insert(stockMoves).values({ stockLotId: s.id, kind: 'kiem_ke', quantityKg: diffKg, refId: c.id, note: `${c.code}: sổ ${r2(l.bookKg)} kg, đếm ${r2(l.countedKg!)} kg${l.note ? ` (${l.note})` : ''}`, actorUserId: ctx.user.id });
    }
  }

  async list(ctx: AuthContext, filter: { facilityId?: string; status?: string }) {
    if (!ctx.permissions.includes('KHO_XEM')) throw new ForbiddenException('Bạn không có quyền xem kho');
    const conds = [];
    if (filter.facilityId) conds.push(eq(stockCounts.facilityId, filter.facilityId));
    if (filter.status) conds.push(eq(stockCounts.status, filter.status));
    const rows = await this.db
      .select({ c: stockCounts, facilityName: facilities.name, by: users.fullName, decidedByName: sql<string | null>`(select full_name from users u where u.id = ${stockCounts.decidedBy})` })
      .from(stockCounts)
      .innerJoin(facilities, eq(facilities.id, stockCounts.facilityId))
      .innerJoin(users, eq(users.id, stockCounts.createdBy))
      .where(conds.length ? and(...conds) : undefined)
      .orderBy(desc(stockCounts.createdAt))
      .limit(200);
    const ids = rows.map((r) => r.c.id);
    const lines = ids.length
      ? await this.db
          .select({ l: stockCountLines, code: stockLots.code, grade: stockLots.grade, kind: stockLots.kind, zoneCode: facilityZones.code, commodityName: commodities.name })
          .from(stockCountLines)
          .innerJoin(stockLots, eq(stockLots.id, stockCountLines.stockLotId))
          .innerJoin(facilityZones, eq(facilityZones.id, stockLots.zoneId))
          .innerJoin(commodities, eq(commodities.id, stockLots.commodityId))
          .where(inArray(stockCountLines.countId, ids))
          .orderBy(asc(facilityZones.code), asc(stockLots.code))
      : [];
    const mine = await keeperFacilityIds(ctx.user.id, this.db);
    const keeper = ctx.permissions.includes('KHO_GHI_PHIEU');
    const approver = ctx.permissions.includes('KIEM_KE_DUYET');
    return rows.map((r) => {
      const ls = lines
        .filter((x) => x.l.countId === r.c.id)
        .map((x) => ({
          stockLotId: x.l.stockLotId,
          code: x.code,
          grade: x.grade,
          kind: x.kind,
          zoneCode: x.zoneCode,
          commodityName: x.commodityName,
          bookKg: x.l.bookKg,
          countedKg: x.l.countedKg,
          note: x.l.note,
          ...(x.l.countedKg === null ? { diffKg: null, diffPct: null, overTolerance: false } : countVariance(x.l.bookKg, x.l.countedKg)),
        }));
      return {
        ...r.c,
        facilityName: r.facilityName,
        createdByName: r.by,
        decidedByName: r.decidedByName,
        tolerancePct: COUNT_TOLERANCE_PCT,
        tong: { bookKg: r2(ls.reduce((s, x) => s + x.bookKg, 0)), countedKg: r2(ls.reduce((s, x) => s + (x.countedKg ?? 0), 0)), daDem: ls.filter((x) => x.countedKg !== null).length, vuot: ls.filter((x) => x.overTolerance).length },
        dong: ls,
        quyen: { ghi: keeper && r.c.status === 'dang_dem' && mine.has(r.c.facilityId), duyet: approver && r.c.status === 'cho_duyet' },
      };
    });
  }

  private async lock(id: string, tx: DbExecutor) {
    const [c] = await tx.select().from(stockCounts).where(eq(stockCounts.id, id)).for('update');
    if (!c) throw new NotFoundException('Không tìm thấy đợt kiểm kê');
    return c;
  }
}

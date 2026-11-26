import { BadRequestException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, asc, between, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import { AuditService } from '../audit/audit.service';
import type { AuthContext } from '../auth/auth.types';
import { DB, Db, DbExecutor } from '../db/db';
import { collectionSlips, commodities, farmers, growingAreas, lotEvents, partners, plots, PurchaseLot, purchaseLots, settings, users } from '../db/schema';
import {
  capRefusal,
  classRefusal,
  EMPTY_YIELD,
  EUDR_SECTORS,
  EudrClass,
  eudrReasons,
  plotCapKg,
  windowStart,
  YIELD_KEY,
  YIELD_SECTORS,
  yieldFor,
  YieldSetting,
} from './collection.rules';
import { SourcingService } from './sourcing.service';

export interface SlipInput {
  farmerId: string;
  plotId: string;
  harvestDate: string;
  quantityKg: number;
  moisturePct?: number | null;
  weighTicketNo?: string | null;
  note?: string | null;
}

const r2 = (n: number) => Math.round(n * 100) / 100;
const today = () => new Date().toISOString().slice(0, 10);

@Injectable()
export class CollectionService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly audit: AuditService,
    private readonly sourcing: SourcingService,
  ) {}

  // ---------- Năng suất tối đa ----------

  async yieldSetting(exec: DbExecutor = this.db): Promise<YieldSetting> {
    const [row] = await exec.select().from(settings).where(eq(settings.key, YIELD_KEY));
    return { ...EMPTY_YIELD, ...((row?.value as Partial<YieldSetting>) ?? {}) };
  }

  async yieldOverview() {
    const areas = await this.db
      .select({ id: growingAreas.id, code: growingAreas.code, name: growingAreas.name, sector: growingAreas.sector, maxYieldKgPerHa: growingAreas.maxYieldKgPerHa, supplierName: partners.name })
      .from(growingAreas)
      .innerJoin(partners, eq(partners.id, growingAreas.supplierPartnerId))
      .where(eq(growingAreas.active, true))
      .orderBy(asc(growingAreas.code));
    return { mucChung: await this.yieldSetting(), vung: areas };
  }

  async setYieldSetting(value: YieldSetting, ctx: AuthContext) {
    await this.db.transaction(async (tx) => {
      const before = await this.yieldSetting(tx);
      const clean = Object.fromEntries(YIELD_SECTORS.map((k) => [k, value[k] ?? null])) as YieldSetting;
      await tx
        .insert(settings)
        .values({ key: YIELD_KEY, value: clean, updatedBy: ctx.user.id })
        .onConflictDoUpdate({ target: settings.key, set: { value: clean, updatedBy: ctx.user.id, updatedAt: new Date() } });
      await this.audit.record({ actorUserId: ctx.user.id, action: 'nang_suat.dat_muc_chung', entityType: 'setting', entityId: YIELD_KEY, detail: { truoc: before, sau: clean } }, tx);
    });
  }

  async setAreaYield(areaId: string, value: number | null, ctx: AuthContext) {
    await this.db.transaction(async (tx) => {
      const [a] = await tx.select().from(growingAreas).where(eq(growingAreas.id, areaId)).for('update');
      if (!a) throw new NotFoundException('Không tìm thấy vùng');
      await tx.update(growingAreas).set({ maxYieldKgPerHa: value }).where(eq(growingAreas.id, areaId));
      await this.audit.record({ actorUserId: ctx.user.id, action: 'nang_suat.dat_muc_vung', entityType: 'growing_area', entityId: areaId, detail: { vung: a.code, truoc: a.maxYieldKgPerHa, sau: value } }, tx);
    });
  }

  // ---------- Ai được làm gì ----------

  /** Nhân viên thu mua, người phụ trách lô, hoặc trưởng phòng phân công lô được ghi phiếu. */
  private staffCanWrite(lot: PurchaseLot, ctx: AuthContext) {
    return ctx.permissions.includes('NGUON_CUNG_QUAN_LY') || ctx.permissions.includes('LO_HANG_PHAN_CONG') || (ctx.permissions.includes('LO_HANG_QUAN_LY_CUA_MINH') && lot.ownerUserId === ctx.user.id);
  }
  private staffCanRead(lot: PurchaseLot, ctx: AuthContext) {
    return this.staffCanWrite(lot, ctx) || ctx.permissions.includes('NGUON_CUNG_XEM') || ctx.permissions.includes('LO_HANG_XEM_TAT_CA') || lot.ownerUserId === ctx.user.id;
  }

  /** Trả về nguồn ghi phiếu; nhà cung cấp chỉ với lô của chính mình. */
  private async access(lot: PurchaseLot, ctx: AuthContext, write: boolean, exec: DbExecutor): Promise<'noi_bo' | 'cong_ncc'> {
    const partnerId = await this.sourcing.portalPartner(ctx, exec);
    if (partnerId) {
      if (lot.supplierPartnerId !== partnerId) throw new NotFoundException('Không tìm thấy lô mua');
      return 'cong_ncc';
    }
    const ok = write ? this.staffCanWrite(lot, ctx) : this.staffCanRead(lot, ctx);
    if (!ok) throw new ForbiddenException(write ? 'Bạn không ghi phiếu thu gom cho lô này được' : 'Bạn không xem được lô này');
    return 'noi_bo';
  }

  private async lot(id: string, exec: DbExecutor, lock: boolean): Promise<PurchaseLot> {
    const q = exec.select().from(purchaseLots).where(eq(purchaseLots.id, id));
    const [l] = lock ? await q.for('update') : await q;
    if (!l) throw new NotFoundException('Không tìm thấy lô mua');
    return l;
  }

  // ---------- Đọc ----------

  /** Lô mua đang thu gom của nhà cung cấp (cổng). */
  async portalLots(ctx: AuthContext) {
    const partnerId = await this.sourcing.portalPartner(ctx);
    if (!partnerId) throw new ForbiddenException('Trang này dành cho nhà cung cấp');
    const rows = await this.db
      .select({ id: purchaseLots.id, code: purchaseLots.code, status: purchaseLots.status, collectedKg: purchaseLots.collectedKg, eudrClass: purchaseLots.eudrClass, harvestDate: purchaseLots.harvestDate, commodityName: commodities.name, sector: commodities.sector })
      .from(purchaseLots)
      .innerJoin(commodities, eq(commodities.id, purchaseLots.commodityId))
      .where(and(eq(purchaseLots.supplierPartnerId, partnerId), inArray(purchaseLots.status, ['thu_gom', 'da_so_che', 'da_nhap_kho'])))
      .orderBy(desc(purchaseLots.createdAt));
    return { lo: rows };
  }

  /** Phiếu của một lô, kèm danh sách hộ và thửa chọn được và phần trần còn lại của từng thửa. */
  async forLot(lotId: string, ctx: AuthContext) {
    const lot = await this.lot(lotId, this.db, false);
    const source = await this.access(lot, ctx, false, this.db);
    const [{ sector, commodityName }] = await this.db.select({ sector: commodities.sector, commodityName: commodities.name }).from(commodities).where(eq(commodities.id, lot.commodityId));
    const slips = await this.db
      .select({ s: collectionSlips, farmerName: farmers.fullName, farmerCode: farmers.code, plotCode: plots.code, createdByName: users.fullName })
      .from(collectionSlips)
      .innerJoin(farmers, eq(farmers.id, collectionSlips.farmerId))
      .innerJoin(plots, eq(plots.id, collectionSlips.plotId))
      .innerJoin(users, eq(users.id, collectionSlips.createdBy))
      .where(eq(collectionSlips.purchaseLotId, lotId))
      .orderBy(asc(collectionSlips.createdAt));
    const canWrite = lot.status === 'thu_gom' && (source === 'cong_ncc' || this.staffCanWrite(lot, ctx));
    const choices = canWrite ? await this.choices(lot.supplierPartnerId, sector) : { ho: [], thua: [] };
    return {
      lo: { id: lot.id, code: lot.code, status: lot.status, collectedKg: lot.collectedKg, eudrClass: lot.eudrClass, sector, commodityName, apDungEudr: EUDR_SECTORS.includes(sector) },
      duocGhi: canWrite,
      phieu: slips.map((x) => ({
        id: x.s.id,
        code: x.s.code,
        farmerName: x.farmerName,
        farmerCode: x.farmerCode,
        plotCode: x.plotCode,
        harvestDate: x.s.harvestDate,
        quantityKg: x.s.quantityKg,
        moisturePct: x.s.moisturePct,
        weighTicketNo: x.s.weighTicketNo,
        eudrOk: x.s.eudrOk,
        eudrReasons: x.s.eudrReasons as string[],
        capKg: x.s.capKg,
        source: x.s.source,
        note: x.s.note,
        createdByName: x.createdByName,
        createdAt: x.s.createdAt,
        voidedAt: x.s.voidedAt,
        voidReason: x.s.voidReason,
      })),
      ...choices,
    };
  }

  private async choices(partnerId: string, sector: string) {
    const setting = await this.yieldSetting();
    const ho = await this.db
      .select({ id: farmers.id, code: farmers.code, fullName: farmers.fullName })
      .from(farmers)
      .where(and(eq(farmers.supplierPartnerId, partnerId), isNull(farmers.voidedAt)))
      .orderBy(asc(farmers.code));
    const rows = await this.db
      .select({ p: plots, areaCode: growingAreas.code, areaYield: growingAreas.maxYieldKgPerHa })
      .from(plots)
      .innerJoin(growingAreas, eq(growingAreas.id, plots.growingAreaId))
      .where(and(eq(plots.supplierPartnerId, partnerId), isNull(plots.voidedAt), eq(growingAreas.sector, sector), eq(growingAreas.active, true)))
      .orderBy(asc(plots.code));
    const since = windowStart(today());
    const used = rows.length
      ? await this.db
          .select({ plotId: collectionSlips.plotId, kg: sql<number>`sum(${collectionSlips.quantityKg})::float8` })
          .from(collectionSlips)
          .where(and(inArray(collectionSlips.plotId, rows.map((r) => r.p.id)), isNull(collectionSlips.voidedAt), sql`${collectionSlips.harvestDate} >= ${since}`))
          .groupBy(collectionSlips.plotId)
      : [];
    const usedBy = new Map(used.map((u) => [u.plotId, u.kg]));
    return {
      ho,
      thua: rows.map((r) => {
        const cap = plotCapKg(r.p.areaHa, yieldFor(r.areaYield, setting, sector));
        const da = r2(usedBy.get(r.p.id) ?? 0);
        return {
          id: r.p.id,
          code: r.p.code,
          farmerId: r.p.farmerId,
          areaCode: r.areaCode,
          areaHa: r.p.areaHa,
          crop: r.p.crop,
          capKg: cap,
          usedKg: da,
          conLaiKg: cap === null ? null : r2(Math.max(cap - da, 0)),
          coCanhBao: (r.p.warnings as string[]).length > 0,
          forestStatus: r.p.forestStatus,
        };
      }),
    };
  }

  // ---------- Ghi ----------

  async create(lotId: string, input: SlipInput, ctx: AuthContext, ip: string | null) {
    return this.db.transaction(async (tx) => {
      const lot = await this.lot(lotId, tx, true);
      const source = await this.access(lot, ctx, true, tx);
      if (lot.status !== 'thu_gom') throw new BadRequestException('Lô đã qua bước thu gom');
      if (input.harvestDate > today()) throw new BadRequestException('Ngày thu hoạch không được sau hôm nay');
      if (!(input.quantityKg > 0)) throw new BadRequestException('Khối lượng phải lớn hơn 0');

      const [f] = await tx.select().from(farmers).where(eq(farmers.id, input.farmerId));
      if (!f || f.supplierPartnerId !== lot.supplierPartnerId) throw new BadRequestException('Hộ không thuộc nhà cung cấp của lô');
      if (f.voidedAt) throw new BadRequestException('Hộ đã bị huỷ khỏi danh sách');
      // Khoá thửa để hai phiếu ghi cùng lúc không cùng vượt trần
      const [p] = await tx.select().from(plots).where(eq(plots.id, input.plotId)).for('update');
      if (!p || p.farmerId !== f.id) throw new BadRequestException('Thửa không thuộc hộ đã chọn');
      if (p.voidedAt) throw new BadRequestException('Thửa đã bị huỷ');
      const [area] = await tx.select().from(growingAreas).where(eq(growingAreas.id, p.growingAreaId));
      const [{ sector }] = await tx.select({ sector: commodities.sector }).from(commodities).where(eq(commodities.id, lot.commodityId));
      if (area.sector !== sector) throw new BadRequestException('Thửa thuộc vùng của ngành khác với mặt hàng của lô');

      const cap = plotCapKg(p.areaHa, yieldFor(area.maxYieldKgPerHa, await this.yieldSetting(tx), sector));
      const [{ used }] = await tx
        .select({ used: sql<number>`coalesce(sum(${collectionSlips.quantityKg}), 0)::float8` })
        .from(collectionSlips)
        .where(and(eq(collectionSlips.plotId, p.id), isNull(collectionSlips.voidedAt), between(collectionSlips.harvestDate, windowStart(input.harvestDate), input.harvestDate)));
      const over = capRefusal(cap, used, input.quantityKg);
      if (over) throw new BadRequestException(over);

      let eudrOk: boolean | null = null;
      let reasons: string[] = [];
      let lotClass = lot.eudrClass;
      if (EUDR_SECTORS.includes(sector)) {
        reasons = eudrReasons({ capKg: cap, plotWarnings: p.warnings as string[], forestStatus: p.forestStatus });
        eudrOk = reasons.length === 0;
        const slipClass: EudrClass = eudrOk ? 'du' : 'khong_du';
        const refusal = classRefusal(lot.eudrClass, slipClass);
        if (refusal) throw new BadRequestException(`${refusal}${reasons.length ? ` (${reasons.join('; ')})` : ''}`);
        lotClass = slipClass;
      }

      const [{ n }] = await tx.select({ n: sql<number>`count(*)::int` }).from(collectionSlips).where(eq(collectionSlips.purchaseLotId, lot.id));
      const code = `${lot.code}-P${String(n + 1).padStart(3, '0')}`;
      const qty = r2(input.quantityKg);
      const [slip] = await tx
        .insert(collectionSlips)
        .values({
          code,
          purchaseLotId: lot.id,
          supplierPartnerId: lot.supplierPartnerId,
          farmerId: f.id,
          plotId: p.id,
          harvestDate: input.harvestDate,
          quantityKg: qty,
          moisturePct: input.moisturePct ?? null,
          weighTicketNo: input.weighTicketNo ?? null,
          eudrOk,
          eudrReasons: reasons,
          capKg: cap,
          source,
          note: input.note ?? null,
          createdBy: ctx.user.id,
        })
        .returning();
      await tx.update(purchaseLots).set({ collectedKg: r2(lot.collectedKg + qty), eudrClass: lotClass, updatedAt: new Date() }).where(eq(purchaseLots.id, lot.id));
      await tx.insert(lotEvents).values({
        purchaseLotId: lot.id,
        kind: 'thu_gom',
        quantityKg: qty,
        note: `Phiếu ${code} · hộ ${f.code} · thửa ${p.code}`,
        detail: { phieu: code, ho: f.code, thua: p.code, ngayThuHoach: input.harvestDate, duEudr: eudrOk },
        actorUserId: ctx.user.id,
      });
      await this.audit.record(
        { actorUserId: ctx.user.id, action: 'phieu_thu_gom.tao', entityType: 'collection_slip', entityId: slip.id, ip, detail: { code, lo: lot.code, ho: f.code, thua: p.code, kg: qty, duEudr: eudrOk, nguon: source } },
        tx,
      );
      return { id: slip.id, code, eudrOk, eudrReasons: reasons };
    });
  }

  /** Huỷ phiếu sai khi lô còn đang thu gom; khối lượng được trừ lại. Nhãn EUDR của lô giữ nguyên. */
  async voidSlip(slipId: string, reason: string, ctx: AuthContext, ip: string | null) {
    await this.db.transaction(async (tx) => {
      const [s] = await tx.select().from(collectionSlips).where(eq(collectionSlips.id, slipId)).for('update');
      if (!s) throw new NotFoundException('Không tìm thấy phiếu');
      const lot = await this.lot(s.purchaseLotId, tx, true);
      await this.access(lot, ctx, true, tx);
      if (s.voidedAt) throw new BadRequestException('Phiếu đã huỷ');
      if (lot.status !== 'thu_gom') throw new BadRequestException('Lô đã qua bước thu gom nên không huỷ phiếu được');
      await tx.update(collectionSlips).set({ voidedAt: new Date(), voidedBy: ctx.user.id, voidReason: reason }).where(eq(collectionSlips.id, s.id));
      await tx.update(purchaseLots).set({ collectedKg: r2(lot.collectedKg - s.quantityKg), updatedAt: new Date() }).where(eq(purchaseLots.id, lot.id));
      await tx.insert(lotEvents).values({ purchaseLotId: lot.id, kind: 'huy_phieu', quantityKg: s.quantityKg, note: `Phiếu ${s.code}: ${reason}`, actorUserId: ctx.user.id });
      await this.audit.record({ actorUserId: ctx.user.id, action: 'phieu_thu_gom.huy', entityType: 'collection_slip', entityId: s.id, ip, detail: { code: s.code, kg: s.quantityKg, lyDo: reason } }, tx);
    });
  }
}

import { BadRequestException, ConflictException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, asc, desc, eq, inArray, isNull, ne, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { AuditService } from '../audit/audit.service';
import type { AuthContext } from '../auth/auth.types';
import { DB, Db, DbExecutor } from '../db/db';
import {
  commodities,
  facilities,
  facilityKeepers,
  FacilityZone,
  facilityZones,
  goodsReceipts,
  partners,
  purchaseLots,
  StockLot,
  stockLotOrigins,
  stockLots,
  stockMoves,
  userRoles,
  users,
} from '../db/schema';
import { capacityRefusal, moveRefusal, receiptVariance, ZONE_LABELS, ZoneKind, zoneRefusal } from './kho.rules';

const r2 = (n: number) => Math.round(n * 100) / 100;

export interface ZoneInput {
  code: string;
  name: string;
  kind: ZoneKind;
  capacityKg: number | null;
}

export interface ReceiptInput {
  purchaseLotId: string;
  facilityId: string;
  zoneId: string;
  receivedOn: string;
  vehicleNo: string | null;
  weighTicketNo: string | null;
  quantityKg: number;
  bags: number | null;
  moisturePct: number | null;
  note: string | null;
}

@Injectable()
export class WarehouseService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly audit: AuditService,
  ) {}

  // ---------- Quyền ----------

  private assertView(ctx: AuthContext) {
    if (!ctx.permissions.includes('KHO_XEM')) throw new ForbiddenException('Bạn không có quyền xem kho');
  }
  private assertConfig(ctx: AuthContext) {
    if (!ctx.permissions.includes('KHO_CAU_HINH')) throw new ForbiddenException('Chỉ Trưởng phòng kinh doanh và Ban Giám đốc khai khu, giao thủ kho');
  }
  /** Thủ kho chỉ ghi phiếu ở kho mình được giao. */
  private async assertKeeper(facilityId: string, ctx: AuthContext, tx: DbExecutor) {
    if (!ctx.permissions.includes('KHO_GHI_PHIEU')) throw new ForbiddenException('Chỉ thủ kho ghi phiếu kho');
    const [k] = await tx
      .select({ userId: facilityKeepers.userId })
      .from(facilityKeepers)
      .where(and(eq(facilityKeepers.facilityId, facilityId), eq(facilityKeepers.userId, ctx.user.id)));
    if (!k) throw new ForbiddenException('Bạn chưa được giao kho này');
  }
  private async keeperFacilityIds(ctx: AuthContext): Promise<Set<string>> {
    if (!ctx.permissions.includes('KHO_GHI_PHIEU')) return new Set();
    const rows = await this.db.select({ id: facilityKeepers.facilityId }).from(facilityKeepers).where(eq(facilityKeepers.userId, ctx.user.id));
    return new Set(rows.map((r) => r.id));
  }

  // ---------- Kho, khu, thủ kho ----------

  /** Danh sách kho, xưởng kèm khu, thủ kho và số đang tồn theo khu. */
  async listFacilities(ctx: AuthContext) {
    this.assertView(ctx);
    const fs = await this.db
      .select({ f: facilities, partnerName: partners.name })
      .from(facilities)
      .leftJoin(partners, eq(partners.id, facilities.partnerId))
      .where(eq(facilities.active, true))
      .orderBy(asc(facilities.name));
    const zones = await this.db.select().from(facilityZones).orderBy(asc(facilityZones.code));
    const stock = await this.db
      .select({ zoneId: stockLots.zoneId, kg: sql<number>`coalesce(sum(${stockLots.remainingKg}), 0)::float8`, n: sql<number>`count(*)::int` })
      .from(stockLots)
      .where(sql`${stockLots.remainingKg} > 0`)
      .groupBy(stockLots.zoneId);
    const keepers = await this.db
      .select({ facilityId: facilityKeepers.facilityId, userId: users.id, name: users.fullName })
      .from(facilityKeepers)
      .innerJoin(users, eq(users.id, facilityKeepers.userId))
      .orderBy(asc(users.fullName));
    const mine = await this.keeperFacilityIds(ctx);
    const config = ctx.permissions.includes('KHO_CAU_HINH');
    const byZone = new Map(stock.map((s) => [s.zoneId, s]));
    return {
      kho: fs.map(({ f, partnerName }) => {
        const zs = zones.filter((z) => z.facilityId === f.id);
        const khu = zs.map((z) => ({
          ...this.zoneView(z),
          tonKg: byZone.get(z.id)?.kg ?? 0,
          soLoTon: byZone.get(z.id)?.n ?? 0,
        }));
        return {
          id: f.id,
          name: f.name,
          kind: f.kind,
          ownership: f.ownership,
          partnerName,
          address: f.address,
          capacityKg: f.capacityKg,
          khu,
          tonKg: r2(khu.reduce((s, z) => s + z.tonKg, 0)),
          thuKho: keepers.filter((k) => k.facilityId === f.id).map((k) => ({ id: k.userId, hoTen: k.name })),
          quyen: { cauHinh: config, ghiPhieu: mine.has(f.id) },
        };
      }),
      ungVienThuKho: config ? await this.keeperCandidates() : [],
    };
  }

  private zoneView(z: FacilityZone) {
    return { id: z.id, code: z.code, name: z.name, kind: z.kind, kindLabel: ZONE_LABELS[z.kind as ZoneKind] ?? z.kind, capacityKg: z.capacityKg, active: z.active };
  }

  private keeperCandidates() {
    return this.db
      .select({ id: users.id, hoTen: users.fullName, email: users.email })
      .from(users)
      .innerJoin(userRoles, and(eq(userRoles.userId, users.id), eq(userRoles.role, 'THU_KHO')))
      .where(eq(users.status, 'hoat_dong'))
      .orderBy(asc(users.fullName));
  }

  async createZone(facilityId: string, input: ZoneInput, ctx: AuthContext) {
    this.assertConfig(ctx);
    try {
      return await this.db.transaction(async (tx) => {
        const [f] = await tx.select().from(facilities).where(eq(facilities.id, facilityId));
        if (!f || !f.active) throw new NotFoundException('Không tìm thấy kho, xưởng');
        const [z] = await tx
          .insert(facilityZones)
          .values({ facilityId, code: input.code.toUpperCase(), name: input.name, kind: input.kind, capacityKg: input.capacityKg, createdBy: ctx.user.id })
          .returning({ id: facilityZones.id });
        await this.audit.record({ actorUserId: ctx.user.id, action: 'kho.tao_khu', entityType: 'facility_zone', entityId: z.id, detail: { kho: f.name, ...input } }, tx);
        return { id: z.id };
      });
    } catch (err) {
      const e = err as { code?: string; cause?: { code?: string } };
      if (e.code === '23505' || e.cause?.code === '23505') throw new ConflictException('Mã khu đã có trong kho này');
      throw err;
    }
  }

  /** Ngừng dùng một khu: chỉ khi khu không còn hàng. */
  async deactivateZone(zoneId: string, ctx: AuthContext) {
    this.assertConfig(ctx);
    await this.db.transaction(async (tx) => {
      const [z] = await tx.select().from(facilityZones).where(eq(facilityZones.id, zoneId)).for('update');
      if (!z) throw new NotFoundException('Không tìm thấy khu');
      const [{ kg }] = await tx
        .select({ kg: sql<number>`coalesce(sum(${stockLots.remainingKg}), 0)::float8` })
        .from(stockLots)
        .where(eq(stockLots.zoneId, zoneId));
      if (kg > 0) throw new BadRequestException(`${z.name} còn ${kg.toLocaleString('vi-VN')} kg hàng, chuyển hết hàng trước khi ngừng`);
      await tx.update(facilityZones).set({ active: false }).where(eq(facilityZones.id, zoneId));
      await this.audit.record({ actorUserId: ctx.user.id, action: 'kho.ngung_khu', entityType: 'facility_zone', entityId: zoneId }, tx);
    });
  }

  async assignKeeper(facilityId: string, userId: string, ctx: AuthContext) {
    this.assertConfig(ctx);
    await this.db.transaction(async (tx) => {
      const [f] = await tx.select().from(facilities).where(eq(facilities.id, facilityId));
      if (!f || !f.active) throw new NotFoundException('Không tìm thấy kho, xưởng');
      const [u] = await tx
        .select({ id: users.id, status: users.status })
        .from(users)
        .innerJoin(userRoles, and(eq(userRoles.userId, users.id), eq(userRoles.role, 'THU_KHO')))
        .where(eq(users.id, userId));
      if (!u || u.status !== 'hoat_dong') throw new BadRequestException('Người được giao phải là tài khoản thủ kho đang hoạt động');
      await tx.insert(facilityKeepers).values({ facilityId, userId, assignedBy: ctx.user.id }).onConflictDoNothing();
      await this.audit.record({ actorUserId: ctx.user.id, action: 'kho.giao_thu_kho', entityType: 'facility', entityId: facilityId, detail: { nguoiDung: userId } }, tx);
    });
  }

  async removeKeeper(facilityId: string, userId: string, ctx: AuthContext) {
    this.assertConfig(ctx);
    await this.db.transaction(async (tx) => {
      const del = await tx
        .delete(facilityKeepers)
        .where(and(eq(facilityKeepers.facilityId, facilityId), eq(facilityKeepers.userId, userId)))
        .returning({ userId: facilityKeepers.userId });
      if (!del.length) throw new NotFoundException('Người này không được giao kho này');
      await this.audit.record({ actorUserId: ctx.user.id, action: 'kho.bo_thu_kho', entityType: 'facility', entityId: facilityId, detail: { nguoiDung: userId } }, tx);
    });
  }

  // ---------- Tồn kho ----------

  /** Bảng tồn: cộng số còn lại theo kho, khu, mặt hàng, loại, hạng, nhãn EUDR. */
  async stockSummary(ctx: AuthContext, filter: { facilityId?: string }) {
    this.assertView(ctx);
    const conds = [sql`${stockLots.remainingKg} > 0`];
    if (filter.facilityId) conds.push(eq(stockLots.facilityId, filter.facilityId));
    const rows = await this.db
      .select({
        facilityId: stockLots.facilityId,
        facilityName: facilities.name,
        zoneId: stockLots.zoneId,
        zoneCode: facilityZones.code,
        zoneName: facilityZones.name,
        zoneKind: facilityZones.kind,
        commodityName: commodities.name,
        sector: commodities.sector,
        kind: stockLots.kind,
        grade: stockLots.grade,
        dealType: stockLots.dealType,
        eudrClass: stockLots.eudrClass,
        kg: sql<number>`sum(${stockLots.remainingKg})::float8`,
        bags: sql<number | null>`sum(${stockLots.bags})::int`,
        lots: sql<number>`count(*)::int`,
        oldest: sql<string>`min(${stockLots.receivedOn})`,
      })
      .from(stockLots)
      .innerJoin(facilities, eq(facilities.id, stockLots.facilityId))
      .innerJoin(facilityZones, eq(facilityZones.id, stockLots.zoneId))
      .innerJoin(commodities, eq(commodities.id, stockLots.commodityId))
      .where(and(...conds))
      .groupBy(
        stockLots.facilityId,
        facilities.name,
        stockLots.zoneId,
        facilityZones.code,
        facilityZones.name,
        facilityZones.kind,
        commodities.name,
        commodities.sector,
        stockLots.kind,
        stockLots.grade,
        stockLots.dealType,
        stockLots.eudrClass,
      )
      .orderBy(asc(facilities.name), asc(facilityZones.code), asc(commodities.name), asc(stockLots.grade));
    return {
      ton: rows,
      tong: { kg: r2(rows.reduce((s, r) => s + r.kg, 0)), lots: rows.reduce((s, r) => s + r.lots, 0) },
    };
  }

  async listStockLots(ctx: AuthContext, filter: { facilityId?: string; zoneId?: string; purchaseLotId?: string; conHang?: boolean }) {
    this.assertView(ctx);
    const conds = [];
    if (filter.facilityId) conds.push(eq(stockLots.facilityId, filter.facilityId));
    if (filter.zoneId) conds.push(eq(stockLots.zoneId, filter.zoneId));
    if (filter.conHang) conds.push(sql`${stockLots.remainingKg} > 0`);
    if (filter.purchaseLotId) {
      conds.push(inArray(stockLots.id, this.db.select({ id: stockLotOrigins.stockLotId }).from(stockLotOrigins).where(eq(stockLotOrigins.purchaseLotId, filter.purchaseLotId))));
    }
    const rows = await this.db
      .select({ s: stockLots, facilityName: facilities.name, zoneCode: facilityZones.code, zoneName: facilityZones.name, commodityName: commodities.name })
      .from(stockLots)
      .innerJoin(facilities, eq(facilities.id, stockLots.facilityId))
      .innerJoin(facilityZones, eq(facilityZones.id, stockLots.zoneId))
      .innerJoin(commodities, eq(commodities.id, stockLots.commodityId))
      .where(conds.length ? and(...conds) : undefined)
      .orderBy(desc(stockLots.createdAt))
      .limit(1000);
    const origins = await this.origins(rows.map((r) => r.s.id));
    const mine = await this.keeperFacilityIds(ctx);
    return rows.map((r) => ({
      ...r.s,
      facilityName: r.facilityName,
      zoneCode: r.zoneCode,
      zoneName: r.zoneName,
      commodityName: r.commodityName,
      nguonGoc: origins.get(r.s.id) ?? [],
      quyen: { chuyenKhu: mine.has(r.s.facilityId) && r.s.remainingKg > 0 },
    }));
  }

  private async origins(stockLotIds: string[]) {
    const map = new Map<string, { purchaseLotId: string; code: string; supplierName: string; share: number }[]>();
    if (!stockLotIds.length) return map;
    const rows = await this.db
      .select({ stockLotId: stockLotOrigins.stockLotId, purchaseLotId: stockLotOrigins.purchaseLotId, share: stockLotOrigins.share, code: purchaseLots.code, supplierName: partners.name })
      .from(stockLotOrigins)
      .innerJoin(purchaseLots, eq(purchaseLots.id, stockLotOrigins.purchaseLotId))
      .innerJoin(partners, eq(partners.id, purchaseLots.supplierPartnerId))
      .where(inArray(stockLotOrigins.stockLotId, stockLotIds))
      .orderBy(desc(stockLotOrigins.share), asc(purchaseLots.code));
    for (const r of rows) {
      const list = map.get(r.stockLotId) ?? [];
      list.push({ purchaseLotId: r.purchaseLotId, code: r.code, supplierName: r.supplierName, share: r.share });
      map.set(r.stockLotId, list);
    }
    return map;
  }

  async stockLotDetail(id: string, ctx: AuthContext) {
    this.assertView(ctx);
    const [lot] = await this.listStockLotsById(id, ctx);
    if (!lot) throw new NotFoundException('Không tìm thấy lô tồn');
    const fromZ = alias(facilityZones, 'tu_khu');
    const toZ = alias(facilityZones, 'den_khu');
    const moves = await this.db
      .select({ m: stockMoves, actorName: users.fullName, fromCode: fromZ.code, toCode: toZ.code })
      .from(stockMoves)
      .innerJoin(users, eq(users.id, stockMoves.actorUserId))
      .leftJoin(fromZ, eq(fromZ.id, stockMoves.fromZoneId))
      .leftJoin(toZ, eq(toZ.id, stockMoves.toZoneId))
      .where(eq(stockMoves.stockLotId, id))
      .orderBy(asc(stockMoves.id));
    const zones = await this.db
      .select()
      .from(facilityZones)
      .where(and(eq(facilityZones.facilityId, lot.facilityId), eq(facilityZones.active, true), ne(facilityZones.id, lot.zoneId)))
      .orderBy(asc(facilityZones.code));
    return {
      ...lot,
      soKho: moves.map((x) => ({ ...x.m, actorName: x.actorName, fromZoneCode: x.fromCode, toZoneCode: x.toCode })),
      khuKhac: zones.map((z) => this.zoneView(z)),
    };
  }

  private async listStockLotsById(id: string, ctx: AuthContext) {
    const rows = await this.db
      .select({ s: stockLots, facilityName: facilities.name, zoneCode: facilityZones.code, zoneName: facilityZones.name, commodityName: commodities.name })
      .from(stockLots)
      .innerJoin(facilities, eq(facilities.id, stockLots.facilityId))
      .innerJoin(facilityZones, eq(facilityZones.id, stockLots.zoneId))
      .innerJoin(commodities, eq(commodities.id, stockLots.commodityId))
      .where(eq(stockLots.id, id));
    const origins = await this.origins(rows.map((r) => r.s.id));
    const mine = await this.keeperFacilityIds(ctx);
    return rows.map((r) => ({
      ...r.s,
      facilityName: r.facilityName,
      zoneCode: r.zoneCode,
      zoneName: r.zoneName,
      commodityName: r.commodityName,
      nguonGoc: origins.get(r.s.id) ?? [],
      quyen: { chuyenKhu: mine.has(r.s.facilityId) && r.s.remainingKg > 0 },
    }));
  }

  // ---------- Nhận hàng ----------

  /** Lô mua đang mở để thủ kho chọn khi nhận hàng, kèm số đã thu gom và đã nhận. */
  async openPurchaseLots(ctx: AuthContext) {
    this.assertView(ctx);
    const received = this.db
      .select({ lotId: goodsReceipts.purchaseLotId, kg: sql<number>`sum(${goodsReceipts.quantityKg})`.as('kg') })
      .from(goodsReceipts)
      .where(isNull(goodsReceipts.voidedAt))
      .groupBy(goodsReceipts.purchaseLotId)
      .as('nhan');
    const rows = await this.db
      .select({
        id: purchaseLots.id,
        code: purchaseLots.code,
        status: purchaseLots.status,
        dealType: purchaseLots.dealType,
        eudrClass: purchaseLots.eudrClass,
        collectedKg: purchaseLots.collectedKg,
        receivedKg: sql<number>`coalesce(${received.kg}, 0)::float8`,
        supplierName: partners.name,
        commodityName: commodities.name,
        sector: commodities.sector,
      })
      .from(purchaseLots)
      .innerJoin(partners, eq(partners.id, purchaseLots.supplierPartnerId))
      .innerJoin(commodities, eq(commodities.id, purchaseLots.commodityId))
      .leftJoin(received, eq(received.lotId, purchaseLots.id))
      .where(ne(purchaseLots.status, 'da_huy'))
      .orderBy(desc(purchaseLots.createdAt))
      .limit(500);
    return rows.map((r) => ({ ...r, chenhLech: receiptVariance(r.collectedKg, r.receivedKg, r.status === 'thu_gom') }));
  }

  async createReceipt(input: ReceiptInput, ctx: AuthContext) {
    if (input.receivedOn > new Date().toISOString().slice(0, 10)) throw new BadRequestException('Ngày nhận không được ở tương lai');
    return this.db.transaction(async (tx) => {
      await this.assertKeeper(input.facilityId, ctx, tx);
      const [lot] = await tx.select().from(purchaseLots).where(eq(purchaseLots.id, input.purchaseLotId)).for('update');
      if (!lot) throw new NotFoundException('Không tìm thấy lô mua');
      if (lot.status === 'da_huy') throw new BadRequestException('Lô mua đã huỷ');
      const [{ sector }] = await tx.select({ sector: commodities.sector }).from(commodities).where(eq(commodities.id, lot.commodityId));
      const zone = await this.lockZone(input.zoneId, tx);
      if (zone.facilityId !== input.facilityId) throw new BadRequestException('Khu không thuộc kho này');
      const refusal = zoneRefusal({ sector, eudrClass: lot.eudrClass }, zone) ?? capacityRefusal(zone, await this.zoneStock(zone.id, tx), input.quantityKg);
      if (refusal) throw new BadRequestException(refusal);
      const year = input.receivedOn.slice(0, 4);
      const stockCode = await this.nextCode(tx, stockLots, stockLots.code, `LT-${year}-`, 5);
      const [s] = await tx
        .insert(stockLots)
        .values({
          code: stockCode,
          facilityId: input.facilityId,
          zoneId: zone.id,
          commodityId: lot.commodityId,
          kind: 'nguyen_lieu',
          grade: null,
          dealType: lot.dealType,
          eudrClass: lot.eudrClass,
          initialKg: r2(input.quantityKg),
          remainingKg: r2(input.quantityKg),
          bags: input.bags,
          source: 'nhan_hang',
          receivedOn: input.receivedOn,
          createdBy: ctx.user.id,
        })
        .returning({ id: stockLots.id });
      await tx.insert(stockLotOrigins).values({ stockLotId: s.id, purchaseLotId: lot.id, share: 1 });
      const code = await this.nextCode(tx, goodsReceipts, goodsReceipts.code, `PNH-${year}-`, 4);
      const [g] = await tx
        .insert(goodsReceipts)
        .values({
          code,
          purchaseLotId: lot.id,
          facilityId: input.facilityId,
          zoneId: zone.id,
          stockLotId: s.id,
          receivedOn: input.receivedOn,
          vehicleNo: input.vehicleNo,
          weighTicketNo: input.weighTicketNo,
          quantityKg: r2(input.quantityKg),
          bags: input.bags,
          moisturePct: input.moisturePct,
          note: input.note,
          createdBy: ctx.user.id,
        })
        .returning({ id: goodsReceipts.id });
      await tx.insert(stockMoves).values({ stockLotId: s.id, kind: 'nhan_hang', quantityKg: r2(input.quantityKg), toZoneId: zone.id, refId: g.id, note: code, actorUserId: ctx.user.id });
      await this.audit.record(
        { actorUserId: ctx.user.id, action: 'kho.nhan_hang', entityType: 'goods_receipt', entityId: g.id, detail: { ma: code, loMua: lot.code, loTon: stockCode, kg: input.quantityKg } },
        tx,
      );
      const [{ kg }] = await tx
        .select({ kg: sql<number>`coalesce(sum(${goodsReceipts.quantityKg}), 0)::float8` })
        .from(goodsReceipts)
        .where(and(eq(goodsReceipts.purchaseLotId, lot.id), isNull(goodsReceipts.voidedAt)));
      return { id: g.id, code, stockLotId: s.id, stockLotCode: stockCode, chenhLech: receiptVariance(lot.collectedKg, kg, lot.status === 'thu_gom') };
    });
  }

  async listReceipts(ctx: AuthContext, filter: { purchaseLotId?: string; facilityId?: string }) {
    this.assertView(ctx);
    const conds = [];
    if (filter.purchaseLotId) conds.push(eq(goodsReceipts.purchaseLotId, filter.purchaseLotId));
    if (filter.facilityId) conds.push(eq(goodsReceipts.facilityId, filter.facilityId));
    const rows = await this.db
      .select({ g: goodsReceipts, lotCode: purchaseLots.code, facilityName: facilities.name, zoneCode: facilityZones.code, stockLotCode: stockLots.code, stockRemaining: stockLots.remainingKg, stockInitial: stockLots.initialKg, by: users.fullName })
      .from(goodsReceipts)
      .innerJoin(purchaseLots, eq(purchaseLots.id, goodsReceipts.purchaseLotId))
      .innerJoin(facilities, eq(facilities.id, goodsReceipts.facilityId))
      .innerJoin(facilityZones, eq(facilityZones.id, goodsReceipts.zoneId))
      .innerJoin(stockLots, eq(stockLots.id, goodsReceipts.stockLotId))
      .innerJoin(users, eq(users.id, goodsReceipts.createdBy))
      .where(conds.length ? and(...conds) : undefined)
      .orderBy(desc(goodsReceipts.createdAt))
      .limit(1000);
    const mine = await this.keeperFacilityIds(ctx);
    return rows.map((r) => ({
      ...r.g,
      lotCode: r.lotCode,
      facilityName: r.facilityName,
      zoneCode: r.zoneCode,
      stockLotCode: r.stockLotCode,
      createdByName: r.by,
      quyen: { huy: !r.g.voidedAt && mine.has(r.g.facilityId) && r.stockRemaining === r.stockInitial },
    }));
  }

  /** Huỷ phiếu nhận hàng ghi sai: chỉ khi lô tồn của phiếu chưa bị chuyển, tách hay dùng. */
  async voidReceipt(id: string, reason: string, ctx: AuthContext) {
    await this.db.transaction(async (tx) => {
      const [g] = await tx.select().from(goodsReceipts).where(eq(goodsReceipts.id, id)).for('update');
      if (!g) throw new NotFoundException('Không tìm thấy phiếu nhận hàng');
      await this.assertKeeper(g.facilityId, ctx, tx);
      if (g.voidedAt) throw new BadRequestException('Phiếu đã huỷ');
      const s = await this.lockStockLot(g.stockLotId, tx);
      const [{ n }] = await tx.select({ n: sql<number>`count(*)::int` }).from(stockMoves).where(eq(stockMoves.stockLotId, s.id));
      if (s.remainingKg !== s.initialKg || n > 1) throw new BadRequestException('Hàng của phiếu đã được chuyển hoặc dùng, không huỷ được phiếu');
      await tx.update(goodsReceipts).set({ voidedAt: new Date(), voidedBy: ctx.user.id, voidReason: reason }).where(eq(goodsReceipts.id, id));
      await tx.update(stockLots).set({ remainingKg: 0 }).where(eq(stockLots.id, s.id));
      await tx.insert(stockMoves).values({ stockLotId: s.id, kind: 'huy_nhan_hang', quantityKg: -s.remainingKg, fromZoneId: s.zoneId, refId: g.id, note: reason, actorUserId: ctx.user.id });
      await this.audit.record({ actorUserId: ctx.user.id, action: 'kho.huy_nhan_hang', entityType: 'goods_receipt', entityId: id, detail: { ma: g.code, lyDo: reason } }, tx);
    });
  }

  // ---------- Chuyển khu ----------

  /**
   * Chuyển lô tồn sang khu khác trong cùng kho. Chuyển một phần thì tách thành lô tồn mới,
   * mang cùng nguồn gốc (cùng tỷ lệ các lô mua).
   */
  async moveZone(id: string, input: { zoneId: string; quantityKg: number | null }, ctx: AuthContext) {
    return this.db.transaction(async (tx) => {
      const s = await this.lockStockLot(id, tx);
      await this.assertKeeper(s.facilityId, ctx, tx);
      const qty = input.quantityKg ?? s.remainingKg;
      const bad = moveRefusal(s.remainingKg, qty);
      if (bad) throw new BadRequestException(bad);
      if (input.zoneId === s.zoneId) throw new BadRequestException('Lô tồn đã ở khu này');
      const zone = await this.lockZone(input.zoneId, tx);
      if (zone.facilityId !== s.facilityId) throw new BadRequestException('Chỉ chuyển giữa các khu trong cùng kho');
      const [{ sector }] = await tx.select({ sector: commodities.sector }).from(commodities).where(eq(commodities.id, s.commodityId));
      const refusal = zoneRefusal({ sector, eudrClass: s.eudrClass }, zone) ?? capacityRefusal(zone, await this.zoneStock(zone.id, tx), qty);
      if (refusal) throw new BadRequestException(refusal);
      const whole = Math.abs(qty - s.remainingKg) < 0.005;
      if (whole) {
        await tx.update(stockLots).set({ zoneId: zone.id }).where(eq(stockLots.id, s.id));
        await tx.insert(stockMoves).values({ stockLotId: s.id, kind: 'chuyen_khu', quantityKg: 0, fromZoneId: s.zoneId, toZoneId: zone.id, actorUserId: ctx.user.id });
        await this.audit.record({ actorUserId: ctx.user.id, action: 'kho.chuyen_khu', entityType: 'stock_lot', entityId: s.id, detail: { ma: s.code, denKhu: zone.code } }, tx);
        return { id: s.id, code: s.code };
      }
      const code = await this.nextCode(tx, stockLots, stockLots.code, `LT-${new Date().getUTCFullYear()}-`, 5);
      const share = r2(qty) / s.initialKg;
      const [child] = await tx
        .insert(stockLots)
        .values({
          code,
          facilityId: s.facilityId,
          zoneId: zone.id,
          commodityId: s.commodityId,
          kind: s.kind,
          grade: s.grade,
          dealType: s.dealType,
          eudrClass: s.eudrClass,
          initialKg: r2(qty),
          remainingKg: r2(qty),
          bags: s.bags ? Math.round(s.bags * share) : null,
          source: 'tach_lo',
          parentId: s.id,
          receivedOn: s.receivedOn,
          createdBy: ctx.user.id,
        })
        .returning({ id: stockLots.id });
      const origins = await tx.select().from(stockLotOrigins).where(eq(stockLotOrigins.stockLotId, s.id));
      await tx.insert(stockLotOrigins).values(origins.map((o) => ({ stockLotId: child.id, purchaseLotId: o.purchaseLotId, share: o.share })));
      await tx
        .update(stockLots)
        .set({ remainingKg: r2(s.remainingKg - qty), bags: s.bags ? Math.max(0, s.bags - Math.round(s.bags * share)) : null })
        .where(eq(stockLots.id, s.id));
      await tx.insert(stockMoves).values([
        { stockLotId: s.id, kind: 'tach_ra', quantityKg: -r2(qty), fromZoneId: s.zoneId, toZoneId: zone.id, refId: child.id, note: code, actorUserId: ctx.user.id },
        { stockLotId: child.id, kind: 'tach_vao', quantityKg: r2(qty), fromZoneId: s.zoneId, toZoneId: zone.id, refId: s.id, note: s.code, actorUserId: ctx.user.id },
      ]);
      await this.audit.record({ actorUserId: ctx.user.id, action: 'kho.tach_lo', entityType: 'stock_lot', entityId: s.id, detail: { ma: s.code, loMoi: code, kg: qty, denKhu: zone.code } }, tx);
      return { id: child.id, code };
    });
  }

  // ---------- Tiện ích ----------

  private async lockZone(id: string, tx: DbExecutor): Promise<FacilityZone> {
    const [z] = await tx.select().from(facilityZones).where(eq(facilityZones.id, id)).for('update');
    if (!z) throw new NotFoundException('Không tìm thấy khu');
    return z;
  }
  private async lockStockLot(id: string, tx: DbExecutor): Promise<StockLot> {
    const [s] = await tx.select().from(stockLots).where(eq(stockLots.id, id)).for('update');
    if (!s) throw new NotFoundException('Không tìm thấy lô tồn');
    return s;
  }
  private async zoneStock(zoneId: string, tx: DbExecutor) {
    const [{ kg }] = await tx.select({ kg: sql<number>`coalesce(sum(${stockLots.remainingKg}), 0)::float8` }).from(stockLots).where(eq(stockLots.zoneId, zoneId));
    return kg;
  }
  private async nextCode(tx: DbExecutor, table: typeof stockLots | typeof goodsReceipts, col: typeof stockLots.code | typeof goodsReceipts.code, prefix: string, width: number) {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${'kho_code:' + prefix}))`);
    const [{ max }] = await tx
      .select({ max: sql<number | null>`max(substring(${col}, ${prefix.length + 1}::int)::int)` })
      .from(table)
      .where(sql`${col} like ${prefix + '%'}`);
    return `${prefix}${String((max ?? 0) + 1).padStart(width, '0')}`;
  }
}

import { BadRequestException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { alias } from 'drizzle-orm/pg-core';
import { desc, eq, or, sql } from 'drizzle-orm';
import { AuditService } from '../audit/audit.service';
import type { AuthContext } from '../auth/auth.types';
import { DB, Db } from '../db/db';
import { commodities, facilities, facilityZones, stockLotOrigins, stockLots, stockMoves, stockTransfers, users } from '../db/schema';
import { capacityRefusal, transferRefusal, zoneRefusal } from './kho.rules';
import { assertKeeperOf, keeperFacilityIds, nextKhoCode, r2 } from './kho.shared';

/** Chuyển hàng giữa hai kho, xưởng: kho đi xuất (hàng đang đi đường), kho đến cân lại và nhận vào một khu. */
@Injectable()
export class TransferService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly audit: AuditService,
  ) {}

  async create(input: { stockLotId: string; toFacilityId: string; quantityKg: number; sentOn: string; vehicleNo: string | null; note: string | null }, ctx: AuthContext) {
    if (input.sentOn > new Date().toISOString().slice(0, 10)) throw new BadRequestException('Ngày chuyển không được ở tương lai');
    return this.db.transaction(async (tx) => {
      const [s] = await tx.select().from(stockLots).where(eq(stockLots.id, input.stockLotId)).for('update');
      if (!s) throw new NotFoundException('Không tìm thấy lô tồn');
      await assertKeeperOf(s.facilityId, ctx, tx, 'kho đi ghi phiếu chuyển kho');
      const [to] = await tx.select().from(facilities).where(eq(facilities.id, input.toFacilityId));
      if (!to || !to.active) throw new BadRequestException('Kho đến không có hoặc đã ngừng dùng');
      const bad = transferRefusal(s, to.id, input.quantityKg);
      if (bad) throw new BadRequestException(bad);
      const code = await nextKhoCode(tx, stockTransfers, stockTransfers.code, `CK-${input.sentOn.slice(0, 4)}-`, 4);
      const [t] = await tx
        .insert(stockTransfers)
        .values({ code, stockLotId: s.id, fromFacilityId: s.facilityId, toFacilityId: to.id, quantityKg: r2(input.quantityKg), sentOn: input.sentOn, vehicleNo: input.vehicleNo, note: input.note, createdBy: ctx.user.id })
        .returning({ id: stockTransfers.id });
      await tx.update(stockLots).set({ remainingKg: r2(s.remainingKg - input.quantityKg) }).where(eq(stockLots.id, s.id));
      await tx.insert(stockMoves).values({ stockLotId: s.id, kind: 'chuyen_kho_di', quantityKg: -r2(input.quantityKg), fromZoneId: s.zoneId, refId: t.id, note: `${code} → ${to.name}`, actorUserId: ctx.user.id });
      await this.audit.record({ actorUserId: ctx.user.id, action: 'kho.chuyen_kho', entityType: 'stock_transfer', entityId: t.id, detail: { ma: code, loTon: s.code, kg: input.quantityKg, den: to.name } }, tx);
      return { id: t.id, code };
    });
  }

  /** Kho đến nhận: cân lại, chọn khu. Sinh lô tồn mới cùng nguồn gốc; chênh lệch cân là hao hụt vận chuyển. */
  async receive(id: string, input: { zoneId: string; receivedKg: number; receivedOn: string; bags: number | null }, ctx: AuthContext) {
    if (input.receivedOn > new Date().toISOString().slice(0, 10)) throw new BadRequestException('Ngày nhận không được ở tương lai');
    return this.db.transaction(async (tx) => {
      const [t] = await tx.select().from(stockTransfers).where(eq(stockTransfers.id, id)).for('update');
      if (!t) throw new NotFoundException('Không tìm thấy phiếu chuyển kho');
      await assertKeeperOf(t.toFacilityId, ctx, tx, 'kho đến nhận hàng chuyển kho');
      if (t.status !== 'dang_di') throw new BadRequestException('Phiếu không còn ở trạng thái đang đi đường');
      if (input.receivedOn < t.sentOn) throw new BadRequestException('Ngày nhận không trước ngày chuyển');
      if (input.receivedKg > t.quantityKg + 0.005) throw new BadRequestException(`Không nhận nhiều hơn số đã chuyển (${r2(t.quantityKg).toLocaleString('vi-VN')} kg)`);
      const [s] = await tx.select().from(stockLots).where(eq(stockLots.id, t.stockLotId));
      const [zone] = await tx.select().from(facilityZones).where(eq(facilityZones.id, input.zoneId)).for('update');
      if (!zone || zone.facilityId !== t.toFacilityId) throw new BadRequestException('Khu không thuộc kho đến');
      const [{ sector }] = await tx.select({ sector: commodities.sector }).from(commodities).where(eq(commodities.id, s.commodityId));
      const [{ kg }] = await tx.select({ kg: sql<number>`coalesce(sum(${stockLots.remainingKg}), 0)::float8` }).from(stockLots).where(eq(stockLots.zoneId, zone.id));
      const bad = zoneRefusal({ sector, eudrClass: s.eudrClass }, zone) ?? capacityRefusal(zone, kg, input.receivedKg);
      if (bad) throw new BadRequestException(bad);
      const code = await nextKhoCode(tx, stockLots, stockLots.code, `LT-${input.receivedOn.slice(0, 4)}-`, 5);
      const [n] = await tx
        .insert(stockLots)
        .values({
          code,
          facilityId: t.toFacilityId,
          zoneId: zone.id,
          commodityId: s.commodityId,
          kind: s.kind,
          grade: s.grade,
          dealType: s.dealType,
          eudrClass: s.eudrClass,
          initialKg: r2(input.receivedKg),
          remainingKg: r2(input.receivedKg),
          bags: input.bags,
          source: 'chuyen_kho',
          parentId: s.id,
          receivedOn: input.receivedOn,
          createdBy: ctx.user.id,
        })
        .returning({ id: stockLots.id });
      const origins = await tx.select().from(stockLotOrigins).where(eq(stockLotOrigins.stockLotId, s.id));
      await tx.insert(stockLotOrigins).values(origins.map((o) => ({ stockLotId: n.id, purchaseLotId: o.purchaseLotId, share: o.share })));
      await tx.insert(stockMoves).values({ stockLotId: n.id, kind: 'chuyen_kho_den', quantityKg: r2(input.receivedKg), toZoneId: zone.id, refId: t.id, note: `${t.code} từ ${s.code}`, actorUserId: ctx.user.id });
      await tx
        .update(stockTransfers)
        .set({ status: 'da_nhan', receivedKg: r2(input.receivedKg), receivedOn: input.receivedOn, receivedZoneId: zone.id, receivedStockLotId: n.id, receivedBy: ctx.user.id })
        .where(eq(stockTransfers.id, id));
      const lossKg = r2(t.quantityKg - input.receivedKg);
      await this.audit.record({ actorUserId: ctx.user.id, action: 'kho.nhan_chuyen_kho', entityType: 'stock_transfer', entityId: id, detail: { ma: t.code, loMoi: code, nhanKg: input.receivedKg, haoHutKg: lossKg } }, tx);
      return { stockLotId: n.id, stockLotCode: code, lossKg, lossPct: t.quantityKg > 0 ? r2((lossKg / t.quantityKg) * 100) : 0 };
    });
  }

  /** Kho đi huỷ phiếu khi hàng chưa được nhận: trả hàng về lô tồn. */
  async cancel(id: string, reason: string, ctx: AuthContext) {
    await this.db.transaction(async (tx) => {
      const [t] = await tx.select().from(stockTransfers).where(eq(stockTransfers.id, id)).for('update');
      if (!t) throw new NotFoundException('Không tìm thấy phiếu chuyển kho');
      await assertKeeperOf(t.fromFacilityId, ctx, tx, 'kho đi huỷ phiếu chuyển kho');
      if (t.status !== 'dang_di') throw new BadRequestException('Chỉ huỷ phiếu đang đi đường');
      const [s] = await tx.select().from(stockLots).where(eq(stockLots.id, t.stockLotId)).for('update');
      await tx.update(stockLots).set({ remainingKg: r2(s.remainingKg + t.quantityKg) }).where(eq(stockLots.id, s.id));
      await tx.insert(stockMoves).values({ stockLotId: s.id, kind: 'huy_chuyen_kho', quantityKg: t.quantityKg, toZoneId: s.zoneId, refId: id, note: `${t.code}: ${reason}`, actorUserId: ctx.user.id });
      await tx.update(stockTransfers).set({ status: 'huy', cancelReason: reason }).where(eq(stockTransfers.id, id));
      await this.audit.record({ actorUserId: ctx.user.id, action: 'kho.huy_chuyen_kho', entityType: 'stock_transfer', entityId: id, detail: { ma: t.code, lyDo: reason } }, tx);
    });
  }

  async list(ctx: AuthContext, filter: { facilityId?: string }) {
    if (!ctx.permissions.includes('KHO_XEM')) throw new ForbiddenException('Bạn không có quyền xem kho');
    const fromF = alias(facilities, 'kho_di');
    const toF = alias(facilities, 'kho_den');
    const rows = await this.db
      .select({ t: stockTransfers, lotCode: stockLots.code, grade: stockLots.grade, commodityName: commodities.name, sector: commodities.sector, eudrClass: stockLots.eudrClass, fromName: fromF.name, toName: toF.name, by: users.fullName, newLotCode: sql<string | null>`(select code from stock_lots n where n.id = ${stockTransfers.receivedStockLotId})` })
      .from(stockTransfers)
      .innerJoin(stockLots, eq(stockLots.id, stockTransfers.stockLotId))
      .innerJoin(commodities, eq(commodities.id, stockLots.commodityId))
      .innerJoin(fromF, eq(fromF.id, stockTransfers.fromFacilityId))
      .innerJoin(toF, eq(toF.id, stockTransfers.toFacilityId))
      .innerJoin(users, eq(users.id, stockTransfers.createdBy))
      .where(filter.facilityId ? or(eq(stockTransfers.fromFacilityId, filter.facilityId), eq(stockTransfers.toFacilityId, filter.facilityId)) : undefined)
      .orderBy(desc(stockTransfers.createdAt))
      .limit(500);
    const mine = await keeperFacilityIds(ctx.user.id, this.db);
    const keeper = ctx.permissions.includes('KHO_GHI_PHIEU');
    return rows.map((r) => ({
      ...r.t,
      lotCode: r.lotCode,
      grade: r.grade,
      commodityName: r.commodityName,
      sector: r.sector,
      eudrClass: r.eudrClass,
      fromName: r.fromName,
      toName: r.toName,
      createdByName: r.by,
      receivedStockLotCode: r.newLotCode,
      lossKg: r.t.receivedKg === null ? null : r2(r.t.quantityKg - r.t.receivedKg),
      quyen: { nhan: keeper && r.t.status === 'dang_di' && mine.has(r.t.toFacilityId), huy: keeper && r.t.status === 'dang_di' && mine.has(r.t.fromFacilityId) },
    }));
  }
}

import { BadRequestException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, asc, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import type { AuthContext } from '../auth/auth.types';
import { AuditService } from '../audit/audit.service';
import { sha256Hex } from '../common/crypto';
import { stableStringify } from '../common/stable-json';
import { ContractsService } from '../contracts/contracts.service';
import { DB, Db, DbExecutor } from '../db/db';
import { DocumentsService } from './documents.service';
import {
  bookings,
  commodities,
  contracts,
  ExportLot,
  exportLots,
  facilities,
  goodsIssues,
  goodsReceipts,
  lotAllocations,
  lotEvents,
  partners,
  PurchaseLot,
  purchaseLots,
  splitConsents,
  users,
} from '../db/schema';
import {
  allocationRefusal,
  AllocationView,
  COUNTER_CONTRACT_KIND,
  daysToCutoff,
  EXPORT_STEPS,
  ExportLotStatus,
  gateProblems,
  mainSupplier,
  Market,
  nextStep,
  PURCHASE_CONTRACT_KIND,
  signal,
  toKg,
} from './lot.rules';
import { EUDR_SECTORS } from '../sourcing/collection.rules';
import { returnIssuedStock } from '../warehouse/stock-return';

export interface PurchaseEventInput {
  kind: 'thu_gom' | 'so_che' | 'nhap_kho';
  quantityKg: number;
  lossKg?: number | null;
  facilityId?: string | null;
  note?: string | null;
}

export interface BookingInput {
  carrier: string;
  bookingNumber: string;
  vesselVoyage: string | null;
  cutoffSi: Date | null;
  cutoffVgm: Date | null;
  cutoffCargo: Date | null;
  containers: { so: string; chi: string | null }[];
}

const r2 = (n: number) => Math.round(n * 100) / 100;

@Injectable()
export class LotsService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly contractsService: ContractsService,
    private readonly audit: AuditService,
    private readonly documents: DocumentsService,
  ) {}

  // ---------- Quyền ----------

  private canSeeAll(ctx: AuthContext) {
    return ctx.permissions.includes('LO_HANG_XEM_TAT_CA');
  }
  private canManageAll(ctx: AuthContext) {
    return ctx.permissions.includes('LO_HANG_PHAN_CONG');
  }
  private canManageOwn(ctx: AuthContext) {
    return ctx.permissions.includes('LO_HANG_QUAN_LY_CUA_MINH');
  }
  private assertCanCreate(ctx: AuthContext) {
    if (!this.canManageAll(ctx) && !this.canManageOwn(ctx)) throw new ForbiddenException('Bạn không có quyền tạo lô hàng');
  }
  private assertCanView(lot: { ownerUserId: string }, ctx: AuthContext) {
    if (this.canSeeAll(ctx)) return;
    if (this.canManageOwn(ctx) && lot.ownerUserId === ctx.user.id) return;
    throw new ForbiddenException('Bạn không xem được lô này');
  }
  private canManage(lot: { ownerUserId: string }, ctx: AuthContext) {
    return this.canManageAll(ctx) || (this.canManageOwn(ctx) && lot.ownerUserId === ctx.user.id);
  }
  private assertCanManage(lot: { ownerUserId: string }, ctx: AuthContext) {
    if (!this.canManage(lot, ctx)) throw new ForbiddenException('Bạn chỉ cập nhật được lô do mình phụ trách');
  }
  private ownFilter(ctx: AuthContext, col: typeof purchaseLots.ownerUserId | typeof exportLots.ownerUserId) {
    if (this.canSeeAll(ctx)) return undefined;
    if (this.canManageOwn(ctx)) return eq(col, ctx.user.id);
    throw new ForbiddenException('Bạn không có quyền xem lô hàng');
  }

  /** Người phụ trách: mặc định là người tạo; chỉ Trưởng phòng giao được cho người khác. */
  private async resolveOwner(ownerId: string | null | undefined, ctx: AuthContext, exec: DbExecutor) {
    if (!ownerId || ownerId === ctx.user.id) return ctx.user.id;
    if (!this.canManageAll(ctx)) throw new ForbiddenException('Chỉ Trưởng phòng kinh doanh giao lô cho người khác');
    const [u] = await exec.select({ id: users.id }).from(users).where(eq(users.id, ownerId));
    if (!u) throw new BadRequestException('Không tìm thấy người phụ trách');
    return ownerId;
  }

  // ---------- Hợp đồng dùng được ----------

  /** Hợp đồng đã ký có thể tạo lô: hợp đồng mang phí (lô mua) và hợp đồng đối ứng chưa có lô xuất (lô xuất). */
  async usableContracts(ctx: AuthContext) {
    this.assertCanCreate(ctx);
    const rows = await this.db
      .select({
        id: contracts.id,
        code: contracts.code,
        kind: contracts.kind,
        dealType: contracts.dealType,
        sellerName: sql<string | null>`(select name from partners p where p.id = ${contracts.sellerPartnerId})`,
        buyerName: sql<string | null>`(select name from partners p where p.id = ${contracts.buyerPartnerId})`,
        commodityName: commodities.name,
        hasExportLot: sql<boolean>`exists(select 1 from export_lots e where e.counter_contract_id = ${contracts.id} and e.status <> 'da_huy')`,
      })
      .from(contracts)
      .innerJoin(commodities, eq(commodities.id, contracts.commodityId))
      .where(
        and(
          sql`${contracts.signedVersion} is not null`,
          sql`${contracts.status} <> 'da_huy'`,
          inArray(contracts.kind, ['mua', 'moi_gioi', 'ban', 'mua_ban_truc_tiep']),
          this.canManageAll(ctx) ? undefined : eq(contracts.ownerUserId, ctx.user.id),
        ),
      )
      .orderBy(desc(contracts.createdAt));
    // Hợp đồng chia đợt: còn đợt nào chưa có lô xuất thì vẫn lập được lô xuất cho đợt đó
    const choLoXuat = [];
    for (const r of rows.filter((x) => x.kind === 'ban' || x.kind === 'mua_ban_truc_tiep')) {
      const t = await this.contractsService.signedTerms(r.id);
      const dots = t?.terms.dotGiao ?? [];
      if (!dots.length) {
        if (!r.hasExportLot) choLoXuat.push({ ...r, dotGiao: [] as { dot: number; thang: string; soLuong: number; donVi: string }[] });
        continue;
      }
      const used = await this.db
        .select({ n: exportLots.shipmentNo })
        .from(exportLots)
        .where(and(eq(exportLots.counterContractId, r.id), sql`${exportLots.status} <> 'da_huy'`));
      const free = dots.map((d, i) => ({ dot: i + 1, thang: d.thang, soLuong: d.soLuong, donVi: t!.terms.donVi })).filter((d) => !used.some((u) => u.n === d.dot));
      if (free.length) choLoXuat.push({ ...r, dotGiao: free });
    }
    return {
      choLoMua: rows.filter((r) => r.kind === 'mua' || r.kind === 'moi_gioi'),
      choLoXuat,
    };
  }

  private async signedContractFor(contractId: string, wanted: readonly string[], ctx: AuthContext, exec: DbExecutor) {
    const s = await this.contractsService.signedTerms(contractId, exec);
    if (!s) throw new BadRequestException('Hợp đồng chưa ký hoặc đã huỷ');
    if (!wanted.includes(s.contract.kind)) throw new BadRequestException('Loại hợp đồng không phù hợp với loại lô');
    if (!this.canManageAll(ctx) && s.contract.ownerUserId !== ctx.user.id) throw new ForbiddenException('Bạn chỉ tạo lô từ hợp đồng do mình phụ trách');
    return s;
  }

  // ---------- Lô mua ----------

  async createPurchaseLot(
    input: { contractId: string; growingAreaCode?: string | null; packingFacilityCode?: string | null; harvestDate?: string | null; certifications?: string | null; ownerUserId?: string | null },
    ctx: AuthContext,
  ) {
    this.assertCanCreate(ctx);
    return this.db.transaction(async (tx) => {
      const { contract } = await this.signedContractFor(input.contractId, Object.values(PURCHASE_CONTRACT_KIND), ctx, tx);
      const owner = await this.resolveOwner(input.ownerUserId, ctx, tx);
      const code = await this.nextCode('LM', purchaseLots.code, purchaseLots, tx);
      const [lot] = await tx
        .insert(purchaseLots)
        .values({
          code,
          dealType: contract.dealType,
          contractId: contract.id,
          supplierPartnerId: contract.sellerPartnerId!,
          commodityId: contract.commodityId,
          growingAreaCode: input.growingAreaCode ?? null,
          packingFacilityCode: input.packingFacilityCode ?? null,
          harvestDate: input.harvestDate ?? null,
          certifications: input.certifications ?? null,
          ownerUserId: owner,
          createdBy: ctx.user.id,
        })
        .returning();
      await this.event({ purchaseLotId: lot.id, kind: 'tao', note: `Từ hợp đồng ${contract.code}` }, ctx, tx);
      await this.audit.record({ actorUserId: ctx.user.id, action: 'lo_mua.tao', entityType: 'purchase_lot', entityId: lot.id, detail: { code, hopDong: contract.code } }, tx);
      return { id: lot.id, code };
    });
  }

  /** Nhân viên thu mua xem mọi lô mua (để ghi phiếu thu gom), không xem lô xuất. */
  private seesAllPurchase(ctx: AuthContext) {
    return this.canSeeAll(ctx) || ctx.permissions.includes('NGUON_CUNG_QUAN_LY');
  }

  async listPurchaseLots(ctx: AuthContext, filter: { status?: string; commodityId?: string; dealType?: string; conHang?: boolean }) {
    const rows = await this.db
      .select({
        lot: purchaseLots,
        supplierName: partners.name,
        commodityName: commodities.name,
        contractCode: contracts.code,
        allocatedKg: sql<number>`coalesce((select sum(a.quantity_kg) from lot_allocations a where a.purchase_lot_id = ${purchaseLots.id} and a.cancelled_at is null), 0)::float8`,
      })
      .from(purchaseLots)
      .innerJoin(partners, eq(partners.id, purchaseLots.supplierPartnerId))
      .innerJoin(commodities, eq(commodities.id, purchaseLots.commodityId))
      .innerJoin(contracts, eq(contracts.id, purchaseLots.contractId))
      .where(
        and(
          this.seesAllPurchase(ctx) ? undefined : this.ownFilter(ctx, purchaseLots.ownerUserId),
          filter.status ? eq(purchaseLots.status, filter.status) : undefined,
          filter.commodityId ? eq(purchaseLots.commodityId, filter.commodityId) : undefined,
          filter.dealType ? eq(purchaseLots.dealType, filter.dealType) : undefined,
        ),
      )
      .orderBy(desc(purchaseLots.createdAt));
    const out = rows.map((r) => {
      const available = r2(r.lot.collectedKg - r.lot.lossKg);
      return {
        id: r.lot.id,
        code: r.lot.code,
        dealType: r.lot.dealType,
        status: r.lot.status,
        supplierName: r.supplierName,
        commodityId: r.lot.commodityId,
        commodityName: r.commodityName,
        contractCode: r.contractCode,
        growingAreaCode: r.lot.growingAreaCode,
        collectedKg: r.lot.collectedKg,
        lossKg: r.lot.lossKg,
        availableKg: available,
        allocatedKg: r.allocatedKg,
        unallocatedKg: r2(available - r.allocatedKg),
        eudrClass: r.lot.eudrClass,
      };
    });
    return filter.conHang ? out.filter((x) => x.status !== 'thu_gom' && x.status !== 'da_huy' && x.unallocatedKg > 0) : out;
  }

  async getPurchaseLot(id: string, ctx: AuthContext) {
    const lot = await this.findPurchaseLot(id, this.db);
    if (!this.seesAllPurchase(ctx)) this.assertCanView(lot, ctx);
    const [info] = await this.db
      .select({ supplierName: partners.name, commodityName: commodities.name, contractCode: contracts.code, ownerName: users.fullName })
      .from(purchaseLots)
      .innerJoin(partners, eq(partners.id, purchaseLots.supplierPartnerId))
      .innerJoin(commodities, eq(commodities.id, purchaseLots.commodityId))
      .innerJoin(contracts, eq(contracts.id, purchaseLots.contractId))
      .innerJoin(users, eq(users.id, purchaseLots.ownerUserId))
      .where(eq(purchaseLots.id, id));
    const allocs = await this.db
      .select({ a: lotAllocations, exportCode: exportLots.code, exportStatus: exportLots.status, buyerName: partners.name })
      .from(lotAllocations)
      .innerJoin(exportLots, eq(exportLots.id, lotAllocations.exportLotId))
      .innerJoin(partners, eq(partners.id, exportLots.buyerPartnerId))
      .where(eq(lotAllocations.purchaseLotId, id))
      .orderBy(asc(lotAllocations.createdAt));
    const active = allocs.filter((x) => !x.a.cancelledAt);
    const consent = await this.consentState(lot.id, active.map((x) => x.a.exportLotId), this.db);
    const allocated = r2(active.reduce((s, x) => s + x.a.quantityKg, 0));
    const facility = lot.facilityId ? (await this.db.select({ name: facilities.name }).from(facilities).where(eq(facilities.id, lot.facilityId)))[0] : null;
    const manage = this.canManage(lot, ctx);
    return {
      ...lot,
      ...info,
      facilityName: facility?.name ?? null,
      availableKg: r2(lot.collectedKg - lot.lossKg),
      allocatedKg: allocated,
      unallocatedKg: r2(lot.collectedKg - lot.lossKg - allocated),
      phanBo: allocs.map((x) => ({
        id: x.a.id,
        exportLotId: x.a.exportLotId,
        exportCode: x.exportCode,
        exportStatus: x.exportStatus,
        buyerName: x.buyerName,
        quantityKg: x.a.quantityKg,
        approvedAt: x.a.approvedAt,
        cancelledAt: x.a.cancelledAt,
        cancelReason: x.a.cancelReason,
      })),
      chiaLo: consent,
      suKien: await this.events({ purchaseLotId: id }),
      quyen: {
        capNhat: manage && lot.status !== 'da_huy',
        dongYChiaLo: manage && consent.canXacNhan && !consent.daXacNhan,
        huy: manage && lot.status !== 'da_huy' && allocated === 0,
      },
    };
  }

  /** Thu gom (cộng khối lượng), sơ chế (ghi hao hụt), nhập kho (ghi kho). Đi đúng thứ tự. */
  async recordPurchaseEvent(id: string, input: PurchaseEventInput, ctx: AuthContext) {
    await this.db.transaction(async (tx) => {
      const lot = await this.lockPurchaseLot(id, tx);
      this.assertCanManage(lot, ctx);
      if (lot.status === 'da_huy') throw new BadRequestException('Lô mua đã huỷ');
      if (input.kind === 'thu_gom') {
        if (lot.status !== 'thu_gom') throw new BadRequestException('Lô đã qua bước thu gom');
        if (!(input.quantityKg > 0)) throw new BadRequestException('Khối lượng thu gom phải lớn hơn 0');
        // Cà phê ghi tay (không theo hộ, thửa) là hàng không đủ EUDR; lô hàng đủ EUDR chỉ nhận phiếu thu gom.
        const [{ sector }] = await tx.select({ sector: commodities.sector }).from(commodities).where(eq(commodities.id, lot.commodityId));
        let eudrClass = lot.eudrClass;
        if (EUDR_SECTORS.includes(sector)) {
          if (lot.eudrClass === 'du') throw new BadRequestException('Lô này là hàng đủ điều kiện EUDR, chỉ ghi thu gom bằng phiếu theo hộ và thửa');
          eudrClass = 'khong_du';
        }
        await tx.update(purchaseLots).set({ collectedKg: r2(lot.collectedKg + input.quantityKg), eudrClass, updatedAt: new Date() }).where(eq(purchaseLots.id, id));
        await this.event({ purchaseLotId: id, kind: 'thu_gom', quantityKg: input.quantityKg, facilityId: input.facilityId ?? null, note: input.note ?? null }, ctx, tx);
      } else if (input.kind === 'so_che') {
        if (lot.status !== 'thu_gom') throw new BadRequestException('Lô đã sơ chế rồi');
        if (lot.collectedKg <= 0) throw new BadRequestException('Chưa thu gom hàng nào');
        const loss = input.lossKg ?? r2(lot.collectedKg - input.quantityKg);
        if (loss < 0 || loss >= lot.collectedKg) throw new BadRequestException('Khối lượng sau sơ chế không hợp lệ');
        if (Math.abs(lot.collectedKg - loss - input.quantityKg) > 0.005) {
          throw new BadRequestException(`Khối lượng đầu ra cộng hao hụt phải bằng khối lượng thu gom (${lot.collectedKg} kg)`);
        }
        await tx.update(purchaseLots).set({ lossKg: r2(loss), status: 'da_so_che', updatedAt: new Date() }).where(eq(purchaseLots.id, id));
        const pct = r2((loss / lot.collectedKg) * 100);
        await this.event({ purchaseLotId: id, kind: 'so_che', quantityKg: input.quantityKg, facilityId: input.facilityId ?? null, note: input.note ?? null, detail: { haoHutKg: r2(loss), haoHutPhanTram: pct } }, ctx, tx);
      } else {
        if (lot.status !== 'da_so_che') throw new BadRequestException(lot.status === 'thu_gom' ? 'Phải sơ chế trước khi nhập kho' : 'Lô đã nhập kho');
        if (!input.facilityId) throw new BadRequestException('Chọn kho nhập');
        const [f] = await tx.select().from(facilities).where(eq(facilities.id, input.facilityId));
        if (!f || !f.active || f.kind !== 'kho') throw new BadRequestException('Kho không hợp lệ');
        const available = r2(lot.collectedKg - lot.lossKg);
        if (Math.abs(input.quantityKg - available) > 0.005) throw new BadRequestException(`Số lượng nhập kho phải khớp khối lượng sau sơ chế (${available} kg)`);
        await tx.update(purchaseLots).set({ facilityId: f.id, status: 'da_nhap_kho', updatedAt: new Date() }).where(eq(purchaseLots.id, id));
        await this.event({ purchaseLotId: id, kind: 'nhap_kho', quantityKg: input.quantityKg, facilityId: f.id, note: input.note ?? null }, ctx, tx);
      }
    });
  }

  async cancelPurchaseLot(id: string, reason: string, ctx: AuthContext) {
    await this.db.transaction(async (tx) => {
      const lot = await this.lockPurchaseLot(id, tx);
      this.assertCanManage(lot, ctx);
      if (lot.status === 'da_huy') throw new BadRequestException('Lô đã huỷ');
      const [{ n }] = await tx.select({ n: sql<number>`count(*)::int` }).from(lotAllocations).where(and(eq(lotAllocations.purchaseLotId, id), isNull(lotAllocations.cancelledAt)));
      if (n > 0) throw new BadRequestException('Lô còn phân bổ cho lô xuất; huỷ phân bổ trước');
      await tx.update(purchaseLots).set({ status: 'da_huy', cancelReason: reason, updatedAt: new Date() }).where(eq(purchaseLots.id, id));
      await this.event({ purchaseLotId: id, kind: 'huy', note: reason }, ctx, tx);
    });
  }

  /**
   * Ghi nhận nhà cung cấp đồng ý chia lô cho đúng các lô xuất hiện có. Mã băm (lô, các lô xuất, khối lượng, văn bản)
   * được ghi lên sổ cái của hợp đồng với nhà cung cấp.
   */
  async recordSplitConsent(id: string, documentRef: string, ctx: AuthContext) {
    await this.db.transaction(async (tx) => {
      const lot = await this.lockPurchaseLot(id, tx);
      this.assertCanManage(lot, ctx);
      const active = await tx
        .select({ exportLotId: lotAllocations.exportLotId, quantityKg: lotAllocations.quantityKg, code: exportLots.code })
        .from(lotAllocations)
        .innerJoin(exportLots, eq(exportLots.id, lotAllocations.exportLotId))
        .where(and(eq(lotAllocations.purchaseLotId, id), isNull(lotAllocations.cancelledAt)));
      const ids = [...new Set(active.map((a) => a.exportLotId))].sort();
      if (ids.length < 2) throw new BadRequestException('Lô chưa bị chia cho từ hai lô xuất trở lên, không cần nhà cung cấp đồng ý');
      const st = await this.consentState(id, ids, tx);
      if (st.daXacNhan) throw new BadRequestException('Cách chia hiện tại đã có xác nhận của nhà cung cấp');
      const content = {
        loMua: lot.code,
        chiaCho: active.map((a) => ({ loXuat: a.code, khoiLuongKg: a.quantityKg })).sort((a, b) => a.loXuat.localeCompare(b.loXuat)),
        vanBan: documentRef,
      };
      const hash = sha256Hex(stableStringify(content));
      await tx.insert(splitConsents).values({ purchaseLotId: id, exportLotIds: ids, documentRef, contentHash: hash, recordedBy: ctx.user.id });
      await this.contractsService.appendLedgerEvent(
        lot.contractId,
        'ncc_dong_y_chia_lo',
        hash,
        `Lô ${lot.code} chia cho ${content.chiaCho.map((c) => `${c.loXuat} (${c.khoiLuongKg} kg)`).join(', ')}; văn bản ${documentRef}`,
        ctx,
        tx,
      );
      await this.event({ purchaseLotId: id, kind: 'dong_y_chia_lo', note: documentRef, detail: { maBam: hash } }, ctx, tx);
    });
  }

  /** Lô có bị chia không, và xác nhận gần nhất có phủ đúng các lô xuất hiện tại không. */
  private async consentState(purchaseLotId: string, exportLotIds: string[], exec: DbExecutor) {
    const ids = [...new Set(exportLotIds)].sort();
    const split = ids.length >= 2;
    const [last] = await exec.select().from(splitConsents).where(eq(splitConsents.purchaseLotId, purchaseLotId)).orderBy(desc(splitConsents.recordedAt)).limit(1);
    const covered = !!last && ids.every((x) => (last.exportLotIds as string[]).includes(x));
    return {
      biChia: split,
      canXacNhan: split,
      daXacNhan: split && covered,
      lanGanNhat: last ? { vanBan: last.documentRef, maBam: last.contentHash, luc: last.recordedAt } : null,
    };
  }

  // ---------- Lô xuất ----------

  async createExportLot(input: { contractId: string; market: Market; etd?: string | null; eta?: string | null; ownerUserId?: string | null; shipmentNo?: number | null }, ctx: AuthContext) {
    this.assertCanCreate(ctx);
    return this.db.transaction(async (tx) => {
      const { contract } = await this.signedContractFor(input.contractId, Object.values(COUNTER_CONTRACT_KIND), ctx, tx);
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${'export_lot_contract:' + contract.id}))`);
      const signed = await this.contractsService.signedTerms(contract.id, tx);
      const instalments = signed?.terms.dotGiao ?? [];
      let shipmentNo = 1;
      let plannedKg: number | null = null;
      if (instalments.length) {
        // Hợp đồng giao nhiều đợt: mỗi đợt một lô xuất (BH-1)
        if (!input.shipmentNo) throw new BadRequestException(`Hợp đồng ${contract.code} giao ${instalments.length} đợt: chọn đợt cho lô xuất`);
        if (input.shipmentNo > instalments.length) throw new BadRequestException(`Hợp đồng ${contract.code} chỉ có ${instalments.length} đợt`);
        shipmentNo = input.shipmentNo;
        plannedKg = toKg(instalments[shipmentNo - 1].soLuong, signed!.terms.donVi);
        const [dup] = await tx
          .select({ code: exportLots.code })
          .from(exportLots)
          .where(and(eq(exportLots.counterContractId, contract.id), eq(exportLots.shipmentNo, shipmentNo), sql`${exportLots.status} <> 'da_huy'`));
        if (dup) throw new BadRequestException(`Đợt ${shipmentNo} của hợp đồng ${contract.code} đã có lô xuất ${dup.code}`);
      } else {
        if (input.shipmentNo && input.shipmentNo !== 1) throw new BadRequestException(`Hợp đồng ${contract.code} giao một lần, không chia đợt`);
        const [dup] = await tx.select({ code: exportLots.code }).from(exportLots).where(and(eq(exportLots.counterContractId, contract.id), sql`${exportLots.status} <> 'da_huy'`));
        if (dup) throw new BadRequestException(`Hợp đồng ${contract.code} đã có lô xuất ${dup.code}`);
        const [cancelled] = await tx.select({ id: exportLots.id }).from(exportLots).where(eq(exportLots.counterContractId, contract.id));
        if (cancelled) throw new BadRequestException('Hợp đồng này từng có lô xuất đã huỷ; lập phụ lục hoặc hợp đồng mới');
      }
      const owner = await this.resolveOwner(input.ownerUserId, ctx, tx);
      const code = await this.nextCode('LX', exportLots.code, exportLots, tx);
      const [lot] = await tx
        .insert(exportLots)
        .values({
          code,
          dealType: contract.dealType,
          counterContractId: contract.id,
          buyerPartnerId: contract.buyerPartnerId!,
          commodityId: contract.commodityId,
          market: input.market,
          etd: input.etd ?? null,
          eta: input.eta ?? null,
          shipmentNo,
          plannedKg,
          ownerUserId: owner,
          createdBy: ctx.user.id,
        })
        .returning();
      await this.event({ exportLotId: lot.id, kind: 'tao', note: instalments.length ? `Từ hợp đồng ${contract.code}, đợt ${shipmentNo}/${instalments.length}` : `Từ hợp đồng ${contract.code}` }, ctx, tx);
      await this.documents.syncChecklist(lot, ctx, tx);
      await this.audit.record({ actorUserId: ctx.user.id, action: 'lo_xuat.tao', entityType: 'export_lot', entityId: lot.id, detail: { code, hopDong: contract.code } }, tx);
      return { id: lot.id, code };
    });
  }

  async updateExportLot(id: string, input: { etd: string | null; eta: string | null }, ctx: AuthContext) {
    await this.db.transaction(async (tx) => {
      const lot = await this.lockExportLot(id, tx);
      this.assertCanManage(lot, ctx);
      this.assertOpen(lot);
      await tx.update(exportLots).set({ etd: input.etd, eta: input.eta, updatedAt: new Date() }).where(eq(exportLots.id, id));
      await this.event({ exportLotId: id, kind: 'sua', detail: { etd: input.etd, eta: input.eta } }, ctx, tx);
    });
  }

  /** Bảng điều phối: mọi lô xuất kèm bước, ngày đến cut-off và đèn. */
  async board(ctx: AuthContext, filter: { status?: string; market?: string; commodityId?: string }) {
    const rows = await this.db
      .select({
        lot: exportLots,
        buyerName: partners.name,
        commodityName: commodities.name,
        contractCode: contracts.code,
        ownerName: users.fullName,
        allocatedKg: sql<number>`coalesce((select sum(a.quantity_kg) from lot_allocations a where a.export_lot_id = ${exportLots.id} and a.cancelled_at is null), 0)::float8`,
        lastInspection: sql<string | null>`(select e.result from lot_events e where e.export_lot_id = ${exportLots.id} and e.kind = 'giam_dinh' order by e.id desc limit 1)`,
        cutoffSi: bookings.cutoffSi,
        cutoffCargo: bookings.cutoffCargo,
        bookingNumber: bookings.bookingNumber,
      })
      .from(exportLots)
      .innerJoin(partners, eq(partners.id, exportLots.buyerPartnerId))
      .innerJoin(commodities, eq(commodities.id, exportLots.commodityId))
      .innerJoin(contracts, eq(contracts.id, exportLots.counterContractId))
      .innerJoin(users, eq(users.id, exportLots.ownerUserId))
      .leftJoin(bookings, eq(bookings.exportLotId, exportLots.id))
      .where(
        and(
          this.ownFilter(ctx, exportLots.ownerUserId),
          filter.status ? eq(exportLots.status, filter.status) : undefined,
          filter.market ? eq(exportLots.market, filter.market) : undefined,
          filter.commodityId ? eq(exportLots.commodityId, filter.commodityId) : undefined,
        ),
      )
      .orderBy(asc(exportLots.etd), desc(exportLots.createdAt));
    const now = new Date();
    return rows.map((r) => {
      const days = daysToCutoff([r.cutoffSi, r.cutoffCargo], now);
      return {
        id: r.lot.id,
        code: r.lot.code,
        dealType: r.lot.dealType,
        status: r.lot.status,
        market: r.lot.market,
        buyerPartnerId: r.lot.buyerPartnerId,
        buyerName: r.buyerName,
        commodityId: r.lot.commodityId,
        commodityName: r.commodityName,
        contractCode: r.contractCode,
        ownerName: r.ownerName,
        etd: r.lot.etd,
        allocatedKg: r.allocatedKg,
        bookingNumber: r.bookingNumber,
        ngayDenCutoff: days,
        giamDinh: r.lastInspection,
        den: signal(r.lot.status as ExportLotStatus, days, r.lastInspection === 'khong_dat'),
      };
    });
  }

  async getExportLot(id: string, ctx: AuthContext) {
    const lot = await this.findExportLot(id, this.db);
    this.assertCanView(lot, ctx);
    const [info] = await this.db
      .select({ buyerName: partners.name, commodityName: commodities.name, contractCode: contracts.code, ownerName: users.fullName })
      .from(exportLots)
      .innerJoin(partners, eq(partners.id, exportLots.buyerPartnerId))
      .innerJoin(commodities, eq(commodities.id, exportLots.commodityId))
      .innerJoin(contracts, eq(contracts.id, exportLots.counterContractId))
      .innerJoin(users, eq(users.id, exportLots.ownerUserId))
      .where(eq(exportLots.id, id));
    const g = await this.gateInput(lot, this.db);
    const allocs = await this.db
      .select({
        a: lotAllocations,
        lotCode: purchaseLots.code,
        supplierId: purchaseLots.supplierPartnerId,
        supplierName: partners.name,
        growingAreaCode: purchaseLots.growingAreaCode,
        packingFacilityCode: purchaseLots.packingFacilityCode,
        createdByName: sql<string>`(select full_name from users u where u.id = ${lotAllocations.createdBy})`,
        approvedByName: sql<string | null>`(select full_name from users u where u.id = ${lotAllocations.approvedBy})`,
        goodsIssueCode: sql<string | null>`(select code from goods_issues gi where gi.id = ${lotAllocations.goodsIssueId})`,
      })
      .from(lotAllocations)
      .innerJoin(purchaseLots, eq(purchaseLots.id, lotAllocations.purchaseLotId))
      .innerJoin(partners, eq(partners.id, purchaseLots.supplierPartnerId))
      .where(eq(lotAllocations.exportLotId, id))
      .orderBy(asc(lotAllocations.createdAt));
    const view = new Map(g.allocations.map((a) => [a.purchaseLotId, a]));
    const active = allocs.filter((x) => !x.a.cancelledAt);
    const [booking] = await this.db.select().from(bookings).where(eq(bookings.exportLotId, id));
    const main = lot.dealType === 'moi_gioi' ? mainSupplier(active.map((x) => ({ supplierId: x.supplierId, quantityKg: x.a.quantityKg }))) : null;
    const suppliers = new Set(active.map((x) => x.supplierId));
    const manage = this.canManage(lot, ctx);
    const open = lot.status !== 'da_huy' && lot.status !== 'hoan_tat';
    const problems = [...gateProblems(g), ...(await this.docGate(lot, this.db)).problems];
    const days = booking ? daysToCutoff([booking.cutoffSi, booking.cutoffCargo]) : null;
    return {
      ...lot,
      ...info,
      hopDong: { soLuongKg: g.contractKg, dungSaiPhanTram: g.tolerancePct },
      allocatedKg: r2(active.reduce((s, x) => s + x.a.quantityKg, 0)),
      phanBo: allocs.map((x) => ({
        id: x.a.id,
        purchaseLotId: x.a.purchaseLotId,
        lotCode: x.lotCode,
        supplierName: x.supplierName,
        growingAreaCode: x.growingAreaCode,
        packingFacilityCode: x.packingFacilityCode,
        quantityKg: x.a.quantityKg,
        createdByName: x.createdByName,
        approvedByName: x.approvedByName,
        approvedAt: x.a.approvedAt,
        cancelledAt: x.a.cancelledAt,
        cancelReason: x.a.cancelReason,
        phieuXuatKho: x.goodsIssueCode,
        biChia: x.a.cancelledAt ? false : (view.get(x.a.purchaseLotId)?.split ?? false),
        nccDongY: x.a.cancelledAt ? false : (view.get(x.a.purchaseLotId)?.consented ?? false),
        coTheDuyet: !x.a.cancelledAt && !x.a.approvedAt && this.canManageAll(ctx) && x.a.createdBy !== ctx.user.id && lot.status === 'dong_goi',
      })),
      nhaCungCapChinh:
        lot.dealType === 'moi_gioi' && suppliers.size > 1
          ? { id: main, ten: main ? active.find((x) => x.supplierId === main)!.supplierName : null, canChon: !main }
          : null,
      booking: booking ?? null,
      ngayDenCutoff: days,
      den: signal(lot.status as ExportLotStatus, days, g.lastInspection === 'khong_dat'),
      buocKe: nextStep(lot.status as ExportLotStatus),
      thieuDeChuyen: problems,
      suKien: await this.events({ exportLotId: id }),
      quyen: {
        capNhat: manage && open,
        phanBo: manage && lot.status === 'dong_goi',
        giamDinh: manage && lot.status === 'giam_dinh',
        booking: manage && (lot.status === 'giam_dinh' || lot.status === 'dat_cho'),
        chuyenBuoc: manage && open && problems.length === 0,
        huy: manage && EXPORT_STEPS.indexOf(lot.status as never) < EXPORT_STEPS.indexOf('xep_tau') && lot.status !== 'da_huy',
      },
    };
  }

  async allocate(exportLotId: string, input: { purchaseLotId: string; quantityKg: number }, ctx: AuthContext) {
    return this.db.transaction(async (tx) => {
      const exp = await this.lockExportLot(exportLotId, tx);
      this.assertCanManage(exp, ctx);
      const lot = await this.lockPurchaseLot(input.purchaseLotId, tx);
      if (!this.canManage(lot, ctx)) throw new ForbiddenException('Bạn chỉ phân bổ được lô mua do mình phụ trách');
      const [inStock] = await tx.select({ id: goodsReceipts.id }).from(goodsReceipts).where(and(eq(goodsReceipts.purchaseLotId, lot.id), isNull(goodsReceipts.voidedAt))).limit(1);
      if (inStock) throw new BadRequestException('Hàng của lô mua này đã nhận vào kho: thủ kho lấy hàng cho lô xuất bằng phiếu xuất kho từ lô tồn');
      const [{ allocated }] = await tx
        .select({ allocated: sql<number>`coalesce(sum(${lotAllocations.quantityKg}), 0)::float8` })
        .from(lotAllocations)
        .where(and(eq(lotAllocations.purchaseLotId, lot.id), isNull(lotAllocations.cancelledAt)));
      const [{ sector }] = await tx.select({ sector: commodities.sector }).from(commodities).where(eq(commodities.id, lot.commodityId));
      const refusal = allocationRefusal(
        { status: lot.status, dealType: lot.dealType, commodityId: lot.commodityId, availableKg: r2(lot.collectedKg - lot.lossKg), allocatedKg: allocated, eudrClass: lot.eudrClass },
        exp,
        input.quantityKg,
        sector,
      );
      if (refusal) throw new BadRequestException(refusal);
      const [row] = await tx
        .insert(lotAllocations)
        .values({ purchaseLotId: lot.id, exportLotId, quantityKg: r2(input.quantityKg), createdBy: ctx.user.id })
        .returning();
      await this.event({ exportLotId, purchaseLotId: lot.id, kind: 'phan_bo', quantityKg: input.quantityKg, note: `${lot.code} → ${exp.code}` }, ctx, tx);
      await this.documents.syncChecklist(exp, ctx, tx);
      return { id: row.id };
    });
  }

  /** Trưởng phòng KD duyệt dòng phân bổ; người tạo dòng không tự duyệt. */
  async approveAllocation(id: string, ctx: AuthContext) {
    if (!this.canManageAll(ctx)) throw new ForbiddenException('Chỉ Trưởng phòng kinh doanh duyệt phân bổ');
    await this.db.transaction(async (tx) => {
      const a = await this.lockAllocation(id, tx);
      const exp = await this.lockExportLot(a.exportLotId, tx);
      if (a.cancelledAt) throw new BadRequestException('Dòng phân bổ đã huỷ');
      if (a.approvedAt) throw new BadRequestException('Dòng phân bổ đã được duyệt');
      if (exp.status !== 'dong_goi') throw new BadRequestException('Lô xuất đã qua bước đóng gói');
      if (a.createdBy === ctx.user.id) throw new ForbiddenException('Người tạo phân bổ không tự duyệt (nguyên tắc 4 mắt)');
      await tx.update(lotAllocations).set({ approvedBy: ctx.user.id, approvedAt: new Date() }).where(eq(lotAllocations.id, id));
      await this.event({ exportLotId: a.exportLotId, purchaseLotId: a.purchaseLotId, kind: 'duyet_phan_bo', quantityKg: a.quantityKg }, ctx, tx);
    });
  }

  async cancelAllocation(id: string, reason: string, ctx: AuthContext) {
    await this.db.transaction(async (tx) => {
      const a = await this.lockAllocation(id, tx);
      const exp = await this.lockExportLot(a.exportLotId, tx);
      this.assertCanManage(exp, ctx);
      if (a.cancelledAt) throw new BadRequestException('Dòng phân bổ đã huỷ');
      if (exp.status !== 'dong_goi') throw new BadRequestException('Chỉ huỷ phân bổ khi lô xuất đang ở bước đóng gói');
      if (a.goodsIssueId) throw new BadRequestException('Dòng này đến từ phiếu xuất kho: thủ kho huỷ phiếu xuất kho để trả hàng về kho');
      await tx.update(lotAllocations).set({ cancelledAt: new Date(), cancelReason: reason }).where(eq(lotAllocations.id, id));
      await this.event({ exportLotId: a.exportLotId, purchaseLotId: a.purchaseLotId, kind: 'huy_phan_bo', quantityKg: a.quantityKg, note: reason }, ctx, tx);
      await this.documents.syncChecklist(exp, ctx, tx);
    });
  }

  async recordInspection(id: string, input: { result: 'dat' | 'khong_dat'; provider: string; certificateNo: string | null; note: string | null }, ctx: AuthContext) {
    await this.db.transaction(async (tx) => {
      const lot = await this.lockExportLot(id, tx);
      this.assertCanManage(lot, ctx);
      if (lot.status !== 'giam_dinh') throw new BadRequestException('Lô chưa ở bước giám định');
      await this.event(
        { exportLotId: id, kind: 'giam_dinh', result: input.result, note: input.note, detail: { donViGiamDinh: input.provider, soChungThu: input.certificateNo } },
        ctx,
        tx,
      );
    });
  }

  async saveBooking(id: string, input: BookingInput, ctx: AuthContext) {
    await this.db.transaction(async (tx) => {
      const lot = await this.lockExportLot(id, tx);
      this.assertCanManage(lot, ctx);
      if (lot.status !== 'giam_dinh' && lot.status !== 'dat_cho') throw new BadRequestException('Chỉ nhập booking ở bước giám định hoặc đặt chỗ');
      const nums = input.containers.map((c) => c.so);
      if (new Set(nums).size !== nums.length) throw new BadRequestException('Số container bị trùng');
      const values = { ...input, updatedBy: ctx.user.id, updatedAt: new Date() };
      await tx.insert(bookings).values({ exportLotId: id, ...values }).onConflictDoUpdate({ target: bookings.exportLotId, set: values });
      await this.event(
        {
          exportLotId: id,
          kind: 'booking',
          detail: {
            hangTau: input.carrier,
            soBooking: input.bookingNumber,
            tauChuyen: input.vesselVoyage,
            cutoffSi: input.cutoffSi,
            cutoffVgm: input.cutoffVgm,
            cutoffHang: input.cutoffCargo,
            container: input.containers,
          },
        },
        ctx,
        tx,
      );
    });
  }

  /** Sang bước kế tiếp nếu đủ điều kiện. Sang "xếp tàu" phải có số vận đơn và ngày tàu chạy. */
  async advance(id: string, input: { blNumber?: string | null; shippedOn?: string | null }, ctx: AuthContext) {
    return this.db.transaction(async (tx) => {
      const lot = await this.lockExportLot(id, tx);
      this.assertCanManage(lot, ctx);
      const g = await this.gateInput(lot, tx);
      const doc = await this.docGate(lot, tx);
      const problems = [...gateProblems(g), ...doc.problems];
      if (problems.length) throw new BadRequestException(`Chưa sang bước kế được: ${problems.join('; ')}`);
      const to = nextStep(lot.status as ExportLotStatus)!;
      const patch: Partial<ExportLot> = { status: to, updatedAt: new Date() };
      if (to === 'xep_tau') {
        if (!input.blNumber || !input.shippedOn) throw new BadRequestException('Nhập số vận đơn và ngày tàu chạy');
        patch.blNumber = input.blNumber;
        patch.shippedOn = input.shippedOn;
      }
      await tx.update(exportLots).set(patch).where(eq(exportLots.id, id));
      if (to === 'xep_tau') {
        if (doc.overridden) await this.documents.consumeOverride(id, tx);
        await this.documents.createFeeRequests(lot, { number: input.blNumber!, date: input.shippedOn! }, tx);
      }
      await this.event({ exportLotId: id, kind: 'chuyen_buoc', note: `${lot.status} → ${to}`, detail: to === 'xep_tau' ? { soVanDon: input.blNumber, ngayTauChay: input.shippedOn } : null }, ctx, tx);
      return { status: to };
    });
  }

  async cancelExportLot(id: string, reason: string, ctx: AuthContext) {
    await this.db.transaction(async (tx) => {
      const lot = await this.lockExportLot(id, tx);
      this.assertCanManage(lot, ctx);
      if (lot.status === 'da_huy') throw new BadRequestException('Lô đã huỷ');
      if (EXPORT_STEPS.indexOf(lot.status as never) >= EXPORT_STEPS.indexOf('xep_tau')) throw new BadRequestException('Hàng đã xếp tàu, không huỷ lô được');
      const now = new Date();
      await tx
        .update(lotAllocations)
        .set({ cancelledAt: now, cancelReason: `Huỷ lô xuất: ${reason}` })
        .where(and(eq(lotAllocations.exportLotId, id), isNull(lotAllocations.cancelledAt)));
      const issues = await tx.select({ id: goodsIssues.id }).from(goodsIssues).where(and(eq(goodsIssues.exportLotId, id), isNull(goodsIssues.voidedAt)));
      for (const g of issues) await returnIssuedStock(tx, g.id, ctx.user.id, `Huỷ lô xuất: ${reason}`);
      await tx.update(exportLots).set({ status: 'da_huy', cancelReason: reason, updatedAt: now }).where(eq(exportLots.id, id));
      await this.event({ exportLotId: id, kind: 'huy', note: reason }, ctx, tx);
    });
  }

  // ---------- Phân bổ từ phiếu xuất kho (KS-5) ----------

  /** Ghi các dòng phân bổ quy từ phiếu xuất kho về lô mua. Dòng vẫn chờ Trưởng phòng KD duyệt như phân bổ thường. */
  async allocateFromIssue(exp: ExportLot, rows: { purchaseLotId: string; quantityKg: number }[], issue: { id: string; code: string }, ctx: AuthContext, tx: DbExecutor) {
    for (const r of rows) {
      await tx.insert(lotAllocations).values({ purchaseLotId: r.purchaseLotId, exportLotId: exp.id, quantityKg: r.quantityKg, goodsIssueId: issue.id, createdBy: ctx.user.id });
      await this.event({ exportLotId: exp.id, purchaseLotId: r.purchaseLotId, kind: 'phan_bo', quantityKg: r.quantityKg, note: `Xuất kho ${issue.code} → ${exp.code}` }, ctx, tx);
    }
    await this.documents.syncChecklist(exp, ctx, tx);
  }

  /** Huỷ các dòng phân bổ của một phiếu xuất kho bị huỷ. */
  async releaseIssue(exp: ExportLot, issue: { id: string; code: string }, reason: string, ctx: AuthContext, tx: DbExecutor) {
    const rows = await tx
      .update(lotAllocations)
      .set({ cancelledAt: new Date(), cancelReason: `Huỷ phiếu xuất kho ${issue.code}: ${reason}` })
      .where(and(eq(lotAllocations.goodsIssueId, issue.id), isNull(lotAllocations.cancelledAt)))
      .returning();
    for (const a of rows) await this.event({ exportLotId: exp.id, purchaseLotId: a.purchaseLotId, kind: 'huy_phan_bo', quantityKg: a.quantityKg, note: `Huỷ ${issue.code}: ${reason}` }, ctx, tx);
    await this.documents.syncChecklist(exp, ctx, tx);
  }

  /** Khối lượng theo hợp đồng đối ứng của lô xuất và dung sai, để thủ kho không xuất quá. */
  async contractWindow(exp: ExportLot, exec: DbExecutor) {
    const s = await this.contractsService.signedTerms(exp.counterContractId, exec);
    if (!s) return null;
    return { contractKg: exp.plannedKg ?? toKg(s.terms.soLuong, s.terms.donVi), tolerancePct: s.terms.dungSaiPhanTram ?? 0 };
  }

  // ---------- Nội bộ ----------

  /** Cổng chứng từ: trước khi xếp tàu (có thể được Giám đốc mở chặn) và trước khi hoàn tất. */
  private async docGate(lot: ExportLot, exec: DbExecutor): Promise<{ problems: string[]; overridden: boolean }> {
    const to = nextStep(lot.status as ExportLotStatus);
    if (to === 'xep_tau') return this.documents.shippingProblems(lot, exec);
    if (to === 'hoan_tat') return { problems: await this.documents.completionProblems(lot, exec), overridden: false };
    return { problems: [], overridden: false };
  }

  private async gateInput(lot: ExportLot, exec: DbExecutor) {
    const s = await this.contractsService.signedTerms(lot.counterContractId, exec);
    if (!s) throw new BadRequestException('Hợp đồng đối ứng không còn hiệu lực');
    const active = await exec
      .select({ a: lotAllocations, commodityId: purchaseLots.commodityId, dealType: purchaseLots.dealType })
      .from(lotAllocations)
      .innerJoin(purchaseLots, eq(purchaseLots.id, lotAllocations.purchaseLotId))
      .where(and(eq(lotAllocations.exportLotId, lot.id), isNull(lotAllocations.cancelledAt)));
    const views: AllocationView[] = [];
    for (const x of active) {
      const others = await exec
        .select({ exportLotId: lotAllocations.exportLotId })
        .from(lotAllocations)
        .where(and(eq(lotAllocations.purchaseLotId, x.a.purchaseLotId), isNull(lotAllocations.cancelledAt)));
      const st = await this.consentState(x.a.purchaseLotId, others.map((o) => o.exportLotId), exec);
      views.push({
        purchaseLotId: x.a.purchaseLotId,
        quantityKg: x.a.quantityKg,
        approved: !!x.a.approvedAt,
        split: st.biChia,
        consented: st.daXacNhan,
        commodityId: x.commodityId,
        dealType: x.dealType,
      });
    }
    const [insp] = await exec
      .select({ result: lotEvents.result })
      .from(lotEvents)
      .where(and(eq(lotEvents.exportLotId, lot.id), eq(lotEvents.kind, 'giam_dinh')))
      .orderBy(desc(lotEvents.id))
      .limit(1);
    const [b] = await exec.select().from(bookings).where(eq(bookings.exportLotId, lot.id));
    return {
      status: lot.status as ExportLotStatus,
      dealType: lot.dealType,
      commodityId: lot.commodityId,
      contractKg: lot.plannedKg ?? toKg(s.terms.soLuong, s.terms.donVi),
      tolerancePct: s.terms.dungSaiPhanTram ?? 0,
      allocations: views,
      lastInspection: (insp?.result as 'dat' | 'khong_dat' | undefined) ?? null,
      booking: b ? { bookingNumber: b.bookingNumber, containers: b.containers as { so: string; chi: string | null }[] } : null,
    };
  }

  private async event(
    e: { purchaseLotId?: string; exportLotId?: string; kind: string; quantityKg?: number | null; facilityId?: string | null; result?: string | null; note?: string | null; detail?: unknown },
    ctx: AuthContext,
    tx: DbExecutor,
  ) {
    await tx.insert(lotEvents).values({
      purchaseLotId: e.purchaseLotId ?? null,
      exportLotId: e.exportLotId ?? null,
      kind: e.kind,
      quantityKg: e.quantityKg ?? null,
      facilityId: e.facilityId ?? null,
      result: e.result ?? null,
      note: e.note ?? null,
      detail: e.detail ?? null,
      actorUserId: ctx.user.id,
    });
  }

  private async events(where: { purchaseLotId?: string; exportLotId?: string }) {
    return this.db
      .select({
        id: lotEvents.id,
        at: lotEvents.at,
        kind: lotEvents.kind,
        quantityKg: lotEvents.quantityKg,
        result: lotEvents.result,
        note: lotEvents.note,
        detail: lotEvents.detail,
        actorName: users.fullName,
        facilityName: facilities.name,
      })
      .from(lotEvents)
      .innerJoin(users, eq(users.id, lotEvents.actorUserId))
      .leftJoin(facilities, eq(facilities.id, lotEvents.facilityId))
      .where(where.purchaseLotId ? eq(lotEvents.purchaseLotId, where.purchaseLotId) : eq(lotEvents.exportLotId, where.exportLotId!))
      .orderBy(asc(lotEvents.id));
  }

  private assertOpen(lot: ExportLot) {
    if (lot.status === 'da_huy' || lot.status === 'hoan_tat') throw new BadRequestException('Lô đã đóng');
  }

  private async findPurchaseLot(id: string, exec: DbExecutor): Promise<PurchaseLot> {
    const [l] = await exec.select().from(purchaseLots).where(eq(purchaseLots.id, id));
    if (!l) throw new NotFoundException('Không tìm thấy lô mua');
    return l;
  }
  private async lockPurchaseLot(id: string, tx: DbExecutor): Promise<PurchaseLot> {
    const [l] = await tx.select().from(purchaseLots).where(eq(purchaseLots.id, id)).for('update');
    if (!l) throw new NotFoundException('Không tìm thấy lô mua');
    return l;
  }
  private async findExportLot(id: string, exec: DbExecutor): Promise<ExportLot> {
    const [l] = await exec.select().from(exportLots).where(eq(exportLots.id, id));
    if (!l) throw new NotFoundException('Không tìm thấy lô xuất');
    return l;
  }
  private async lockExportLot(id: string, tx: DbExecutor): Promise<ExportLot> {
    const [l] = await tx.select().from(exportLots).where(eq(exportLots.id, id)).for('update');
    if (!l) throw new NotFoundException('Không tìm thấy lô xuất');
    return l;
  }
  private async lockAllocation(id: string, tx: DbExecutor) {
    const [a] = await tx.select().from(lotAllocations).where(eq(lotAllocations.id, id)).for('update');
    if (!a) throw new NotFoundException('Không tìm thấy dòng phân bổ');
    return a;
  }

  private async nextCode(prefix: 'LM' | 'LX', col: typeof purchaseLots.code | typeof exportLots.code, table: typeof purchaseLots | typeof exportLots, tx: DbExecutor) {
    const p = `${prefix}-${new Date().getUTCFullYear()}-`;
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${'lot_code:' + p}))`);
    const [{ max }] = await tx
      .select({ max: sql<number | null>`max(substring(${col}, ${p.length + 1}::int)::int)` })
      .from(table)
      .where(sql`${col} like ${p + '%'}`);
    return `${p}${String((max ?? 0) + 1).padStart(4, '0')}`;
  }
}

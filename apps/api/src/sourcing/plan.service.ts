import { BadRequestException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, asc, eq, gte, inArray, isNull, lte, ne, sql } from 'drizzle-orm';
import { AuditService } from '../audit/audit.service';
import type { AuthContext } from '../auth/auth.types';
import { ContractsService } from '../contracts/contracts.service';
import { DB, Db, DbExecutor } from '../db/db';
import { collectionSlips, commodities, contracts, exportLots, farmers, growingAreas, harvestEstimates, partners, plots, purchaseLots, Quote, quotes } from '../db/schema';
import { toKg } from '../quotes/quote.rules';
import { CollectionService } from './collection.service';
import { EUDR_SECTORS, eudrReasons, plotCapKg, YIELD_SECTORS, yieldFor } from './collection.rules';
import {
  addMonths,
  bucketMonth,
  buildPlan,
  currentMonth,
  DemandItem,
  ESTIMATE_MAX_AHEAD,
  estimateCapRefusal,
  eudrOfferWarning,
  marketOfCountry,
  monthsFrom,
  PLAN_MONTHS,
  PlanMarket,
  SupplyItem,
} from './plan.rules';
import { SourcingService } from './sourcing.service';

export interface EstimateInput {
  plotId: string;
  month: string;
  estimatedKg: number;
  note?: string | null;
}

interface DemandRow extends DemandItem {
  id: string;
  ma: string | null;
  doiTac: string;
  thangGhi: string | null;
}

const r2 = (n: number) => Math.round(n * 100) / 100;
const today = () => new Date().toISOString().slice(0, 10);
/** Hợp đồng phía bán: đối ứng của lô xuất */
const SALE_CONTRACT_KINDS = ['ban', 'mua_ban_truc_tiep'];
const SHIPPED = ['xep_tau', 'hoan_tat'];

@Injectable()
export class PlanService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly audit: AuditService,
    private readonly sourcing: SourcingService,
    private readonly collection: CollectionService,
    private readonly contracts: ContractsService,
  ) {}

  // ---------- Sản lượng ước tính theo thửa ----------

  /** Nhà cung cấp (cổng) chỉ thấy thửa của mình; nhân viên cần quyền xem nguồn cung. */
  private async partnerFor(partnerId: string | null, ctx: AuthContext, write: boolean, exec: DbExecutor): Promise<{ partnerId: string; source: 'noi_bo' | 'cong_ncc' }> {
    const own = await this.sourcing.portalPartner(ctx, exec);
    if (own) {
      if (partnerId && partnerId !== own) throw new NotFoundException('Không tìm thấy nhà cung cấp');
      return { partnerId: own, source: 'cong_ncc' };
    }
    if (!partnerId) throw new BadRequestException('Chọn nhà cung cấp');
    if (!ctx.permissions.includes(write ? 'NGUON_CUNG_QUAN_LY' : 'NGUON_CUNG_XEM')) throw new ForbiddenException('Bạn không có quyền với sản lượng ước tính');
    return { partnerId, source: 'noi_bo' };
  }

  /** Thửa của nhà cung cấp và ước tính 12 tháng tới, kèm trần và lý do chưa đủ EUDR. */
  async estimates(partnerIdArg: string | null, ctx: AuthContext) {
    const { partnerId, source } = await this.partnerFor(partnerIdArg, ctx, false, this.db);
    const start = currentMonth();
    const months = monthsFrom(start, PLAN_MONTHS);
    const setting = await this.collection.yieldSetting();
    const rows = await this.db
      .select({ p: plots, areaCode: growingAreas.code, sector: growingAreas.sector, areaYield: growingAreas.maxYieldKgPerHa, farmerCode: farmers.code, farmerName: farmers.fullName })
      .from(plots)
      .innerJoin(growingAreas, eq(growingAreas.id, plots.growingAreaId))
      .innerJoin(farmers, eq(farmers.id, plots.farmerId))
      .where(and(eq(plots.supplierPartnerId, partnerId), isNull(plots.voidedAt), eq(growingAreas.active, true)))
      .orderBy(asc(growingAreas.code), asc(plots.code));
    const est = rows.length
      ? await this.db
          .select({ plotId: harvestEstimates.plotId, month: harvestEstimates.month, kg: harvestEstimates.estimatedKg })
          .from(harvestEstimates)
          .where(and(inArray(harvestEstimates.plotId, rows.map((r) => r.p.id)), gte(harvestEstimates.month, start)))
      : [];
    return {
      thang: months,
      duocSua: source === 'cong_ncc' || ctx.permissions.includes('NGUON_CUNG_QUAN_LY'),
      thua: rows.map((r) => {
        const cap = plotCapKg(r.p.areaHa, yieldFor(r.areaYield, setting, r.sector));
        const mine = est.filter((e) => e.plotId === r.p.id);
        const apDung = EUDR_SECTORS.includes(r.sector);
        return {
          id: r.p.id,
          code: r.p.code,
          maHo: r.farmerCode,
          tenHo: source === 'cong_ncc' || ctx.permissions.includes('NGUON_CUNG_XEM') ? r.farmerName : null,
          maVung: r.areaCode,
          nganh: r.sector,
          dienTichHa: r.p.areaHa,
          tranKg: cap,
          apDungEudr: apDung,
          lyDoChuaDuEudr: apDung ? eudrReasons({ capKg: cap, plotWarnings: r.p.warnings as string[], forestStatus: r.p.forestStatus }) : [],
          uocTinh: Object.fromEntries(mine.map((e) => [e.month, e.kg])),
          tongKg: r2(mine.filter((e) => e.month <= months[months.length - 1]).reduce((s, e) => s + e.kg, 0)),
        };
      }),
    };
  }

  /** Ghi hoặc sửa ước tính của một thửa cho một tháng; 0 kg là xoá. */
  async setEstimate(input: EstimateInput, ctx: AuthContext, ip: string | null) {
    const start = currentMonth();
    if (input.month < start) throw new BadRequestException('Không khai ước tính cho tháng đã qua');
    if (input.month > addMonths(start, ESTIMATE_MAX_AHEAD - 1)) throw new BadRequestException(`Chỉ khai ước tính trong ${ESTIMATE_MAX_AHEAD} tháng tới`);
    if (!(input.estimatedKg >= 0)) throw new BadRequestException('Khối lượng không được âm');
    return this.db.transaction(async (tx) => {
      const [p] = await tx.select().from(plots).where(eq(plots.id, input.plotId)).for('update');
      if (!p) throw new NotFoundException('Không tìm thấy thửa');
      const { source } = await this.partnerFor(p.supplierPartnerId, ctx, true, tx).catch((e) => {
        if (e instanceof NotFoundException) throw new NotFoundException('Không tìm thấy thửa');
        throw e;
      });
      if (p.voidedAt) throw new BadRequestException('Thửa đã bị huỷ');
      const [area] = await tx.select().from(growingAreas).where(eq(growingAreas.id, p.growingAreaId));
      const cap = plotCapKg(p.areaHa, yieldFor(area.maxYieldKgPerHa, await this.collection.yieldSetting(tx), area.sector));
      const existing = await tx
        .select({ month: harvestEstimates.month, kg: harvestEstimates.estimatedKg })
        .from(harvestEstimates)
        .where(and(eq(harvestEstimates.plotId, p.id), gte(harvestEstimates.month, start)));
      const before = existing.find((e) => e.month === input.month)?.kg ?? null;
      const after = [...existing.filter((e) => e.month !== input.month), ...(input.estimatedKg > 0 ? [{ month: input.month, kg: input.estimatedKg }] : [])];
      const over = estimateCapRefusal(after, cap);
      if (over) throw new BadRequestException(over);

      if (input.estimatedKg > 0) {
        await tx
          .insert(harvestEstimates)
          .values({ plotId: p.id, month: input.month, estimatedKg: input.estimatedKg, source, note: input.note ?? null, updatedBy: ctx.user.id })
          .onConflictDoUpdate({
            target: [harvestEstimates.plotId, harvestEstimates.month],
            set: { estimatedKg: input.estimatedKg, source, note: input.note ?? null, updatedBy: ctx.user.id, updatedAt: new Date() },
          });
      } else {
        await tx.delete(harvestEstimates).where(and(eq(harvestEstimates.plotId, p.id), eq(harvestEstimates.month, input.month)));
      }
      await this.audit.record(
        { actorUserId: ctx.user.id, action: 'nguon_cung.uoc_tinh_san_luong', entityType: 'plot', entityId: p.id, ip, detail: { thua: p.code, thang: input.month, truoc: before, sau: input.estimatedKg, nguon: source } },
        tx,
      );
      return { thua: p.code, thang: input.month, khoiLuongKg: input.estimatedKg };
    });
  }

  // ---------- Kế hoạch cung / cầu ----------

  async plan(sector: string, ctx: AuthContext) {
    if (!ctx.permissions.includes('NGUON_CUNG_XEM')) throw new ForbiddenException('Bạn không xem được kế hoạch thu mua');
    if (!(YIELD_SECTORS as readonly string[]).includes(sector)) throw new BadRequestException('Ngành không hợp lệ');
    const start = currentMonth();
    const months = monthsFrom(start, PLAN_MONTHS);
    const apDung = EUDR_SECTORS.includes(sector);
    const stock = await this.stock(sector);
    const supply = await this.supply(sector, months);
    const demand = await this.demand(sector, months, null);
    const seeCodes = ctx.permissions.includes('HOP_DONG_XEM_TAT_CA');

    const bySupplier = new Map<string, { nhaCungCap: string; kg: number; euKg: number }>();
    for (const s of supply.items) {
      const v = bySupplier.get(s.supplierId) ?? { nhaCungCap: s.supplierName, kg: 0, euKg: 0 };
      v.kg += s.kg;
      if (s.eu) v.euKg += s.kg;
      bySupplier.set(s.supplierId, v);
    }
    return {
      nganh: sector,
      apDungEudr: apDung,
      thang: months,
      hangDangCo: { tongKg: stock.kg, duEudrKg: apDung ? stock.euKg : null, soLo: stock.lots },
      thuaChuaUocTinh: supply.plotsWithout,
      bang: buildPlan({ months, stockKg: stock.kg, stockEuKg: apDung ? stock.euKg : stock.kg, supply: supply.items, demand }),
      nguon: [...bySupplier.values()].map((v) => ({ ...v, kg: r2(v.kg), euKg: apDung ? r2(v.euKg) : null })).sort((a, b) => b.kg - a.kg),
      cau: demand
        .map((d) => ({ loai: d.kind, ma: seeCodes || d.kind === 'bao_gia' ? d.ma : null, doiTac: d.doiTac, thiTruong: d.market, thang: d.month, thangGhi: d.thangGhi, khoiLuongKg: r2(d.kg) }))
        .sort((a, b) => a.thang.localeCompare(b.thang)),
    };
  }

  /**
   * Hàng cà phê đủ EUDR còn trống cho một báo giá bán sang EU: hàng đủ EUDR đang có cộng ước tính đủ EUDR trong
   * 12 tháng, trừ mọi cầu đi EU khác. Null khi báo giá không phải cà phê sang EU.
   */
  async offerCheck(q: Quote, sector: string, buyerCountry: string) {
    if (!EUDR_SECTORS.includes(sector) || marketOfCountry(buyerCountry) !== 'EU') return null;
    const months = monthsFrom(currentMonth(), PLAN_MONTHS);
    const stock = await this.stock(sector);
    const supply = await this.supply(sector, months);
    const demand = await this.demand(sector, months, q.id);
    const euSupply = stock.euKg + supply.items.filter((s) => s.eu).reduce((a, s) => a + s.kg, 0);
    const euDemand = demand.filter((d) => d.market === 'EU').reduce((a, d) => a + d.kg, 0);
    const conTrong = r2(euSupply - euDemand);
    const chao = toKg(q.quantity, q.unit);
    return { conTrongKg: conTrong, chaoKg: chao, canhBao: eudrOfferWarning(conTrong, chao) };
  }

  /** Hàng đang có: lô mua chưa huỷ, đã thu gom trừ hao hụt và phần đã phân bổ sang lô xuất. */
  private async stock(sector: string) {
    const rows = await this.db
      .select({
        id: purchaseLots.id,
        eudrClass: purchaseLots.eudrClass,
        conKg: sql<number>`(${purchaseLots.collectedKg} - ${purchaseLots.lossKg} - coalesce((select sum(a.quantity_kg) from lot_allocations a where a.purchase_lot_id = "purchase_lots"."id" and a.cancelled_at is null), 0))::float8`,
      })
      .from(purchaseLots)
      .innerJoin(commodities, eq(commodities.id, purchaseLots.commodityId))
      .where(and(eq(commodities.sector, sector), ne(purchaseLots.status, 'da_huy')));
    const live = rows.filter((r) => r.conKg > 0.005);
    return {
      kg: r2(live.reduce((s, r) => s + r.conKg, 0)),
      euKg: r2(live.filter((r) => r.eudrClass === 'du').reduce((s, r) => s + r.conKg, 0)),
      lots: live.length,
    };
  }

  /**
   * Sản lượng ước tính trong khung kế hoạch, trừ phần đã thu gom từ thửa trong cùng tháng (đã nằm trong hàng đang có).
   * Với cà phê, ước tính chỉ tính là đủ EUDR khi thửa đang đủ điều kiện (đã kiểm rừng, có trần, không cảnh báo).
   */
  private async supply(sector: string, months: string[]) {
    const setting = await this.collection.yieldSetting();
    const apDung = EUDR_SECTORS.includes(sector);
    const plotRows = await this.db
      .select({ p: plots, areaYield: growingAreas.maxYieldKgPerHa, supplierName: partners.name })
      .from(plots)
      .innerJoin(growingAreas, eq(growingAreas.id, plots.growingAreaId))
      .innerJoin(partners, eq(partners.id, plots.supplierPartnerId))
      .where(and(eq(growingAreas.sector, sector), eq(growingAreas.active, true), isNull(plots.voidedAt)));
    if (plotRows.length === 0) return { items: [] as (SupplyItem & { supplierId: string; supplierName: string })[], plotsWithout: 0 };
    const ids = plotRows.map((r) => r.p.id);
    const first = months[0];
    const last = months[months.length - 1];
    const est = await this.db
      .select({ plotId: harvestEstimates.plotId, month: harvestEstimates.month, kg: harvestEstimates.estimatedKg })
      .from(harvestEstimates)
      .where(and(inArray(harvestEstimates.plotId, ids), gte(harvestEstimates.month, first), lte(harvestEstimates.month, last)));
    const collected = await this.db
      .select({ plotId: collectionSlips.plotId, month: sql<string>`substr(${collectionSlips.harvestDate}, 1, 7)`, kg: sql<number>`sum(${collectionSlips.quantityKg})::float8` })
      .from(collectionSlips)
      .where(and(inArray(collectionSlips.plotId, ids), isNull(collectionSlips.voidedAt), gte(collectionSlips.harvestDate, `${first}-01`)))
      .groupBy(collectionSlips.plotId, sql`substr(${collectionSlips.harvestDate}, 1, 7)`);
    const got = new Map(collected.map((c) => [`${c.plotId}|${c.month}`, c.kg]));
    const byId = new Map(plotRows.map((r) => [r.p.id, r]));
    const items = est
      .map((e) => {
        const r = byId.get(e.plotId)!;
        const kg = Math.max(e.kg - (got.get(`${e.plotId}|${e.month}`) ?? 0), 0);
        const eu = !apDung || eudrReasons({ capKg: plotCapKg(r.p.areaHa, yieldFor(r.areaYield, setting, sector)), plotWarnings: r.p.warnings as string[], forestStatus: r.p.forestStatus }).length === 0;
        return { month: e.month, kg, eu, supplierId: r.p.supplierPartnerId, supplierName: r.supplierName };
      })
      .filter((x) => x.kg > 0);
    const withEst = new Set(est.map((e) => e.plotId));
    return { items, plotsWithout: ids.filter((id) => !withEst.has(id)).length };
  }

  /**
   * Cầu: báo giá bán đã gửi còn hiệu lực, và hợp đồng bán (đối ứng của lô xuất) chưa huỷ, chưa xếp tàu, trừ phần đã
   * phân bổ hàng. Tháng: ETD của lô xuất, không có thì tháng giao ghi trên báo giá.
   */
  private async demand(sector: string, months: string[], excludeQuoteId: string | null): Promise<DemandRow[]> {
    const start = months[0];
    const out: DemandRow[] = [];
    const qs = await this.db
      .select({ q: quotes, partnerName: partners.name, country: partners.country })
      .from(quotes)
      .innerJoin(partners, eq(partners.id, quotes.partnerId))
      .innerJoin(commodities, eq(commodities.id, quotes.commodityId))
      .where(and(eq(quotes.kind, 'ban'), eq(quotes.status, 'da_gui'), eq(commodities.sector, sector), gte(quotes.validUntil, today())));
    for (const x of qs) {
      if (x.q.id === excludeQuoteId) continue;
      const m = bucketMonth(x.q.deliveryMonth, start);
      if (!m) continue;
      out.push({ id: x.q.id, ma: x.q.code, doiTac: x.partnerName, market: marketOfCountry(x.country), month: m, thangGhi: x.q.deliveryMonth, kg: toKg(x.q.quantity, x.q.unit), kind: 'bao_gia' });
    }

    const cs = await this.db
      .select({ c: contracts, partnerName: partners.name, country: partners.country })
      .from(contracts)
      .innerJoin(commodities, eq(commodities.id, contracts.commodityId))
      .leftJoin(partners, eq(partners.id, contracts.buyerPartnerId))
      .where(and(inArray(contracts.kind, SALE_CONTRACT_KINDS), inArray(contracts.status, ['nhap', 'cho_ky', 'da_ky']), eq(commodities.sector, sector)));
    if (cs.length === 0) return out;
    const ids = cs.map((x) => x.c.id);
    const lots = await this.db
      .select({
        contractId: exportLots.counterContractId,
        shipmentNo: exportLots.shipmentNo,
        market: exportLots.market,
        status: exportLots.status,
        etd: exportLots.etd,
        allocatedKg: sql<number>`coalesce((select sum(a.quantity_kg) from lot_allocations a where a.export_lot_id = "export_lots"."id" and a.cancelled_at is null), 0)::float8`,
      })
      .from(exportLots)
      .where(and(inArray(exportLots.counterContractId, ids), ne(exportLots.status, 'da_huy')));
    const lotOf = (contractId: string, dot: number) => lots.find((l) => l.contractId === contractId && l.shipmentNo === dot);
    const fromQuotes = await this.db
      .select({ ids: quotes.contractIds, month: quotes.deliveryMonth })
      .from(quotes)
      .where(and(eq(quotes.kind, 'ban'), sql`${quotes.deliveryMonth} is not null`, sql`${quotes.contractIds} ?| array[${sql.join(ids.map((i) => sql`${i}`), sql`, `)}]`));
    const quoteMonth = new Map<string, string>();
    for (const fq of fromQuotes) for (const id of fq.ids as string[]) if (fq.month) quoteMonth.set(id, fq.month);

    for (const x of cs) {
      const terms = await this.contracts.effectiveTerms(x.c);
      // Hợp đồng chia đợt: mỗi đợt là một dòng cầu theo tháng của đợt (BH-1)
      const dots = terms.dotGiao?.length ? terms.dotGiao.map((d) => ({ qty: d.soLuong, month: d.thang as string | null })) : [{ qty: terms.soLuong, month: null }];
      dots.forEach((d, i) => {
        const lot = lotOf(x.c.id, i + 1);
        if (lot && SHIPPED.includes(lot.status)) return;
        const kg = toKg(d.qty, terms.donVi) - (lot?.allocatedKg ?? 0);
        if (kg <= 0.005) return;
        const written = lot?.etd ? lot.etd.slice(0, 7) : (d.month ?? quoteMonth.get(x.c.id) ?? null);
        const m = bucketMonth(written, start);
        if (!m) return;
        const market: PlanMarket = (lot?.market as PlanMarket | undefined) ?? marketOfCountry(x.country);
        const ma = dots.length > 1 ? `${x.c.code} đợt ${i + 1}/${dots.length}` : x.c.code;
        out.push({ id: x.c.id, ma, doiTac: x.partnerName ?? 'Chưa có người mua', market, month: m, thangGhi: written, kg, kind: x.c.status === 'da_ky' ? 'hop_dong_ky' : 'hop_dong_nhap' });
      });
    }
    return out;
  }
}

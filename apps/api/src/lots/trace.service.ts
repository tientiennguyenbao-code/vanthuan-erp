import { ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, asc, eq, inArray, isNotNull, isNull, sql } from 'drizzle-orm';
import type { AuthContext } from '../auth/auth.types';
import { DB, Db } from '../db/db';
import { catchTrips, collectionSlips, commodities, fishingVessels, exportLots, facilities, facilityCodes, farmers, growingAreas, lotAllocations, lotEvents, partners, plots, purchaseLots, sprayLogs } from '../db/schema';
import { codeInEffect } from '../sourcing/area-code.rules';
import { iuuIssues, simpIssues } from '../sourcing/catch.rules';
import { FACILITY_SCHEMES, FacilityScheme, isSimpSpecies, ruleFor, traceChecks, TraceFacts } from '../sourcing/trace.rules';

const r2 = (n: number) => Math.round(n * 100) / 100;
const today = () => new Date().toISOString().slice(0, 10);
const minusDays = (date: string, n: number) => {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
};

/**
 * Truy xuất nguồn gốc của một lô xuất cho mọi ngành: lô xuất → lô mua (phần phân bổ) → phiếu thu gom → thửa/ao,
 * kèm kho, xưởng đã xử lý hàng và mã đăng ký của chúng; kiểm theo cặp ngành × thị trường.
 * Khi một lô mua chia cho nhiều lô xuất, mỗi lô xuất nhận phần kg của từng thửa theo tỷ lệ kg được phân bổ.
 */
@Injectable()
export class TraceService {
  constructor(@Inject(DB) private readonly db: Db) {}

  async forExportLot(id: string, ctx: AuthContext) {
    const [row] = await this.db
      .select({ lot: exportLots, sector: commodities.sector, commodityName: commodities.name })
      .from(exportLots)
      .innerJoin(commodities, eq(commodities.id, exportLots.commodityId))
      .where(eq(exportLots.id, id));
    if (!row) throw new NotFoundException('Không tìm thấy lô xuất');
    const { lot, sector } = row;
    const canView = ctx.permissions.includes('LO_HANG_XEM_TAT_CA') || (ctx.permissions.includes('LO_HANG_QUAN_LY_CUA_MINH') && lot.ownerUserId === ctx.user.id);
    if (!canView) throw new ForbiddenException('Bạn không xem được lô này');

    const allocs = await this.db
      .select({
        purchaseLotId: lotAllocations.purchaseLotId,
        kg: sql<number>`sum(${lotAllocations.quantityKg})::float8`,
        code: purchaseLots.code,
        collectedKg: purchaseLots.collectedKg,
        eudrClass: purchaseLots.eudrClass,
        facilityId: purchaseLots.facilityId,
        packingCode: purchaseLots.packingFacilityCode,
        supplierName: partners.name,
      })
      .from(lotAllocations)
      .innerJoin(purchaseLots, eq(purchaseLots.id, lotAllocations.purchaseLotId))
      .innerJoin(partners, eq(partners.id, purchaseLots.supplierPartnerId))
      .where(and(eq(lotAllocations.exportLotId, id), isNull(lotAllocations.cancelledAt)))
      .groupBy(lotAllocations.purchaseLotId, purchaseLots.code, purchaseLots.collectedKg, purchaseLots.eudrClass, purchaseLots.facilityId, purchaseLots.packingFacilityCode, partners.name)
      .orderBy(asc(purchaseLots.code));
    const lotIds = allocs.map((a) => a.purchaseLotId);

    // Phiếu theo (lô mua, thửa)
    const slips = lotIds.length
      ? await this.db
          .select({
            purchaseLotId: collectionSlips.purchaseLotId,
            plot: plots,
            farmerCode: farmers.code,
            areaCode: growingAreas.code,
            areaName: growingAreas.name,
            officialCode: growingAreas.officialCode,
            codeValidUntil: growingAreas.officialCodeValidUntil,
            kg: sql<number>`sum(${collectionSlips.quantityKg})::float8`,
            from: sql<string>`min(${collectionSlips.harvestDate})`,
            to: sql<string>`max(${collectionSlips.harvestDate})`,
            issues: sql<string[]>`coalesce(jsonb_agg(distinct x.issue) filter (where x.issue is not null), '[]'::jsonb)`,
          })
          .from(collectionSlips)
          .innerJoin(plots, eq(plots.id, collectionSlips.plotId))
          .innerJoin(farmers, eq(farmers.id, plots.farmerId))
          .innerJoin(growingAreas, eq(growingAreas.id, plots.growingAreaId))
          .leftJoin(sql`lateral jsonb_array_elements_text(${collectionSlips.traceIssues}) as x(issue)`, sql`true`)
          .where(and(inArray(collectionSlips.purchaseLotId, lotIds), isNull(collectionSlips.voidedAt)))
          .groupBy(collectionSlips.purchaseLotId, plots.id, farmers.code, growingAreas.code, growingAreas.name, growingAreas.officialCode, growingAreas.officialCodeValidUntil)
      : [];

    const allocBy = new Map(allocs.map((a) => [a.purchaseLotId, a]));
    const bySource = new Map<string, { plot: (typeof slips)[number]['plot']; farmerCode: string; areaCode: string; areaName: string; officialCode: string | null; codeExpired: boolean; kg: number; from: string; to: string; issues: Set<string> }>();
    for (const s of slips) {
      const a = allocBy.get(s.purchaseLotId)!;
      const share = a.collectedKg > 0 ? (s.kg * a.kg) / a.collectedKg : 0;
      const cur = bySource.get(s.plot.id);
      if (cur) {
        cur.kg += share;
        if (s.from < cur.from) cur.from = s.from;
        if (s.to > cur.to) cur.to = s.to;
        for (const i of s.issues) cur.issues.add(i);
      } else {
        bySource.set(s.plot.id, { plot: s.plot, farmerCode: s.farmerCode, areaCode: s.areaCode, areaName: s.areaName, officialCode: codeInEffect(s.codeValidUntil, today()) ? s.officialCode : null, codeExpired: !!s.officialCode && !codeInEffect(s.codeValidUntil, today()), kg: share, from: s.from, to: s.to, issues: new Set(s.issues) });
      }
    }
    // Phiếu theo (lô mua, chuyến khai thác)
    const tripSlips = lotIds.length
      ? await this.db
          .select({
            purchaseLotId: collectionSlips.purchaseLotId,
            t: catchTrips,
            v: fishingVessels,
            kg: sql<number>`sum(${collectionSlips.quantityKg})::float8`,
          })
          .from(collectionSlips)
          .innerJoin(catchTrips, eq(catchTrips.id, collectionSlips.catchTripId))
          .innerJoin(fishingVessels, eq(fishingVessels.id, catchTrips.vesselId))
          .where(and(inArray(collectionSlips.purchaseLotId, lotIds), isNull(collectionSlips.voidedAt)))
          .groupBy(collectionSlips.purchaseLotId, catchTrips.id, fishingVessels.id)
      : [];
    const byTrip = new Map<string, { t: (typeof tripSlips)[number]['t']; v: (typeof tripSlips)[number]['v']; kg: number }>();
    for (const x of tripSlips) {
      const a = allocBy.get(x.purchaseLotId)!;
      const share = a.collectedKg > 0 ? (x.kg * a.kg) / a.collectedKg : 0;
      const cur = byTrip.get(x.t.id);
      if (cur) cur.kg += share;
      else byTrip.set(x.t.id, { t: x.t, v: x.v, kg: share });
    }
    const trips = [...byTrip.values()]
      .sort((x, y) => x.t.code.localeCompare(y.t.code))
      .map((x) => {
        const f = { code: x.t.code, landedOn: x.t.landedOn, certificateNo: x.t.certificateNo, vessel: { registrationNo: x.v.registrationNo, lengthM: x.v.lengthM, hasVms: x.v.hasVms, licenseNo: x.v.licenseNo, licenseValidUntil: x.v.licenseValidUntil } };
        return { ...x, thieuIuu: iuuIssues(f), thieuSimp: simpIssues(f) };
      });

    const sources = [...bySource.values()].sort((x, y) => x.plot.code.localeCompare(y.plot.code));

    // Nhật ký thuốc trong 12 tháng trước lần thu hoạch cuối
    const sprayed = new Set<string>();
    if (sector === 'gia_vi' && sources.length) {
      const logs = await this.db
        .select({ plotId: sprayLogs.plotId, on: sprayLogs.sprayedOn })
        .from(sprayLogs)
        .where(and(inArray(sprayLogs.plotId, sources.map((s) => s.plot.id)), isNull(sprayLogs.voidedAt)));
      for (const s of sources) if (logs.some((l) => l.plotId === s.plot.id && l.on <= s.to && l.on >= minusDays(s.to, 365))) sprayed.add(s.plot.id);
    }

    // Kho, xưởng đã xử lý hàng của các lô mua
    const evFac = lotIds.length
      ? await this.db
          .select({ purchaseLotId: lotEvents.purchaseLotId, facilityId: lotEvents.facilityId })
          .from(lotEvents)
          .where(and(inArray(lotEvents.purchaseLotId, lotIds), isNotNull(lotEvents.facilityId)))
      : [];
    const facOfLot = new Map<string, Set<string>>();
    for (const a of allocs) facOfLot.set(a.purchaseLotId, new Set(a.facilityId ? [a.facilityId] : []));
    for (const e of evFac) facOfLot.get(e.purchaseLotId!)!.add(e.facilityId!);
    const facIds = [...new Set([...facOfLot.values()].flatMap((s) => [...s]))];
    const facRows = facIds.length ? await this.db.select({ id: facilities.id, name: facilities.name, kind: facilities.kind }).from(facilities).where(inArray(facilities.id, facIds)).orderBy(asc(facilities.name)) : [];
    const codes = facIds.length
      ? await this.db.select().from(facilityCodes).where(and(inArray(facilityCodes.facilityId, facIds), isNull(facilityCodes.voidedAt)))
      : [];
    const valid = codes.filter((c) => !c.validUntil || c.validUntil >= today());
    const maCoSo: Partial<Record<FacilityScheme, string[]>> = {};
    const coSoThieu: Partial<Record<FacilityScheme, string[]>> = {};
    for (const sc of FACILITY_SCHEMES) {
      for (const f of facRows) {
        const c = valid.find((x) => x.facilityId === f.id && x.scheme === sc);
        if (c) (maCoSo[sc] ??= []).push(`${f.name}: ${c.code}`);
        else (coSoThieu[sc] ??= []).push(f.name);
      }
    }

    const tongKg = r2(allocs.reduce((s, a) => s + a.kg, 0));
    const truyDuocKg = r2(sources.reduce((s, x) => s + x.kg, 0) + trips.reduce((s, x) => s + x.kg, 0));
    const facts: TraceFacts = {
      tongKg,
      truyDuocKg,
      loMua: allocs.map((a) => ({ ma: a.code, eudrClass: a.eudrClass, coCoSo: (facOfLot.get(a.purchaseLotId)?.size ?? 0) > 0 })),
      nguon: sources.map((s) => ({ ma: s.plot.code, maSoVung: s.officialCode, coNhatKyThuoc: sprayed.has(s.plot.id), luuY: [...s.issues] })),
      chuyen: trips.map((x) => ({ ma: x.t.code, thieuIuu: x.thieuIuu, thieuSimp: x.thieuSimp })),
      maCoSo,
      coSoThieu,
      simp: sector === 'thuy_san' && isSimpSpecies(row.commodityName, ...sources.map((s) => s.plot.crop), ...trips.map((x) => x.t.species)),
    };
    const rule = ruleFor(sector, lot.market);
    const kiemTra = rule ? traceChecks(rule, facts) : [];

    return {
      nganh: sector,
      thiTruong: lot.market,
      mucTruyXuat: rule?.muc ?? null,
      tongKg,
      truyDuocKg,
      kiemTra,
      dat: kiemTra.every((k) => k.dat),
      loMua: allocs.map((a) => ({
        ma: a.code,
        nhaCungCap: a.supplierName,
        khoiLuongKg: r2(a.kg),
        nhanEudr: a.eudrClass,
        maCoSoDongGoi: a.packingCode,
        coSo: facRows.filter((f) => facOfLot.get(a.purchaseLotId)?.has(f.id)).map((f) => f.name),
      })),
      nguon: sources.map((s) => ({
        ma: s.plot.code,
        loai: s.plot.kind,
        maHo: s.farmerCode,
        maVung: s.areaCode,
        tenVung: s.areaName,
        maSoVung: s.officialCode,
        maSoVungHetHan: s.codeExpired,
        cayTrong: s.plot.crop,
        khoiLuongKg: r2(s.kg),
        thuHoachTu: s.from,
        thuHoachDen: s.to,
        coNhatKyThuoc: sector === 'gia_vi' ? sprayed.has(s.plot.id) : null,
        luuY: [...s.issues],
      })),
      chuyen: trips.map((x) => ({
        ma: x.t.code,
        tau: x.v.registrationNo,
        tenTau: x.v.name,
        quocTich: x.v.flag,
        nghe: x.v.gear,
        giayPhep: x.v.licenseNo,
        cang: x.t.landingPort,
        vungKhaiThac: x.t.fishingArea,
        loai: x.t.species,
        ngayDi: x.t.departedOn,
        ngayCap: x.t.landedOn,
        giayKhaiThac: x.t.certificateNo,
        khoiLuongKg: r2(x.kg),
        thieu: [...new Set([...x.thieuIuu, ...x.thieuSimp])],
      })),
      coSo: facRows.map((f) => ({ ten: f.name, loai: f.kind, ma: valid.filter((c) => c.facilityId === f.id).map((c) => ({ loai: c.scheme, ma: c.code, hieuLucDen: c.validUntil })) })),
    };
  }
}

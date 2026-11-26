import { BadRequestException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, asc, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import { AuditService } from '../audit/audit.service';
import type { AuthContext } from '../auth/auth.types';
import { sha256Hex } from '../common/crypto';
import { stableStringify } from '../common/stable-json';
import { ContractsService } from '../contracts/contracts.service';
import { DB, Db, DbExecutor } from '../db/db';
import {
  collectionSlips,
  commodities,
  contracts,
  eudrPackages,
  ExportLot,
  exportLots,
  farmers,
  growingAreas,
  lotAllocations,
  lotEvents,
  partners,
  plotForestChecks,
  plots,
  purchaseLots,
  users,
} from '../db/schema';

const r2 = (n: number) => Math.round(n * 100) / 100;
const r4 = (n: number) => Math.round(n * 10_000) / 10_000;

export interface EudrPlot {
  ma: string;
  maHo: string;
  maVung: string;
  maSoVung: string | null;
  tinh: string;
  loai: string;
  cayTrong: string | null;
  dienTichHa: number;
  khoiLuongKg: number;
  thuHoachTu: string;
  thuHoachDen: string;
  kiemTraRung: { trangThai: string; cach: string | null; duyetNgay: string | null };
  toaDo: unknown;
}

export interface EudrContent {
  loXuat: { ma: string; thiTruong: string; hopDong: string; nguoiMua: string; matHang: string; maHs: string | null; tongKg: number };
  loMua: { ma: string; nhaCungCap: string; khoiLuongKg: number; nhanEudr: string | null }[];
  thua: EudrPlot[];
  tongHop: { soThua: number; soHo: number; dienTichHa: number };
}

/**
 * Gói dữ liệu EUDR theo lô xuất: thửa nào (tọa độ), hộ nào, bao nhiêu hàng, kết quả kiểm tra rừng.
 * Người nhập khẩu ở EU dùng gói này để nộp tờ khai thẩm định (DDS). Chốt gói thì mã băm lên sổ cái.
 */
@Injectable()
export class EudrService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly contractsService: ContractsService,
    private readonly audit: AuditService,
  ) {}

  private canView(lot: ExportLot, ctx: AuthContext) {
    return ctx.permissions.includes('LO_HANG_XEM_TAT_CA') || (ctx.permissions.includes('LO_HANG_QUAN_LY_CUA_MINH') && lot.ownerUserId === ctx.user.id);
  }
  private canManage(lot: ExportLot, ctx: AuthContext) {
    return ctx.permissions.includes('LO_HANG_PHAN_CONG') || (ctx.permissions.includes('LO_HANG_QUAN_LY_CUA_MINH') && lot.ownerUserId === ctx.user.id);
  }
  private async lot(id: string, exec: DbExecutor, lock = false): Promise<ExportLot> {
    const q = exec.select().from(exportLots).where(eq(exportLots.id, id));
    const [l] = lock ? await q.for('update') : await q;
    if (!l) throw new NotFoundException('Không tìm thấy lô xuất');
    return l;
  }

  /** Dựng nội dung gói từ dữ liệu hiện tại, kèm các vấn đề còn chặn việc chốt. */
  async build(lot: ExportLot, exec: DbExecutor): Promise<{ content: EudrContent; vanDe: string[] }> {
    const vanDe: string[] = [];
    const [info] = await exec
      .select({ contractCode: contracts.code, buyerName: partners.name, commodityName: commodities.name, hsCode: commodities.hsCode, sector: commodities.sector })
      .from(exportLots)
      .innerJoin(contracts, eq(contracts.id, exportLots.counterContractId))
      .innerJoin(partners, eq(partners.id, exportLots.buyerPartnerId))
      .innerJoin(commodities, eq(commodities.id, exportLots.commodityId))
      .where(eq(exportLots.id, lot.id));
    if (lot.market !== 'EU') vanDe.push('Gói EUDR chỉ dùng cho lô xuất đi EU');
    if (info.sector !== 'ca_phe') vanDe.push('Mặt hàng không thuộc EUDR trong phạm vi công ty (chỉ cà phê)');

    const allocs = await exec
      .select({ purchaseLotId: lotAllocations.purchaseLotId, kg: sql<number>`sum(${lotAllocations.quantityKg})::float8`, code: purchaseLots.code, eudrClass: purchaseLots.eudrClass, supplierName: partners.name })
      .from(lotAllocations)
      .innerJoin(purchaseLots, eq(purchaseLots.id, lotAllocations.purchaseLotId))
      .innerJoin(partners, eq(partners.id, purchaseLots.supplierPartnerId))
      .where(and(eq(lotAllocations.exportLotId, lot.id), isNull(lotAllocations.cancelledAt)))
      .groupBy(lotAllocations.purchaseLotId, purchaseLots.code, purchaseLots.eudrClass, partners.name)
      .orderBy(asc(purchaseLots.code));
    if (allocs.length === 0) vanDe.push('Lô xuất chưa có lô mua nào được phân bổ');
    for (const a of allocs) if (a.eudrClass !== 'du') vanDe.push(`Lô mua ${a.code} không có nhãn đủ EUDR`);

    const lotIds = allocs.map((a) => a.purchaseLotId);
    const rows = lotIds.length
      ? await exec
          .select({
            plot: plots,
            farmerCode: farmers.code,
            areaCode: growingAreas.code,
            officialCode: growingAreas.officialCode,
            province: growingAreas.province,
            kg: sql<number>`sum(${collectionSlips.quantityKg})::float8`,
            from: sql<string>`min(${collectionSlips.harvestDate})`,
            to: sql<string>`max(${collectionSlips.harvestDate})`,
          })
          .from(collectionSlips)
          .innerJoin(plots, eq(plots.id, collectionSlips.plotId))
          .innerJoin(farmers, eq(farmers.id, plots.farmerId))
          .innerJoin(growingAreas, eq(growingAreas.id, plots.growingAreaId))
          .where(and(inArray(collectionSlips.purchaseLotId, lotIds), isNull(collectionSlips.voidedAt)))
          .groupBy(plots.id, farmers.code, growingAreas.code, growingAreas.officialCode, growingAreas.province)
          .orderBy(asc(plots.code))
      : [];
    const approved = rows.length
      ? await exec
          .select({ plotId: plotForestChecks.plotId, method: plotForestChecks.method, reviewedAt: plotForestChecks.reviewedAt })
          .from(plotForestChecks)
          .where(and(inArray(plotForestChecks.plotId, rows.map((r) => r.plot.id)), eq(plotForestChecks.status, 'da_duyet')))
          .orderBy(desc(plotForestChecks.reviewedAt))
      : [];
    const lastCheck = new Map<string, (typeof approved)[number]>();
    for (const c of approved) if (!lastCheck.has(c.plotId)) lastCheck.set(c.plotId, c);

    const thua: EudrPlot[] = rows.map((r) => {
      const c = lastCheck.get(r.plot.id);
      if (r.plot.voidedAt) vanDe.push(`Thửa ${r.plot.code} đã bị huỷ sau khi thu gom`);
      if (r.plot.forestStatus !== 'khong_rung') vanDe.push(`Thửa ${r.plot.code} hiện không có kết quả "không rừng" đã duyệt (có thể đã đo lại)`);
      return {
        ma: r.plot.code,
        maHo: r.farmerCode,
        maVung: r.areaCode,
        maSoVung: r.officialCode,
        tinh: r.province,
        loai: r.plot.geometryType,
        cayTrong: r.plot.crop,
        dienTichHa: r.plot.areaHa,
        khoiLuongKg: r2(r.kg),
        thuHoachTu: r.from,
        thuHoachDen: r.to,
        kiemTraRung: { trangThai: r.plot.forestStatus, cach: c?.method ?? null, duyetNgay: c?.reviewedAt ? c.reviewedAt.toISOString().slice(0, 10) : null },
        toaDo: r.plot.geometry,
      };
    });
    if (allocs.length && thua.length === 0) vanDe.push('Chưa có phiếu thu gom nào gắn với thửa');

    const content: EudrContent = {
      loXuat: { ma: lot.code, thiTruong: lot.market, hopDong: info.contractCode, nguoiMua: info.buyerName, matHang: info.commodityName, maHs: info.hsCode, tongKg: r2(allocs.reduce((s, a) => s + a.kg, 0)) },
      loMua: allocs.map((a) => ({ ma: a.code, nhaCungCap: a.supplierName, khoiLuongKg: r2(a.kg), nhanEudr: a.eudrClass })),
      thua,
      tongHop: { soThua: thua.length, soHo: new Set(thua.map((t) => t.maHo)).size, dienTichHa: r4(thua.reduce((s, t) => s + t.dienTichHa, 0)) },
    };
    return { content, vanDe: [...new Set(vanDe)] };
  }

  async view(id: string, ctx: AuthContext) {
    const lot = await this.lot(id, this.db);
    if (!this.canView(lot, ctx)) throw new ForbiddenException('Bạn không xem được lô này');
    const { content, vanDe } = await this.build(lot, this.db);
    const done = await this.db
      .select({ version: eudrPackages.version, contentHash: eudrPackages.contentHash, createdAt: eudrPackages.createdAt, createdByName: users.fullName })
      .from(eudrPackages)
      .innerJoin(users, eq(users.id, eudrPackages.createdBy))
      .where(eq(eudrPackages.exportLotId, id))
      .orderBy(desc(eudrPackages.version));
    const hash = sha256Hex(stableStringify(content));
    return {
      xemTruoc: content,
      vanDe,
      maBamHienTai: hash,
      daChot: done,
      khopBanChotGanNhat: done.length > 0 && done[0].contentHash === hash,
      duocChot: this.canManage(lot, ctx) && vanDe.length === 0 && lot.status !== 'da_huy' && !(done.length > 0 && done[0].contentHash === hash),
    };
  }

  /** Chốt gói: lưu phiên bản mới, ghi mã băm lên sổ cái của hợp đồng đối ứng. */
  async seal(id: string, ctx: AuthContext, ip: string | null) {
    return this.db.transaction(async (tx) => {
      const lot = await this.lot(id, tx, true);
      if (!this.canManage(lot, ctx)) throw new ForbiddenException('Bạn chỉ chốt gói cho lô do mình phụ trách');
      if (lot.status === 'da_huy') throw new BadRequestException('Lô đã huỷ');
      const { content, vanDe } = await this.build(lot, tx);
      if (vanDe.length) throw new BadRequestException(`Chưa chốt được gói EUDR: ${vanDe.join('; ')}`);
      const hash = sha256Hex(stableStringify(content));
      const [last] = await tx.select().from(eudrPackages).where(eq(eudrPackages.exportLotId, id)).orderBy(desc(eudrPackages.version)).limit(1);
      if (last && last.contentHash === hash) throw new BadRequestException('Dữ liệu không đổi so với gói đã chốt gần nhất');
      const version = (last?.version ?? 0) + 1;
      await tx.insert(eudrPackages).values({ exportLotId: id, version, content, contentHash: hash, createdBy: ctx.user.id });
      const note = `Gói EUDR ${lot.code} bản ${version}: ${content.tongHop.soThua} thửa, ${content.tongHop.soHo} hộ, ${content.loXuat.tongKg} kg`;
      await this.contractsService.appendLedgerEvent(lot.counterContractId, 'goi_eudr', hash, note, ctx, tx);
      await tx.insert(lotEvents).values({ exportLotId: id, kind: 'goi_eudr', note, detail: { phienBan: version, maBam: hash }, actorUserId: ctx.user.id });
      await this.audit.record({ actorUserId: ctx.user.id, action: 'lo_xuat.chot_goi_eudr', entityType: 'export_lot', entityId: id, ip, detail: { phienBan: version, maBam: hash } }, tx);
      return { version, contentHash: hash };
    });
  }

  /** Tệp GeoJSON của một bản đã chốt (định dạng hệ thống thông tin EUDR nhận), không có tên hay CCCD của hộ. */
  async geojson(id: string, version: number, ctx: AuthContext) {
    const lot = await this.lot(id, this.db);
    if (!this.canView(lot, ctx)) throw new ForbiddenException('Bạn không xem được lô này');
    const [p] = await this.db.select().from(eudrPackages).where(and(eq(eudrPackages.exportLotId, id), eq(eudrPackages.version, version)));
    if (!p) throw new NotFoundException('Không tìm thấy bản gói này');
    const c = p.content as EudrContent;
    return {
      name: `${lot.code}-EUDR-v${version}`,
      data: {
        type: 'FeatureCollection',
        properties: { loXuat: c.loXuat.ma, phienBan: version, maBam: p.contentHash, chotLuc: p.createdAt.toISOString(), matHang: c.loXuat.matHang, maHs: c.loXuat.maHs },
        features: c.thua.map((t) => ({
          type: 'Feature',
          properties: {
            ProducerCountry: 'VN',
            ProductionPlace: t.ma,
            Area: t.dienTichHa,
            maHo: t.maHo,
            maVung: t.maVung,
            maSoVung: t.maSoVung,
            khoiLuongKg: t.khoiLuongKg,
            thuHoachTu: t.thuHoachTu,
            thuHoachDen: t.thuHoachDen,
            kiemTraRung: t.kiemTraRung.cach,
            kiemTraRungDuyet: t.kiemTraRung.duyetNgay,
          },
          geometry: t.toaDo,
        })),
      },
    };
  }
}

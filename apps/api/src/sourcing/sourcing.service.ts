import { BadRequestException, ConflictException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, asc, eq, isNull, ne, sql } from 'drizzle-orm';
import { AuditService } from '../audit/audit.service';
import type { AuthContext } from '../auth/auth.types';
import { decrypt, encrypt, sha256Hex } from '../common/crypto';
import { loadConfig } from '../config/config';
import { DB, Db, DbExecutor } from '../db/db';
import { farmers, growingAreas, partnerDocuments, plotForestChecks, partnerRoles, partners, partnerUsers, plots } from '../db/schema';
import {
  AreaKind,
  centroid,
  checkPlot,
  findOverlaps,
  maskIdNumber,
  normalizeGeometry,
  normalizeIdNumber,
  PlotGeometry,
  PlotKind,
  SourcingRuleError,
  toFeatureCollection,
} from './sourcing.rules';

export type Source = 'noi_bo' | 'cong_ncc' | 'nhap_tep';

export interface AreaInput {
  name: string;
  kind: AreaKind;
  sector: string;
  officialCode?: string | null;
  officialCodeIssuer?: string | null;
  commune?: string | null;
  district?: string | null;
  province: string;
  note?: string | null;
}

export interface FarmerInput {
  fullName: string;
  idNumber?: string | null;
  phone?: string | null;
  commune?: string | null;
  district?: string | null;
  province: string;
  joinedOn?: string | null;
  consentOn: string;
}

export interface PlotInput {
  farmerId: string;
  growingAreaId: string;
  kind: PlotKind;
  crop?: string | null;
  plantedYear?: number | null;
  geometry: unknown;
  declaredAreaHa?: number | null;
  gpsAccuracyM?: number | null;
  landDocType?: string | null;
  landDocNumber?: string | null;
}

const rule = <T>(fn: () => T): T => {
  try {
    return fn();
  } catch (e) {
    if (e instanceof SourcingRuleError) throw new BadRequestException(e.message);
    throw e;
  }
};

/**
 * Hồ sơ nguồn cung: nông hộ, vùng trồng / vùng nuôi, thửa / ao có tọa độ.
 * Dùng chung cho nhân viên (mọi nhà cung cấp) và cổng nhà cung cấp (chỉ dữ liệu của mình).
 * Không xoá: huỷ có lý do. Mọi thao tác ghi đều vào nhật ký chỉ ghi thêm.
 */
@Injectable()
export class SourcingService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly audit: AuditService,
  ) {}

  private get key(): Buffer {
    return Buffer.from(loadConfig().APP_KEY, 'base64');
  }

  private idHash(idNumber: string): string {
    return sha256Hex(`cccd|${this.key.toString('base64')}|${idNumber}`);
  }

  // ---------- Ai được làm gì ----------

  /** Nhà cung cấp gắn với tài khoản cổng, hoặc null nếu là nhân viên. */
  async portalPartner(ctx: AuthContext, exec: DbExecutor = this.db): Promise<string | null> {
    if (!ctx.roles.includes('NHA_CUNG_CAP')) return null;
    const [r] = await exec.select({ p: partnerUsers.partnerId }).from(partnerUsers).where(eq(partnerUsers.userId, ctx.user.id));
    if (!r) throw new ForbiddenException('Tài khoản chưa gắn với nhà cung cấp nào');
    return r.p;
  }

  private assertStaffCan(ctx: AuthContext, perm: 'NGUON_CUNG_XEM' | 'NGUON_CUNG_QUAN_LY') {
    if (!ctx.permissions.includes(perm)) throw new ForbiddenException('Bạn không có quyền với hồ sơ nguồn cung');
  }

  /** Nhà cung cấp phải có vai nhà cung cấp và đã qua thẩm định mới được lập hồ sơ vùng trồng. */
  private async supplier(partnerId: string, exec: DbExecutor, forWrite: boolean) {
    const [p] = await exec.select().from(partners).where(eq(partners.id, partnerId));
    if (!p) throw new NotFoundException('Không tìm thấy nhà cung cấp');
    const [role] = await exec.select().from(partnerRoles).where(and(eq(partnerRoles.partnerId, partnerId), eq(partnerRoles.role, 'nha_cung_cap')));
    if (!role) throw new BadRequestException('Đối tác này không có vai nhà cung cấp');
    if (forWrite && p.kycStatus !== 'dat') throw new BadRequestException('Nhà cung cấp chưa được duyệt thẩm định nên chưa thêm được hồ sơ vùng trồng');
    return p;
  }

  // ---------- Đọc ----------

  /** Danh sách nhà cung cấp kèm số hộ, vùng, thửa, diện tích. */
  async overview(ctx: AuthContext) {
    this.assertStaffCan(ctx, 'NGUON_CUNG_XEM');
    const rows = await this.db.execute<{
      id: string; code: string; name: string; kyc_status: string; ho: number; vung: number; thua: number; da_giac: number; dien_tich_ha: number; canh_bao: number;
    }>(sql`
      select p.id, p.code, p.name, p.kyc_status,
        (select count(*) from farmers f where f.supplier_partner_id = p.id and f.voided_at is null)::int as ho,
        (select count(*) from growing_areas a where a.supplier_partner_id = p.id and a.active)::int as vung,
        (select count(*) from plots t where t.supplier_partner_id = p.id and t.voided_at is null)::int as thua,
        (select count(*) from plots t where t.supplier_partner_id = p.id and t.voided_at is null and t.geometry_type = 'da_giac')::int as da_giac,
        coalesce((select sum(t.area_ha) from plots t where t.supplier_partner_id = p.id and t.voided_at is null), 0)::float8 as dien_tich_ha,
        (select count(*) from plots t where t.supplier_partner_id = p.id and t.voided_at is null and jsonb_array_length(t.warnings) > 0)::int as canh_bao
      from partners p
      where exists (select 1 from partner_roles r where r.partner_id = p.id and r.role = 'nha_cung_cap')
      order by p.name`);
    return rows.rows.map((r) => ({
      id: r.id, code: r.code, name: r.name, kycStatus: r.kyc_status, soHo: r.ho, soVung: r.vung, soThua: r.thua, soDaGiac: r.da_giac,
      dienTichHa: Math.round(r.dien_tich_ha * 100) / 100, soCanhBao: r.canh_bao,
    }));
  }

  async detailForStaff(partnerId: string, ctx: AuthContext) {
    this.assertStaffCan(ctx, 'NGUON_CUNG_XEM');
    return this.detail(partnerId, ctx.permissions.includes('NGUON_CUNG_QUAN_LY'));
  }

  async detailForPortal(ctx: AuthContext) {
    const partnerId = await this.portalPartner(ctx);
    if (!partnerId) throw new ForbiddenException('Trang này dành cho nhà cung cấp');
    return this.detail(partnerId, true);
  }

  private async detail(partnerId: string, canEdit: boolean) {
    const p = await this.supplier(partnerId, this.db, false);
    const areas = await this.db.select().from(growingAreas).where(eq(growingAreas.supplierPartnerId, partnerId)).orderBy(asc(growingAreas.code));
    const fs = await this.db.select().from(farmers).where(eq(farmers.supplierPartnerId, partnerId)).orderBy(asc(farmers.code));
    const ps = await this.db.select().from(plots).where(eq(plots.supplierPartnerId, partnerId)).orderBy(asc(plots.code));
    const certs = await this.db
      .select()
      .from(partnerDocuments)
      .where(and(eq(partnerDocuments.partnerId, partnerId), isNull(partnerDocuments.voidedAt)))
      .orderBy(asc(partnerDocuments.docType));
    return {
      nhaCungCap: { id: p.id, code: p.code, name: p.name, country: p.country, kycStatus: p.kycStatus },
      duocSua: canEdit && p.kycStatus === 'dat',
      vung: areas.map((a) => ({
        ...a,
        chungNhan: certs.filter((c) => c.growingAreaId === a.id).map((c) => ({ id: c.id, docType: c.docType, number: c.number, expiresOn: c.expiresOn })),
      })),
      chungNhanChung: certs.filter((c) => !c.growingAreaId).map((c) => ({ id: c.id, docType: c.docType, number: c.number, expiresOn: c.expiresOn })),
      ho: fs.map((f) => ({
        id: f.id, code: f.code, fullName: f.fullName, cccd: maskIdNumber(f.idNumberLast4), coCccd: !!f.idNumberEnc, phone: f.phone,
        commune: f.commune, district: f.district, province: f.province, joinedOn: f.joinedOn, consentOn: f.consentOn,
        source: f.source, voidedAt: f.voidedAt, voidReason: f.voidReason,
      })),
      thua: ps.map((t) => this.presentPlot(t)),
    };
  }

  private presentPlot(t: typeof plots.$inferSelect) {
    const g = t.geometry as PlotGeometry;
    const [lon, lat] = centroid(g);
    return {
      id: t.id, code: t.code, farmerId: t.farmerId, growingAreaId: t.growingAreaId, kind: t.kind, crop: t.crop, plantedYear: t.plantedYear,
      geometry: g, geometryType: t.geometryType, declaredAreaHa: t.declaredAreaHa, measuredAreaHa: t.measuredAreaHa, areaHa: t.areaHa,
      gpsAccuracyM: t.gpsAccuracyM, landDocType: t.landDocType, landDocNumber: t.landDocNumber, warnings: t.warnings as string[],
      source: t.source, forestStatus: t.forestStatus, tam: { lat, lon }, voidedAt: t.voidedAt, voidReason: t.voidReason, createdAt: t.createdAt, updatedAt: t.updatedAt,
    };
  }

  /** Xem đầy đủ số CCCD: chỉ người có quyền, và mỗi lần xem đều ghi nhật ký. */
  async revealIdNumber(farmerId: string, ctx: AuthContext, ip: string | null) {
    if (!ctx.permissions.includes('NGUON_CUNG_XEM_CCCD')) throw new ForbiddenException('Bạn không được xem đầy đủ số CCCD');
    const [f] = await this.db.select().from(farmers).where(eq(farmers.id, farmerId));
    if (!f) throw new NotFoundException('Không tìm thấy nông hộ');
    if (!f.idNumberEnc) return { cccd: null };
    await this.audit.record({ actorUserId: ctx.user.id, action: 'nguon_cung.xem_cccd', entityType: 'farmer', entityId: f.id, ip, detail: { ho: f.code } });
    return { cccd: decrypt(f.idNumberEnc, this.key) };
  }

  /** GeoJSON các thửa còn hiệu lực của một nhà cung cấp (có thể lọc theo vùng), dùng cho hồ sơ EUDR. */
  async geojson(partnerId: string, areaId: string | undefined, ctx: AuthContext) {
    const portal = await this.portalPartner(ctx);
    if (portal) {
      if (portal !== partnerId) throw new ForbiddenException('Chỉ tải được dữ liệu của quý công ty');
    } else this.assertStaffCan(ctx, 'NGUON_CUNG_XEM');
    const rows = await this.db
      .select({ t: plots, farmerCode: farmers.code, areaCode: growingAreas.code })
      .from(plots)
      .innerJoin(farmers, eq(farmers.id, plots.farmerId))
      .innerJoin(growingAreas, eq(growingAreas.id, plots.growingAreaId))
      .where(and(eq(plots.supplierPartnerId, partnerId), isNull(plots.voidedAt), areaId ? eq(plots.growingAreaId, areaId) : undefined))
      .orderBy(asc(plots.code));
    return toFeatureCollection(
      rows.map((r) => ({ code: r.t.code, farmerCode: r.farmerCode, areaCode: r.areaCode, kind: r.t.kind, areaHa: r.t.areaHa, crop: r.t.crop, geometry: r.t.geometry as PlotGeometry })),
    );
  }

  // ---------- Ghi: vùng trồng (chỉ nhân viên) ----------

  async createArea(partnerId: string, input: AreaInput, ctx: AuthContext, ip: string | null) {
    this.assertStaffCan(ctx, 'NGUON_CUNG_QUAN_LY');
    return this.db.transaction(async (tx) => {
      const p = await this.supplier(partnerId, tx, true);
      await tx.execute(sql`select id from partners where id = ${partnerId} for update`);
      const [{ n }] = (await tx.execute<{ n: number }>(sql`select count(*)::int as n from growing_areas where supplier_partner_id = ${partnerId}`)).rows;
      const code = `${p.code}-V${String(n + 1).padStart(2, '0')}`;
      const [a] = await tx
        .insert(growingAreas)
        .values({
          supplierPartnerId: partnerId, code, name: input.name.trim(), kind: input.kind, sector: input.sector,
          officialCode: input.officialCode?.trim() || null, officialCodeIssuer: input.officialCodeIssuer?.trim() || null,
          commune: input.commune?.trim() || null, district: input.district?.trim() || null, province: input.province.trim(), note: input.note?.trim() || null,
          createdBy: ctx.user.id,
        })
        .returning();
      await this.audit.record({ actorUserId: ctx.user.id, action: 'nguon_cung.tao_vung', entityType: 'growing_area', entityId: a.id, ip, detail: { ma: code, ten: a.name, maSoChinhThuc: a.officialCode } }, tx);
      return { id: a.id, code };
    });
  }

  // ---------- Ghi: nông hộ ----------

  /** Nhân viên ghi cho một nhà cung cấp; nhà cung cấp ghi cho chính mình qua cổng. */
  private async writerPartner(partnerIdFromStaff: string | null, ctx: AuthContext, exec: DbExecutor): Promise<{ partnerId: string; source: Source }> {
    const portal = await this.portalPartner(ctx, exec);
    if (portal) return { partnerId: portal, source: 'cong_ncc' };
    this.assertStaffCan(ctx, 'NGUON_CUNG_QUAN_LY');
    if (!partnerIdFromStaff) throw new BadRequestException('Thiếu nhà cung cấp');
    return { partnerId: partnerIdFromStaff, source: 'noi_bo' };
  }

  async createFarmer(partnerIdFromStaff: string | null, input: FarmerInput, ctx: AuthContext, ip: string | null) {
    const idNumber = input.idNumber ? rule(() => normalizeIdNumber(input.idNumber!)) : null;
    return this.db.transaction(async (tx) => {
      const { partnerId, source } = await this.writerPartner(partnerIdFromStaff, ctx, tx);
      const p = await this.supplier(partnerId, tx, true);
      await tx.execute(sql`select id from partners where id = ${partnerId} for update`);
      const hash = idNumber ? this.idHash(idNumber) : null;
      const canhBao: string[] = [];
      if (hash) {
        const same = await tx
          .select({ code: farmers.code, supplier: farmers.supplierPartnerId })
          .from(farmers)
          .where(and(eq(farmers.idNumberHash, hash), isNull(farmers.voidedAt)));
        if (same.some((s) => s.supplier === partnerId)) throw new ConflictException(`Hộ có số CCCD này đã có trong danh sách (${same.find((s) => s.supplier === partnerId)!.code})`);
        // Một hộ có thể bán cho hai HTX; vẫn cho ghi nhưng báo để kiểm tra sản lượng không bị tính hai lần.
        if (same.length) canhBao.push('Hộ này đã là thành viên của một nhà cung cấp khác');
      }
      const [{ n }] = (await tx.execute<{ n: number }>(sql`select count(*)::int as n from farmers where supplier_partner_id = ${partnerId}`)).rows;
      const code = `${p.code}-H${String(n + 1).padStart(3, '0')}`;
      const [f] = await tx
        .insert(farmers)
        .values({
          supplierPartnerId: partnerId, code, fullName: input.fullName.trim(),
          idNumberEnc: idNumber ? encrypt(idNumber, this.key) : null, idNumberHash: hash, idNumberLast4: idNumber ? idNumber.slice(-4) : null,
          phone: input.phone?.trim() || null, commune: input.commune?.trim() || null, district: input.district?.trim() || null, province: input.province.trim(),
          joinedOn: input.joinedOn ?? null, consentOn: input.consentOn, source, createdBy: ctx.user.id,
        })
        .returning();
      await this.audit.record(
        { actorUserId: ctx.user.id, action: 'nguon_cung.tao_ho', entityType: 'farmer', entityId: f.id, ip, detail: { ma: code, nhaCungCap: p.code, nguon: source, coCccd: !!idNumber } },
        tx,
      );
      return { id: f.id, code, canhBao };
    });
  }

  // ---------- Ghi: thửa / ao ----------

  private async siblings(exec: DbExecutor, excludeId?: string) {
    // Chồng lấn được kiểm tra với thửa của mọi nhà cung cấp: một mảnh đất không được khai hai lần.
    const rows = await exec
      .select({ id: plots.id, code: plots.code, geometry: plots.geometry })
      .from(plots)
      .where(and(isNull(plots.voidedAt), excludeId ? ne(plots.id, excludeId) : undefined));
    return rows.map((r) => ({ id: r.id, code: r.code, geometry: r.geometry as PlotGeometry }));
  }

  private evaluate(raw: unknown, declaredAreaHa: number | null | undefined, inVietnam: boolean) {
    const geometry = rule(() => normalizeGeometry(raw, { inVietnam }));
    const check = checkPlot(geometry, declaredAreaHa);
    if (check.errors.length) throw new BadRequestException({ message: check.errors.join('; '), loi: check.errors.map((lyDo) => ({ truong: 'toaDo', lyDo })) });
    return { geometry, check };
  }

  async createPlot(partnerIdFromStaff: string | null, input: PlotInput, ctx: AuthContext, ip: string | null, sourceOverride?: Source) {
    return this.db.transaction(async (tx) => this.insertPlot(tx, partnerIdFromStaff, input, ctx, ip, sourceOverride));
  }

  private async insertPlot(tx: DbExecutor, partnerIdFromStaff: string | null, input: PlotInput, ctx: AuthContext, ip: string | null, sourceOverride?: Source) {
    const { partnerId, source } = await this.writerPartner(partnerIdFromStaff, ctx, tx);
    const p = await this.supplier(partnerId, tx, true);
    const [farmer] = await tx.select().from(farmers).where(eq(farmers.id, input.farmerId));
    if (!farmer || farmer.supplierPartnerId !== partnerId) throw new BadRequestException('Nông hộ không thuộc nhà cung cấp này');
    if (farmer.voidedAt) throw new BadRequestException('Nông hộ đã bị huỷ');
    const [area] = await tx.select().from(growingAreas).where(eq(growingAreas.id, input.growingAreaId)).for('update');
    if (!area || area.supplierPartnerId !== partnerId) throw new BadRequestException('Vùng không thuộc nhà cung cấp này');
    if (!area.active) throw new BadRequestException('Vùng đã ngừng sử dụng');
    if ((input.kind === 'ao') !== (area.kind === 'vung_nuoi')) throw new BadRequestException(input.kind === 'ao' ? 'Ao nuôi phải thuộc một vùng nuôi' : 'Thửa đất phải thuộc một vùng trồng');

    const { geometry, check } = this.evaluate(input.geometry, input.declaredAreaHa, p.country === 'VN');
    const overlap = findOverlaps(geometry, await this.siblings(tx));
    const warnings = [...check.warnings, ...overlap.map((c) => `Chồng lấn hoặc trùng chỗ với thửa ${c}`)];

    const [{ n }] = (await tx.execute<{ n: number }>(sql`select count(*)::int as n from plots where growing_area_id = ${area.id}`)).rows;
    const code = `${area.code}-${String(n + 1).padStart(3, '0')}`;
    const [t] = await tx
      .insert(plots)
      .values({
        code, supplierPartnerId: partnerId, farmerId: farmer.id, growingAreaId: area.id, kind: input.kind, crop: input.crop?.trim() || null,
        plantedYear: input.plantedYear ?? null, geometry, geometryType: geometry.type === 'Point' ? 'diem' : 'da_giac',
        declaredAreaHa: input.declaredAreaHa ?? null, measuredAreaHa: check.measuredAreaHa, areaHa: check.areaHa, gpsAccuracyM: input.gpsAccuracyM ?? null,
        landDocType: input.landDocType?.trim() || null, landDocNumber: input.landDocNumber?.trim() || null, warnings, source: sourceOverride ?? source, createdBy: ctx.user.id,
      })
      .returning();
    await this.audit.record(
      { actorUserId: ctx.user.id, action: 'nguon_cung.tao_thua', entityType: 'plot', entityId: t.id, ip, detail: { ma: code, ho: farmer.code, dienTichHa: check.areaHa, toaDo: geometry, canhBao: warnings } },
      tx,
    );
    return { id: t.id, code, dienTichHa: check.areaHa, canhBao: warnings };
  }

  /** Sửa tọa độ (đo lại ranh giới). Tọa độ cũ được giữ trong nhật ký. */
  async updateGeometry(plotId: string, input: { geometry: unknown; declaredAreaHa?: number | null; gpsAccuracyM?: number | null; lyDo: string }, ctx: AuthContext, ip: string | null) {
    return this.db.transaction(async (tx) => {
      const [t] = await tx.select().from(plots).where(eq(plots.id, plotId)).for('update');
      if (!t) throw new NotFoundException('Không tìm thấy thửa');
      const { partnerId } = await this.writerPartner(t.supplierPartnerId, ctx, tx);
      if (partnerId !== t.supplierPartnerId) throw new ForbiddenException('Thửa này không thuộc quý công ty');
      if (t.voidedAt) throw new BadRequestException('Thửa đã bị huỷ');
      const p = await this.supplier(partnerId, tx, true);
      const declared = input.declaredAreaHa === undefined ? t.declaredAreaHa : input.declaredAreaHa;
      const { geometry, check } = this.evaluate(input.geometry, declared, p.country === 'VN');
      const overlap = findOverlaps(geometry, await this.siblings(tx, t.id));
      const warnings = [...check.warnings, ...overlap.map((c) => `Chồng lấn hoặc trùng chỗ với thửa ${c}`)];
      await tx
        .update(plots)
        .set({
          geometry, geometryType: geometry.type === 'Point' ? 'diem' : 'da_giac', declaredAreaHa: declared, measuredAreaHa: check.measuredAreaHa, areaHa: check.areaHa,
          gpsAccuracyM: input.gpsAccuracyM ?? null, warnings, updatedAt: new Date(),
          // Đo lại thì kết quả kiểm tra rừng cũ không còn khớp tọa độ
          forestStatus: 'chua_kiem',
        })
        .where(eq(plots.id, plotId));
      await tx.update(plotForestChecks).set({ status: 'het_hieu_luc' }).where(and(eq(plotForestChecks.plotId, plotId), eq(plotForestChecks.status, 'cho_duyet')));
      await this.audit.record(
        {
          actorUserId: ctx.user.id, action: 'nguon_cung.sua_toa_do', entityType: 'plot', entityId: t.id, ip,
          detail: { ma: t.code, lyDo: input.lyDo, truoc: { toaDo: t.geometry, dienTichHa: t.areaHa }, sau: { toaDo: geometry, dienTichHa: check.areaHa } },
        },
        tx,
      );
      return { dienTichHa: check.areaHa, canhBao: warnings };
    });
  }

  /**
   * Nhập nhiều thửa từ tệp GeoJSON (xuất từ ứng dụng đo đạc). Mỗi đối tượng cần thuộc tính `maHo`
   * (mã hộ trong phần mềm). Có một dòng lỗi thì không ghi dòng nào, và trả về đủ các dòng lỗi.
   */
  async importGeojson(partnerIdFromStaff: string | null, input: { growingAreaId: string; kind: PlotKind; crop?: string | null; features: unknown[] }, ctx: AuthContext, ip: string | null) {
    if (input.features.length === 0) throw new BadRequestException('Tệp không có thửa nào');
    if (input.features.length > 1000) throw new BadRequestException('Mỗi lần nhập tối đa 1.000 thửa');
    return this.db.transaction(async (tx) => {
      const { partnerId } = await this.writerPartner(partnerIdFromStaff, ctx, tx);
      const fs = await tx.select({ id: farmers.id, code: farmers.code }).from(farmers).where(and(eq(farmers.supplierPartnerId, partnerId), isNull(farmers.voidedAt)));
      const byCode = new Map(fs.map((f) => [f.code.toUpperCase(), f.id]));
      const errors: { dong: number; lyDo: string }[] = [];
      const created: { code: string; canhBao: string[] }[] = [];
      for (const [i, raw] of input.features.entries()) {
        const f = raw as { geometry?: unknown; properties?: Record<string, unknown> };
        const props = f?.properties ?? {};
        const maHo = String(props.maHo ?? props.ma_ho ?? '').trim().toUpperCase();
        const farmerId = byCode.get(maHo);
        if (!farmerId) {
          errors.push({ dong: i + 1, lyDo: maHo ? `Không có hộ mã ${maHo}` : 'Thiếu thuộc tính maHo' });
          continue;
        }
        const area = Number(props.dienTichHa ?? props.Area ?? NaN);
        try {
          const r = await tx.transaction(async (sp) =>
            this.insertPlot(
              sp,
              partnerId,
              {
                farmerId, growingAreaId: input.growingAreaId, kind: input.kind, crop: (props.cayTrong as string) ?? input.crop ?? null,
                geometry: f.geometry, declaredAreaHa: Number.isFinite(area) && area > 0 ? area : null,
              },
              ctx,
              ip,
              'nhap_tep',
            ),
          );
          created.push({ code: r.code, canhBao: r.canhBao });
        } catch (e) {
          const msg = e instanceof BadRequestException ? ((e.getResponse() as { message?: string }).message ?? e.message) : (e as Error).message;
          errors.push({ dong: i + 1, lyDo: String(msg) });
        }
      }
      if (errors.length) throw new BadRequestException({ message: `Có ${errors.length} thửa không hợp lệ, chưa nhập thửa nào`, loi: errors.map((e) => ({ truong: `dong ${e.dong}`, lyDo: e.lyDo })) });
      return { soThua: created.length, thua: created };
    });
  }

  // ---------- Huỷ ----------

  async voidFarmer(farmerId: string, lyDo: string, ctx: AuthContext, ip: string | null) {
    this.assertStaffCan(ctx, 'NGUON_CUNG_QUAN_LY');
    await this.db.transaction(async (tx) => {
      const [f] = await tx.select().from(farmers).where(eq(farmers.id, farmerId)).for('update');
      if (!f) throw new NotFoundException('Không tìm thấy nông hộ');
      if (f.voidedAt) throw new BadRequestException('Nông hộ đã bị huỷ');
      const [{ n }] = (await tx.execute<{ n: number }>(sql`select count(*)::int as n from plots where farmer_id = ${farmerId} and voided_at is null`)).rows;
      if (n > 0) throw new BadRequestException(`Hộ còn ${n} thửa đang dùng; huỷ các thửa trước`);
      await tx.update(farmers).set({ voidedAt: new Date(), voidedBy: ctx.user.id, voidReason: lyDo }).where(eq(farmers.id, farmerId));
      await this.audit.record({ actorUserId: ctx.user.id, action: 'nguon_cung.huy_ho', entityType: 'farmer', entityId: farmerId, ip, detail: { ma: f.code, lyDo } }, tx);
    });
  }

  async voidPlot(plotId: string, lyDo: string, ctx: AuthContext, ip: string | null) {
    this.assertStaffCan(ctx, 'NGUON_CUNG_QUAN_LY');
    await this.db.transaction(async (tx) => {
      const [t] = await tx.select().from(plots).where(eq(plots.id, plotId)).for('update');
      if (!t) throw new NotFoundException('Không tìm thấy thửa');
      if (t.voidedAt) throw new BadRequestException('Thửa đã bị huỷ');
      await tx.update(plots).set({ voidedAt: new Date(), voidedBy: ctx.user.id, voidReason: lyDo }).where(eq(plots.id, plotId));
      await this.audit.record({ actorUserId: ctx.user.id, action: 'nguon_cung.huy_thua', entityType: 'plot', entityId: plotId, ip, detail: { ma: t.code, lyDo } }, tx);
    });
  }

  /** Nhà cung cấp của một vùng (để kiểm tra phạm vi chứng nhận khi thêm giấy tờ đối tác). */
  async areaPartner(areaId: string, exec: DbExecutor = this.db): Promise<string | null> {
    const [a] = await exec.select({ p: growingAreas.supplierPartnerId }).from(growingAreas).where(eq(growingAreas.id, areaId));
    return a?.p ?? null;
  }
}

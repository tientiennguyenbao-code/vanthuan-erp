import { BadRequestException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, asc, desc, eq, isNull, sql } from 'drizzle-orm';
import { AuditService } from '../audit/audit.service';
import type { AuthContext } from '../auth/auth.types';
import { DB, Db, DbExecutor } from '../db/db';
import { catchTrips, collectionSlips, fishingVessels, partners } from '../db/schema';
import { iuuIssues, simpIssues } from './catch.rules';
import { SourcingService } from './sourcing.service';

export interface VesselInput {
  partnerId: string | null;
  registrationNo: string;
  name: string | null;
  ownerName: string;
  flag: string;
  lengthM: number | null;
  gear: string;
  licenseNo: string | null;
  licenseValidUntil: string | null;
  hasVms: boolean;
  note: string | null;
}
export interface TripInput {
  vesselId: string;
  departedOn: string;
  landedOn: string;
  landingPort: string;
  fishingArea: string;
  species: string;
  catchKg: number;
  certificateNo: string | null;
  certificateIssuer: string | null;
  certificateDate: string | null;
  note: string | null;
}

const today = () => new Date().toISOString().slice(0, 10);
const r2 = (n: number) => Math.round(n * 100) / 100;

/** Tàu cá và chuyến khai thác của nhà cung cấp thủy sản khai thác: HTX/công ty ghi trên cổng, nhân viên thu mua ghi hoặc huỷ. */
@Injectable()
export class CatchService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly audit: AuditService,
    private readonly sourcing: SourcingService,
  ) {}

  private async scope(partnerId: string | null, ctx: AuthContext, write: boolean, exec: DbExecutor): Promise<{ partnerId: string; source: 'noi_bo' | 'cong_ncc' }> {
    const own = await this.sourcing.portalPartner(ctx, exec);
    if (own) {
      if (partnerId && partnerId !== own) throw new NotFoundException('Không tìm thấy tàu');
      return { partnerId: own, source: 'cong_ncc' };
    }
    if (!partnerId) throw new BadRequestException('Chọn nhà cung cấp');
    if (!ctx.permissions.includes(write ? 'NGUON_CUNG_QUAN_LY' : 'NGUON_CUNG_XEM')) throw new ForbiddenException('Bạn không có quyền với tàu và chuyến khai thác');
    return { partnerId, source: 'noi_bo' };
  }

  async list(partnerIdArg: string | null, ctx: AuthContext) {
    const { partnerId, source } = await this.scope(partnerIdArg, ctx, false, this.db);
    const tau = await this.db.select().from(fishingVessels).where(eq(fishingVessels.supplierPartnerId, partnerId)).orderBy(asc(fishingVessels.registrationNo));
    const rows = await this.db
      .select({
        t: catchTrips,
        v: fishingVessels,
        usedKg: sql<number>`coalesce((select sum(s.quantity_kg) from collection_slips s where s.catch_trip_id = "catch_trips"."id" and s.voided_at is null), 0)::float8`,
      })
      .from(catchTrips)
      .innerJoin(fishingVessels, eq(fishingVessels.id, catchTrips.vesselId))
      .where(eq(catchTrips.supplierPartnerId, partnerId))
      .orderBy(desc(catchTrips.landedOn), desc(catchTrips.createdAt));
    const canWrite = source === 'cong_ncc' || ctx.permissions.includes('NGUON_CUNG_QUAN_LY');
    return {
      duocGhi: canWrite,
      tau: tau.map((v) => ({
        id: v.id, soDangKy: v.registrationNo, ten: v.name, chuTau: v.ownerName, quocTich: v.flag, daiM: v.lengthM, nghe: v.gear,
        giayPhep: v.licenseNo, giayPhepDen: v.licenseValidUntil, coVms: v.hasVms, ghiChu: v.note, huyLuc: v.voidedAt, lyDoHuy: v.voidReason,
      })),
      chuyen: rows.map((r) => {
        const facts = { code: r.t.code, landedOn: r.t.landedOn, certificateNo: r.t.certificateNo, vessel: { registrationNo: r.v.registrationNo, lengthM: r.v.lengthM, hasVms: r.v.hasVms, licenseNo: r.v.licenseNo, licenseValidUntil: r.v.licenseValidUntil } };
        return {
          id: r.t.id, ma: r.t.code, tauId: r.v.id, soDangKy: r.v.registrationNo, ngayDi: r.t.departedOn, ngayCap: r.t.landedOn, cang: r.t.landingPort,
          vungKhaiThac: r.t.fishingArea, loai: r.t.species, sanLuongKg: r.t.catchKg, daThuKg: r2(r.usedKg), conLaiKg: r2(Math.max(r.t.catchKg - r.usedKg, 0)),
          giayKhaiThac: r.t.certificateNo, noiCapGiay: r.t.certificateIssuer, ngayCapGiay: r.t.certificateDate, ghiChu: r.t.note,
          thieuIuu: iuuIssues(facts), thieuSimp: simpIssues(facts), huyLuc: r.t.voidedAt, lyDoHuy: r.t.voidReason,
          duocHuy: canWrite && !r.t.voidedAt && r.usedKg === 0,
        };
      }),
    };
  }

  async createVessel(input: VesselInput, ctx: AuthContext, ip: string | null) {
    if (input.licenseValidUntil && input.licenseValidUntil < today()) throw new BadRequestException('Giấy phép khai thác đã hết hạn');
    return this.db.transaction(async (tx) => {
      const { partnerId, source } = await this.scope(input.partnerId, ctx, true, tx);
      const reg = input.registrationNo.trim().toUpperCase();
      const [dup] = await tx.select({ id: fishingVessels.id }).from(fishingVessels).where(and(eq(fishingVessels.supplierPartnerId, partnerId), eq(fishingVessels.registrationNo, reg), isNull(fishingVessels.voidedAt)));
      if (dup) throw new BadRequestException(`Tàu ${reg} đã có trong danh sách`);
      const [row] = await tx
        .insert(fishingVessels)
        .values({
          supplierPartnerId: partnerId, registrationNo: reg, name: input.name, ownerName: input.ownerName, flag: input.flag, lengthM: input.lengthM, gear: input.gear,
          licenseNo: input.licenseNo, licenseValidUntil: input.licenseValidUntil, hasVms: input.hasVms, note: input.note, source, createdBy: ctx.user.id,
        })
        .returning({ id: fishingVessels.id });
      await this.audit.record({ actorUserId: ctx.user.id, action: 'nguon_cung.ghi_tau', entityType: 'fishing_vessel', entityId: row.id, ip, detail: { soDangKy: reg, giayPhep: input.licenseNo, nguon: source } }, tx);
      return { id: row.id };
    });
  }

  async voidVessel(id: string, reason: string, ctx: AuthContext, ip: string | null) {
    await this.db.transaction(async (tx) => {
      const [v] = await tx.select().from(fishingVessels).where(eq(fishingVessels.id, id)).for('update');
      if (!v) throw new NotFoundException('Không tìm thấy tàu');
      await this.scope(v.supplierPartnerId, ctx, true, tx);
      if (v.voidedAt) throw new BadRequestException('Tàu đã huỷ khỏi danh sách');
      await tx.update(fishingVessels).set({ voidedAt: new Date(), voidedBy: ctx.user.id, voidReason: reason }).where(eq(fishingVessels.id, id));
      await this.audit.record({ actorUserId: ctx.user.id, action: 'nguon_cung.huy_tau', entityType: 'fishing_vessel', entityId: id, ip, detail: { soDangKy: v.registrationNo, lyDo: reason } }, tx);
    });
  }

  async createTrip(input: TripInput, ctx: AuthContext, ip: string | null) {
    if (input.landedOn > today()) throw new BadRequestException('Ngày cập cảng không được sau hôm nay');
    if (input.departedOn > input.landedOn) throw new BadRequestException('Ngày đi phải trước hoặc bằng ngày cập cảng');
    if (input.certificateDate && input.certificateDate < input.landedOn) throw new BadRequestException('Giấy khai thác cấp sau khi tàu cập cảng');
    return this.db.transaction(async (tx) => {
      const [v] = await tx.select().from(fishingVessels).where(eq(fishingVessels.id, input.vesselId)).for('update');
      if (!v) throw new NotFoundException('Không tìm thấy tàu');
      const { source } = await this.scope(v.supplierPartnerId, ctx, true, tx);
      if (v.voidedAt) throw new BadRequestException('Tàu đã huỷ khỏi danh sách');
      await tx.execute(sql`select id from partners where id = ${v.supplierPartnerId} for update`);
      const [p] = await tx.select({ code: partners.code }).from(partners).where(eq(partners.id, v.supplierPartnerId));
      const [{ n }] = await tx.select({ n: sql<number>`count(*)::int` }).from(catchTrips).where(eq(catchTrips.supplierPartnerId, v.supplierPartnerId));
      const code = `${p.code}-CH${String(n + 1).padStart(3, '0')}`;
      const [row] = await tx
        .insert(catchTrips)
        .values({
          code, vesselId: v.id, supplierPartnerId: v.supplierPartnerId, departedOn: input.departedOn, landedOn: input.landedOn, landingPort: input.landingPort,
          fishingArea: input.fishingArea, species: input.species, catchKg: r2(input.catchKg), certificateNo: input.certificateNo, certificateIssuer: input.certificateIssuer,
          certificateDate: input.certificateDate, note: input.note, source, createdBy: ctx.user.id,
        })
        .returning({ id: catchTrips.id });
      await this.audit.record(
        { actorUserId: ctx.user.id, action: 'nguon_cung.ghi_chuyen_khai_thac', entityType: 'catch_trip', entityId: row.id, ip, detail: { ma: code, tau: v.registrationNo, capCang: input.landedOn, kg: input.catchKg, giayKhaiThac: input.certificateNo, nguon: source } },
        tx,
      );
      return { id: row.id, code };
    });
  }

  /** Huỷ chuyến ghi sai, khi chưa có phiếu thu gom nào lấy hàng từ chuyến. */
  async voidTrip(id: string, reason: string, ctx: AuthContext, ip: string | null) {
    await this.db.transaction(async (tx) => {
      const [t] = await tx.select().from(catchTrips).where(eq(catchTrips.id, id)).for('update');
      if (!t) throw new NotFoundException('Không tìm thấy chuyến');
      await this.scope(t.supplierPartnerId, ctx, true, tx);
      if (t.voidedAt) throw new BadRequestException('Chuyến đã huỷ');
      const [used] = await tx.select({ id: collectionSlips.id }).from(collectionSlips).where(and(eq(collectionSlips.catchTripId, id), isNull(collectionSlips.voidedAt))).limit(1);
      if (used) throw new BadRequestException('Chuyến đã có phiếu thu gom; huỷ phiếu trước');
      await tx.update(catchTrips).set({ voidedAt: new Date(), voidedBy: ctx.user.id, voidReason: reason }).where(eq(catchTrips.id, id));
      await this.audit.record({ actorUserId: ctx.user.id, action: 'nguon_cung.huy_chuyen_khai_thac', entityType: 'catch_trip', entityId: id, ip, detail: { ma: t.code, lyDo: reason } }, tx);
    });
  }
}

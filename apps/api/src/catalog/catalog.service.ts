import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, asc, eq, isNull } from 'drizzle-orm';
import { AuditService } from '../audit/audit.service';
import { DB, Db } from '../db/db';
import { commodities, facilities, facilityCodes, partners } from '../db/schema';

export interface CommodityInput {
  code: string;
  name: string;
  sector: string;
  hsCode?: string | null;
  specFields: string[];
}

export interface FacilityInput {
  name: string;
  kind: string;
  ownership: string;
  partnerId?: string | null;
  address?: string | null;
  capacityKg?: number | null;
  certifications?: string | null;
}

@Injectable()
export class CatalogService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly audit: AuditService,
  ) {}

  listCommodities() {
    return this.db.select().from(commodities).orderBy(asc(commodities.sector), asc(commodities.name));
  }

  async createCommodity(input: CommodityInput, actorId: string, ip: string | null) {
    try {
      return await this.db.transaction(async (tx) => {
        const [c] = await tx
          .insert(commodities)
          .values({ ...input, code: input.code.toUpperCase(), hsCode: input.hsCode ?? null })
          .returning({ id: commodities.id });
        await this.audit.record({ actorUserId: actorId, action: 'danh_muc.tao_mat_hang', entityType: 'commodity', entityId: c.id, ip, detail: { ...input } }, tx);
        return { id: c.id };
      });
    } catch (err) {
      const e = err as { code?: string; cause?: { code?: string } };
      if (e.code === '23505' || e.cause?.code === '23505') throw new ConflictException('Mã mặt hàng đã tồn tại');
      throw err;
    }
  }

  async setCommodityActive(id: string, active: boolean, actorId: string, ip: string | null) {
    await this.db.transaction(async (tx) => {
      const [c] = await tx.update(commodities).set({ active }).where(eq(commodities.id, id)).returning({ id: commodities.id });
      if (!c) throw new NotFoundException('Không tìm thấy mặt hàng');
      await this.audit.record({ actorUserId: actorId, action: active ? 'danh_muc.mo_mat_hang' : 'danh_muc.ngung_mat_hang', entityType: 'commodity', entityId: id, ip }, tx);
    });
  }

  async listFacilities() {
    const rows = await this.db
      .select({ f: facilities, partnerName: partners.name })
      .from(facilities)
      .leftJoin(partners, eq(partners.id, facilities.partnerId))
      .orderBy(asc(facilities.name));
    const codes = await this.db.select().from(facilityCodes).where(isNull(facilityCodes.voidedAt)).orderBy(asc(facilityCodes.scheme));
    return rows.map((r) => ({
      ...r.f,
      partnerName: r.partnerName,
      ma: codes.filter((c) => c.facilityId === r.f.id).map((c) => ({ id: c.id, loai: c.scheme, ma: c.code, hieuLucDen: c.validUntil, ghiChu: c.note })),
    }));
  }

  /** Ghi mã đăng ký của cơ sở với nước nhập (FDA, GACC, danh sách EU). Mỗi cơ sở một mã còn dùng cho mỗi loại. */
  async addFacilityCode(facilityId: string, input: { scheme: string; code: string; validUntil: string | null; note: string | null }, actorId: string, ip: string | null) {
    return this.db.transaction(async (tx) => {
      const [f] = await tx.select().from(facilities).where(eq(facilities.id, facilityId)).for('update');
      if (!f) throw new NotFoundException('Không tìm thấy cơ sở');
      const [dup] = await tx.select({ id: facilityCodes.id }).from(facilityCodes).where(and(eq(facilityCodes.facilityId, facilityId), eq(facilityCodes.scheme, input.scheme), isNull(facilityCodes.voidedAt)));
      if (dup) throw new BadRequestException('Cơ sở đã có mã loại này; huỷ mã cũ trước khi ghi mã mới');
      const [c] = await tx.insert(facilityCodes).values({ facilityId, ...input, createdBy: actorId }).returning({ id: facilityCodes.id });
      await this.audit.record({ actorUserId: actorId, action: 'danh_muc.ghi_ma_co_so', entityType: 'facility', entityId: facilityId, ip, detail: { coSo: f.name, ...input } }, tx);
      return { id: c.id };
    });
  }

  async voidFacilityCode(id: string, reason: string, actorId: string, ip: string | null) {
    await this.db.transaction(async (tx) => {
      const [c] = await tx.select().from(facilityCodes).where(eq(facilityCodes.id, id)).for('update');
      if (!c) throw new NotFoundException('Không tìm thấy mã');
      if (c.voidedAt) throw new BadRequestException('Mã này đã huỷ');
      await tx.update(facilityCodes).set({ voidedAt: new Date(), voidedBy: actorId, voidReason: reason }).where(eq(facilityCodes.id, id));
      await this.audit.record({ actorUserId: actorId, action: 'danh_muc.huy_ma_co_so', entityType: 'facility', entityId: c.facilityId, ip, detail: { loai: c.scheme, ma: c.code, lyDo: reason } }, tx);
    });
  }

  async createFacility(input: FacilityInput, actorId: string, ip: string | null) {
    return this.db.transaction(async (tx) => {
      const [f] = await tx.insert(facilities).values(input).returning({ id: facilities.id });
      await this.audit.record({ actorUserId: actorId, action: 'danh_muc.tao_co_so', entityType: 'facility', entityId: f.id, ip, detail: { ...input } }, tx);
      return { id: f.id };
    });
  }
}

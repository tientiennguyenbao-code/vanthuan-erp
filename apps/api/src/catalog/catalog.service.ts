import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { asc, eq } from 'drizzle-orm';
import { AuditService } from '../audit/audit.service';
import { DB, Db } from '../db/db';
import { commodities, facilities, partners } from '../db/schema';

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

  listFacilities() {
    return this.db
      .select({ f: facilities, partnerName: partners.name })
      .from(facilities)
      .leftJoin(partners, eq(partners.id, facilities.partnerId))
      .orderBy(asc(facilities.name))
      .then((rows) => rows.map((r) => ({ ...r.f, partnerName: r.partnerName })));
  }

  async createFacility(input: FacilityInput, actorId: string, ip: string | null) {
    return this.db.transaction(async (tx) => {
      const [f] = await tx.insert(facilities).values(input).returning({ id: facilities.id });
      await this.audit.record({ actorUserId: actorId, action: 'danh_muc.tao_co_so', entityType: 'facility', entityId: f.id, ip, detail: { ...input } }, tx);
      return { id: f.id };
    });
  }
}

import { BadRequestException, ConflictException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, asc, eq, ilike, inArray, isNull, or, sql } from 'drizzle-orm';
import { AuditService } from '../audit/audit.service';
import type { AuthContext } from '../auth/auth.types';
import { DB, Db, DbExecutor } from '../db/db';
import { partnerContacts, partnerDocuments, partnerRoles, partners, users } from '../db/schema';
import {
  addMonths,
  effectiveKycStatus,
  isExpiringWithin,
  kycValidityMonths,
  KycStatus,
  PartnerRole,
  RiskRating,
} from './partner.rules';

export interface PartnerInput {
  code: string;
  name: string;
  country: string;
  taxCode?: string | null;
  address?: string | null;
  category: string;
  roles: PartnerRole[];
  ownerUserId?: string | null;
}

export interface ContactInput {
  name: string;
  position?: string | null;
  email?: string | null;
  phone?: string | null;
  isPrimary?: boolean;
}

export interface DocumentInput {
  docType: string;
  number?: string | null;
  issuer?: string | null;
  issuedOn?: string | null;
  expiresOn?: string | null;
  note?: string | null;
}

/** Các trường định danh pháp lý: sửa sau khi đã duyệt thì phải thẩm định lại. */
const IDENTITY_FIELDS = ['name', 'country', 'taxCode'] as const;

function isUniqueViolation(err: unknown): boolean {
  const e = err as { code?: string; cause?: { code?: string } };
  return e.code === '23505' || e.cause?.code === '23505';
}

@Injectable()
export class PartnersService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly audit: AuditService,
  ) {}

  // ---------- Đọc ----------

  async list(filter: { q?: string; role?: string; kyc?: string }) {
    const conds = [];
    if (filter.q) {
      const like = `%${filter.q}%`;
      conds.push(or(ilike(partners.name, like), ilike(partners.code, like), ilike(partners.taxCode, like)));
    }
    if (filter.role) {
      conds.push(inArray(partners.id, this.db.select({ id: partnerRoles.partnerId }).from(partnerRoles).where(eq(partnerRoles.role, filter.role))));
    }
    if (filter.kyc && filter.kyc !== 'het_han') conds.push(eq(partners.kycStatus, filter.kyc));
    if (filter.kyc === 'het_han') conds.push(and(eq(partners.kycStatus, 'dat'), sql`${partners.kycExpiresAt} <= now()`));

    const rows = await this.db
      .select({
        p: partners,
        ownerName: users.fullName,
        roles: sql<string[]>`coalesce((select array_agg(r.role order by r.role) from partner_roles r where r.partner_id = ${partners.id}), '{}')`,
      })
      .from(partners)
      .leftJoin(users, eq(users.id, partners.ownerUserId))
      .where(conds.length ? and(...conds) : undefined)
      .orderBy(asc(partners.name))
      .limit(500);
    return rows.map((r) => this.present(r.p, r.roles, r.ownerName));
  }

  async get(id: string) {
    const [row] = await this.db
      .select({ p: partners, ownerName: users.fullName })
      .from(partners)
      .leftJoin(users, eq(users.id, partners.ownerUserId))
      .where(eq(partners.id, id));
    if (!row) throw new NotFoundException('Không tìm thấy đối tác');
    const roles = (await this.db.select({ role: partnerRoles.role }).from(partnerRoles).where(eq(partnerRoles.partnerId, id))).map((r) => r.role);
    const contacts = await this.db.select().from(partnerContacts).where(eq(partnerContacts.partnerId, id)).orderBy(asc(partnerContacts.name));
    const documents = await this.db
      .select()
      .from(partnerDocuments)
      .where(eq(partnerDocuments.partnerId, id))
      .orderBy(asc(partnerDocuments.docType));
    return {
      ...this.present(row.p, roles.sort(), row.ownerName),
      contacts,
      documents: documents.map((d) => ({ ...d, sapHetHan: !d.voidedAt && isExpiringWithin(d.expiresOn, 30) })),
    };
  }

  /** Tài liệu và thẩm định sắp hết hạn trong `days` ngày (kể cả đã quá hạn), để nhắc làm lại. */
  async expiring(days: number) {
    const docs = await this.db
      .select({ d: partnerDocuments, partnerName: partners.name })
      .from(partnerDocuments)
      .innerJoin(partners, eq(partners.id, partnerDocuments.partnerId))
      .where(and(isNull(partnerDocuments.voidedAt), sql`${partnerDocuments.expiresOn} is not null`))
      .orderBy(asc(partnerDocuments.expiresOn));
    const kyc = await this.db
      .select({ id: partners.id, name: partners.name, kycExpiresAt: partners.kycExpiresAt })
      .from(partners)
      .where(and(eq(partners.kycStatus, 'dat'), sql`${partners.kycExpiresAt} <= now() + make_interval(days => ${days})`))
      .orderBy(asc(partners.kycExpiresAt));
    return {
      taiLieu: docs.filter((r) => isExpiringWithin(r.d.expiresOn, days)).map((r) => ({ ...r.d, partnerName: r.partnerName })),
      thamDinh: kyc,
    };
  }

  // ---------- Ghi ----------

  async create(input: PartnerInput, ctx: AuthContext, ip: string | null) {
    const ownerUserId = this.canManageAll(ctx) ? (input.ownerUserId ?? ctx.user.id) : ctx.user.id;
    try {
      return await this.db.transaction(async (tx) => {
        const [p] = await tx
          .insert(partners)
          .values({
            code: input.code.trim().toUpperCase(),
            name: input.name.trim(),
            country: input.country.toUpperCase(),
            taxCode: input.taxCode?.trim() || null,
            address: input.address?.trim() || null,
            category: input.category,
            ownerUserId,
            createdBy: ctx.user.id,
          })
          .returning();
        await tx.insert(partnerRoles).values(input.roles.map((role) => ({ partnerId: p.id, role })));
        await this.audit.record(
          { actorUserId: ctx.user.id, action: 'doi_tac.tao', entityType: 'partner', entityId: p.id, ip, detail: { ma: p.code, ten: p.name, vai: input.roles } },
          tx,
        );
        return { id: p.id };
      });
    } catch (err) {
      if (isUniqueViolation(err)) throw new ConflictException('Mã đối tác đã tồn tại');
      throw err;
    }
  }

  async update(id: string, input: Partial<PartnerInput>, ctx: AuthContext, ip: string | null) {
    await this.db.transaction(async (tx) => {
      const p = await this.lockForEdit(id, ctx, tx);
      if (input.ownerUserId !== undefined && input.ownerUserId !== p.ownerUserId && !this.canManageAll(ctx)) {
        throw new ForbiddenException('Chỉ Trưởng phòng kinh doanh được đổi người phụ trách');
      }
      const changes: Partial<typeof partners.$inferInsert> = {};
      if (input.name !== undefined) changes.name = input.name.trim();
      if (input.country !== undefined) changes.country = input.country.toUpperCase();
      if (input.taxCode !== undefined) changes.taxCode = input.taxCode?.trim() || null;
      if (input.address !== undefined) changes.address = input.address?.trim() || null;
      if (input.category !== undefined) changes.category = input.category;
      if (input.ownerUserId !== undefined) changes.ownerUserId = input.ownerUserId;

      const before: Record<string, unknown> = {};
      const after: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(changes)) {
        const old = (p as Record<string, unknown>)[k];
        if (old !== v) {
          before[k] = old;
          after[k] = v;
        }
      }
      const identityChanged = IDENTITY_FIELDS.some((f) => f in after);
      if (identityChanged && (p.kycStatus === 'dat' || p.kycStatus === 'cho_tham_dinh')) {
        // Đổi tên, quốc gia hay mã số thuế thì kết quả thẩm định cũ không còn giá trị.
        Object.assign(changes, { kycStatus: 'nhap', kycApprovedBy: null, kycApprovedAt: null, kycExpiresAt: null });
        after.kycStatus = 'nhap';
      }
      if (Object.keys(after).length) {
        await tx.update(partners).set({ ...changes, updatedAt: new Date() }).where(eq(partners.id, id));
      }
      if (input.roles) {
        await tx.delete(partnerRoles).where(eq(partnerRoles.partnerId, id));
        await tx.insert(partnerRoles).values(input.roles.map((role) => ({ partnerId: id, role })));
        after.vai = input.roles;
      }
      if (Object.keys(after).length) {
        await this.audit.record({ actorUserId: ctx.user.id, action: 'doi_tac.sua', entityType: 'partner', entityId: id, ip, detail: { truoc: before, sau: after } }, tx);
      }
    });
  }

  async addContact(partnerId: string, input: ContactInput, ctx: AuthContext, ip: string | null) {
    return this.db.transaction(async (tx) => {
      await this.lockForEdit(partnerId, ctx, tx);
      if (input.isPrimary) await tx.update(partnerContacts).set({ isPrimary: false }).where(eq(partnerContacts.partnerId, partnerId));
      const [c] = await tx
        .insert(partnerContacts)
        .values({ partnerId, name: input.name.trim(), position: input.position ?? null, email: input.email ?? null, phone: input.phone ?? null, isPrimary: input.isPrimary ?? false })
        .returning({ id: partnerContacts.id });
      await this.audit.record({ actorUserId: ctx.user.id, action: 'doi_tac.them_lien_he', entityType: 'partner', entityId: partnerId, ip, detail: { ten: input.name } }, tx);
      return { id: c.id };
    });
  }

  async addDocument(partnerId: string, input: DocumentInput, ctx: AuthContext, ip: string | null) {
    if (input.issuedOn && input.expiresOn && input.expiresOn < input.issuedOn) {
      throw new BadRequestException('Ngày hết hạn phải sau ngày cấp');
    }
    return this.db.transaction(async (tx) => {
      await this.lockForEdit(partnerId, ctx, tx);
      const [d] = await tx
        .insert(partnerDocuments)
        .values({ partnerId, ...input, createdBy: ctx.user.id })
        .returning({ id: partnerDocuments.id });
      await this.audit.record(
        { actorUserId: ctx.user.id, action: 'doi_tac.them_tai_lieu', entityType: 'partner', entityId: partnerId, ip, detail: { loai: input.docType, so: input.number, hetHan: input.expiresOn } },
        tx,
      );
      return { id: d.id };
    });
  }

  async voidDocument(partnerId: string, docId: string, reason: string, ctx: AuthContext, ip: string | null) {
    await this.db.transaction(async (tx) => {
      await this.lockForEdit(partnerId, ctx, tx);
      const [d] = await tx
        .update(partnerDocuments)
        .set({ voidedAt: new Date(), voidedBy: ctx.user.id, voidReason: reason })
        .where(and(eq(partnerDocuments.id, docId), eq(partnerDocuments.partnerId, partnerId), isNull(partnerDocuments.voidedAt)))
        .returning({ id: partnerDocuments.id, docType: partnerDocuments.docType });
      if (!d) throw new NotFoundException('Không tìm thấy tài liệu còn hiệu lực');
      await this.audit.record({ actorUserId: ctx.user.id, action: 'doi_tac.huy_tai_lieu', entityType: 'partner', entityId: partnerId, ip, detail: { loai: d.docType, lyDo: reason } }, tx);
    });
  }

  // ---------- Thẩm định ----------

  /** Trình thẩm định: cần xếp hạng rủi ro, ghi chú sàng lọc và ít nhất một tài liệu còn hiệu lực. */
  async submitKyc(id: string, input: { riskRating: RiskRating; screeningNote: string }, ctx: AuthContext, ip: string | null) {
    await this.db.transaction(async (tx) => {
      const p = await this.lockForEdit(id, ctx, tx);
      if (p.kycStatus !== 'nhap' && p.kycStatus !== 'tu_choi' && effectiveKycStatus(p.kycStatus as KycStatus, p.kycExpiresAt) !== 'het_han') {
        throw new BadRequestException('Chỉ trình thẩm định được khi hồ sơ ở trạng thái nháp, bị từ chối hoặc đã hết hạn');
      }
      const [{ n }] = await tx
        .select({ n: sql<number>`count(*)::int` })
        .from(partnerDocuments)
        .where(and(eq(partnerDocuments.partnerId, id), isNull(partnerDocuments.voidedAt)));
      if (n === 0) throw new BadRequestException('Cần ít nhất một tài liệu pháp lý trước khi trình thẩm định');
      await tx
        .update(partners)
        .set({
          kycStatus: 'cho_tham_dinh',
          riskRating: input.riskRating,
          screeningNote: input.screeningNote,
          screenedAt: new Date(),
          kycSubmittedBy: ctx.user.id,
          kycRejectReason: null,
          updatedAt: new Date(),
        })
        .where(eq(partners.id, id));
      await this.audit.record(
        { actorUserId: ctx.user.id, action: 'doi_tac.trinh_tham_dinh', entityType: 'partner', entityId: id, ip, detail: { ruiRo: input.riskRating, sangLoc: input.screeningNote } },
        tx,
      );
    });
  }

  /** Duyệt hoặc từ chối. Người trình không tự duyệt; rủi ro cao chỉ Ban Giám đốc duyệt. */
  async decideKyc(id: string, decision: { approve: boolean; reason?: string }, ctx: AuthContext, ip: string | null) {
    await this.db.transaction(async (tx) => {
      const [p] = await tx.select().from(partners).where(eq(partners.id, id)).for('update');
      if (!p) throw new NotFoundException('Không tìm thấy đối tác');
      if (p.kycStatus !== 'cho_tham_dinh') throw new BadRequestException('Hồ sơ không ở trạng thái chờ thẩm định');
      if (p.kycSubmittedBy === ctx.user.id) throw new ForbiddenException('Người trình hồ sơ không được tự duyệt (nguyên tắc 4 mắt)');
      if (p.riskRating === 'cao' && !ctx.permissions.includes('DOI_TAC_DUYET_RUI_RO_CAO')) {
        throw new ForbiddenException('Đối tác rủi ro cao phải do Ban Giám đốc duyệt');
      }
      if (decision.approve) {
        const now = new Date();
        const expires = addMonths(now, kycValidityMonths(p.riskRating as RiskRating));
        await tx
          .update(partners)
          .set({ kycStatus: 'dat', kycApprovedBy: ctx.user.id, kycApprovedAt: now, kycExpiresAt: expires, updatedAt: now })
          .where(eq(partners.id, id));
        await this.audit.record(
          { actorUserId: ctx.user.id, action: 'doi_tac.duyet_tham_dinh', entityType: 'partner', entityId: id, ip, detail: { ruiRo: p.riskRating, hetHan: expires.toISOString() } },
          tx,
        );
      } else {
        if (!decision.reason?.trim()) throw new BadRequestException('Cần ghi lý do từ chối');
        await tx.update(partners).set({ kycStatus: 'tu_choi', kycRejectReason: decision.reason, updatedAt: new Date() }).where(eq(partners.id, id));
        await this.audit.record({ actorUserId: ctx.user.id, action: 'doi_tac.tu_choi_tham_dinh', entityType: 'partner', entityId: id, ip, detail: { lyDo: decision.reason } }, tx);
      }
    });
  }

  // ---------- Nội bộ ----------

  private canManageAll(ctx: AuthContext): boolean {
    return ctx.permissions.includes('DOI_TAC_QUAN_LY_TAT_CA');
  }

  /** Khoá dòng đối tác để sửa; nhân viên chỉ sửa được đối tác mình phụ trách. */
  private async lockForEdit(id: string, ctx: AuthContext, tx: DbExecutor) {
    const [p] = await tx.select().from(partners).where(eq(partners.id, id)).for('update');
    if (!p) throw new NotFoundException('Không tìm thấy đối tác');
    if (!this.canManageAll(ctx) && p.ownerUserId !== ctx.user.id) {
      throw new ForbiddenException('Bạn chỉ sửa được đối tác do mình phụ trách');
    }
    return p;
  }

  private present(p: typeof partners.$inferSelect, roles: string[], ownerName: string | null) {
    return {
      id: p.id,
      code: p.code,
      name: p.name,
      country: p.country,
      taxCode: p.taxCode,
      address: p.address,
      category: p.category,
      roles,
      ownerUserId: p.ownerUserId,
      ownerName,
      kycStatus: effectiveKycStatus(p.kycStatus as KycStatus, p.kycExpiresAt),
      riskRating: p.riskRating,
      screeningNote: p.screeningNote,
      kycSubmittedBy: p.kycSubmittedBy,
      kycApprovedAt: p.kycApprovedAt,
      kycExpiresAt: p.kycExpiresAt,
      kycRejectReason: p.kycRejectReason,
    };
  }
}

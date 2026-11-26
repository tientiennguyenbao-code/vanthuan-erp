import { BadRequestException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, asc, desc, eq, ilike, or, sql } from 'drizzle-orm';
import { AuditService } from '../audit/audit.service';
import type { AuthContext } from '../auth/auth.types';
import { DB, Db, DbExecutor } from '../db/db';
import { commodities, inquiries, Inquiry, partnerRoles, partners, quotes, samples, users } from '../db/schema';
import { salesAccess as A } from './access';
import { InquirySource, inquiryStats, isInquiryOpen, isInquiryOverdue, LostReason, quoteDueOn } from './sales.rules';

export interface InquiryInput {
  partnerId: string;
  commodityId: string;
  source: InquirySource;
  receivedOn: string;
  quantity: number;
  unit: 'kg' | 'tan';
  spec?: string | null;
  certifications?: string | null;
  deliveryMonth?: string | null;
  incoterms?: string | null;
  portTo?: string | null;
  targetPrice?: number | null;
  currency?: string | null;
  note?: string | null;
  ownerUserId?: string | null;
}

@Injectable()
export class InquiriesService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly audit: AuditService,
  ) {}

  async list(ctx: AuthContext, filter: { status?: string; partnerId?: string; q?: string }) {
    A.assertUse(ctx);
    const conds = [];
    if (!A.seeAll(ctx)) conds.push(eq(inquiries.ownerUserId, ctx.user.id));
    if (filter.partnerId) conds.push(eq(inquiries.partnerId, filter.partnerId));
    if (filter.q) conds.push(or(ilike(inquiries.code, `%${filter.q}%`), ilike(partners.name, `%${filter.q}%`)));
    const rows = await this.db
      .select({ i: inquiries, partnerName: partners.name, partnerCountry: partners.country, commodityName: commodities.name, ownerName: users.fullName })
      .from(inquiries)
      .innerJoin(partners, eq(partners.id, inquiries.partnerId))
      .innerJoin(commodities, eq(commodities.id, inquiries.commodityId))
      .innerJoin(users, eq(users.id, inquiries.ownerUserId))
      .where(conds.length ? and(...conds) : undefined)
      .orderBy(desc(inquiries.receivedOn), desc(inquiries.createdAt))
      .limit(1000);
    const all = rows.map((r) => ({ ...this.present(r.i), partnerName: r.partnerName, partnerCountry: r.partnerCountry, commodityName: r.commodityName, ownerName: r.ownerName }));
    const shown = filter.status === 'qua_han' ? all.filter((i) => i.quaHan) : filter.status ? all.filter((i) => i.status === filter.status) : all;
    return { hoiHang: shown, tongHop: inquiryStats(rows.map((r) => r.i)) };
  }

  async get(id: string, ctx: AuthContext) {
    const [row] = await this.db
      .select({ i: inquiries, partnerName: partners.name, partnerCountry: partners.country, commodityName: commodities.name, sector: commodities.sector, ownerName: users.fullName })
      .from(inquiries)
      .innerJoin(partners, eq(partners.id, inquiries.partnerId))
      .innerJoin(commodities, eq(commodities.id, inquiries.commodityId))
      .innerJoin(users, eq(users.id, inquiries.ownerUserId))
      .where(eq(inquiries.id, id));
    if (!row) throw new NotFoundException('Không tìm thấy phiếu hỏi hàng');
    if (!A.canView(row.i.ownerUserId, ctx)) throw new ForbiddenException('Bạn không xem được phiếu này');
    const quoteRows = await this.db
      .select({ id: quotes.id, code: quotes.code, status: quotes.status, version: quotes.version, unitPrice: quotes.unitPrice, currency: quotes.currency, unit: quotes.unit, quantity: quotes.quantity, validUntil: quotes.validUntil })
      .from(quotes)
      .where(eq(quotes.inquiryId, id))
      .orderBy(asc(quotes.createdAt));
    const sampleRows = await this.db.select().from(samples).where(eq(samples.inquiryId, id)).orderBy(asc(samples.createdAt));
    const editable = A.canEdit(row.i.ownerUserId, ctx);
    const open = isInquiryOpen(row.i.status);
    return {
      ...this.present(row.i),
      partnerName: row.partnerName,
      partnerCountry: row.partnerCountry,
      commodityName: row.commodityName,
      sector: row.sector,
      ownerName: row.ownerName,
      baoGia: quoteRows,
      mau: sampleRows.map((s) => ({ id: s.id, code: s.code, kind: s.kind, status: s.status, sentOn: s.sentOn, resultOn: s.resultOn, cupScore: s.cupScore, resultNote: s.resultNote })),
      quyen: { sua: editable && open, lapBaoGia: editable && open, thua: editable && open, huy: editable && row.i.status === 'moi', guiMau: editable && open },
    };
  }

  async create(input: InquiryInput, ctx: AuthContext) {
    A.assertDraft(ctx);
    const ownerUserId = A.draftAll(ctx) ? (input.ownerUserId ?? ctx.user.id) : ctx.user.id;
    return this.db.transaction(async (tx) => {
      await this.checkRefs(input, tx);
      const code = await this.nextCode(tx);
      const [r] = await tx
        .insert(inquiries)
        .values({ ...this.columns(input), code, ownerUserId, createdBy: ctx.user.id })
        .returning({ id: inquiries.id, code: inquiries.code });
      await this.audit.record({ actorUserId: ctx.user.id, action: 'hoi_hang.tao', entityType: 'inquiry', entityId: r.id, detail: { ma: code, nguon: input.source } }, tx);
      return r;
    });
  }

  async update(id: string, input: InquiryInput, ctx: AuthContext) {
    await this.db.transaction(async (tx) => {
      const i = await this.lockForEdit(id, ctx, tx);
      if (!isInquiryOpen(i.status)) throw new BadRequestException('Phiếu đã đóng, không sửa được');
      if (i.status === 'dang_bao_gia' && (input.partnerId !== i.partnerId || input.commodityId !== i.commodityId)) {
        throw new BadRequestException('Phiếu đã có báo giá: không đổi người mua hay mặt hàng');
      }
      await this.checkRefs(input, tx);
      const owner = A.draftAll(ctx) && input.ownerUserId ? { ownerUserId: input.ownerUserId } : {};
      await tx.update(inquiries).set({ ...this.columns(input), ...owner, updatedAt: new Date() }).where(eq(inquiries.id, id));
      await this.audit.record({ actorUserId: ctx.user.id, action: 'hoi_hang.sua', entityType: 'inquiry', entityId: id, detail: {} }, tx);
    });
  }

  async markLost(id: string, reason: LostReason, note: string | null, ctx: AuthContext) {
    await this.db.transaction(async (tx) => {
      const i = await this.lockForEdit(id, ctx, tx);
      if (!isInquiryOpen(i.status)) throw new BadRequestException('Phiếu đã đóng');
      if (reason === 'khac' && !note) throw new BadRequestException('Lý do "khác" cần ghi rõ');
      await tx.update(inquiries).set({ status: 'thua', lostReason: reason, closeNote: note, closedAt: new Date(), updatedAt: new Date() }).where(eq(inquiries.id, id));
      await this.audit.record({ actorUserId: ctx.user.id, action: 'hoi_hang.thua', entityType: 'inquiry', entityId: id, detail: { lyDo: reason, ghiChu: note } }, tx);
    });
  }

  async cancel(id: string, note: string, ctx: AuthContext) {
    await this.db.transaction(async (tx) => {
      const i = await this.lockForEdit(id, ctx, tx);
      if (i.status !== 'moi') throw new BadRequestException('Chỉ huỷ phiếu chưa có báo giá; phiếu đã báo giá thì đánh dấu thua');
      await tx.update(inquiries).set({ status: 'huy', closeNote: note, closedAt: new Date(), updatedAt: new Date() }).where(eq(inquiries.id, id));
      await this.audit.record({ actorUserId: ctx.user.id, action: 'hoi_hang.huy', entityType: 'inquiry', entityId: id, detail: { lyDo: note } }, tx);
    });
  }

  // ---------- Dùng từ báo giá ----------

  /** Báo giá bán lập từ phiếu: phiếu phải còn mở, cùng người mua và mặt hàng; phiếu chuyển sang đang báo giá. */
  async attachQuote(inquiryId: string, quote: { partnerId: string; commodityId: string }, ctx: AuthContext, tx: DbExecutor) {
    const [i] = await tx.select().from(inquiries).where(eq(inquiries.id, inquiryId)).for('update');
    if (!i) throw new BadRequestException('Không tìm thấy phiếu hỏi hàng');
    if (!A.canView(i.ownerUserId, ctx)) throw new ForbiddenException('Bạn không xem được phiếu hỏi hàng này');
    if (!isInquiryOpen(i.status)) throw new BadRequestException('Phiếu hỏi hàng đã đóng');
    if (i.partnerId !== quote.partnerId || i.commodityId !== quote.commodityId) throw new BadRequestException('Báo giá phải cùng người mua và mặt hàng với phiếu hỏi hàng');
    if (i.status === 'moi') {
      await tx.update(inquiries).set({ status: 'dang_bao_gia', updatedAt: new Date() }).where(eq(inquiries.id, inquiryId));
      await this.audit.record({ actorUserId: ctx.user.id, action: 'hoi_hang.dang_bao_gia', entityType: 'inquiry', entityId: inquiryId, detail: {} }, tx);
    }
  }

  /** Báo giá lập từ phiếu được chấp nhận: phiếu thắng. */
  async markWon(inquiryId: string, quoteCode: string, ctx: AuthContext, tx: DbExecutor) {
    const [i] = await tx.select().from(inquiries).where(eq(inquiries.id, inquiryId)).for('update');
    if (!i || !isInquiryOpen(i.status)) return;
    await tx.update(inquiries).set({ status: 'thang', closeNote: `Báo giá ${quoteCode} được chấp nhận`, closedAt: new Date(), updatedAt: new Date() }).where(eq(inquiries.id, inquiryId));
    await this.audit.record({ actorUserId: ctx.user.id, action: 'hoi_hang.thang', entityType: 'inquiry', entityId: inquiryId, detail: { baoGia: quoteCode } }, tx);
  }

  // ---------- Nội bộ ----------

  private columns(input: InquiryInput) {
    return {
      partnerId: input.partnerId,
      commodityId: input.commodityId,
      source: input.source,
      receivedOn: input.receivedOn,
      quantity: input.quantity,
      unit: input.unit,
      spec: input.spec ?? null,
      certifications: input.certifications ?? null,
      deliveryMonth: input.deliveryMonth ?? null,
      incoterms: input.incoterms ?? null,
      portTo: input.portTo ?? null,
      targetPrice: input.targetPrice ?? null,
      currency: input.targetPrice != null ? (input.currency ?? 'USD') : null,
      note: input.note ?? null,
    };
  }

  private async checkRefs(input: InquiryInput, tx: DbExecutor) {
    const [p] = await tx.select({ id: partners.id, name: partners.name }).from(partners).where(eq(partners.id, input.partnerId));
    if (!p) throw new BadRequestException('Không tìm thấy đối tác');
    const [r] = await tx.select().from(partnerRoles).where(and(eq(partnerRoles.partnerId, p.id), eq(partnerRoles.role, 'nguoi_mua')));
    if (!r) throw new BadRequestException(`${p.name} chưa được đánh dấu là người mua`);
    const [com] = await tx.select().from(commodities).where(eq(commodities.id, input.commodityId));
    if (!com || !com.active) throw new BadRequestException('Mặt hàng không có hoặc đã ngừng');
    if (input.receivedOn > new Date().toISOString().slice(0, 10)) throw new BadRequestException('Ngày nhận yêu cầu không được ở tương lai');
  }

  private async lockForEdit(id: string, ctx: AuthContext, tx: DbExecutor): Promise<Inquiry> {
    const [i] = await tx.select().from(inquiries).where(eq(inquiries.id, id)).for('update');
    if (!i) throw new NotFoundException('Không tìm thấy phiếu hỏi hàng');
    if (!A.canEdit(i.ownerUserId, ctx)) throw new ForbiddenException('Bạn không sửa được phiếu này');
    return i;
  }

  private present(i: Inquiry) {
    return {
      id: i.id,
      code: i.code,
      partnerId: i.partnerId,
      commodityId: i.commodityId,
      source: i.source,
      receivedOn: i.receivedOn,
      quantity: i.quantity,
      unit: i.unit,
      spec: i.spec,
      certifications: i.certifications,
      deliveryMonth: i.deliveryMonth,
      incoterms: i.incoterms,
      portTo: i.portTo,
      targetPrice: i.targetPrice,
      currency: i.currency,
      note: i.note,
      status: i.status,
      lostReason: i.lostReason,
      closeNote: i.closeNote,
      closedAt: i.closedAt,
      ownerUserId: i.ownerUserId,
      hanBaoGia: quoteDueOn(i.receivedOn),
      quaHan: isInquiryOverdue(i.status, i.receivedOn),
      updatedAt: i.updatedAt,
    };
  }

  private async nextCode(tx: DbExecutor) {
    const prefix = `YCH-${new Date().getUTCFullYear()}-`;
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${'inquiry_code:' + prefix}))`);
    const [{ max }] = await tx
      .select({ max: sql<number | null>`max(substring(${inquiries.code}, ${prefix.length + 1}::int)::int)` })
      .from(inquiries)
      .where(sql`${inquiries.code} like ${prefix + '%'}`);
    return `${prefix}${String((max ?? 0) + 1).padStart(4, '0')}`;
  }
}

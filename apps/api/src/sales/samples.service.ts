import { BadRequestException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, desc, eq, sql } from 'drizzle-orm';
import { AuditService } from '../audit/audit.service';
import type { AuthContext } from '../auth/auth.types';
import { DB, Db, DbExecutor } from '../db/db';
import { commodities, exportLots, inquiries, partnerRoles, partners, purchaseLots, quotes, Sample, samples, users } from '../db/schema';
import { salesAccess as A } from './access';
import { initialSampleStatus, isInquiryOpen, SampleKind, sampleLinkProblem, sampleResultProblem } from './sales.rules';

export interface SampleInput {
  kind: SampleKind;
  partnerId: string;
  commodityId: string;
  inquiryId?: string | null;
  quoteId?: string | null;
  exportLotId?: string | null;
  purchaseLotId?: string | null;
  weightG?: number | null;
  description?: string | null;
  retainUntil?: string | null;
}

@Injectable()
export class SamplesService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly audit: AuditService,
  ) {}

  async list(ctx: AuthContext, filter: { kind?: string; status?: string; exportLotId?: string; inquiryId?: string }) {
    A.assertUse(ctx);
    const conds = [];
    if (!A.seeAll(ctx)) conds.push(eq(samples.ownerUserId, ctx.user.id));
    if (filter.kind) conds.push(eq(samples.kind, filter.kind));
    if (filter.status) conds.push(eq(samples.status, filter.status));
    if (filter.exportLotId) conds.push(eq(samples.exportLotId, filter.exportLotId));
    if (filter.inquiryId) conds.push(eq(samples.inquiryId, filter.inquiryId));
    const rows = await this.db
      .select({
        s: samples,
        partnerName: partners.name,
        commodityName: commodities.name,
        sector: commodities.sector,
        ownerName: users.fullName,
        inquiryCode: inquiries.code,
        exportLotCode: exportLots.code,
        purchaseLotCode: purchaseLots.code,
      })
      .from(samples)
      .innerJoin(partners, eq(partners.id, samples.partnerId))
      .innerJoin(commodities, eq(commodities.id, samples.commodityId))
      .innerJoin(users, eq(users.id, samples.ownerUserId))
      .leftJoin(inquiries, eq(inquiries.id, samples.inquiryId))
      .leftJoin(exportLots, eq(exportLots.id, samples.exportLotId))
      .leftJoin(purchaseLots, eq(purchaseLots.id, samples.purchaseLotId))
      .where(conds.length ? and(...conds) : undefined)
      .orderBy(desc(samples.createdAt))
      .limit(1000);
    return rows.map((r) => ({
      ...r.s,
      partnerName: r.partnerName,
      commodityName: r.commodityName,
      sector: r.sector,
      ownerName: r.ownerName,
      inquiryCode: r.inquiryCode,
      exportLotCode: r.exportLotCode,
      purchaseLotCode: r.purchaseLotCode,
      quyen: this.rights(r.s, ctx),
    }));
  }

  async create(input: SampleInput, ctx: AuthContext) {
    A.assertDraft(ctx);
    return this.db.transaction(async (tx) => {
      await this.checkRefs(input, ctx, tx);
      const code = await this.nextCode(tx);
      const [r] = await tx
        .insert(samples)
        .values({
          code,
          kind: input.kind,
          partnerId: input.partnerId,
          commodityId: input.commodityId,
          inquiryId: input.inquiryId ?? null,
          quoteId: input.quoteId ?? null,
          exportLotId: input.exportLotId ?? null,
          purchaseLotId: input.purchaseLotId ?? null,
          weightG: input.weightG ?? null,
          description: input.description ?? null,
          retainUntil: input.kind === 'doi_chung' ? (input.retainUntil ?? null) : null,
          status: initialSampleStatus(input.kind),
          ownerUserId: ctx.user.id,
          createdBy: ctx.user.id,
        })
        .returning({ id: samples.id, code: samples.code });
      await this.audit.record({ actorUserId: ctx.user.id, action: 'mau.tao', entityType: 'sample', entityId: r.id, detail: { ma: code, loai: input.kind } }, tx);
      return r;
    });
  }

  async markSent(id: string, input: { courier: string; trackingNo: string | null; sentOn: string }, ctx: AuthContext) {
    await this.db.transaction(async (tx) => {
      const s = await this.lockForEdit(id, ctx, tx);
      if (s.status !== 'chuan_bi') throw new BadRequestException('Chỉ ghi gửi cho mẫu đang chuẩn bị');
      if (input.sentOn > new Date().toISOString().slice(0, 10)) throw new BadRequestException('Ngày gửi không được ở tương lai');
      await tx.update(samples).set({ status: 'da_gui', courier: input.courier, trackingNo: input.trackingNo, sentOn: input.sentOn, updatedAt: new Date() }).where(eq(samples.id, id));
      await this.audit.record({ actorUserId: ctx.user.id, action: 'mau.gui', entityType: 'sample', entityId: id, detail: { hang: input.courier, soVanDon: input.trackingNo } }, tx);
    });
  }

  async recordResult(id: string, input: { passed: boolean; resultOn: string; cupScore: number | null; note: string | null }, ctx: AuthContext) {
    await this.db.transaction(async (tx) => {
      const s = await this.lockForEdit(id, ctx, tx);
      const [com] = await tx.select({ sector: commodities.sector }).from(commodities).where(eq(commodities.id, s.commodityId));
      const problem = sampleResultProblem(s.status, s.kind, com.sector, input.cupScore);
      if (problem) throw new BadRequestException(problem);
      if (s.sentOn && input.resultOn < s.sentOn) throw new BadRequestException('Ngày có kết quả không được trước ngày gửi');
      if (!input.passed && !input.note) throw new BadRequestException('Mẫu không đạt cần ghi nhận xét của người mua');
      await tx
        .update(samples)
        .set({ status: input.passed ? 'dat' : 'khong_dat', resultOn: input.resultOn, cupScore: input.cupScore, resultNote: input.note, resultBy: ctx.user.id, updatedAt: new Date() })
        .where(eq(samples.id, id));
      await this.audit.record(
        { actorUserId: ctx.user.id, action: 'mau.ket_qua', entityType: 'sample', entityId: id, detail: { dat: input.passed, diem: input.cupScore, nhanXet: input.note } },
        tx,
      );
    });
  }

  async cancel(id: string, reason: string, ctx: AuthContext) {
    await this.db.transaction(async (tx) => {
      const s = await this.lockForEdit(id, ctx, tx);
      if (s.status === 'dat' || s.status === 'khong_dat' || s.status === 'huy') throw new BadRequestException('Mẫu đã có kết quả hoặc đã huỷ');
      await tx.update(samples).set({ status: 'huy', cancelReason: reason, updatedAt: new Date() }).where(eq(samples.id, id));
      await this.audit.record({ actorUserId: ctx.user.id, action: 'mau.huy', entityType: 'sample', entityId: id, detail: { lyDo: reason } }, tx);
    });
  }

  // ---------- Nội bộ ----------

  private rights(s: Sample, ctx: AuthContext) {
    const e = A.canEdit(s.ownerUserId, ctx);
    return { gui: e && s.status === 'chuan_bi', ketQua: e && s.status === 'da_gui', huy: e && ['chuan_bi', 'da_gui', 'luu'].includes(s.status) };
  }

  private async checkRefs(input: SampleInput, ctx: AuthContext, tx: DbExecutor) {
    const [p] = await tx.select({ id: partners.id, name: partners.name }).from(partners).where(eq(partners.id, input.partnerId));
    if (!p) throw new BadRequestException('Không tìm thấy đối tác');
    const [r] = await tx.select().from(partnerRoles).where(and(eq(partnerRoles.partnerId, p.id), eq(partnerRoles.role, 'nguoi_mua')));
    if (!r) throw new BadRequestException(`${p.name} chưa được đánh dấu là người mua`);
    const [com] = await tx.select().from(commodities).where(eq(commodities.id, input.commodityId));
    if (!com) throw new BadRequestException('Không tìm thấy mặt hàng');
    let inquiry = null;
    if (input.inquiryId) {
      const [i] = await tx.select().from(inquiries).where(eq(inquiries.id, input.inquiryId));
      if (!i) throw new BadRequestException('Không tìm thấy phiếu hỏi hàng');
      if (!A.canView(i.ownerUserId, ctx)) throw new ForbiddenException('Bạn không xem được phiếu hỏi hàng này');
      if (!isInquiryOpen(i.status)) throw new BadRequestException('Phiếu hỏi hàng đã đóng');
      inquiry = i;
    }
    if (input.quoteId) {
      const [q] = await tx.select().from(quotes).where(eq(quotes.id, input.quoteId));
      if (!q || q.kind !== 'ban' || q.partnerId !== input.partnerId) throw new BadRequestException('Báo giá phải là báo giá bán cho người mua này');
    }
    let exportLot = null;
    if (input.exportLotId) {
      [exportLot] = await tx.select().from(exportLots).where(eq(exportLots.id, input.exportLotId));
      if (!exportLot) throw new BadRequestException('Không tìm thấy lô xuất');
      if (exportLot.status === 'da_huy') throw new BadRequestException('Lô xuất đã huỷ');
    }
    let purchaseLot = null;
    if (input.purchaseLotId) {
      [purchaseLot] = await tx.select().from(purchaseLots).where(eq(purchaseLots.id, input.purchaseLotId));
      if (!purchaseLot) throw new BadRequestException('Không tìm thấy lô mua');
    }
    const problem = sampleLinkProblem({ kind: input.kind, sector: com.sector, partnerId: input.partnerId, commodityId: input.commodityId, inquiry, exportLot, purchaseLot });
    if (problem) throw new BadRequestException(problem);
  }

  private async lockForEdit(id: string, ctx: AuthContext, tx: DbExecutor): Promise<Sample> {
    const [s] = await tx.select().from(samples).where(eq(samples.id, id)).for('update');
    if (!s) throw new NotFoundException('Không tìm thấy mẫu');
    if (!A.canEdit(s.ownerUserId, ctx)) throw new ForbiddenException('Bạn không sửa được mẫu này');
    return s;
  }

  private async nextCode(tx: DbExecutor) {
    const prefix = `MAU-${new Date().getUTCFullYear()}-`;
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${'sample_code:' + prefix}))`);
    const [{ max }] = await tx
      .select({ max: sql<number | null>`max(substring(${samples.code}, ${prefix.length + 1}::int)::int)` })
      .from(samples)
      .where(sql`${samples.code} like ${prefix + '%'}`);
    return `${prefix}${String((max ?? 0) + 1).padStart(4, '0')}`;
  }
}

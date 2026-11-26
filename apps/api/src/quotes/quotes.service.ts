import { BadRequestException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, asc, desc, eq, ilike, inArray, notInArray, or, sql } from 'drizzle-orm';
import { AuditService } from '../audit/audit.service';
import type { AuthContext } from '../auth/auth.types';
import type { ContractKind, ContractTerms } from '../contracts/contract.rules';
import { ContractsService } from '../contracts/contracts.service';
import { DB, Db, DbExecutor } from '../db/db';
import { PlanService } from '../sourcing/plan.service';
import { commodities, contracts, partnerRoles, partners, Quote, quoteCostLines, quotes, users } from '../db/schema';
import { costKindsFor, CostKind, isQuoteExpired, QuoteKind, QuoteStatus, quoteValue, saleSummary, toUsd, usdPerKg } from './quote.rules';

export interface QuoteInput {
  kind: QuoteKind;
  partnerId: string;
  commodityId: string;
  sourceQuoteId?: string | null;
  quantity: number;
  unit: 'kg' | 'tan';
  unitPrice: number;
  currency: 'USD' | 'VND' | 'EUR' | 'CNY';
  fxPerUsd?: number | null;
  incoterms: string;
  portFrom?: string | null;
  portTo?: string | null;
  validUntil: string;
  spec?: string | null;
  certifications?: string | null;
  deliveryTime?: string | null;
  /** YYYY-MM */
  deliveryMonth?: string | null;
  paymentTerms?: string | null;
  feeRatePct?: number | null;
  note?: string | null;
  ownerUserId?: string | null;
}

export interface CostLineInput {
  kind: CostKind;
  description?: string | null;
  amount: number;
  currency: 'USD' | 'VND' | 'EUR' | 'CNY';
  fxPerUsd?: number | null;
}

const PARTNER_ROLE_FOR: Record<QuoteKind, { role: string; label: string }> = {
  mua: { role: 'nha_cung_cap', label: 'nhà cung cấp' },
  ban: { role: 'nguoi_mua', label: 'người mua' },
};

@Injectable()
export class QuotesService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly audit: AuditService,
    private readonly contracts: ContractsService,
    private readonly plan: PlanService,
  ) {}

  // ---------- Đọc ----------

  async list(ctx: AuthContext, filter: { kind?: string; status?: string; commodityId?: string; q?: string }) {
    this.assertCanUse(ctx);
    const conds = [];
    if (!this.canSeeAll(ctx)) conds.push(eq(quotes.ownerUserId, ctx.user.id));
    if (filter.kind) conds.push(eq(quotes.kind, filter.kind));
    if (filter.status) conds.push(eq(quotes.status, filter.status));
    if (filter.commodityId) conds.push(eq(quotes.commodityId, filter.commodityId));
    if (filter.q) conds.push(or(ilike(quotes.code, `%${filter.q}%`), ilike(partners.name, `%${filter.q}%`)));
    const rows = await this.db
      .select({ q: quotes, partnerName: partners.name, partnerCountry: partners.country, commodityName: commodities.name, sector: commodities.sector, ownerName: users.fullName })
      .from(quotes)
      .innerJoin(partners, eq(partners.id, quotes.partnerId))
      .innerJoin(commodities, eq(commodities.id, quotes.commodityId))
      .innerJoin(users, eq(users.id, quotes.ownerUserId))
      .where(conds.length ? and(...conds) : undefined)
      .orderBy(desc(quotes.updatedAt))
      .limit(500);
    return rows.map((r) => ({ ...this.present(r.q), partnerName: r.partnerName, commodityName: r.commodityName, ownerName: r.ownerName }));
  }

  /** So sánh các báo giá mua còn hiệu lực của một mặt hàng, rẻ nhất (USD/kg) lên đầu. */
  async compare(commodityId: string, ctx: AuthContext) {
    this.assertCanUse(ctx);
    const conds = [eq(quotes.kind, 'mua'), eq(quotes.commodityId, commodityId), notInArray(quotes.status, ['huy', 'tu_choi'])];
    if (!this.canSeeAll(ctx)) conds.push(eq(quotes.ownerUserId, ctx.user.id));
    const rows = await this.db
      .select({ q: quotes, partnerName: partners.name, kycStatus: partners.kycStatus, kycExpiresAt: partners.kycExpiresAt })
      .from(quotes)
      .innerJoin(partners, eq(partners.id, quotes.partnerId))
      .where(and(...conds))
      .orderBy(asc(quotes.validUntil));
    return rows
      .map((r) => ({
        ...this.present(r.q),
        partnerName: r.partnerName,
        doiTacDat: r.kycStatus === 'dat' && (!r.kycExpiresAt || r.kycExpiresAt.getTime() > Date.now()),
        usdMoiKg: usdPerKg(r.q),
      }))
      .filter((q) => !q.hetHieuLuc)
      .sort((a, b) => (a.usdMoiKg ?? Infinity) - (b.usdMoiKg ?? Infinity));
  }

  async get(id: string, ctx: AuthContext) {
    const [row] = await this.db
      .select({ q: quotes, partnerName: partners.name, partnerCountry: partners.country, commodityName: commodities.name, sector: commodities.sector, ownerName: users.fullName })
      .from(quotes)
      .innerJoin(partners, eq(partners.id, quotes.partnerId))
      .innerJoin(commodities, eq(commodities.id, quotes.commodityId))
      .innerJoin(users, eq(users.id, quotes.ownerUserId))
      .where(eq(quotes.id, id));
    if (!row) throw new NotFoundException('Không tìm thấy báo giá');
    this.assertCanView(row.q, ctx);
    const q = row.q;
    const costs = await this.db.select().from(quoteCostLines).where(eq(quoteCostLines.quoteId, id)).orderBy(asc(quoteCostLines.kind));
    let source: (ReturnType<QuotesService['present']> & { partnerName: string }) | null = null;
    let sourceRow: Quote | null = null;
    if (q.sourceQuoteId) {
      const [s] = await this.db
        .select({ q: quotes, partnerName: partners.name })
        .from(quotes)
        .innerJoin(partners, eq(partners.id, quotes.partnerId))
        .where(eq(quotes.id, q.sourceQuoteId));
      if (s) {
        sourceRow = s.q;
        source = { ...this.present(s.q), partnerName: s.partnerName };
      }
    }
    const contractRows = (q.contractIds as string[]).length
      ? await this.contractsSummary(q.contractIds as string[])
      : [];
    const editable = this.canEdit(q, ctx);
    const expired = isQuoteExpired(q.validUntil);
    return {
      ...this.present(q),
      partnerName: row.partnerName,
      commodityName: row.commodityName,
      ownerName: row.ownerName,
      nguon: source,
      chiPhi: costs.map((c) => ({ ...c, usd: toUsd(c.amount, c.currency, c.fxPerUsd) })),
      chiPhiGoiY: q.kind === 'ban' ? costKindsFor(q.incoterms).filter((k) => !costs.some((c) => c.kind === k)) : [],
      tomTat: q.kind === 'ban' ? saleSummary(q, sourceRow, costs) : null,
      cungEudr: q.kind === 'ban' && (q.status === 'nhap' || q.status === 'da_gui') ? await this.plan.offerCheck(q, row.sector, row.partnerCountry) : null,
      hopDong: contractRows,
      quyen: {
        sua: editable && q.status === 'nhap',
        gui: editable && q.status === 'nhap' && !expired,
        suaDoi: editable && (q.status === 'da_gui' || q.status === 'tu_choi'),
        tuChoi: editable && q.status === 'da_gui',
        chapNhan: editable && q.status === 'da_gui' && !expired && (q.kind === 'mua' || !!q.sourceQuoteId),
        huy: editable && q.status !== 'chap_nhan' && q.status !== 'huy',
      },
    };
  }

  // ---------- Ghi ----------

  async create(input: QuoteInput, ctx: AuthContext) {
    this.assertCanDraft(ctx);
    const ownerUserId = this.canDraftAll(ctx) ? (input.ownerUserId ?? ctx.user.id) : ctx.user.id;
    return this.db.transaction(async (tx) => {
      await this.checkRefs(input, tx);
      const code = await this.nextCode(input.kind, tx);
      const [q] = await tx
        .insert(quotes)
        .values({ ...this.columns(input), code, kind: input.kind, partnerId: input.partnerId, commodityId: input.commodityId, ownerUserId, createdBy: ctx.user.id })
        .returning({ id: quotes.id, code: quotes.code });
      await this.audit.record({ actorUserId: ctx.user.id, action: 'bao_gia.tao', entityType: 'quote', entityId: q.id, detail: { ma: code, loai: input.kind } }, tx);
      return q;
    });
  }

  async update(id: string, input: Omit<QuoteInput, 'kind'>, ctx: AuthContext) {
    await this.db.transaction(async (tx) => {
      const q = await this.lockForEdit(id, ctx, tx);
      if (q.status !== 'nhap') throw new BadRequestException('Chỉ sửa được báo giá đang soạn; báo giá đã gửi thì lập sửa đổi');
      await this.checkRefs({ ...input, kind: q.kind as QuoteKind }, tx);
      await tx
        .update(quotes)
        .set({ ...this.columns(input), partnerId: input.partnerId, commodityId: input.commodityId, updatedAt: new Date() })
        .where(eq(quotes.id, id));
      await this.audit.record({ actorUserId: ctx.user.id, action: 'bao_gia.sua', entityType: 'quote', entityId: id, detail: { phienBan: q.version } }, tx);
    });
  }

  /** Thay toàn bộ dòng chi phí của báo giá bán đang soạn. */
  async setCostLines(id: string, lines: CostLineInput[], ctx: AuthContext) {
    await this.db.transaction(async (tx) => {
      const q = await this.lockForEdit(id, ctx, tx);
      if (q.kind !== 'ban') throw new BadRequestException('Chỉ báo giá bán mới có dòng chi phí');
      if (q.status !== 'nhap') throw new BadRequestException('Chỉ sửa chi phí khi báo giá đang soạn');
      await tx.delete(quoteCostLines).where(eq(quoteCostLines.quoteId, id));
      if (lines.length) {
        await tx.insert(quoteCostLines).values(
          lines.map((l) => ({ quoteId: id, kind: l.kind, description: l.description ?? null, amount: l.amount, currency: l.currency, fxPerUsd: l.currency === 'USD' ? null : (l.fxPerUsd ?? null) })),
        );
      }
      await tx.update(quotes).set({ updatedAt: new Date() }).where(eq(quotes.id, id));
      await this.audit.record({ actorUserId: ctx.user.id, action: 'bao_gia.sua_chi_phi', entityType: 'quote', entityId: id, detail: { soDong: lines.length } }, tx);
    });
  }

  async send(id: string, ctx: AuthContext) {
    await this.transition(id, ctx, ['nhap'], 'da_gui', 'bao_gia.gui', (q) => {
      if (isQuoteExpired(q.validUntil)) throw new BadRequestException('Báo giá đã quá ngày hiệu lực; sửa ngày hiệu lực trước khi gửi');
    });
  }

  /** Sửa đổi báo giá đã gửi hoặc bị từ chối: tăng phiên bản và quay về soạn. */
  async revise(id: string, ctx: AuthContext) {
    await this.db.transaction(async (tx) => {
      const q = await this.lockForEdit(id, ctx, tx);
      if (q.status !== 'da_gui' && q.status !== 'tu_choi') throw new BadRequestException('Chỉ sửa đổi báo giá đã gửi hoặc bị từ chối');
      await tx.update(quotes).set({ status: 'nhap', version: q.version + 1, rejectReason: null, updatedAt: new Date() }).where(eq(quotes.id, id));
      await this.audit.record({ actorUserId: ctx.user.id, action: 'bao_gia.sua_doi', entityType: 'quote', entityId: id, detail: { phienBanMoi: q.version + 1 } }, tx);
    });
  }

  async reject(id: string, reason: string, ctx: AuthContext) {
    await this.transition(id, ctx, ['da_gui'], 'tu_choi', 'bao_gia.tu_choi', undefined, { rejectReason: reason }, { lyDo: reason });
  }

  async cancel(id: string, reason: string, ctx: AuthContext) {
    await this.transition(id, ctx, ['nhap', 'da_gui', 'tu_choi'], 'huy', 'bao_gia.huy', undefined, { rejectReason: reason }, { lyDo: reason });
  }

  /**
   * Đối tác chấp nhận báo giá: sinh hợp đồng nháp.
   * - Báo giá mua: một hợp đồng mua.
   * - Báo giá bán, mua đứt: hợp đồng mua (từ báo giá mua nguồn) và hợp đồng bán.
   * - Báo giá bán, môi giới: hợp đồng mua bán trực tiếp (nhà cung cấp – người mua) và hợp đồng dịch vụ môi giới với bên bán.
   * Phí trọn gói do bên bán trả nên ghi trên hợp đồng mua (mua đứt, khấu trừ khi trả tiền hàng) hoặc hợp đồng môi giới.
   */
  async accept(id: string, dealType: 'mua_dut' | 'moi_gioi', ctx: AuthContext) {
    return this.db.transaction(async (tx) => {
      const q = await this.lockForEdit(id, ctx, tx);
      if (q.status !== 'da_gui') throw new BadRequestException('Chỉ chấp nhận báo giá đã gửi');
      if (isQuoteExpired(q.validUntil)) throw new BadRequestException('Báo giá đã hết hiệu lực');
      const created: { id: string; code: string; kind: ContractKind }[] = [];
      const make = async (kind: ContractKind, seller: string | null, buyer: string | null, from: Quote, feeRatePct: number | null) => {
        const c = await this.contracts.create(
          { kind, sellerPartnerId: seller, buyerPartnerId: buyer, commodityId: from.commodityId, ownerUserId: q.ownerUserId, terms: this.termsFrom(from, feeRatePct) },
          ctx,
          tx,
        );
        created.push({ ...c, kind });
      };

      if (q.kind === 'mua') {
        await make('mua', q.partnerId, null, q, null);
      } else {
        if (!q.sourceQuoteId) throw new BadRequestException('Báo giá bán chưa chọn báo giá mua làm nguồn');
        const [src] = await tx.select().from(quotes).where(eq(quotes.id, q.sourceQuoteId)).for('update');
        if (!src || (src.status !== 'da_gui' && src.status !== 'chap_nhan')) throw new BadRequestException('Báo giá mua nguồn phải ở trạng thái đã gửi hoặc đã chấp nhận');
        if (isQuoteExpired(src.validUntil)) throw new BadRequestException('Báo giá mua nguồn đã hết hiệu lực');
        if (dealType === 'mua_dut') {
          await make('mua', src.partnerId, null, src, q.feeRatePct);
          await make('ban', null, q.partnerId, q, null);
        } else {
          await make('mua_ban_truc_tiep', src.partnerId, q.partnerId, q, null);
          await make('moi_gioi', src.partnerId, q.partnerId, q, q.feeRatePct);
        }
        if (src.status !== 'chap_nhan') {
          await tx
            .update(quotes)
            .set({ status: 'chap_nhan', contractIds: sql`${quotes.contractIds} || ${JSON.stringify([created[0].id])}::jsonb`, updatedAt: new Date() })
            .where(eq(quotes.id, src.id));
        } else {
          await tx.update(quotes).set({ contractIds: sql`${quotes.contractIds} || ${JSON.stringify([created[0].id])}::jsonb`, updatedAt: new Date() }).where(eq(quotes.id, src.id));
        }
      }
      await tx.update(quotes).set({ status: 'chap_nhan', contractIds: created.map((c) => c.id), updatedAt: new Date() }).where(eq(quotes.id, id));
      await this.audit.record(
        { actorUserId: ctx.user.id, action: 'bao_gia.chap_nhan', entityType: 'quote', entityId: id, detail: { loaiGiaoDich: dealType, hopDong: created.map((c) => c.code) } },
        tx,
      );
      return { hopDong: created };
    });
  }

  // ---------- Nội bộ ----------

  private termsFrom(q: Quote, feeRatePct: number | null): ContractTerms {
    return {
      soLuong: q.quantity,
      donVi: q.unit as ContractTerms['donVi'],
      dungSaiPhanTram: 5,
      donGia: q.unitPrice,
      tienTe: q.currency as ContractTerms['tienTe'],
      tyGiaUsd: q.currency === 'USD' ? null : q.fxPerUsd,
      incoterms: q.incoterms as ContractTerms['incoterms'],
      cangDi: q.portFrom,
      cangDen: q.portTo,
      lichGiao: q.deliveryTime ?? '',
      dieuKhoanThanhToan: q.paymentTerms ?? '',
      tyLePhiPhanTram: feeRatePct,
      ghiChu: [q.spec, q.certifications ? `Chứng nhận: ${q.certifications}` : null, `Theo báo giá ${q.code} phiên bản ${q.version}`].filter(Boolean).join('\n'),
    };
  }

  private columns(input: Omit<QuoteInput, 'kind' | 'partnerId' | 'commodityId'>) {
    return {
      sourceQuoteId: input.sourceQuoteId ?? null,
      quantity: input.quantity,
      unit: input.unit,
      unitPrice: input.unitPrice,
      currency: input.currency,
      fxPerUsd: input.currency === 'USD' ? null : (input.fxPerUsd ?? null),
      incoterms: input.incoterms,
      portFrom: input.portFrom ?? null,
      portTo: input.portTo ?? null,
      validUntil: input.validUntil,
      spec: input.spec ?? null,
      certifications: input.certifications ?? null,
      deliveryTime: input.deliveryTime ?? null,
      deliveryMonth: input.deliveryMonth ?? null,
      paymentTerms: input.paymentTerms ?? null,
      feeRatePct: input.feeRatePct ?? null,
      note: input.note ?? null,
    };
  }

  /** Đối tác đúng vai, mặt hàng còn dùng, báo giá nguồn hợp lệ. Thẩm định chỉ bắt buộc khi sinh hợp đồng. */
  private async checkRefs(input: QuoteInput, tx: DbExecutor) {
    const want = PARTNER_ROLE_FOR[input.kind];
    const [p] = await tx.select({ id: partners.id, name: partners.name }).from(partners).where(eq(partners.id, input.partnerId));
    if (!p) throw new BadRequestException('Không tìm thấy đối tác');
    const [r] = await tx.select().from(partnerRoles).where(and(eq(partnerRoles.partnerId, p.id), eq(partnerRoles.role, want.role)));
    if (!r) throw new BadRequestException(`${p.name} chưa được đánh dấu là ${want.label}`);
    const [com] = await tx.select().from(commodities).where(eq(commodities.id, input.commodityId));
    if (!com || !com.active) throw new BadRequestException('Mặt hàng không có hoặc đã ngừng');
    if (input.kind === 'mua' && input.sourceQuoteId) throw new BadRequestException('Báo giá mua không có báo giá nguồn');
    if (input.kind === 'mua' && input.feeRatePct != null) throw new BadRequestException('Tỷ lệ phí trọn gói ghi trên báo giá bán');
    if (input.sourceQuoteId) {
      const [s] = await tx.select().from(quotes).where(eq(quotes.id, input.sourceQuoteId));
      if (!s || s.kind !== 'mua') throw new BadRequestException('Báo giá nguồn phải là báo giá mua');
      if (s.commodityId !== input.commodityId) throw new BadRequestException('Báo giá nguồn phải cùng mặt hàng');
      if (s.status === 'huy' || s.status === 'tu_choi') throw new BadRequestException('Báo giá nguồn đã huỷ hoặc bị từ chối');
    }
  }

  private async transition(
    id: string,
    ctx: AuthContext,
    from: QuoteStatus[],
    to: QuoteStatus,
    action: string,
    check?: (q: Quote) => void,
    extra: Partial<typeof quotes.$inferInsert> = {},
    detail: Record<string, unknown> = {},
  ) {
    await this.db.transaction(async (tx) => {
      const q = await this.lockForEdit(id, ctx, tx);
      if (!from.includes(q.status as QuoteStatus)) throw new BadRequestException('Báo giá không ở trạng thái cho phép thao tác này');
      check?.(q);
      await tx.update(quotes).set({ status: to, ...extra, updatedAt: new Date() }).where(eq(quotes.id, id));
      await this.audit.record({ actorUserId: ctx.user.id, action, entityType: 'quote', entityId: id, detail }, tx);
    });
  }

  private async contractsSummary(ids: string[]) {
    return this.db
      .select({ id: contracts.id, code: contracts.code, kind: contracts.kind, status: contracts.status })
      .from(contracts)
      .where(inArray(contracts.id, ids))
      .orderBy(asc(contracts.code));
  }

  private present(q: Quote) {
    return {
      id: q.id,
      code: q.code,
      kind: q.kind,
      partnerId: q.partnerId,
      commodityId: q.commodityId,
      sourceQuoteId: q.sourceQuoteId,
      status: q.status,
      version: q.version,
      quantity: q.quantity,
      unit: q.unit,
      unitPrice: q.unitPrice,
      currency: q.currency,
      fxPerUsd: q.fxPerUsd,
      incoterms: q.incoterms,
      portFrom: q.portFrom,
      deliveryMonth: q.deliveryMonth,
      portTo: q.portTo,
      validUntil: q.validUntil,
      hetHieuLuc: isQuoteExpired(q.validUntil),
      spec: q.spec,
      certifications: q.certifications,
      deliveryTime: q.deliveryTime,
      paymentTerms: q.paymentTerms,
      feeRatePct: q.feeRatePct,
      note: q.note,
      rejectReason: q.rejectReason,
      giaTri: quoteValue(q),
      ownerUserId: q.ownerUserId,
      updatedAt: q.updatedAt,
    };
  }

  private async nextCode(kind: QuoteKind, tx: DbExecutor) {
    const prefix = `${kind === 'mua' ? 'BGM' : 'BGB'}-${new Date().getUTCFullYear()}-`;
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${'quote_code:' + prefix}))`);
    const [{ max }] = await tx
      .select({ max: sql<number | null>`max(substring(${quotes.code}, ${prefix.length + 1}::int)::int)` })
      .from(quotes)
      .where(sql`${quotes.code} like ${prefix + '%'}`);
    return `${prefix}${String((max ?? 0) + 1).padStart(4, '0')}`;
  }

  private canSeeAll(ctx: AuthContext) {
    return ctx.permissions.includes('HOP_DONG_XEM_TAT_CA');
  }
  private canDraftAll(ctx: AuthContext) {
    return ctx.permissions.includes('HOP_DONG_SOAN_TAT_CA');
  }
  private assertCanDraft(ctx: AuthContext) {
    if (!this.canDraftAll(ctx) && !ctx.permissions.includes('HOP_DONG_SOAN_CUA_MINH')) throw new ForbiddenException('Bạn không có quyền lập báo giá');
  }
  private assertCanUse(ctx: AuthContext) {
    if (!this.canSeeAll(ctx)) this.assertCanDraft(ctx);
  }
  private assertCanView(q: Quote, ctx: AuthContext) {
    if (this.canSeeAll(ctx)) return;
    if (ctx.permissions.includes('HOP_DONG_SOAN_CUA_MINH') && q.ownerUserId === ctx.user.id) return;
    throw new ForbiddenException('Bạn không xem được báo giá này');
  }
  private canEdit(q: Quote, ctx: AuthContext) {
    return this.canDraftAll(ctx) || (ctx.permissions.includes('HOP_DONG_SOAN_CUA_MINH') && q.ownerUserId === ctx.user.id);
  }
  private async lockForEdit(id: string, ctx: AuthContext, tx: DbExecutor) {
    this.assertCanDraft(ctx);
    const [q] = await tx.select().from(quotes).where(eq(quotes.id, id)).for('update');
    if (!q) throw new NotFoundException('Không tìm thấy báo giá');
    if (!this.canEdit(q, ctx)) throw new ForbiddenException('Bạn chỉ sửa được báo giá do mình phụ trách');
    return q;
  }
}

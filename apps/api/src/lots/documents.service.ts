import { BadRequestException, ForbiddenException, Inject, Injectable, NotFoundException, PayloadTooLargeException } from '@nestjs/common';
import { randomBytes, randomUUID } from 'node:crypto';
import { decrypt, encrypt } from '../common/crypto';
import { loadConfig } from '../config/config';
import { and, asc, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import type { AuthContext } from '../auth/auth.types';
import { AuditService } from '../audit/audit.service';
import { ContractsService } from '../contracts/contracts.service';
import { salesGateProblems } from '../sales/sales-gate';
import { DB, Db, DbExecutor } from '../db/db';
import {
  commodities,
  contracts,
  DocRule,
  docRules,
  documentFiles,
  ExportLot,
  exportLots,
  feeRequests,
  gateOverrides,
  lotAllocations,
  lotDocuments,
  lotEvents,
  partners,
  partnerUsers,
  purchaseLots,
  users,
} from '../db/schema';
import { FILE_STORE, FileStore } from '../documents/file-store';
import { decryptBytes, detectType, encryptBytes, LINK_TTL_MS, MAX_FILE_BYTES, safeFileName, sha256Bytes, signLink, verifyLink } from '../documents/file.rules';
import { buildChecklist, completionDocProblems, DocRow, feeAmount, reviewOverdue, shippingDocProblems } from '../documents/doc.rules';

export interface RuleInput {
  code: string;
  name: string;
  sector: string | null;
  market: string | null;
  incoterms: string[] | null;
  dealType: string | null;
  requirement: string;
  stage: string;
  scope: string;
  party: string;
  issuer: string | null;
  legalBasis: string | null;
  uncertain: boolean;
  note: string | null;
  active: boolean;
}

export interface UploadedFile {
  originalname: string;
  size: number;
  buffer: Buffer;
}

export interface DocUpdateInput {
  status: 'thieu' | 'dang_xin' | 'nhap';
  number: string | null;
  issuedOn: string | null;
  issuer: string | null;
  expiresOn: string | null;
  note: string | null;
}

const STATUS_LABEL: Record<string, string> = { thieu: 'chưa có', dang_xin: 'đang xin', nhap: 'có bản nháp, chờ duyệt' };

/** Trình nhận tệp đọc tên tệp theo bảng mã latin1; đổi lại sang UTF-8 để giữ dấu tiếng Việt. */
const utf8Name = (n: string) => {
  const u = Buffer.from(n, 'latin1').toString('utf8');
  return u.includes('\uFFFD') ? n : u;
};

const today = () => new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 10);

/** Chứng từ của lô, quy tắc chứng từ, cổng chặn xếp tàu và đề nghị thu phí theo lô. */
@Injectable()
export class DocumentsService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly contractsService: ContractsService,
    private readonly audit: AuditService,
    @Inject(FILE_STORE) private readonly store: FileStore,
  ) {}

  private get masterKey() {
    return Buffer.from(loadConfig().APP_KEY, 'base64');
  }

  // ---------- Quyền ----------

  private canManageLot(lot: { ownerUserId: string }, ctx: AuthContext) {
    return ctx.permissions.includes('LO_HANG_PHAN_CONG') || (ctx.permissions.includes('LO_HANG_QUAN_LY_CUA_MINH') && lot.ownerUserId === ctx.user.id);
  }
  private assertCanViewLot(lot: { ownerUserId: string }, ctx: AuthContext) {
    if (ctx.permissions.includes('LO_HANG_XEM_TAT_CA') || ctx.permissions.includes('CHUNG_TU_XEM_TAT_CA')) return;
    if (ctx.permissions.includes('LO_HANG_QUAN_LY_CUA_MINH') && lot.ownerUserId === ctx.user.id) return;
    throw new ForbiddenException('Bạn không xem được lô này');
  }
  private assertCanManageLot(lot: { ownerUserId: string }, ctx: AuthContext) {
    if (!this.canManageLot(lot, ctx)) throw new ForbiddenException('Bạn chỉ cập nhật được chứng từ của lô do mình phụ trách');
  }
  /** Đối tác (nhà cung cấp) mà tài khoản cổng này thuộc về; null với tài khoản nội bộ. */
  async portalPartner(ctx: AuthContext, exec: DbExecutor = this.db): Promise<string | null> {
    if (!ctx.roles.includes('NHA_CUNG_CAP')) return null;
    const [r] = await exec.select({ p: partnerUsers.partnerId }).from(partnerUsers).where(eq(partnerUsers.userId, ctx.user.id));
    if (!r) throw new ForbiddenException('Tài khoản chưa gắn với nhà cung cấp nào');
    return r.p;
  }

  /** Nhà cung cấp có hàng (phân bổ còn hiệu lực) trong lô xuất này không. */
  async supplierInLot(lotId: string, partnerId: string, exec: DbExecutor = this.db) {
    const [r] = await exec
      .select({ id: lotAllocations.id })
      .from(lotAllocations)
      .innerJoin(purchaseLots, eq(purchaseLots.id, lotAllocations.purchaseLotId))
      .where(and(eq(lotAllocations.exportLotId, lotId), eq(purchaseLots.supplierPartnerId, partnerId), isNull(lotAllocations.cancelledAt)))
      .limit(1);
    return !!r;
  }

  /** Dòng chứng từ thuộc phần việc của nhà cung cấp: dòng mang tên họ, hoặc dòng chung cả lô do nhà cung cấp lập (ví dụ thỏa thuận ủy quyền). */
  async isSupplierDoc(d: { exportLotId: string; supplierPartnerId: string | null; party: string }, partnerId: string, exec: DbExecutor = this.db) {
    if (d.supplierPartnerId) return d.supplierPartnerId === partnerId;
    return d.party === 'nha_cung_cap' && (await this.supplierInLot(d.exportLotId, partnerId, exec));
  }

  private async assertCanEditDoc(d: typeof lotDocuments.$inferSelect, lot: ExportLot, ctx: AuthContext, exec: DbExecutor) {
    const partner = await this.portalPartner(ctx, exec);
    if (partner === null) return this.assertCanManageLot(lot, ctx);
    if (!(await this.isSupplierDoc(d, partner, exec))) throw new ForbiddenException('Chứng từ này không thuộc phần việc của quý công ty');
  }

  private async assertCanViewDoc(d: typeof lotDocuments.$inferSelect, lot: ExportLot, ctx: AuthContext, exec: DbExecutor) {
    const partner = await this.portalPartner(ctx, exec);
    if (partner === null) return this.assertCanViewLot(lot, ctx);
    if (!(await this.isSupplierDoc(d, partner, exec))) throw new ForbiddenException('Chứng từ này không thuộc phần việc của quý công ty');
  }

  private canApprove(ctx: AuthContext) {
    return ctx.permissions.includes('CHUNG_TU_DUYET_CHECKLIST');
  }

  // ---------- Quy tắc chứng từ ----------

  async listRules(ctx: AuthContext, filter: { market?: string; sector?: string }) {
    if (!['MA_TRAN_DUYET', 'CHUNG_TU_XEM_TAT_CA', 'CHUNG_TU_KIEM_TRA'].some((p) => ctx.permissions.includes(p as never))) {
      throw new ForbiddenException('Bạn không xem được quy tắc chứng từ');
    }
    const rows = await this.db
      .select({ r: docRules, updatedByName: users.fullName })
      .from(docRules)
      .leftJoin(users, eq(users.id, docRules.updatedBy))
      .where(
        and(
          filter.market ? sql`(${docRules.market} = ${filter.market} or ${docRules.market} is null)` : undefined,
          filter.sector ? sql`(${docRules.sector} = ${filter.sector} or ${docRules.sector} is null)` : undefined,
        ),
      )
      .orderBy(sql`${docRules.market} nulls first`, sql`${docRules.sector} nulls first`, asc(docRules.stage), asc(docRules.name));
    return rows.map((x) => ({ ...x.r, updatedByName: x.updatedByName, quaHanRaSoat: reviewOverdue(x.r.reviewedAt) }));
  }

  private assertCanEditRules(ctx: AuthContext) {
    if (!ctx.permissions.includes('MA_TRAN_DUYET')) throw new ForbiddenException('Chỉ nhóm rà soát ma trận (Ban Giám đốc, Kế toán trưởng, Trưởng phòng KD) sửa được quy tắc');
  }

  async createRule(input: RuleInput, ctx: AuthContext) {
    this.assertCanEditRules(ctx);
    return this.db.transaction(async (tx) => {
      const [r] = await tx.insert(docRules).values({ ...input, reviewedAt: today(), updatedBy: ctx.user.id }).returning();
      await this.audit.record({ actorUserId: ctx.user.id, action: 'quy_tac_chung_tu.tao', entityType: 'doc_rule', entityId: r.id, detail: { ...input } }, tx);
      return { id: r.id };
    });
  }

  async updateRule(id: string, input: RuleInput, ctx: AuthContext) {
    this.assertCanEditRules(ctx);
    await this.db.transaction(async (tx) => {
      const [before] = await tx.select().from(docRules).where(eq(docRules.id, id)).for('update');
      if (!before) throw new NotFoundException('Không tìm thấy quy tắc');
      await tx.update(docRules).set({ ...input, reviewedAt: today(), updatedBy: ctx.user.id, updatedAt: new Date() }).where(eq(docRules.id, id));
      await this.audit.record({ actorUserId: ctx.user.id, action: 'quy_tac_chung_tu.sua', entityType: 'doc_rule', entityId: id, detail: { truoc: before, sau: input } }, tx);
    });
  }

  async markRuleReviewed(id: string, ctx: AuthContext) {
    this.assertCanEditRules(ctx);
    await this.db.transaction(async (tx) => {
      const [r] = await tx.update(docRules).set({ reviewedAt: today(), updatedBy: ctx.user.id, updatedAt: new Date() }).where(eq(docRules.id, id)).returning();
      if (!r) throw new NotFoundException('Không tìm thấy quy tắc');
      await this.audit.record({ actorUserId: ctx.user.id, action: 'quy_tac_chung_tu.da_ra_soat', entityType: 'doc_rule', entityId: id, detail: {} }, tx);
    });
  }

  // ---------- Checklist của lô ----------

  /**
   * Sinh hoặc cập nhật checklist theo quy tắc hiện hành và các nhà cung cấp đang có hàng trong lô.
   * Dòng không còn áp dụng được đánh dấu, không xoá; dòng đã có lại thì bật lại.
   */
  async syncChecklist(lot: ExportLot, ctx: AuthContext, tx: DbExecutor) {
    if (lot.status === 'da_huy') return;
    const s = await this.contractsService.signedTerms(lot.counterContractId, tx);
    const [c] = await tx.select({ sector: commodities.sector }).from(commodities).where(eq(commodities.id, lot.commodityId));
    const sup = await tx
      .selectDistinct({ id: purchaseLots.supplierPartnerId })
      .from(lotAllocations)
      .innerJoin(purchaseLots, eq(purchaseLots.id, lotAllocations.purchaseLotId))
      .where(and(eq(lotAllocations.exportLotId, lot.id), isNull(lotAllocations.cancelledAt)));
    const rules = await tx.select().from(docRules).where(eq(docRules.active, true));
    const want = buildChecklist(rules, {
      sector: c.sector,
      market: lot.market,
      incoterms: s?.terms.incoterms ?? '',
      dealType: lot.dealType,
      suppliers: sup.map((x) => x.id),
    });
    const have = await tx.select().from(lotDocuments).where(eq(lotDocuments.exportLotId, lot.id));
    const key = (code: string, s: string | null) => `${code}|${s ?? ''}`;
    const haveMap = new Map(have.map((h) => [key(h.code, h.supplierPartnerId), h]));
    const wantKeys = new Set(want.map((w) => key(w.code, w.supplierPartnerId)));
    let added = 0;
    for (const w of want) {
      const h = haveMap.get(key(w.code, w.supplierPartnerId));
      if (!h) {
        await tx.insert(lotDocuments).values({ exportLotId: lot.id, ...w, updatedBy: ctx.user.id });
        added++;
      } else if (h.obsolete || (h.ruleId && (h.name !== w.name || h.requirement !== w.requirement || h.stage !== w.stage))) {
        await tx.update(lotDocuments).set({ obsolete: false, name: w.name, requirement: w.requirement, stage: w.stage, party: w.party }).where(eq(lotDocuments.id, h.id));
      }
    }
    const stale = have.filter((h) => !h.obsolete && !wantKeys.has(key(h.code, h.supplierPartnerId)));
    if (stale.length) await tx.update(lotDocuments).set({ obsolete: true }).where(inArray(lotDocuments.id, stale.map((x) => x.id)));
    if (added || stale.length) {
      await tx.insert(lotEvents).values({ exportLotId: lot.id, kind: 'checklist', note: `Thêm ${added}, bỏ ${stale.length} dòng chứng từ`, actorUserId: ctx.user.id });
    }
  }

  async resync(lotId: string, ctx: AuthContext) {
    await this.db.transaction(async (tx) => {
      const lot = await this.lockLot(lotId, tx);
      this.assertCanManageLot(lot, ctx);
      await this.syncChecklist(lot, ctx, tx);
    });
  }

  private async docRows(lotId: string, exec: DbExecutor) {
    return exec
      .select({
        d: lotDocuments,
        supplierName: partners.name,
        updatedByName: sql<string | null>`(select full_name from users u where u.id = ${lotDocuments.updatedBy})`,
        approvedByName: sql<string | null>`(select full_name from users u where u.id = ${lotDocuments.approvedBy})`,
        quaHanRaSoat: sql<boolean>`coalesce((select (current_date - r.reviewed_at::date) > 365 from doc_rules r where r.id = ${lotDocuments.ruleId}), false)`,
        uncertain: sql<boolean>`coalesce((select r.uncertain from doc_rules r where r.id = ${lotDocuments.ruleId}), false)`,
        legalBasis: sql<string | null>`(select r.legal_basis from doc_rules r where r.id = ${lotDocuments.ruleId})`,
      })
      .from(lotDocuments)
      .leftJoin(partners, eq(partners.id, lotDocuments.supplierPartnerId))
      .where(eq(lotDocuments.exportLotId, lotId))
      .orderBy(asc(lotDocuments.stage), sql`${lotDocuments.supplierPartnerId} nulls first`, asc(lotDocuments.requirement), asc(lotDocuments.name));
  }

  private toDocRow(x: { d: typeof lotDocuments.$inferSelect; supplierName: string | null }): DocRow {
    return { name: x.d.name, requirement: x.d.requirement, stage: x.d.stage, party: x.d.party, status: x.d.status, expiresOn: x.d.expiresOn, supplierName: x.supplierName };
  }

  /** Chứng từ còn thiếu để sang "xếp tàu" (bỏ qua nếu Giám đốc đã mở chặn và chưa dùng). */
  async shippingProblems(lot: ExportLot, exec: DbExecutor): Promise<{ problems: string[]; overridden: boolean }> {
    const problems = await this.rawShippingProblems(lot, exec);
    const [ov] = await exec.select({ id: gateOverrides.id }).from(gateOverrides).where(and(eq(gateOverrides.exportLotId, lot.id), isNull(gateOverrides.usedAt))).limit(1);
    return { problems: ov ? [] : problems, overridden: !!ov && problems.length > 0 };
  }

  /** Thiếu chứng từ trước xếp tàu, cộng điều kiện bán hàng (mẫu trước xuất, chốt giá), chưa xét mở chặn. */
  private async rawShippingProblems(lot: ExportLot, exec: DbExecutor): Promise<string[]> {
    const rows = (await this.docRows(lot.id, exec)).filter((x) => !x.d.obsolete);
    const counter = await this.contractsService.signedTerms(lot.counterContractId, exec);
    return [...shippingDocProblems(rows.map((x) => this.toDocRow(x)), lot.etd, today()), ...(await salesGateProblems(lot, counter?.terms ?? null, exec))];
  }

  async completionProblems(lot: ExportLot, exec: DbExecutor): Promise<string[]> {
    const rows = (await this.docRows(lot.id, exec)).filter((x) => !x.d.obsolete);
    return completionDocProblems(rows.map((x) => this.toDocRow(x)));
  }

  async consumeOverride(lotId: string, tx: DbExecutor) {
    await tx.update(gateOverrides).set({ usedAt: new Date() }).where(and(eq(gateOverrides.exportLotId, lotId), isNull(gateOverrides.usedAt)));
  }

  async checklist(lotId: string, ctx: AuthContext) {
    const lot = await this.findLot(lotId, this.db);
    this.assertCanViewLot(lot, ctx);
    const rows = await this.docRows(lotId, this.db);
    const active = rows.filter((x) => !x.d.obsolete);
    const ship = await this.shippingProblems(lot, this.db);
    const raw = await this.rawShippingProblems(lot, this.db);
    const manage = this.canManageLot(lot, ctx) && lot.status !== 'da_huy' && lot.status !== 'hoan_tat';
    const approver = this.canApprove(ctx);
    const overrides = await this.db
      .select({ o: gateOverrides, grantedByName: users.fullName })
      .from(gateOverrides)
      .innerJoin(users, eq(users.id, gateOverrides.grantedBy))
      .where(eq(gateOverrides.exportLotId, lotId))
      .orderBy(desc(gateOverrides.grantedAt));
    const files = rows.length
      ? await this.db
          .select({ f: documentFiles, uploadedByName: users.fullName })
          .from(documentFiles)
          .innerJoin(users, eq(users.id, documentFiles.uploadedBy))
          .where(inArray(documentFiles.lotDocumentId, rows.map((x) => x.d.id)))
          .orderBy(desc(documentFiles.version))
      : [];
    const filesOf = (docId: string) =>
      files
        .filter((x) => x.f.lotDocumentId === docId)
        .map((x) => ({ id: x.f.id, phienBan: x.f.version, ten: x.f.fileName, loai: x.f.mimeType, kichThuoc: x.f.sizeBytes, maBam: x.f.sha256, quetVirus: x.f.scanStatus, nguoiNop: x.uploadedByName, luc: x.f.uploadedAt }));
    const ok = (s: string) => s === 'da_duyet' || s === 'da_gui' || s === 'khong_ap_dung';
    const bb = active.filter((x) => x.d.requirement === 'bb');
    return {
      tongBatBuoc: bb.length,
      daDuBatBuoc: bb.filter((x) => ok(x.d.status)).length,
      thieuTruocXepTau: raw,
      daMoChan: ship.overridden,
      moChan: overrides.map((x) => ({ lyDo: x.o.reason, thieu: x.o.missing, nguoi: x.grantedByName, luc: x.o.grantedAt, daDung: !!x.o.usedAt })),
      chungTu: rows.map((x) => ({
        ...x.d,
        supplierName: x.supplierName,
        updatedByName: x.updatedByName,
        approvedByName: x.approvedByName,
        quaHanRaSoat: x.quaHanRaSoat,
        chuaChac: x.uncertain,
        legalBasis: x.legalBasis,
        tep: filesOf(x.d.id),
        quyen: {
          taiTep: manage && !x.d.obsolete && x.d.status !== 'da_gui' && x.d.status !== 'khong_ap_dung',
          capNhat: manage && !x.d.obsolete && x.d.status !== 'da_gui' && x.d.status !== 'khong_ap_dung',
          duyet: approver && !x.d.obsolete && x.d.status === 'nhap' && x.d.updatedBy !== ctx.user.id && files.some((f) => f.f.lotDocumentId === x.d.id),
          traLai: approver && !x.d.obsolete && (x.d.status === 'nhap' || x.d.status === 'da_duyet'),
          daGui: manage && !x.d.obsolete && x.d.status === 'da_duyet',
          khongApDung: approver && !x.d.obsolete && x.d.status !== 'da_gui' && x.d.status !== 'khong_ap_dung',
        },
      })),
      quyen: {
        dongBo: manage,
        moChan: ctx.permissions.includes('LO_HANG_MO_CHAN') && lot.status === 'dat_cho' && raw.length > 0 && !ship.overridden,
      },
    };
  }

  async updateDoc(id: string, input: DocUpdateInput, ctx: AuthContext) {
    await this.db.transaction(async (tx) => {
      const { d, lot } = await this.lockDoc(id, tx);
      await this.assertCanEditDoc(d, lot, ctx, tx);
      this.assertLotOpen(lot);
      if (d.status === 'da_gui' || d.status === 'khong_ap_dung') throw new BadRequestException('Chứng từ đã gửi hoặc đã đánh dấu không áp dụng');
      if (input.status === 'nhap' && !input.number) throw new BadRequestException('Ghi số chứng từ khi đã có bản nháp hoặc bản chính');
      if (input.issuedOn && input.expiresOn && input.expiresOn < input.issuedOn) throw new BadRequestException('Ngày hết hạn trước ngày cấp');
      // Sửa chứng từ đã duyệt thì phải duyệt lại
      await tx
        .update(lotDocuments)
        .set({ ...input, updatedBy: ctx.user.id, updatedAt: new Date(), approvedBy: null, approvedAt: null })
        .where(eq(lotDocuments.id, id));
      await this.docEvent(lot.id, 'chung_tu', `${d.name}: ${STATUS_LABEL[input.status]}${input.number ? ` · số ${input.number}` : ''}${d.status === 'da_duyet' ? ' (sửa sau khi duyệt, cần duyệt lại)' : ''}`, ctx, tx);
    });
  }

  async approveDoc(id: string, ctx: AuthContext) {
    if (!this.canApprove(ctx)) throw new ForbiddenException('Chỉ Trưởng phòng kinh doanh duyệt chứng từ');
    await this.db.transaction(async (tx) => {
      const { d, lot } = await this.lockDoc(id, tx);
      this.assertLotOpen(lot);
      if (d.status !== 'nhap') throw new BadRequestException('Chỉ duyệt chứng từ đã có bản nháp hoặc bản chính');
      if (d.updatedBy === ctx.user.id) throw new ForbiddenException('Người cập nhật chứng từ không tự duyệt (nguyên tắc 4 mắt)');
      const [f] = await tx.select({ id: documentFiles.id }).from(documentFiles).where(eq(documentFiles.lotDocumentId, id)).limit(1);
      if (!f) throw new BadRequestException('Chưa có tệp chứng từ để đối chiếu; tải tệp lên trước khi duyệt');
      await tx.update(lotDocuments).set({ status: 'da_duyet', approvedBy: ctx.user.id, approvedAt: new Date() }).where(eq(lotDocuments.id, id));
      await this.docEvent(lot.id, 'duyet_chung_tu', d.name, ctx, tx);
    });
  }

  async returnDoc(id: string, reason: string, ctx: AuthContext) {
    if (!this.canApprove(ctx)) throw new ForbiddenException('Chỉ Trưởng phòng kinh doanh trả lại chứng từ');
    await this.db.transaction(async (tx) => {
      const { d, lot } = await this.lockDoc(id, tx);
      this.assertLotOpen(lot);
      if (d.status !== 'nhap' && d.status !== 'da_duyet') throw new BadRequestException('Chỉ trả lại chứng từ đang chờ duyệt hoặc đã duyệt');
      await tx.update(lotDocuments).set({ status: 'dang_xin', note: `Trả lại: ${reason}`, approvedBy: null, approvedAt: null, updatedAt: new Date() }).where(eq(lotDocuments.id, id));
      await this.docEvent(lot.id, 'tra_lai_chung_tu', `${d.name}: ${reason}`, ctx, tx);
    });
  }

  async markSent(id: string, ctx: AuthContext) {
    await this.db.transaction(async (tx) => {
      const { d, lot } = await this.lockDoc(id, tx);
      this.assertCanManageLot(lot, ctx);
      if (d.status !== 'da_duyet') throw new BadRequestException('Chỉ gửi chứng từ đã duyệt');
      await tx.update(lotDocuments).set({ status: 'da_gui', updatedAt: new Date() }).where(eq(lotDocuments.id, id));
      await this.docEvent(lot.id, 'gui_chung_tu', d.name, ctx, tx);
    });
  }

  async markNotApplicable(id: string, reason: string, ctx: AuthContext) {
    if (!this.canApprove(ctx)) throw new ForbiddenException('Chỉ Trưởng phòng kinh doanh đánh dấu không áp dụng');
    await this.db.transaction(async (tx) => {
      const { d, lot } = await this.lockDoc(id, tx);
      this.assertLotOpen(lot);
      if (d.status === 'da_gui') throw new BadRequestException('Chứng từ đã gửi');
      await tx.update(lotDocuments).set({ status: 'khong_ap_dung', note: `Không áp dụng: ${reason}`, approvedBy: ctx.user.id, approvedAt: new Date(), updatedAt: new Date() }).where(eq(lotDocuments.id, id));
      await this.docEvent(lot.id, 'khong_ap_dung', `${d.name}: ${reason}`, ctx, tx);
    });
  }

  // ---------- Tệp chứng từ ----------

  /**
   * Nộp tệp cho một dòng chứng từ: kiểm loại theo nội dung, mã hoá, lưu, ghi mã băm.
   * Nộp lại tạo phiên bản mới; chứng từ đã duyệt mà nộp tệp mới thì phải duyệt lại.
   */
  async uploadFile(docId: string, file: UploadedFile | undefined, ctx: AuthContext) {
    if (!file || !file.size) throw new BadRequestException('Chọn tệp để tải lên');
    if (file.size > MAX_FILE_BYTES) throw new PayloadTooLargeException('Tệp vượt 25 MB');
    const type = detectType(file.buffer);
    if (!type) throw new BadRequestException('Chỉ nhận tệp PDF, JPG hoặc PNG');
    const hash = sha256Bytes(file.buffer);
    const key = randomBytes(32);
    const storageKey = `chung-tu/${docId}/${randomUUID()}`;
    // Lưu tệp trước; nếu ghi cơ sở dữ liệu lỗi thì tệp mồ côi không ai trỏ tới, không lộ dữ liệu.
    const { d, lot } = await this.db.transaction(async (tx) => {
      const r = await this.lockDoc(docId, tx);
      await this.assertCanEditDoc(r.d, r.lot, ctx, tx);
      this.assertLotOpen(r.lot);
      if (r.d.status === 'da_gui' || r.d.status === 'khong_ap_dung') throw new BadRequestException('Chứng từ đã gửi hoặc đã đánh dấu không áp dụng');
      return r;
    });
    await this.store.put(storageKey, encryptBytes(file.buffer, key));
    return this.db.transaction(async (tx) => {
      await this.lockDoc(docId, tx);
      const [{ v }] = await tx.select({ v: sql<number>`coalesce(max(${documentFiles.version}), 0)::int` }).from(documentFiles).where(eq(documentFiles.lotDocumentId, docId));
      const name = safeFileName(utf8Name(file.originalname), type.ext);
      const [row] = await tx
        .insert(documentFiles)
        .values({ lotDocumentId: docId, version: v + 1, fileName: name, mimeType: type.mime, sizeBytes: file.size, sha256: hash, storageKey, keyEnc: encrypt(key.toString('base64'), this.masterKey), uploadedBy: ctx.user.id })
        .returning();
      const reapprove = d.status === 'da_duyet';
      await tx
        .update(lotDocuments)
        .set({ updatedBy: ctx.user.id, updatedAt: new Date(), ...(reapprove ? { status: 'nhap', approvedBy: null, approvedAt: null } : {}) })
        .where(eq(lotDocuments.id, docId));
      await this.docEvent(lot.id, 'tep_chung_tu', `${d.name}: ${name} (phiên bản ${v + 1}, mã băm ${hash.slice(0, 12)}…)${reapprove ? ', cần duyệt lại' : ''}`, ctx, tx);
      return { id: row.id, phienBan: v + 1, maBam: hash };
    });
  }

  private async fileWithLot(fileId: string) {
    const [r] = await this.db
      .select({ f: documentFiles, d: lotDocuments, lot: exportLots })
      .from(documentFiles)
      .innerJoin(lotDocuments, eq(lotDocuments.id, documentFiles.lotDocumentId))
      .innerJoin(exportLots, eq(exportLots.id, lotDocuments.exportLotId))
      .where(eq(documentFiles.id, fileId));
    if (!r) throw new NotFoundException('Không tìm thấy tệp');
    return r;
  }

  /** Đường dẫn tải tạm, hết hạn sau 10 phút, chỉ người xin mới dùng được. */
  async fileLink(fileId: string, ctx: AuthContext) {
    const { f, d, lot } = await this.fileWithLot(fileId);
    await this.assertCanViewDoc(d, lot, ctx, this.db);
    if (f.scanStatus === 'nhiem') throw new ForbiddenException('Tệp bị phát hiện có mã độc, không tải được');
    const exp = Date.now() + LINK_TTL_MS;
    return { duongDan: `/api/tep/tai/${signLink(f.id, ctx.user.id, exp, this.masterKey)}`, hetHan: new Date(exp) };
  }

  async download(token: string, ctx: AuthContext) {
    const v = verifyLink(token, this.masterKey);
    if (v === 'het_han') throw new ForbiddenException('Đường dẫn tải đã hết hạn, mở lại chứng từ để lấy đường dẫn mới');
    if (v === 'sai' || v.userId !== ctx.user.id) throw new ForbiddenException('Đường dẫn tải không hợp lệ');
    const { f, d, lot } = await this.fileWithLot(v.fileId);
    await this.assertCanViewDoc(d, lot, ctx, this.db);
    const key = Buffer.from(decrypt(f.keyEnc, this.masterKey), 'base64');
    const data = decryptBytes(await this.store.get(f.storageKey), key);
    if (sha256Bytes(data) !== f.sha256) throw new Error('Tệp không khớp mã băm đã ghi');
    await this.audit.record({ actorUserId: ctx.user.id, action: 'tep.tai_xuong', entityType: 'document_file', entityId: f.id, detail: { lo: lot.code, ten: f.fileName, maBam: f.sha256 } });
    return { data, fileName: f.fileName, mimeType: f.mimeType };
  }

  /** Giám đốc mở cổng chặn xếp tàu khi thiếu chứng từ, bắt buộc ghi lý do; chỉ dùng cho một lần xếp tàu. */
  async overrideGate(lotId: string, reason: string, ctx: AuthContext) {
    if (!ctx.permissions.includes('LO_HANG_MO_CHAN')) throw new ForbiddenException('Chỉ Giám đốc mở cổng chặn xếp tàu');
    await this.db.transaction(async (tx) => {
      const lot = await this.lockLot(lotId, tx);
      if (lot.status !== 'dat_cho') throw new BadRequestException('Chỉ mở chặn khi lô đang chờ xếp tàu');
      const { problems, overridden } = await this.shippingProblems(lot, tx);
      if (overridden) throw new BadRequestException('Lô đã được mở chặn');
      if (!problems.length) throw new BadRequestException('Lô đủ chứng từ, không cần mở chặn');
      await tx.insert(gateOverrides).values({ exportLotId: lotId, reason, missing: problems, grantedBy: ctx.user.id });
      await this.docEvent(lotId, 'mo_chan', reason, ctx, tx);
      await this.audit.record({ actorUserId: ctx.user.id, action: 'lo_xuat.mo_chan_xep_tau', entityType: 'export_lot', entityId: lotId, detail: { lyDo: reason, thieu: problems } }, tx);
    });
  }

  // ---------- Đề nghị thu phí ----------

  /** Gọi khi lô sang "xếp tàu": mỗi lô mua trong lô một đề nghị thu phí, tính theo khối lượng thực giao. */
  async createFeeRequests(lot: ExportLot, bl: { number: string; date: string }, tx: DbExecutor) {
    const counter = await this.contractsService.signedTerms(lot.counterContractId, tx);
    if (!counter) throw new BadRequestException('Hợp đồng đối ứng không còn hiệu lực');
    const perKg = counter.terms.donGia / (counter.terms.donVi === 'tan' ? 1000 : 1);
    const allocs = await tx
      .select({ purchaseLotId: lotAllocations.purchaseLotId, quantityKg: sql<number>`sum(${lotAllocations.quantityKg})::float8`, supplierId: purchaseLots.supplierPartnerId, contractId: purchaseLots.contractId })
      .from(lotAllocations)
      .innerJoin(purchaseLots, eq(purchaseLots.id, lotAllocations.purchaseLotId))
      .where(and(eq(lotAllocations.exportLotId, lot.id), isNull(lotAllocations.cancelledAt)))
      .groupBy(lotAllocations.purchaseLotId, purchaseLots.supplierPartnerId, purchaseLots.contractId);
    for (const a of allocs) {
      const fee = await this.contractsService.signedTerms(a.contractId, tx);
      const rate = fee?.terms.tyLePhiPhanTram ?? null;
      const { base, amount } = feeAmount(a.quantityKg, perKg, rate);
      await tx.insert(feeRequests).values({
        exportLotId: lot.id,
        purchaseLotId: a.purchaseLotId,
        supplierPartnerId: a.supplierId,
        feeContractId: a.contractId,
        quantityKg: a.quantityKg,
        unitPricePerKg: perKg,
        currency: counter.terms.tienTe,
        baseValue: base,
        ratePct: rate,
        amount,
        fxPerUsd: counter.terms.tienTe === 'USD' ? 1 : (counter.terms.tyGiaUsd ?? null),
        blNumber: bl.number,
        blDate: bl.date,
        status: rate === null ? 'thieu_ty_le' : 'cho_duyet',
      });
    }
  }

  async listFees(ctx: AuthContext, filter: { status?: string; exportLotId?: string }) {
    const all = ctx.permissions.includes('PHI_XEM_TAT_CA');
    if (!all && !ctx.permissions.includes('PHI_XEM_CUA_MINH')) throw new ForbiddenException('Bạn không xem được phí');
    const rows = await this.db
      .select({
        f: feeRequests,
        lotCode: exportLots.code,
        purchaseLotCode: purchaseLots.code,
        supplierName: partners.name,
        feeContractCode: contracts.code,
        approvedByName: sql<string | null>`(select full_name from users u where u.id = ${feeRequests.approvedBy})`,
        misaExportCode: sql<string | null>`(select code from misa_exports m where m.id = ${feeRequests.misaExportId})`,
      })
      .from(feeRequests)
      .innerJoin(exportLots, eq(exportLots.id, feeRequests.exportLotId))
      .innerJoin(purchaseLots, eq(purchaseLots.id, feeRequests.purchaseLotId))
      .innerJoin(partners, eq(partners.id, feeRequests.supplierPartnerId))
      .innerJoin(contracts, eq(contracts.id, feeRequests.feeContractId))
      .where(
        and(
          all ? undefined : eq(exportLots.ownerUserId, ctx.user.id),
          filter.status ? eq(feeRequests.status, filter.status) : undefined,
          filter.exportLotId ? eq(feeRequests.exportLotId, filter.exportLotId) : undefined,
        ),
      )
      .orderBy(desc(feeRequests.createdAt));
    const canApprove = ctx.permissions.includes('PHI_DUYET_DE_NGHI_THU');
    return rows.map((x) => ({
      ...x.f,
      lotCode: x.lotCode,
      purchaseLotCode: x.purchaseLotCode,
      supplierName: x.supplierName,
      feeContractCode: x.feeContractCode,
      approvedByName: x.approvedByName,
      misaExportCode: x.misaExportCode,
      amountUsd: x.f.amount !== null && x.f.fxPerUsd ? Math.round((x.f.amount / x.f.fxPerUsd) * 100) / 100 : null,
      coTheDuyet: canApprove && x.f.status === 'cho_duyet',
    }));
  }

  async approveFee(id: string, ctx: AuthContext) {
    if (!ctx.permissions.includes('PHI_DUYET_DE_NGHI_THU')) throw new ForbiddenException('Chỉ Kế toán trưởng duyệt đề nghị thu phí');
    await this.db.transaction(async (tx) => {
      const [f] = await tx.select().from(feeRequests).where(eq(feeRequests.id, id)).for('update');
      if (!f) throw new NotFoundException('Không tìm thấy đề nghị thu phí');
      if (f.status !== 'cho_duyet') throw new BadRequestException(f.status === 'thieu_ty_le' ? 'Hợp đồng chưa có tỷ lệ phí, chưa duyệt được' : 'Đề nghị đã được duyệt');
      await tx.update(feeRequests).set({ status: 'da_duyet', approvedBy: ctx.user.id, approvedAt: new Date() }).where(eq(feeRequests.id, id));
      await this.audit.record({ actorUserId: ctx.user.id, action: 'phi.duyet_de_nghi_thu', entityType: 'fee_request', entityId: id, detail: { soTien: f.amount, tienTe: f.currency } }, tx);
    });
  }

  // ---------- Nội bộ ----------

  private async docEvent(lotId: string, kind: string, note: string, ctx: AuthContext, tx: DbExecutor) {
    await tx.insert(lotEvents).values({ exportLotId: lotId, kind, note, actorUserId: ctx.user.id });
  }
  private assertLotOpen(lot: ExportLot) {
    if (lot.status === 'da_huy' || lot.status === 'hoan_tat') throw new BadRequestException('Lô đã đóng');
  }
  private async findLot(id: string, exec: DbExecutor) {
    const [l] = await exec.select().from(exportLots).where(eq(exportLots.id, id));
    if (!l) throw new NotFoundException('Không tìm thấy lô xuất');
    return l;
  }
  private async lockLot(id: string, tx: DbExecutor) {
    const [l] = await tx.select().from(exportLots).where(eq(exportLots.id, id)).for('update');
    if (!l) throw new NotFoundException('Không tìm thấy lô xuất');
    return l;
  }
  private async lockDoc(id: string, tx: DbExecutor) {
    const [d] = await tx.select().from(lotDocuments).where(eq(lotDocuments.id, id)).for('update');
    if (!d) throw new NotFoundException('Không tìm thấy chứng từ');
    if (d.obsolete) throw new BadRequestException('Dòng chứng từ này không còn áp dụng cho lô');
    const lot = await this.lockLot(d.exportLotId, tx);
    return { d, lot };
  }
}

export type { DocRule };

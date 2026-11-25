import { BadRequestException, ForbiddenException, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { and, asc, desc, eq, ilike, inArray, isNull, or, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { randomBytes } from 'node:crypto';
import type { AuthContext } from '../auth/auth.types';
import { AuditService } from '../audit/audit.service';
import { AuthService, ClientInfo } from '../auth/auth.service';
import { decrypt, encrypt, sha256Hex } from '../common/crypto';
import { stableStringify } from '../common/stable-json';
import { loadConfig } from '../config/config';
import { DB, Db, DbExecutor } from '../db/db';
import { commodities, Contract, contractVersions, contracts, partnerRoles, partners, signAuthorizations, userRoles, users } from '../db/schema';
import { isKycValid, KycStatus } from '../partners/partner.rules';
import {
  checkParties,
  ContractKind,
  ContractStatus,
  ContractTerms,
  contractValue,
  contractValueUsd,
  normalizeVerificationCode,
  PARTY_RULES,
  readinessProblems,
  signingRefusal,
  verificationCode,
} from './contract.rules';
import { LedgerService } from './ledger.service';
import { SIGNATURE_PROVIDER, SignatureProvider } from './providers';

export interface CreateContractInput {
  kind: ContractKind;
  sellerPartnerId?: string | null;
  buyerPartnerId?: string | null;
  commodityId: string;
  ownerUserId?: string | null;
  terms: ContractTerms;
}

const seller = alias(partners, 'ben_ban');
const buyer = alias(partners, 'ben_mua');

@Injectable()
export class ContractsService {
  private readonly logger = new Logger(ContractsService.name);

  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly ledger: LedgerService,
    private readonly auth: AuthService,
    private readonly audit: AuditService,
    @Inject(SIGNATURE_PROVIDER) private readonly signer: SignatureProvider,
  ) {}

  private get masterKey(): Buffer {
    return Buffer.from(loadConfig().APP_KEY, 'base64');
  }

  // ---------- Đọc ----------

  async list(ctx: AuthContext, filter: { q?: string; status?: string; kind?: string }) {
    if (!this.canSeeAll(ctx)) this.assertCanDraft(ctx);
    const conds = [];
    if (!this.canSeeAll(ctx)) conds.push(eq(contracts.ownerUserId, ctx.user.id));
    if (filter.status) conds.push(eq(contracts.status, filter.status));
    if (filter.kind) conds.push(eq(contracts.kind, filter.kind));
    if (filter.q) {
      const like = `%${filter.q}%`;
      conds.push(or(ilike(contracts.code, like), ilike(seller.name, like), ilike(buyer.name, like)));
    }
    const rows = await this.db
      .select({
        c: contracts,
        sellerName: seller.name,
        buyerName: buyer.name,
        commodityName: commodities.name,
        ownerName: users.fullName,
      })
      .from(contracts)
      .leftJoin(seller, eq(seller.id, contracts.sellerPartnerId))
      .leftJoin(buyer, eq(buyer.id, contracts.buyerPartnerId))
      .innerJoin(commodities, eq(commodities.id, contracts.commodityId))
      .innerJoin(users, eq(users.id, contracts.ownerUserId))
      .where(conds.length ? and(...conds) : undefined)
      .orderBy(desc(contracts.updatedAt))
      .limit(500);
    return rows.map((r) => ({
      id: r.c.id,
      code: r.c.code,
      kind: r.c.kind,
      dealType: r.c.dealType,
      status: r.c.status,
      currentVersion: r.c.currentVersion,
      signedVersion: r.c.signedVersion,
      sellerName: r.sellerName,
      buyerName: r.buyerName,
      commodityName: r.commodityName,
      ownerName: r.ownerName,
      updatedAt: r.c.updatedAt,
    }));
  }

  async get(id: string, ctx: AuthContext) {
    const [row] = await this.db
      .select({ c: contracts, sellerName: seller.name, buyerName: buyer.name, commodityName: commodities.name, ownerName: users.fullName })
      .from(contracts)
      .leftJoin(seller, eq(seller.id, contracts.sellerPartnerId))
      .leftJoin(buyer, eq(buyer.id, contracts.buyerPartnerId))
      .innerJoin(commodities, eq(commodities.id, contracts.commodityId))
      .innerJoin(users, eq(users.id, contracts.ownerUserId))
      .where(eq(contracts.id, id));
    if (!row) throw new NotFoundException('Không tìm thấy hợp đồng');
    this.assertCanView(row.c, ctx);
    const c = row.c;
    const key = this.dataKey(c);

    const submitter = alias(users, 'nguoi_trinh');
    const signerUser = alias(users, 'nguoi_ky');
    const versions = await this.db
      .select({ v: contractVersions, submittedByName: submitter.fullName, signedByName: signerUser.fullName })
      .from(contractVersions)
      .leftJoin(submitter, eq(submitter.id, contractVersions.submittedBy))
      .leftJoin(signerUser, eq(signerUser.id, contractVersions.signedBy))
      .where(eq(contractVersions.contractId, id))
      .orderBy(asc(contractVersions.version));

    const ledgerRows = await this.db
      .select({ id: sql<number>`l.id`, at: sql<Date>`l.at`, version: sql<number>`l.version`, event: sql<string>`l.event`, contentHash: sql<string>`l.content_hash`, note: sql<string | null>`l.note`, hash: sql<string>`l.hash`, prevHash: sql<string>`l.prev_hash`, signature: sql<unknown>`l.signature`, actorName: sql<string>`u.full_name` })
      .from(sql`contract_ledger l join users u on u.id = l.actor_user_id`)
      .where(sql`l.contract_id = ${id}`)
      .orderBy(sql`l.id`);

    const current = versions.find((v) => v.v.version === c.currentVersion)!;
    const terms = this.readTerms(current.v.contentEnc, key);
    const perms = this.actionsFor(c, current.v, ctx);

    return {
      id: c.id,
      code: c.code,
      kind: c.kind,
      dealType: c.dealType,
      status: c.status,
      sellerPartnerId: c.sellerPartnerId,
      buyerPartnerId: c.buyerPartnerId,
      sellerName: row.sellerName,
      buyerName: row.buyerName,
      commodityId: c.commodityId,
      commodityName: row.commodityName,
      ownerUserId: c.ownerUserId,
      ownerName: row.ownerName,
      currentVersion: c.currentVersion,
      signedVersion: c.signedVersion,
      cancelReason: c.cancelReason,
      terms,
      giaTri: contractValue(terms),
      giaTriUsd: contractValueUsd(terms),
      thieuSot: readinessProblems(terms),
      versions: versions.map((v) => ({
        version: v.v.version,
        contentHash: v.v.contentHash,
        maXacMinh: verificationCode(v.v.contentHash),
        reason: v.v.reason,
        submittedAt: v.v.submittedAt,
        submittedByName: v.submittedByName,
        signedAt: v.v.signedAt,
        signedByName: v.signedByName,
        createdAt: v.v.createdAt,
      })),
      ledger: ledgerRows,
      quyen: perms,
    };
  }

  /** Điều khoản của một phiên bản cũ (để so sánh phụ lục). */
  async versionTerms(id: string, version: number, ctx: AuthContext) {
    const c = await this.findContract(id, this.db);
    this.assertCanView(c, ctx);
    const [v] = await this.db.select().from(contractVersions).where(and(eq(contractVersions.contractId, id), eq(contractVersions.version, version)));
    if (!v) throw new NotFoundException('Không có phiên bản này');
    return { version, terms: this.readTerms(v.contentEnc, this.dataKey(c)), contentHash: v.contentHash };
  }

  // ---------- Soạn ----------

  /** Tạo bản soạn. Truyền `outerTx` để tạo cùng giao dịch với thao tác khác (ví dụ chấp nhận báo giá). */
  async create(input: CreateContractInput, ctx: AuthContext, outerTx?: DbExecutor) {
    this.assertCanDraft(ctx);
    const problem = checkParties(input.kind, input.sellerPartnerId, input.buyerPartnerId);
    if (problem) throw new BadRequestException(problem);
    const ownerUserId = this.canDraftAll(ctx) ? (input.ownerUserId ?? ctx.user.id) : ctx.user.id;

    const run = async (tx: DbExecutor) => {
      await this.assertPartiesUsable(input.kind, input.sellerPartnerId ?? null, input.buyerPartnerId ?? null, tx);
      const [com] = await tx.select().from(commodities).where(eq(commodities.id, input.commodityId));
      if (!com || !com.active) throw new BadRequestException('Mặt hàng không có hoặc đã ngừng');

      const code = await this.nextCode(input.kind, tx);
      const dataKey = randomBytes(32);
      const [c] = await tx
        .insert(contracts)
        .values({
          code,
          kind: input.kind,
          dealType: PARTY_RULES[input.kind].loaiGiaoDich,
          sellerPartnerId: input.sellerPartnerId ?? null,
          buyerPartnerId: input.buyerPartnerId ?? null,
          commodityId: input.commodityId,
          ownerUserId,
          dataKeyEnc: encrypt(dataKey.toString('base64'), this.masterKey),
          createdBy: ctx.user.id,
        })
        .returning();
      const contentHash = this.hashContent(c, 1, input.terms);
      await tx.insert(contractVersions).values({ contractId: c.id, version: 1, contentEnc: encrypt(stableStringify(input.terms), dataKey), contentHash, createdBy: ctx.user.id });
      await this.ledger.append({ contractId: c.id, version: 1, event: 'tao', actorUserId: ctx.user.id, contentHash }, tx);
      return { id: c.id, code };
    };
    return outerTx ? run(outerTx) : this.db.transaction(run);
  }

  /** Sửa điều khoản khi đang soạn. Mỗi lần lưu là một dòng sổ cái với mã băm mới. */
  async updateTerms(id: string, terms: ContractTerms, ctx: AuthContext) {
    await this.db.transaction(async (tx) => {
      const c = await this.lockForDraft(id, ctx, tx);
      if (c.status !== 'nhap') throw new BadRequestException('Chỉ sửa được hợp đồng đang soạn; đã trình ký thì cần người ký trả lại');
      const contentHash = this.hashContent(c, c.currentVersion, terms);
      const [v] = await tx.select().from(contractVersions).where(and(eq(contractVersions.contractId, id), eq(contractVersions.version, c.currentVersion)));
      if (v.contentHash === contentHash) return;
      await tx
        .update(contractVersions)
        .set({ contentEnc: encrypt(stableStringify(terms), this.dataKey(c)), contentHash })
        .where(and(eq(contractVersions.contractId, id), eq(contractVersions.version, c.currentVersion)));
      await tx.update(contracts).set({ updatedAt: new Date() }).where(eq(contracts.id, id));
      await this.ledger.append({ contractId: id, version: c.currentVersion, event: 'sua', actorUserId: ctx.user.id, contentHash }, tx);
    });
  }

  /** Trình ký: khoá nội dung phiên bản hiện tại. Đối tác phải còn thẩm định đạt. */
  async submit(id: string, ctx: AuthContext) {
    await this.db.transaction(async (tx) => {
      const c = await this.lockForDraft(id, ctx, tx);
      if (c.status !== 'nhap') throw new BadRequestException('Hợp đồng không ở trạng thái đang soạn');
      const v = await this.currentVersion(c, tx);
      const terms = this.readTerms(v.contentEnc, this.dataKey(c));
      const problems = readinessProblems(terms);
      if (problems.length) throw new BadRequestException(`Chưa trình ký được: ${problems.join('; ')}`);
      await this.assertPartiesUsable(c.kind as ContractKind, c.sellerPartnerId, c.buyerPartnerId, tx);
      const now = new Date();
      await tx
        .update(contractVersions)
        .set({ submittedBy: ctx.user.id, submittedAt: now })
        .where(and(eq(contractVersions.contractId, id), eq(contractVersions.version, c.currentVersion)));
      await tx.update(contracts).set({ status: 'cho_ky', updatedAt: now }).where(eq(contracts.id, id));
      await this.ledger.append({ contractId: id, version: c.currentVersion, event: 'trinh_ky', actorUserId: ctx.user.id, contentHash: v.contentHash }, tx);
    });
  }

  /** Người ký trả lại để sửa, kèm lý do. */
  async returnForEdit(id: string, reason: string, ctx: AuthContext) {
    await this.db.transaction(async (tx) => {
      const c = await this.lockContract(id, tx);
      if (c.status !== 'cho_ky') throw new BadRequestException('Hợp đồng không ở trạng thái chờ ký');
      const v = await this.currentVersion(c, tx);
      await tx
        .update(contractVersions)
        .set({ submittedBy: null, submittedAt: null })
        .where(and(eq(contractVersions.contractId, id), eq(contractVersions.version, c.currentVersion)));
      await tx.update(contracts).set({ status: 'nhap', updatedAt: new Date() }).where(eq(contracts.id, id));
      await this.ledger.append({ contractId: id, version: c.currentVersion, event: 'tra_lai', actorUserId: ctx.user.id, contentHash: v.contentHash, note: reason }, tx);
    });
  }

  /**
   * Ký phiên bản đang chờ ký. Kiểm tra: người ký có thẩm quyền (Giám đốc, hoặc Phó Giám đốc trong
   * ủy quyền và hạn mức), không phải người trình, đối tác còn thẩm định đạt, nội dung khớp mã băm,
   * và người ký nhập lại mã 2 lớp.
   */
  async sign(id: string, totpCode: string, ctx: AuthContext, client: ClientInfo) {
    // Kiểm tra trước để không tốn mã 2 lớp khi chắc chắn không ký được.
    await this.db.transaction(async (tx) => {
      const c = await this.findContract(id, tx);
      await this.assertCanSign(c, ctx, tx);
    });
    await this.auth.confirmStepUp(ctx, totpCode, client);

    const result = await this.db.transaction(async (tx) => {
      const c = await this.lockContract(id, tx);
      const { version, terms } = await this.assertCanSign(c, ctx, tx);
      const recomputed = this.hashContent(c, c.currentVersion, terms);
      if (recomputed !== version.contentHash) {
        this.logger.error(`Mã băm hợp đồng ${c.code} phiên bản ${c.currentVersion} không khớp nội dung`);
        throw new BadRequestException('Nội dung hợp đồng không khớp mã băm đã khoá; không ký được. Báo ngay cho quản trị.');
      }
      const signedAt = new Date();
      const signature = await this.signer.sign({ contentHash: version.contentHash, signerUserId: ctx.user.id, signedAt });
      await tx
        .update(contractVersions)
        .set({ signedBy: ctx.user.id, signedAt })
        .where(and(eq(contractVersions.contractId, id), eq(contractVersions.version, c.currentVersion)));
      await tx.update(contracts).set({ status: 'da_ky', signedVersion: c.currentVersion, updatedAt: signedAt }).where(eq(contracts.id, id));
      await this.ledger.append(
        { contractId: id, version: c.currentVersion, event: 'ky', actorUserId: ctx.user.id, contentHash: version.contentHash, signature, note: signedAt.toISOString() },
        tx,
      );
      return { maXacMinh: verificationCode(version.contentHash) };
    });

    // Neo ngay sau khi ký. Neo lỗi không làm hỏng chữ ký: lần neo sau sẽ gom luôn các dòng còn sót.
    try {
      await this.ledger.anchorPending();
    } catch (err) {
      this.logger.error(`Neo sổ cái thất bại: ${(err as Error).message}`);
    }
    return result;
  }

  /** Lập phụ lục cho hợp đồng đã ký: tạo phiên bản mới ở trạng thái soạn, phiên bản đã ký vẫn giữ hiệu lực tới khi phụ lục được ký. */
  async amend(id: string, input: { reason: string; terms: ContractTerms }, ctx: AuthContext) {
    return this.db.transaction(async (tx) => {
      const c = await this.lockForDraft(id, ctx, tx);
      if (c.status !== 'da_ky') throw new BadRequestException('Chỉ lập phụ lục cho hợp đồng đã ký');
      const version = c.currentVersion + 1;
      const contentHash = this.hashContent(c, version, input.terms);
      await tx.insert(contractVersions).values({
        contractId: id,
        version,
        contentEnc: encrypt(stableStringify(input.terms), this.dataKey(c)),
        contentHash,
        reason: input.reason,
        createdBy: ctx.user.id,
      });
      await tx.update(contracts).set({ status: 'nhap', currentVersion: version, updatedAt: new Date() }).where(eq(contracts.id, id));
      await this.ledger.append({ contractId: id, version, event: 'phu_luc', actorUserId: ctx.user.id, contentHash, note: input.reason }, tx);
      return { version };
    });
  }

  /** Huỷ: chưa từng ký thì người soạn huỷ được; đã ký thì cần Ban Giám đốc. */
  async cancel(id: string, reason: string, ctx: AuthContext) {
    await this.db.transaction(async (tx) => {
      const c = await this.lockContract(id, tx);
      if (c.status === 'da_huy') throw new BadRequestException('Hợp đồng đã huỷ');
      if (c.signedVersion !== null) {
        if (!ctx.permissions.includes('HOP_DONG_DUYET_KY')) throw new ForbiddenException('Hợp đồng đã ký chỉ Ban Giám đốc được huỷ');
      } else {
        this.assertCanEdit(c, ctx);
      }
      const v = await this.currentVersion(c, tx);
      await tx.update(contracts).set({ status: 'da_huy', cancelReason: reason, updatedAt: new Date() }).where(eq(contracts.id, id));
      await this.ledger.append({ contractId: id, version: c.currentVersion, event: 'huy', actorUserId: ctx.user.id, contentHash: v.contentHash, note: reason }, tx);
    });
  }

  // ---------- Xác minh công khai ----------

  /**
   * Đối tác hoặc ngân hàng nhập mã xác minh. Chỉ trả lời "có đúng bản đã ký không", lúc ký, còn hiệu lực
   * hay không và biên nhận neo; không lộ tên đối tác, giá hay điều khoản.
   */
  async verifyPublic(code: string) {
    const hash = normalizeVerificationCode(code);
    if (!/^[0-9a-f]{64}$/.test(hash)) throw new BadRequestException('Mã xác minh gồm 64 ký tự 0–9, A–F');
    const [v] = await this.db
      .select({ v: contractVersions, c: contracts })
      .from(contractVersions)
      .innerJoin(contracts, eq(contracts.id, contractVersions.contractId))
      .where(and(eq(contractVersions.contentHash, hash), sql`${contractVersions.signedAt} is not null`));
    if (!v) return { hopLe: false as const };
    const [entry] = await this.ledger
      .forContract(v.c.id)
      .then((rows) => rows.filter((r) => r.event === 'ky' && r.contentHash === hash));
    const tinhTrang = v.c.status === 'da_huy' ? 'da_huy' : v.c.signedVersion === v.v.version ? 'con_hieu_luc' : 'da_co_phu_luc_moi';
    const sig = entry?.signature as { provider: string; value: string } | null;
    const chuKyHopLe = !!(entry && sig && this.signer.name === sig.provider && v.v.signedBy && v.v.signedAt
      ? this.signer.verify({ contentHash: hash, signerUserId: v.v.signedBy, signedAt: v.v.signedAt }, sig.value)
      : false);
    return {
      hopLe: true as const,
      phienBan: v.v.version,
      kyLuc: v.v.signedAt,
      tinhTrang,
      chuKy: { loai: sig?.provider ?? null, hopLe: chuKyHopLe },
      soCai: entry ? { maBanGhi: entry.hash, maBanGhiTruoc: entry.prevHash } : null,
      neo: entry ? await this.ledger.receiptFor(entry) : null,
    };
  }

  // ---------- Ủy quyền ký ----------

  async listAuthorizations() {
    const grantee = alias(users, 'duoc_uy_quyen');
    const grantor = alias(users, 'nguoi_uy_quyen');
    const rows = await this.db
      .select({ a: signAuthorizations, granteeName: grantee.fullName, grantorName: grantor.fullName })
      .from(signAuthorizations)
      .innerJoin(grantee, eq(grantee.id, signAuthorizations.granteeUserId))
      .innerJoin(grantor, eq(grantor.id, signAuthorizations.grantedBy))
      .orderBy(desc(signAuthorizations.createdAt));
    const now = Date.now();
    return rows.map((r) => ({
      ...r.a,
      granteeName: r.granteeName,
      grantorName: r.grantorName,
      conHieuLuc: !r.a.revokedAt && r.a.validFrom.getTime() <= now && now < r.a.validTo.getTime(),
    }));
  }

  /** Các Phó Giám đốc đang hoạt động, để Giám đốc chọn khi cấp ủy quyền. */
  async deputyDirectors() {
    return this.db
      .select({ id: users.id, hoTen: users.fullName, email: users.email })
      .from(users)
      .innerJoin(userRoles, eq(userRoles.userId, users.id))
      .where(and(eq(userRoles.role, 'PHO_GIAM_DOC'), eq(users.status, 'hoat_dong')))
      .orderBy(asc(users.fullName));
  }

  async grantAuthorization(input: { granteeUserId: string; documentRef: string; validFrom: Date; validTo: Date; maxValueUsd: number | null }, ctx: AuthContext) {
    if (input.validTo.getTime() <= input.validFrom.getTime()) throw new BadRequestException('Ngày hết hạn ủy quyền phải sau ngày bắt đầu');
    const [u] = await this.db.select().from(users).where(eq(users.id, input.granteeUserId));
    if (!u || u.status !== 'hoat_dong') throw new BadRequestException('Người được ủy quyền không có hoặc không hoạt động');
    const roles = await this.auth.rolesOf(u.id);
    if (!roles.includes('PHO_GIAM_DOC')) throw new BadRequestException('Chỉ ủy quyền ký cho Phó Giám đốc');
    return this.db.transaction(async (tx) => {
      const [a] = await tx
        .insert(signAuthorizations)
        .values({ ...input, grantedBy: ctx.user.id })
        .returning({ id: signAuthorizations.id });
      await this.audit.record(
        {
          actorUserId: ctx.user.id,
          action: 'uy_quyen_ky.cap',
          entityType: 'user',
          entityId: input.granteeUserId,
          detail: { soVanBan: input.documentRef, tu: input.validFrom.toISOString(), den: input.validTo.toISOString(), hanMucUsd: input.maxValueUsd },
        },
        tx,
      );
      return a;
    });
  }

  async revokeAuthorization(id: string, reason: string, ctx: AuthContext) {
    await this.db.transaction(async (tx) => {
      const [a] = await tx
        .update(signAuthorizations)
        .set({ revokedAt: new Date(), revokedBy: ctx.user.id, revokeReason: reason })
        .where(and(eq(signAuthorizations.id, id), isNull(signAuthorizations.revokedAt)))
        .returning({ id: signAuthorizations.id, granteeUserId: signAuthorizations.granteeUserId });
      if (!a) throw new NotFoundException('Không tìm thấy ủy quyền còn hiệu lực');
      await this.audit.record({ actorUserId: ctx.user.id, action: 'uy_quyen_ky.thu_hoi', entityType: 'user', entityId: a.granteeUserId, detail: { lyDo: reason } }, tx);
    });
  }

  // ---------- Nội bộ ----------

  private canSeeAll(ctx: AuthContext) {
    return ctx.permissions.includes('HOP_DONG_XEM_TAT_CA');
  }
  private canDraftAll(ctx: AuthContext) {
    return ctx.permissions.includes('HOP_DONG_SOAN_TAT_CA');
  }
  private assertCanDraft(ctx: AuthContext) {
    if (!this.canDraftAll(ctx) && !ctx.permissions.includes('HOP_DONG_SOAN_CUA_MINH')) throw new ForbiddenException('Bạn không có quyền soạn hợp đồng');
  }
  private assertCanView(c: Contract, ctx: AuthContext) {
    if (this.canSeeAll(ctx)) return;
    if (ctx.permissions.includes('HOP_DONG_SOAN_CUA_MINH') && c.ownerUserId === ctx.user.id) return;
    throw new ForbiddenException('Bạn không xem được hợp đồng này');
  }
  private assertCanEdit(c: Contract, ctx: AuthContext) {
    if (this.canDraftAll(ctx)) return;
    if (ctx.permissions.includes('HOP_DONG_SOAN_CUA_MINH') && c.ownerUserId === ctx.user.id) return;
    throw new ForbiddenException('Bạn chỉ sửa được hợp đồng do mình phụ trách');
  }

  private actionsFor(c: Contract, v: typeof contractVersions.$inferSelect, ctx: AuthContext) {
    let canEdit = false;
    try {
      this.assertCanEdit(c, ctx);
      canEdit = true;
    } catch {
      /* không có quyền sửa */
    }
    const signer = ctx.permissions.includes('HOP_DONG_DUYET_KY');
    return {
      sua: canEdit && c.status === 'nhap',
      trinhKy: canEdit && c.status === 'nhap',
      ky: signer && c.status === 'cho_ky' && v.submittedBy !== ctx.user.id,
      traLai: signer && c.status === 'cho_ky',
      phuLuc: canEdit && c.status === 'da_ky',
      huy: c.status !== 'da_huy' && (c.signedVersion !== null ? signer : canEdit),
    };
  }

  private async findContract(id: string, exec: DbExecutor) {
    const [c] = await exec.select().from(contracts).where(eq(contracts.id, id));
    if (!c) throw new NotFoundException('Không tìm thấy hợp đồng');
    return c;
  }
  private async lockContract(id: string, tx: DbExecutor) {
    const [c] = await tx.select().from(contracts).where(eq(contracts.id, id)).for('update');
    if (!c) throw new NotFoundException('Không tìm thấy hợp đồng');
    return c;
  }
  private async lockForDraft(id: string, ctx: AuthContext, tx: DbExecutor) {
    this.assertCanDraft(ctx);
    const c = await this.lockContract(id, tx);
    this.assertCanEdit(c, ctx);
    return c;
  }
  private async currentVersion(c: Contract, exec: DbExecutor) {
    const [v] = await exec.select().from(contractVersions).where(and(eq(contractVersions.contractId, c.id), eq(contractVersions.version, c.currentVersion)));
    return v;
  }

  private async assertCanSign(c: Contract, ctx: AuthContext, tx: DbExecutor) {
    if (!ctx.permissions.includes('HOP_DONG_DUYET_KY')) throw new ForbiddenException('Bạn không có quyền ký hợp đồng');
    if ((c.status as ContractStatus) !== 'cho_ky') throw new BadRequestException('Hợp đồng không ở trạng thái chờ ký');
    const version = await this.currentVersion(c, tx);
    if (version.submittedBy === ctx.user.id) throw new ForbiddenException('Người trình không tự ký hợp đồng của mình (nguyên tắc 4 mắt)');
    const terms = this.readTerms(version.contentEnc, this.dataKey(c));
    const auths = await tx
      .select()
      .from(signAuthorizations)
      .where(eq(signAuthorizations.granteeUserId, ctx.user.id));
    const refusal = signingRefusal(ctx.roles, contractValueUsd(terms), auths);
    if (refusal) throw new ForbiddenException(refusal);
    await this.assertPartiesUsable(c.kind as ContractKind, c.sellerPartnerId, c.buyerPartnerId, tx);
    return { version, terms };
  }

  /** Đối tác phải tồn tại, đúng vai (nhà cung cấp / người mua) và thẩm định còn đạt. */
  private async assertPartiesUsable(kind: ContractKind, sellerId: string | null, buyerId: string | null, exec: DbExecutor) {
    const wanted: { id: string; role: string; label: string }[] = [];
    if (sellerId) wanted.push({ id: sellerId, role: 'nha_cung_cap', label: 'Bên bán' });
    if (buyerId) wanted.push({ id: buyerId, role: 'nguoi_mua', label: 'Bên mua' });
    if (!wanted.length) return;
    const rows = await exec.select().from(partners).where(inArray(partners.id, wanted.map((w) => w.id)));
    const roles = await exec.select().from(partnerRoles).where(inArray(partnerRoles.partnerId, wanted.map((w) => w.id)));
    for (const w of wanted) {
      const p = rows.find((r) => r.id === w.id);
      if (!p) throw new BadRequestException(`${w.label}: không tìm thấy đối tác`);
      if (!roles.some((r) => r.partnerId === w.id && r.role === w.role)) {
        throw new BadRequestException(`${w.label}: ${p.name} chưa được đánh dấu là ${w.role === 'nha_cung_cap' ? 'nhà cung cấp' : 'người mua'}`);
      }
      if (!isKycValid(p.kycStatus as KycStatus, p.kycExpiresAt)) {
        throw new BadRequestException(`${w.label}: ${p.name} chưa thẩm định đạt hoặc đã hết hạn thẩm định`);
      }
    }
    void kind;
  }

  private async nextCode(kind: ContractKind, tx: DbExecutor): Promise<string> {
    const prefix = `${PARTY_RULES[kind].tienTo}-${new Date().getUTCFullYear()}-`;
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${'contract_code:' + prefix}))`);
    const [{ max }] = await tx
      .select({ max: sql<number | null>`max(substring(${contracts.code}, ${prefix.length + 1}::int)::int)` })
      .from(contracts)
      .where(sql`${contracts.code} like ${prefix + '%'}`);
    return `${prefix}${String((max ?? 0) + 1).padStart(4, '0')}`;
  }

  private dataKey(c: Contract): Buffer {
    return Buffer.from(decrypt(c.dataKeyEnc, this.masterKey), 'base64');
  }

  private readTerms(contentEnc: string, key: Buffer): ContractTerms {
    return JSON.parse(decrypt(contentEnc, key)) as ContractTerms;
  }

  /** Mã băm của đúng một phiên bản: gắn số hợp đồng, loại, các bên, mặt hàng và điều khoản. */
  private hashContent(c: Pick<Contract, 'code' | 'kind' | 'sellerPartnerId' | 'buyerPartnerId' | 'commodityId'>, version: number, terms: ContractTerms): string {
    return sha256Hex(
      stableStringify({
        hopDong: c.code,
        loai: c.kind,
        phienBan: version,
        benBan: c.sellerPartnerId,
        benMua: c.buyerPartnerId,
        matHang: c.commodityId,
        dieuKhoan: terms,
      }),
    );
  }
}

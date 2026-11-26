import { BadRequestException, ForbiddenException, Inject, Injectable, NotFoundException, PayloadTooLargeException } from '@nestjs/common';
import { and, asc, desc, eq, ne } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { randomBytes, randomUUID } from 'node:crypto';
import { AuditService } from '../audit/audit.service';
import type { AuthContext } from '../auth/auth.types';
import { decrypt, encrypt } from '../common/crypto';
import { loadConfig } from '../config/config';
import { DB, Db, DbExecutor } from '../db/db';
import { areaCodeSubmissions, growingAreas, partners, users } from '../db/schema';
import { FILE_STORE, FileStore } from '../documents/file-store';
import { decryptBytes, detectType, encryptBytes, LINK_TTL_MS, MAX_FILE_BYTES, safeFileName, sha256Bytes, signLink, verifyLink } from '../documents/file.rules';
import { codeInEffect, reviewRefusal } from './area-code.rules';
import { SourcingService } from './sourcing.service';

export interface CodeInput {
  areaId: string;
  code: string;
  issuer: string | null;
  issuedOn: string | null;
  validUntil: string | null;
  scope: string | null;
}
export interface CodeFile {
  originalname: string;
  size: number;
  buffer: Buffer;
}

const today = () => new Date().toISOString().slice(0, 10);
const utf8Name = (n: string) => {
  const u = Buffer.from(n, 'latin1').toString('utf8');
  return u.includes('�') ? n : u;
};

/**
 * Đối chiếu mã số vùng trồng / mã cơ sở nuôi: nhân viên thu mua hoặc nhà cung cấp gửi mã kèm bản scan giấy chứng
 * nhận; người thứ hai có quyền duyệt so mã với giấy rồi duyệt hoặc từ chối. Mã được duyệt mới ghi vào vùng.
 */
@Injectable()
export class AreaCodeService {
  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(FILE_STORE) private readonly store: FileStore,
    private readonly audit: AuditService,
    private readonly sourcing: SourcingService,
  ) {}

  private get masterKey() {
    return Buffer.from(loadConfig().APP_KEY, 'base64');
  }

  /** Nguồn ghi; nhà cung cấp chỉ với vùng của mình, nhân viên cần quyền xem hoặc quản lý nguồn cung. */
  private async scope(partnerId: string, ctx: AuthContext, write: boolean, exec: DbExecutor): Promise<'noi_bo' | 'cong_ncc'> {
    const own = await this.sourcing.portalPartner(ctx, exec);
    if (own) {
      if (own !== partnerId) throw new NotFoundException('Không tìm thấy vùng');
      return 'cong_ncc';
    }
    const ok = write ? ctx.permissions.includes('NGUON_CUNG_QUAN_LY') : ctx.permissions.includes('NGUON_CUNG_XEM') || ctx.permissions.includes('NGUON_CUNG_DUYET_MA');
    if (!ok) throw new ForbiddenException('Bạn không có quyền với mã số vùng');
    return 'noi_bo';
  }

  private async submission(id: string, exec: DbExecutor, lock: boolean) {
    const q = exec
      .select({ s: areaCodeSubmissions, a: growingAreas })
      .from(areaCodeSubmissions)
      .innerJoin(growingAreas, eq(growingAreas.id, areaCodeSubmissions.growingAreaId))
      .where(eq(areaCodeSubmissions.id, id));
    const [r] = lock ? await q.for('update') : await q;
    if (!r) throw new NotFoundException('Không tìm thấy lần gửi mã');
    return r;
  }

  /** Danh sách lần gửi mã: theo nhà cung cấp (hồ sơ nguồn cung, cổng) hoặc toàn bộ đang chờ duyệt (người duyệt). */
  async list(filter: { partnerId?: string | null; status?: string }, ctx: AuthContext) {
    const own = await this.sourcing.portalPartner(ctx);
    let partnerId = filter.partnerId ?? null;
    if (own) partnerId = own;
    else if (!ctx.permissions.includes('NGUON_CUNG_XEM') && !ctx.permissions.includes('NGUON_CUNG_DUYET_MA')) throw new ForbiddenException('Bạn không có quyền với mã số vùng');
    const submitter = alias(users, 'nguoi_gui');
    const reviewer = alias(users, 'nguoi_duyet');
    const rows = await this.db
      .select({ s: areaCodeSubmissions, a: growingAreas, partnerName: partners.name, submitterName: submitter.fullName, reviewerName: reviewer.fullName })
      .from(areaCodeSubmissions)
      .innerJoin(growingAreas, eq(growingAreas.id, areaCodeSubmissions.growingAreaId))
      .innerJoin(partners, eq(partners.id, growingAreas.supplierPartnerId))
      .innerJoin(submitter, eq(submitter.id, areaCodeSubmissions.submittedBy))
      .leftJoin(reviewer, eq(reviewer.id, areaCodeSubmissions.reviewedBy))
      .where(and(partnerId ? eq(growingAreas.supplierPartnerId, partnerId) : undefined, filter.status ? eq(areaCodeSubmissions.status, filter.status) : undefined))
      .orderBy(asc(growingAreas.code), desc(areaCodeSubmissions.submittedAt));
    const canReview = !own && ctx.permissions.includes('NGUON_CUNG_DUYET_MA');
    return {
      duocDuyet: canReview,
      duocGui: own ? true : ctx.permissions.includes('NGUON_CUNG_QUAN_LY'),
      ma: rows.map((r) => ({
        id: r.s.id,
        vungId: r.a.id,
        maVung: r.a.code,
        tenVung: r.a.name,
        nganh: r.a.sector,
        nhaCungCap: r.partnerName,
        ma: r.s.officialCode,
        noiCap: r.s.issuer,
        ngayCap: r.s.issuedOn,
        hieuLucDen: r.s.validUntil,
        conHieuLuc: codeInEffect(r.s.validUntil, today()),
        phamVi: r.s.scope,
        tep: r.s.storageKey ? { ten: r.s.fileName, kichThuoc: r.s.sizeBytes, maBam: r.s.sha256 } : null,
        trangThai: r.s.status,
        nguon: r.s.source,
        nguoiGui: r.submitterName,
        guiLuc: r.s.submittedAt,
        nguoiDuyet: r.reviewerName,
        duyetLuc: r.s.reviewedAt,
        ghiChuDuyet: r.s.reviewNote,
        // Gửi rồi thì người gửi không tự duyệt
        duocDuyetDong: canReview && r.s.status === 'cho_duyet' && r.s.submittedBy !== ctx.user.id,
      })),
    };
  }

  /** Gửi mã mới cho một vùng. Lần gửi cũ còn chờ duyệt của vùng chuyển thành "thay thế". */
  async submit(input: CodeInput, ctx: AuthContext, ip: string | null) {
    if (input.issuedOn && input.issuedOn > today()) throw new BadRequestException('Ngày cấp không được sau hôm nay');
    if (input.issuedOn && input.validUntil && input.validUntil < input.issuedOn) throw new BadRequestException('Hạn hiệu lực phải sau ngày cấp');
    return this.db.transaction(async (tx) => {
      const [a] = await tx.select().from(growingAreas).where(eq(growingAreas.id, input.areaId)).for('update');
      if (!a) throw new NotFoundException('Không tìm thấy vùng');
      const source = await this.scope(a.supplierPartnerId, ctx, true, tx);
      await tx
      .update(areaCodeSubmissions)
      .set({ status: 'thay_the', reviewNote: 'Đã gửi mã khác thay', reviewedAt: new Date() })
      .where(and(eq(areaCodeSubmissions.growingAreaId, a.id), eq(areaCodeSubmissions.status, 'cho_duyet')));
    const [row] = await tx
      .insert(areaCodeSubmissions)
      .values({ growingAreaId: a.id, officialCode: input.code.trim(), issuer: input.issuer, issuedOn: input.issuedOn, validUntil: input.validUntil, scope: input.scope, source, submittedBy: ctx.user.id })
      .returning({ id: areaCodeSubmissions.id });
    await this.audit.record(
      { actorUserId: ctx.user.id, action: 'nguon_cung.gui_ma_vung', entityType: 'growing_area', entityId: a.id, ip, detail: { vung: a.code, ma: input.code.trim(), noiCap: input.issuer, hieuLucDen: input.validUntil, nguon: source } },
      tx,
    );
    return { id: row.id };
    });
  }

  /** Đính bản scan giấy chứng nhận (PDF, JPG, PNG) vào lần gửi còn chờ duyệt; gửi lại thì thay bản trước. */
  async attach(id: string, file: CodeFile | undefined, ctx: AuthContext, ip: string | null) {
    if (!file || !file.size) throw new BadRequestException('Chọn tệp để tải lên');
    if (file.size > MAX_FILE_BYTES) throw new PayloadTooLargeException('Tệp vượt 25 MB');
    const type = detectType(file.buffer);
    if (!type) throw new BadRequestException('Chỉ nhận tệp PDF, JPG hoặc PNG');
    {
      const { s, a } = await this.submission(id, this.db, false);
      await this.scope(a.supplierPartnerId, ctx, true, this.db);
      if (s.status !== 'cho_duyet') throw new BadRequestException('Lần gửi này không còn chờ duyệt');
    }
    const key = randomBytes(32);
    const storageKey = `ma-vung/${id}/${randomUUID()}`;
    const hash = sha256Bytes(file.buffer);
    await this.store.put(storageKey, encryptBytes(file.buffer, key));
    return this.db.transaction(async (tx) => {
      const { s, a } = await this.submission(id, tx, true);
      if (s.status !== 'cho_duyet') throw new BadRequestException('Lần gửi này không còn chờ duyệt');
      const name = safeFileName(utf8Name(file.originalname), type.ext);
      await tx
        .update(areaCodeSubmissions)
        .set({ fileName: name, mimeType: type.mime, sizeBytes: file.size, sha256: hash, storageKey, keyEnc: encrypt(key.toString('base64'), this.masterKey) })
        .where(eq(areaCodeSubmissions.id, id));
      await this.audit.record({ actorUserId: ctx.user.id, action: 'nguon_cung.scan_ma_vung', entityType: 'growing_area', entityId: a.id, ip, detail: { vung: a.code, ma: s.officialCode, tep: name, maBam: hash } }, tx);
      return { maBam: hash };
    });
  }

  /** Đường dẫn xem bản scan, hết hạn sau 10 phút, chỉ người xin mới dùng được. */
  async fileLink(id: string, ctx: AuthContext) {
    const { s, a } = await this.submission(id, this.db, false);
    await this.scope(a.supplierPartnerId, ctx, false, this.db);
    if (!s.storageKey) throw new NotFoundException('Lần gửi này chưa có bản scan');
    const exp = Date.now() + LINK_TTL_MS;
    return { duongDan: `/api/ma-vung/tai/${signLink(s.id, ctx.user.id, exp, this.masterKey)}`, hetHan: new Date(exp) };
  }

  async download(token: string, ctx: AuthContext) {
    const v = verifyLink(token, this.masterKey);
    if (v === 'het_han') throw new ForbiddenException('Đường dẫn đã hết hạn, mở lại để lấy đường dẫn mới');
    if (v === 'sai' || v.userId !== ctx.user.id) throw new ForbiddenException('Đường dẫn không hợp lệ');
    const { s, a } = await this.submission(v.fileId, this.db, false);
    await this.scope(a.supplierPartnerId, ctx, false, this.db);
    if (!s.storageKey || !s.keyEnc) throw new NotFoundException('Lần gửi này chưa có bản scan');
    const key = Buffer.from(decrypt(s.keyEnc, this.masterKey), 'base64');
    const data = decryptBytes(await this.store.get(s.storageKey), key);
    if (sha256Bytes(data) !== s.sha256) throw new Error('Tệp không khớp mã băm đã ghi');
    await this.audit.record({ actorUserId: ctx.user.id, action: 'nguon_cung.xem_scan_ma_vung', entityType: 'growing_area', entityId: a.id, detail: { vung: a.code, ma: s.officialCode } });
    return { data, fileName: s.fileName!, mimeType: s.mimeType! };
  }

  /** Người thứ hai duyệt sau khi so mã với giấy. Đồng ý thì mã thành mã của vùng; mã duyệt trước đó chuyển "thay thế". */
  async review(id: string, dongY: boolean, ghiChu: string | null, ctx: AuthContext, ip: string | null) {
    if (!ctx.permissions.includes('NGUON_CUNG_DUYET_MA') || (await this.sourcing.portalPartner(ctx))) throw new ForbiddenException('Bạn không duyệt được mã số vùng');
    await this.db.transaction(async (tx) => {
      const { s, a } = await this.submission(id, tx, true);
      const refusal = reviewRefusal({ status: s.status, hasFile: !!s.storageKey, submittedBy: s.submittedBy, validUntil: s.validUntil }, ctx.user.id, dongY, ghiChu, today());
      if (refusal) throw new BadRequestException(refusal);
      const now = new Date();
      if (dongY) {
        await tx
          .update(areaCodeSubmissions)
          .set({ status: 'thay_the', reviewNote: 'Đã có mã mới được duyệt' })
          .where(and(eq(areaCodeSubmissions.growingAreaId, a.id), eq(areaCodeSubmissions.status, 'da_duyet'), ne(areaCodeSubmissions.id, id)));
        await tx
          .update(growingAreas)
          .set({ officialCode: s.officialCode, officialCodeIssuer: s.issuer, officialCodeValidUntil: s.validUntil, officialCodeSubmissionId: s.id })
          .where(eq(growingAreas.id, a.id));
      }
      await tx
        .update(areaCodeSubmissions)
        .set({ status: dongY ? 'da_duyet' : 'tu_choi', reviewedBy: ctx.user.id, reviewedAt: now, reviewNote: ghiChu?.trim() || null })
        .where(eq(areaCodeSubmissions.id, id));
      await this.audit.record(
        { actorUserId: ctx.user.id, action: dongY ? 'nguon_cung.duyet_ma_vung' : 'nguon_cung.tu_choi_ma_vung', entityType: 'growing_area', entityId: a.id, ip, detail: { vung: a.code, ma: s.officialCode, maCu: a.officialCode, ghiChu } },
        tx,
      );
    });
  }

  /** Thu hồi mã đang dùng (cơ quan cấp đã thu hồi hoặc phát hiện sai): vùng trở về chưa có mã. */
  async revoke(id: string, reason: string, ctx: AuthContext, ip: string | null) {
    if (!ctx.permissions.includes('NGUON_CUNG_DUYET_MA') || (await this.sourcing.portalPartner(ctx))) throw new ForbiddenException('Bạn không thu hồi được mã số vùng');
    await this.db.transaction(async (tx) => {
      const { s, a } = await this.submission(id, tx, true);
      if (s.status !== 'da_duyet') throw new BadRequestException('Chỉ thu hồi mã đã duyệt');
      await tx.update(areaCodeSubmissions).set({ status: 'thu_hoi', reviewedBy: ctx.user.id, reviewedAt: new Date(), reviewNote: reason }).where(eq(areaCodeSubmissions.id, id));
      if (a.officialCodeSubmissionId === s.id) {
        await tx.update(growingAreas).set({ officialCode: null, officialCodeIssuer: null, officialCodeValidUntil: null, officialCodeSubmissionId: null }).where(eq(growingAreas.id, a.id));
      }
      await this.audit.record({ actorUserId: ctx.user.id, action: 'nguon_cung.thu_hoi_ma_vung', entityType: 'growing_area', entityId: a.id, ip, detail: { vung: a.code, ma: s.officialCode, lyDo: reason } }, tx);
    });
  }
}

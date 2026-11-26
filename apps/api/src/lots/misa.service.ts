import { BadRequestException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import { randomBytes } from 'node:crypto';
import { buildFeeWorkbook, FeeExportRow, feeRefNo } from '../accounting/misa';
import type { AuthContext } from '../auth/auth.types';
import { AuditService } from '../audit/audit.service';
import { decrypt, encrypt } from '../common/crypto';
import { loadConfig } from '../config/config';
import { DB, Db, DbExecutor } from '../db/db';
import { contracts, exportLots, feeRequests, misaExports, partners, purchaseLots, users } from '../db/schema';
import { FILE_STORE, FileStore } from '../documents/file-store';
import { decryptBytes, encryptBytes, sha256Bytes } from '../documents/file.rules';

const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

/** Xuất đề nghị thu phí đã duyệt sang MISA AMIS bằng tệp Excel; mỗi dòng chỉ xuất một lần. */
@Injectable()
export class MisaService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly audit: AuditService,
    @Inject(FILE_STORE) private readonly store: FileStore,
  ) {}

  private get masterKey() {
    return Buffer.from(loadConfig().APP_KEY, 'base64');
  }

  private assertCan(ctx: AuthContext) {
    if (!ctx.permissions.includes('KE_TOAN_XUAT_MISA')) throw new ForbiddenException('Chỉ kế toán xuất dữ liệu sang MISA');
  }

  async overview(ctx: AuthContext) {
    this.assertCan(ctx);
    const [{ n }] = await this.db
      .select({ n: sql<number>`count(*)::int` })
      .from(feeRequests)
      .where(and(eq(feeRequests.status, 'da_duyet'), isNull(feeRequests.misaExportId)));
    const dot = await this.db
      .select({ id: misaExports.id, code: misaExports.code, rowCount: misaExports.rowCount, fileSha256: misaExports.fileSha256, createdAt: misaExports.createdAt, createdByName: users.fullName })
      .from(misaExports)
      .innerJoin(users, eq(users.id, misaExports.createdBy))
      .orderBy(desc(misaExports.createdAt))
      .limit(50);
    return { choXuat: n, dotXuat: dot };
  }

  private async rows(exec: DbExecutor, where: ReturnType<typeof and>) {
    const r = await exec
      .select({
        f: feeRequests,
        lotCode: exportLots.code,
        purchaseLotCode: purchaseLots.code,
        contractCode: contracts.code,
        partnerCode: partners.code,
        partnerName: partners.name,
        taxCode: partners.taxCode,
        address: partners.address,
        country: partners.country,
      })
      .from(feeRequests)
      .innerJoin(exportLots, eq(exportLots.id, feeRequests.exportLotId))
      .innerJoin(purchaseLots, eq(purchaseLots.id, feeRequests.purchaseLotId))
      .innerJoin(contracts, eq(contracts.id, feeRequests.feeContractId))
      .innerJoin(partners, eq(partners.id, feeRequests.supplierPartnerId))
      .where(where)
      .orderBy(feeRequests.blDate, exportLots.code, purchaseLots.code);
    return r;
  }

  /** Lập đợt xuất mới: gom mọi đề nghị đã duyệt chưa xuất, đánh dấu "đã chuyển kế toán", trả tệp Excel. */
  async exportFees(ctx: AuthContext) {
    this.assertCan(ctx);
    const at = new Date();
    const key = randomBytes(32);
    return this.db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext('misa_export'))`);
      const pending = await this.rows(tx, and(eq(feeRequests.status, 'da_duyet'), isNull(feeRequests.misaExportId)));
      if (!pending.length) throw new BadRequestException('Không có đề nghị thu phí nào đã duyệt mà chưa xuất');
      const day = new Date(at.getTime() + 7 * 3600e3).toISOString().slice(0, 10).replace(/-/g, '');
      const [{ n }] = await tx.select({ n: sql<number>`count(*)::int` }).from(misaExports).where(sql`${misaExports.code} like ${'MISA-' + day + '-%'}`);
      const code = `MISA-${day}-${String(n + 1).padStart(2, '0')}`;
      const data: FeeExportRow[] = pending.map((x) => ({
        refNo: feeRefNo(x.lotCode, x.purchaseLotCode),
        blDate: x.f.blDate,
        lotCode: x.lotCode,
        purchaseLotCode: x.purchaseLotCode,
        blNumber: x.f.blNumber,
        contractCode: x.contractCode,
        partnerCode: x.partnerCode,
        partnerName: x.partnerName,
        taxCode: x.taxCode,
        address: x.address,
        country: x.country,
        quantityKg: x.f.quantityKg,
        baseValue: x.f.baseValue,
        ratePct: x.f.ratePct!,
        amount: x.f.amount!,
        currency: x.f.currency,
        fxPerUsd: x.f.fxPerUsd,
      }));
      const file = await buildFeeWorkbook(data, { code, at, by: ctx.user.fullName });
      const hash = sha256Bytes(file);
      // Hậu tố ngẫu nhiên: nếu giao dịch hỏng sau khi đã ghi tệp, lần xuất lại không đụng tên tệp cũ
      const storageKey = `misa/${code.toLowerCase()}-${randomBytes(6).toString('hex')}`;
      await this.store.put(storageKey, encryptBytes(file, key));
      const [ex] = await tx
        .insert(misaExports)
        .values({ kind: 'phi_tron_goi', code, rowCount: data.length, fileSha256: hash, storageKey, keyEnc: encrypt(key.toString('base64'), this.masterKey), createdBy: ctx.user.id, createdAt: at })
        .returning();
      await tx
        .update(feeRequests)
        .set({ misaExportId: ex.id })
        .where(and(eq(feeRequests.status, 'da_duyet'), isNull(feeRequests.misaExportId), inArray(feeRequests.id, pending.map((x) => x.f.id))));
      await this.audit.record({ actorUserId: ctx.user.id, action: 'misa.xuat_phi_tron_goi', entityType: 'misa_export', entityId: ex.id, detail: { dot: code, soDong: data.length, maBam: hash } }, tx);
      return { code, data: file, mimeType: XLSX, fileName: `${code}-phi-tron-goi.xlsx` };
    });
  }

  /** Tải lại đúng tệp của một đợt đã xuất. */
  async download(id: string, ctx: AuthContext) {
    this.assertCan(ctx);
    const [ex] = await this.db.select().from(misaExports).where(eq(misaExports.id, id));
    if (!ex) throw new NotFoundException('Không tìm thấy đợt xuất');
    const data = decryptBytes(await this.store.get(ex.storageKey), Buffer.from(decrypt(ex.keyEnc, this.masterKey), 'base64'));
    if (sha256Bytes(data) !== ex.fileSha256) throw new Error('Tệp đợt xuất không khớp mã băm đã ghi');
    await this.audit.record({ actorUserId: ctx.user.id, action: 'misa.tai_lai', entityType: 'misa_export', entityId: ex.id, detail: { dot: ex.code } });
    return { data, mimeType: XLSX, fileName: `${ex.code}-phi-tron-goi.xlsx` };
  }
}

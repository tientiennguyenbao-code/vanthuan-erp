import { BadRequestException, ConflictException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, asc, desc, eq, inArray, isNull, ne, sql } from 'drizzle-orm';
import type { AuthContext } from '../auth/auth.types';
import { generateTemporaryPassword, hashPassword } from '../auth/password';
import { AuditService } from '../audit/audit.service';
import { DB, Db } from '../db/db';
import {
  bookings,
  commodities,
  documentFiles,
  exportLots,
  lotAllocations,
  lotDocuments,
  partnerRoles,
  partners,
  partnerUsers,
  purchaseLots,
  userRoles,
  users,
} from '../db/schema';
import { DocumentsService } from './documents.service';
import { daysToCutoff, mainSupplier } from './lot.rules';

const r2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Cổng nhà cung cấp: mỗi nhà cung cấp chỉ thấy lô có hàng của mình và phần chứng từ của mình.
 * Không thấy giá bán, hàng của nhà cung cấp khác; tên người mua chỉ hiện với lô môi giới
 * (nhà cung cấp đứng tên xuất khẩu nên cần biết). Nhà cung cấp chính của lô môi giới gom
 * thấy thêm tình trạng chứng từ của các nhà cung cấp cùng lô để lập bộ chứng từ người gửi hàng.
 */
@Injectable()
export class PortalService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly documents: DocumentsService,
    private readonly audit: AuditService,
  ) {}

  // ---------- Nhân viên mời nhà cung cấp vào cổng ----------

  private async partnerForStaff(partnerId: string, ctx: AuthContext) {
    if (!ctx.permissions.includes('DOI_TAC_QUAN_LY')) throw new ForbiddenException('Bạn không quản lý tài khoản cổng của đối tác');
    const [p] = await this.db.select().from(partners).where(eq(partners.id, partnerId));
    if (!p) throw new NotFoundException('Không tìm thấy đối tác');
    if (!ctx.permissions.includes('DOI_TAC_QUAN_LY_TAT_CA') && p.ownerUserId !== ctx.user.id) {
      throw new ForbiddenException('Bạn chỉ mời được đối tác do mình phụ trách');
    }
    return p;
  }

  async listAccounts(partnerId: string, ctx: AuthContext) {
    await this.partnerForStaff(partnerId, ctx);
    const rows = await this.db
      .select({ id: users.id, email: users.email, hoTen: users.fullName, trangThai: users.status, daCai2Lop: users.totpEnabled, lanDangNhapCuoi: users.lastLoginAt, moiLuc: partnerUsers.invitedAt })
      .from(partnerUsers)
      .innerJoin(users, eq(users.id, partnerUsers.userId))
      .where(eq(partnerUsers.partnerId, partnerId))
      .orderBy(asc(users.fullName));
    return rows;
  }

  /** Tạo tài khoản cổng cho người liên hệ của nhà cung cấp đã thẩm định; trả mật khẩu tạm để gửi cho họ. */
  async invite(partnerId: string, input: { email: string; hoTen: string }, ctx: AuthContext) {
    const p = await this.partnerForStaff(partnerId, ctx);
    if (p.kycStatus !== 'dat') throw new BadRequestException('Đối tác chưa được duyệt thẩm định');
    const [isSupplier] = await this.db.select().from(partnerRoles).where(and(eq(partnerRoles.partnerId, partnerId), eq(partnerRoles.role, 'nha_cung_cap')));
    if (!isSupplier) throw new BadRequestException('Cổng hiện chỉ mở cho nhà cung cấp');
    const temp = generateTemporaryPassword();
    const passwordHash = await hashPassword(temp);
    try {
      const id = await this.db.transaction(async (tx) => {
        const [u] = await tx.insert(users).values({ email: input.email.trim(), fullName: input.hoTen.trim(), passwordHash, mustChangePassword: true }).returning({ id: users.id });
        await tx.insert(userRoles).values({ userId: u.id, role: 'NHA_CUNG_CAP', grantedBy: ctx.user.id });
        await tx.insert(partnerUsers).values({ userId: u.id, partnerId, invitedBy: ctx.user.id });
        await this.audit.record({ actorUserId: ctx.user.id, action: 'cong.moi_tai_khoan', entityType: 'partner', entityId: partnerId, detail: { email: input.email, doiTac: p.code } }, tx);
        return u.id;
      });
      return { id, matKhauTam: temp };
    } catch (err: unknown) {
      const code = (err as { cause?: { code?: string }; code?: string }).cause?.code ?? (err as { code?: string }).code;
      if (code === '23505') throw new ConflictException('Email này đã có tài khoản');
      throw err;
    }
  }

  // ---------- Nhà cung cấp dùng cổng ----------

  private async me(ctx: AuthContext) {
    const partnerId = await this.documents.portalPartner(ctx);
    if (!partnerId) throw new ForbiddenException('Trang này dành cho nhà cung cấp');
    return partnerId;
  }

  /** Khối lượng theo nhà cung cấp của các lô xuất (phân bổ còn hiệu lực). */
  private async suppliersOf(lotIds: string[]) {
    if (!lotIds.length) return [];
    return this.db
      .select({ lotId: lotAllocations.exportLotId, supplierId: purchaseLots.supplierPartnerId, quantityKg: sql<number>`sum(${lotAllocations.quantityKg})::float8` })
      .from(lotAllocations)
      .innerJoin(purchaseLots, eq(purchaseLots.id, lotAllocations.purchaseLotId))
      .where(and(inArray(lotAllocations.exportLotId, lotIds), isNull(lotAllocations.cancelledAt)))
      .groupBy(lotAllocations.exportLotId, purchaseLots.supplierPartnerId);
  }

  private async lotRows(partnerId: string, lotId?: string) {
    const mine = this.db
      .selectDistinct({ id: lotAllocations.exportLotId })
      .from(lotAllocations)
      .innerJoin(purchaseLots, eq(purchaseLots.id, lotAllocations.purchaseLotId))
      .where(and(eq(purchaseLots.supplierPartnerId, partnerId), isNull(lotAllocations.cancelledAt)));
    return this.db
      .select({
        id: exportLots.id,
        code: exportLots.code,
        dealType: exportLots.dealType,
        status: exportLots.status,
        market: exportLots.market,
        etd: exportLots.etd,
        eta: exportLots.eta,
        blNumber: exportLots.blNumber,
        shippedOn: exportLots.shippedOn,
        commodityName: commodities.name,
        buyerName: partners.name,
        cutoffSi: bookings.cutoffSi,
        cutoffCargo: bookings.cutoffCargo,
        vessel: bookings.vesselVoyage,
      })
      .from(exportLots)
      .innerJoin(commodities, eq(commodities.id, exportLots.commodityId))
      .innerJoin(partners, eq(partners.id, exportLots.buyerPartnerId))
      .leftJoin(bookings, eq(bookings.exportLotId, exportLots.id))
      .where(and(inArray(exportLots.id, mine), ne(exportLots.status, 'da_huy'), lotId ? eq(exportLots.id, lotId) : undefined))
      .orderBy(sql`${exportLots.etd} nulls last`, desc(exportLots.createdAt));
  }

  private shape(l: Awaited<ReturnType<PortalService['lotRows']>>[number], partnerId: string, sup: { lotId: string; supplierId: string; quantityKg: number }[]) {
    const rows = sup.filter((x) => x.lotId === l.id);
    const main = l.dealType === 'moi_gioi' && rows.length > 1 ? mainSupplier(rows) : null;
    return {
      id: l.id,
      code: l.code,
      dealType: l.dealType,
      status: l.status,
      market: l.market,
      commodityName: l.commodityName,
      etd: l.etd,
      eta: l.eta,
      blNumber: l.blNumber,
      shippedOn: l.shippedOn,
      tauChuyen: l.vessel,
      cutoffSi: l.cutoffSi,
      cutoffHang: l.cutoffCargo,
      ngayDenCutoff: daysToCutoff([l.cutoffSi, l.cutoffCargo]),
      // Chỉ lô môi giới: nhà cung cấp đứng tên xuất khẩu nên cần biết người mua
      buyerName: l.dealType === 'moi_gioi' ? l.buyerName : null,
      khoiLuongCuaToiKg: r2(rows.filter((x) => x.supplierId === partnerId).reduce((a, x) => a + x.quantityKg, 0)),
      soNhaCungCap: rows.length,
      laNhaCungCapChinh: main === partnerId,
    };
  }

  async myLots(ctx: AuthContext) {
    const partnerId = await this.me(ctx);
    const lots = await this.lotRows(partnerId);
    const sup = await this.suppliersOf(lots.map((l) => l.id));
    const docs = lots.length
      ? await this.db
          .select({ d: lotDocuments })
          .from(lotDocuments)
          .where(and(inArray(lotDocuments.exportLotId, lots.map((l) => l.id)), eq(lotDocuments.obsolete, false)))
      : [];
    const done = new Set(['da_duyet', 'da_gui', 'khong_ap_dung']);
    return lots.map((l) => {
      const mine = docs.filter((x) => x.d.exportLotId === l.id && (x.d.supplierPartnerId === partnerId || (!x.d.supplierPartnerId && x.d.party === 'nha_cung_cap')));
      const bb = mine.filter((x) => x.d.requirement === 'bb');
      return {
        ...this.shape(l, partnerId, sup),
        chungTuBatBuoc: bb.length,
        chungTuDaDu: bb.filter((x) => done.has(x.d.status)).length,
        biTraLai: mine.filter((x) => x.d.status === 'dang_xin' && x.d.note?.startsWith('Trả lại:')).length,
      };
    });
  }

  async lotDetail(lotId: string, ctx: AuthContext) {
    const partnerId = await this.me(ctx);
    const [l] = await this.lotRows(partnerId, lotId);
    if (!l) throw new NotFoundException('Không tìm thấy lô, hoặc lô không có hàng của quý công ty');
    const lot = this.shape(l, partnerId, await this.suppliersOf([l.id]));
    const all = await this.db
      .select({ d: lotDocuments, supplierName: partners.name })
      .from(lotDocuments)
      .leftJoin(partners, eq(partners.id, lotDocuments.supplierPartnerId))
      .where(and(eq(lotDocuments.exportLotId, lotId), eq(lotDocuments.obsolete, false)))
      .orderBy(asc(lotDocuments.stage), asc(lotDocuments.requirement), asc(lotDocuments.name));
    const isMine = (d: typeof lotDocuments.$inferSelect) => d.supplierPartnerId === partnerId || (!d.supplierPartnerId && d.party === 'nha_cung_cap');
    const mine = all.filter((x) => isMine(x.d));
    const files = mine.length
      ? await this.db
          .select({ f: documentFiles })
          .from(documentFiles)
          .where(inArray(documentFiles.lotDocumentId, mine.map((x) => x.d.id)))
          .orderBy(desc(documentFiles.version))
      : [];
    const open = l.status !== 'hoan_tat';
    return {
      ...lot,
      chungTu: mine.map(({ d }) => ({
        id: d.id,
        name: d.name,
        requirement: d.requirement,
        stage: d.stage,
        issuer: d.issuer,
        status: d.status,
        number: d.number,
        issuedOn: d.issuedOn,
        expiresOn: d.expiresOn,
        note: d.note,
        chungCaLo: !d.supplierPartnerId,
        tep: files.filter((x) => x.f.lotDocumentId === d.id).map(({ f }) => ({ id: f.id, phienBan: f.version, ten: f.fileName, kichThuoc: f.sizeBytes, maBam: f.sha256, luc: f.uploadedAt })),
        coTheCapNhat: open && d.status !== 'da_gui' && d.status !== 'khong_ap_dung',
      })),
      // Nhà cung cấp chính xem tình trạng (không xem tệp, số, giá) chứng từ của các nhà cung cấp khác cùng lô
      chungTuNhaCungCapKhac: lot.laNhaCungCapChinh
        ? all
            .filter((x) => !isMine(x.d) && x.d.supplierPartnerId)
            .map(({ d, supplierName }) => ({ name: d.name, supplierName, requirement: d.requirement, stage: d.stage, status: d.status }))
        : [],
    };
  }
}

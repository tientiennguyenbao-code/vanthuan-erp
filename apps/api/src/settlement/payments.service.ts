import { BadRequestException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, asc, desc, eq, inArray, ne, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import type { AuthContext } from '../auth/auth.types';
import { AuditService } from '../audit/audit.service';
import { DB, Db, DbExecutor } from '../db/db';
import { ExportLot, exportLots, financings, LotPayment, lotEvents, lotPayments, partnerRoles, partners, partnerUsers, purchaseLots } from '../db/schema';
import { LotFinanceService, today } from './lot-finance.service';
import { computeSettlement, milestoneDue, PAYMENT_KIND_RULES, PaymentKind, r2, supplierPayLimitUsd, TOLERANCE_USD, toUsd } from './settlement.rules';

export interface PlanInput {
  kind: PaymentKind;
  purchaseLotId: string | null;
  partnerId: string | null;
  milestone: string;
  dueDate: string | null;
  amount: number;
  currency: string;
  category: string | null;
  note: string | null;
}

export interface RecordInput {
  amount: number;
  paidOn: string;
  fxPerUsd: number | null;
  reference: string | null;
}

export interface FinancingInput {
  bankPartnerId: string;
  borrowerPartnerId: string;
  kind: string;
  amount: number;
  currency: string;
  fxPerUsd: number | null;
  feeRatePct: number;
  dueOn: string;
  collateral: string | null;
  note: string | null;
}

/** Lịch thu chi theo lô, ghi nhận tiền thực thu thực chi, tài trợ ngân hàng và phí thu xếp vốn. */
@Injectable()
export class PaymentsService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly fin: LotFinanceService,
    private readonly audit: AuditService,
  ) {}

  private assertCanRecord(ctx: AuthContext) {
    this.fin.assertCan(ctx, 'THANH_TOAN_GHI_NHAN', 'Chỉ kế toán lập lịch và ghi nhận thu chi');
  }

  // ---------- Xem ----------

  async overview(lotId: string, ctx: AuthContext) {
    const lot = await this.fin.findLot(lotId);
    this.fin.assertCanView(lot, ctx);
    const partner = alias(partners, 'p');
    const rows = await this.db
      .select({
        p: lotPayments,
        partnerName: partner.name,
        purchaseLotCode: purchaseLots.code,
        recordedByName: sql<string | null>`(select full_name from users u where u.id = ${lotPayments.recordedBy})`,
        overpayApprovedByName: sql<string | null>`(select full_name from users u where u.id = ${lotPayments.overpayApprovedBy})`,
      })
      .from(lotPayments)
      .leftJoin(partner, eq(partner.id, lotPayments.partnerId))
      .leftJoin(purchaseLots, eq(purchaseLots.id, lotPayments.purchaseLotId))
      .where(eq(lotPayments.exportLotId, lotId))
      .orderBy(asc(lotPayments.createdAt));
    const bank = alias(partners, 'bank');
    const borrower = alias(partners, 'borrower');
    const fins = await this.db
      .select({ f: financings, bankName: bank.name, borrowerName: borrower.name })
      .from(financings)
      .innerJoin(bank, eq(bank.id, financings.bankPartnerId))
      .innerJoin(borrower, eq(borrower.id, financings.borrowerPartnerId))
      .where(eq(financings.exportLotId, lotId))
      .orderBy(asc(financings.createdAt));
    const state = await this.fin.lotState(lot);
    const locked = !!(await this.fin.activeSettlement(lotId));
    const canRecord = ctx.permissions.includes('THANH_TOAN_GHI_NHAN') && !locked && lot.status !== 'da_huy';
    const isDirector = ctx.permissions.includes('THANH_TOAN_DUYET_VUOT');
    const finById = new Map(fins.map((f) => [f.f.id, f.f]));
    const summary = computeSettlement(await this.fin.settlementInput(lot)).tongHop;
    const limit = lot.dealType === 'mua_dut' ? await this.supplierLimit(lot, this.db) : null;
    return {
      dong: rows.map((x) => {
        const p = x.p;
        const f = p.financingId ? finById.get(p.financingId) : undefined;
        const due = milestoneDue(p.milestone, p.dueDate, { ...state, financingDisbursed: f ? f.status !== 'du_kien' : state.financingDisbursed });
        return {
          ...p,
          ten: PAYMENT_KIND_RULES[p.kind as PaymentKind]?.ten ?? p.kind,
          partnerName: x.partnerName,
          purchaseLotCode: x.purchaseLotCode,
          recordedByName: x.recordedByName,
          overpayApprovedByName: x.overpayApprovedByName,
          paidUsd: p.paidAmount !== null ? r2(toUsd(p.paidAmount, p.currency, p.fxPerUsd) ?? 0) : null,
          denHan: p.status === 'du_kien' && due,
          quyen: {
            ghiNhan: canRecord && p.status === 'du_kien' && p.kind !== 'tien_hang_truc_tiep',
            huy: canRecord && p.status === 'du_kien' && !p.financingId,
            duyetVuot: isDirector && !locked && p.status === 'du_kien' && p.kind === 'tien_hang_ncc' && !p.overpayApprovedBy,
          },
        };
      }),
      taiTro: fins.map((x) => ({
        ...x.f,
        bankName: x.bankName,
        borrowerName: x.borrowerName,
        phiThuXepVon: r2((x.f.amount * x.f.feeRatePct) / 100),
        quyen: { giaiNgan: canRecord && x.f.status === 'du_kien', huy: canRecord && x.f.status === 'du_kien' },
      })),
      tongHop: summary,
      hanMucTraNccUsd: limit,
      khoa: locked,
      quyen: { lapLich: canRecord, taiTro: canRecord },
    };
  }

  /** Hạn mức trả nhà cung cấp còn lại (USD) theo GĐ-20. */
  private async supplierLimit(lot: ExportLot, exec: DbExecutor) {
    const paid = await exec
      .select({ kind: lotPayments.kind, amount: lotPayments.paidAmount, currency: lotPayments.currency, fx: lotPayments.fxPerUsd })
      .from(lotPayments)
      .where(and(eq(lotPayments.exportLotId, lot.id), eq(lotPayments.status, 'da_thuc_hien'), inArray(lotPayments.kind, ['tien_hang_nguoi_mua', 'tien_hang_ncc'])));
    const sumKind = (k: string) => paid.filter((p) => p.kind === k).reduce((s, p) => s + (toUsd(p.amount!, p.currency, p.fx) ?? 0), 0);
    const fins = await exec
      .select()
      .from(financings)
      .where(and(eq(financings.exportLotId, lot.id), inArray(financings.status, ['da_giai_ngan', 'da_tat_toan'])));
    const disbursed = fins.reduce((s, f) => s + (toUsd(f.amount, f.currency, f.fxPerUsd) ?? 0), 0);
    const limit = supplierPayLimitUsd(sumKind('tien_hang_nguoi_mua'), disbursed);
    return { hanMucUsd: r2(limit), daTraUsd: r2(sumKind('tien_hang_ncc')), conLaiUsd: r2(limit - sumKind('tien_hang_ncc')) };
  }

  // ---------- Lập lịch ----------

  async plan(lotId: string, input: PlanInput, ctx: AuthContext) {
    this.assertCanRecord(ctx);
    const rule = PAYMENT_KIND_RULES[input.kind];
    if (!rule.lapTay) throw new BadRequestException('Khoản này do hệ thống lập khi ghi khoản tài trợ');
    if (input.milestone === 'ngay' && !input.dueDate) throw new BadRequestException('Ghi ngày đến hạn');
    if (input.milestone === 'giai_ngan') throw new BadRequestException('Mốc giải ngân chỉ dùng cho khoản của tài trợ');
    return this.db.transaction(async (tx) => {
      const lot = await this.fin.lockLot(lotId, tx);
      await this.fin.assertUnlocked(lot, tx);
      if (rule.loaiGiaoDich && rule.loaiGiaoDich !== lot.dealType) {
        throw new BadRequestException(lot.dealType === 'moi_gioi' ? 'Lô môi giới: Vạn Thuận không thu, không trả tiền hàng; người mua trả thẳng nhà cung cấp' : 'Khoản này chỉ dùng cho lô môi giới');
      }
      let partnerId: string | null = input.partnerId;
      let purchaseLotId: string | null = null;
      if (input.kind === 'tien_hang_nguoi_mua') partnerId = lot.buyerPartnerId;
      if (rule.canLoMua) {
        if (!input.purchaseLotId) throw new BadRequestException('Chọn lô mua (nhà cung cấp) của khoản này');
        const v = await this.fin.lotValues(lot, tx);
        const pl = v.purchaseLots.find((p) => p.purchaseLotId === input.purchaseLotId);
        if (!pl) throw new BadRequestException('Lô mua không có hàng trong lô xuất này');
        purchaseLotId = pl.purchaseLotId;
        partnerId = pl.supplierId;
      }
      if (input.kind === 'chi_phi') {
        if (!input.category) throw new BadRequestException('Chọn hạng mục chi phí');
        if (partnerId) {
          const [p] = await tx.select({ id: partners.id }).from(partners).where(eq(partners.id, partnerId));
          if (!p) throw new BadRequestException('Không tìm thấy đối tác nhận tiền');
        }
      }
      const [row] = await tx
        .insert(lotPayments)
        .values({
          exportLotId: lotId,
          purchaseLotId,
          direction: rule.chieu,
          kind: input.kind,
          category: input.kind === 'chi_phi' ? input.category : null,
          partnerId,
          milestone: input.milestone,
          dueDate: input.milestone === 'ngay' ? input.dueDate : null,
          plannedAmount: input.amount,
          currency: input.currency,
          note: input.note,
          createdBy: ctx.user.id,
        })
        .returning();
      await this.audit.record({ actorUserId: ctx.user.id, action: 'thanh_toan.lap_lich', entityType: 'lot_payment', entityId: row.id, detail: { lo: lot.code, loai: input.kind, soTien: input.amount, tienTe: input.currency, moc: input.milestone } }, tx);
      return { id: row.id };
    });
  }

  async cancel(id: string, reason: string, ctx: AuthContext) {
    this.assertCanRecord(ctx);
    await this.db.transaction(async (tx) => {
      const { p, lot } = await this.lockPayment(id, tx);
      await this.fin.assertUnlocked(lot, tx);
      if (p.status !== 'du_kien') throw new BadRequestException('Chỉ huỷ khoản chưa thực hiện');
      if (p.financingId) throw new BadRequestException('Khoản của tài trợ theo khoản tài trợ, không huỷ riêng được');
      await tx.update(lotPayments).set({ status: 'da_huy', cancelReason: reason }).where(eq(lotPayments.id, id));
      await this.audit.record({ actorUserId: ctx.user.id, action: 'thanh_toan.huy', entityType: 'lot_payment', entityId: id, detail: { lyDo: reason } }, tx);
    });
  }

  // ---------- Ghi nhận thực thu thực chi ----------

  async record(id: string, input: RecordInput, ctx: AuthContext) {
    this.assertCanRecord(ctx);
    await this.db.transaction(async (tx) => {
      const { p, lot } = await this.lockPayment(id, tx);
      if (p.kind === 'tien_hang_truc_tiep') throw new ForbiddenException('Tiền người mua trả thẳng nhà cung cấp do nhà cung cấp xác nhận trên cổng');
      await this.doRecord(p, lot, input, ctx, tx);
    });
  }

  private async doRecord(p: LotPayment, lot: ExportLot, input: RecordInput, ctx: AuthContext, tx: DbExecutor) {
    await this.fin.assertUnlocked(lot, tx);
    if (p.status !== 'du_kien') throw new BadRequestException(p.status === 'da_huy' ? 'Khoản đã huỷ' : 'Khoản đã ghi nhận');
    const fx = p.currency === 'USD' ? 1 : input.fxPerUsd;
    if (!fx) throw new BadRequestException('Ghi tỷ giá thực tế lúc thu, chi (số đơn vị tiền đổi được 1 USD)');
    if (input.paidOn > today()) throw new BadRequestException('Ngày thu, chi không được sau hôm nay');
    const amountUsd = input.amount / fx;

    // GĐ-20: mua đứt không trả nhà cung cấp vượt số đã thu của người mua (hoặc số tài trợ đã giải ngân), trừ khi Giám đốc cho phép.
    if (p.kind === 'tien_hang_ncc' && !p.overpayApprovedBy) {
      const l = await this.supplierLimit(lot, tx);
      if (l.daTraUsd + amountUsd > l.hanMucUsd + TOLERANCE_USD) {
        throw new ForbiddenException(
          `Trả nhà cung cấp vượt số đã thu của người mua: hạn mức ${l.hanMucUsd.toLocaleString('en-US')} USD, đã trả ${l.daTraUsd.toLocaleString('en-US')} USD, khoản này ${r2(amountUsd).toLocaleString('en-US')} USD. Cần Giám đốc duyệt trả vượt.`,
        );
      }
    }

    await tx
      .update(lotPayments)
      .set({ status: 'da_thuc_hien', paidAmount: input.amount, paidOn: input.paidOn, fxPerUsd: fx, reference: input.reference, recordedBy: ctx.user.id, recordedAt: new Date() })
      .where(eq(lotPayments.id, p.id));
    // Thu, chi một phần: phần còn lại thành một khoản dự kiến mới cùng mốc
    const remain = r2(p.plannedAmount - input.amount);
    if (remain > 0 && p.kind !== 'tra_ngan_hang') {
      await tx.insert(lotPayments).values({
        exportLotId: p.exportLotId,
        purchaseLotId: p.purchaseLotId,
        financingId: p.financingId,
        direction: p.direction,
        kind: p.kind,
        category: p.category,
        partnerId: p.partnerId,
        milestone: p.milestone,
        dueDate: p.dueDate,
        plannedAmount: remain,
        currency: p.currency,
        note: 'Phần còn lại sau lần thu, chi trước',
        createdBy: ctx.user.id,
      });
    }
    if (p.kind === 'tra_ngan_hang' && p.financingId) await this.maybeSettleFinancing(p.financingId, input.paidOn, tx);
    const rule = PAYMENT_KIND_RULES[p.kind as PaymentKind];
    await tx.insert(lotEvents).values({
      exportLotId: lot.id,
      purchaseLotId: p.purchaseLotId,
      kind: 'thanh_toan',
      note: `${rule.ten}: ${input.amount.toLocaleString('vi-VN')} ${p.currency}`,
      detail: { khoan: p.id, ngay: input.paidOn, tyGia: fx, soThamChieu: input.reference },
      actorUserId: ctx.user.id,
    });
    await this.audit.record(
      { actorUserId: ctx.user.id, action: 'thanh_toan.ghi_nhan', entityType: 'lot_payment', entityId: p.id, detail: { lo: lot.code, loai: p.kind, soTien: input.amount, tienTe: p.currency, tyGia: fx, vuotDuocDuyet: !!p.overpayApprovedBy } },
      tx,
    );
  }

  /** Giám đốc cho trả nhà cung cấp vượt số đã thu (ghi lý do). Chỉ áp dụng cho đúng khoản này. */
  async approveOverpay(id: string, reason: string, ctx: AuthContext) {
    this.fin.assertCan(ctx, 'THANH_TOAN_DUYET_VUOT', 'Chỉ Giám đốc cho trả nhà cung cấp vượt số đã thu');
    await this.db.transaction(async (tx) => {
      const { p, lot } = await this.lockPayment(id, tx);
      await this.fin.assertUnlocked(lot, tx);
      if (p.kind !== 'tien_hang_ncc' || p.status !== 'du_kien') throw new BadRequestException('Chỉ duyệt khoản trả nhà cung cấp chưa thực hiện');
      if (p.overpayApprovedBy) throw new BadRequestException('Khoản đã được duyệt');
      await tx.update(lotPayments).set({ overpayApprovedBy: ctx.user.id, overpayApprovedAt: new Date(), overpayReason: reason }).where(eq(lotPayments.id, id));
      await this.audit.record({ actorUserId: ctx.user.id, action: 'thanh_toan.duyet_tra_vuot', entityType: 'lot_payment', entityId: id, detail: { lo: lot.code, lyDo: reason } }, tx);
    });
  }

  // ---------- Tài trợ ----------

  async createFinancing(lotId: string, input: FinancingInput, ctx: AuthContext) {
    this.assertCanRecord(ctx);
    if (input.currency !== 'USD' && !input.fxPerUsd) throw new BadRequestException('Ghi tỷ giá quy đổi USD của khoản tài trợ');
    return this.db.transaction(async (tx) => {
      const lot = await this.fin.lockLot(lotId, tx);
      await this.fin.assertUnlocked(lot, tx);
      const [bank] = await tx
        .select({ id: partners.id, kyc: partners.kycStatus })
        .from(partners)
        .innerJoin(partnerRoles, and(eq(partnerRoles.partnerId, partners.id), eq(partnerRoles.role, 'ngan_hang')))
        .where(eq(partners.id, input.bankPartnerId));
      if (!bank) throw new BadRequestException('Bên tài trợ phải là đối tác có vai trò ngân hàng');
      const [borrower] = await tx.select({ id: partners.id, kyc: partners.kycStatus }).from(partners).where(eq(partners.id, input.borrowerPartnerId));
      if (!borrower) throw new BadRequestException('Không tìm thấy bên vay');
      if (bank.kyc !== 'dat' || borrower.kyc !== 'dat') throw new BadRequestException('Ngân hàng và bên vay phải đạt thẩm định');
      const [f] = await tx
        .insert(financings)
        .values({ exportLotId: lotId, ...input, fxPerUsd: input.currency === 'USD' ? 1 : input.fxPerUsd, createdBy: ctx.user.id })
        .returning();
      await tx.insert(lotEvents).values({ exportLotId: lotId, kind: 'tai_tro', note: `Ghi khoản tài trợ ${input.amount.toLocaleString('vi-VN')} ${input.currency}, phí thu xếp vốn ${input.feeRatePct}%`, actorUserId: ctx.user.id });
      await this.audit.record({ actorUserId: ctx.user.id, action: 'tai_tro.tao', entityType: 'financing', entityId: f.id, detail: { lo: lot.code, soTien: input.amount, tienTe: input.currency, tyLePhi: input.feeRatePct } }, tx);
      return { id: f.id };
    });
  }

  /** Ngân hàng giải ngân: lập khoản phí thu xếp vốn (bên vay trả, đến hạn ngay) và khoản trả nợ ngân hàng (đến hạn ngày đáo hạn). */
  async disburse(id: string, disbursedOn: string, ctx: AuthContext) {
    this.assertCanRecord(ctx);
    await this.db.transaction(async (tx) => {
      const { f, lot } = await this.lockFinancing(id, tx);
      await this.fin.assertUnlocked(lot, tx);
      if (f.status !== 'du_kien') throw new BadRequestException('Khoản tài trợ đã giải ngân hoặc đã huỷ');
      await tx.update(financings).set({ status: 'da_giai_ngan', disbursedOn, updatedAt: new Date() }).where(eq(financings.id, id));
      const fee = r2((f.amount * f.feeRatePct) / 100);
      const base = { exportLotId: lot.id, financingId: id, currency: f.currency, createdBy: ctx.user.id };
      if (fee > 0) {
        await tx.insert(lotPayments).values({ ...base, direction: 'thu', kind: 'phi_thu_xep_von', partnerId: f.borrowerPartnerId, milestone: 'giai_ngan', plannedAmount: fee, note: `${f.feeRatePct}% × số tiền tài trợ` });
      }
      await tx.insert(lotPayments).values({ ...base, direction: 'chi', kind: 'tra_ngan_hang', partnerId: f.bankPartnerId, milestone: 'ngay', dueDate: f.dueOn, plannedAmount: f.amount, note: 'Gốc; ghi số thực trả gồm cả lãi, phí ngân hàng' });
      await tx.insert(lotEvents).values({ exportLotId: lot.id, kind: 'tai_tro', note: `Ngân hàng giải ngân ${f.amount.toLocaleString('vi-VN')} ${f.currency}`, actorUserId: ctx.user.id });
      await this.audit.record({ actorUserId: ctx.user.id, action: 'tai_tro.giai_ngan', entityType: 'financing', entityId: id, detail: { lo: lot.code, ngay: disbursedOn, phiThuXepVon: fee } }, tx);
    });
  }

  async cancelFinancing(id: string, reason: string, ctx: AuthContext) {
    this.assertCanRecord(ctx);
    await this.db.transaction(async (tx) => {
      const { f, lot } = await this.lockFinancing(id, tx);
      await this.fin.assertUnlocked(lot, tx);
      if (f.status !== 'du_kien') throw new BadRequestException('Chỉ huỷ khoản tài trợ chưa giải ngân');
      await tx.update(financings).set({ status: 'da_huy', cancelReason: reason, updatedAt: new Date() }).where(eq(financings.id, id));
      await this.audit.record({ actorUserId: ctx.user.id, action: 'tai_tro.huy', entityType: 'financing', entityId: id, detail: { lyDo: reason } }, tx);
    });
  }

  /** Trả đủ gốc (quy USD) thì khoản tài trợ chuyển "đã tất toán". */
  private async maybeSettleFinancing(financingId: string, on: string, tx: DbExecutor) {
    const [f] = await tx.select().from(financings).where(eq(financings.id, financingId));
    const paid = await tx
      .select({ amount: lotPayments.paidAmount, currency: lotPayments.currency, fx: lotPayments.fxPerUsd })
      .from(lotPayments)
      .where(and(eq(lotPayments.financingId, financingId), eq(lotPayments.kind, 'tra_ngan_hang'), eq(lotPayments.status, 'da_thuc_hien')));
    const paidUsd = paid.reduce((s, p) => s + (toUsd(p.amount!, p.currency, p.fx) ?? 0), 0);
    const principal = toUsd(f.amount, f.currency, f.fxPerUsd) ?? f.amount;
    if (paidUsd >= principal - TOLERANCE_USD) {
      await tx.update(financings).set({ status: 'da_tat_toan', repaidOn: on, updatedAt: new Date() }).where(eq(financings.id, financingId));
    } else {
      // Trả chưa đủ gốc: lập khoản còn lại
      const remainUsd = principal - paidUsd;
      const fx = f.currency === 'USD' ? 1 : (f.fxPerUsd ?? 1);
      await tx.insert(lotPayments).values({
        exportLotId: f.exportLotId,
        financingId,
        direction: 'chi',
        kind: 'tra_ngan_hang',
        partnerId: f.bankPartnerId,
        milestone: 'ngay',
        dueDate: f.dueOn,
        plannedAmount: r2(remainUsd * fx),
        currency: f.currency,
        note: 'Gốc còn lại',
        createdBy: f.createdBy,
      });
    }
  }

  // ---------- Cổng nhà cung cấp: xác nhận đã nhận tiền (môi giới) ----------

  private async portalPartner(ctx: AuthContext) {
    if (!ctx.roles.includes('NHA_CUNG_CAP')) throw new ForbiddenException('Chỉ tài khoản cổng của nhà cung cấp');
    const [r] = await this.db.select({ p: partnerUsers.partnerId }).from(partnerUsers).where(eq(partnerUsers.userId, ctx.user.id));
    if (!r) throw new ForbiddenException('Tài khoản chưa gắn với nhà cung cấp nào');
    return r.p;
  }

  async portalPayments(ctx: AuthContext) {
    const partnerId = await this.portalPartner(ctx);
    const rows = await this.db
      .select({ p: lotPayments, lotCode: exportLots.code, purchaseLotCode: purchaseLots.code })
      .from(lotPayments)
      .innerJoin(exportLots, eq(exportLots.id, lotPayments.exportLotId))
      .leftJoin(purchaseLots, eq(purchaseLots.id, lotPayments.purchaseLotId))
      .where(and(eq(lotPayments.partnerId, partnerId), eq(lotPayments.kind, 'tien_hang_truc_tiep'), ne(lotPayments.status, 'da_huy')))
      .orderBy(desc(lotPayments.createdAt));
    return rows.map((x) => ({
      id: x.p.id,
      lotCode: x.lotCode,
      purchaseLotCode: x.purchaseLotCode,
      milestone: x.p.milestone,
      dueDate: x.p.dueDate,
      plannedAmount: x.p.plannedAmount,
      currency: x.p.currency,
      status: x.p.status,
      paidAmount: x.p.paidAmount,
      paidOn: x.p.paidOn,
      reference: x.p.reference,
      coTheXacNhan: x.p.status === 'du_kien',
    }));
  }

  async portalConfirm(id: string, input: RecordInput, ctx: AuthContext) {
    const partnerId = await this.portalPartner(ctx);
    await this.db.transaction(async (tx) => {
      const { p, lot } = await this.lockPayment(id, tx);
      if (p.kind !== 'tien_hang_truc_tiep' || p.partnerId !== partnerId) throw new ForbiddenException('Khoản này không thuộc quý công ty');
      await this.doRecord(p, lot, input, ctx, tx);
    });
  }

  // ---------- Nội bộ ----------

  private async lockPayment(id: string, tx: DbExecutor) {
    // Khoá lô trước rồi mới khoá dòng, cùng thứ tự với các thao tác khác trên lô
    const [head] = await tx.select({ lotId: lotPayments.exportLotId }).from(lotPayments).where(eq(lotPayments.id, id));
    if (!head) throw new NotFoundException('Không tìm thấy khoản thu chi');
    const lot = await this.fin.lockLot(head.lotId, tx);
    const [p] = await tx.select().from(lotPayments).where(eq(lotPayments.id, id)).for('update');
    return { p, lot };
  }

  private async lockFinancing(id: string, tx: DbExecutor) {
    const [head] = await tx.select({ lotId: financings.exportLotId }).from(financings).where(eq(financings.id, id));
    if (!head) throw new NotFoundException('Không tìm thấy khoản tài trợ');
    const lot = await this.fin.lockLot(head.lotId, tx);
    const [f] = await tx.select().from(financings).where(eq(financings.id, id)).for('update');
    return { f, lot };
  }
}


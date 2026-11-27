import { BadRequestException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, asc, desc, eq, inArray, isNotNull, isNull, ne, sql } from 'drizzle-orm';
import type { AuthContext } from '../auth/auth.types';
import { AuditService } from '../audit/audit.service';
import { verificationCode } from '../contracts/contract.rules';
import { ContractsService } from '../contracts/contracts.service';
import { DB, Db } from '../db/db';
import {
  bookings,
  buyerDocReviews,
  collectionSlips,
  commodities,
  complaints,
  contracts,
  contractVersions,
  documentFiles,
  exportLots,
  growingAreas,
  lotAllocations,
  lotDocuments,
  lotEvents,
  lotPayments,
  partners,
  plots,
  priceFixations,
  purchaseLots,
  samples,
  settlements,
  users,
} from '../db/schema';
import { mainSupplier } from '../lots/lot.rules';
import { buyerPartnerOf } from './buyer-access';

const r2 = (n: number) => Math.round(n * 100) / 100;

export const VAN_THUAN_NAME = 'Van Thuan Global Co., Ltd';
/** Khoản người mua phải trả: mua đứt trả Vạn Thuận; môi giới trả thẳng nhà cung cấp (Vạn Thuận theo dõi). */
const BUYER_PAYMENT_KINDS = ['tien_hang_nguoi_mua', 'tien_hang_truc_tiep'];
/** Bản nháp người mua được xem và cho ý kiến (BH-6) */
const REVIEWABLE = ['nhap', 'da_duyet'];
const VISIBLE_FILES = ['nhap', 'da_duyet', 'da_gui'];
/** Tên tiếng Anh của chứng từ theo mã quy tắc; mã lạ thì giữ tên gốc. */
export const DOC_NAME_EN: Record<string, string> = {
  attp_cn: 'Food safety / veterinary certificate (bilateral form)',
  attp_eu: 'Health certificate (EU model)',
  chung_thu_giam_dinh: 'Inspection certificate (weight and quality)',
  co_b: 'Certificate of origin form B',
  co_e_rcep: 'Certificate of origin form E or RCEP',
  coa_mmpa: 'Certificate of admissibility (US MMPA)',
  don_bao_hiem: 'Insurance policy',
  ds_eu: 'Establishment listed for export to the EU',
  eu_1793: 'Official certificate and lab results under (EU) 2019/1793',
  eudr: 'EUDR due diligence file',
  eur1: 'EUR.1 movement certificate (EVFTA)',
  fda_dang_ky: 'FDA facility registration',
  gacc: 'GACC registration number',
  haccp: 'HACCP plan',
  hoa_don: 'Commercial invoice',
  iuu: 'Catch certificate (IUU)',
  kdtv: 'Phytosanitary certificate',
  kn_du_luong: 'Lab report: pesticide residues, ethylene oxide, Salmonella',
  kn_ota: 'Lab report: ochratoxin A and pesticide residues',
  kn_salmonella: 'Lab report: Salmonella and residues',
  nhan_tieng_trung: 'Chinese labelling on packaging',
  phieu_dong_goi: 'Packing list',
  prior_notice: 'FDA Prior Notice',
  to_khai_xk: 'Export customs declaration',
  van_don: 'Bill of lading',
};

/**
 * Cổng người mua (BH-5, BH-6, BH-7), giao diện tiếng Anh. Người mua thấy hợp đồng đã ký của mình, lô hàng,
 * mẫu, giá đã chốt, các khoản phải trả, chứng từ chung của lô; tự mở khiếu nại và cho ý kiến bản nháp chứng từ.
 * Với lô mua đứt, không hiện tên nhà cung cấp; chỉ hiện mã vùng trồng, mã cơ sở đóng gói để truy xuất.
 * Không hiện tỷ lệ phí, giá mua, chi phí, ghi chú nội bộ.
 */
@Injectable()
export class BuyerPortalService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly contractsService: ContractsService,
    private readonly audit: AuditService,
  ) {}

  private async me(ctx: AuthContext) {
    const p = await buyerPartnerOf(ctx, this.db);
    if (!p) throw new ForbiddenException('This page is for buyers');
    return p;
  }

  private async myContracts(buyer: string) {
    const rows = await this.db
      .select({ c: contracts, commodityName: commodities.name, commodityCode: commodities.code, hsCode: commodities.hsCode, sellerName: partners.name })
      .from(contracts)
      .innerJoin(commodities, eq(commodities.id, contracts.commodityId))
      .leftJoin(partners, eq(partners.id, contracts.sellerPartnerId))
      .where(and(eq(contracts.buyerPartnerId, buyer), isNotNull(contracts.signedVersion), ne(contracts.status, 'da_huy')))
      .orderBy(desc(contracts.createdAt));
    const out = [];
    for (const r of rows) {
      const signed = await this.contractsService.signedTerms(r.c.id);
      if (!signed) continue;
      const [v] = await this.db
        .select({ hash: contractVersions.contentHash, signedAt: contractVersions.signedAt })
        .from(contractVersions)
        .where(and(eq(contractVersions.contractId, r.c.id), eq(contractVersions.version, r.c.signedVersion!)));
      const t = signed.terms;
      out.push({
        id: r.c.id,
        code: r.c.code,
        dealType: r.c.dealType,
        commodity: { code: r.commodityCode, name: r.commodityName, hsCode: r.hsCode },
        seller: r.c.sellerPartnerId ? r.sellerName : VAN_THUAN_NAME,
        version: r.c.signedVersion,
        signedAt: v?.signedAt ?? null,
        verificationCode: v ? verificationCode(v.hash) : null,
        terms: {
          quantity: t.soLuong,
          unit: t.donVi,
          tolerancePct: t.dungSaiPhanTram,
          unitPrice: t.donGia,
          currency: t.tienTe,
          incoterms: t.incoterms,
          portOfLoading: t.cangDi ?? null,
          portOfDischarge: t.cangDen ?? null,
          shipmentSchedule: t.lichGiao,
          paymentTerms: t.dieuKhoanThanhToan,
          instalments: (t.dotGiao ?? []).map((d) => ({ month: d.thang, quantity: d.soLuong })),
          differential: t.giaTruLui ? { market: t.giaTruLui.san, futuresMonth: t.giaTruLui.kyHan, differentialUsdPerTon: t.giaTruLui.chenhLech } : null,
          preShipmentSample: !!t.duyetMauTruocXuat,
          creditDays: t.traChamNgay ?? null,
        },
      });
    }
    return out;
  }

  private async lotRows(buyer: string, lotId?: string) {
    return this.db
      .select({
        l: exportLots,
        contractCode: contracts.code,
        commodityName: commodities.name,
        vessel: bookings.vesselVoyage,
        carrier: bookings.carrier,
        bookingNumber: bookings.bookingNumber,
      })
      .from(exportLots)
      .innerJoin(contracts, eq(contracts.id, exportLots.counterContractId))
      .innerJoin(commodities, eq(commodities.id, exportLots.commodityId))
      .leftJoin(bookings, eq(bookings.exportLotId, exportLots.id))
      .where(and(eq(exportLots.buyerPartnerId, buyer), ne(exportLots.status, 'da_huy'), lotId ? eq(exportLots.id, lotId) : undefined))
      .orderBy(sql`${exportLots.etd} nulls last`, desc(exportLots.createdAt));
  }

  private async payments(buyer: string, lotIds: string[]) {
    if (!lotIds.length) return [];
    const rows = await this.db
      .select({ p: lotPayments, lotCode: exportLots.code })
      .from(lotPayments)
      .innerJoin(exportLots, eq(exportLots.id, lotPayments.exportLotId))
      .where(and(inArray(lotPayments.exportLotId, lotIds), eq(exportLots.buyerPartnerId, buyer), inArray(lotPayments.kind, BUYER_PAYMENT_KINDS), ne(lotPayments.status, 'da_huy')))
      .orderBy(sql`${lotPayments.dueDate} nulls last`, asc(lotPayments.createdAt));
    return rows.map(({ p, lotCode }) => ({
      id: p.id,
      lotId: p.exportLotId,
      lotCode,
      payTo: p.kind === 'tien_hang_truc_tiep' ? 'supplier' : 'van_thuan',
      milestone: p.milestone,
      dueDate: p.dueDate,
      amount: p.plannedAmount,
      currency: p.currency,
      status: p.status === 'da_thuc_hien' ? 'paid' : 'open',
      paidAmount: p.paidAmount,
      paidOn: p.paidOn,
    }));
  }

  private shapeLot(x: Awaited<ReturnType<BuyerPortalService['lotRows']>>[number]) {
    return {
      id: x.l.id,
      code: x.l.code,
      contractCode: x.contractCode,
      contractId: x.l.counterContractId,
      shipmentNo: x.l.shipmentNo,
      plannedKg: x.l.plannedKg,
      dealType: x.l.dealType,
      status: x.l.status,
      market: x.l.market,
      commodityName: x.commodityName,
      etd: x.l.etd,
      eta: x.l.eta,
      blNumber: x.l.blNumber,
      shippedOn: x.l.shippedOn,
      vessel: x.vessel,
      carrier: x.carrier,
      bookingNumber: x.bookingNumber,
    };
  }

  async overview(ctx: AuthContext) {
    const buyer = await this.me(ctx);
    const [p] = await this.db.select({ name: partners.name }).from(partners).where(eq(partners.id, buyer));
    const lots = await this.lotRows(buyer);
    const pays = await this.payments(buyer, lots.map((x) => x.l.id));
    const openComplaints = lots.length
      ? await this.db
          .select({ lotId: complaints.exportLotId, n: sql<number>`count(*)::int` })
          .from(complaints)
          .where(and(inArray(complaints.exportLotId, lots.map((x) => x.l.id)), eq(complaints.status, 'mo')))
          .groupBy(complaints.exportLotId)
      : [];
    const toReview = lots.length
      ? await this.db
          .select({ lotId: lotDocuments.exportLotId, n: sql<number>`count(*)::int` })
          .from(lotDocuments)
          .where(and(inArray(lotDocuments.exportLotId, lots.map((x) => x.l.id)), isNull(lotDocuments.supplierPartnerId), eq(lotDocuments.obsolete, false), inArray(lotDocuments.status, REVIEWABLE)))
          .groupBy(lotDocuments.exportLotId)
      : [];
    const open = pays.filter((x) => x.status === 'open');
    const byCurrency = new Map<string, number>();
    for (const x of open) byCurrency.set(x.currency, r2((byCurrency.get(x.currency) ?? 0) + x.amount));
    return {
      buyerName: p?.name ?? null,
      contracts: await this.myContracts(buyer),
      lots: lots.map((x) => ({
        ...this.shapeLot(x),
        openComplaints: openComplaints.find((c) => c.lotId === x.l.id)?.n ?? 0,
        draftsToReview: toReview.find((c) => c.lotId === x.l.id)?.n ?? 0,
      })),
      payments: pays,
      outstanding: [...byCurrency.entries()].map(([currency, amount]) => ({ currency, amount })),
    };
  }

  async lotDetail(lotId: string, ctx: AuthContext) {
    const buyer = await this.me(ctx);
    const [x] = await this.lotRows(buyer, lotId);
    if (!x) throw new NotFoundException('Shipment not found');
    const lot = x.l;

    // Người gửi hàng (BH-7): môi giới hiện nhà cung cấp chính (đứng tên trên vận đơn); mua đứt hiện Vạn Thuận
    const sup = await this.db
      .select({ supplierId: purchaseLots.supplierPartnerId, supplierName: partners.name, quantityKg: sql<number>`sum(${lotAllocations.quantityKg})::float8` })
      .from(lotAllocations)
      .innerJoin(purchaseLots, eq(purchaseLots.id, lotAllocations.purchaseLotId))
      .innerJoin(partners, eq(partners.id, purchaseLots.supplierPartnerId))
      .where(and(eq(lotAllocations.exportLotId, lotId), isNull(lotAllocations.cancelledAt)))
      .groupBy(purchaseLots.supplierPartnerId, partners.name);
    let shipper = VAN_THUAN_NAME;
    if (lot.dealType === 'moi_gioi') {
      const main = mainSupplier(sup);
      shipper = sup.find((s) => s.supplierId === main)?.supplierName ?? (sup.length === 1 ? sup[0].supplierName : 'To be confirmed');
    }

    // Truy xuất bắt buộc: chỉ mã, không tên nhà cung cấp
    const plIds = (
      await this.db
        .selectDistinct({ id: lotAllocations.purchaseLotId, packing: purchaseLots.packingFacilityCode })
        .from(lotAllocations)
        .innerJoin(purchaseLots, eq(purchaseLots.id, lotAllocations.purchaseLotId))
        .where(and(eq(lotAllocations.exportLotId, lotId), isNull(lotAllocations.cancelledAt)))
    );
    const areas = plIds.length
      ? await this.db
          .selectDistinct({ code: growingAreas.officialCode, province: growingAreas.province, kind: growingAreas.kind })
          .from(collectionSlips)
          .innerJoin(plots, eq(plots.id, collectionSlips.plotId))
          .innerJoin(growingAreas, eq(growingAreas.id, plots.growingAreaId))
          .where(and(inArray(collectionSlips.purchaseLotId, plIds.map((p) => p.id)), isNotNull(growingAreas.officialCode)))
      : [];

    const docs = await this.db
      .select()
      .from(lotDocuments)
      .where(and(eq(lotDocuments.exportLotId, lotId), isNull(lotDocuments.supplierPartnerId), eq(lotDocuments.obsolete, false), ne(lotDocuments.status, 'khong_ap_dung')))
      .orderBy(asc(lotDocuments.stage), asc(lotDocuments.name));
    const docIds = docs.map((d) => d.id);
    const files = docIds.length ? await this.db.select().from(documentFiles).where(inArray(documentFiles.lotDocumentId, docIds)).orderBy(desc(documentFiles.version)) : [];
    const reviews = docIds.length
      ? await this.db
          .select({ r: buyerDocReviews, userName: users.fullName })
          .from(buyerDocReviews)
          .innerJoin(users, eq(users.id, buyerDocReviews.userId))
          .where(inArray(buyerDocReviews.lotDocumentId, docIds))
          .orderBy(desc(buyerDocReviews.createdAt))
      : [];
    const open = lot.status !== 'hoan_tat';

    const smp = await this.db
      .select()
      .from(samples)
      .where(and(eq(samples.exportLotId, lotId), eq(samples.partnerId, buyer), ne(samples.status, 'huy'), ne(samples.kind, 'doi_chung')))
      .orderBy(desc(samples.createdAt));

    const fix = await this.db
      .select()
      .from(priceFixations)
      .where(and(eq(priceFixations.exportLotId, lotId), isNull(priceFixations.voidedAt)))
      .orderBy(asc(priceFixations.fixedOn), asc(priceFixations.createdAt));
    const fixedKg = fix.reduce((a, f) => a + f.quantityKg, 0);

    const cpl = await this.db.select().from(complaints).where(eq(complaints.exportLotId, lotId)).orderBy(desc(complaints.openedAt));
    const [settled] = await this.db
      .select({ id: settlements.id })
      .from(settlements)
      .where(and(eq(settlements.exportLotId, lotId), sql`${settlements.status} <> 'tra_lai'`))
      .limit(1);
    const shipped = lot.status === 'xep_tau' || lot.status === 'hoan_tat';

    return {
      ...this.shapeLot(x),
      shipper,
      traceability: {
        growingAreaCodes: areas.map((a) => ({ code: a.code, province: a.province, kind: a.kind })),
        packingFacilityCodes: [...new Set(plIds.map((p) => p.packing).filter((c): c is string => !!c))],
      },
      documents: docs.map((d) => {
        const rv = reviews.find((r) => r.r.lotDocumentId === d.id);
        const showFiles = VISIBLE_FILES.includes(d.status);
        return {
          id: d.id,
          name: DOC_NAME_EN[d.code] ?? d.name,
          stage: d.stage,
          status: d.status,
          number: showFiles ? d.number : null,
          issuedOn: showFiles ? d.issuedOn : null,
          files: showFiles
            ? files.filter((f) => f.lotDocumentId === d.id).map((f) => ({ id: f.id, version: f.version, name: f.fileName, size: f.sizeBytes, sha256: f.sha256, uploadedAt: f.uploadedAt }))
            : [],
          lastReview: rv ? { decision: rv.r.decision, comment: rv.r.comment, by: rv.userName, at: rv.r.createdAt } : null,
          canReview: open && REVIEWABLE.includes(d.status) && files.some((f) => f.lotDocumentId === d.id),
        };
      }),
      samples: smp.map((s) => ({ code: s.code, kind: s.kind, status: s.status, courier: s.courier, trackingNo: s.trackingNo, sentOn: s.sentOn, resultOn: s.resultOn, cupScore: s.cupScore, resultNote: s.resultNote })),
      priceFixations: fix.map((f) => ({ fixedOn: f.fixedOn, quantityKg: f.quantityKg, futuresPrice: f.futuresPrice, differential: f.differential, finalPrice: f.finalPrice })),
      averageFixedPrice: fixedKg > 0 ? r2(fix.reduce((a, f) => a + f.finalPrice * f.quantityKg, 0) / fixedKg) : null,
      fixedKg: r2(fixedKg),
      payments: await this.payments(buyer, [lotId]),
      complaints: cpl.map((c) => ({ code: c.code, kind: c.kind, description: c.description, claimedAmount: c.claimedAmount, currency: c.currency, status: c.status, openedAt: c.openedAt, agreedAmount: c.agreedAmount, resolution: c.resolution, closedAt: c.closedAt })),
      canComplain: shipped && !settled,
    };
  }

  /** Người mua đồng ý hoặc yêu cầu sửa bản nháp chứng từ (BH-6). Không đổi trạng thái chứng từ; nhân viên xử lý tiếp. */
  async reviewDocument(docId: string, input: { approve: boolean; comment: string | null }, ctx: AuthContext) {
    const buyer = await this.me(ctx);
    if (!input.approve && !input.comment) throw new BadRequestException('Please describe the changes you need');
    return this.db.transaction(async (tx) => {
      const [row] = await tx
        .select({ d: lotDocuments, lot: exportLots })
        .from(lotDocuments)
        .innerJoin(exportLots, eq(exportLots.id, lotDocuments.exportLotId))
        .where(eq(lotDocuments.id, docId))
        .for('update');
      if (!row || row.lot.buyerPartnerId !== buyer || row.d.supplierPartnerId || row.d.obsolete || row.lot.status === 'da_huy') throw new NotFoundException('Document not found');
      if (!REVIEWABLE.includes(row.d.status)) throw new BadRequestException('This document is not open for review');
      if (row.lot.status === 'hoan_tat') throw new BadRequestException('This shipment is closed');
      const [hasFile] = await tx.select({ id: documentFiles.id }).from(documentFiles).where(eq(documentFiles.lotDocumentId, docId)).limit(1);
      if (!hasFile) throw new BadRequestException('There is no draft to review yet');
      const decision = input.approve ? 'dong_y' : 'yeu_cau_sua';
      const [r] = await tx.insert(buyerDocReviews).values({ lotDocumentId: docId, decision, comment: input.comment, userId: ctx.user.id }).returning({ id: buyerDocReviews.id });
      await tx.insert(lotEvents).values({
        exportLotId: row.lot.id,
        kind: 'nguoi_mua_y_kien',
        note: `${row.d.name}: ${input.approve ? 'người mua đồng ý bản nháp' : `người mua yêu cầu sửa — ${input.comment}`}`,
        actorUserId: ctx.user.id,
      });
      await this.audit.record(
        { actorUserId: ctx.user.id, action: 'chung_tu.nguoi_mua_y_kien', entityType: 'lot_document', entityId: docId, detail: { lo: row.lot.code, chungTu: row.d.code, quyetDinh: decision, noiDung: input.comment } },
        tx,
      );
      return { id: r.id, decision };
    });
  }
}

/**
 * Quy tắc thanh toán, tài trợ, khiếu nại và quyết toán lô. Tách riêng để dễ đọc và dễ kiểm thử.
 * Theo "Thiết kế phân hệ Giao dịch & Đối tác", mục 6, và các quyết định GĐ-20 đến GĐ-23.
 */
import { COST_KINDS } from '../quotes/quote.rules';

export { COST_KINDS };

/** Sai số chấp nhận khi so số đã thu, đã trả với số phải thu, phải trả (USD). */
export const TOLERANCE_USD = 1;

export const PAYMENT_KINDS = ['tien_hang_nguoi_mua', 'tien_hang_ncc', 'tien_hang_truc_tiep', 'phi_tron_goi', 'phi_thu_xep_von', 'tra_ngan_hang', 'chi_phi'] as const;
export type PaymentKind = (typeof PAYMENT_KINDS)[number];

export interface PaymentKindRule {
  ten: string;
  /** thu: tiền về Vạn Thuận · chi: Vạn Thuận trả · theo_doi: người mua trả thẳng nhà cung cấp (môi giới) */
  chieu: 'thu' | 'chi' | 'theo_doi';
  /** Loại giao dịch dùng được; null là cả hai */
  loaiGiaoDich: 'mua_dut' | 'moi_gioi' | null;
  /** Dòng gắn với một lô mua trong lô (nhà cung cấp của lô mua là bên trả hoặc nhận) */
  canLoMua: boolean;
  /** Kế toán tự lập được; khoản của tài trợ do hệ thống lập khi ghi khoản tài trợ */
  lapTay: boolean;
}

export const PAYMENT_KIND_RULES: Record<PaymentKind, PaymentKindRule> = {
  tien_hang_nguoi_mua: { ten: 'Tiền hàng người mua trả', chieu: 'thu', loaiGiaoDich: 'mua_dut', canLoMua: false, lapTay: true },
  tien_hang_ncc: { ten: 'Tiền hàng trả nhà cung cấp', chieu: 'chi', loaiGiaoDich: 'mua_dut', canLoMua: true, lapTay: true },
  tien_hang_truc_tiep: { ten: 'Tiền hàng người mua trả thẳng nhà cung cấp', chieu: 'theo_doi', loaiGiaoDich: 'moi_gioi', canLoMua: true, lapTay: true },
  phi_tron_goi: { ten: 'Phí trọn gói', chieu: 'thu', loaiGiaoDich: null, canLoMua: true, lapTay: true },
  phi_thu_xep_von: { ten: 'Phí thu xếp vốn', chieu: 'thu', loaiGiaoDich: null, canLoMua: false, lapTay: false },
  tra_ngan_hang: { ten: 'Trả nợ ngân hàng', chieu: 'chi', loaiGiaoDich: null, canLoMua: false, lapTay: false },
  chi_phi: { ten: 'Chi phí của lô', chieu: 'chi', loaiGiaoDich: null, canLoMua: false, lapTay: true },
};

/**
 * Mốc đến hạn theo sự kiện của lô:
 * dat_coc: khi hợp đồng ký (đã ký trước khi có lô) · giam_dinh: chứng thư giám định đạt ·
 * van_don: có vận đơn (escrow giải toả, phí trọn gói) · chung_tu: bộ chứng từ đã hoàn tất (CAD/DP, L/C) ·
 * giai_ngan: ngân hàng giải ngân khoản tài trợ · ngay: đến ngày ghi trên dòng.
 */
export const MILESTONES = ['dat_coc', 'giam_dinh', 'van_don', 'chung_tu', 'giai_ngan', 'ngay'] as const;
export type Milestone = (typeof MILESTONES)[number];

export interface LotState {
  inspectionPassed: boolean;
  shipped: boolean;
  documentsComplete: boolean;
  financingDisbursed: boolean;
  today: string;
}

export function milestoneDue(m: string, dueDate: string | null, s: LotState): boolean {
  switch (m) {
    case 'dat_coc':
      return true;
    case 'giam_dinh':
      return s.inspectionPassed;
    case 'van_don':
      return s.shipped;
    case 'chung_tu':
      return s.documentsComplete;
    case 'giai_ngan':
      return s.financingDisbursed;
    case 'ngay':
      return !!dueDate && dueDate <= s.today;
    default:
      return false;
  }
}

export const FINANCING_KINDS = ['truoc_xuat_khau', 'lc', 'luu_kho', 'chiet_khau'] as const;
export const COMPLAINT_KINDS = ['so_luong', 'chat_luong', 'chung_tu', 'cham_giao'] as const;
export const FAULTS = ['ncc', 'van_chuyen', 'nguoi_mua', 'van_thuan', 'khong_co_loi'] as const;

export const r2 = (n: number) => Math.round(n * 100) / 100;

/** Quy ra USD theo tỷ giá ghi trên dòng; null nếu thiếu tỷ giá. */
export function toUsd(amount: number, currency: string, fxPerUsd: number | null | undefined): number | null {
  if (currency === 'USD') return amount;
  if (!fxPerUsd || fxPerUsd <= 0) return null;
  return amount / fxPerUsd;
}

/**
 * GĐ-20 (mua đứt): tổng tiền trả nhà cung cấp không vượt số đã thu của người mua. Khi lô có tài trợ đã giải ngân,
 * được trả tới số tiền giải ngân (tiền ngân hàng cho vay để trả nhà cung cấp). Khi người mua trả, phần của ngân hàng
 * được giữ lại trước: nên hạn mức là số lớn hơn của hai số, không cộng dồn.
 */
export function supplierPayLimitUsd(buyerReceivedUsd: number, financingDisbursedUsd: number): number {
  return Math.max(buyerReceivedUsd, financingDisbursedUsd);
}

/** Gợi ý lỗi khi xét khiếu nại, đối chiếu giám định cảng đi. */
export function faultHint(kind: string, originInspection: 'dat' | 'khong_dat' | null): string | null {
  if (kind !== 'so_luong' && kind !== 'chat_luong') return null;
  if (originInspection === 'dat') return 'Giám định cảng đi đạt: sai lệch nhiều khả năng phát sinh sau xếp tàu (vận chuyển, bảo hiểm), trừ khi có bằng chứng lỗi ẩn của hàng.';
  if (originInspection === 'khong_dat') return 'Giám định cảng đi không đạt mà vẫn xuất: xem lại quyết định xuất hàng và trách nhiệm của nhà cung cấp.';
  return 'Lô chưa có kết quả giám định cảng đi để đối chiếu.';
}

// ---------- Quyết toán ----------

export interface SettlementInput {
  dealType: 'mua_dut' | 'moi_gioi';
  lotStatus: string;
  /** Giá trị hàng theo hợp đồng đối ứng: khối lượng phân bổ × đơn giá bán (USD) */
  goodsValueUsd: number;
  /** Từng lô mua trong lô xuất */
  purchaseLots: { purchaseLotId: string; code: string; supplierName: string; costUsd: number | null }[];
  /** Chỉ dòng đã thực hiện; số tiền đã quy USD theo tỷ giá thực tế */
  payments: { kind: string; category: string | null; purchaseLotId: string | null; financingId: string | null; amountUsd: number }[];
  pendingPayments: number;
  fees: { status: string; amountUsd: number | null; baseUsd: number }[];
  financings: { id: string; status: string; amountUsd: number; feeUsd: number }[];
  complaints: { status: string; agreedUsd: number; passBackPurchaseLotId: string | null; passBackUsd: number }[];
}

export interface Condition {
  ma: 'chung_tu' | 'nguoi_mua' | 'nha_cung_cap' | 'phi' | 'tai_tro' | 'khieu_nai';
  ten: string;
  dat: boolean;
  chiTiet: string;
}

export interface SettlementLine {
  ma: string;
  ten: string;
  /** Dương là thu vào, âm là chi ra (USD) */
  soTienUsd: number;
}

export interface SettlementResult {
  dieuKien: Condition[];
  dong: SettlementLine[];
  tongHop: {
    giaTriHangUsd: number;
    phaiThuNguoiMuaUsd: number;
    daThuNguoiMuaUsd: number;
    giamTruKhieuNaiUsd: number;
    phaiTraNccUsd: number | null;
    daTraNccUsd: number;
    phiPhaiThuUsd: number;
    phiDaThuUsd: number;
    phiThuXepVonPhaiThuUsd: number;
    phiThuXepVonDaThuUsd: number;
    dongKeHoachConMo: number;
  };
  bienUsd: number;
  bienPhanTram: number | null;
}

const usd = (n: number) => `${r2(n).toLocaleString('en-US')} USD`;

const COST_LABELS: Record<string, string> = {
  van_tai_noi_dia: 'vận tải nội địa',
  thu_tuc_xuat_khau: 'thủ tục xuất khẩu',
  xep_hang: 'xếp hàng',
  cuoc_bien: 'cước biển',
  bao_hiem: 'bảo hiểm',
  giam_dinh: 'giám định',
  so_che_dong_goi: 'sơ chế, đóng gói',
  kho: 'kho',
  khac: 'khác',
};

export function computeSettlement(x: SettlementInput): SettlementResult {
  const sum = (kind: string, f: (p: SettlementInput['payments'][number]) => boolean = () => true) =>
    x.payments.filter((p) => p.kind === kind && f(p)).reduce((s, p) => s + p.amountUsd, 0);
  const closed = x.complaints.filter((c) => c.status === 'da_dong');
  const deduction = closed.reduce((s, c) => s + c.agreedUsd, 0);
  const passBack = (lotId: string) => closed.filter((c) => c.passBackPurchaseLotId === lotId).reduce((s, c) => s + c.passBackUsd, 0);

  const buyerDue = x.goodsValueUsd - deduction;
  const buyerKind = x.dealType === 'mua_dut' ? 'tien_hang_nguoi_mua' : 'tien_hang_truc_tiep';
  const buyerPaid = sum(buyerKind);

  const supplierPaid = sum('tien_hang_ncc');
  const supplierDue = x.dealType === 'mua_dut' ? x.purchaseLots.reduce((s, l) => s + (l.costUsd ?? 0) - passBack(l.purchaseLotId), 0) : null;

  // Phí trọn gói tính lại khi có giảm trừ: tỷ lệ bình quân của các đề nghị × số giảm trừ
  const feeAmount = x.fees.reduce((s, f) => s + (f.amountUsd ?? 0), 0);
  const feeBase = x.fees.reduce((s, f) => s + f.baseUsd, 0);
  const feeAdjust = feeBase > 0 ? (deduction * feeAmount) / feeBase : 0;
  const feeDue = feeAmount - feeAdjust;
  const feePaid = sum('phi_tron_goi');
  const disbursed = x.financings.filter((f) => f.status === 'da_giai_ngan' || f.status === 'da_tat_toan');
  const finFeeDue = disbursed.reduce((s, f) => s + f.feeUsd, 0);
  const finFeePaid = sum('phi_thu_xep_von');

  const dieuKien: Condition[] = [];
  dieuKien.push({
    ma: 'chung_tu',
    ten: 'Bộ chứng từ hoàn tất',
    dat: x.lotStatus === 'hoan_tat',
    chiTiet: x.lotStatus === 'hoan_tat' ? 'Lô đã hoàn tất, chứng từ bắt buộc đã gửi.' : 'Lô chưa hoàn tất bộ chứng từ.',
  });
  dieuKien.push({
    ma: 'nguoi_mua',
    ten: x.dealType === 'mua_dut' ? 'Người mua trả đủ' : 'Người mua trả đủ cho nhà cung cấp',
    dat: buyerPaid >= buyerDue - TOLERANCE_USD,
    chiTiet: `Phải trả ${usd(buyerDue)}${deduction ? ` (sau giảm trừ khiếu nại ${usd(deduction)})` : ''}; ${x.dealType === 'mua_dut' ? 'đã thu' : 'nhà cung cấp xác nhận đã nhận'} ${usd(buyerPaid)}.`,
  });
  if (x.dealType === 'mua_dut') {
    const short = x.purchaseLots.filter((l) => sum('tien_hang_ncc', (p) => p.purchaseLotId === l.purchaseLotId) < (l.costUsd ?? 0) - passBack(l.purchaseLotId) - TOLERANCE_USD);
    dieuKien.push({
      ma: 'nha_cung_cap',
      ten: 'Đã trả đủ nhà cung cấp',
      dat: short.length === 0 && x.purchaseLots.every((l) => l.costUsd !== null),
      chiTiet: `Phải trả ${usd(supplierDue!)}; đã trả ${usd(supplierPaid)}.${short.length ? ` Còn thiếu: ${short.map((l) => l.code).join(', ')}.` : ''}`,
    });
  } else {
    const missing = x.purchaseLots.filter((l) => sum('tien_hang_truc_tiep', (p) => p.purchaseLotId === l.purchaseLotId) <= 0);
    dieuKien.push({
      ma: 'nha_cung_cap',
      ten: 'Nhà cung cấp xác nhận đã nhận tiền',
      dat: missing.length === 0,
      chiTiet: missing.length ? `Chưa xác nhận: ${missing.map((l) => `${l.code} (${l.supplierName})`).join(', ')}.` : 'Mọi nhà cung cấp trong lô đã xác nhận trên cổng.',
    });
  }
  const pendingFees = x.fees.filter((f) => f.status !== 'da_duyet').length;
  dieuKien.push({
    ma: 'phi',
    ten: 'Đã thu phí',
    dat: pendingFees === 0 && feePaid >= feeDue - TOLERANCE_USD && finFeePaid >= finFeeDue - TOLERANCE_USD,
    chiTiet:
      `Phí trọn gói phải thu ${usd(feeDue)}${feeAdjust ? ` (đã trừ ${usd(feeAdjust)} do giảm trừ khiếu nại)` : ''}, đã thu ${usd(feePaid)}` +
      (finFeeDue ? `; phí thu xếp vốn phải thu ${usd(finFeeDue)}, đã thu ${usd(finFeePaid)}` : '') +
      (pendingFees ? `; còn ${pendingFees} đề nghị thu phí chưa duyệt` : '') +
      '.',
  });
  const openFin = x.financings.filter((f) => f.status === 'du_kien' || f.status === 'da_giai_ngan');
  dieuKien.push({
    ma: 'tai_tro',
    ten: 'Đã tất toán tài trợ',
    dat: openFin.length === 0,
    chiTiet: x.financings.length === 0 ? 'Lô không có tài trợ.' : openFin.length ? `Còn ${openFin.length} khoản tài trợ chưa tất toán.` : 'Mọi khoản tài trợ đã tất toán.',
  });
  const openComplaints = x.complaints.filter((c) => c.status === 'mo').length;
  dieuKien.push({
    ma: 'khieu_nai',
    ten: 'Không còn khiếu nại mở',
    dat: openComplaints === 0,
    chiTiet: openComplaints ? `Còn ${openComplaints} khiếu nại đang mở.` : x.complaints.length ? 'Các khiếu nại đã đóng.' : 'Không có khiếu nại.',
  });

  const dong: SettlementLine[] = [];
  if (x.dealType === 'mua_dut') {
    dong.push({ ma: 'doanh_thu_hang', ten: 'Doanh thu bán hàng (đã thu người mua)', soTienUsd: r2(buyerPaid) });
    dong.push({ ma: 'gia_von', ten: 'Giá vốn (đã trả nhà cung cấp)', soTienUsd: r2(-supplierPaid) });
  }
  dong.push({ ma: 'phi_tron_goi', ten: 'Phí trọn gói đã thu', soTienUsd: r2(feePaid) });
  if (finFeePaid || finFeeDue) dong.push({ ma: 'phi_thu_xep_von', ten: 'Phí thu xếp vốn đã thu', soTienUsd: r2(finFeePaid) });
  const cats = [...new Set(x.payments.filter((p) => p.kind === 'chi_phi').map((p) => p.category ?? 'khac'))].sort();
  for (const c of cats) dong.push({ ma: `chi_phi:${c}`, ten: `Chi phí ${COST_LABELS[c] ?? c}`, soTienUsd: r2(-sum('chi_phi', (p) => (p.category ?? 'khac') === c)) });
  const repaid = sum('tra_ngan_hang');
  const principal = x.financings.filter((f) => f.status === 'da_tat_toan').reduce((s, f) => s + f.amountUsd, 0);
  if (repaid || principal) dong.push({ ma: 'chi_phi_von', ten: 'Chi phí vốn (lãi, phí ngân hàng)', soTienUsd: r2(-(repaid - principal)) });

  const bien = r2(dong.reduce((s, l) => s + l.soTienUsd, 0));
  const base = x.dealType === 'mua_dut' ? buyerPaid : x.goodsValueUsd;
  return {
    dieuKien,
    dong,
    tongHop: {
      giaTriHangUsd: r2(x.goodsValueUsd),
      phaiThuNguoiMuaUsd: r2(buyerDue),
      daThuNguoiMuaUsd: r2(buyerPaid),
      giamTruKhieuNaiUsd: r2(deduction),
      phaiTraNccUsd: supplierDue === null ? null : r2(supplierDue),
      daTraNccUsd: r2(supplierPaid),
      phiPhaiThuUsd: r2(feeDue),
      phiDaThuUsd: r2(feePaid),
      phiThuXepVonPhaiThuUsd: r2(finFeeDue),
      phiThuXepVonDaThuUsd: r2(finFeePaid),
      dongKeHoachConMo: x.pendingPayments,
    },
    bienUsd: bien,
    bienPhanTram: base > 0 ? Math.round((bien / base) * 100000) / 1000 : null,
  };
}

/**
 * GĐ-23: Giám đốc duyệt thêm khi lô lỗ, hoặc biên thực tế thấp hơn biên dự toán quá 10%
 * (so tương đối: biên thực tế < 90% biên dự toán).
 */
export function directorReview(bienUsd: number, bienPhanTram: number | null, duToanPhanTram: number | null): { can: boolean; lyDo: string | null } {
  if (bienUsd < 0) return { can: true, lyDo: `Lô lỗ ${r2(-bienUsd).toLocaleString('en-US')} USD` };
  if (duToanPhanTram !== null && duToanPhanTram > 0 && bienPhanTram !== null && bienPhanTram < duToanPhanTram * 0.9) {
    const thap = Math.round(((duToanPhanTram - bienPhanTram) / duToanPhanTram) * 1000) / 10;
    return { can: true, lyDo: `Biên thực tế ${bienPhanTram}% thấp hơn dự toán ${duToanPhanTram}% là ${thap}% (quá 10%)` };
  }
  return { can: false, lyDo: null };
}

/**
 * Quy tắc phân hệ Bán hàng: phiếu hỏi hàng và mẫu hàng.
 * Theo "Thiết kế phân hệ Bán hàng và Người mua", mục Các phần mới, ý 1 và 2.
 */

export const INQUIRY_SOURCES = ['email', 'hoi_cho', 'gioi_thieu', 'website', 'cong', 'khac'] as const;
export type InquirySource = (typeof INQUIRY_SOURCES)[number];

export const INQUIRY_STATUSES = ['moi', 'dang_bao_gia', 'thang', 'thua', 'huy'] as const;
export type InquiryStatus = (typeof INQUIRY_STATUSES)[number];

export const LOST_REASONS = ['gia', 'chat_luong', 'thoi_gian_giao', 'chung_nhan', 'khong_phan_hoi', 'khac'] as const;
export type LostReason = (typeof LOST_REASONS)[number];

/** Số ngày làm việc để gửi báo giá kể từ ngày nhận yêu cầu. */
export const QUOTE_RESPONSE_BUSINESS_DAYS = 2;

const iso = (d: Date) => d.toISOString().slice(0, 10);
const parse = (s: string) => new Date(`${s}T00:00:00Z`);

/** Cộng n ngày làm việc (bỏ thứ Bảy, Chủ nhật). Chưa tính ngày lễ. */
export function addBusinessDays(from: string, n: number): string {
  const d = parse(from);
  let left = n;
  while (left > 0) {
    d.setUTCDate(d.getUTCDate() + 1);
    const wd = d.getUTCDay();
    if (wd !== 0 && wd !== 6) left--;
  }
  return iso(d);
}

/** Hạn gửi báo giá của phiếu hỏi hàng. */
export function quoteDueOn(receivedOn: string): string {
  return addBusinessDays(receivedOn, QUOTE_RESPONSE_BUSINESS_DAYS);
}

/** Phiếu mới đã qua hạn gửi báo giá mà chưa có báo giá nào. */
export function isInquiryOverdue(status: string, receivedOn: string, today: string = iso(new Date())): boolean {
  return status === 'moi' && today > quoteDueOn(receivedOn);
}

/** Phiếu còn mở (sửa được, lập thêm báo giá được). */
export function isInquiryOpen(status: string): boolean {
  return status === 'moi' || status === 'dang_bao_gia';
}

export interface InquiryStats {
  tong: number;
  theoTrangThai: Record<InquiryStatus, number>;
  /** Tỷ lệ thắng (%) trên số phiếu đã có kết quả thắng hoặc thua; null khi chưa có. */
  tyLeThang: number | null;
  lyDoThua: Partial<Record<LostReason, number>>;
  quaHan: number;
}

export function inquiryStats(rows: { status: string; receivedOn: string; lostReason: string | null }[], today?: string): InquiryStats {
  const theoTrangThai = Object.fromEntries(INQUIRY_STATUSES.map((s) => [s, 0])) as Record<InquiryStatus, number>;
  const lyDoThua: Partial<Record<LostReason, number>> = {};
  let quaHan = 0;
  for (const r of rows) {
    if (r.status in theoTrangThai) theoTrangThai[r.status as InquiryStatus]++;
    if (r.status === 'thua' && r.lostReason) lyDoThua[r.lostReason as LostReason] = (lyDoThua[r.lostReason as LostReason] ?? 0) + 1;
    if (isInquiryOverdue(r.status, r.receivedOn, today)) quaHan++;
  }
  const closed = theoTrangThai.thang + theoTrangThai.thua;
  return { tong: rows.length, theoTrangThai, tyLeThang: closed ? Math.round((theoTrangThai.thang / closed) * 1000) / 10 : null, lyDoThua, quaHan };
}

// ---------- Mẫu hàng ----------

export const SAMPLE_KINDS = ['chao_hang', 'truoc_xuat', 'doi_chung'] as const;
export type SampleKind = (typeof SAMPLE_KINDS)[number];
export type SampleStatus = 'chuan_bi' | 'da_gui' | 'dat' | 'khong_dat' | 'luu' | 'huy';

export interface SampleLinks {
  kind: SampleKind;
  sector: string;
  partnerId: string;
  commodityId: string;
  inquiry?: { partnerId: string; commodityId: string } | null;
  exportLot?: { buyerPartnerId: string; commodityId: string } | null;
  purchaseLot?: { commodityId: string } | null;
}

/** Kiểm các liên kết của mẫu. Trả về lý do nếu sai. */
export function sampleLinkProblem(s: SampleLinks): string | null {
  if (s.kind === 'truoc_xuat' && !s.exportLot) return 'Mẫu trước xuất phải chọn lô xuất';
  if (s.kind === 'doi_chung' && !s.exportLot && !s.purchaseLot) return 'Mẫu đối chứng phải chọn lô xuất hoặc lô mua';
  if (s.inquiry && (s.inquiry.partnerId !== s.partnerId || s.inquiry.commodityId !== s.commodityId)) return 'Phiếu hỏi hàng phải cùng người mua và cùng mặt hàng';
  if (s.exportLot && s.exportLot.buyerPartnerId !== s.partnerId) return 'Lô xuất thuộc người mua khác';
  if (s.exportLot && s.exportLot.commodityId !== s.commodityId) return 'Lô xuất khác mặt hàng';
  if (s.purchaseLot && s.purchaseLot.commodityId !== s.commodityId) return 'Lô mua khác mặt hàng';
  return null;
}

/** Trạng thái ban đầu: mẫu đối chứng được lưu ngay, mẫu khác chờ gửi. */
export function initialSampleStatus(kind: SampleKind): SampleStatus {
  return kind === 'doi_chung' ? 'luu' : 'chuan_bi';
}

/** Ghi kết quả: chỉ mẫu đã gửi; điểm thử nếm chỉ cho cà phê, trong khoảng 0–100. */
export function sampleResultProblem(status: string, kind: string, sector: string, cupScore: number | null | undefined): string | null {
  if (kind === 'doi_chung') return 'Mẫu đối chứng không có kết quả của người mua';
  if (status !== 'da_gui') return 'Chỉ ghi kết quả cho mẫu đã gửi';
  if (cupScore != null && sector !== 'ca_phe') return 'Điểm thử nếm chỉ dùng cho cà phê';
  if (cupScore != null && (cupScore < 0 || cupScore > 100)) return 'Điểm thử nếm trong khoảng 0 đến 100';
  return null;
}

// ---------- Chốt giá trừ lùi, cổng xếp tàu của bán hàng ----------

/** Số ngày trước ETD bắt đầu cảnh báo còn hàng chưa chốt giá (BH-2). */
export const FIXING_WARNING_DAYS = 10;

/** Giá chốt bình quân gia quyền (USD/tấn) của các lần chốt; null khi chưa chốt. */
export function weightedFixedPrice(rows: { quantityKg: number; finalPrice: number }[]): number | null {
  const kg = rows.reduce((a, r) => a + r.quantityKg, 0);
  if (kg <= 0) return null;
  return Math.round((rows.reduce((a, r) => a + r.quantityKg * r.finalPrice, 0) / kg) * 100) / 100;
}

/** Khối lượng cần chốt giá của lô: khối lượng đã phân bổ, chưa phân bổ thì lấy khối lượng của đợt. */
export function kgToFix(allocatedKg: number, plannedKg: number): number {
  return allocatedKg > 0 ? allocatedKg : plannedKg;
}

/** Lý do không ghi được một lần chốt giá. */
export function fixationRefusal(input: { hasDifferential: boolean; lotStatus: string; quantityKg: number; fixedKg: number; maxKg: number }): string | null {
  if (!input.hasDifferential) return 'Hợp đồng của lô không bán theo giá trừ lùi';
  if (['xep_tau', 'hoan_tat', 'da_huy'].includes(input.lotStatus)) return 'Lô đã xếp tàu hoặc đã huỷ, không chốt giá thêm';
  if (input.fixedKg + input.quantityKg > input.maxKg + 0.005) {
    return `Chốt vượt khối lượng của lô: đã chốt ${Math.round(input.fixedKg)} kg, tối đa ${Math.round(input.maxKg)} kg`;
  }
  return null;
}

export interface SalesGateInput {
  needsPreShipmentSample: boolean;
  samples: { kind: string; status: string }[];
  hasDifferential: boolean;
  needFixKg: number;
  fixedKg: number;
}

/** Điều kiện bán hàng trước khi xếp tàu: mẫu trước xuất đạt (BH-4) và đã chốt đủ giá (BH-2). */
export function salesShippingProblems(g: SalesGateInput): string[] {
  const out: string[] = [];
  if (g.needsPreShipmentSample) {
    const pre = g.samples.filter((s) => s.kind === 'truoc_xuat');
    if (!pre.some((s) => s.status === 'dat')) {
      out.push(pre.some((s) => s.status === 'khong_dat') ? 'Mẫu trước xuất bị người mua đánh giá không đạt' : 'Người mua chưa duyệt mẫu trước xuất');
    }
  }
  if (g.hasDifferential && g.fixedKg < g.needFixKg - 0.5) {
    out.push(`Còn ${(Math.round((g.needFixKg - g.fixedKg) / 10) / 100).toLocaleString('vi-VN')} tấn chưa chốt giá`);
  }
  return out;
}

/** Cảnh báo chốt giá: còn hàng chưa chốt và ETD trong vòng 10 ngày (hoặc đã qua). */
export function fixingWarning(etd: string | null, unfixedKg: number, today: string = iso(new Date())): boolean {
  if (!etd || unfixedKg <= 0.5) return false;
  const days = Math.round((parse(etd).getTime() - parse(today).getTime()) / 864e5);
  return days <= FIXING_WARNING_DAYS;
}

/** 1 US cent/lb = 22,0462 USD/tấn. */
export const CENTS_LB_TO_USD_T = 22.0462;

/** Giá sàn quy ra USD/tấn: sàn London niêm yết USD/tấn, sàn New York niêm yết US cent/lb. */
export function futuresToUsdPerTon(market: string, price: number): number {
  return Math.round((market === 'ICE_NY' ? price * CENTS_LB_TO_USD_T : price) * 100) / 100;
}

/** Giá chốt USD/tấn = giá sàn (quy USD/tấn) + chênh lệch. */
export function fixedPrice(market: string, futuresPrice: number, differential: number): number {
  return Math.round((futuresToUsdPerTon(market, futuresPrice) + differential) * 100) / 100;
}

export interface ProgressLot {
  id: string;
  code: string;
  shipmentNo: number;
  status: string;
  allocatedKg: number;
  fixedKg: number;
  avgPrice: number | null;
}

/**
 * Tiến độ giao của hợp đồng bán theo từng đợt (BH-1): mỗi đợt một lô xuất.
 * Hàng tính là đã giao khi lô đã xếp tàu; tổng giao phải nằm trong dung sai của hợp đồng.
 */
export function deliveryProgress(plan: { thang: string | null; plannedKg: number }[], lots: ProgressLot[], tolerancePct: number) {
  const shipped = (s: string) => s === 'xep_tau' || s === 'hoan_tat';
  const rows = plan.map((p, i) => {
    const lot = lots.find((l) => l.shipmentNo === i + 1 && l.status !== 'da_huy') ?? null;
    return {
      dot: i + 1,
      thang: p.thang,
      keHoachKg: p.plannedKg,
      lo: lot ? { id: lot.id, code: lot.code, status: lot.status } : null,
      phanBoKg: lot?.allocatedKg ?? 0,
      daGiaoKg: lot && shipped(lot.status) ? lot.allocatedKg : 0,
      daChotKg: lot?.fixedKg ?? 0,
      giaBinhQuan: lot?.avgPrice ?? null,
    };
  });
  const totalKg = plan.reduce((a, p) => a + p.plannedKg, 0);
  const deliveredKg = rows.reduce((a, r) => a + r.daGiaoKg, 0);
  const minKg = totalKg * (1 - tolerancePct / 100);
  const maxKg = totalKg * (1 + tolerancePct / 100);
  const r3 = (n: number) => Math.round(n * 1000) / 1000;
  return {
    dot: rows,
    tongKg: r3(totalKg),
    daGiaoKg: r3(deliveredKg),
    conLaiKg: r3(Math.max(0, totalKg - deliveredKg)),
    toiThieuKg: r3(minKg),
    toiDaKg: r3(maxKg),
    vuotDungSai: deliveredKg > maxKg + 0.5,
    hoanThanh: rows.every((r) => r.lo && shipped(r.lo.status)) && deliveredKg >= minKg - 0.5,
  };
}

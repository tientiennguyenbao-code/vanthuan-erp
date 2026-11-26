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

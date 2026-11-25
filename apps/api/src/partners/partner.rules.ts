/**
 * Quy tắc thẩm định đối tác (KYC), tách riêng để dễ đọc và dễ kiểm thử.
 * Theo "Thiết kế phân hệ Giao dịch & Đối tác", mục 3.1.
 */

export const PARTNER_ROLES = ['nha_cung_cap', 'nguoi_mua', 'ngan_hang', 'hang_tau', 'giam_dinh', 'kho'] as const;
export type PartnerRole = (typeof PARTNER_ROLES)[number];

export const PARTNER_CATEGORIES = [
  'htx',
  'nong_trai',
  'nha_may',
  'doanh_nghiep_thuong_mai',
  'nha_nhap_khau',
  'nha_phan_phoi',
  'nha_che_bien',
  'ngan_hang',
  'hang_tau',
  'giam_dinh',
  'kho',
  'khac',
] as const;

export const RISK_RATINGS = ['thap', 'trung_binh', 'cao'] as const;
export type RiskRating = (typeof RISK_RATINGS)[number];

export type KycStatus = 'nhap' | 'cho_tham_dinh' | 'dat' | 'tu_choi';
/** Trạng thái hiển thị: thêm "het_han" khi đã đạt nhưng quá hạn tái thẩm định. */
export type EffectiveKycStatus = KycStatus | 'het_han';

/** Chu kỳ tái thẩm định [Giả định GĐ-4]: 12 tháng, rủi ro cao 6 tháng. */
export function kycValidityMonths(risk: RiskRating): number {
  return risk === 'cao' ? 6 : 12;
}

export function addMonths(date: Date, months: number): Date {
  const d = new Date(date);
  d.setUTCMonth(d.getUTCMonth() + months);
  return d;
}

export function effectiveKycStatus(status: KycStatus, expiresAt: Date | null, now = new Date()): EffectiveKycStatus {
  if (status === 'dat' && expiresAt && expiresAt.getTime() <= now.getTime()) return 'het_han';
  return status;
}

/** Đối tác chỉ được dùng trong hợp đồng khi thẩm định đạt và còn hạn. */
export function isKycValid(status: KycStatus, expiresAt: Date | null, now = new Date()): boolean {
  return effectiveKycStatus(status, expiresAt, now) === 'dat';
}

/** Ngày hết hạn tài liệu (YYYY-MM-DD) nằm trong `days` ngày tới (hoặc đã quá hạn). */
export function isExpiringWithin(expiresOn: string | null, days: number, now = new Date()): boolean {
  if (!expiresOn) return false;
  const exp = Date.parse(`${expiresOn}T23:59:59Z`);
  return exp - now.getTime() <= days * 24 * 3600 * 1000;
}

/**
 * Quy tắc hợp đồng, tách riêng để dễ đọc và dễ kiểm thử.
 * Theo "Thiết kế phân hệ Giao dịch & Đối tác", mục 3.3, 3.6 và 3.7.
 */

export const CONTRACT_KINDS = ['mua', 'ban', 'moi_gioi', 'mua_ban_truc_tiep'] as const;
export type ContractKind = (typeof CONTRACT_KINDS)[number];

export const CURRENCIES = ['USD', 'VND', 'EUR', 'CNY'] as const;
export const INCOTERMS = ['EXW', 'FCA', 'FAS', 'FOB', 'CFR', 'CIF', 'CPT', 'CIP', 'DAP', 'DPU', 'DDP'] as const;
export const UNITS = ['kg', 'tan'] as const;

/**
 * nhap: đang soạn (sửa được) · cho_ky: đã trình, nội dung bị khoá · da_ky: phiên bản hiện hành đã ký ·
 * da_huy: đã huỷ. Khi lập phụ lục, hợp đồng quay về nhap với phiên bản mới; phiên bản đã ký cũ vẫn giữ.
 */
export type ContractStatus = 'nhap' | 'cho_ky' | 'da_ky' | 'da_huy';

/** Loại sự kiện ghi vào sổ cái hợp đồng. */
export type LedgerEvent = 'tao' | 'sua' | 'trinh_ky' | 'tra_lai' | 'ky' | 'phu_luc' | 'huy' | 'duyet_phi';

export interface ContractTerms {
  soLuong: number;
  donVi: (typeof UNITS)[number];
  dungSaiPhanTram: number;
  donGia: number;
  tienTe: (typeof CURRENCIES)[number];
  /** Số đơn vị tiền của hợp đồng đổi được 1 USD (ví dụ 25.400 VND). Bắt buộc khi trình ký nếu không phải USD. */
  tyGiaUsd?: number | null;
  incoterms: (typeof INCOTERMS)[number];
  cangDi?: string | null;
  cangDen?: string | null;
  lichGiao: string;
  dieuKhoanThanhToan: string;
  /** Tỷ lệ phí trọn gói (%), đàm phán theo từng hợp đồng. */
  tyLePhiPhanTram?: number | null;
  ghiChu?: string | null;
}

/** Vạn Thuận là một bên ở hợp đồng mua và bán; ở môi giới, hai bên là nhà cung cấp và người mua. */
export interface PartyRule {
  benBan: 'bat_buoc' | 'khong' | 'tuy_chon';
  benMua: 'bat_buoc' | 'khong' | 'tuy_chon';
  loaiGiaoDich: 'mua_dut' | 'moi_gioi';
  tienTo: string;
}

export const PARTY_RULES: Record<ContractKind, PartyRule> = {
  // Vạn Thuận mua của nhà cung cấp
  mua: { benBan: 'bat_buoc', benMua: 'khong', loaiGiaoDich: 'mua_dut', tienTo: 'HDM' },
  // Vạn Thuận bán cho người mua
  ban: { benBan: 'khong', benMua: 'bat_buoc', loaiGiaoDich: 'mua_dut', tienTo: 'HDB' },
  // Hợp đồng dịch vụ môi giới với bên bán (bên trả phí trọn gói)
  moi_gioi: { benBan: 'bat_buoc', benMua: 'tuy_chon', loaiGiaoDich: 'moi_gioi', tienTo: 'HDMG' },
  // Hợp đồng mua bán ký trực tiếp giữa nhà cung cấp và người mua, Vạn Thuận theo dõi
  mua_ban_truc_tiep: { benBan: 'bat_buoc', benMua: 'bat_buoc', loaiGiaoDich: 'moi_gioi', tienTo: 'HDTT' },
};

/** Kiểm tra các bên theo loại hợp đồng. Trả về lý do nếu sai. */
export function checkParties(kind: ContractKind, sellerId: string | null | undefined, buyerId: string | null | undefined): string | null {
  const rule = PARTY_RULES[kind];
  if (rule.benBan === 'bat_buoc' && !sellerId) return 'Hợp đồng loại này phải có bên bán (nhà cung cấp)';
  if (rule.benBan === 'khong' && sellerId) return 'Ở hợp đồng bán, Vạn Thuận là bên bán; không chọn bên bán khác';
  if (rule.benMua === 'bat_buoc' && !buyerId) return 'Hợp đồng loại này phải có bên mua (người mua)';
  if (rule.benMua === 'khong' && buyerId) return 'Ở hợp đồng mua, Vạn Thuận là bên mua; không chọn bên mua khác';
  if (sellerId && buyerId && sellerId === buyerId) return 'Bên bán và bên mua phải là hai đối tác khác nhau';
  return null;
}

/** Giá trị hợp đồng theo tiền của hợp đồng, làm tròn 2 chữ số. Đơn giá tính theo đơn vị số lượng. */
export function contractValue(t: Pick<ContractTerms, 'soLuong' | 'donGia'>): number {
  return Math.round(t.soLuong * t.donGia * 100) / 100;
}

/** Giá trị quy ra USD để so với hạn mức ký; null nếu chưa có tỷ giá. */
export function contractValueUsd(t: Pick<ContractTerms, 'soLuong' | 'donGia' | 'tienTe' | 'tyGiaUsd'>): number | null {
  const v = contractValue(t);
  if (t.tienTe === 'USD') return v;
  if (!t.tyGiaUsd || t.tyGiaUsd <= 0) return null;
  return Math.round((v / t.tyGiaUsd) * 100) / 100;
}

/**
 * Hợp đồng mang phí trọn gói (bên bán trả): hợp đồng mua khi mua đứt (khấu trừ lúc trả tiền hàng)
 * và hợp đồng dịch vụ môi giới. Phí phải chốt trước khi ký.
 */
export const FEE_BEARING_KINDS: readonly ContractKind[] = ['mua', 'moi_gioi'];

/** Tỷ lệ phí dưới mức sàn Ban Giám đốc đặt thì cần Ban Giám đốc duyệt trước khi ký. */
export function feeNeedsApproval(ratePct: number | null | undefined, floorPct: number | null | undefined): boolean {
  return floorPct !== null && floorPct !== undefined && ratePct !== null && ratePct !== undefined && ratePct < floorPct;
}

/** Điều kiện để trình ký: đủ các điều khoản cốt lõi. Trả về danh sách thiếu sót. */
export function readinessProblems(t: ContractTerms, kind?: ContractKind): string[] {
  const out: string[] = [];
  if (kind && FEE_BEARING_KINDS.includes(kind) && (t.tyLePhiPhanTram === null || t.tyLePhiPhanTram === undefined)) {
    out.push('Chưa chốt tỷ lệ phí trọn gói');
  }
  if (!(t.soLuong > 0)) out.push('Số lượng phải lớn hơn 0');
  if (!(t.donGia > 0)) out.push('Đơn giá phải lớn hơn 0');
  if (t.tienTe !== 'USD' && !(t.tyGiaUsd && t.tyGiaUsd > 0)) out.push('Hợp đồng không tính bằng USD cần tỷ giá quy đổi (chốt khi ký)');
  if (!t.lichGiao?.trim()) out.push('Thiếu lịch giao hàng');
  if (!t.dieuKhoanThanhToan?.trim()) out.push('Thiếu điều khoản thanh toán');
  return out;
}

export interface SignAuthorization {
  validFrom: Date;
  validTo: Date;
  maxValueUsd: number | null;
  revokedAt: Date | null;
}

/**
 * Ai được ký: Giám đốc ký mọi hợp đồng; Phó Giám đốc ký khi có văn bản ủy quyền còn hiệu lực
 * và giá trị hợp đồng nằm trong hạn mức ủy quyền. Trả về lý do nếu không được ký.
 */
export function signingRefusal(
  roles: readonly string[],
  valueUsd: number | null,
  authorizations: readonly SignAuthorization[],
  now = new Date(),
): string | null {
  if (roles.includes('GIAM_DOC')) return null;
  if (!roles.includes('PHO_GIAM_DOC')) return 'Chỉ Giám đốc hoặc Phó Giám đốc được ủy quyền mới ký được hợp đồng';
  const active = authorizations.filter((a) => !a.revokedAt && a.validFrom.getTime() <= now.getTime() && now.getTime() < a.validTo.getTime());
  if (active.length === 0) return 'Phó Giám đốc chưa có văn bản ủy quyền ký còn hiệu lực';
  const covers = active.some((a) => a.maxValueUsd === null || (valueUsd !== null && valueUsd <= a.maxValueUsd));
  if (!covers) return 'Giá trị hợp đồng vượt hạn mức được ủy quyền; cần Giám đốc ký';
  return null;
}

/** Mã xác minh gửi cho đối tác: 64 ký tự mã băm chia nhóm 4 cho dễ đọc, đối chiếu. */
export function verificationCode(contentHash: string): string {
  return contentHash.toUpperCase().match(/.{1,4}/g)!.join('-');
}

export function normalizeVerificationCode(input: string): string {
  return input.replace(/[^0-9a-fA-F]/g, '').toLowerCase();
}

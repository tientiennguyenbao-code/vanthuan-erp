/** Tên và kiểu dữ liệu dùng chung cho các trang kho. */
export const LOAI_KHU: Record<string, string> = { thuong: 'Khu thường', du_eudr: 'Khu đủ EUDR', kho_lanh: 'Kho lạnh' };
export const LOAI_LO_TON: Record<string, string> = { nguyen_lieu: 'Nguyên liệu', thanh_pham: 'Thành phẩm', phu_pham: 'Phụ phẩm' };
export const NHAN_EUDR: Record<string, string> = { du: 'Đủ EUDR', khong_du: 'Không đủ EUDR' };
export const SO_KHO: Record<string, string> = {
  nhan_hang: 'Nhận hàng',
  huy_nhan_hang: 'Huỷ phiếu nhận hàng',
  chuyen_khu: 'Chuyển khu',
  tach_ra: 'Tách sang lô mới',
  tach_vao: 'Tách từ lô',
};

export const kg = (v: number | null | undefined) => (v === null || v === undefined ? '—' : `${v.toLocaleString('vi-VN', { maximumFractionDigits: 2 })} kg`);
export const phanTram = (v: number) => `${(v * 100).toLocaleString('vi-VN', { maximumFractionDigits: 1 })}%`;

export interface Khu { id: string; code: string; name: string; kind: string; kindLabel: string; capacityKg: number | null; active: boolean; tonKg: number; soLoTon: number }
export interface Kho {
  id: string;
  name: string;
  kind: string;
  ownership: string;
  partnerName: string | null;
  address: string | null;
  capacityKg: number | null;
  khu: Khu[];
  tonKg: number;
  thuKho: { id: string; hoTen: string }[];
  quyen: { cauHinh: boolean; ghiPhieu: boolean };
}
export interface NguonGoc { purchaseLotId: string; code: string; supplierName: string; share: number }
export interface ChenhLech { collectedKg: number; receivedKg: number; diffKg: number; diffPct: number | null; warning: string | null }

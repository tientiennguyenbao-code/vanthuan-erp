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
  so_che_vao: 'Đưa vào sơ chế',
  so_che_ra: 'Ra từ sơ chế',
  huy_so_che: 'Huỷ do lệnh sơ chế bị từ chối',
  tra_lai_so_che: 'Trả lại do lệnh sơ chế bị từ chối',
  xuat_kho: 'Xuất kho cho lô xuất',
  huy_xuat_kho: 'Huỷ phiếu xuất kho, hàng về lại',
  chuyen_kho_di: 'Chuyển sang kho khác',
  chuyen_kho_den: 'Nhận từ kho khác',
  huy_chuyen_kho: 'Huỷ phiếu chuyển kho, hàng về lại',
  kiem_ke: 'Điều chỉnh theo kiểm kê',
};
export const TRANG_THAI_LO_TON: Record<string, string> = { san_sang: 'Sẵn sàng', cho_duyet: 'Chờ Giám đốc duyệt hao hụt', huy: 'Đã huỷ' };
export const TRANG_THAI_CHUYEN: Record<string, string> = { dang_di: 'Đang đi đường', da_nhan: 'Đã nhận', huy: 'Đã huỷ' };
export const TRANG_THAI_KIEM_KE: Record<string, string> = { dang_dem: 'Đang đếm', cho_duyet: 'Chờ Kế toán trưởng duyệt', da_dieu_chinh: 'Đã điều chỉnh sổ', tu_choi: 'Trả lại, đếm lại' };
export const TRANG_THAI_LENH: Record<string, string> = { xong: 'Xong', cho_duyet: 'Chờ duyệt hao hụt', tu_choi: 'Bị từ chối' };

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

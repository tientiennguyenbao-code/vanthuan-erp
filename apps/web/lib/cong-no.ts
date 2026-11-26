export const NHOM_TUOI_NO: Record<string, string> = {
  chua_den_han: 'Chưa đến hạn',
  qua_1_30: 'Quá hạn 1–30 ngày',
  qua_31_60: 'Quá hạn 31–60 ngày',
  qua_61_90: 'Quá hạn 61–90 ngày',
  qua_tren_90: 'Quá hạn trên 90 ngày',
  chua_co_han: 'Chưa có ngày đến hạn',
};
export const THU_TU_NHOM = ['chua_den_han', 'qua_1_30', 'qua_31_60', 'qua_61_90', 'qua_tren_90', 'chua_co_han'];
export const TRANG_THAI_HAN_MUC: Record<string, string> = { de_xuat: 'Chờ Giám đốc duyệt', da_duyet: 'Đã duyệt', tu_choi: 'Bị từ chối', huy: 'Đã huỷ' };
export const usd = (v: number | null | undefined) => (v === null || v === undefined ? '—' : `${v.toLocaleString('vi-VN', { maximumFractionDigits: 0 })} USD`);

export interface TuoiNo {
  buckets: Record<string, number>;
  total: number;
  overdue: number;
  maxOverdueDays: number;
  missingFx: number;
}

/** Tên tiếng Việt cho các mã dùng trong hệ thống. */
export const VAI_DOI_TAC: Record<string, string> = {
  nha_cung_cap: 'Nhà cung cấp',
  nguoi_mua: 'Người mua',
  ngan_hang: 'Ngân hàng',
  hang_tau: 'Hãng tàu',
  giam_dinh: 'Giám định',
  kho: 'Kho',
};

export const NHOM_DOI_TAC: Record<string, string> = {
  htx: 'Hợp tác xã',
  nong_trai: 'Nông trại liên kết',
  nha_may: 'Nhà máy',
  doanh_nghiep_thuong_mai: 'Doanh nghiệp thương mại',
  nha_nhap_khau: 'Nhà nhập khẩu',
  nha_phan_phoi: 'Nhà phân phối',
  nha_che_bien: 'Nhà chế biến',
  ngan_hang: 'Ngân hàng',
  hang_tau: 'Hãng tàu',
  giam_dinh: 'Đơn vị giám định',
  kho: 'Kho bãi',
  khac: 'Khác',
};

export const TRANG_THAI_KYC: Record<string, string> = {
  nhap: 'Nháp',
  cho_tham_dinh: 'Chờ thẩm định',
  dat: 'Đạt',
  tu_choi: 'Bị từ chối',
  het_han: 'Hết hạn thẩm định',
};

export const RUI_RO: Record<string, string> = { thap: 'Thấp', trung_binh: 'Trung bình', cao: 'Cao' };

export const NGANH: Record<string, string> = { ca_phe: 'Cà phê', gia_vi: 'Gia vị', thuy_san: 'Thủy sản' };

export const LOAI_CO_SO: Record<string, string> = { kho: 'Kho', xuong_so_che: 'Xưởng sơ chế' };
export const HINH_THUC_CO_SO: Record<string, string> = { thue: 'Đi thuê', cua_nha_cung_cap: 'Của nhà cung cấp', tu_van_hanh: 'Tự đầu tư vận hành' };

export function ngay(v: string | null | undefined): string {
  return v ? new Date(v).toLocaleDateString('vi-VN') : '—';
}

export const LOAI_HOP_DONG: Record<string, string> = {
  mua: 'Hợp đồng mua (Vạn Thuận mua của nhà cung cấp)',
  ban: 'Hợp đồng bán (Vạn Thuận bán cho người mua)',
  moi_gioi: 'Hợp đồng dịch vụ môi giới (với bên bán)',
  mua_ban_truc_tiep: 'Hợp đồng mua bán trực tiếp (nhà cung cấp – người mua)',
};
export const LOAI_HOP_DONG_NGAN: Record<string, string> = { mua: 'Mua', ban: 'Bán', moi_gioi: 'Môi giới', mua_ban_truc_tiep: 'Mua bán trực tiếp' };

export const TRANG_THAI_HOP_DONG: Record<string, string> = { nhap: 'Đang soạn', cho_ky: 'Chờ ký', da_ky: 'Đã ký', da_huy: 'Đã huỷ' };

export const SU_KIEN_SO_CAI: Record<string, string> = {
  tao: 'Tạo hợp đồng',
  sua: 'Sửa điều khoản',
  trinh_ky: 'Trình ký',
  tra_lai: 'Trả lại để sửa',
  ky: 'Ký',
  phu_luc: 'Lập phụ lục',
  huy: 'Huỷ hợp đồng',
  duyet_phi: 'Duyệt phí dưới mức sàn',
  ncc_dong_y_chia_lo: 'Nhà cung cấp đồng ý chia lô',
  khieu_nai: 'Đóng khiếu nại sau giao hàng',
  quyet_toan: 'Duyệt quyết toán lô',
};

export function tien(v: number | null | undefined, tienTe?: string): string {
  if (v === null || v === undefined) return '—';
  return `${v.toLocaleString('vi-VN', { maximumFractionDigits: 2 })}${tienTe ? ' ' + tienTe : ''}`;
}

export function ngayGio(v: string | null | undefined): string {
  return v ? new Date(v).toLocaleString('vi-VN', { dateStyle: 'short', timeStyle: 'short' }) : '—';
}

export const TRANG_THAI_BAO_GIA: Record<string, string> = { nhap: 'Đang soạn', da_gui: 'Đã gửi', chap_nhan: 'Đã chấp nhận', tu_choi: 'Bị từ chối', huy: 'Đã huỷ' };

export const LOAI_CHI_PHI: Record<string, string> = {
  van_tai_noi_dia: 'Vận tải nội địa',
  thu_tuc_xuat_khau: 'Thủ tục xuất khẩu',
  xep_hang: 'Phí xếp hàng tại cảng đi',
  cuoc_bien: 'Cước biển',
  bao_hiem: 'Bảo hiểm hàng hoá (tối thiểu 110% giá trị)',
  giam_dinh: 'Giám định',
  so_che_dong_goi: 'Sơ chế, đóng gói',
  kho: 'Lưu kho',
  khac: 'Khác',
};

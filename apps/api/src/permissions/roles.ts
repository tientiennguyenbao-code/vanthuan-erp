/**
 * Vai trò và quyền, theo bảng phân quyền đã chốt trong "Thiết kế kỹ thuật giai đoạn 1".
 * Đổi quyền của một vai trò chỉ cần sửa bảng ROLE_PERMISSIONS bên dưới.
 */

export const ROLES = [
  'GIAM_DOC',
  'PHO_GIAM_DOC',
  'KE_TOAN_TRUONG',
  'TRUONG_PHONG_KD',
  'NHAN_VIEN_KD',
  'KE_TOAN_VIEN',
  'QUAN_TRI_HE_THONG',
  // Vai trò của đối tác trên cổng (dùng từ phân hệ cổng đối tác)
  'NHA_CUNG_CAP',
  'NGUOI_MUA',
  'DOI_TAC_KHAC',
] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_LABELS: Record<Role, string> = {
  GIAM_DOC: 'Giám đốc',
  PHO_GIAM_DOC: 'Phó Giám đốc',
  KE_TOAN_TRUONG: 'Kế toán trưởng',
  TRUONG_PHONG_KD: 'Trưởng phòng kinh doanh',
  NHAN_VIEN_KD: 'Nhân viên kinh doanh',
  KE_TOAN_VIEN: 'Kế toán viên',
  QUAN_TRI_HE_THONG: 'Quản trị hệ thống',
  NHA_CUNG_CAP: 'Nhà cung cấp',
  NGUOI_MUA: 'Người mua',
  DOI_TAC_KHAC: 'Ngân hàng / đối tác khác',
};

export const STAFF_ROLES: readonly Role[] = [
  'GIAM_DOC',
  'PHO_GIAM_DOC',
  'KE_TOAN_TRUONG',
  'TRUONG_PHONG_KD',
  'NHAN_VIEN_KD',
  'KE_TOAN_VIEN',
  'QUAN_TRI_HE_THONG',
];
export const PARTNER_ROLES: readonly Role[] = ['NHA_CUNG_CAP', 'NGUOI_MUA', 'DOI_TAC_KHAC'];

export const PERMISSIONS = [
  // Hợp đồng
  'HOP_DONG_XEM_TAT_CA',
  'HOP_DONG_SOAN_TAT_CA',
  'HOP_DONG_SOAN_CUA_MINH',
  /** Ký hợp đồng, trả lại hợp đồng chưa ký, huỷ hợp đồng đã ký. Phó Giám đốc cần thêm văn bản ủy quyền. */
  'HOP_DONG_DUYET_KY',
  /** Cấp, thu hồi ủy quyền ký hợp đồng cho Phó Giám đốc */
  'HOP_DONG_UY_QUYEN',
  // Lô hàng
  'LO_HANG_XEM_TAT_CA',
  'LO_HANG_PHAN_CONG',
  'LO_HANG_QUAN_LY_CUA_MINH',
  /** Mở cổng chặn xếp tàu khi thiếu chứng từ (bắt buộc ghi lý do). Chỉ Giám đốc. */
  'LO_HANG_MO_CHAN',
  // Chứng từ
  'CHUNG_TU_XEM_TAT_CA',
  'CHUNG_TU_KIEM_TRA',
  'CHUNG_TU_DUYET_CHECKLIST',
  'CHUNG_TU_DUYET_TAI_CHINH',
  'MA_TRAN_DUYET',
  // Phí và kế toán
  'PHI_XEM_TAT_CA',
  'PHI_XEM_CUA_MINH',
  'PHI_DUYET_TY_LE',
  'PHI_LAP_DE_NGHI_THU',
  'PHI_DUYET_DE_NGHI_THU',
  'KE_TOAN_XUAT_MISA',
  // Thanh toán, tài trợ, khiếu nại, quyết toán
  /** Lập lịch thu chi theo lô, ghi nhận tiền thực thu thực chi, ghi khoản tài trợ ngân hàng */
  'THANH_TOAN_GHI_NHAN',
  /** Cho trả nhà cung cấp vượt số đã thu của người mua (mua đứt). Chỉ Giám đốc. */
  'THANH_TOAN_DUYET_VUOT',
  /** Mở khiếu nại sau giao hàng (thay mặt người mua) */
  'KHIEU_NAI_MO',
  /** Kết luận lỗi, số tiền giảm trừ, chuyển trách nhiệm cho nhà cung cấp và đóng khiếu nại */
  'KHIEU_NAI_GIAI_QUYET',
  'QUYET_TOAN_LAP',
  /** Kế toán trưởng duyệt quyết toán lô */
  'QUYET_TOAN_DUYET',
  /** Giám đốc duyệt thêm khi lô lỗ hoặc biên thấp hơn dự toán quá 10% */
  'QUYET_TOAN_DUYET_GD',
  // Đối tác
  'DOI_TAC_XEM',
  /** Tạo, sửa đối tác do mình phụ trách */
  'DOI_TAC_QUAN_LY',
  /** Sửa mọi đối tác, đổi người phụ trách */
  'DOI_TAC_QUAN_LY_TAT_CA',
  /** Duyệt thẩm định đối tác rủi ro thấp và trung bình */
  'DOI_TAC_DUYET',
  /** Duyệt thẩm định đối tác rủi ro cao */
  'DOI_TAC_DUYET_RUI_RO_CAO',
  'DOI_TAC_MOI_CONG',
  // Danh mục
  'DANH_MUC_QUAN_LY',
  // Quản trị
  'NHAT_KY_XEM',
  'TAI_KHOAN_QUAN_LY',
] as const;
export type Permission = (typeof PERMISSIONS)[number];

const BAN_GIAM_DOC: Permission[] = [
  'HOP_DONG_XEM_TAT_CA',
  'HOP_DONG_DUYET_KY',
  'LO_HANG_XEM_TAT_CA',
  'CHUNG_TU_XEM_TAT_CA',
  'MA_TRAN_DUYET',
  'PHI_XEM_TAT_CA',
  'PHI_DUYET_TY_LE',
  'DOI_TAC_XEM',
  'DOI_TAC_DUYET',
  'DOI_TAC_DUYET_RUI_RO_CAO',
  'DANH_MUC_QUAN_LY',
  'NHAT_KY_XEM',
  'KHIEU_NAI_GIAI_QUYET',
];

export const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  GIAM_DOC: [...BAN_GIAM_DOC, 'HOP_DONG_UY_QUYEN', 'LO_HANG_MO_CHAN', 'THANH_TOAN_DUYET_VUOT', 'QUYET_TOAN_DUYET_GD'],
  // Phó Giám đốc ký hợp đồng theo ủy quyền của Giám đốc: phân hệ hợp đồng kiểm tra văn bản
  // ủy quyền còn hiệu lực và hạn mức trước mỗi lần ký.
  PHO_GIAM_DOC: BAN_GIAM_DOC,
  KE_TOAN_TRUONG: [
    'HOP_DONG_XEM_TAT_CA',
    'LO_HANG_XEM_TAT_CA',
    'CHUNG_TU_XEM_TAT_CA',
    'CHUNG_TU_DUYET_TAI_CHINH',
    'MA_TRAN_DUYET',
    'PHI_XEM_TAT_CA',
    'PHI_DUYET_DE_NGHI_THU',
    'KE_TOAN_XUAT_MISA',
    'THANH_TOAN_GHI_NHAN',
    'QUYET_TOAN_LAP',
    'QUYET_TOAN_DUYET',
    'DOI_TAC_XEM',
  ],
  TRUONG_PHONG_KD: [
    'HOP_DONG_XEM_TAT_CA',
    'HOP_DONG_SOAN_TAT_CA',
    'LO_HANG_XEM_TAT_CA',
    'LO_HANG_PHAN_CONG',
    'CHUNG_TU_XEM_TAT_CA',
    'CHUNG_TU_DUYET_CHECKLIST',
    'MA_TRAN_DUYET',
    'PHI_XEM_TAT_CA',
    'DOI_TAC_XEM',
    'DOI_TAC_QUAN_LY',
    'DOI_TAC_QUAN_LY_TAT_CA',
    'DOI_TAC_DUYET',
    'DANH_MUC_QUAN_LY',
    'KHIEU_NAI_MO',
    'KHIEU_NAI_GIAI_QUYET',
  ],
  NHAN_VIEN_KD: [
    'HOP_DONG_SOAN_CUA_MINH',
    'LO_HANG_QUAN_LY_CUA_MINH',
    'CHUNG_TU_KIEM_TRA',
    'PHI_XEM_CUA_MINH',
    'DOI_TAC_XEM',
    'DOI_TAC_QUAN_LY',
    'DOI_TAC_MOI_CONG',
    'KHIEU_NAI_MO',
  ],
  KE_TOAN_VIEN: [
    'HOP_DONG_XEM_TAT_CA',
    'LO_HANG_XEM_TAT_CA',
    'CHUNG_TU_XEM_TAT_CA',
    'PHI_XEM_TAT_CA',
    'PHI_LAP_DE_NGHI_THU',
    'KE_TOAN_XUAT_MISA',
    'THANH_TOAN_GHI_NHAN',
    'QUYET_TOAN_LAP',
    'DOI_TAC_XEM',
  ],
  // Quản trị hệ thống chỉ quản lý tài khoản, không xem nội dung nghiệp vụ.
  QUAN_TRI_HE_THONG: ['TAI_KHOAN_QUAN_LY'],
  // Đối tác chỉ thấy dữ liệu của mình qua cổng; không có quyền nội bộ nào.
  NHA_CUNG_CAP: [],
  NGUOI_MUA: [],
  DOI_TAC_KHAC: [],
};

export function permissionsFor(roles: readonly Role[]): Permission[] {
  const set = new Set<Permission>();
  for (const r of roles) for (const p of ROLE_PERMISSIONS[r] ?? []) set.add(p);
  return PERMISSIONS.filter((p) => set.has(p));
}

export function isRole(value: string): value is Role {
  return (ROLES as readonly string[]).includes(value);
}

/**
 * Kiểm tra một tổ hợp vai trò có hợp lệ không. Trả về lý do nếu không hợp lệ.
 * - Quản trị hệ thống không được kiêm vai trò nghiệp vụ (tách quyền quản trị và nghiệp vụ).
 * - Tài khoản nội bộ không được mang vai trò đối tác và ngược lại.
 */
export function validateRoleSet(roles: readonly Role[]): string | null {
  if (roles.length === 0) return 'Phải chọn ít nhất một vai trò';
  const unique = new Set(roles);
  if (unique.size !== roles.length) return 'Vai trò bị lặp';
  const hasAdmin = unique.has('QUAN_TRI_HE_THONG');
  if (hasAdmin && unique.size > 1) return 'Quản trị hệ thống không được kiêm vai trò khác';
  const staff = roles.some((r) => STAFF_ROLES.includes(r));
  const partner = roles.some((r) => PARTNER_ROLES.includes(r));
  if (staff && partner) return 'Không được trộn vai trò nội bộ với vai trò đối tác';
  return null;
}

/** Nhân viên và nhà cung cấp bắt buộc đăng nhập 2 lớp vì thao tác chứng từ. */
export function requiresTwoFactor(roles: readonly Role[]): boolean {
  return roles.some((r) => STAFF_ROLES.includes(r) || r === 'NHA_CUNG_CAP');
}

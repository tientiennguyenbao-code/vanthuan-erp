import { permissionsFor, requiresTwoFactor, ROLE_PERMISSIONS, ROLES, validateRoleSet } from './roles';

describe('Bảng phân quyền', () => {
  it('mọi vai trò đều có trong bảng quyền', () => {
    for (const r of ROLES) expect(ROLE_PERMISSIONS[r]).toBeDefined();
  });

  it('Quản trị hệ thống chỉ quản lý tài khoản, không xem nội dung nghiệp vụ', () => {
    expect(permissionsFor(['QUAN_TRI_HE_THONG'])).toEqual(['TAI_KHOAN_QUAN_LY']);
  });

  it('chỉ Giám đốc và Phó Giám đốc được duyệt, ký hợp đồng và xem nhật ký', () => {
    for (const r of ROLES) {
      const perms = permissionsFor([r]);
      const isBgd = r === 'GIAM_DOC' || r === 'PHO_GIAM_DOC';
      expect(perms.includes('HOP_DONG_DUYET_KY')).toBe(isBgd);
      expect(perms.includes('NHAT_KY_XEM')).toBe(isBgd);
    }
  });

  it('nhân viên kinh doanh chỉ làm trên lô và hợp đồng của mình', () => {
    const p = permissionsFor(['NHAN_VIEN_KD']);
    expect(p).toContain('LO_HANG_QUAN_LY_CUA_MINH');
    expect(p).toContain('HOP_DONG_SOAN_CUA_MINH');
    expect(p).not.toContain('LO_HANG_XEM_TAT_CA');
    expect(p).not.toContain('HOP_DONG_XEM_TAT_CA');
  });

  it('chỉ kế toán trưởng duyệt đề nghị thu; kế toán viên lập đề nghị thu', () => {
    expect(permissionsFor(['KE_TOAN_TRUONG'])).toContain('PHI_DUYET_DE_NGHI_THU');
    expect(permissionsFor(['KE_TOAN_VIEN'])).not.toContain('PHI_DUYET_DE_NGHI_THU');
    expect(permissionsFor(['KE_TOAN_VIEN'])).toContain('PHI_LAP_DE_NGHI_THU');
  });

  it('đối tác không có quyền nội bộ nào', () => {
    expect(permissionsFor(['NHA_CUNG_CAP', 'NGUOI_MUA'])).toEqual([]);
  });

  it('gộp quyền khi một người giữ nhiều vai trò', () => {
    const p = permissionsFor(['KE_TOAN_VIEN', 'NHAN_VIEN_KD']);
    expect(p).toContain('PHI_LAP_DE_NGHI_THU');
    expect(p).toContain('DOI_TAC_MOI_CONG');
  });

  it('kiểm tra tổ hợp vai trò hợp lệ', () => {
    expect(validateRoleSet([])).not.toBeNull();
    expect(validateRoleSet(['QUAN_TRI_HE_THONG', 'GIAM_DOC'])).toMatch(/không được kiêm/);
    expect(validateRoleSet(['NHAN_VIEN_KD', 'NHA_CUNG_CAP'])).toMatch(/trộn/);
    expect(validateRoleSet(['GIAM_DOC', 'GIAM_DOC'])).toMatch(/lặp/);
    expect(validateRoleSet(['TRUONG_PHONG_KD', 'NHAN_VIEN_KD'])).toBeNull();
  });

  it('bắt buộc 2 lớp với nhân viên và nhà cung cấp, không bắt buộc với người mua', () => {
    expect(requiresTwoFactor(['NHAN_VIEN_KD'])).toBe(true);
    expect(requiresTwoFactor(['NHA_CUNG_CAP'])).toBe(true);
    expect(requiresTwoFactor(['NGUOI_MUA'])).toBe(false);
  });
});

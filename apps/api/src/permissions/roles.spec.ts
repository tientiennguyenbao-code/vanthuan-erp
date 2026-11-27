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

  it('thanh toán và quyết toán: kế toán ghi nhận và lập; Kế toán trưởng duyệt; chỉ Giám đốc duyệt thêm và cho trả vượt', () => {
    for (const r of ROLES) {
      const p = permissionsFor([r]);
      expect(p.includes('THANH_TOAN_GHI_NHAN')).toBe(r === 'KE_TOAN_VIEN' || r === 'KE_TOAN_TRUONG');
      expect(p.includes('QUYET_TOAN_DUYET')).toBe(r === 'KE_TOAN_TRUONG');
      expect(p.includes('QUYET_TOAN_DUYET_GD')).toBe(r === 'GIAM_DOC');
      expect(p.includes('THANH_TOAN_DUYET_VUOT')).toBe(r === 'GIAM_DOC');
    }
    expect(permissionsFor(['NHAN_VIEN_KD'])).toContain('KHIEU_NAI_MO');
    expect(permissionsFor(['NHAN_VIEN_KD'])).not.toContain('KHIEU_NAI_GIAI_QUYET');
  });

  it('nguồn cung: thu mua và Trưởng phòng KD lập hồ sơ; chỉ Giám đốc và thu mua xem đủ số CCCD', () => {
    for (const r of ROLES) {
      const p = permissionsFor([r]);
      expect(p.includes('NGUON_CUNG_QUAN_LY')).toBe(r === 'NHAN_VIEN_THU_MUA' || r === 'TRUONG_PHONG_KD');
      expect(p.includes('NGUON_CUNG_XEM_CCCD')).toBe(r === 'NHAN_VIEN_THU_MUA' || r === 'GIAM_DOC');
      expect(p.includes('NANG_SUAT_DAT')).toBe(r === 'GIAM_DOC' || r === 'PHO_GIAM_DOC');
      expect(p.includes('NGUON_CUNG_DUYET_RUNG')).toBe(r === 'GIAM_DOC' || r === 'PHO_GIAM_DOC' || r === 'TRUONG_PHONG_KD');
      expect(p.includes('NGUON_CUNG_DUYET_MA')).toBe(r === 'GIAM_DOC' || r === 'PHO_GIAM_DOC' || r === 'TRUONG_PHONG_KD');
    }
    expect(permissionsFor(['NHAN_VIEN_THU_MUA'])).not.toContain('HOP_DONG_SOAN_CUA_MINH');
    expect(requiresTwoFactor(['NHAN_VIEN_THU_MUA'])).toBe(true);
  });

  it('kho: chỉ thủ kho ghi phiếu kho; Trưởng phòng KD và Ban Giám đốc khai khu; chỉ Ban Giám đốc đặt định mức và duyệt hao hụt vượt', () => {
    for (const r of ROLES) {
      const p = permissionsFor([r]);
      expect(p.includes('KHO_GHI_PHIEU')).toBe(r === 'THU_KHO');
      expect(p.includes('KHO_CAU_HINH')).toBe(r === 'TRUONG_PHONG_KD' || r === 'GIAM_DOC' || r === 'PHO_GIAM_DOC');
      expect(p.includes('SO_CHE_DUYET')).toBe(r === 'GIAM_DOC' || r === 'PHO_GIAM_DOC');
      expect(p.includes('SO_CHE_DINH_MUC')).toBe(r === 'GIAM_DOC' || r === 'PHO_GIAM_DOC');
      expect(p.includes('KIEM_KE_DUYET')).toBe(r === 'KE_TOAN_TRUONG');
    }
    expect(permissionsFor(['THU_KHO'])).toEqual(['KHO_XEM', 'KHO_GHI_PHIEU']);
    expect(requiresTwoFactor(['THU_KHO'])).toBe(true);
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

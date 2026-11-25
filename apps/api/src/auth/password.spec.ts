import { checkPasswordPolicy, generateTemporaryPassword, hashPassword, verifyPassword } from './password';

describe('Mật khẩu', () => {
  it('chỉ lưu dạng băm và kiểm tra đúng', async () => {
    const h = await hashPassword('VanThuan2026');
    expect(h).not.toContain('VanThuan2026');
    expect(await verifyPassword(h, 'VanThuan2026')).toBe(true);
    expect(await verifyPassword(h, 'vanthuan2026')).toBe(false);
  });

  it('áp quy định độ mạnh mật khẩu', () => {
    expect(checkPasswordPolicy('ngan1', 'a@b.vn')).toMatch(/10 ký tự/);
    expect(checkPasswordPolicy('chichucaithoi', 'a@b.vn')).toMatch(/chữ và số/);
    expect(checkPasswordPolicy('tien.nguyen2026', 'tien.nguyen@vanthuan.vn')).toMatch(/tên đăng nhập/);
    expect(checkPasswordPolicy('CaPheGiaVi2026', 'gd@vanthuan.vn')).toBeNull();
  });

  it('mật khẩu tạm đủ mạnh', () => {
    const p = generateTemporaryPassword();
    expect(checkPasswordPolicy(p, 'x@y.vn')).toBeNull();
  });
});

import { checkParties, contractValue, contractValueUsd, normalizeVerificationCode, readinessProblems, signingRefusal, verificationCode } from './contract.rules';

const day = 24 * 3600 * 1000;
const auth = (over: Partial<{ validFrom: Date; validTo: Date; maxValueUsd: number | null; revokedAt: Date | null }> = {}) => ({
  validFrom: new Date(Date.now() - day),
  validTo: new Date(Date.now() + day),
  maxValueUsd: 500_000,
  revokedAt: null,
  ...over,
});

describe('Quy tắc hợp đồng', () => {
  it('kiểm tra các bên theo loại hợp đồng', () => {
    expect(checkParties('mua', 'ncc', null)).toBeNull();
    expect(checkParties('mua', null, null)).toMatch(/bên bán/);
    expect(checkParties('mua', 'ncc', 'mua')).toMatch(/Vạn Thuận là bên mua/);
    expect(checkParties('ban', null, 'nm')).toBeNull();
    expect(checkParties('ban', 'x', 'nm')).toMatch(/Vạn Thuận là bên bán/);
    expect(checkParties('mua_ban_truc_tiep', 'ncc', null)).toMatch(/bên mua/);
    expect(checkParties('mua_ban_truc_tiep', 'a', 'a')).toMatch(/khác nhau/);
    expect(checkParties('moi_gioi', 'ncc', null)).toBeNull();
  });

  it('tính giá trị và quy ra USD', () => {
    expect(contractValue({ soLuong: 19200, donGia: 4.85 })).toBe(93120);
    expect(contractValueUsd({ soLuong: 1000, donGia: 120000, tienTe: 'VND', tyGiaUsd: 25000 })).toBe(4800);
    expect(contractValueUsd({ soLuong: 1000, donGia: 120000, tienTe: 'VND', tyGiaUsd: null })).toBeNull();
  });

  it('liệt kê điều còn thiếu trước khi trình ký', () => {
    const base = { soLuong: 1, donVi: 'kg' as const, dungSaiPhanTram: 5, donGia: 1, tienTe: 'VND' as const, incoterms: 'FOB' as const, lichGiao: '', dieuKhoanThanhToan: 'TT' };
    const p = readinessProblems(base);
    expect(p.join(';')).toMatch(/tỷ giá/);
    expect(p.join(';')).toMatch(/lịch giao/);
  });

  describe('ai được ký', () => {
    it('Giám đốc ký mọi hợp đồng', () => {
      expect(signingRefusal(['GIAM_DOC'], 10_000_000, [])).toBeNull();
    });
    it('Phó Giám đốc cần ủy quyền còn hiệu lực và trong hạn mức', () => {
      expect(signingRefusal(['PHO_GIAM_DOC'], 100, [])).toMatch(/chưa có văn bản ủy quyền/);
      expect(signingRefusal(['PHO_GIAM_DOC'], 100_000, [auth()])).toBeNull();
      expect(signingRefusal(['PHO_GIAM_DOC'], 600_000, [auth()])).toMatch(/vượt hạn mức/);
      expect(signingRefusal(['PHO_GIAM_DOC'], 600_000, [auth({ maxValueUsd: null })])).toBeNull();
      expect(signingRefusal(['PHO_GIAM_DOC'], 100, [auth({ revokedAt: new Date() })])).toMatch(/chưa có/);
      expect(signingRefusal(['PHO_GIAM_DOC'], 100, [auth({ validTo: new Date(Date.now() - 1) })])).toMatch(/chưa có/);
      expect(signingRefusal(['PHO_GIAM_DOC'], null, [auth()])).toMatch(/vượt hạn mức/);
    });
    it('vai trò khác không ký được', () => {
      expect(signingRefusal(['KE_TOAN_TRUONG'], 1, [auth()])).toMatch(/Chỉ Giám đốc/);
    });
  });

  it('mã xác minh đọc được và đổi ngược được', () => {
    const h = 'a'.repeat(64);
    const code = verificationCode(h);
    expect(code).toMatch(/^AAAA-AAAA/);
    expect(normalizeVerificationCode(code)).toBe(h);
  });
});

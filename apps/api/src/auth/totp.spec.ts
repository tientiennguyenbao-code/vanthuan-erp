import { base32Decode, base32Encode, generateTotpSecret, hotp, otpauthUrl, totpAt, verifyTotp } from './totp';

describe('Mã xác thực 2 lớp (TOTP)', () => {
  const rfcSecret = Buffer.from('12345678901234567890', 'ascii');

  it('khớp bộ số mẫu của chuẩn RFC 6238', () => {
    expect(hotp(rfcSecret, Math.floor(59 / 30), 8)).toBe('94287082');
    expect(hotp(rfcSecret, Math.floor(1111111109 / 30), 8)).toBe('07081804');
    expect(hotp(rfcSecret, Math.floor(1234567890 / 30), 8)).toBe('89005924');
    expect(hotp(rfcSecret, Math.floor(2000000000 / 30), 8)).toBe('69279037');
  });

  it('mã hoá và giải mã base32 hai chiều', () => {
    expect(base32Encode(rfcSecret)).toBe('GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ');
    expect(base32Decode('GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ').equals(rfcSecret)).toBe(true);
  });

  it('chấp nhận mã hiện tại và mã lệch 30 giây, từ chối mã lệch xa', () => {
    const secret = generateTotpSecret();
    const now = Date.now();
    expect(verifyTotp(secret, totpAt(secret, now), now)).not.toBeNull();
    expect(verifyTotp(secret, totpAt(secret, now - 30_000), now)).not.toBeNull();
    expect(verifyTotp(secret, totpAt(secret, now - 120_000), now)).toBeNull();
  });

  it('từ chối mã không đúng định dạng', () => {
    const secret = generateTotpSecret();
    expect(verifyTotp(secret, '12345')).toBeNull();
    expect(verifyTotp(secret, 'abcdef')).toBeNull();
  });

  it('tạo đường dẫn để quét mã QR trên điện thoại', () => {
    const url = otpauthUrl('ABCDEF', 'gd@vanthuan.vn', 'Van Thuan Global');
    expect(url.startsWith('otpauth://totp/Van%20Thuan%20Global%3Agd%40vanthuan.vn?')).toBe(true);
    expect(url).toContain('secret=ABCDEF');
  });
});

import { randomBytes } from 'node:crypto';
import { decrypt, encrypt, sha256Hex } from './crypto';
import { stableStringify } from './stable-json';

describe('Mã hoá', () => {
  const key = randomBytes(32);

  it('giải mã được đúng nội dung đã mã hoá', () => {
    expect(decrypt(encrypt('bí mật Vạn Thuận', key), key)).toBe('bí mật Vạn Thuận');
  });

  it('hai lần mã hoá cùng nội dung cho kết quả khác nhau', () => {
    expect(encrypt('abc', key)).not.toBe(encrypt('abc', key));
  });

  it('phát hiện dữ liệu mã hoá bị sửa hoặc sai khoá', () => {
    const enc = encrypt('abc', key);
    const parts = enc.split('.');
    parts[3] = Buffer.from('xyz').toString('base64url');
    expect(() => decrypt(parts.join('.'), key)).toThrow();
    expect(() => decrypt(enc, randomBytes(32))).toThrow();
  });

  it('mã băm SHA-256 đúng chuẩn', () => {
    expect(sha256Hex('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });

  it('JSON ổn định không phụ thuộc thứ tự khoá', () => {
    expect(stableStringify({ b: 1, a: { d: [1, 2], c: null } })).toBe(stableStringify({ a: { c: null, d: [1, 2] }, b: 1 }));
  });
});

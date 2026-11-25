import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

/**
 * Mã xác thực 2 lớp theo chuẩn TOTP (RFC 6238): mã 6 số đổi mỗi 30 giây,
 * dùng được với Google Authenticator, Microsoft Authenticator...
 */
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function base32Encode(buf: Buffer): string {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(input: string): Buffer {
  const clean = input.replace(/=+$/, '').replace(/\s+/g, '').toUpperCase();
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of clean) {
    const idx = ALPHABET.indexOf(ch);
    if (idx === -1) throw new Error('Mã bí mật không hợp lệ');
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

export function generateTotpSecret(): string {
  return base32Encode(randomBytes(20));
}

export function hotp(secret: Buffer, counter: number, digits = 6, algorithm = 'sha1'): string {
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(counter));
  const h = createHmac(algorithm, secret).update(msg).digest();
  const offset = h[h.length - 1] & 0x0f;
  const bin =
    ((h[offset] & 0x7f) << 24) | ((h[offset + 1] & 0xff) << 16) | ((h[offset + 2] & 0xff) << 8) | (h[offset + 3] & 0xff);
  return (bin % 10 ** digits).toString().padStart(digits, '0');
}

export function totpAt(secretBase32: string, timeMs: number, step = 30, digits = 6): string {
  return hotp(base32Decode(secretBase32), Math.floor(timeMs / 1000 / step), digits);
}

/**
 * Kiểm tra mã, chấp nhận lệch ±1 bước (30 giây) do đồng hồ điện thoại.
 * Trả về số bước thời gian khớp (để chống dùng lại cùng một mã), hoặc null nếu sai.
 */
export function verifyTotp(secretBase32: string, code: string, timeMs = Date.now(), window = 1): number | null {
  if (!/^\d{6}$/.test(code)) return null;
  const secret = base32Decode(secretBase32);
  const current = Math.floor(timeMs / 1000 / 30);
  for (let i = -window; i <= window; i++) {
    const expected = hotp(secret, current + i);
    if (timingSafeEqual(Buffer.from(expected), Buffer.from(code))) return current + i;
  }
  return null;
}

export function otpauthUrl(secretBase32: string, account: string, issuer: string): string {
  const label = encodeURIComponent(`${issuer}:${account}`);
  const params = new URLSearchParams({ secret: secretBase32, issuer, algorithm: 'SHA1', digits: '6', period: '30' });
  return `otpauth://totp/${label}?${params.toString()}`;
}

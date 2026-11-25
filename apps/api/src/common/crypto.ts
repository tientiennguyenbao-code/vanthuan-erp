import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

/** Mã hoá AES-256-GCM. Kết quả dạng "v1.<iv>.<tag>.<dữ liệu>" (base64url). */
export function encrypt(plain: string, key: Buffer): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const data = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return ['v1', iv.toString('base64url'), tag.toString('base64url'), data.toString('base64url')].join('.');
}

export function decrypt(payload: string, key: Buffer): string {
  const [version, iv, tag, data] = payload.split('.');
  if (version !== 'v1' || !iv || !tag || data === undefined) {
    throw new Error('Dữ liệu mã hoá không đúng định dạng');
  }
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64url'));
  decipher.setAuthTag(Buffer.from(tag, 'base64url'));
  return Buffer.concat([decipher.update(Buffer.from(data, 'base64url')), decipher.final()]).toString('utf8');
}

export function sha256Hex(input: string): string {
  return createHash('sha256').update(input, 'utf8').digest('hex');
}

/** Chuỗi ngẫu nhiên an toàn, dùng làm mã phiên đăng nhập. */
export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url');
}

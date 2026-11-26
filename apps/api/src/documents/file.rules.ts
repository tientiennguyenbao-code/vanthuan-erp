import { createCipheriv, createDecipheriv, createHash, createHmac, hkdfSync, randomBytes, timingSafeEqual } from 'node:crypto';

/** Theo thiết kế kỹ thuật: PDF hoặc ảnh, tối đa 25 MB mỗi tệp; đường dẫn tải hết hạn sau 10 phút. */
export const MAX_FILE_BYTES = 25 * 1024 * 1024;
export const LINK_TTL_MS = 10 * 60 * 1000;

const MAGIC: { mime: string; ext: string; bytes: number[] }[] = [
  { mime: 'application/pdf', ext: 'pdf', bytes: [0x25, 0x50, 0x44, 0x46, 0x2d] },
  { mime: 'image/jpeg', ext: 'jpg', bytes: [0xff, 0xd8, 0xff] },
  { mime: 'image/png', ext: 'png', bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] },
];

/** Nhận diện loại tệp theo nội dung (không tin phần đuôi tên tệp do người dùng gửi). */
export function detectType(buf: Buffer): { mime: string; ext: string } | null {
  const m = MAGIC.find((x) => buf.length >= x.bytes.length && x.bytes.every((b, i) => buf[i] === b));
  return m ? { mime: m.mime, ext: m.ext } : null;
}

/** Tên tệp an toàn để lưu và hiển thị: bỏ đường dẫn, ký tự điều khiển; giữ dấu tiếng Việt. */
export function safeFileName(name: string, ext: string): string {
  const base = (name.split(/[\\/]/).pop() ?? '')
    .normalize('NFC')
    .replace(/[\u0000-\u001f\u007f"<>|:*?]/g, '')
    .replace(/\.[^.]*$/, '')
    .trim()
    .slice(0, 120);
  return `${base || 'tep'}.${ext}`;
}

export const sha256Bytes = (buf: Buffer) => createHash('sha256').update(buf).digest('hex');

/** Mã hoá AES-256-GCM cho dữ liệu nhị phân: iv(12) | tag(16) | dữ liệu. */
export function encryptBytes(plain: Buffer, key: Buffer): Buffer {
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', key, iv);
  const data = Buffer.concat([c.update(plain), c.final()]);
  return Buffer.concat([iv, c.getAuthTag(), data]);
}

export function decryptBytes(payload: Buffer, key: Buffer): Buffer {
  const d = createDecipheriv('aes-256-gcm', key, payload.subarray(0, 12));
  d.setAuthTag(payload.subarray(12, 28));
  return Buffer.concat([d.update(payload.subarray(28)), d.final()]);
}

const linkKey = (master: Buffer) => Buffer.from(hkdfSync('sha256', master, Buffer.alloc(0), 'vanthuan:lien-ket-tai-tep', 32));

/** Đường dẫn tải tạm: gắn với tệp, người tải và thời hạn; ký bằng khoá suy ra từ APP_KEY. */
export function signLink(fileId: string, userId: string, expiresAt: number, master: Buffer): string {
  const body = `${fileId}.${userId}.${expiresAt}`;
  const sig = createHmac('sha256', linkKey(master)).update(body).digest('base64url');
  return `${Buffer.from(body).toString('base64url')}.${sig}`;
}

export function verifyLink(token: string, master: Buffer, now = Date.now()): { fileId: string; userId: string } | 'het_han' | 'sai' {
  const [b, sig] = token.split('.');
  if (!b || !sig) return 'sai';
  const body = Buffer.from(b, 'base64url').toString();
  const want = createHmac('sha256', linkKey(master)).update(body).digest();
  const got = Buffer.from(sig, 'base64url');
  if (got.length !== want.length || !timingSafeEqual(got, want)) return 'sai';
  const [fileId, userId, exp] = body.split('.');
  if (!fileId || !userId || !exp) return 'sai';
  if (Number(exp) < now) return 'het_han';
  return { fileId, userId };
}

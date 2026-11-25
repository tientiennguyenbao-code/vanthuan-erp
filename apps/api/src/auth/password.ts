import { hash, verify } from '@node-rs/argon2';
import { randomBytes } from 'node:crypto';

/** Mật khẩu chỉ lưu dạng băm Argon2id, không ai (kể cả quản trị) đọc lại được. */
export function hashPassword(plain: string): Promise<string> {
  return hash(plain);
}

export async function verifyPassword(hashed: string, plain: string): Promise<boolean> {
  try {
    return await verify(hashed, plain);
  } catch {
    return false;
  }
}

/** Trả về lý do không đạt, hoặc null nếu mật khẩu đạt yêu cầu. */
export function checkPasswordPolicy(plain: string, email: string): string | null {
  if (plain.length < 10) return 'Mật khẩu phải có ít nhất 10 ký tự';
  if (plain.length > 128) return 'Mật khẩu quá dài (tối đa 128 ký tự)';
  if (!/[A-Za-z]/.test(plain) || !/\d/.test(plain)) return 'Mật khẩu phải có cả chữ và số';
  if (plain.toLowerCase().includes(email.split('@')[0].toLowerCase())) return 'Mật khẩu không được chứa tên đăng nhập';
  return null;
}

/** Mật khẩu tạm cấp cho tài khoản mới; người dùng bắt buộc đổi ở lần đăng nhập đầu. */
export function generateTemporaryPassword(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  const bytes = randomBytes(14);
  let out = '';
  for (const b of bytes) out += alphabet[b % alphabet.length];
  return out.slice(0, 7) + '-' + out.slice(7) + '7';
}

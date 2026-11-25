import type { Request } from 'express';
import type { Session, User } from '../db/schema';
import type { Permission, Role } from '../permissions/roles';

export const SESSION_STAGES = ['cho_ma_2_lop', 'can_cai_2_lop', 'phai_doi_mat_khau', 'day_du'] as const;
export type SessionStage = (typeof SESSION_STAGES)[number];

export interface AuthContext {
  user: User;
  session: Session;
  roles: Role[];
  permissions: Permission[];
}

export interface AuthedRequest extends Request {
  auth?: AuthContext;
}

export const SESSION_COOKIE = 'vt_phien';
/** Thời hạn các bước dở dang (nhập mã 2 lớp, cài 2 lớp, đổi mật khẩu). */
export const PENDING_TTL_MS = 10 * 60 * 1000;
/** Phiên đầy đủ: tối đa 12 giờ, tự thoát sau 60 phút không thao tác. */
export const FULL_TTL_MS = 12 * 60 * 60 * 1000;
export const IDLE_TIMEOUT_MS = 60 * 60 * 1000;
export const MAX_FAILED_ATTEMPTS = 5;

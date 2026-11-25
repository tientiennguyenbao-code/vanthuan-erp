import { sql } from 'drizzle-orm';
import {
  bigserial,
  boolean,
  index,
  inet,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  bigint,
} from 'drizzle-orm/pg-core';

/** Tài khoản người dùng (nhân viên nội bộ và đối tác trên cổng). */
export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    email: text('email').notNull(),
    fullName: text('full_name').notNull(),
    passwordHash: text('password_hash').notNull(),
    /** 'hoat_dong' | 'bi_khoa' | 'vo_hieu' */
    status: text('status').notNull().default('hoat_dong'),
    failedAttempts: integer('failed_attempts').notNull().default(0),
    lockedAt: timestamp('locked_at', { withTimezone: true }),
    /** Mã bí mật 2 lớp, đã mã hoá bằng APP_KEY. */
    totpSecretEnc: text('totp_secret_enc'),
    totpEnabled: boolean('totp_enabled').notNull().default(false),
    /** Bước thời gian của mã 2 lớp dùng gần nhất, để một mã không dùng được hai lần. */
    totpLastStep: bigint('totp_last_step', { mode: 'number' }),
    mustChangePassword: boolean('must_change_password').notNull().default(true),
    lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('users_email_lower_uq').on(sql`lower(${t.email})`)],
);

export const userRoles = pgTable(
  'user_roles',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    role: text('role').notNull(),
    grantedAt: timestamp('granted_at', { withTimezone: true }).notNull().defaultNow(),
    grantedBy: uuid('granted_by').references(() => users.id),
  },
  (t) => [primaryKey({ columns: [t.userId, t.role] })],
);

/**
 * Phiên đăng nhập. Trình duyệt chỉ giữ mã phiên; máy chủ lưu mã băm của nó.
 * stage: 'cho_ma_2_lop' | 'can_cai_2_lop' | 'phai_doi_mat_khau' | 'day_du'
 */
export const sessions = pgTable(
  'sessions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    tokenHash: text('token_hash').notNull(),
    stage: text('stage').notNull(),
    pendingTotpSecretEnc: text('pending_totp_secret_enc'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    ip: text('ip'),
    userAgent: text('user_agent'),
  },
  (t) => [uniqueIndex('sessions_token_hash_uq').on(t.tokenHash), index('sessions_user_idx').on(t.userId)],
);

/**
 * Nhật ký thao tác: chỉ ghi thêm. Cơ sở dữ liệu từ chối mọi lệnh sửa hoặc xoá
 * (xem tệp di trú tạo trigger). Mỗi dòng mang mã băm của dòng trước nên rút bỏ
 * hay sửa lén một dòng sẽ bị phát hiện khi kiểm tra chuỗi.
 */
export const auditLog = pgTable(
  'audit_log',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    at: timestamp('at', { withTimezone: true }).notNull().defaultNow(),
    actorUserId: uuid('actor_user_id'),
    action: text('action').notNull(),
    entityType: text('entity_type'),
    entityId: text('entity_id'),
    ip: inet('ip'),
    detail: jsonb('detail').notNull().default({}),
    prevHash: text('prev_hash').notNull(),
    hash: text('hash').notNull(),
  },
  (t) => [index('audit_log_entity_idx').on(t.entityType, t.entityId), index('audit_log_actor_idx').on(t.actorUserId)],
);

export type User = typeof users.$inferSelect;
export type Session = typeof sessions.$inferSelect;
export type AuditEntry = typeof auditLog.$inferSelect;

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

// ============ Danh mục ============

/** Mặt hàng: thêm ngành hay mặt hàng mới chỉ là thêm dòng, không sửa phần mềm. */
export const commodities = pgTable(
  'commodities',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    code: text('code').notNull(),
    name: text('name').notNull(),
    /** 'ca_phe' | 'gia_vi' | 'thuy_san' */
    sector: text('sector').notNull(),
    hsCode: text('hs_code'),
    /** Các chỉ tiêu quy cách (ví dụ độ ẩm, tạp chất, sàng). */
    specFields: jsonb('spec_fields').notNull().default([]),
    active: boolean('active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('commodities_code_uq').on(t.code)],
);

// ============ Đối tác ============

/** Một bảng chung cho mọi đối tác; một đơn vị có thể mang nhiều vai (vừa bán vừa mua). */
export const partners = pgTable(
  'partners',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    code: text('code').notNull(),
    name: text('name').notNull(),
    country: text('country').notNull(),
    taxCode: text('tax_code'),
    address: text('address'),
    /** Phân nhóm: htx, nong_trai, nha_may, doanh_nghiep_thuong_mai, nha_nhap_khau, nha_phan_phoi, nha_che_bien, ngan_hang, hang_tau, giam_dinh, kho, khac */
    category: text('category').notNull(),
    /** Nhân viên kinh doanh phụ trách */
    ownerUserId: uuid('owner_user_id').references(() => users.id),
    /** Trạng thái thẩm định: nhap | cho_tham_dinh | dat | tu_choi */
    kycStatus: text('kyc_status').notNull().default('nhap'),
    /** Xếp hạng rủi ro: thap | trung_binh | cao */
    riskRating: text('risk_rating'),
    screeningNote: text('screening_note'),
    screenedAt: timestamp('screened_at', { withTimezone: true }),
    kycSubmittedBy: uuid('kyc_submitted_by').references(() => users.id),
    kycApprovedBy: uuid('kyc_approved_by').references(() => users.id),
    kycApprovedAt: timestamp('kyc_approved_at', { withTimezone: true }),
    kycExpiresAt: timestamp('kyc_expires_at', { withTimezone: true }),
    kycRejectReason: text('kyc_reject_reason'),
    createdBy: uuid('created_by').references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('partners_code_uq').on(t.code), index('partners_owner_idx').on(t.ownerUserId)],
);

/** Vai của đối tác: nha_cung_cap | nguoi_mua | ngan_hang | hang_tau | giam_dinh | kho */
export const partnerRoles = pgTable(
  'partner_roles',
  {
    partnerId: uuid('partner_id')
      .notNull()
      .references(() => partners.id),
    role: text('role').notNull(),
  },
  (t) => [primaryKey({ columns: [t.partnerId, t.role] })],
);

export const partnerContacts = pgTable('partner_contacts', {
  id: uuid('id').primaryKey().defaultRandom(),
  partnerId: uuid('partner_id')
    .notNull()
    .references(() => partners.id),
  name: text('name').notNull(),
  position: text('position'),
  email: text('email'),
  phone: text('phone'),
  isPrimary: boolean('is_primary').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

/** Tài liệu pháp lý và chứng nhận có hạn dùng (đăng ký kinh doanh, HACCP, mã vùng trồng, mã FDA/GACC...). */
export const partnerDocuments = pgTable(
  'partner_documents',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    partnerId: uuid('partner_id')
      .notNull()
      .references(() => partners.id),
    docType: text('doc_type').notNull(),
    number: text('number'),
    issuer: text('issuer'),
    issuedOn: text('issued_on'),
    /** Ngày hết hạn (YYYY-MM-DD); để trống nếu không có hạn */
    expiresOn: text('expires_on'),
    note: text('note'),
    /** Huỷ thay vì xoá: giữ lý do và người huỷ */
    voidedAt: timestamp('voided_at', { withTimezone: true }),
    voidedBy: uuid('voided_by').references(() => users.id),
    voidReason: text('void_reason'),
    createdBy: uuid('created_by').references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('partner_documents_partner_idx').on(t.partnerId)],
);

/** Kho, xưởng sơ chế: đi thuê, của nhà cung cấp, hoặc tự đầu tư vận hành. */
export const facilities = pgTable('facilities', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  /** kho | xuong_so_che */
  kind: text('kind').notNull(),
  /** thue | cua_nha_cung_cap | tu_van_hanh */
  ownership: text('ownership').notNull(),
  /** Đối tác sở hữu (khi thuê hoặc của nhà cung cấp) */
  partnerId: uuid('partner_id').references(() => partners.id),
  address: text('address'),
  capacityKg: bigint('capacity_kg', { mode: 'number' }),
  certifications: text('certifications'),
  active: boolean('active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export type Partner = typeof partners.$inferSelect;

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
  numeric,
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

// ============ Hợp đồng ============

/**
 * Văn bản ủy quyền ký hợp đồng Giám đốc cấp cho Phó Giám đốc: có thời hạn và hạn mức (USD).
 * Không xoá; thu hồi thì ghi người, lúc và lý do.
 */
export const signAuthorizations = pgTable(
  'sign_authorizations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    granteeUserId: uuid('grantee_user_id')
      .notNull()
      .references(() => users.id),
    grantedBy: uuid('granted_by')
      .notNull()
      .references(() => users.id),
    /** Số văn bản ủy quyền */
    documentRef: text('document_ref').notNull(),
    validFrom: timestamp('valid_from', { withTimezone: true }).notNull(),
    validTo: timestamp('valid_to', { withTimezone: true }).notNull(),
    /** Hạn mức giá trị một hợp đồng (USD); để trống là không giới hạn */
    maxValueUsd: numeric('max_value_usd', { precision: 18, scale: 2, mode: 'number' }),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    revokedBy: uuid('revoked_by').references(() => users.id),
    revokeReason: text('revoke_reason'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('sign_authorizations_grantee_idx').on(t.granteeUserId)],
);

/**
 * Hợp đồng. Chỉ các cột cần để tìm kiếm, lọc nằm ở dạng thường; điều khoản (số lượng, giá, thanh toán...)
 * mã hoá theo từng phiên bản bằng khoá riêng của hợp đồng (dataKeyEnc), khoá này lại được khoá bằng APP_KEY.
 */
export const contracts = pgTable(
  'contracts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    code: text('code').notNull(),
    /** mua | ban | moi_gioi | mua_ban_truc_tiep */
    kind: text('kind').notNull(),
    /** mua_dut | moi_gioi */
    dealType: text('deal_type').notNull(),
    /** Bên bán; để trống nghĩa là Vạn Thuận */
    sellerPartnerId: uuid('seller_partner_id').references(() => partners.id),
    /** Bên mua; để trống nghĩa là Vạn Thuận (hoặc chưa có, với hợp đồng môi giới) */
    buyerPartnerId: uuid('buyer_partner_id').references(() => partners.id),
    commodityId: uuid('commodity_id')
      .notNull()
      .references(() => commodities.id),
    /** nhap | cho_ky | da_ky | da_huy */
    status: text('status').notNull().default('nhap'),
    currentVersion: integer('current_version').notNull().default(1),
    /** Phiên bản đã ký gần nhất (đang có hiệu lực) */
    signedVersion: integer('signed_version'),
    ownerUserId: uuid('owner_user_id')
      .notNull()
      .references(() => users.id),
    dataKeyEnc: text('data_key_enc').notNull(),
    cancelReason: text('cancel_reason'),
    createdBy: uuid('created_by')
      .notNull()
      .references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('contracts_code_uq').on(t.code),
    index('contracts_owner_idx').on(t.ownerUserId),
    index('contracts_seller_idx').on(t.sellerPartnerId),
    index('contracts_buyer_idx').on(t.buyerPartnerId),
  ],
);

/** Phiên bản 1 là hợp đồng gốc; từ phiên bản 2 là phụ lục. Nội dung đã khoá khi trình ký. */
export const contractVersions = pgTable(
  'contract_versions',
  {
    contractId: uuid('contract_id')
      .notNull()
      .references(() => contracts.id),
    version: integer('version').notNull(),
    contentEnc: text('content_enc').notNull(),
    contentHash: text('content_hash').notNull(),
    /** Lý do lập phụ lục */
    reason: text('reason'),
    submittedBy: uuid('submitted_by').references(() => users.id),
    submittedAt: timestamp('submitted_at', { withTimezone: true }),
    signedBy: uuid('signed_by').references(() => users.id),
    signedAt: timestamp('signed_at', { withTimezone: true }),
    createdBy: uuid('created_by')
      .notNull()
      .references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.contractId, t.version] }), index('contract_versions_hash_idx').on(t.contentHash)],
);

/**
 * Sổ cái hợp đồng: chỉ ghi thêm, nối chuỗi bằng mã băm. Mỗi dòng mang mã băm nội dung của đúng phiên bản
 * và (khi ký) chữ ký lên mã băm đó. Các dòng được gom định kỳ thành cây Merkle để neo ra ngoài.
 */
export const contractLedger = pgTable(
  'contract_ledger',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    at: timestamp('at', { withTimezone: true }).notNull(),
    contractId: uuid('contract_id')
      .notNull()
      .references(() => contracts.id),
    version: integer('version').notNull(),
    event: text('event').notNull(),
    actorUserId: uuid('actor_user_id')
      .notNull()
      .references(() => users.id),
    contentHash: text('content_hash').notNull(),
    /** Chữ ký: { provider, value } */
    signature: jsonb('signature'),
    note: text('note'),
    prevHash: text('prev_hash').notNull(),
    hash: text('hash').notNull(),
  },
  (t) => [index('contract_ledger_contract_idx').on(t.contractId), index('contract_ledger_content_idx').on(t.contentHash)],
);

/** Đợt neo: gom các dòng sổ cái từ fromId đến toId thành một mã gốc Merkle. Chỉ ghi thêm. */
export const anchorBatches = pgTable('anchor_batches', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  at: timestamp('at', { withTimezone: true }).notNull().defaultNow(),
  fromLedgerId: bigint('from_ledger_id', { mode: 'number' }).notNull(),
  toLedgerId: bigint('to_ledger_id', { mode: 'number' }).notNull(),
  leafCount: integer('leaf_count').notNull(),
  merkleRoot: text('merkle_root').notNull(),
  /** noi_bo | polygon | opentimestamps ... */
  provider: text('provider').notNull(),
  txRef: text('tx_ref'),
});

export type Contract = typeof contracts.$inferSelect;
export type LedgerEntry = typeof contractLedger.$inferSelect;

// ============ Báo giá ============

/**
 * Báo giá mua (từ nhà cung cấp) và báo giá bán (cho người mua).
 * Báo giá bán lập từ một báo giá mua được chọn, cộng các dòng chi phí theo Incoterms.
 */
export const quotes = pgTable(
  'quotes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    code: text('code').notNull(),
    /** mua | ban */
    kind: text('kind').notNull(),
    partnerId: uuid('partner_id')
      .notNull()
      .references(() => partners.id),
    commodityId: uuid('commodity_id')
      .notNull()
      .references(() => commodities.id),
    /** Báo giá mua làm nguồn (chỉ với báo giá bán) */
    sourceQuoteId: uuid('source_quote_id'),
    /** nhap | da_gui | chap_nhan | tu_choi | huy */
    status: text('status').notNull().default('nhap'),
    version: integer('version').notNull().default(1),
    quantity: numeric('quantity', { precision: 18, scale: 3, mode: 'number' }).notNull(),
    /** kg | tan */
    unit: text('unit').notNull(),
    unitPrice: numeric('unit_price', { precision: 18, scale: 4, mode: 'number' }).notNull(),
    currency: text('currency').notNull(),
    /** Số đơn vị tiền đổi được 1 USD (để so sánh và tính biên) */
    fxPerUsd: numeric('fx_per_usd', { precision: 18, scale: 4, mode: 'number' }),
    incoterms: text('incoterms').notNull(),
    portFrom: text('port_from'),
    portTo: text('port_to'),
    /** Ngày hết hiệu lực (YYYY-MM-DD) */
    validUntil: text('valid_until').notNull(),
    spec: text('spec'),
    certifications: text('certifications'),
    deliveryTime: text('delivery_time'),
    paymentTerms: text('payment_terms'),
    /** Tỷ lệ phí trọn gói (%) dự kiến (báo giá bán) */
    feeRatePct: numeric('fee_rate_pct', { precision: 6, scale: 3, mode: 'number' }),
    note: text('note'),
    rejectReason: text('reject_reason'),
    /** Các hợp đồng nháp sinh ra khi chấp nhận */
    contractIds: jsonb('contract_ids').notNull().default([]),
    ownerUserId: uuid('owner_user_id')
      .notNull()
      .references(() => users.id),
    createdBy: uuid('created_by')
      .notNull()
      .references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('quotes_code_uq').on(t.code), index('quotes_commodity_idx').on(t.commodityId, t.kind), index('quotes_owner_idx').on(t.ownerUserId)],
);

/** Dòng chi phí của báo giá bán: vận tải nội địa, thủ tục xuất khẩu, xếp hàng, cước biển, bảo hiểm... */
export const quoteCostLines = pgTable(
  'quote_cost_lines',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    quoteId: uuid('quote_id')
      .notNull()
      .references(() => quotes.id),
    kind: text('kind').notNull(),
    description: text('description'),
    amount: numeric('amount', { precision: 18, scale: 2, mode: 'number' }).notNull(),
    currency: text('currency').notNull(),
    fxPerUsd: numeric('fx_per_usd', { precision: 18, scale: 4, mode: 'number' }),
  },
  (t) => [index('quote_cost_lines_quote_idx').on(t.quoteId)],
);

export type Quote = typeof quotes.$inferSelect;
export type QuoteCostLine = typeof quoteCostLines.$inferSelect;

// ============ Cấu hình ============

/** Cấu hình nghiệp vụ dạng khoá – giá trị (ví dụ mức sàn phí trọn gói). Mọi thay đổi ghi nhật ký. */
export const settings = pgTable('settings', {
  key: text('key').primaryKey(),
  value: jsonb('value').notNull(),
  updatedBy: uuid('updated_by').references(() => users.id),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

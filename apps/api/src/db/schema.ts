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
  type AnyPgColumn,
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
    /** Phạm vi chứng nhận: để trống là cả nhà cung cấp, có giá trị là chỉ một vùng trồng / vùng nuôi */
    growingAreaId: uuid('growing_area_id').references((): AnyPgColumn => growingAreas.id),
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
    /** Tháng dự kiến giao hàng (YYYY-MM), để đưa vào kế hoạch thu mua; trống thì tính vào tháng hiện tại */
    deliveryMonth: text('delivery_month'),
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

// ============ Lô hàng ============

/**
 * Lô mua: hàng của một nhà cung cấp theo một hợp đồng mang phí đã ký (hợp đồng mua với mua đứt,
 * hợp đồng môi giới với môi giới). Thu gom, sơ chế, nhập kho ghi theo lô mua. Số lượng lưu theo kg.
 */
export const purchaseLots = pgTable(
  'purchase_lots',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    code: text('code').notNull(),
    /** mua_dut | moi_gioi */
    dealType: text('deal_type').notNull(),
    contractId: uuid('contract_id')
      .notNull()
      .references(() => contracts.id),
    supplierPartnerId: uuid('supplier_partner_id')
      .notNull()
      .references(() => partners.id),
    commodityId: uuid('commodity_id')
      .notNull()
      .references(() => commodities.id),
    /** thu_gom | da_so_che | da_nhap_kho | da_huy */
    status: text('status').notNull().default('thu_gom'),
    collectedKg: numeric('collected_kg', { precision: 14, scale: 2, mode: 'number' }).notNull().default(0),
    lossKg: numeric('loss_kg', { precision: 14, scale: 2, mode: 'number' }).notNull().default(0),
    growingAreaCode: text('growing_area_code'),
    packingFacilityCode: text('packing_facility_code'),
    harvestDate: text('harvest_date'),
    facilityId: uuid('facility_id').references(() => facilities.id),
    certifications: text('certifications'),
    /**
     * Cà phê: 'du' khi lô chỉ gom hàng đủ điều kiện EUDR (mọi phiếu thu gom đều đạt), 'khong_du' khi có hàng
     * không đủ. Định ở lần thu gom đầu tiên và không đổi, để hai loại hàng không lẫn trong một lô. Null: chưa thu gom
     * hoặc mặt hàng không thuộc EUDR.
     */
    eudrClass: text('eudr_class'),
    ownerUserId: uuid('owner_user_id')
      .notNull()
      .references(() => users.id),
    cancelReason: text('cancel_reason'),
    createdBy: uuid('created_by')
      .notNull()
      .references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('purchase_lots_code_uq').on(t.code), index('purchase_lots_contract_idx').on(t.contractId)],
);

/**
 * Lô xuất: đúng một hợp đồng đối ứng (hợp đồng bán với mua đứt, hợp đồng mua bán trực tiếp với môi giới)
 * và một booking. Từ đóng gói trở đi, trạng thái và chứng từ tính theo lô xuất.
 */
export const exportLots = pgTable(
  'export_lots',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    code: text('code').notNull(),
    dealType: text('deal_type').notNull(),
    counterContractId: uuid('counter_contract_id')
      .notNull()
      .references(() => contracts.id),
    buyerPartnerId: uuid('buyer_partner_id')
      .notNull()
      .references(() => partners.id),
    commodityId: uuid('commodity_id')
      .notNull()
      .references(() => commodities.id),
    /** US | EU | CN */
    market: text('market').notNull(),
    /** dong_goi | nhap_kho | giam_dinh | dat_cho | xep_tau | hoan_tat | da_huy */
    status: text('status').notNull().default('dong_goi'),
    etd: text('etd'),
    eta: text('eta'),
    blNumber: text('bl_number'),
    shippedOn: text('shipped_on'),
    ownerUserId: uuid('owner_user_id')
      .notNull()
      .references(() => users.id),
    cancelReason: text('cancel_reason'),
    createdBy: uuid('created_by')
      .notNull()
      .references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('export_lots_code_uq').on(t.code), uniqueIndex('export_lots_counter_contract_uq').on(t.counterContractId)],
);

/**
 * Phân bổ lô mua sang lô xuất (nhiều–nhiều). Cần Trưởng phòng KD duyệt; khi lô mua được chia cho từ hai
 * lô xuất trở lên thì mọi dòng của lô mua đó cần thêm xác nhận đồng ý của nhà cung cấp.
 */
export const lotAllocations = pgTable(
  'lot_allocations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    purchaseLotId: uuid('purchase_lot_id')
      .notNull()
      .references(() => purchaseLots.id),
    exportLotId: uuid('export_lot_id')
      .notNull()
      .references(() => exportLots.id),
    quantityKg: numeric('quantity_kg', { precision: 14, scale: 2, mode: 'number' }).notNull(),
    approvedBy: uuid('approved_by').references(() => users.id),
    approvedAt: timestamp('approved_at', { withTimezone: true }),
    cancelledAt: timestamp('cancelled_at', { withTimezone: true }),
    cancelReason: text('cancel_reason'),
    createdBy: uuid('created_by')
      .notNull()
      .references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('lot_allocations_purchase_idx').on(t.purchaseLotId), index('lot_allocations_export_idx').on(t.exportLotId)],
);

/** Xác nhận đồng ý chia lô của nhà cung cấp, cho cả lô mua tại một thời điểm; mã băm ghi lên sổ cái hợp đồng. */
export const splitConsents = pgTable(
  'split_consents',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    purchaseLotId: uuid('purchase_lot_id')
      .notNull()
      .references(() => purchaseLots.id),
    /** Các lô xuất nhà cung cấp đồng ý chia cho (đã sắp xếp) */
    exportLotIds: jsonb('export_lot_ids').notNull(),
    documentRef: text('document_ref').notNull(),
    contentHash: text('content_hash').notNull(),
    recordedBy: uuid('recorded_by')
      .notNull()
      .references(() => users.id),
    recordedAt: timestamp('recorded_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('split_consents_purchase_idx').on(t.purchaseLotId)],
);

/** Booking: một lô xuất một booking, nhiều container. */
export const bookings = pgTable('bookings', {
  exportLotId: uuid('export_lot_id')
    .primaryKey()
    .references(() => exportLots.id),
  carrier: text('carrier').notNull(),
  bookingNumber: text('booking_number').notNull(),
  vesselVoyage: text('vessel_voyage'),
  cutoffSi: timestamp('cutoff_si', { withTimezone: true }),
  cutoffVgm: timestamp('cutoff_vgm', { withTimezone: true }),
  cutoffCargo: timestamp('cutoff_cargo', { withTimezone: true }),
  /** [{ so: 'MSKU1234567', chi: 'ML-123456' }] */
  containers: jsonb('containers').notNull().default([]),
  updatedBy: uuid('updated_by')
    .notNull()
    .references(() => users.id),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Nhật ký lô (chỉ ghi thêm): sự kiện hiện trường (thu gom, sơ chế, nhập kho, giám định, đóng cont)
 * và mọi lần chuyển trạng thái, phân bổ, booking.
 */
export const lotEvents = pgTable(
  'lot_events',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    at: timestamp('at', { withTimezone: true }).notNull().defaultNow(),
    purchaseLotId: uuid('purchase_lot_id').references(() => purchaseLots.id),
    exportLotId: uuid('export_lot_id').references(() => exportLots.id),
    kind: text('kind').notNull(),
    quantityKg: numeric('quantity_kg', { precision: 14, scale: 2, mode: 'number' }),
    facilityId: uuid('facility_id').references(() => facilities.id),
    /** Kết quả giám định: dat | khong_dat */
    result: text('result'),
    note: text('note'),
    detail: jsonb('detail'),
    actorUserId: uuid('actor_user_id')
      .notNull()
      .references(() => users.id),
  },
  (t) => [index('lot_events_purchase_idx').on(t.purchaseLotId), index('lot_events_export_idx').on(t.exportLotId)],
);

export type PurchaseLot = typeof purchaseLots.$inferSelect;
export type ExportLot = typeof exportLots.$inferSelect;
export type LotAllocation = typeof lotAllocations.$inferSelect;

// ============ Chứng từ ============

/**
 * Quy tắc chứng từ: ngành × thị trường × Incoterms × loại giao dịch → một loại chứng từ.
 * Để trống ngành, thị trường, Incoterms hay loại giao dịch nghĩa là áp cho mọi giá trị.
 */
export const docRules = pgTable(
  'doc_rules',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    code: text('code').notNull(),
    name: text('name').notNull(),
    /** ca_phe | gia_vi | thuy_san | null */
    sector: text('sector'),
    /** US | EU | CN | null */
    market: text('market'),
    /** Danh sách Incoterms áp dụng; null là mọi điều kiện */
    incoterms: jsonb('incoterms'),
    /** mua_dut | moi_gioi | null */
    dealType: text('deal_type'),
    /** bb: bắt buộc theo quy định · nm: người mua hoặc L/C yêu cầu */
    requirement: text('requirement').notNull(),
    /** truoc_xep_tau | sau_xep_tau */
    stage: text('stage').notNull(),
    /**
     * lo: một bản cho cả lô · nguoi_xuat_khau: một bản cho lô mua đứt, một bản mỗi nhà cung cấp với môi giới ·
     * nha_cung_cap: một bản mỗi nhà cung cấp trong lô (đăng ký cơ sở, EUDR...)
     */
    scope: text('scope').notNull(),
    /** Ai lập: van_thuan | nha_cung_cap | nguoi_nhap | ben_xuat_khau */
    party: text('party').notNull(),
    issuer: text('issuer'),
    legalBasis: text('legal_basis'),
    /** Còn điểm chưa chắc chắn, cần xác minh */
    uncertain: boolean('uncertain').notNull().default(false),
    note: text('note'),
    reviewedAt: text('reviewed_at').notNull(),
    active: boolean('active').notNull().default(true),
    updatedBy: uuid('updated_by').references(() => users.id),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('doc_rules_market_idx').on(t.market, t.sector)],
);

/** Một dòng trong checklist chứng từ của lô xuất. */
export const lotDocuments = pgTable(
  'lot_documents',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    exportLotId: uuid('export_lot_id')
      .notNull()
      .references(() => exportLots.id),
    ruleId: uuid('rule_id').references(() => docRules.id),
    code: text('code').notNull(),
    name: text('name').notNull(),
    requirement: text('requirement').notNull(),
    stage: text('stage').notNull(),
    party: text('party').notNull(),
    issuer: text('issuer'),
    /** Nhà cung cấp mà dòng này thuộc về (khi tách theo nhà cung cấp) */
    supplierPartnerId: uuid('supplier_partner_id').references(() => partners.id),
    /** thieu | dang_xin | nhap | da_duyet | da_gui | khong_ap_dung */
    status: text('status').notNull().default('thieu'),
    number: text('number'),
    issuedOn: text('issued_on'),
    expiresOn: text('expires_on'),
    note: text('note'),
    /** Dòng không còn áp dụng sau khi đổi phân bổ (giữ lại để tra cứu) */
    obsolete: boolean('obsolete').notNull().default(false),
    updatedBy: uuid('updated_by').references(() => users.id),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    approvedBy: uuid('approved_by').references(() => users.id),
    approvedAt: timestamp('approved_at', { withTimezone: true }),
  },
  (t) => [
    index('lot_documents_lot_idx').on(t.exportLotId),
    uniqueIndex('lot_documents_uq').on(t.exportLotId, t.code, sql`coalesce(${t.supplierPartnerId}, '00000000-0000-0000-0000-000000000000'::uuid)`),
  ],
);

/**
 * Đề nghị thu phí trọn gói, sinh khi lô xuất sang "xếp tàu": mỗi lô mua trong lô một dòng,
 * phí = khối lượng phân bổ × đơn giá hợp đồng đối ứng × tỷ lệ phí của hợp đồng mang phí.
 */
/** Mỗi lần kế toán xuất tệp Excel sang MISA AMIS: ai, lúc nào, bao nhiêu dòng, mã băm tệp. */
export const misaExports = pgTable('misa_exports', {
  id: uuid('id').primaryKey().defaultRandom(),
  /** phi_tron_goi */
  kind: text('kind').notNull(),
  code: text('code').notNull().unique(),
  rowCount: integer('row_count').notNull(),
  fileSha256: text('file_sha256').notNull(),
  /** Tệp đã giao cho kế toán, lưu mã hoá để tải lại đúng bản cũ */
  storageKey: text('storage_key').notNull(),
  keyEnc: text('key_enc').notNull(),
  createdBy: uuid('created_by')
    .notNull()
    .references(() => users.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const feeRequests = pgTable(
  'fee_requests',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    exportLotId: uuid('export_lot_id')
      .notNull()
      .references(() => exportLots.id),
    purchaseLotId: uuid('purchase_lot_id')
      .notNull()
      .references(() => purchaseLots.id),
    supplierPartnerId: uuid('supplier_partner_id')
      .notNull()
      .references(() => partners.id),
    feeContractId: uuid('fee_contract_id')
      .notNull()
      .references(() => contracts.id),
    quantityKg: numeric('quantity_kg', { precision: 14, scale: 2, mode: 'number' }).notNull(),
    unitPricePerKg: numeric('unit_price_per_kg', { precision: 18, scale: 6, mode: 'number' }).notNull(),
    currency: text('currency').notNull(),
    baseValue: numeric('base_value', { precision: 18, scale: 2, mode: 'number' }).notNull(),
    ratePct: numeric('rate_pct', { precision: 6, scale: 3, mode: 'number' }),
    amount: numeric('amount', { precision: 18, scale: 2, mode: 'number' }),
    fxPerUsd: numeric('fx_per_usd', { precision: 18, scale: 4, mode: 'number' }),
    blNumber: text('bl_number').notNull(),
    blDate: text('bl_date').notNull(),
    /** cho_duyet | da_duyet | thieu_ty_le */
    status: text('status').notNull(),
    approvedBy: uuid('approved_by').references(() => users.id),
    approvedAt: timestamp('approved_at', { withTimezone: true }),
    /** Đợt xuất sang MISA AMIS (đã chuyển kế toán); để trống nghĩa là chưa xuất */
    misaExportId: uuid('misa_export_id').references(() => misaExports.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('fee_requests_lot_idx').on(t.exportLotId), uniqueIndex('fee_requests_uq').on(t.exportLotId, t.purchaseLotId)],
);

/** Giám đốc mở cổng chặn xếp tàu khi thiếu chứng từ; dùng một lần cho lần xếp tàu kế tiếp. */
export const gateOverrides = pgTable('gate_overrides', {
  id: uuid('id').primaryKey().defaultRandom(),
  exportLotId: uuid('export_lot_id')
    .notNull()
    .references(() => exportLots.id),
  reason: text('reason').notNull(),
  /** Các chứng từ còn thiếu lúc mở chặn */
  missing: jsonb('missing').notNull(),
  grantedBy: uuid('granted_by')
    .notNull()
    .references(() => users.id),
  grantedAt: timestamp('granted_at', { withTimezone: true }).notNull().defaultNow(),
  usedAt: timestamp('used_at', { withTimezone: true }),
});

/**
 * Tệp đính kèm của một dòng chứng từ. Mỗi lần nộp là một phiên bản mới, bản cũ giữ nguyên
 * (bảng chỉ ghi thêm). Nội dung tệp mã hoá bằng khoá riêng của tệp, khoá này khoá bằng APP_KEY.
 */
export const documentFiles = pgTable(
  'document_files',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    lotDocumentId: uuid('lot_document_id')
      .notNull()
      .references(() => lotDocuments.id),
    version: integer('version').notNull(),
    fileName: text('file_name').notNull(),
    mimeType: text('mime_type').notNull(),
    sizeBytes: integer('size_bytes').notNull(),
    /** Mã băm SHA-256 của nội dung gốc, dùng để kiểm chứng tệp không bị sửa */
    sha256: text('sha256').notNull(),
    storageKey: text('storage_key').notNull(),
    keyEnc: text('key_enc').notNull(),
    /** chua_quet | sach | nhiem (quét virus chạy trên máy chủ thật) */
    scanStatus: text('scan_status').notNull().default('chua_quet'),
    uploadedBy: uuid('uploaded_by')
      .notNull()
      .references(() => users.id),
    uploadedAt: timestamp('uploaded_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('document_files_version_uq').on(t.lotDocumentId, t.version)],
);

/** Tài khoản cổng đối tác gắn với đối tác nào (mỗi tài khoản đối tác thuộc đúng một đối tác). */
export const partnerUsers = pgTable('partner_users', {
  userId: uuid('user_id')
    .primaryKey()
    .references(() => users.id),
  partnerId: uuid('partner_id')
    .notNull()
    .references(() => partners.id),
  invitedBy: uuid('invited_by')
    .notNull()
    .references(() => users.id),
  invitedAt: timestamp('invited_at', { withTimezone: true }).notNull().defaultNow(),
});

export type DocRule = typeof docRules.$inferSelect;
export type LotDocument = typeof lotDocuments.$inferSelect;

// ============ Thanh toán, tài trợ, khiếu nại, quyết toán ============

/**
 * Khoản tài trợ ngân hàng gắn với một lô xuất (tài trợ trước xuất khẩu, L/C, hàng lưu kho, chiết khấu).
 * Phí thu xếp vốn = tỷ lệ × số tiền tài trợ, bên vay trả, thu khi ngân hàng giải ngân.
 */
export const financings = pgTable(
  'financings',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    exportLotId: uuid('export_lot_id')
      .notNull()
      .references(() => exportLots.id),
    bankPartnerId: uuid('bank_partner_id')
      .notNull()
      .references(() => partners.id),
    borrowerPartnerId: uuid('borrower_partner_id')
      .notNull()
      .references(() => partners.id),
    /** truoc_xuat_khau | lc | luu_kho | chiet_khau */
    kind: text('kind').notNull(),
    amount: numeric('amount', { precision: 18, scale: 2, mode: 'number' }).notNull(),
    currency: text('currency').notNull(),
    fxPerUsd: numeric('fx_per_usd', { precision: 18, scale: 4, mode: 'number' }),
    feeRatePct: numeric('fee_rate_pct', { precision: 6, scale: 3, mode: 'number' }).notNull(),
    /** du_kien | da_giai_ngan | da_tat_toan | da_huy */
    status: text('status').notNull().default('du_kien'),
    disbursedOn: text('disbursed_on'),
    dueOn: text('due_on').notNull(),
    repaidOn: text('repaid_on'),
    collateral: text('collateral'),
    note: text('note'),
    cancelReason: text('cancel_reason'),
    createdBy: uuid('created_by')
      .notNull()
      .references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('financings_lot_idx').on(t.exportLotId)],
);

/**
 * Lịch thu chi theo lô: mỗi dòng là một khoản dự kiến, đến hạn theo sự kiện của lô (mốc), và được ghi
 * "đã thực hiện" khi tiền thực về hoặc thực chi (kèm tỷ giá lúc đó). Với lô môi giới, tiền hàng người mua
 * trả thẳng cho nhà cung cấp: dòng đó chỉ để theo dõi và do nhà cung cấp xác nhận đã nhận trên cổng.
 */
export const lotPayments = pgTable(
  'lot_payments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    exportLotId: uuid('export_lot_id')
      .notNull()
      .references(() => exportLots.id),
    purchaseLotId: uuid('purchase_lot_id').references(() => purchaseLots.id),
    financingId: uuid('financing_id').references(() => financings.id),
    /** thu | chi | theo_doi */
    direction: text('direction').notNull(),
    /** tien_hang_nguoi_mua | tien_hang_ncc | tien_hang_truc_tiep | phi_tron_goi | phi_thu_xep_von | tra_ngan_hang | chi_phi */
    kind: text('kind').notNull(),
    /** Hạng mục chi phí (giống dòng chi phí của báo giá) */
    category: text('category'),
    partnerId: uuid('partner_id').references(() => partners.id),
    /** dat_coc | giam_dinh | van_don | chung_tu | giai_ngan | ngay */
    milestone: text('milestone').notNull(),
    dueDate: text('due_date'),
    plannedAmount: numeric('planned_amount', { precision: 18, scale: 2, mode: 'number' }).notNull(),
    currency: text('currency').notNull(),
    /** du_kien | da_thuc_hien | da_huy */
    status: text('status').notNull().default('du_kien'),
    paidAmount: numeric('paid_amount', { precision: 18, scale: 2, mode: 'number' }),
    paidOn: text('paid_on'),
    /** Tỷ giá thực tế lúc thu, chi (số đơn vị tiền đổi được 1 USD) */
    fxPerUsd: numeric('fx_per_usd', { precision: 18, scale: 4, mode: 'number' }),
    reference: text('reference'),
    note: text('note'),
    /** Giám đốc cho trả nhà cung cấp vượt số đã thu (mua đứt) */
    overpayApprovedBy: uuid('overpay_approved_by').references(() => users.id),
    overpayApprovedAt: timestamp('overpay_approved_at', { withTimezone: true }),
    overpayReason: text('overpay_reason'),
    recordedBy: uuid('recorded_by').references(() => users.id),
    recordedAt: timestamp('recorded_at', { withTimezone: true }),
    cancelReason: text('cancel_reason'),
    createdBy: uuid('created_by')
      .notNull()
      .references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('lot_payments_lot_idx').on(t.exportLotId), index('lot_payments_partner_idx').on(t.partnerId)],
);

/**
 * Khiếu nại sau giao hàng. Lỗi xác định đối chiếu kết quả giám định cảng đi. Kết quả là số tiền giảm trừ
 * cho người mua (ghi bằng phụ lục hợp đồng đối ứng); lỗi hàng hoá chuyển một phần hoặc toàn bộ sang nhà cung cấp.
 */
export const complaints = pgTable(
  'complaints',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    code: text('code').notNull(),
    exportLotId: uuid('export_lot_id')
      .notNull()
      .references(() => exportLots.id),
    /** so_luong | chat_luong | chung_tu | cham_giao */
    kind: text('kind').notNull(),
    description: text('description').notNull(),
    claimedAmount: numeric('claimed_amount', { precision: 18, scale: 2, mode: 'number' }),
    currency: text('currency').notNull(),
    evidence: text('evidence'),
    /** mo | da_dong */
    status: text('status').notNull().default('mo'),
    /** ncc | van_chuyen | nguoi_mua | van_thuan | khong_co_loi */
    fault: text('fault'),
    agreedAmount: numeric('agreed_amount', { precision: 18, scale: 2, mode: 'number' }),
    passBackPurchaseLotId: uuid('pass_back_purchase_lot_id').references(() => purchaseLots.id),
    passBackAmount: numeric('pass_back_amount', { precision: 18, scale: 2, mode: 'number' }),
    amendmentRef: text('amendment_ref'),
    resolution: text('resolution'),
    openedBy: uuid('opened_by')
      .notNull()
      .references(() => users.id),
    openedAt: timestamp('opened_at', { withTimezone: true }).notNull().defaultNow(),
    closedBy: uuid('closed_by').references(() => users.id),
    closedAt: timestamp('closed_at', { withTimezone: true }),
  },
  (t) => [uniqueIndex('complaints_code_uq').on(t.code), index('complaints_lot_idx').on(t.exportLotId)],
);

/**
 * Quyết toán lô xuất: kế toán lập khi đủ 6 điều kiện, Kế toán trưởng duyệt; Giám đốc duyệt thêm khi lô lỗ
 * hoặc biên thấp hơn dự toán quá 10%. Nội dung chốt dạng ảnh chụp kèm mã băm, ghi vào sổ cái hợp đồng đối ứng.
 * Mỗi lô chỉ có một bản đang hiệu lực (bản bị trả lại thì lập bản mới).
 */
export const settlements = pgTable(
  'settlements',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    exportLotId: uuid('export_lot_id')
      .notNull()
      .references(() => exportLots.id),
    /** cho_ktt | cho_gd | da_duyet | tra_lai */
    status: text('status').notNull(),
    data: jsonb('data').notNull(),
    contentHash: text('content_hash').notNull(),
    marginUsd: numeric('margin_usd', { precision: 18, scale: 2, mode: 'number' }).notNull(),
    marginPct: numeric('margin_pct', { precision: 8, scale: 3, mode: 'number' }),
    estimateMarginPct: numeric('estimate_margin_pct', { precision: 8, scale: 3, mode: 'number' }),
    /** bao_gia | nhap_tay */
    estimateSource: text('estimate_source'),
    needsDirector: boolean('needs_director').notNull(),
    directorReason: text('director_reason'),
    note: text('note'),
    preparedBy: uuid('prepared_by')
      .notNull()
      .references(() => users.id),
    preparedAt: timestamp('prepared_at', { withTimezone: true }).notNull().defaultNow(),
    chiefAccountantBy: uuid('chief_accountant_by').references(() => users.id),
    chiefAccountantAt: timestamp('chief_accountant_at', { withTimezone: true }),
    directorBy: uuid('director_by').references(() => users.id),
    directorAt: timestamp('director_at', { withTimezone: true }),
    returnedBy: uuid('returned_by').references(() => users.id),
    returnedAt: timestamp('returned_at', { withTimezone: true }),
    returnReason: text('return_reason'),
  },
  (t) => [index('settlements_lot_idx').on(t.exportLotId), uniqueIndex('settlements_active_uq').on(t.exportLotId).where(sql`${t.status} <> 'tra_lai'`)],
);

export type Financing = typeof financings.$inferSelect;
export type LotPayment = typeof lotPayments.$inferSelect;
export type Complaint = typeof complaints.$inferSelect;
export type Settlement = typeof settlements.$inferSelect;

// ============ Nguồn cung: nông hộ, vùng trồng, thửa ============

/**
 * Nông hộ (hoặc chủ ao) thành viên của một nhà cung cấp / HTX. Số CCCD lưu mã hoá; chỉ hiện 4 số cuối,
 * xem đầy đủ cần quyền riêng và được ghi nhật ký. Phải có ngày hộ ký đồng ý cho xử lý dữ liệu cá nhân.
 */
export const farmers = pgTable(
  'farmers',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    supplierPartnerId: uuid('supplier_partner_id')
      .notNull()
      .references(() => partners.id),
    code: text('code').notNull(),
    fullName: text('full_name').notNull(),
    idNumberEnc: text('id_number_enc'),
    /** Mã băm có khoá của số CCCD, để phát hiện một hộ khai ở hai nơi mà không lưu số rõ */
    idNumberHash: text('id_number_hash'),
    idNumberLast4: text('id_number_last4'),
    phone: text('phone'),
    commune: text('commune'),
    district: text('district'),
    province: text('province').notNull(),
    joinedOn: text('joined_on'),
    consentOn: text('consent_on').notNull(),
    /** noi_bo | cong_ncc */
    source: text('source').notNull(),
    voidedAt: timestamp('voided_at', { withTimezone: true }),
    voidedBy: uuid('voided_by').references(() => users.id),
    voidReason: text('void_reason'),
    createdBy: uuid('created_by')
      .notNull()
      .references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('farmers_code_uq').on(t.code),
    index('farmers_supplier_idx').on(t.supplierPartnerId),
    uniqueIndex('farmers_supplier_id_uq').on(t.supplierPartnerId, t.idNumberHash).where(sql`${t.voidedAt} is null and ${t.idNumberHash} is not null`),
  ],
);

/** Vùng trồng hoặc vùng nuôi của một nhà cung cấp; có thể có mã số do cơ quan nhà nước cấp. */
export const growingAreas = pgTable(
  'growing_areas',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    supplierPartnerId: uuid('supplier_partner_id')
      .notNull()
      .references(() => partners.id),
    code: text('code').notNull(),
    name: text('name').notNull(),
    /** vung_trong | vung_nuoi */
    kind: text('kind').notNull(),
    /** ca_phe | gia_vi | thuy_san */
    sector: text('sector').notNull(),
    /** Mã số vùng trồng (Cục BVTV) hoặc mã cơ sở nuôi, nếu đã được cấp */
    officialCode: text('official_code'),
    officialCodeIssuer: text('official_code_issuer'),
    commune: text('commune'),
    district: text('district'),
    province: text('province').notNull(),
    note: text('note'),
    /** Năng suất tối đa riêng cho vùng (kg/ha/năm); null thì dùng mức chung của ngành do Ban Giám đốc đặt */
    maxYieldKgPerHa: numeric('max_yield_kg_per_ha', { precision: 10, scale: 2, mode: 'number' }),
    active: boolean('active').notNull().default(true),
    createdBy: uuid('created_by')
      .notNull()
      .references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('growing_areas_code_uq').on(t.code), index('growing_areas_supplier_idx').on(t.supplierPartnerId)],
);

/**
 * Thửa đất hoặc ao nuôi: thuộc một hộ và một vùng. Tọa độ dạng GeoJSON (WGS84): một điểm nếu ≤ 4 ha,
 * đa giác nếu lớn hơn (EUDR). Sửa tọa độ được ghi nhật ký kèm tọa độ cũ.
 */
export const plots = pgTable(
  'plots',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    code: text('code').notNull(),
    supplierPartnerId: uuid('supplier_partner_id')
      .notNull()
      .references(() => partners.id),
    farmerId: uuid('farmer_id')
      .notNull()
      .references(() => farmers.id),
    growingAreaId: uuid('growing_area_id')
      .notNull()
      .references(() => growingAreas.id),
    /** thua | ao */
    kind: text('kind').notNull(),
    /** Cây trồng hoặc loài nuôi (Robusta, Arabica, tiêu, tôm thẻ...) */
    crop: text('crop'),
    plantedYear: integer('planted_year'),
    geometry: jsonb('geometry').notNull(),
    /** diem | da_giac */
    geometryType: text('geometry_type').notNull(),
    declaredAreaHa: numeric('declared_area_ha', { precision: 10, scale: 4, mode: 'number' }),
    measuredAreaHa: numeric('measured_area_ha', { precision: 10, scale: 4, mode: 'number' }),
    /** Diện tích dùng để tính (đo từ ranh giới nếu có) */
    areaHa: numeric('area_ha', { precision: 10, scale: 4, mode: 'number' }).notNull(),
    /** Sai số GPS (m) khi lấy bằng điện thoại */
    gpsAccuracyM: numeric('gps_accuracy_m', { precision: 8, scale: 1, mode: 'number' }),
    /** Giấy tờ quyền sử dụng đất / mặt nước: loại và số */
    landDocType: text('land_doc_type'),
    landDocNumber: text('land_doc_number'),
    /** Cảnh báo lúc ghi (chồng lấn thửa khác, diện tích lệch) để nhân viên kiểm tra */
    warnings: jsonb('warnings').notNull().default([]),
    /**
     * Kết quả kiểm tra rừng (mốc 31/12/2020) đã được duyệt: chua_kiem | cho_duyet | khong_rung | co_rung.
     * Đo lại tọa độ thì trở về chua_kiem.
     */
    forestStatus: text('forest_status').notNull().default('chua_kiem'),
    /** noi_bo | cong_ncc | nhap_tep */
    source: text('source').notNull(),
    voidedAt: timestamp('voided_at', { withTimezone: true }),
    voidedBy: uuid('voided_by').references(() => users.id),
    voidReason: text('void_reason'),
    createdBy: uuid('created_by')
      .notNull()
      .references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('plots_code_uq').on(t.code),
    index('plots_supplier_idx').on(t.supplierPartnerId),
    index('plots_farmer_idx').on(t.farmerId),
    index('plots_area_idx').on(t.growingAreaId),
  ],
);

export type Farmer = typeof farmers.$inferSelect;
export type GrowingArea = typeof growingAreas.$inferSelect;
export type Plot = typeof plots.$inferSelect;

/**
 * Phiếu thu gom: một lần cân hàng của một hộ, từ một thửa, vào một lô mua. Khối lượng cộng vào lô mua.
 * Không xoá; phiếu sai được huỷ kèm lý do (khi lô còn ở bước thu gom) và trừ lại khối lượng.
 */
export const collectionSlips = pgTable(
  'collection_slips',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    code: text('code').notNull(),
    purchaseLotId: uuid('purchase_lot_id')
      .notNull()
      .references(() => purchaseLots.id),
    supplierPartnerId: uuid('supplier_partner_id')
      .notNull()
      .references(() => partners.id),
    farmerId: uuid('farmer_id')
      .notNull()
      .references(() => farmers.id),
    plotId: uuid('plot_id')
      .notNull()
      .references(() => plots.id),
    harvestDate: text('harvest_date').notNull(),
    quantityKg: numeric('quantity_kg', { precision: 14, scale: 2, mode: 'number' }).notNull(),
    moisturePct: numeric('moisture_pct', { precision: 5, scale: 2, mode: 'number' }),
    weighTicketNo: text('weigh_ticket_no'),
    /** Hàng của phiếu có đủ điều kiện EUDR không (chỉ cà phê); null với mặt hàng khác */
    eudrOk: boolean('eudr_ok'),
    /** Lý do chưa đủ, để người dùng biết cần bổ sung gì */
    eudrReasons: jsonb('eudr_reasons').notNull().default([]),
    /** Trần sản lượng của thửa lúc ghi phiếu (kg trong 12 tháng); null khi chưa có mức năng suất */
    capKg: numeric('cap_kg', { precision: 14, scale: 2, mode: 'number' }),
    /** Lưu ý truy xuất ngoài EUDR (ví dụ gia vị thu hoạch khi chưa hết thời gian cách ly thuốc BVTV); không chặn */
    traceIssues: jsonb('trace_issues').notNull().default([]),
    /** noi_bo | cong_ncc */
    source: text('source').notNull(),
    note: text('note'),
    voidedAt: timestamp('voided_at', { withTimezone: true }),
    voidedBy: uuid('voided_by').references(() => users.id),
    voidReason: text('void_reason'),
    createdBy: uuid('created_by')
      .notNull()
      .references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('collection_slips_code_uq').on(t.code),
    index('collection_slips_lot_idx').on(t.purchaseLotId),
    index('collection_slips_plot_idx').on(t.plotId, t.harvestDate),
  ],
);

export type CollectionSlip = typeof collectionSlips.$inferSelect;

/**
 * Kiểm tra rừng của một thửa: người kiểm ghi kết quả (đối chiếu bản đồ rừng 2020 hoặc khảo sát thực địa),
 * người thứ hai duyệt. Giữ mã băm tọa độ lúc kiểm để biết thửa có bị đo lại sau đó không.
 */
export const plotForestChecks = pgTable(
  'plot_forest_checks',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    plotId: uuid('plot_id')
      .notNull()
      .references(() => plots.id),
    /** jrc_2020 | gfw | khao_sat | khac */
    method: text('method').notNull(),
    /** khong_rung | co_rung */
    result: text('result').notNull(),
    evidence: text('evidence').notNull(),
    geometryHash: text('geometry_hash').notNull(),
    checkedBy: uuid('checked_by')
      .notNull()
      .references(() => users.id),
    checkedAt: timestamp('checked_at', { withTimezone: true }).notNull().defaultNow(),
    /** cho_duyet | da_duyet | tu_choi | het_hieu_luc */
    status: text('status').notNull().default('cho_duyet'),
    reviewedBy: uuid('reviewed_by').references(() => users.id),
    reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
    reviewNote: text('review_note'),
  },
  (t) => [index('plot_forest_checks_plot_idx').on(t.plotId), index('plot_forest_checks_status_idx').on(t.status)],
);

/**
 * Gói dữ liệu EUDR của một lô xuất: danh sách thửa (tọa độ), khối lượng, kết quả kiểm tra rừng.
 * Mỗi lần chốt là một phiên bản; mã băm nội dung được ghi lên sổ cái của hợp đồng đối ứng. Chỉ ghi thêm.
 */
export const eudrPackages = pgTable(
  'eudr_packages',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    exportLotId: uuid('export_lot_id')
      .notNull()
      .references(() => exportLots.id),
    version: integer('version').notNull(),
    content: jsonb('content').notNull(),
    contentHash: text('content_hash').notNull(),
    createdBy: uuid('created_by')
      .notNull()
      .references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('eudr_packages_lot_version_uq').on(t.exportLotId, t.version)],
);

/**
 * Sản lượng ước tính của một thửa theo tháng thu hoạch (kế hoạch thu mua). Nhà cung cấp khai, nhân viên thu mua
 * chỉnh; mỗi lần đổi ghi nhật ký kèm số cũ. Tổng ước tính trong 12 tháng liên tiếp không vượt trần sản lượng của thửa.
 */
export const harvestEstimates = pgTable(
  'harvest_estimates',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    plotId: uuid('plot_id')
      .notNull()
      .references(() => plots.id),
    /** YYYY-MM */
    month: text('month').notNull(),
    estimatedKg: numeric('estimated_kg', { precision: 14, scale: 2, mode: 'number' }).notNull(),
    /** noi_bo | cong_ncc */
    source: text('source').notNull(),
    note: text('note'),
    updatedBy: uuid('updated_by')
      .notNull()
      .references(() => users.id),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('harvest_estimates_plot_month_uq').on(t.plotId, t.month), index('harvest_estimates_month_idx').on(t.month)],
);
export type HarvestEstimate = typeof harvestEstimates.$inferSelect;

/**
 * Mã đăng ký của kho, xưởng với cơ quan nước nhập: FDA (Mỹ), GACC (Trung Quốc), danh sách cơ sở được xuất vào EU.
 * Huỷ thay vì xoá.
 */
export const facilityCodes = pgTable(
  'facility_codes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    facilityId: uuid('facility_id')
      .notNull()
      .references(() => facilities.id),
    /** fda | gacc | eu_list */
    scheme: text('scheme').notNull(),
    code: text('code').notNull(),
    /** YYYY-MM-DD; trống là không ghi hạn */
    validUntil: text('valid_until'),
    note: text('note'),
    createdBy: uuid('created_by')
      .notNull()
      .references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    voidedAt: timestamp('voided_at', { withTimezone: true }),
    voidedBy: uuid('voided_by').references(() => users.id),
    voidReason: text('void_reason'),
  },
  (t) => [index('facility_codes_facility_idx').on(t.facilityId)],
);

/**
 * Nhật ký dùng thuốc bảo vệ thực vật theo thửa (gia vị): để đối chiếu dư lượng tối đa (MRL) và kiểm thu hoạch
 * sau thời gian cách ly. Huỷ thay vì xoá.
 */
export const sprayLogs = pgTable(
  'spray_logs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    plotId: uuid('plot_id')
      .notNull()
      .references(() => plots.id),
    sprayedOn: text('sprayed_on').notNull(),
    product: text('product').notNull(),
    activeIngredient: text('active_ingredient'),
    /** Thời gian cách ly ghi trên nhãn thuốc (ngày) */
    phiDays: integer('phi_days').notNull(),
    dose: text('dose'),
    note: text('note'),
    /** noi_bo | cong_ncc */
    source: text('source').notNull(),
    createdBy: uuid('created_by')
      .notNull()
      .references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    voidedAt: timestamp('voided_at', { withTimezone: true }),
    voidedBy: uuid('voided_by').references(() => users.id),
    voidReason: text('void_reason'),
  },
  (t) => [index('spray_logs_plot_idx').on(t.plotId, t.sprayedOn)],
);
export type SprayLog = typeof sprayLogs.$inferSelect;

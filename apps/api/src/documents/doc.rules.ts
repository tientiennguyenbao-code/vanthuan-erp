/**
 * Quy tắc chứng từ, theo "Thiết kế phân hệ Điều phối lô hàng và chứng từ" và bản rà soát ma trận 9 cặp.
 * Tách riêng để dễ đọc và dễ kiểm thử.
 */

export const DOC_STATUSES = ['thieu', 'dang_xin', 'nhap', 'da_duyet', 'da_gui', 'khong_ap_dung'] as const;
export type DocStatus = (typeof DOC_STATUSES)[number];
/** Trạng thái người phụ trách lô tự đặt được khi cập nhật */
export const EDITABLE_STATUSES = ['thieu', 'dang_xin', 'nhap'] as const;

export const REQUIREMENTS = ['bb', 'nm'] as const;
export const STAGES = ['truoc_xep_tau', 'sau_xep_tau'] as const;
export const SCOPES = ['lo', 'nguoi_xuat_khau', 'nha_cung_cap'] as const;
export const PARTIES = ['van_thuan', 'nha_cung_cap', 'nguoi_nhap', 'ben_xuat_khau'] as const;

/** Quy tắc quá 12 tháng chưa rà soát bị đánh dấu. */
export const REVIEW_MAX_DAYS = 365;

export interface RuleLike {
  id: string;
  code: string;
  name: string;
  sector: string | null;
  market: string | null;
  incoterms: unknown;
  dealType: string | null;
  requirement: string;
  stage: string;
  scope: string;
  party: string;
  issuer: string | null;
  active: boolean;
}

export interface LotProfile {
  sector: string;
  market: string;
  incoterms: string;
  dealType: string;
  /** Các nhà cung cấp đang có hàng trong lô */
  suppliers: string[];
}

export interface ChecklistItem {
  ruleId: string | null;
  code: string;
  name: string;
  requirement: string;
  stage: string;
  party: string;
  issuer: string | null;
  supplierPartnerId: string | null;
}

export const MAIN_SUPPLIER_AUTH = {
  code: 'uy_quyen_ncc_chinh',
  name: 'Thỏa thuận ủy quyền cho nhà cung cấp chính đứng tên người gửi hàng (ký bởi mọi nhà cung cấp trong lô)',
} as const;

export function ruleApplies(r: RuleLike, p: Omit<LotProfile, 'suppliers'>): boolean {
  if (!r.active) return false;
  if (r.sector && r.sector !== p.sector) return false;
  if (r.market && r.market !== p.market) return false;
  if (r.dealType && r.dealType !== p.dealType) return false;
  const inco = Array.isArray(r.incoterms) ? (r.incoterms as string[]) : null;
  if (inco && inco.length && !inco.includes(p.incoterms)) return false;
  return true;
}

/**
 * Checklist của một lô xuất. Với giao dịch môi giới, nhà cung cấp đứng tên xuất khẩu nên chứng từ
 * "người xuất khẩu" tách theo từng nhà cung cấp; đăng ký cơ sở luôn tách theo nhà cung cấp.
 * Lô môi giới gom từ hai nhà cung cấp trở lên cần thêm thỏa thuận ủy quyền nhà cung cấp chính.
 */
export function buildChecklist(rules: RuleLike[], p: LotProfile): ChecklistItem[] {
  const out: ChecklistItem[] = [];
  const seen = new Set<string>();
  const push = (it: ChecklistItem) => {
    const k = `${it.code}|${it.supplierPartnerId ?? ''}`;
    if (seen.has(k)) return;
    seen.add(k);
    out.push(it);
  };
  const suppliers = [...new Set(p.suppliers)].sort();
  for (const r of rules.filter((x) => ruleApplies(x, p))) {
    const base = { ruleId: r.id, code: r.code, name: r.name, requirement: r.requirement, stage: r.stage, party: r.party, issuer: r.issuer };
    const perSupplier = r.scope === 'nha_cung_cap' || (r.scope === 'nguoi_xuat_khau' && p.dealType === 'moi_gioi');
    if (perSupplier && suppliers.length) for (const s of suppliers) push({ ...base, supplierPartnerId: s });
    else push({ ...base, supplierPartnerId: null });
  }
  if (p.dealType === 'moi_gioi' && suppliers.length > 1) {
    push({ ruleId: null, ...MAIN_SUPPLIER_AUTH, requirement: 'bb', stage: 'truoc_xep_tau', party: 'nha_cung_cap', issuer: null, supplierPartnerId: null });
  }
  return out;
}

export interface DocRow {
  name: string;
  requirement: string;
  stage: string;
  party: string;
  status: string;
  expiresOn: string | null;
  supplierName?: string | null;
}

const label = (d: DocRow) => (d.supplierName ? `${d.name} (${d.supplierName})` : d.name);

/** Chứng từ bắt buộc còn thiếu để xếp tàu: mục "trước xếp tàu" phải được duyệt; không được hết hạn trước ngày tàu chạy. */
export function shippingDocProblems(docs: DocRow[], etd: string | null, today: string): string[] {
  const p: string[] = [];
  const ok = new Set(['da_duyet', 'da_gui', 'khong_ap_dung']);
  const missing = docs.filter((d) => d.requirement === 'bb' && d.stage === 'truoc_xep_tau' && !ok.has(d.status));
  if (missing.length) p.push(`Còn ${missing.length} chứng từ bắt buộc trước xếp tàu chưa được duyệt: ${missing.map(label).join('; ')}`);
  const limit = etd && etd > today ? etd : today;
  const expired = docs.filter((d) => d.status !== 'khong_ap_dung' && d.expiresOn && d.expiresOn < limit);
  if (expired.length) p.push(`Chứng từ hết hạn trước ngày tàu chạy: ${expired.map(label).join('; ')}`);
  return p;
}

/** Hoàn tất bộ chứng từ: mọi chứng từ bắt buộc đã gửi (chứng từ do người nhập làm thì chỉ cần xác nhận đã có). */
export function completionDocProblems(docs: DocRow[]): string[] {
  const missing = docs.filter((d) => {
    if (d.requirement !== 'bb' || d.status === 'khong_ap_dung' || d.status === 'da_gui') return false;
    return !(d.party === 'nguoi_nhap' && d.status === 'da_duyet');
  });
  return missing.length ? [`Còn ${missing.length} chứng từ bắt buộc chưa gửi người mua hoặc ngân hàng: ${missing.map(label).join('; ')}`] : [];
}

/** Phí trọn gói của một phần hàng: khối lượng × đơn giá bán (theo kg) × tỷ lệ. */
export function feeAmount(quantityKg: number, unitPricePerKg: number, ratePct: number | null): { base: number; amount: number | null } {
  const base = Math.round(quantityKg * unitPricePerKg * 100) / 100;
  return { base, amount: ratePct === null ? null : Math.round(((base * ratePct) / 100) * 100) / 100 };
}

export function reviewOverdue(reviewedAt: string, today: Date = new Date()): boolean {
  return (today.getTime() - new Date(reviewedAt + 'T00:00:00Z').getTime()) / 864e5 > REVIEW_MAX_DAYS;
}

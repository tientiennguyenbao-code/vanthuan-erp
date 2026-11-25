/**
 * Quy tắc báo giá: quy đổi, chi phí theo Incoterms, biên lợi nhuận dự kiến.
 * Theo "Thiết kế phân hệ Giao dịch & Đối tác", mục 3.2, 3.4 và 3.5.
 */

export const QUOTE_KINDS = ['mua', 'ban'] as const;
export type QuoteKind = (typeof QUOTE_KINDS)[number];
export type QuoteStatus = 'nhap' | 'da_gui' | 'chap_nhan' | 'tu_choi' | 'huy';

export const COST_KINDS = ['van_tai_noi_dia', 'thu_tuc_xuat_khau', 'xep_hang', 'cuoc_bien', 'bao_hiem', 'giam_dinh', 'so_che_dong_goi', 'kho', 'khac'] as const;
export type CostKind = (typeof COST_KINDS)[number];

/**
 * Chi phí Vạn Thuận chịu ngoài giá hàng, theo Incoterms của báo giá bán (bảng mục 3.4).
 * Dùng để gợi ý các dòng chi phí cần điền; số tiền do người lập nhập.
 */
export function costKindsFor(incoterms: string): CostKind[] {
  const fob: CostKind[] = ['van_tai_noi_dia', 'thu_tuc_xuat_khau', 'xep_hang'];
  switch (incoterms) {
    case 'EXW':
      return [];
    case 'FCA':
    case 'FAS':
    case 'FOB':
      return fob;
    case 'CFR':
    case 'CPT':
      return [...fob, 'cuoc_bien'];
    case 'CIF':
    case 'CIP':
    case 'DAP':
    case 'DPU':
    case 'DDP':
      return [...fob, 'cuoc_bien', 'bao_hiem'];
    default:
      return fob;
  }
}

export function toKg(quantity: number, unit: string): number {
  return unit === 'tan' ? quantity * 1000 : quantity;
}

/** Quy ra USD; null nếu thiếu tỷ giá. */
export function toUsd(amount: number, currency: string, fxPerUsd: number | null | undefined): number | null {
  if (currency === 'USD') return amount;
  if (!fxPerUsd || fxPerUsd <= 0) return null;
  return amount / fxPerUsd;
}

export function round2(v: number): number {
  return Math.round(v * 100) / 100;
}

export interface PriceLike {
  quantity: number;
  unit: string;
  unitPrice: number;
  currency: string;
  fxPerUsd: number | null;
}

export function quoteValue(q: PriceLike): number {
  return round2(q.quantity * q.unitPrice);
}

/** Giá USD cho 1 kg, để so sánh các báo giá mua với nhau. */
export function usdPerKg(q: PriceLike): number | null {
  const perUnit = toUsd(q.unitPrice, q.currency, q.fxPerUsd);
  if (perUnit === null) return null;
  return q.unit === 'tan' ? perUnit / 1000 : perUnit;
}

export interface CostLike {
  amount: number;
  currency: string;
  fxPerUsd: number | null;
}

export interface SaleSummary {
  giaTriBanUsd: number | null;
  giaVonUsd: number | null;
  chiPhiUsd: number | null;
  phiTronGoiUsd: number | null;
  bienUsd: number | null;
  bienPhanTram: number | null;
  thieu: string[];
}

/**
 * Biên dự kiến của báo giá bán (mua đứt):
 * giá trị bán − giá vốn (giá mua × sản lượng bán) − chi phí + phí trọn gói (nhà cung cấp trả, tính trên giá bán).
 */
export function saleSummary(sale: PriceLike & { feeRatePct: number | null }, source: PriceLike | null, costs: CostLike[]): SaleSummary {
  const thieu: string[] = [];
  const ban = toUsd(quoteValue(sale), sale.currency, sale.fxPerUsd);
  if (ban === null) thieu.push('tỷ giá của báo giá bán');
  let von: number | null = null;
  if (!source) thieu.push('báo giá mua làm nguồn');
  else {
    const perKg = usdPerKg(source);
    if (perKg === null) thieu.push('tỷ giá của báo giá mua');
    else von = perKg * toKg(sale.quantity, sale.unit);
  }
  let chiPhi: number | null = 0;
  for (const c of costs) {
    const v = toUsd(c.amount, c.currency, c.fxPerUsd);
    if (v === null) {
      thieu.push('tỷ giá của dòng chi phí');
      chiPhi = null;
      break;
    }
    chiPhi += v;
  }
  const phi = ban !== null ? (ban * (sale.feeRatePct ?? 0)) / 100 : null;
  const bien = ban !== null && von !== null && chiPhi !== null && phi !== null ? ban - von - chiPhi + phi : null;
  return {
    giaTriBanUsd: ban === null ? null : round2(ban),
    giaVonUsd: von === null ? null : round2(von),
    chiPhiUsd: chiPhi === null ? null : round2(chiPhi),
    phiTronGoiUsd: phi === null ? null : round2(phi),
    bienUsd: bien === null ? null : round2(bien),
    bienPhanTram: bien !== null && ban ? round2((bien / ban) * 100) : null,
    thieu,
  };
}

/** Ngày hôm nay theo giờ Việt Nam, dạng YYYY-MM-DD. */
export function todayVn(now = new Date()): string {
  return new Date(now.getTime() + 7 * 3600 * 1000).toISOString().slice(0, 10);
}

export function isQuoteExpired(validUntil: string, now = new Date()): boolean {
  return validUntil < todayVn(now);
}

/**
 * Quy tắc kho (không đụng cơ sở dữ liệu, để kiểm thử riêng).
 * Theo "Thiết kế phân hệ Kho và Sơ chế": khu có nhãn, hàng nào vào khu nào; chênh lệch cân thu gom và cân tại kho.
 */

export const ZONE_KINDS = ['thuong', 'du_eudr', 'kho_lanh'] as const;
export type ZoneKind = (typeof ZONE_KINDS)[number];

export const ZONE_LABELS: Record<ZoneKind, string> = {
  thuong: 'Khu thường',
  du_eudr: 'Khu đủ EUDR',
  kho_lanh: 'Kho lạnh',
};

/** Ngưỡng chênh lệch giữa cân thu gom và cân tại kho để cảnh báo (phần trăm). */
export const RECEIPT_VARIANCE_WARN_PCT = 1;

const r2 = (n: number) => Math.round(n * 100) / 100;

export interface GoodsFacts {
  /** ca_phe | gia_vi | thuy_san */
  sector: string;
  /** Cà phê: du | khong_du | null (chưa thu gom) */
  eudrClass: string | null;
}

/**
 * Hàng này có được vào khu này không. Trả về lý do khi không được.
 * - Cà phê đủ EUDR chỉ vào khu đủ EUDR; khu đủ EUDR chỉ nhận cà phê đủ EUDR (NC-1: tách kho từ lúc thu gom).
 * - Thủy sản chỉ vào kho lạnh.
 */
export function zoneRefusal(goods: GoodsFacts, zone: { kind: string; name: string; active: boolean }): string | null {
  if (!zone.active) return `${zone.name} đã ngừng dùng`;
  if (goods.sector === 'ca_phe' && !goods.eudrClass) return 'Lô cà phê chưa thu gom nên chưa biết đủ hay không đủ EUDR';
  if (goods.eudrClass === 'du' && zone.kind !== 'du_eudr') return 'Cà phê đủ EUDR chỉ được vào khu đủ EUDR';
  if (zone.kind === 'du_eudr' && goods.eudrClass !== 'du') return `${zone.name} là khu đủ EUDR, chỉ nhận cà phê đủ EUDR`;
  if (goods.sector === 'thuy_san' && zone.kind !== 'kho_lanh') return 'Thủy sản chỉ được vào kho lạnh';
  return null;
}

/** Khu còn chỗ không (sức chứa trống = không giới hạn). */
export function capacityRefusal(zone: { name: string; capacityKg: number | null }, currentKg: number, addKg: number): string | null {
  if (zone.capacityKg === null || zone.capacityKg === undefined) return null;
  const free = r2(zone.capacityKg - currentKg);
  if (addKg > free + 0.005) return `${zone.name} chỉ còn chỗ cho ${fmtKg(Math.max(free, 0))} kg`;
  return null;
}

/**
 * So khối lượng đã nhận vào kho với khối lượng thu gom của lô mua.
 * Nhận nhiều hơn thu gom quá ngưỡng: luôn cảnh báo. Nhận ít hơn quá ngưỡng: chỉ cảnh báo khi lô đã thôi thu gom
 * (còn thu gom thì hàng có thể đang trên đường về).
 */
export function receiptVariance(collectedKg: number, receivedKg: number, stillCollecting: boolean) {
  const diffKg = r2(receivedKg - collectedKg);
  const pct = collectedKg > 0 ? r2((diffKg / collectedKg) * 100) : null;
  let warning: string | null = null;
  if (collectedKg <= 0 && receivedKg > 0) warning = 'Đã nhận hàng vào kho nhưng lô mua chưa ghi thu gom';
  else if (pct !== null && pct > RECEIPT_VARIANCE_WARN_PCT) warning = `Nhận vào kho nhiều hơn thu gom ${fmtKg(diffKg)} kg (${fmtPct(pct)}%)`;
  else if (pct !== null && !stillCollecting && pct < -RECEIPT_VARIANCE_WARN_PCT) warning = `Nhận vào kho ít hơn thu gom ${fmtKg(-diffKg)} kg (${fmtPct(-pct)}%)`;
  return { collectedKg: r2(collectedKg), receivedKg: r2(receivedKg), diffKg, diffPct: pct, warning };
}

/** Chuyển một phần lô tồn sang khu khác: phải lớn hơn 0 và không quá số còn lại. */
export function moveRefusal(remainingKg: number, quantityKg: number): string | null {
  if (remainingKg <= 0) return 'Lô tồn đã hết hàng';
  if (!(quantityKg > 0)) return 'Khối lượng chuyển phải lớn hơn 0';
  if (quantityKg > remainingKg + 0.005) return `Lô tồn chỉ còn ${fmtKg(remainingKg)} kg`;
  return null;
}

export function fmtKg(n: number): string {
  return r2(n).toLocaleString('vi-VN', { maximumFractionDigits: 2 });
}
function fmtPct(n: number): string {
  return r2(n).toLocaleString('vi-VN', { maximumFractionDigits: 2 });
}

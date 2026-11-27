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

// ---------- Sơ chế ----------

/** Công đoạn sơ chế theo ngành (danh sách trong thiết kế). */
export const PROCESSING_STEPS: Record<string, Record<string, string>> = {
  ca_phe: { phoi: 'Phơi', say: 'Sấy', xat: 'Xát', sang_phan_loai: 'Sàng phân loại', tach_mau: 'Tách màu', danh_bong: 'Đánh bóng', dong_bao: 'Đóng bao' },
  gia_vi: { phoi: 'Phơi', lam_sach: 'Làm sạch', tach_da: 'Tách đá', tiet_trung_hoi: 'Tiệt trùng hơi nước', phan_loai_dung_trong: 'Phân loại theo dung trọng', dong_bao: 'Đóng bao' },
  thuy_san: { so_che: 'Sơ chế', phan_co: 'Phân cỡ', cap_dong: 'Cấp đông', ma_bang: 'Mạ băng', dong_thung: 'Đóng thùng' },
};
/** Công đoạn làm tăng khối lượng (lớp băng): đầu ra được lớn hơn đầu vào, không so định mức hao hụt. */
export const GAIN_STEPS = ['ma_bang'];

export function stepLabel(sector: string, step: string): string {
  return PROCESSING_STEPS[sector]?.[step] ?? step;
}

export interface InputFacts {
  code: string;
  facilityId: string;
  commodityId: string;
  dealType: string;
  eudrClass: string | null;
  status: string;
  remainingKg: number;
  /** Nhà cung cấp của các lô mua gốc */
  supplierIds: string[];
  quantityKg: number;
}

/**
 * Các lô tồn có được vào chung một lệnh không (KS-1): cùng kho, cùng mặt hàng, cùng nhãn EUDR, cùng loại giao dịch;
 * hàng môi giới vẫn là của nhà cung cấp nên chỉ trộn hàng của cùng một nhà cung cấp. Không dùng lô đang chờ duyệt.
 */
export function inputsRefusal(facilityId: string, inputs: InputFacts[]): string | null {
  if (!inputs.length) return 'Chọn ít nhất một lô tồn đầu vào';
  for (const i of inputs) {
    if (i.facilityId !== facilityId) return `${i.code} không ở kho này`;
    if (i.status !== 'san_sang') return `${i.code} đang chờ duyệt hao hụt, chưa dùng được`;
    if (!(i.quantityKg > 0)) return `Khối lượng lấy từ ${i.code} phải lớn hơn 0`;
    if (i.quantityKg > i.remainingKg + 0.005) return `${i.code} chỉ còn ${fmtKg(i.remainingKg)} kg`;
  }
  const first = inputs[0];
  if (inputs.some((i) => i.commodityId !== first.commodityId)) return 'Chỉ trộn các lô cùng mặt hàng';
  if (inputs.some((i) => i.eudrClass !== first.eudrClass)) return 'Không trộn cà phê đủ EUDR với hàng không đủ EUDR';
  if (inputs.some((i) => i.dealType !== first.dealType)) return 'Không trộn hàng mua đứt với hàng môi giới';
  if (first.dealType === 'moi_gioi') {
    const suppliers = new Set(inputs.flatMap((i) => i.supplierIds));
    if (suppliers.size > 1) return 'Hàng môi giới là của nhà cung cấp, chỉ trộn các lô của cùng một nhà cung cấp';
  }
  return null;
}

export interface OutputFacts {
  kind: 'thanh_pham' | 'phu_pham';
  quantityKg: number;
}

/** Cân bằng khối lượng: vào = ra (thành phẩm + phụ phẩm) + hao hụt. Trả về số liệu hoặc lý do sai. */
export function massBalance(step: string, inputKg: number, outputs: OutputFacts[]) {
  if (!outputs.some((o) => o.kind === 'thanh_pham')) return { error: 'Lệnh phải có ít nhất một dòng thành phẩm' } as const;
  if (outputs.some((o) => !(o.quantityKg > 0))) return { error: 'Khối lượng mỗi dòng đầu ra phải lớn hơn 0' } as const;
  const outputKg = r2(outputs.filter((o) => o.kind === 'thanh_pham').reduce((s, o) => s + o.quantityKg, 0));
  const byproductKg = r2(outputs.filter((o) => o.kind === 'phu_pham').reduce((s, o) => s + o.quantityKg, 0));
  const lossKg = r2(inputKg - outputKg - byproductKg);
  if (lossKg < -0.005 && !GAIN_STEPS.includes(step)) {
    return { error: `Đầu ra (${fmtKg(outputKg + byproductKg)} kg) nhiều hơn đầu vào (${fmtKg(inputKg)} kg)` } as const;
  }
  const lossPct = inputKg > 0 ? r2((lossKg / inputKg) * 100) : 0;
  return { inputKg: r2(inputKg), outputKg, byproductKg, lossKg, lossPct } as const;
}

/**
 * Hao hụt có cần Giám đốc duyệt không (KS-3): vượt định mức, hoặc công đoạn chưa có định mức.
 * Công đoạn làm tăng khối lượng không xét.
 */
export function needsApproval(step: string, lossPct: number, normPct: number | null): boolean {
  if (GAIN_STEPS.includes(step)) return false;
  if (normPct === null) return true;
  return lossPct > normPct + 0.005;
}

/**
 * Nguồn gốc đầu ra (KS-2): trộn theo tỷ lệ khối lượng. Mỗi đầu vào góp (kg lấy vào) × (tỷ lệ của từng lô mua trong nó).
 */
export function blendShares(inputs: { quantityKg: number; origins: { purchaseLotId: string; share: number }[] }[]): { purchaseLotId: string; share: number }[] {
  const total = inputs.reduce((s, i) => s + i.quantityKg, 0);
  const map = new Map<string, number>();
  for (const i of inputs) for (const o of i.origins) map.set(o.purchaseLotId, (map.get(o.purchaseLotId) ?? 0) + i.quantityKg * o.share);
  return [...map.entries()]
    .map(([purchaseLotId, kgv]) => ({ purchaseLotId, share: Math.round((kgv / total) * 1e9) / 1e9 }))
    .sort((a, b) => b.share - a.share);
}

// ---------- Xuất kho cho lô xuất (KS-5) ----------

export interface IssueLotFacts {
  code: string;
  facilityId: string;
  commodityId: string;
  dealType: string;
  eudrClass: string | null;
  status: string;
  kind: string;
  remainingKg: number;
  quantityKg: number;
}

/**
 * Lô tồn có xuất được cho lô xuất này không: cùng kho của phiếu, sẵn sàng (không chờ duyệt hao hụt), không phải phụ phẩm (KS-8),
 * cùng mặt hàng và loại giao dịch với lô xuất; cà phê đi EU phải đủ EUDR.
 */
export function issueRefusal(
  lot: IssueLotFacts,
  exp: { status: string; commodityId: string; dealType: string; market: string },
  facilityId: string,
  sector: string,
): string | null {
  if (exp.status !== 'dong_goi') return 'Chỉ xuất kho khi lô xuất đang ở bước đóng gói';
  if (lot.facilityId !== facilityId) return `${lot.code} không ở kho này`;
  if (lot.status !== 'san_sang') return `${lot.code} đang chờ duyệt hao hụt, chưa xuất được`;
  if (lot.kind === 'phu_pham') return `${lot.code} là phụ phẩm, không xuất khẩu`;
  if (lot.commodityId !== exp.commodityId) return `${lot.code} khác mặt hàng của lô xuất`;
  if (lot.dealType !== exp.dealType) return `${lot.code} khác loại giao dịch của lô xuất (mua đứt hoặc môi giới)`;
  if (exp.market === 'EU' && sector === 'ca_phe' && lot.eudrClass !== 'du') return `${lot.code} không đủ EUDR, không xuất cà phê đi EU được`;
  if (!(lot.quantityKg > 0)) return `Khối lượng xuất từ ${lot.code} phải lớn hơn 0`;
  if (lot.quantityKg > lot.remainingKg + 0.005) return `${lot.code} chỉ còn ${fmtKg(lot.remainingKg)} kg`;
  return null;
}

/**
 * Quy khối lượng xuất từ các lô tồn về lô mua theo tỷ lệ nguồn gốc (KS-2, KS-5).
 * Làm tròn đến 0,01 kg; phần lệch do làm tròn dồn vào lô mua góp nhiều nhất để tổng khớp đúng.
 */
export function toPurchaseLots(lines: { quantityKg: number; origins: { purchaseLotId: string; share: number }[] }[]): { purchaseLotId: string; quantityKg: number }[] {
  const total = r2(lines.reduce((s, l) => s + l.quantityKg, 0));
  const map = new Map<string, number>();
  for (const l of lines) for (const o of l.origins) map.set(o.purchaseLotId, (map.get(o.purchaseLotId) ?? 0) + l.quantityKg * o.share);
  const rows = [...map.entries()].map(([purchaseLotId, kgv]) => ({ purchaseLotId, quantityKg: r2(kgv) })).sort((a, b) => b.quantityKg - a.quantityKg);
  if (rows.length) rows[0].quantityKg = r2(rows[0].quantityKg + total - rows.reduce((s, x) => s + x.quantityKg, 0));
  return rows.filter((x) => x.quantityKg > 0);
}

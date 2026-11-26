/**
 * Quy tắc lô hàng, theo "Thiết kế phân hệ Điều phối lô hàng và chứng từ", mục Vòng đời lô hàng.
 * Tách riêng để dễ đọc và dễ kiểm thử.
 */

export const MARKETS = ['US', 'EU', 'CN'] as const;
export type Market = (typeof MARKETS)[number];

export const PURCHASE_LOT_STATUSES = ['thu_gom', 'da_so_che', 'da_nhap_kho', 'da_huy'] as const;
export type PurchaseLotStatus = (typeof PURCHASE_LOT_STATUSES)[number];

/** Thứ tự các bước của lô xuất (không tính da_huy). */
export const EXPORT_STEPS = ['dong_goi', 'nhap_kho', 'giam_dinh', 'dat_cho', 'xep_tau', 'hoan_tat'] as const;
export type ExportStep = (typeof EXPORT_STEPS)[number];
export type ExportLotStatus = ExportStep | 'da_huy';

/** Số ngày trước cut-off bắt đầu cảnh báo (đã xác nhận 25/11). */
export const CUTOFF_WARNING_DAYS = 3;

/** Hợp đồng nào sinh lô mua, hợp đồng nào là hợp đồng đối ứng của lô xuất. */
export const PURCHASE_CONTRACT_KIND = { mua_dut: 'mua', moi_gioi: 'moi_gioi' } as const;
export const COUNTER_CONTRACT_KIND = { mua_dut: 'ban', moi_gioi: 'mua_ban_truc_tiep' } as const;

export function toKg(soLuong: number, donVi: 'kg' | 'tan'): number {
  return Math.round((donVi === 'tan' ? soLuong * 1000 : soLuong) * 100) / 100;
}

export function nextStep(s: ExportLotStatus): ExportStep | null {
  const i = EXPORT_STEPS.indexOf(s as ExportStep);
  return i >= 0 && i < EXPORT_STEPS.length - 1 ? EXPORT_STEPS[i + 1] : null;
}

export interface AllocationView {
  purchaseLotId: string;
  quantityKg: number;
  approved: boolean;
  /** Lô mua này có bị chia cho từ hai lô xuất trở lên không */
  split: boolean;
  /** Nhà cung cấp đã đồng ý cho đúng cách chia hiện tại chưa */
  consented: boolean;
  commodityId: string;
  dealType: string;
}

export interface ExportGateInput {
  status: ExportLotStatus;
  dealType: string;
  commodityId: string;
  /** Khối lượng theo hợp đồng đối ứng (kg) và dung sai (%) */
  contractKg: number;
  tolerancePct: number;
  allocations: AllocationView[];
  lastInspection: 'dat' | 'khong_dat' | null;
  booking: { bookingNumber: string; containers: { so: string; chi: string | null }[] } | null;
}

/**
 * Những điều còn thiếu để lô xuất sang bước kế tiếp. Rỗng nghĩa là được chuyển.
 * Cổng chứng từ trước xếp tàu được thêm ở phần chứng từ.
 */
export function gateProblems(g: ExportGateInput): string[] {
  const to = nextStep(g.status);
  if (!to) return [g.status === 'da_huy' ? 'Lô đã huỷ' : 'Lô đã ở bước cuối'];
  const p: string[] = [];
  const total = g.allocations.reduce((a, x) => a + x.quantityKg, 0);
  if (to === 'nhap_kho') {
    if (!g.allocations.length) p.push('Chưa phân bổ hàng từ lô mua nào');
    const min = g.contractKg * (1 - g.tolerancePct / 100);
    const max = g.contractKg * (1 + g.tolerancePct / 100);
    if (g.allocations.length && (total < min - 0.005 || total > max + 0.005)) {
      p.push(`Tổng phân bổ ${fmt(total)} kg ngoài khoảng hợp đồng ${fmt(min)} – ${fmt(max)} kg (dung sai ±${g.tolerancePct}%)`);
    }
    if (g.allocations.some((a) => !a.approved)) p.push('Còn dòng phân bổ chưa được Trưởng phòng kinh doanh duyệt');
  }
  if (to === 'giam_dinh') {
    if (g.allocations.some((a) => !a.approved)) p.push('Còn dòng phân bổ chưa được Trưởng phòng kinh doanh duyệt');
    if (g.allocations.some((a) => a.split && !a.consented)) p.push('Lô mua bị chia cho nhiều người mua nhưng chưa có xác nhận đồng ý của nhà cung cấp');
  }
  if (to === 'dat_cho') {
    if (g.lastInspection !== 'dat') p.push(g.lastInspection === 'khong_dat' ? 'Giám định gần nhất không đạt' : 'Chưa có kết quả giám định đạt');
  }
  if (to === 'xep_tau') {
    if (!g.booking) p.push('Chưa có booking');
    else {
      if (!g.booking.containers.length) p.push('Chưa nhập số container');
      if (g.booking.containers.some((c) => !c.chi)) p.push('Còn container chưa có số chì (kẹp chì)');
    }
  }
  return p;
}

/** Lý do không phân bổ được một lô mua vào một lô xuất. */
export function allocationRefusal(
  lot: { status: string; dealType: string; commodityId: string; availableKg: number; allocatedKg: number; eudrClass?: string | null },
  exp: { status: string; dealType: string; commodityId: string; market?: string },
  quantityKg: number,
  sector?: string,
): string | null {
  if (exp.status !== 'dong_goi') return 'Chỉ phân bổ khi lô xuất đang ở bước đóng gói';
  if (lot.status === 'da_huy') return 'Lô mua đã huỷ';
  if (lot.status === 'thu_gom') return 'Lô mua chưa sơ chế xong (chưa ghi hao hụt) nên chưa phân bổ được';
  if (lot.dealType !== exp.dealType) return 'Lô mua và lô xuất phải cùng loại giao dịch (mua đứt hoặc môi giới)';
  if (lot.commodityId !== exp.commodityId) return 'Lô mua và lô xuất phải cùng mặt hàng';
  if (exp.market === 'EU' && sector === 'ca_phe' && lot.eudrClass !== 'du') {
    return 'Cà phê đi EU phải là hàng đủ điều kiện EUDR: lô mua cần ghi thu gom bằng phiếu theo hộ và thửa, và mọi phiếu đều đạt';
  }
  if (quantityKg <= 0) return 'Khối lượng phân bổ phải lớn hơn 0';
  const left = Math.round((lot.availableKg - lot.allocatedKg) * 100) / 100;
  if (quantityKg > left + 0.005) return `Lô mua chỉ còn ${fmt(left)} kg chưa phân bổ`;
  return null;
}

/**
 * Nhà cung cấp chính của lô môi giới gom nhiều nguồn: người có khối lượng lớn nhất.
 * Hai người bằng nhau thì trả null để điều phối viên chọn.
 */
export function mainSupplier(rows: { supplierId: string; quantityKg: number }[]): string | null {
  const byS = new Map<string, number>();
  for (const r of rows) byS.set(r.supplierId, (byS.get(r.supplierId) ?? 0) + r.quantityKg);
  const sorted = [...byS.entries()].sort((a, b) => b[1] - a[1]);
  if (!sorted.length) return null;
  if (sorted.length > 1 && Math.abs(sorted[0][1] - sorted[1][1]) < 0.005) return null;
  return sorted[0][0];
}

/** Số ngày (làm tròn lên) đến mốc cut-off sớm nhất; null nếu chưa có. */
export function daysToCutoff(cutoffs: (Date | null)[], now = new Date()): number | null {
  const ds = cutoffs.filter((d): d is Date => !!d).map((d) => d.getTime());
  if (!ds.length) return null;
  return Math.ceil((Math.min(...ds) - now.getTime()) / 864e5);
}

/**
 * Đèn của lô trên bảng điều phối: đỏ khi còn ≤ 3 ngày đến cut-off (hoặc đã qua) mà lô chưa xếp tàu,
 * hoặc giám định gần nhất không đạt; vàng khi còn ≤ 7 ngày; còn lại xanh.
 */
export function signal(status: ExportLotStatus, days: number | null, inspectionFailed: boolean): 'do' | 'vang' | 'xanh' {
  const open = EXPORT_STEPS.indexOf(status as ExportStep) >= 0 && EXPORT_STEPS.indexOf(status as ExportStep) < EXPORT_STEPS.indexOf('xep_tau');
  if (!open) return 'xanh';
  if (inspectionFailed) return 'do';
  if (days !== null && days <= CUTOFF_WARNING_DAYS) return 'do';
  if (days !== null && days <= 7) return 'vang';
  return 'xanh';
}

function fmt(n: number) {
  return n.toLocaleString('vi-VN', { maximumFractionDigits: 2 });
}

/**
 * Quy tắc phiếu thu gom: trần sản lượng theo thửa, nhãn đủ EUDR, và không trộn hàng đủ với hàng không đủ trong một lô.
 * Viết thành hàm thuần để kiểm thử riêng.
 */

/** Khoá cài đặt năng suất tối đa (kg/ha/năm) theo ngành, do Ban Giám đốc đặt. */
export const YIELD_KEY = 'nang_suat_toi_da';
export const YIELD_SECTORS = ['ca_phe', 'gia_vi', 'thuy_san'] as const;
export type YieldSector = (typeof YIELD_SECTORS)[number];
export type YieldSetting = Record<YieldSector, number | null>;
export const EMPTY_YIELD: YieldSetting = { ca_phe: null, gia_vi: null, thuy_san: null };

/** Ngành thuộc EUDR trong phạm vi công ty (chỉ cà phê). */
export const EUDR_SECTORS: readonly string[] = ['ca_phe'];

/** Trần tính trên lượng thu gom từ thửa trong 365 ngày tính đến ngày thu hoạch. */
export const CAP_WINDOW_DAYS = 365;

export type EudrClass = 'du' | 'khong_du';

const fmt = (n: number) => n.toLocaleString('vi-VN', { maximumFractionDigits: 2 });

/** Mức năng suất dùng cho một vùng: mức riêng của vùng, nếu không có thì mức chung của ngành. */
export function yieldFor(areaOverride: number | null, setting: YieldSetting, sector: string): number | null {
  if (areaOverride !== null && areaOverride > 0) return areaOverride;
  const v = setting[sector as YieldSector];
  return v !== null && v !== undefined && v > 0 ? v : null;
}

/** Trần sản lượng của thửa (kg trong 12 tháng) = diện tích × năng suất tối đa. */
export function plotCapKg(areaHa: number, yieldKgPerHa: number | null): number | null {
  if (yieldKgPerHa === null) return null;
  return Math.round(areaHa * yieldKgPerHa * 100) / 100;
}

/**
 * Từ chối phiếu khi cộng thêm sẽ vượt trần. Khối lượng vượt trần là dấu hiệu hàng từ nơi khác gửi tên vào thửa
 * này, nên không ghi được; cần đo lại diện tích hoặc xin Ban Giám đốc nâng mức năng suất của vùng.
 */
export function capRefusal(capKg: number | null, usedKg: number, quantityKg: number): string | null {
  if (capKg === null) return null;
  const left = Math.round((capKg - usedKg) * 100) / 100;
  if (quantityKg > left + 0.005) {
    return `Thửa chỉ còn ${fmt(Math.max(left, 0))} kg trong trần 12 tháng (${fmt(capKg)} kg). Kiểm tra lại cân, diện tích thửa hoặc mức năng suất của vùng.`;
  }
  return null;
}

/** Lý do hàng của phiếu chưa đủ điều kiện EUDR. Danh sách rỗng là đủ. */
export function eudrReasons(input: { capKg: number | null; plotWarnings: string[]; forestStatus: string }): string[] {
  const out: string[] = [];
  if (input.forestStatus === 'co_rung') out.push('Thửa có rừng bị chặt hoặc suy thoái sau 31/12/2020');
  else if (input.forestStatus !== 'khong_rung') out.push('Thửa chưa có kết quả kiểm tra rừng đã được duyệt');
  if (input.capKg === null) out.push('Chưa có mức năng suất tối đa cho vùng này, nên chưa kiểm được sản lượng của thửa');
  if (input.plotWarnings.length > 0) out.push('Thửa còn cảnh báo chưa xử lý (chồng lấn hoặc diện tích lệch)');
  return out;
}

/** Không trộn hàng: lô đã định loại thì phiếu phải cùng loại. */
export function classRefusal(lotClass: string | null, slipClass: EudrClass): string | null {
  if (lotClass === null || lotClass === slipClass) return null;
  return lotClass === 'du'
    ? 'Lô này chỉ nhận hàng đủ điều kiện EUDR. Hàng của phiếu chưa đủ, hãy ghi vào một lô mua khác.'
    : 'Lô này đã có hàng không đủ điều kiện EUDR. Hàng đủ điều kiện phải vào lô riêng để giữ được nhãn.';
}

/** Ngày bắt đầu cửa sổ tính trần (YYYY-MM-DD). */
export function windowStart(harvestDate: string): string {
  const d = new Date(`${harvestDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - (CAP_WINDOW_DAYS - 1));
  return d.toISOString().slice(0, 10);
}

// ---------- Kiểm tra rừng ----------

/** Cách kiểm: bản đồ rừng 2020 của JRC (EU), Global Forest Watch, khảo sát thực địa, hoặc cách khác có mô tả. */
export const FOREST_METHODS = ['jrc_2020', 'gfw', 'khao_sat', 'khac'] as const;
export const FOREST_RESULTS = ['khong_rung', 'co_rung'] as const;

/**
 * Duyệt kết quả kiểm tra rừng (4 mắt): người duyệt khác người kiểm, phiếu đang chờ,
 * và tọa độ thửa chưa đổi kể từ lúc kiểm.
 */
export function forestReviewRefusal(check: { status: string; checkedBy: string; geometryHash: string }, reviewerId: string, currentGeometryHash: string): string | null {
  if (check.status !== 'cho_duyet') return 'Kết quả này không còn chờ duyệt';
  if (check.checkedBy === reviewerId) return 'Người kiểm không tự duyệt kết quả của mình';
  if (check.geometryHash !== currentGeometryHash) return 'Thửa đã được đo lại sau khi kiểm, cần kiểm lại theo tọa độ mới';
  return null;
}

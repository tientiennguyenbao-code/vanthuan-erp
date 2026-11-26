/**
 * Kế hoạch thu mua: so cung (hàng đang có + sản lượng ước tính) với cầu (báo giá bán đang chào, hợp đồng bán chưa giao)
 * theo tháng. Viết thành hàm thuần để kiểm thử riêng.
 */

export type PlanMarket = 'EU' | 'US' | 'CN' | 'KHAC';

/** 27 nước thành viên EU (mã ISO 2 chữ cái). */
export const EU_COUNTRIES: readonly string[] = [
  'AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR', 'DE', 'GR', 'HU', 'IE',
  'IT', 'LV', 'LT', 'LU', 'MT', 'NL', 'PL', 'PT', 'RO', 'SK', 'SI', 'ES', 'SE',
];

/** Thị trường theo nước của người mua; lô xuất đã lập thì dùng thị trường ghi trên lô. */
export function marketOfCountry(country: string | null | undefined): PlanMarket {
  const c = (country ?? '').toUpperCase();
  if (EU_COUNTRIES.includes(c)) return 'EU';
  if (c === 'US') return 'US';
  if (c === 'CN') return 'CN';
  return 'KHAC';
}

/** Số tháng kế hoạch nhìn tới, tính cả tháng hiện tại. */
export const PLAN_MONTHS = 12;
/** Ước tính được khai trước tối đa 24 tháng. */
export const ESTIMATE_MAX_AHEAD = 24;

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
export const isMonth = (m: string) => MONTH_RE.test(m);

export function currentMonth(now = new Date()): string {
  return now.toISOString().slice(0, 7);
}

export function addMonths(month: string, n: number): string {
  const [y, m] = month.split('-').map(Number);
  const i = y * 12 + (m - 1) + n;
  return `${Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, '0')}`;
}

export function monthsFrom(start: string, n: number): string[] {
  return Array.from({ length: n }, (_, i) => addMonths(start, i));
}

/**
 * Tháng ghi nhận một khoản cầu: chưa rõ tháng hoặc đã quá hạn thì tính vào tháng hiện tại (cần lo ngay);
 * sau khung kế hoạch thì trả null (không đưa vào bảng).
 */
export function bucketMonth(month: string | null | undefined, start: string, n = PLAN_MONTHS): string | null {
  if (!month || !isMonth(month) || month < start) return start;
  return month <= addMonths(start, n - 1) ? month : null;
}

const fmt = (n: number) => n.toLocaleString('vi-VN', { maximumFractionDigits: 0 });

/**
 * Ước tính sản lượng của một thửa không được vượt trần trong bất kỳ 12 tháng liên tiếp nào: ước tính quá trần là
 * hàng không thể có, và kinh doanh sẽ chào bán hàng không có thật.
 */
export function estimateCapRefusal(estimates: { month: string; kg: number }[], capKg: number | null): string | null {
  if (capKg === null) return null;
  for (const e of estimates) {
    const end = addMonths(e.month, 11);
    const sum = estimates.filter((x) => x.month >= e.month && x.month <= end).reduce((s, x) => s + x.kg, 0);
    if (sum > capKg + 0.005) {
      return `Ước tính từ ${e.month} đến ${end} cộng ${fmt(sum)} kg, vượt trần 12 tháng của thửa (${fmt(capKg)} kg). Giảm ước tính, hoặc đo lại diện tích thửa.`;
    }
  }
  return null;
}

export interface SupplyItem {
  month: string;
  kg: number;
  /** Đủ điều kiện EUDR (chỉ có nghĩa với cà phê) */
  eu: boolean;
}
export interface DemandItem {
  month: string;
  kg: number;
  market: PlanMarket;
  /** bao_gia | hop_dong_nhap | hop_dong_ky */
  kind: string;
}

export interface PlanRow {
  thang: string;
  cungUocTinhKg: number;
  cungUocTinhEuKg: number;
  cauBaoGiaKg: number;
  cauHopDongKg: number;
  cauEuKg: number;
  /** Cung luỹ kế (hàng đang có + ước tính đến hết tháng) trừ cầu luỹ kế */
  conLaiKg: number;
  /** Như trên nhưng chỉ hàng đủ EUDR so với cầu đi EU */
  conLaiEuKg: number;
}

const r = (n: number) => Math.round(n * 100) / 100;

/**
 * Bảng kế hoạch theo tháng. Hàng đang có tính vào tháng đầu. Với cà phê, cầu đi EU chỉ được đáp ứng bằng hàng đủ
 * EUDR, còn cầu đi Mỹ, Trung Quốc dùng được cả hai loại; nên có hai dòng còn lại: tổng và riêng EU.
 */
export function buildPlan(input: { months: string[]; stockKg: number; stockEuKg: number; supply: SupplyItem[]; demand: DemandItem[] }): PlanRow[] {
  let cung = input.stockKg;
  let cungEu = input.stockEuKg;
  let cau = 0;
  let cauEu = 0;
  return input.months.map((m) => {
    const s = input.supply.filter((x) => x.month === m);
    const d = input.demand.filter((x) => x.month === m);
    const sKg = s.reduce((a, x) => a + x.kg, 0);
    const sEu = s.filter((x) => x.eu).reduce((a, x) => a + x.kg, 0);
    const dQuote = d.filter((x) => x.kind === 'bao_gia').reduce((a, x) => a + x.kg, 0);
    const dContract = d.filter((x) => x.kind !== 'bao_gia').reduce((a, x) => a + x.kg, 0);
    const dEu = d.filter((x) => x.market === 'EU').reduce((a, x) => a + x.kg, 0);
    cung += sKg;
    cungEu += sEu;
    cau += dQuote + dContract;
    cauEu += dEu;
    return {
      thang: m,
      cungUocTinhKg: r(sKg),
      cungUocTinhEuKg: r(sEu),
      cauBaoGiaKg: r(dQuote),
      cauHopDongKg: r(dContract),
      cauEuKg: r(dEu),
      conLaiKg: r(cung - cau),
      conLaiEuKg: r(cungEu - cauEu),
    };
  });
}

/**
 * Cảnh báo khi báo giá bán cà phê sang EU chào nhiều hơn số hàng đủ EUDR còn trống (hàng đủ EUDR đang có và ước
 * tính trong khung kế hoạch, trừ cầu đi EU khác). Chỉ cảnh báo, không chặn: người bán vẫn có thể đi tìm thêm nguồn.
 */
export function eudrOfferWarning(availableKg: number, offerKg: number): string | null {
  if (offerKg <= availableKg + 0.005) return null;
  const con = Math.max(availableKg, 0);
  return `Báo giá chào ${fmt(offerKg)} kg cà phê sang EU, nhưng hàng đủ EUDR còn trống chỉ ${fmt(con)} kg (gồm hàng đang có và ước tính 12 tháng tới). Cần thêm nguồn đủ EUDR trước khi ký.`;
}

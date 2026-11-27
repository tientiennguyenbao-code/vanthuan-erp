/** Báo cáo kinh doanh theo tháng: các hàm thuần để gom số liệu, kiểm thử riêng được. */

const r2 = (n: number) => Math.round(n * 100) / 100;

/** Các nước EU (mã ISO 2 chữ) để quy hợp đồng về thị trường theo nước người mua. */
const EU = new Set(['AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR', 'DE', 'GR', 'HU', 'IE', 'IT', 'LV', 'LT', 'LU', 'MT', 'NL', 'PL', 'PT', 'RO', 'SK', 'SI', 'ES', 'SE']);

/** Thị trường theo nước người mua: US, EU, CN; nước khác thì "khac". */
export function marketOfCountry(country: string | null | undefined): string {
  const c = (country ?? '').toUpperCase();
  if (c === 'US') return 'US';
  if (c === 'CN') return 'CN';
  if (EU.has(c)) return 'EU';
  return 'khac';
}

/** Tháng YYYY-MM theo giờ Việt Nam của một thời điểm. */
export function monthVn(at: Date | string): string {
  const d = typeof at === 'string' ? new Date(at.length === 10 ? `${at}T00:00:00+07:00` : at) : at;
  return new Date(d.getTime() + 7 * 3600e3).toISOString().slice(0, 7);
}

/** Danh sách tháng từ..đến (gồm cả hai đầu). */
export function monthsBetween(from: string, to: string): string[] {
  const out: string[] = [];
  let [y, m] = from.split('-').map(Number);
  const [ty, tm] = to.split('-').map(Number);
  while (y < ty || (y === ty && m <= tm)) {
    out.push(`${y}-${String(m).padStart(2, '0')}`);
    m++;
    if (m > 12) {
      m = 1;
      y++;
    }
  }
  return out;
}

export function addMonths(month: string, n: number): string {
  const [y, m] = month.split('-').map(Number);
  const i = y * 12 + (m - 1) + n;
  return `${Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, '0')}`;
}

export interface SignedFact { month: string; sector: string; market: string; buyerId: string; buyerName: string; valueUsd: number | null }
export interface ShippedFact { month: string; sector: string; market: string; buyerId: string; buyerName: string; kg: number; valueUsd: number | null }
export interface InquiryFact { month: string; status: string }
export interface QuoteFact { month: string; status: string }

export interface Bucket {
  hopDong: { so: number; giaTriUsd: number };
  giaoHang: { soLo: number; kg: number; giaTriUsd: number };
}
const emptyBucket = (): Bucket => ({ hopDong: { so: 0, giaTriUsd: 0 }, giaoHang: { soLo: 0, kg: 0, giaTriUsd: 0 } });

function addSigned(b: Bucket, f: SignedFact) {
  b.hopDong.so++;
  b.hopDong.giaTriUsd = r2(b.hopDong.giaTriUsd + (f.valueUsd ?? 0));
}
function addShipped(b: Bucket, f: ShippedFact) {
  b.giaoHang.soLo++;
  b.giaoHang.kg = r2(b.giaoHang.kg + f.kg);
  b.giaoHang.giaTriUsd = r2(b.giaoHang.giaTriUsd + (f.valueUsd ?? 0));
}

/** Tỷ lệ thắng (%) = thắng / (thắng + thua); chưa có kết quả thì null. */
export function winRate(won: number, lost: number): number | null {
  return won + lost === 0 ? null : Math.round((won / (won + lost)) * 1000) / 10;
}

export function buildReport(input: { months: string[]; signed: SignedFact[]; shipped: ShippedFact[]; inquiries: InquiryFact[]; quotes: QuoteFact[] }) {
  const inRange = new Set(input.months);
  const signed = input.signed.filter((f) => inRange.has(f.month));
  const shipped = input.shipped.filter((f) => inRange.has(f.month));
  const inquiries = input.inquiries.filter((f) => inRange.has(f.month));
  const quotes = input.quotes.filter((f) => inRange.has(f.month));

  const thang = input.months.map((m) => {
    const b = emptyBucket();
    signed.filter((f) => f.month === m).forEach((f) => addSigned(b, f));
    shipped.filter((f) => f.month === m).forEach((f) => addShipped(b, f));
    const iq = inquiries.filter((f) => f.month === m);
    const qt = quotes.filter((f) => f.month === m);
    return {
      thang: m,
      ...b,
      hoiHang: { tong: iq.length, thang: iq.filter((f) => f.status === 'thang').length, thua: iq.filter((f) => f.status === 'thua').length },
      baoGia: { daGui: qt.length, chapNhan: qt.filter((f) => f.status === 'chap_nhan').length, tuChoi: qt.filter((f) => f.status === 'tu_choi').length },
    };
  });

  const group = <K extends string>(key: (f: SignedFact | ShippedFact) => K, label: (f: SignedFact | ShippedFact) => string) => {
    const map = new Map<K, Bucket & { ma: K; ten: string }>();
    const get = (f: SignedFact | ShippedFact) => {
      const k = key(f);
      if (!map.has(k)) map.set(k, { ma: k, ten: label(f), ...emptyBucket() });
      return map.get(k)!;
    };
    signed.forEach((f) => addSigned(get(f), f));
    shipped.forEach((f) => addShipped(get(f), f));
    return [...map.values()].sort((a, b) => b.hopDong.giaTriUsd + b.giaoHang.giaTriUsd - (a.hopDong.giaTriUsd + a.giaoHang.giaTriUsd));
  };

  const sum = (pick: (t: (typeof thang)[number]) => number) => r2(thang.reduce((a, t) => a + pick(t), 0));
  const won = sum((t) => t.hoiHang.thang);
  const lost = sum((t) => t.hoiHang.thua);
  const qWon = sum((t) => t.baoGia.chapNhan);
  const qLost = sum((t) => t.baoGia.tuChoi);
  return {
    thang,
    tong: {
      hopDong: { so: sum((t) => t.hopDong.so), giaTriUsd: sum((t) => t.hopDong.giaTriUsd) },
      giaoHang: { soLo: sum((t) => t.giaoHang.soLo), kg: sum((t) => t.giaoHang.kg), giaTriUsd: sum((t) => t.giaoHang.giaTriUsd) },
      hoiHang: { tong: sum((t) => t.hoiHang.tong), thang: won, thua: lost, tyLeThangPhanTram: winRate(won, lost) },
      baoGia: { daGui: sum((t) => t.baoGia.daGui), chapNhan: qWon, tuChoi: qLost, tyLeThangPhanTram: winRate(qWon, qLost) },
    },
    theoNganh: group((f) => f.sector, (f) => f.sector),
    theoThiTruong: group((f) => f.market, (f) => f.market),
    theoNguoiMua: group((f) => f.buyerId, (f) => f.buyerName),
    thieuTyGia: signed.filter((f) => f.valueUsd === null).length + shipped.filter((f) => f.valueUsd === null).length,
  };
}

/**
 * Quy tắc thuần cho hồ sơ nguồn cung: tọa độ thửa, diện tích, chồng lấn, số giấy tờ của nông hộ.
 * Không đụng cơ sở dữ liệu để kiểm thử nhanh và dễ đọc.
 *
 * Tọa độ theo hệ WGS84 dạng GeoJSON: [kinh độ, vĩ độ], làm tròn 6 chữ số thập phân (khoảng 0,1 m),
 * đúng mức EUDR yêu cầu. Thửa trên 4 ha phải vẽ ranh giới (đa giác); thửa từ 4 ha trở xuống được
 * phép chỉ ghi một điểm.
 */

export const AREA_KINDS = ['vung_trong', 'vung_nuoi'] as const;
export type AreaKind = (typeof AREA_KINDS)[number];
export const PLOT_KINDS = ['thua', 'ao'] as const;
export type PlotKind = (typeof PLOT_KINDS)[number];
export const SECTORS = ['ca_phe', 'gia_vi', 'thuy_san'] as const;

/** EUDR: từ ngưỡng này trở lên phải có đa giác ranh giới. */
export const EUDR_POINT_MAX_HA = 4;
/** Một thửa hay ao lớn hơn mức này gần như chắc là nhập sai. */
export const PLOT_MAX_HA = 500;
/** Hai điểm cách nhau dưới mức này coi như cùng một chỗ. */
export const SAME_SPOT_M = 10;
/** Diện tích khai và diện tích đo từ ranh giới lệch quá mức này thì cảnh báo. */
export const AREA_MISMATCH_RATIO = 0.2;

export type LonLat = [number, number];
export type PlotGeometry = { type: 'Point'; coordinates: LonLat } | { type: 'Polygon'; coordinates: LonLat[][] };

/** Khung bao lãnh thổ Việt Nam (gồm các đảo), để bắt lỗi đảo kinh độ và vĩ độ. */
const VN_BOX = { minLon: 102.1, maxLon: 117.9, minLat: 8.0, maxLat: 23.4 };

const EARTH_RADIUS_M = 6378137;
const rad = (d: number) => (d * Math.PI) / 180;
const round6 = (n: number) => Math.round(n * 1e6) / 1e6;
/** Số ha viết kiểu Việt Nam: 5,17 */
const soHa = (n: number) => (Math.round(n * 100) / 100).toString().replace('.', ',');

export class SourcingRuleError extends Error {}

function toLonLat(raw: unknown, where: string): LonLat {
  if (!Array.isArray(raw) || raw.length < 2) throw new SourcingRuleError(`${where}: tọa độ phải có kinh độ và vĩ độ`);
  const [lon, lat] = raw as unknown[];
  if (typeof lon !== 'number' || typeof lat !== 'number' || !Number.isFinite(lon) || !Number.isFinite(lat)) {
    throw new SourcingRuleError(`${where}: kinh độ và vĩ độ phải là số`);
  }
  if (lon < -180 || lon > 180 || lat < -90 || lat > 90) throw new SourcingRuleError(`${where}: tọa độ nằm ngoài trái đất`);
  return [round6(lon), round6(lat)];
}

function insideVietnam([lon, lat]: LonLat): boolean {
  return lon >= VN_BOX.minLon && lon <= VN_BOX.maxLon && lat >= VN_BOX.minLat && lat <= VN_BOX.maxLat;
}

function samePoint(a: LonLat, b: LonLat): boolean {
  return a[0] === b[0] && a[1] === b[1];
}

/** a→b→c rẽ trái (>0), rẽ phải (<0) hay thẳng hàng (0). */
function orient(a: LonLat, b: LonLat, c: LonLat): number {
  return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
}

function segmentsCross(p1: LonLat, p2: LonLat, q1: LonLat, q2: LonLat): boolean {
  const d1 = orient(q1, q2, p1);
  const d2 = orient(q1, q2, p2);
  const d3 = orient(p1, p2, q1);
  const d4 = orient(p1, p2, q2);
  return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0));
}

/** Ranh giới tự cắt (hình số 8) là dấu hiệu bấm sai thứ tự góc thửa. */
export function selfIntersects(ring: LonLat[]): boolean {
  const n = ring.length - 1; // vòng đã khép: điểm cuối trùng điểm đầu
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (Math.abs(i - j) <= 1 || (i === 0 && j === n - 1)) continue; // cạnh kề nhau
      if (segmentsCross(ring[i], ring[i + 1], ring[j], ring[j + 1])) return true;
    }
  }
  return false;
}

/** Diện tích (ha) của một vòng ranh giới trên mặt cầu, cùng công thức với các thư viện bản đồ phổ biến. */
export function ringAreaHa(ring: LonLat[]): number {
  const n = ring.length;
  if (n < 4) return 0;
  let total = 0;
  for (let i = 0; i < n - 1; i++) {
    const p1 = ring[i];
    const p2 = ring[(i + 1) % (n - 1)];
    const p3 = ring[(i + 2) % (n - 1)];
    total += (rad(p3[0]) - rad(p1[0])) * Math.sin(rad(p2[1]));
  }
  return Math.abs((total * EARTH_RADIUS_M * EARTH_RADIUS_M) / 2) / 10_000;
}

/** Khoảng cách (m) giữa hai điểm theo đường tròn lớn. */
export function distanceM(a: LonLat, b: LonLat): number {
  const dLat = rad(b[1] - a[1]);
  const dLon = rad(b[0] - a[0]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a[1])) * Math.cos(rad(b[1])) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(h));
}

export function pointInRing(pt: LonLat, ring: LonLat[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > pt[1] !== yj > pt[1] && pt[0] < ((xj - xi) * (pt[1] - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/**
 * Kiểm tra và chuẩn hoá tọa độ gửi lên (GeoJSON Point hoặc Polygon một vòng).
 * `inVietnam`: nhà cung cấp ở Việt Nam thì mọi điểm phải nằm trong lãnh thổ Việt Nam.
 */
export function normalizeGeometry(raw: unknown, opts: { inVietnam: boolean }): PlotGeometry {
  const g = raw as { type?: unknown; coordinates?: unknown };
  if (!g || typeof g !== 'object') throw new SourcingRuleError('Thiếu tọa độ');
  if (g.type === 'Point') {
    const p = toLonLat(g.coordinates, 'Điểm');
    if (opts.inVietnam && !insideVietnam(p)) throw new SourcingRuleError('Điểm nằm ngoài Việt Nam. Kiểm tra lại có bị đảo kinh độ và vĩ độ không');
    return { type: 'Point', coordinates: p };
  }
  if (g.type === 'Polygon') {
    if (!Array.isArray(g.coordinates) || g.coordinates.length === 0) throw new SourcingRuleError('Ranh giới trống');
    if (g.coordinates.length > 1) throw new SourcingRuleError('Ranh giới chỉ được có một vòng ngoài, không có lỗ bên trong');
    const rawRing = g.coordinates[0];
    if (!Array.isArray(rawRing)) throw new SourcingRuleError('Ranh giới không đúng định dạng');
    if (rawRing.length > 2000) throw new SourcingRuleError('Ranh giới quá nhiều điểm (tối đa 2.000)');
    const ring = rawRing.map((c, i) => toLonLat(c, `Góc ${i + 1}`));
    // bỏ các điểm bấm trùng liên tiếp
    const dedup = ring.filter((p, i) => i === 0 || !samePoint(p, ring[i - 1]));
    if (!samePoint(dedup[0], dedup[dedup.length - 1])) dedup.push(dedup[0]);
    if (dedup.length < 4) throw new SourcingRuleError('Ranh giới cần ít nhất 3 góc khác nhau');
    if (opts.inVietnam && dedup.some((p) => !insideVietnam(p))) throw new SourcingRuleError('Có góc nằm ngoài Việt Nam. Kiểm tra lại có bị đảo kinh độ và vĩ độ không');
    if (selfIntersects(dedup)) throw new SourcingRuleError('Ranh giới tự cắt nhau. Bấm các góc lần lượt theo một chiều quanh thửa');
    if (ringAreaHa(dedup) <= 0) throw new SourcingRuleError('Ranh giới không có diện tích');
    return { type: 'Polygon', coordinates: [dedup] };
  }
  throw new SourcingRuleError('Tọa độ phải là một điểm (Point) hoặc một ranh giới (Polygon)');
}

export interface PlotCheck {
  /** Diện tích dùng cho mọi tính toán: đo từ ranh giới nếu có, ngược lại là diện tích khai. */
  areaHa: number;
  measuredAreaHa: number | null;
  errors: string[];
  warnings: string[];
}

/** Quy tắc EUDR về điểm và đa giác, cùng các kiểm tra hợp lý về diện tích. */
export function checkPlot(geometry: PlotGeometry, declaredAreaHa: number | null | undefined): PlotCheck {
  const errors: string[] = [];
  const warnings: string[] = [];
  let measured: number | null = null;
  let areaHa: number;
  if (geometry.type === 'Point') {
    if (declaredAreaHa === null || declaredAreaHa === undefined || !(declaredAreaHa > 0)) {
      errors.push('Thửa chỉ có một điểm thì phải ghi diện tích');
      areaHa = 0;
    } else {
      areaHa = declaredAreaHa;
      if (declaredAreaHa > EUDR_POINT_MAX_HA) errors.push(`Thửa trên ${EUDR_POINT_MAX_HA} ha phải vẽ ranh giới (đa giác), không được chỉ ghi một điểm`);
    }
  } else {
    measured = Math.round(ringAreaHa(geometry.coordinates[0]) * 10_000) / 10_000;
    areaHa = measured;
    if (declaredAreaHa && Math.abs(declaredAreaHa - measured) / measured > AREA_MISMATCH_RATIO) {
      warnings.push(`Diện tích khai ${soHa(declaredAreaHa)} ha lệch hơn ${AREA_MISMATCH_RATIO * 100}% so với diện tích đo từ ranh giới ${soHa(measured)} ha`);
    }
  }
  if (areaHa > PLOT_MAX_HA) errors.push(`Diện tích ${areaHa} ha quá lớn cho một thửa, kiểm tra lại`);
  return { areaHa, measuredAreaHa: measured, errors, warnings };
}

export interface ExistingPlot {
  id: string;
  code: string;
  geometry: PlotGeometry;
}

function points(g: PlotGeometry): LonLat[] {
  return g.type === 'Point' ? [g.coordinates] : g.coordinates[0].slice(0, -1);
}

/** Hai thửa có chồng lên nhau không (gần đúng: điểm trùng chỗ, điểm hay góc nằm trong ranh giới thửa kia). */
export function overlaps(a: PlotGeometry, b: PlotGeometry): boolean {
  if (a.type === 'Point' && b.type === 'Point') return distanceM(a.coordinates, b.coordinates) < SAME_SPOT_M;
  const inB = (p: LonLat) => b.type === 'Polygon' && pointInRing(p, b.coordinates[0]);
  const inA = (p: LonLat) => a.type === 'Polygon' && pointInRing(p, a.coordinates[0]);
  if (points(a).some(inB) || points(b).some(inA)) return true;
  if (a.type === 'Polygon' && b.type === 'Polygon') {
    const ra = a.coordinates[0];
    const rb = b.coordinates[0];
    for (let i = 0; i < ra.length - 1; i++) for (let j = 0; j < rb.length - 1; j++) if (segmentsCross(ra[i], ra[i + 1], rb[j], rb[j + 1])) return true;
  }
  return false;
}

/** Danh sách mã thửa khác bị chồng lấn, để cảnh báo nhân viên kiểm tra (một mảnh đất bị khai hai lần). */
export function findOverlaps(geometry: PlotGeometry, others: ExistingPlot[], selfId?: string): string[] {
  return others.filter((o) => o.id !== selfId && overlaps(geometry, o.geometry)).map((o) => o.code);
}

/** Tâm gần đúng của thửa, để mở bản đồ. */
export function centroid(g: PlotGeometry): LonLat {
  const pts = points(g);
  return [round6(pts.reduce((s, p) => s + p[0], 0) / pts.length), round6(pts.reduce((s, p) => s + p[1], 0) / pts.length)];
}

// ---------- Nông hộ ----------

/** Căn cước công dân 12 số, hoặc chứng minh nhân dân cũ 9 số. */
export function normalizeIdNumber(raw: string): string {
  const v = raw.replace(/[\s.-]/g, '');
  if (!/^(\d{9}|\d{12})$/.test(v)) throw new SourcingRuleError('Số CCCD phải có 12 chữ số (hoặc CMND cũ 9 chữ số)');
  return v;
}

/** Chỉ hiện 4 số cuối. */
export function maskIdNumber(last4: string | null): string | null {
  return last4 ? `••••••••${last4}` : null;
}

// ---------- Xuất GeoJSON cho EUDR ----------

export interface PlotForExport {
  code: string;
  farmerCode: string;
  areaCode: string;
  kind: string;
  areaHa: number;
  crop: string | null;
  geometry: PlotGeometry;
}

/**
 * Tập GeoJSON theo đúng dạng hệ thống EUDR nhận: mỗi thửa một đối tượng, kèm diện tích (ha) và quốc gia.
 * Không kèm tên hay số giấy tờ của nông hộ: người mua chỉ cần vị trí và mã thửa.
 */
export function toFeatureCollection(plots: PlotForExport[]) {
  return {
    type: 'FeatureCollection' as const,
    features: plots.map((p) => ({
      type: 'Feature' as const,
      properties: { ProducerCountry: 'VN', ProductionPlace: p.code, Area: p.areaHa, maHo: p.farmerCode, maVung: p.areaCode, loai: p.kind, cayTrong: p.crop },
      geometry: p.geometry,
    })),
  };
}

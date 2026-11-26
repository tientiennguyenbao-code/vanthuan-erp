import {
  centroid,
  checkPlot,
  distanceM,
  findOverlaps,
  maskIdNumber,
  normalizeGeometry,
  normalizeIdNumber,
  PlotGeometry,
  ringAreaHa,
  SourcingRuleError,
  toFeatureCollection,
} from './sourcing.rules';

// Một thửa vuông khoảng 200 m × 200 m (≈ 4 ha) ở Buôn Ma Thuột
const lon0 = 108.05;
const lat0 = 12.68;
const dLat = 200 / 111_320; // độ vĩ cho 200 m
const dLon = 200 / (111_320 * Math.cos((lat0 * Math.PI) / 180));
const square = (x = lon0, y = lat0, sx = dLon, sy = dLat) => [
  [x, y],
  [x + sx, y],
  [x + sx, y + sy],
  [x, y + sy],
  [x, y],
];
const vn = { inVietnam: true };

describe('Tọa độ thửa', () => {
  it('nhận một điểm và làm tròn 6 chữ số thập phân', () => {
    const g = normalizeGeometry({ type: 'Point', coordinates: [108.123456789, 12.987654321] }, vn);
    expect(g).toEqual({ type: 'Point', coordinates: [108.123457, 12.987654] });
  });

  it('bắt lỗi đảo kinh độ và vĩ độ (điểm rơi ra ngoài Việt Nam)', () => {
    expect(() => normalizeGeometry({ type: 'Point', coordinates: [12.68, 108.05] }, vn)).toThrow(/ngoài trái đất|ngoài Việt Nam/);
    expect(() => normalizeGeometry({ type: 'Point', coordinates: [100.5, 13.7] }, vn)).toThrow(/ngoài Việt Nam/);
    // nhà cung cấp nước ngoài thì không bắt buộc ở Việt Nam
    expect(normalizeGeometry({ type: 'Point', coordinates: [100.5, 13.7] }, { inVietnam: false }).type).toBe('Point');
  });

  it('tự khép ranh giới và bỏ điểm bấm trùng liên tiếp', () => {
    const ring = square().slice(0, 4);
    const withDup = [ring[0], ring[1], ring[1], ring[2], ring[3]];
    const g = normalizeGeometry({ type: 'Polygon', coordinates: [withDup] }, vn) as Extract<PlotGeometry, { type: 'Polygon' }>;
    expect(g.coordinates[0]).toHaveLength(5);
    expect(g.coordinates[0][0]).toEqual(g.coordinates[0][4]);
  });

  it('từ chối ranh giới tự cắt (bấm sai thứ tự góc)', () => {
    const [a, b, c, d] = square();
    expect(() => normalizeGeometry({ type: 'Polygon', coordinates: [[a, c, b, d, a]] }, vn)).toThrow(/tự cắt/);
  });

  it('từ chối ranh giới dưới 3 góc, có lỗ, hay sai định dạng', () => {
    const [a, b] = square();
    expect(() => normalizeGeometry({ type: 'Polygon', coordinates: [[a, b, a]] }, vn)).toThrow(/3 góc/);
    expect(() => normalizeGeometry({ type: 'Polygon', coordinates: [square(), square()] }, vn)).toThrow(/một vòng/);
    expect(() => normalizeGeometry({ type: 'LineString', coordinates: [a, b] }, vn)).toThrow(/Point|Polygon/);
    expect(() => normalizeGeometry({ type: 'Point', coordinates: ['108', 12] }, vn)).toThrow(/là số/);
  });

  it('đo diện tích ranh giới gần đúng (200 m × 200 m ≈ 4 ha)', () => {
    const ha = ringAreaHa(square() as [number, number][]);
    expect(ha).toBeGreaterThan(3.95);
    expect(ha).toBeLessThan(4.05);
  });

  it('khoảng cách giữa hai điểm', () => {
    expect(distanceM([lon0, lat0], [lon0, lat0 + dLat])).toBeCloseTo(200, -1);
  });
});

describe('Quy tắc EUDR về điểm và đa giác', () => {
  const pt = normalizeGeometry({ type: 'Point', coordinates: [lon0, lat0] }, vn);
  it('thửa từ 4 ha trở xuống được ghi một điểm, phải có diện tích', () => {
    expect(checkPlot(pt, 3.5)).toMatchObject({ areaHa: 3.5, errors: [] });
    expect(checkPlot(pt, 4)).toMatchObject({ errors: [] });
    expect(checkPlot(pt, null).errors[0]).toMatch(/phải ghi diện tích/);
  });

  it('thửa trên 4 ha bắt buộc vẽ ranh giới', () => {
    expect(checkPlot(pt, 4.01).errors[0]).toMatch(/phải vẽ ranh giới/);
  });

  it('đa giác dùng diện tích đo, cảnh báo khi diện tích khai lệch quá 20%', () => {
    const poly = normalizeGeometry({ type: 'Polygon', coordinates: [square()] }, vn);
    const ok = checkPlot(poly, 4);
    expect(ok.errors).toEqual([]);
    expect(ok.warnings).toEqual([]);
    expect(ok.measuredAreaHa).toBeCloseTo(4, 1);
    expect(checkPlot(poly, 6).warnings[0]).toMatch(/lệch/);
  });

  it('từ chối thửa lớn bất thường', () => {
    expect(checkPlot(pt, 900).errors.some((e) => /quá lớn/.test(e))).toBe(true);
  });
});

describe('Chồng lấn giữa các thửa', () => {
  const A = { id: 'a', code: 'A', geometry: normalizeGeometry({ type: 'Polygon', coordinates: [square()] }, vn) };
  const B = { id: 'b', code: 'B', geometry: normalizeGeometry({ type: 'Point', coordinates: [lon0 + 3 * dLon, lat0] }, vn) };

  it('điểm nằm trong ranh giới thửa khác', () => {
    const inside = normalizeGeometry({ type: 'Point', coordinates: [lon0 + dLon / 2, lat0 + dLat / 2] }, vn);
    expect(findOverlaps(inside, [A, B])).toEqual(['A']);
  });

  it('hai điểm cách nhau dưới 10 m', () => {
    const near = normalizeGeometry({ type: 'Point', coordinates: [lon0 + 3 * dLon + 0.00002, lat0] }, vn);
    expect(findOverlaps(near, [A, B])).toEqual(['B']);
  });

  it('hai ranh giới cắt nhau, và không tự báo trùng với chính mình', () => {
    const shifted = normalizeGeometry({ type: 'Polygon', coordinates: [square(lon0 + dLon / 2, lat0 + dLat / 2)] }, vn);
    expect(findOverlaps(shifted, [A, B])).toEqual(['A']);
    expect(findOverlaps(A.geometry, [A, B], 'a')).toEqual([]);
  });

  it('thửa tách biệt thì không cảnh báo', () => {
    const far = normalizeGeometry({ type: 'Polygon', coordinates: [square(lon0 + 10 * dLon, lat0)] }, vn);
    expect(findOverlaps(far, [A, B])).toEqual([]);
  });

  it('tâm thửa', () => {
    const c = centroid(A.geometry);
    expect(c[0]).toBeCloseTo(lon0 + dLon / 2, 5);
  });
});

describe('Nông hộ và xuất GeoJSON', () => {
  it('số CCCD 12 số hoặc CMND 9 số, bỏ dấu cách', () => {
    expect(normalizeIdNumber('066 123 456 789')).toBe('066123456789');
    expect(normalizeIdNumber('241234567')).toBe('241234567');
    expect(() => normalizeIdNumber('12345')).toThrow(SourcingRuleError);
    expect(maskIdNumber('6789')).toBe('••••••••6789');
  });

  it('GeoJSON không chứa tên hay số giấy tờ của nông hộ', () => {
    const fc = toFeatureCollection([{ code: 'V1-001', farmerCode: 'H001', areaCode: 'V1', kind: 'thua', areaHa: 2, crop: 'Robusta', geometry: { type: 'Point', coordinates: [lon0, lat0] } }]);
    expect(fc.type).toBe('FeatureCollection');
    expect(fc.features[0].properties).toMatchObject({ ProducerCountry: 'VN', ProductionPlace: 'V1-001', Area: 2 });
    expect(JSON.stringify(fc)).not.toMatch(/hoTen|cccd/i);
  });
});

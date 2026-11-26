import { capRefusal, forestReviewRefusal, classRefusal, EMPTY_YIELD, eudrReasons, plotCapKg, windowStart, yieldFor } from './collection.rules';

describe('phiếu thu gom: trần sản lượng và nhãn EUDR', () => {
  it('mức năng suất: vùng có mức riêng thì dùng mức riêng, không thì mức chung của ngành', () => {
    const chung = { ...EMPTY_YIELD, ca_phe: 3500 };
    expect(yieldFor(null, chung, 'ca_phe')).toBe(3500);
    expect(yieldFor(5000, chung, 'ca_phe')).toBe(5000);
    expect(yieldFor(null, chung, 'gia_vi')).toBeNull();
    expect(yieldFor(0, EMPTY_YIELD, 'ca_phe')).toBeNull();
  });

  it('trần = diện tích × năng suất; chưa có năng suất thì chưa có trần', () => {
    expect(plotCapKg(2.5, 3500)).toBe(8750);
    expect(plotCapKg(2.5, null)).toBeNull();
  });

  it('từ chối phiếu làm vượt trần, báo còn bao nhiêu', () => {
    expect(capRefusal(8750, 8000, 750)).toBeNull();
    expect(capRefusal(8750, 8000, 751)).toMatch(/chỉ còn 750 kg/);
    expect(capRefusal(8750, 9000, 1)).toMatch(/chỉ còn 0 kg/);
    expect(capRefusal(null, 1e9, 1e6)).toBeNull();
  });

  it('chưa có năng suất hoặc thửa còn cảnh báo thì hàng chưa đủ EUDR', () => {
    const ok = { capKg: 8750, plotWarnings: [], forestStatus: 'khong_rung' };
    expect(eudrReasons(ok)).toEqual([]);
    expect(eudrReasons({ ...ok, capKg: null })[0]).toMatch(/năng suất/);
    expect(eudrReasons({ ...ok, plotWarnings: ['Chồng lấn'] })[0]).toMatch(/cảnh báo/);
    expect(eudrReasons({ ...ok, forestStatus: 'chua_kiem' })[0]).toMatch(/chưa có kết quả kiểm tra rừng/);
    expect(eudrReasons({ ...ok, forestStatus: 'cho_duyet' })[0]).toMatch(/chưa có kết quả kiểm tra rừng/);
    expect(eudrReasons({ ...ok, forestStatus: 'co_rung' })[0]).toMatch(/sau 31\/12\/2020/);
  });

  it('không trộn hàng đủ và không đủ EUDR trong một lô', () => {
    expect(classRefusal(null, 'du')).toBeNull();
    expect(classRefusal('du', 'du')).toBeNull();
    expect(classRefusal('du', 'khong_du')).toMatch(/chỉ nhận hàng đủ/);
    expect(classRefusal('khong_du', 'du')).toMatch(/lô riêng/);
  });

  it('cửa sổ tính trần là 365 ngày tính đến ngày thu hoạch', () => {
    expect(windowStart('2026-11-15')).toBe('2025-11-16');
  });

  it('duyệt kiểm tra rừng: 4 mắt, đúng tọa độ lúc kiểm', () => {
    const c = { status: 'cho_duyet', checkedBy: 'a', geometryHash: 'h1' };
    expect(forestReviewRefusal(c, 'b', 'h1')).toBeNull();
    expect(forestReviewRefusal(c, 'a', 'h1')).toMatch(/không tự duyệt/);
    expect(forestReviewRefusal(c, 'b', 'h2')).toMatch(/đo lại/);
    expect(forestReviewRefusal({ ...c, status: 'da_duyet' }, 'b', 'h1')).toMatch(/không còn chờ/);
  });
});

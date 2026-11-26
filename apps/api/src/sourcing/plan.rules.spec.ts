import { addMonths, bucketMonth, buildPlan, estimateCapRefusal, eudrOfferWarning, marketOfCountry, monthsFrom } from './plan.rules';

describe('kế hoạch thu mua', () => {
  it('thị trường theo nước người mua', () => {
    expect(marketOfCountry('DE')).toBe('EU');
    expect(marketOfCountry('nl')).toBe('EU');
    expect(marketOfCountry('US')).toBe('US');
    expect(marketOfCountry('CN')).toBe('CN');
    expect(marketOfCountry('GB')).toBe('KHAC');
    expect(marketOfCountry(null)).toBe('KHAC');
  });

  it('cộng tháng qua năm', () => {
    expect(addMonths('2026-11', 2)).toBe('2027-01');
    expect(addMonths('2027-01', -1)).toBe('2026-12');
    expect(monthsFrom('2026-11', 3)).toEqual(['2026-11', '2026-12', '2027-01']);
  });

  it('tháng chưa rõ hoặc đã qua tính vào tháng hiện tại; sau khung kế hoạch thì bỏ', () => {
    expect(bucketMonth(null, '2026-11')).toBe('2026-11');
    expect(bucketMonth('2026-08', '2026-11')).toBe('2026-11');
    expect(bucketMonth('2027-03', '2026-11')).toBe('2027-03');
    expect(bucketMonth('2027-10', '2026-11')).toBe('2027-10');
    expect(bucketMonth('2027-11', '2026-11')).toBeNull();
  });

  it('ước tính không vượt trần trong bất kỳ 12 tháng liên tiếp nào', () => {
    expect(estimateCapRefusal([{ month: '2026-12', kg: 4000 }, { month: '2027-03', kg: 2000 }], 6000)).toBeNull();
    expect(estimateCapRefusal([{ month: '2026-12', kg: 4000 }, { month: '2027-03', kg: 2500 }], 6000)).toMatch(/vượt trần/);
    // Hai vụ cách nhau hơn 12 tháng thì không cộng chung
    expect(estimateCapRefusal([{ month: '2026-12', kg: 5000 }, { month: '2027-12', kg: 5000 }], 6000)).toBeNull();
    expect(estimateCapRefusal([{ month: '2026-12', kg: 50_000 }], null)).toBeNull();
  });

  it('bảng luỹ kế: hàng đang có vào tháng đầu, cầu EU chỉ trừ vào hàng đủ EUDR', () => {
    const rows = buildPlan({
      months: ['2026-11', '2026-12', '2027-01'],
      stockKg: 10_000,
      stockEuKg: 4000,
      supply: [
        { month: '2026-12', kg: 20_000, eu: true },
        { month: '2026-12', kg: 5000, eu: false },
      ],
      demand: [
        { month: '2026-11', kg: 6000, market: 'EU', kind: 'hop_dong_ky' },
        { month: '2027-01', kg: 19_200, market: 'US', kind: 'bao_gia' },
      ],
    });
    expect(rows[0]).toMatchObject({ cauHopDongKg: 6000, cauEuKg: 6000, conLaiKg: 4000, conLaiEuKg: -2000 });
    expect(rows[1]).toMatchObject({ cungUocTinhKg: 25_000, cungUocTinhEuKg: 20_000, conLaiKg: 29_000, conLaiEuKg: 18_000 });
    expect(rows[2]).toMatchObject({ cauBaoGiaKg: 19_200, conLaiKg: 9800, conLaiEuKg: 18_000 });
  });

  it('cảnh báo chào vượt hàng đủ EUDR', () => {
    expect(eudrOfferWarning(20_000, 19_200)).toBeNull();
    expect(eudrOfferWarning(10_000, 19_200)).toMatch(/còn trống chỉ 10\.000 kg/);
    expect(eudrOfferWarning(-500, 1000)).toMatch(/còn trống chỉ 0 kg/);
  });
});

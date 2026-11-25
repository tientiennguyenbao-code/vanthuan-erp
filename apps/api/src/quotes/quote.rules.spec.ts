import { costKindsFor, isQuoteExpired, saleSummary, usdPerKg } from './quote.rules';

describe('Quy tắc báo giá', () => {
  it('gợi ý chi phí theo Incoterms', () => {
    expect(costKindsFor('EXW')).toEqual([]);
    expect(costKindsFor('FOB')).toEqual(['van_tai_noi_dia', 'thu_tuc_xuat_khau', 'xep_hang']);
    expect(costKindsFor('CFR')).toContain('cuoc_bien');
    expect(costKindsFor('CIF')).toEqual(expect.arrayContaining(['cuoc_bien', 'bao_hiem']));
  });

  it('quy giá về USD mỗi kg để so sánh', () => {
    expect(usdPerKg({ quantity: 1, unit: 'tan', unitPrice: 4850, currency: 'USD', fxPerUsd: null })).toBeCloseTo(4.85);
    expect(usdPerKg({ quantity: 1, unit: 'kg', unitPrice: 127000, currency: 'VND', fxPerUsd: 25400 })).toBeCloseTo(5);
    expect(usdPerKg({ quantity: 1, unit: 'kg', unitPrice: 127000, currency: 'VND', fxPerUsd: null })).toBeNull();
  });

  it('tính biên dự kiến của báo giá bán mua đứt', () => {
    const s = saleSummary(
      { quantity: 19.2, unit: 'tan', unitPrice: 4850, currency: 'USD', fxPerUsd: null, feeRatePct: 1.5 },
      { quantity: 20, unit: 'tan', unitPrice: 112_000_000, currency: 'VND', fxPerUsd: 25400 },
      [
        { amount: 15_000_000, currency: 'VND', fxPerUsd: 25000 },
        { amount: 300, currency: 'USD', fxPerUsd: null },
      ],
    );
    expect(s.giaTriBanUsd).toBe(93120);
    expect(s.giaVonUsd).toBeCloseTo(84661.42, 1);
    expect(s.chiPhiUsd).toBe(900);
    expect(s.phiTronGoiUsd).toBe(1396.8);
    expect(s.bienUsd).toBeCloseTo(93120 - 84661.42 - 900 + 1396.8, 0);
    expect(s.thieu).toEqual([]);
  });

  it('báo thiếu khi chưa có báo giá nguồn hoặc tỷ giá', () => {
    const s = saleSummary({ quantity: 1, unit: 'kg', unitPrice: 1, currency: 'EUR', fxPerUsd: null, feeRatePct: null }, null, []);
    expect(s.bienUsd).toBeNull();
    expect(s.thieu.join(';')).toMatch(/tỷ giá của báo giá bán/);
    expect(s.thieu.join(';')).toMatch(/báo giá mua làm nguồn/);
  });

  it('hết hiệu lực tính theo ngày Việt Nam', () => {
    const now = new Date('2026-11-25T18:00:00Z'); // 01:00 ngày 26/11 giờ Việt Nam
    expect(isQuoteExpired('2026-11-25', now)).toBe(true);
    expect(isQuoteExpired('2026-11-26', now)).toBe(false);
  });
});

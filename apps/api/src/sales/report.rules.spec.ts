import { addMonths, buildReport, marketOfCountry, monthsBetween, monthVn, winRate } from './report.rules';

describe('Báo cáo kinh doanh', () => {
  it('quy thị trường theo nước người mua', () => {
    expect(marketOfCountry('DE')).toBe('EU');
    expect(marketOfCountry('us')).toBe('US');
    expect(marketOfCountry('CN')).toBe('CN');
    expect(marketOfCountry('JP')).toBe('khac');
    expect(marketOfCountry(null)).toBe('khac');
  });

  it('tháng theo giờ Việt Nam, dãy tháng, cộng tháng', () => {
    expect(monthVn(new Date('2026-11-30T18:00:00Z'))).toBe('2026-12');
    expect(monthVn('2026-11-30')).toBe('2026-11');
    expect(monthsBetween('2026-11', '2027-02')).toEqual(['2026-11', '2026-12', '2027-01', '2027-02']);
    expect(addMonths('2026-02', -11)).toBe('2025-03');
    expect(addMonths('2026-12', 1)).toBe('2027-01');
  });

  it('tỷ lệ thắng chỉ tính phiếu đã có kết quả', () => {
    expect(winRate(0, 0)).toBeNull();
    expect(winRate(1, 2)).toBe(33.3);
  });

  it('gom theo tháng, ngành, thị trường, người mua; bỏ số ngoài kỳ', () => {
    const r = buildReport({
      months: ['2026-10', '2026-11'],
      signed: [
        { month: '2026-10', sector: 'ca_phe', market: 'EU', buyerId: 'a', buyerName: 'A', valueUsd: 100000 },
        { month: '2026-11', sector: 'gia_vi', market: 'US', buyerId: 'b', buyerName: 'B', valueUsd: 50000 },
        { month: '2026-11', sector: 'ca_phe', market: 'EU', buyerId: 'a', buyerName: 'A', valueUsd: null },
        { month: '2026-09', sector: 'ca_phe', market: 'EU', buyerId: 'a', buyerName: 'A', valueUsd: 999 },
      ],
      shipped: [{ month: '2026-11', sector: 'ca_phe', market: 'EU', buyerId: 'a', buyerName: 'A', kg: 19200, valueUsd: 91200 }],
      inquiries: [
        { month: '2026-10', status: 'thang' },
        { month: '2026-11', status: 'thua' },
        { month: '2026-11', status: 'moi' },
      ],
      quotes: [{ month: '2026-11', status: 'chap_nhan' }],
    });
    expect(r.thang.map((t) => [t.thang, t.hopDong.so, t.hopDong.giaTriUsd, t.giaoHang.kg])).toEqual([
      ['2026-10', 1, 100000, 0],
      ['2026-11', 2, 50000, 19200],
    ]);
    expect(r.tong.hopDong).toEqual({ so: 3, giaTriUsd: 150000 });
    expect(r.tong.hoiHang).toEqual({ tong: 3, thang: 1, thua: 1, tyLeThangPhanTram: 50 });
    expect(r.tong.baoGia.tyLeThangPhanTram).toBe(100);
    expect(r.theoNguoiMua[0]).toMatchObject({ ma: 'a', ten: 'A', hopDong: { so: 2, giaTriUsd: 100000 }, giaoHang: { soLo: 1, kg: 19200, giaTriUsd: 91200 } });
    expect(r.theoThiTruong.map((x) => x.ma)).toEqual(['EU', 'US']);
    expect(r.thieuTyGia).toBe(1);
  });
});

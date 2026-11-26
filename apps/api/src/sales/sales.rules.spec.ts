import { addBusinessDays, inquiryStats, isInquiryOverdue, quoteDueOn, sampleLinkProblem, sampleResultProblem } from './sales.rules';

describe('Quy tắc bán hàng', () => {
  it('cộng ngày làm việc bỏ thứ Bảy, Chủ nhật', () => {
    expect(addBusinessDays('2026-11-26', 2)).toBe('2026-11-30'); // thứ Năm + 2 = thứ Hai
    expect(addBusinessDays('2026-11-28', 1)).toBe('2026-11-30'); // thứ Bảy + 1 = thứ Hai
    expect(quoteDueOn('2026-11-23')).toBe('2026-11-25');
  });

  it('phiếu mới quá 2 ngày làm việc là quá hạn; phiếu đã báo giá thì không', () => {
    expect(isInquiryOverdue('moi', '2026-11-26', '2026-11-30')).toBe(false);
    expect(isInquiryOverdue('moi', '2026-11-26', '2026-12-01')).toBe(true);
    expect(isInquiryOverdue('dang_bao_gia', '2026-11-01', '2026-12-01')).toBe(false);
  });

  it('tổng hợp: tỷ lệ thắng tính trên phiếu đã có kết quả', () => {
    const s = inquiryStats(
      [
        { status: 'thang', receivedOn: '2026-11-01', lostReason: null },
        { status: 'thua', receivedOn: '2026-11-01', lostReason: 'gia' },
        { status: 'thua', receivedOn: '2026-11-01', lostReason: 'gia' },
        { status: 'moi', receivedOn: '2026-11-01', lostReason: null },
      ],
      '2026-11-26',
    );
    expect(s.tyLeThang).toBe(33.3);
    expect(s.lyDoThua).toEqual({ gia: 2 });
    expect(s.quaHan).toBe(1);
    expect(inquiryStats([]).tyLeThang).toBeNull();
  });

  it('liên kết của mẫu', () => {
    const base = { sector: 'ca_phe', partnerId: 'b1', commodityId: 'c1' };
    expect(sampleLinkProblem({ ...base, kind: 'truoc_xuat' })).toMatch(/lô xuất/);
    expect(sampleLinkProblem({ ...base, kind: 'doi_chung' })).toMatch(/đối chứng/);
    expect(sampleLinkProblem({ ...base, kind: 'truoc_xuat', exportLot: { buyerPartnerId: 'b2', commodityId: 'c1' } })).toMatch(/người mua khác/);
    expect(sampleLinkProblem({ ...base, kind: 'chao_hang', inquiry: { partnerId: 'b1', commodityId: 'c2' } })).toMatch(/cùng mặt hàng/);
    expect(sampleLinkProblem({ ...base, kind: 'truoc_xuat', exportLot: { buyerPartnerId: 'b1', commodityId: 'c1' } })).toBeNull();
  });

  it('kết quả mẫu: chỉ mẫu đã gửi, điểm thử nếm chỉ cho cà phê', () => {
    expect(sampleResultProblem('chuan_bi', 'chao_hang', 'ca_phe', null)).toMatch(/đã gửi/);
    expect(sampleResultProblem('da_gui', 'chao_hang', 'gia_vi', 82)).toMatch(/cà phê/);
    expect(sampleResultProblem('da_gui', 'chao_hang', 'ca_phe', 82)).toBeNull();
    expect(sampleResultProblem('luu', 'doi_chung', 'ca_phe', null)).toMatch(/đối chứng/);
  });
});

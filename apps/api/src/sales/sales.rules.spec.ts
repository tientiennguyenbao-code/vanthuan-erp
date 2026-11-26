import {
  addBusinessDays,
  deliveryProgress,
  fixationRefusal,
  fixedPrice,
  fixingWarning,
  inquiryStats,
  isInquiryOverdue,
  kgToFix,
  quoteDueOn,
  salesShippingProblems,
  sampleLinkProblem,
  sampleResultProblem,
  weightedFixedPrice,
} from './sales.rules';

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

  it('giá chốt: sàn London theo USD/tấn, sàn New York quy từ cent/lb, cộng chênh lệch', () => {
    expect(fixedPrice('ICE_LONDON', 4900, -120)).toBe(4780);
    expect(fixedPrice('ICE_NY', 180, 50)).toBe(4018.32); // 180 × 22,0462 = 3968,32
    expect(weightedFixedPrice([])).toBeNull();
    expect(weightedFixedPrice([{ quantityKg: 12000, finalPrice: 4780 }, { quantityKg: 8000, finalPrice: 4900 }])).toBe(4828);
  });

  it('khối lượng cần chốt: theo phân bổ, chưa phân bổ thì theo đợt; không chốt vượt dung sai', () => {
    expect(kgToFix(0, 20000)).toBe(20000);
    expect(kgToFix(19800, 20000)).toBe(19800);
    const base = { hasDifferential: true, lotStatus: 'dong_goi', quantityKg: 1000, fixedKg: 20000, maxKg: 21000 };
    expect(fixationRefusal(base)).toBeNull();
    expect(fixationRefusal({ ...base, quantityKg: 1001 })).toMatch(/vượt/);
    expect(fixationRefusal({ ...base, hasDifferential: false })).toMatch(/trừ lùi/);
    expect(fixationRefusal({ ...base, lotStatus: 'xep_tau' })).toMatch(/xếp tàu/);
  });

  it('điều kiện xếp tàu: mẫu trước xuất phải đạt, giá phải chốt đủ', () => {
    const g = { needsPreShipmentSample: true, samples: [] as { kind: string; status: string }[], hasDifferential: true, needFixKg: 20000, fixedKg: 12000 };
    expect(salesShippingProblems(g)).toEqual(['Người mua chưa duyệt mẫu trước xuất', 'Còn 8 tấn chưa chốt giá']);
    expect(salesShippingProblems({ ...g, samples: [{ kind: 'truoc_xuat', status: 'khong_dat' }] })[0]).toMatch(/không đạt/);
    expect(salesShippingProblems({ ...g, samples: [{ kind: 'truoc_xuat', status: 'khong_dat' }, { kind: 'truoc_xuat', status: 'dat' }], fixedKg: 20000 })).toEqual([]);
    expect(salesShippingProblems({ ...g, samples: [{ kind: 'chao_hang', status: 'dat' }], fixedKg: 20000 })).toHaveLength(1);
  });

  it('cảnh báo chốt giá khi còn dưới 10 ngày đến ETD', () => {
    expect(fixingWarning('2027-02-20', 8000, '2027-02-09')).toBe(false);
    expect(fixingWarning('2027-02-20', 8000, '2027-02-10')).toBe(true);
    expect(fixingWarning('2027-02-20', 0, '2027-02-19')).toBe(false);
    expect(fixingWarning(null, 8000, '2027-02-19')).toBe(false);
  });

  it('tiến độ giao theo đợt: giao khi lô đã xếp tàu, hoàn thành khi đủ dung sai', () => {
    const plan = [{ thang: '2027-02', plannedKg: 20000 }, { thang: '2027-03', plannedKg: 20000 }];
    const lot = (n: number, status: string, kg: number) => ({ id: `l${n}`, code: `LX-${n}`, shipmentNo: n, status, allocatedKg: kg, fixedKg: 0, avgPrice: null });
    let p = deliveryProgress(plan, [lot(1, 'xep_tau', 19500), lot(2, 'dong_goi', 10000)], 5);
    expect([p.daGiaoKg, p.conLaiKg, p.hoanThanh]).toEqual([19500, 20500, false]);
    p = deliveryProgress(plan, [lot(1, 'hoan_tat', 19500), lot(2, 'xep_tau', 19000)], 5);
    expect(p.hoanThanh).toBe(true);
    p = deliveryProgress(plan, [lot(1, 'da_huy', 0), lot(2, 'xep_tau', 21000)], 5);
    expect(p.dot[0].lo).toBeNull();
    expect(p.hoanThanh).toBe(false);
  });
});

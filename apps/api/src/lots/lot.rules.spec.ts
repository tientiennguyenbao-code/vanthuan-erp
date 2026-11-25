import { allocationRefusal, daysToCutoff, gateProblems, mainSupplier, nextStep, signal, toKg } from './lot.rules';

describe('quy tắc lô hàng', () => {
  it('đổi tấn ra kg và bước kế tiếp', () => {
    expect(toKg(19.2, 'tan')).toBe(19200);
    expect(nextStep('dong_goi')).toBe('nhap_kho');
    expect(nextStep('hoan_tat')).toBeNull();
    expect(nextStep('da_huy')).toBeNull();
  });

  it('nhà cung cấp chính là người góp nhiều hàng nhất; bằng nhau thì để điều phối viên chọn', () => {
    expect(mainSupplier([{ supplierId: 'a', quantityKg: 5000 }, { supplierId: 'b', quantityKg: 7000 }, { supplierId: 'a', quantityKg: 3000 }])).toBe('a');
    expect(mainSupplier([{ supplierId: 'a', quantityKg: 5000 }, { supplierId: 'b', quantityKg: 5000 }])).toBeNull();
    expect(mainSupplier([])).toBeNull();
  });

  it('số ngày đến cut-off lấy mốc sớm nhất', () => {
    const now = new Date('2026-12-01T00:00:00Z');
    expect(daysToCutoff([new Date('2026-12-05T00:00:00Z'), new Date('2026-12-03T12:00:00Z')], now)).toBe(3);
    expect(daysToCutoff([null, null], now)).toBeNull();
  });

  it('đèn: đỏ khi ≤ 3 ngày đến cut-off hoặc giám định không đạt; xanh khi đã xếp tàu', () => {
    expect(signal('dat_cho', 3, false)).toBe('do');
    expect(signal('dat_cho', 5, false)).toBe('vang');
    expect(signal('dong_goi', 10, false)).toBe('xanh');
    expect(signal('giam_dinh', null, true)).toBe('do');
    expect(signal('xep_tau', -1, false)).toBe('xanh');
  });

  it('không phân bổ khác mặt hàng, khác loại giao dịch', () => {
    const lot = { status: 'da_so_che', dealType: 'mua_dut', commodityId: 'm1', availableKg: 1000, allocatedKg: 0 };
    const exp = { status: 'dong_goi', dealType: 'mua_dut', commodityId: 'm1' };
    expect(allocationRefusal(lot, exp, 500)).toBeNull();
    expect(allocationRefusal(lot, { ...exp, commodityId: 'm2' }, 500)).toMatch(/cùng mặt hàng/);
    expect(allocationRefusal(lot, { ...exp, dealType: 'moi_gioi' }, 500)).toMatch(/cùng loại giao dịch/);
    expect(allocationRefusal(lot, { ...exp, status: 'giam_dinh' }, 500)).toMatch(/đóng gói/);
  });

  it('tổng phân bổ phải nằm trong dung sai hợp đồng', () => {
    const base = {
      status: 'dong_goi' as const,
      dealType: 'mua_dut',
      commodityId: 'm1',
      contractKg: 20000,
      tolerancePct: 5,
      lastInspection: null,
      booking: null,
    };
    const a = (kg: number) => ({ purchaseLotId: 'p', quantityKg: kg, approved: true, split: false, consented: false, commodityId: 'm1', dealType: 'mua_dut' });
    expect(gateProblems({ ...base, allocations: [a(19000)] })).toEqual([]);
    expect(gateProblems({ ...base, allocations: [a(18000)] })[0]).toMatch(/ngoài khoảng/);
    expect(gateProblems({ ...base, allocations: [] })[0]).toMatch(/Chưa phân bổ/);
  });
});

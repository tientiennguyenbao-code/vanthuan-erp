import { isSimpSpecies, phiIssues, ruleFor, traceChecks, TraceFacts } from './trace.rules';

const facts = (over: Partial<TraceFacts> = {}): TraceFacts => ({
  tongKg: 1000,
  truyDuocKg: 1000,
  loMua: [{ ma: 'LM1', eudrClass: null, coCoSo: true }],
  nguon: [{ ma: 'T1', maSoVung: 'GL-HT-001', coNhatKyThuoc: true, luuY: [] }],
  maCoSo: { fda: ['Xưởng A: 12345678901'] },
  coSoThieu: { gacc: ['Xưởng A'], eu_list: ['Xưởng A'] },
  simp: false,
  ...over,
});

describe('truy xuất theo ngành × thị trường', () => {
  it('thời gian cách ly: chỉ lần phun trước ngày thu hoạch và chưa hết số ngày cách ly', () => {
    const s = [
      { sprayedOn: '2026-11-01', product: 'Anvil', phiDays: 14 },
      { sprayedOn: '2026-10-01', product: 'Regent', phiDays: 7 },
      { sprayedOn: '2026-11-20', product: 'Sau', phiDays: 30 },
    ];
    expect(phiIssues(s, '2026-11-10')).toEqual(['Thu hoạch ngày 10/11/2026 khi chưa hết 14 ngày cách ly sau lần phun Anvil ngày 01/11/2026']);
    expect(phiIssues(s, '2026-11-15')).toEqual([]); // đúng ngày thứ 14
    expect(phiIssues([], '2026-11-10')).toEqual([]);
  });

  it('loài SIMP theo tên', () => {
    expect(isSimpSpecies('Tôm thẻ chân trắng đông lạnh')).toBe(true);
    expect(isSimpSpecies('Cá tra phi lê', null)).toBe(false);
    expect(isSimpSpecies('Thủy sản đông lạnh', 'Cá ngừ vây vàng')).toBe(true);
  });

  it('bảng quy tắc: cặp nặng nhất là cà phê EU; thị trường khác không có quy tắc', () => {
    expect(ruleFor('ca_phe', 'EU')?.kiem).toEqual(['truy_nguon', 'eudr']);
    expect(ruleFor('thuy_san', 'US')?.kiem).toEqual(['fda', 'simp']);
    expect(ruleFor('gia_vi', 'KHAC')).toBeNull();
  });

  it('kiểm mã cơ sở, truy nguồn và nhật ký thuốc', () => {
    const us = traceChecks(ruleFor('gia_vi', 'US')!, facts());
    expect(us).toEqual([expect.objectContaining({ ma: 'fda', dat: true, canXacMinh: true })]);
    const cn = traceChecks(ruleFor('gia_vi', 'CN')!, facts());
    expect(cn.map((c) => [c.ma, c.dat])).toEqual([['gacc', false], ['ma_so_vung', true]]);
    const eu = traceChecks(ruleFor('gia_vi', 'EU')!, facts({ truyDuocKg: 800, nguon: [{ ma: 'T1', maSoVung: null, coNhatKyThuoc: false, luuY: ['Thu hoạch sớm'] }] }));
    expect(eu.find((c) => c.ma === 'truy_nguon')).toMatchObject({ dat: false, canXacMinh: false });
    expect(eu.find((c) => c.ma === 'thuoc_bvtv')!.chiTiet).toEqual(['Thửa chưa có nhật ký thuốc trong 12 tháng trước thu hoạch: T1', 'T1: Thu hoạch sớm']);
    // Lô mua chưa ghi cơ sở thì không đạt mã cơ sở
    const noFac = traceChecks(ruleFor('ca_phe', 'US')!, facts({ loMua: [{ ma: 'LM9', eudrClass: null, coCoSo: false }], coSoThieu: {}, maCoSo: {} }));
    expect(noFac[0]).toMatchObject({ dat: false });
    expect(noFac[0].chiTiet[0]).toMatch(/LM9/);
  });

  it('SIMP: loài thuộc danh sách thì mọi kg phải truy được tới ao có mã', () => {
    const rule = ruleFor('thuy_san', 'US')!;
    expect(traceChecks(rule, facts({ simp: true })).find((c) => c.ma === 'simp')!.dat).toBe(true);
    expect(traceChecks(rule, facts({ simp: true, truyDuocKg: 500 })).find((c) => c.ma === 'simp')!.dat).toBe(false);
    expect(traceChecks(rule, facts({ simp: false, truyDuocKg: 0 })).find((c) => c.ma === 'simp')!.dat).toBe(true);
  });
});

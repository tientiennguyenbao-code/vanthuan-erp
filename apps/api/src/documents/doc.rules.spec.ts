import { buildChecklist, completionDocProblems, DocRow, feeAmount, reviewOverdue, RuleLike, ruleApplies, shippingDocProblems } from './doc.rules';

const rule = (o: Partial<RuleLike>): RuleLike => ({
  id: o.code ?? 'x',
  code: 'x',
  name: 'X',
  sector: null,
  market: null,
  incoterms: null,
  dealType: null,
  requirement: 'bb',
  stage: 'truoc_xep_tau',
  scope: 'lo',
  party: 'van_thuan',
  issuer: null,
  active: true,
  ...o,
});
const profile = { sector: 'ca_phe', market: 'EU', incoterms: 'FOB', dealType: 'mua_dut', suppliers: [] as string[] };

describe('quy tắc chứng từ', () => {
  it('lọc theo ngành, thị trường, Incoterms, loại giao dịch và trạng thái hiệu lực', () => {
    expect(ruleApplies(rule({ market: 'EU', sector: 'ca_phe' }), profile)).toBe(true);
    expect(ruleApplies(rule({ market: 'US' }), profile)).toBe(false);
    expect(ruleApplies(rule({ sector: 'thuy_san' }), profile)).toBe(false);
    expect(ruleApplies(rule({ incoterms: ['CIF', 'CIP'] }), profile)).toBe(false);
    expect(ruleApplies(rule({ incoterms: ['CIF', 'CIP'] }), { ...profile, incoterms: 'CIF' })).toBe(true);
    expect(ruleApplies(rule({ dealType: 'moi_gioi' }), profile)).toBe(false);
    expect(ruleApplies(rule({ active: false }), profile)).toBe(false);
  });

  it('môi giới: chứng từ người xuất khẩu và cơ sở tách theo từng nhà cung cấp, thêm thỏa thuận ủy quyền', () => {
    const rules = [rule({ code: 'hoa_don', scope: 'nguoi_xuat_khau' }), rule({ code: 'haccp', scope: 'nha_cung_cap' }), rule({ code: 'van_don', scope: 'lo', stage: 'sau_xep_tau' })];
    const mb = buildChecklist(rules, { ...profile, dealType: 'moi_gioi', suppliers: ['b', 'a', 'b'] });
    expect(mb.map((x) => `${x.code}:${x.supplierPartnerId ?? '-'}`)).toEqual(['hoa_don:a', 'hoa_don:b', 'haccp:a', 'haccp:b', 'van_don:-', 'uy_quyen_ncc_chinh:-']);
    const md = buildChecklist(rules, { ...profile, suppliers: ['a', 'b'] });
    expect(md.map((x) => `${x.code}:${x.supplierPartnerId ?? '-'}`)).toEqual(['hoa_don:-', 'haccp:a', 'haccp:b', 'van_don:-']);
    // Môi giới một nhà cung cấp: không cần ủy quyền
    expect(buildChecklist(rules, { ...profile, dealType: 'moi_gioi', suppliers: ['a'] }).some((x) => x.code === 'uy_quyen_ncc_chinh')).toBe(false);
    // Chưa có phân bổ: dòng theo nhà cung cấp chờ đến khi có hàng
    expect(buildChecklist(rules, profile).map((x) => x.supplierPartnerId)).toEqual([null, null, null]);
  });

  const d = (o: Partial<DocRow>): DocRow => ({ name: 'D', requirement: 'bb', stage: 'truoc_xep_tau', party: 'van_thuan', status: 'thieu', expiresOn: null, ...o });

  it('cổng xếp tàu: chứng từ bắt buộc trước xếp tàu phải duyệt và còn hạn đến ngày tàu chạy', () => {
    expect(shippingDocProblems([d({ status: 'da_duyet' }), d({ status: 'khong_ap_dung' }), d({ requirement: 'nm' }), d({ stage: 'sau_xep_tau' })], '2026-12-10', '2026-11-25')).toEqual([]);
    const p = shippingDocProblems([d({ name: 'HACCP', status: 'nhap', supplierName: 'NCC A' })], null, '2026-11-25');
    expect(p[0]).toContain('HACCP (NCC A)');
    const e = shippingDocProblems([d({ name: 'Giám định', status: 'da_duyet', expiresOn: '2026-12-01' })], '2026-12-10', '2026-11-25');
    expect(e).toEqual(['Chứng từ hết hạn trước ngày tàu chạy: Giám định']);
    // ETD đã qua: tính theo hôm nay
    expect(shippingDocProblems([d({ status: 'da_duyet', expiresOn: '2026-11-26' })], '2026-11-01', '2026-11-25')).toEqual([]);
  });

  it('hoàn tất: chứng từ bắt buộc phải gửi; chứng từ người nhập làm chỉ cần xác nhận', () => {
    expect(completionDocProblems([d({ status: 'da_gui' }), d({ party: 'nguoi_nhap', status: 'da_duyet' }), d({ requirement: 'nm' })])).toEqual([]);
    expect(completionDocProblems([d({ name: 'Vận đơn', stage: 'sau_xep_tau', status: 'da_duyet' })])[0]).toContain('Vận đơn');
  });

  it('phí theo phần hàng và hạn rà soát quy tắc', () => {
    expect(feeAmount(12000, 4.2, 1.5)).toEqual({ base: 50400, amount: 756 });
    expect(feeAmount(1000, 3.333, null)).toEqual({ base: 3333, amount: null });
    expect(reviewOverdue('2025-11-01', new Date('2026-11-25T00:00:00Z'))).toBe(true);
    expect(reviewOverdue('2026-01-01', new Date('2026-11-25T00:00:00Z'))).toBe(false);
  });
});

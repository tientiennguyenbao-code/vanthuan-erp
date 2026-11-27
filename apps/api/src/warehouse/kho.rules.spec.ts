import { capacityRefusal, moveRefusal, receiptVariance, zoneRefusal } from './kho.rules';

const khu = (kind: string, active = true) => ({ kind, name: `Khu ${kind}`, active });

describe('Hàng nào vào khu nào', () => {
  it('cà phê đủ EUDR chỉ vào khu đủ EUDR, và khu đủ EUDR chỉ nhận cà phê đủ EUDR', () => {
    expect(zoneRefusal({ sector: 'ca_phe', eudrClass: 'du' }, khu('du_eudr'))).toBeNull();
    expect(zoneRefusal({ sector: 'ca_phe', eudrClass: 'du' }, khu('thuong'))).toMatch(/chỉ được vào khu đủ EUDR/);
    expect(zoneRefusal({ sector: 'ca_phe', eudrClass: 'khong_du' }, khu('du_eudr'))).toMatch(/chỉ nhận cà phê đủ EUDR/);
    expect(zoneRefusal({ sector: 'gia_vi', eudrClass: null }, khu('du_eudr'))).toMatch(/chỉ nhận cà phê đủ EUDR/);
    expect(zoneRefusal({ sector: 'ca_phe', eudrClass: 'khong_du' }, khu('thuong'))).toBeNull();
  });

  it('cà phê chưa thu gom thì chưa biết nhãn nên chưa nhận', () => {
    expect(zoneRefusal({ sector: 'ca_phe', eudrClass: null }, khu('thuong'))).toMatch(/chưa thu gom/);
  });

  it('thủy sản chỉ vào kho lạnh; gia vị vào khu thường hoặc kho lạnh', () => {
    expect(zoneRefusal({ sector: 'thuy_san', eudrClass: null }, khu('thuong'))).toMatch(/kho lạnh/);
    expect(zoneRefusal({ sector: 'thuy_san', eudrClass: null }, khu('kho_lanh'))).toBeNull();
    expect(zoneRefusal({ sector: 'gia_vi', eudrClass: null }, khu('kho_lanh'))).toBeNull();
  });

  it('khu đã ngừng dùng không nhận hàng', () => {
    expect(zoneRefusal({ sector: 'gia_vi', eudrClass: null }, khu('thuong', false))).toMatch(/ngừng dùng/);
  });
});

describe('Sức chứa và chuyển khu', () => {
  it('không nhận quá sức chứa của khu; khu không ghi sức chứa thì không giới hạn', () => {
    expect(capacityRefusal({ name: 'Khu A', capacityKg: 10_000 }, 8_000, 2_000)).toBeNull();
    expect(capacityRefusal({ name: 'Khu A', capacityKg: 10_000 }, 8_000, 2_500)).toMatch(/chỉ còn chỗ cho 2\.000 kg/);
    expect(capacityRefusal({ name: 'Khu A', capacityKg: null }, 1e9, 1e9)).toBeNull();
  });

  it('chuyển khu không quá số còn lại', () => {
    expect(moveRefusal(1000, 1000)).toBeNull();
    expect(moveRefusal(1000, 1000.5)).toMatch(/chỉ còn 1\.000 kg/);
    expect(moveRefusal(0, 1)).toMatch(/hết hàng/);
    expect(moveRefusal(10, 0)).toMatch(/lớn hơn 0/);
  });
});

describe('Chênh lệch cân thu gom và cân tại kho', () => {
  it('nhận nhiều hơn thu gom quá 1% thì cảnh báo ngay', () => {
    expect(receiptVariance(10_000, 10_050, true).warning).toBeNull();
    expect(receiptVariance(10_000, 10_200, true).warning).toMatch(/nhiều hơn thu gom 200 kg \(2%\)/);
  });

  it('nhận ít hơn chỉ cảnh báo khi lô đã thôi thu gom', () => {
    expect(receiptVariance(10_000, 9_700, true).warning).toBeNull();
    expect(receiptVariance(10_000, 9_700, false)).toMatchObject({ diffKg: -300, diffPct: -3 });
    expect(receiptVariance(10_000, 9_700, false).warning).toMatch(/ít hơn thu gom 300 kg \(3%\)/);
  });

  it('nhận hàng khi lô chưa ghi thu gom', () => {
    expect(receiptVariance(0, 500, true).warning).toMatch(/chưa ghi thu gom/);
  });
});

import { blendShares, inputsRefusal, massBalance, needsApproval } from './kho.rules';

const lt = (over: Record<string, unknown> = {}) => ({
  code: 'LT-1', facilityId: 'k1', commodityId: 'cafe', dealType: 'mua_dut', eudrClass: 'khong_du', status: 'san_sang', remainingKg: 10_000, supplierIds: ['ncc1'], quantityKg: 5_000, ...over,
});

describe('Lệnh sơ chế: trộn lô (KS-1)', () => {
  it('mua đứt trộn được nhiều nhà cung cấp khi cùng mặt hàng, cùng nhãn EUDR', () => {
    expect(inputsRefusal('k1', [lt(), lt({ code: 'LT-2', supplierIds: ['ncc2'] })])).toBeNull();
  });
  it('không trộn đủ EUDR với không đủ, mua đứt với môi giới, khác mặt hàng', () => {
    expect(inputsRefusal('k1', [lt(), lt({ eudrClass: 'du' })])).toMatch(/EUDR/);
    expect(inputsRefusal('k1', [lt(), lt({ dealType: 'moi_gioi' })])).toMatch(/mua đứt với hàng môi giới/);
    expect(inputsRefusal('k1', [lt(), lt({ commodityId: 'tieu' })])).toMatch(/cùng mặt hàng/);
  });
  it('môi giới chỉ trộn hàng của cùng một nhà cung cấp', () => {
    const mg = (s: string) => lt({ dealType: 'moi_gioi', supplierIds: [s] });
    expect(inputsRefusal('k1', [mg('ncc1'), mg('ncc1')])).toBeNull();
    expect(inputsRefusal('k1', [mg('ncc1'), mg('ncc2')])).toMatch(/cùng một nhà cung cấp/);
  });
  it('không lấy quá số còn lại, không dùng lô chờ duyệt, lô phải ở kho của lệnh', () => {
    expect(inputsRefusal('k1', [lt({ quantityKg: 10_001 })])).toMatch(/chỉ còn 10\.000 kg/);
    expect(inputsRefusal('k1', [lt({ status: 'cho_duyet' })])).toMatch(/chờ duyệt/);
    expect(inputsRefusal('k2', [lt()])).toMatch(/không ở kho này/);
    expect(inputsRefusal('k1', [])).toMatch(/ít nhất một/);
  });
});

describe('Cân bằng khối lượng và định mức (KS-3)', () => {
  it('vào = thành phẩm + phụ phẩm + hao hụt', () => {
    expect(massBalance('sang_phan_loai', 20_000, [{ kind: 'thanh_pham', quantityKg: 12_000 }, { kind: 'thanh_pham', quantityKg: 6_000 }, { kind: 'phu_pham', quantityKg: 1_600 }])).toEqual({
      inputKg: 20_000, outputKg: 18_000, byproductKg: 1_600, lossKg: 400, lossPct: 2,
    });
  });
  it('đầu ra nhiều hơn đầu vào chỉ được ở công đoạn mạ băng', () => {
    expect(massBalance('say', 1000, [{ kind: 'thanh_pham', quantityKg: 1001 }])).toMatchObject({ error: expect.stringMatching(/nhiều hơn đầu vào/) });
    expect(massBalance('ma_bang', 1000, [{ kind: 'thanh_pham', quantityKg: 1080 }])).toMatchObject({ lossKg: -80, lossPct: -8 });
  });
  it('phải có thành phẩm', () => {
    expect(massBalance('say', 1000, [{ kind: 'phu_pham', quantityKg: 10 }])).toMatchObject({ error: expect.stringMatching(/thành phẩm/) });
  });
  it('vượt định mức hoặc chưa có định mức thì chờ duyệt', () => {
    expect(needsApproval('say', 3, 3)).toBe(false);
    expect(needsApproval('say', 3.2, 3)).toBe(true);
    expect(needsApproval('say', 1, null)).toBe(true);
    expect(needsApproval('ma_bang', -8, null)).toBe(false);
  });
});

describe('Nguồn gốc theo tỷ lệ khối lượng (KS-2)', () => {
  it('trộn 14 tấn lô A với 6 tấn lô (70% B, 30% C)', () => {
    const s = blendShares([
      { quantityKg: 14_000, origins: [{ purchaseLotId: 'A', share: 1 }] },
      { quantityKg: 6_000, origins: [{ purchaseLotId: 'B', share: 0.7 }, { purchaseLotId: 'C', share: 0.3 }] },
    ]);
    expect(s).toEqual([{ purchaseLotId: 'A', share: 0.7 }, { purchaseLotId: 'B', share: 0.21 }, { purchaseLotId: 'C', share: 0.09 }]);
    expect(s.reduce((a, x) => a + x.share, 0)).toBeCloseTo(1, 9);
  });
});

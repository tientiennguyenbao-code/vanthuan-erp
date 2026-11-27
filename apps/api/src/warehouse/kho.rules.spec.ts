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

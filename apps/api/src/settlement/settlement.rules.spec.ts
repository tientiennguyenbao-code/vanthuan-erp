import { computeSettlement, directorReview, faultHint, milestoneDue, SettlementInput, supplierPayLimitUsd } from './settlement.rules';

const base = (over: Partial<SettlementInput> = {}): SettlementInput => ({
  dealType: 'mua_dut',
  lotStatus: 'hoan_tat',
  goodsValueUsd: 48000,
  purchaseLots: [{ purchaseLotId: 'a', code: 'LM-1', supplierName: 'NCC A', costUsd: 44000 }],
  payments: [
    { kind: 'tien_hang_nguoi_mua', category: null, purchaseLotId: null, financingId: null, amountUsd: 48000 },
    { kind: 'tien_hang_ncc', category: null, purchaseLotId: 'a', financingId: null, amountUsd: 44000 },
    { kind: 'phi_tron_goi', category: null, purchaseLotId: 'a', financingId: null, amountUsd: 720 },
    { kind: 'chi_phi', category: 'cuoc_bien', purchaseLotId: null, financingId: null, amountUsd: 1500 },
  ],
  pendingPayments: 0,
  fees: [{ status: 'da_duyet', amountUsd: 720, baseUsd: 48000 }],
  financings: [],
  complaints: [],
  ...over,
});

describe('Quy tắc thanh toán và quyết toán', () => {
  it('mốc đến hạn theo sự kiện của lô', () => {
    const s = { inspectionPassed: true, shipped: false, documentsComplete: false, financingDisbursed: false, today: '2027-01-10' };
    expect(milestoneDue('dat_coc', null, s)).toBe(true);
    expect(milestoneDue('giam_dinh', null, s)).toBe(true);
    expect(milestoneDue('van_don', null, s)).toBe(false);
    expect(milestoneDue('ngay', '2027-01-10', s)).toBe(true);
    expect(milestoneDue('ngay', '2027-01-11', s)).toBe(false);
  });

  it('hạn mức trả nhà cung cấp là số lớn hơn giữa tiền đã thu và tiền tài trợ đã giải ngân', () => {
    expect(supplierPayLimitUsd(0, 0)).toBe(0);
    expect(supplierPayLimitUsd(0, 30000)).toBe(30000);
    expect(supplierPayLimitUsd(48000, 30000)).toBe(48000);
  });

  it('đủ 6 điều kiện thì tính biên: doanh thu − giá vốn + phí − chi phí', () => {
    const r = computeSettlement(base());
    expect(r.dieuKien.every((d) => d.dat)).toBe(true);
    expect(r.bienUsd).toBe(48000 - 44000 + 720 - 1500);
    expect(r.bienPhanTram).toBe(6.708);
  });

  it('khiếu nại giảm trừ: người mua phải trả ít đi, phí tính lại theo tỷ lệ, phần chuyển nhà cung cấp trừ vào tiền phải trả', () => {
    const r = computeSettlement(
      base({
        payments: [
          { kind: 'tien_hang_nguoi_mua', category: null, purchaseLotId: null, financingId: null, amountUsd: 46000 },
          { kind: 'tien_hang_ncc', category: null, purchaseLotId: 'a', financingId: null, amountUsd: 42500 },
          { kind: 'phi_tron_goi', category: null, purchaseLotId: 'a', financingId: null, amountUsd: 690 },
        ],
        complaints: [{ status: 'da_dong', agreedUsd: 2000, passBackPurchaseLotId: 'a', passBackUsd: 1500 }],
      }),
    );
    expect(r.tongHop).toMatchObject({ phaiThuNguoiMuaUsd: 46000, phaiTraNccUsd: 42500, phiPhaiThuUsd: 690 });
    expect(r.dieuKien.every((d) => d.dat)).toBe(true);
  });

  it('thiếu tiền, phí chưa duyệt, tài trợ chưa tất toán, khiếu nại mở thì không đạt', () => {
    const r = computeSettlement(
      base({
        lotStatus: 'xep_tau',
        payments: [],
        fees: [{ status: 'cho_duyet', amountUsd: 720, baseUsd: 48000 }],
        financings: [{ id: 'f', status: 'da_giai_ngan', amountUsd: 30000, feeUsd: 300 }],
        complaints: [{ status: 'mo', agreedUsd: 0, passBackPurchaseLotId: null, passBackUsd: 0 }],
      }),
    );
    expect(r.dieuKien.filter((d) => !d.dat).map((d) => d.ma)).toEqual(['chung_tu', 'nguoi_mua', 'nha_cung_cap', 'phi', 'tai_tro', 'khieu_nai']);
  });

  it('môi giới: chỉ tính phí; người mua trả thẳng nhà cung cấp do nhà cung cấp xác nhận', () => {
    const r = computeSettlement(
      base({
        dealType: 'moi_gioi',
        purchaseLots: [{ purchaseLotId: 'a', code: 'LM-1', supplierName: 'NCC A', costUsd: null }],
        payments: [
          { kind: 'tien_hang_truc_tiep', category: null, purchaseLotId: 'a', financingId: null, amountUsd: 48000 },
          { kind: 'phi_tron_goi', category: null, purchaseLotId: 'a', financingId: null, amountUsd: 720 },
        ],
      }),
    );
    expect(r.dieuKien.every((d) => d.dat)).toBe(true);
    expect(r.dong.map((d) => d.ma)).toEqual(['phi_tron_goi']);
    expect(r.bienUsd).toBe(720);
    expect(r.bienPhanTram).toBe(1.5);
  });

  it('tài trợ: phí thu xếp vốn là doanh thu, phần trả ngân hàng vượt gốc là chi phí vốn', () => {
    const r = computeSettlement(
      base({
        payments: [...base().payments, { kind: 'phi_thu_xep_von', category: null, purchaseLotId: null, financingId: 'f', amountUsd: 300 }, { kind: 'tra_ngan_hang', category: null, purchaseLotId: null, financingId: 'f', amountUsd: 30400 }],
        financings: [{ id: 'f', status: 'da_tat_toan', amountUsd: 30000, feeUsd: 300 }],
      }),
    );
    expect(r.dong.find((d) => d.ma === 'chi_phi_von')!.soTienUsd).toBe(-400);
    expect(r.dong.find((d) => d.ma === 'phi_thu_xep_von')!.soTienUsd).toBe(300);
  });

  it('Giám đốc duyệt thêm khi lỗ hoặc biên thấp hơn dự toán quá 10%', () => {
    expect(directorReview(-10, -0.1, 5).can).toBe(true);
    expect(directorReview(100, 4.4, 5)).toEqual({ can: true, lyDo: expect.stringMatching(/thấp hơn dự toán 5% là 12% \(quá 10%\)/) });
    expect(directorReview(100, 4.5, 5).can).toBe(false);
    expect(directorReview(100, 1, null).can).toBe(false);
  });

  it('gợi ý lỗi theo giám định cảng đi', () => {
    expect(faultHint('chat_luong', 'dat')).toMatch(/sau xếp tàu/);
    expect(faultHint('chung_tu', 'dat')).toBeNull();
  });
});

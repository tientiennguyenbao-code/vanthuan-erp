import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { codeFor, createUser, fullFirstLogin, NEW_PASSWORD, startApp, uniqueEmail } from './helpers';

type Agent = ReturnType<typeof request.agent>;

const terms = (soLuong: number, donGia: number, over: Record<string, unknown> = {}) => ({
  soLuong,
  donVi: 'tan',
  dungSaiPhanTram: 5,
  donGia,
  tienTe: 'USD',
  tyGiaUsd: null,
  incoterms: 'FOB',
  cangDi: 'Cát Lái',
  cangDen: 'Shanghai',
  lichGiao: 'Tháng 1/2027',
  dieuKhoanThanhToan: 'CAD',
  tyLePhiPhanTram: null,
  ghiChu: 'Ghi chú nội bộ bí mật',
  ...over,
});
const pdf = (text: string) => Buffer.from(`%PDF-1.4\n${text}\n%%EOF`);

/** Người mua không bắt buộc mã 2 lớp: đăng nhập, đổi mật khẩu tạm là vào được. */
async function buyerLogin(app: INestApplication, email: string, password: string) {
  const agent = request.agent(app.getHttpServer());
  const r = await agent.post('/api/auth/dang-nhap').send({ email, matKhau: password }).expect(200);
  expect(r.body.buoc).toBe('phai_doi_mat_khau');
  await agent.post('/api/auth/doi-mat-khau').send({ matKhauCu: password, matKhauMoi: NEW_PASSWORD }).expect(200);
  return agent;
}

describe('Cổng người mua (tiếng Anh)', () => {
  let app: INestApplication;
  let nv: Agent;
  let tp: Agent;
  let ktv: Agent;
  let b1: Agent;
  let b2: Agent;
  let ncc1: string;
  let ncc2: string;
  let buyer: string;
  let buyer2: string;
  let mh: string;
  let n = 0;
  const ids: Record<string, string> = {};

  async function partner(roles: string[], name: string) {
    const res = await nv.post('/api/doi-tac').send({ code: `NM${Date.now() % 100000}${++n}`, name, country: roles.includes('nguoi_mua') ? 'CN' : 'VN', category: 'doanh_nghiep_thuong_mai', roles }).expect(201);
    const id = res.body.id as string;
    await nv.post(`/api/doi-tac/${id}/tai-lieu`).send({ docType: 'Giấy đăng ký kinh doanh', number: `DK${n}` }).expect(201);
    await nv.post(`/api/doi-tac/${id}/trinh-tham-dinh`).send({ riskRating: 'thap', screeningNote: 'Không có trong danh sách trừng phạt' }).expect(200);
    await tp.post(`/api/doi-tac/${id}/quyet-dinh-tham-dinh`).send({ dongY: true }).expect(200);
    return id;
  }
  async function signed(body: Record<string, unknown>) {
    const c = await nv.post('/api/hop-dong').send({ matHangId: mh, ...body }).expect(201);
    await nv.post(`/api/hop-dong/${c.body.id}/trinh-ky`).expect(200);
    const g = await fullFirstLogin(app, await createUser(app, ['GIAM_DOC'], 'gdnm'));
    await g.agent.post(`/api/hop-dong/${c.body.id}/ky`).send({ ma2Lop: codeFor(g.secret, 1) }).expect(200);
    return c.body.id as string;
  }
  async function purchaseLot(contractId: string, kg: number) {
    const id = (await nv.post('/api/lo-mua').send({ hopDongId: contractId }).expect(201)).body.id as string;
    await nv.post(`/api/lo-mua/${id}/su-kien`).send({ loai: 'thu_gom', khoiLuongKg: kg }).expect(200);
    await nv.post(`/api/lo-mua/${id}/su-kien`).send({ loai: 'so_che', khoiLuongKg: kg }).expect(200);
    return id;
  }
  async function exportLot(counter: string, lm: string, kg: number) {
    const lx = (await nv.post('/api/lo-xuat').send({ hopDongDoiUngId: counter, thiTruong: 'CN', etd: '2027-01-20' }).expect(201)).body.id as string;
    await nv.post(`/api/lo-xuat/${lx}/phan-bo`).send({ loMuaId: lm, khoiLuongKg: kg }).expect(201);
    for (const p of (await tp.get(`/api/lo-xuat/${lx}`).expect(200)).body.phanBo) await tp.post(`/api/phan-bo/${p.id}/duyet`).expect(200);
    return lx;
  }
  async function ship(lx: string, bl: string) {
    const d = (await tp.get(`/api/lo-xuat/${lx}/chung-tu`).expect(200)).body.chungTu as { id: string; status: string; obsolete: boolean }[];
    for (const x of d.filter((x) => !x.obsolete && x.status !== 'khong_ap_dung' && x.status !== 'da_gui')) {
      await tp.post(`/api/chung-tu/${x.id}/khong-ap-dung`).send({ lyDo: 'Kiểm thử cổng người mua' }).expect(204);
    }
    const adv = (body: Record<string, unknown> = {}) => nv.post(`/api/lo-xuat/${lx}/chuyen-buoc`).send(body).expect(200);
    await adv();
    await adv();
    await nv.post(`/api/lo-xuat/${lx}/giam-dinh`).send({ ketQua: 'dat', donViGiamDinh: 'Vinacontrol' }).expect(200);
    await nv.put(`/api/lo-xuat/${lx}/booking`).send({ hangTau: 'COSCO', soBooking: `BK${bl}`, tauChuyen: 'COSCO PRIDE 012E', container: [{ so: 'CSNU1234567', chi: 'C-1' }] }).expect(200);
    await adv();
    await adv({ soVanDon: bl, ngayTauChay: '2026-11-20' });
  }
  type Doc = { id: string; name: string; status: string; files: { id: string }[]; canReview: boolean; lastReview: { decision: string; comment: string | null } | null };

  beforeAll(async () => {
    app = await startApp();
    nv = (await fullFirstLogin(app, await createUser(app, ['NHAN_VIEN_KD'], 'nmnv'))).agent;
    tp = (await fullFirstLogin(app, await createUser(app, ['TRUONG_PHONG_KD'], 'nmtp'))).agent;
    ktv = (await fullFirstLogin(app, await createUser(app, ['KE_TOAN_VIEN'], 'nmktv'))).agent;
    ncc1 = await partner(['nha_cung_cap'], `HTX Bí Mật Một ${Date.now() % 1000}`);
    ncc2 = await partner(['nha_cung_cap'], `HTX Đứng Tên Hai ${Date.now() % 1000}`);
    buyer = await partner(['nguoi_mua'], 'Shanghai Coffee Imports');
    buyer2 = await partner(['nguoi_mua'], 'Other Buyer GmbH');
    mh = (await tp.post('/api/danh-muc/mat-hang').send({ code: `NMROB${Date.now() % 100000}`, name: 'Cà phê Robusta', sector: 'ca_phe', hsCode: '090111' }).expect(201)).body.id;

    // Mua đứt: mua 4.000, bán 4.800 USD/tấn
    ids.mua = await signed({ loai: 'mua', benBanId: ncc1, dieuKhoan: terms(10, 4000, { tyLePhiPhanTram: 1.5 }) });
    ids.ban = await signed({ loai: 'ban', benMuaId: buyer, dieuKhoan: terms(10, 4800, { duyetMauTruocXuat: true }) });
    ids.lm1 = await purchaseLot(ids.mua, 10000);
    // Môi giới: nhà cung cấp 2 bán thẳng cho người mua
    ids.mg = await signed({ loai: 'moi_gioi', benBanId: ncc2, dieuKhoan: terms(10, 4700, { tyLePhiPhanTram: 2 }) });
    ids.tt = await signed({ loai: 'mua_ban_truc_tiep', benBanId: ncc2, benMuaId: buyer, dieuKhoan: terms(10, 4750) });
    ids.lm2 = await purchaseLot(ids.mg, 10000);
    ids.lxA = await exportLot(ids.ban, ids.lm1, 10000);
    ids.lxB = await exportLot(ids.tt, ids.lm2, 10000);
  });
  afterAll(async () => {
    await app.close();
  });

  it('nhân viên mời người mua vào cổng; người mua không vào được trang nội bộ', async () => {
    await nv.post(`/api/doi-tac/${buyer}/tai-khoan-cong`).send({ email: uniqueEmail('x'), hoTen: 'X' }).expect(400);
    await nv.post(`/api/doi-tac/${ncc1}/tai-khoan-cong`).send({ email: uniqueEmail('x'), hoTen: 'X', vai: 'nguoi_mua' }).expect(400);
    const e1 = uniqueEmail('buyer1');
    const r1 = await nv.post(`/api/doi-tac/${buyer}/tai-khoan-cong`).send({ email: e1, hoTen: 'Li Wei', vai: 'nguoi_mua' }).expect(201);
    b1 = await buyerLogin(app, e1, r1.body.matKhauTam);
    const e2 = uniqueEmail('buyer2');
    const r2 = await nv.post(`/api/doi-tac/${buyer2}/tai-khoan-cong`).send({ email: e2, hoTen: 'Hans', vai: 'nguoi_mua' }).expect(201);
    b2 = await buyerLogin(app, e2, r2.body.matKhauTam);

    await b1.get('/api/lo-xuat').expect(403);
    await b1.get('/api/hop-dong').expect(403);
    await b1.get(`/api/lo-xuat/${ids.lxA}/chung-tu`).expect(403);
    await b1.get('/api/cong/lo').expect(403);
    await nv.get('/api/cong-nguoi-mua').expect(403);
  });

  it('người mua thấy hợp đồng đã ký, lô của mình; không thấy giá mua, tỷ lệ phí, ghi chú nội bộ', async () => {
    const o = (await b1.get('/api/cong-nguoi-mua').expect(200)).body;
    expect(o.buyerName).toBe('Shanghai Coffee Imports');
    expect(o.contracts.map((c: { id: string }) => c.id).sort()).toEqual([ids.ban, ids.tt].sort());
    const ban = o.contracts.find((c: { id: string }) => c.id === ids.ban);
    expect(ban).toMatchObject({ seller: 'Van Thuan Global Co., Ltd', dealType: 'mua_dut', terms: { quantity: 10, unitPrice: 4800, incoterms: 'FOB', preShipmentSample: true } });
    expect(ban.verificationCode).toMatch(/^[0-9A-F]{4}(-[0-9A-F]{4}){15}$/);
    const tt = o.contracts.find((c: { id: string }) => c.id === ids.tt);
    expect(tt.seller).toContain('HTX Đứng Tên Hai');
    expect(o.lots.map((l: { id: string }) => l.id).sort()).toEqual([ids.lxA, ids.lxB].sort());
    const s = JSON.stringify(o);
    expect(s).not.toMatch(/4000|4700|tyLePhi|Ghi chú nội bộ|HTX Bí Mật Một/);

    expect((await b2.get('/api/cong-nguoi-mua').expect(200)).body).toMatchObject({ contracts: [], lots: [] });
    await b2.get(`/api/cong-nguoi-mua/lo/${ids.lxA}`).expect(404);
  });

  it('lô mua đứt: người gửi hàng là Vạn Thuận, không lộ tên nhà cung cấp; thấy khoản phải trả của mình', async () => {
    await ktv.post(`/api/lo-xuat/${ids.lxA}/thanh-toan`).send({ loai: 'tien_hang_nguoi_mua', moc: 'chung_tu', ngayDenHan: '2027-01-25', soTien: 48000, tienTe: 'USD' }).expect(201);
    await ktv.post(`/api/lo-xuat/${ids.lxA}/thanh-toan`).send({ loai: 'tien_hang_ncc', loMuaId: ids.lm1, moc: 'giam_dinh', soTien: 40000, tienTe: 'USD' }).expect(201);
    const d = (await b1.get(`/api/cong-nguoi-mua/lo/${ids.lxA}`).expect(200)).body;
    expect(d.shipper).toBe('Van Thuan Global Co., Ltd');
    expect(d.payments).toEqual([expect.objectContaining({ payTo: 'van_thuan', amount: 48000, currency: 'USD', status: 'open' })]);
    expect(d.canComplain).toBe(false);
    expect(d.traceability).toEqual({ growingAreaCodes: expect.any(Array), packingFacilityCodes: expect.any(Array) });
    expect(JSON.stringify(d)).not.toMatch(/HTX Bí Mật Một|40000/);
    const o = (await b1.get('/api/cong-nguoi-mua').expect(200)).body;
    expect(o.outstanding).toEqual([{ currency: 'USD', amount: 48000 }]);
  });

  it('người mua cho ý kiến bản nháp chứng từ; nhân viên thấy ý kiến trong danh mục', async () => {
    const staff = (await nv.get(`/api/lo-xuat/${ids.lxA}/chung-tu`).expect(200)).body.chungTu as { id: string; code: string; supplierPartnerId: string | null; obsolete: boolean; yKienNguoiMua: unknown }[];
    const inv = staff.find((x) => x.code === 'hoa_don' && !x.supplierPartnerId && !x.obsolete)!;
    const own = staff.find((x) => !!x.supplierPartnerId && !x.obsolete);
    let docs = (await b1.get(`/api/cong-nguoi-mua/lo/${ids.lxA}`).expect(200)).body.documents as Doc[];
    expect(docs.find((x) => x.id === inv.id)).toMatchObject({ status: 'thieu', canReview: false, files: [] });
    if (own) expect(docs.some((x) => x.id === own.id)).toBe(false);
    await b1.post(`/api/cong-nguoi-mua/chung-tu/${inv.id}/y-kien`).send({ dongY: true }).expect(400);

    await nv.put(`/api/chung-tu/${inv.id}`).send({ trangThai: 'nhap', so: 'VT-INV-001', ngayCap: '2026-11-26' }).expect(204);
    const f = await nv.post(`/api/chung-tu/${inv.id}/tep`).attach('tep', pdf('ban nhap hoa don'), 'invoice-draft.pdf').expect(201);
    docs = (await b1.get(`/api/cong-nguoi-mua/lo/${ids.lxA}`).expect(200)).body.documents as Doc[];
    expect(docs.find((x) => x.id === inv.id)).toMatchObject({ status: 'nhap', canReview: true, files: [expect.objectContaining({ id: f.body.id })] });
    const link = await b1.post(`/api/tep/${f.body.id}/lien-ket`).expect(200);
    expect(Buffer.from((await b1.get(link.body.duongDan).buffer(true).expect(200)).body).toString()).toContain('ban nhap hoa don');
    await b2.post(`/api/tep/${f.body.id}/lien-ket`).expect(403);
    await b2.post(`/api/cong-nguoi-mua/chung-tu/${inv.id}/y-kien`).send({ dongY: true }).expect(404);

    await b1.post(`/api/cong-nguoi-mua/chung-tu/${inv.id}/y-kien`).send({ dongY: false }).expect(400);
    await b1.post(`/api/cong-nguoi-mua/chung-tu/${inv.id}/y-kien`).send({ dongY: false, noiDung: 'Please add the L/C number' }).expect(200);
    const after = (await nv.get(`/api/lo-xuat/${ids.lxA}/chung-tu`).expect(200)).body.chungTu.find((x: { id: string }) => x.id === inv.id);
    expect(after.yKienNguoiMua).toMatchObject({ quyetDinh: 'yeu_cau_sua', noiDung: 'Please add the L/C number', nguoi: 'Li Wei' });
    await b1.post(`/api/cong-nguoi-mua/chung-tu/${inv.id}/y-kien`).send({ dongY: true }).expect(200);
    docs = (await b1.get(`/api/cong-nguoi-mua/lo/${ids.lxA}`).expect(200)).body.documents as Doc[];
    expect(docs.find((x) => x.id === inv.id)!.lastReview).toMatchObject({ decision: 'dong_y' });
    expect((await b1.get('/api/cong-nguoi-mua').expect(200)).body.lots.find((l: { id: string }) => l.id === ids.lxA).draftsToReview).toBe(1);
  });

  it('lô môi giới: người gửi hàng là nhà cung cấp; sau xếp tàu người mua tự mở khiếu nại', async () => {
    let d = (await b1.get(`/api/cong-nguoi-mua/lo/${ids.lxB}`).expect(200)).body;
    expect(d.shipper).toContain('HTX Đứng Tên Hai');
    await b1.post(`/api/lo-xuat/${ids.lxB}/khieu-nai`).send({ loai: 'chat_luong', moTa: 'Moisture above 13%' }).expect(400);
    await ship(ids.lxB, `BLNM${Date.now() % 100000}`);
    d = (await b1.get(`/api/cong-nguoi-mua/lo/${ids.lxB}`).expect(200)).body;
    expect(d).toMatchObject({ status: 'xep_tau', vessel: 'COSCO PRIDE 012E', canComplain: true });
    await b2.post(`/api/lo-xuat/${ids.lxB}/khieu-nai`).send({ loai: 'chat_luong', moTa: 'Moisture above contract limit' }).expect(403);
    await b1.post(`/api/lo-xuat/${ids.lxB}/khieu-nai`).send({ loai: 'chat_luong', moTa: 'Moisture 13.8% at destination, above 12.5% in contract', soTienYeuCau: 1200 }).expect(201);
    d = (await b1.get(`/api/cong-nguoi-mua/lo/${ids.lxB}`).expect(200)).body;
    expect(d.complaints).toEqual([expect.objectContaining({ kind: 'chat_luong', status: 'mo', claimedAmount: 1200 })]);
    const staff = (await nv.get(`/api/lo-xuat/${ids.lxB}/khieu-nai`).expect(200)).body.khieuNai;
    expect(staff[0]).toMatchObject({ openedByName: 'Li Wei' });
  });
});

import { INestApplication } from '@nestjs/common';
import { codeFor, createUser, fullFirstLogin, startApp } from './helpers';

type Agent = Awaited<ReturnType<typeof fullFirstLogin>>['agent'];

const today = () => new Date().toISOString().slice(0, 10);
const terms = (over: Record<string, unknown> = {}) => ({
  soLuong: 40,
  donVi: 'tan',
  dungSaiPhanTram: 5,
  donGia: 4700,
  tienTe: 'USD',
  tyGiaUsd: null,
  incoterms: 'FOB',
  cangDi: 'Cát Lái',
  cangDen: 'Hamburg',
  lichGiao: 'Hai đợt tháng 2 và 3/2027',
  dieuKhoanThanhToan: 'CAD',
  tyLePhiPhanTram: null,
  ghiChu: null,
  ...over,
});

describe('Bán hàng: hợp đồng nhiều đợt, giá trừ lùi, mẫu trước xuất', () => {
  let app: INestApplication;
  let nv: Agent;
  let nv2: Agent;
  let tp: Agent;
  let ncc: string;
  let buyer: string;
  let mh: string;
  let mhTieu: string;
  let n = 0;

  async function partner(roles: string[], country: string) {
    const res = await nv.post('/api/doi-tac').send({ code: `BD${Date.now() % 100000}${++n}`, name: `Đối tác BD ${n}`, country, category: roles.includes('nguoi_mua') ? 'nha_nhap_khau' : 'htx', roles }).expect(201);
    const id = res.body.id as string;
    await nv.post(`/api/doi-tac/${id}/tai-lieu`).send({ docType: 'Giấy đăng ký kinh doanh', number: `DK${n}` }).expect(201);
    await nv.post(`/api/doi-tac/${id}/trinh-tham-dinh`).send({ riskRating: 'thap', screeningNote: 'Không có trong danh sách trừng phạt' }).expect(200);
    await tp.post(`/api/doi-tac/${id}/quyet-dinh-tham-dinh`).send({ dongY: true }).expect(200);
    return id;
  }
  async function draft(dieuKhoan: Record<string, unknown>, matHangId = mh) {
    return (await nv.post('/api/hop-dong').send({ matHangId, loai: 'mua_ban_truc_tiep', benBanId: ncc, benMuaId: buyer, dieuKhoan }).expect(201)).body.id as string;
  }
  async function signed(dieuKhoan: Record<string, unknown>) {
    const id = await draft(dieuKhoan);
    await nv.post(`/api/hop-dong/${id}/trinh-ky`).expect(200);
    // mỗi lần ký một Giám đốc mới để mã 2 lớp không trùng
    const gd = await fullFirstLogin(app, await createUser(app, ['GIAM_DOC'], 'bdgd'));
    await gd.agent.post(`/api/hop-dong/${id}/ky`).send({ ma2Lop: codeFor(gd.secret, 1) }).expect(200);
    return id;
  }

  beforeAll(async () => {
    app = await startApp();
    nv = (await fullFirstLogin(app, await createUser(app, ['NHAN_VIEN_KD'], 'bdnv'))).agent;
    nv2 = (await fullFirstLogin(app, await createUser(app, ['NHAN_VIEN_KD'], 'bdnv2'))).agent;
    tp = (await fullFirstLogin(app, await createUser(app, ['TRUONG_PHONG_KD'], 'bdtp'))).agent;
    ncc = await partner(['nha_cung_cap'], 'VN');
    buyer = await partner(['nguoi_mua'], 'DE');
    mh = (await tp.post('/api/danh-muc/mat-hang').send({ code: `RD${Date.now() % 100000}`, name: 'Cà phê Robusta S16', sector: 'ca_phe', hsCode: '090111' }).expect(201)).body.id;
    mhTieu = (await tp.post('/api/danh-muc/mat-hang').send({ code: `TD${Date.now() % 100000}`, name: 'Tiêu trắng', sector: 'gia_vi', hsCode: '090412' }).expect(201)).body.id;
  });

  afterAll(async () => {
    await app.close();
  });

  it('không trình ký được khi tổng các đợt lệch số lượng, hoặc giá trừ lùi cho hàng không phải cà phê', async () => {
    const lech = await draft(terms({ dotGiao: [{ thang: '2027-02', soLuong: 20 }, { thang: '2027-03', soLuong: 15 }] }));
    const r = await nv.post(`/api/hop-dong/${lech}/trinh-ky`).expect(400);
    expect(JSON.stringify(r.body)).toContain('đợt');
    const tieu = await draft(terms({ giaTruLui: { san: 'ICE_LONDON', kyHan: '2027-03', chenhLech: -100 } }), mhTieu);
    const r2 = await nv.post(`/api/hop-dong/${tieu}/trinh-ky`).expect(400);
    expect(JSON.stringify(r2.body)).toContain('cà phê');
    const vnd = await draft(terms({ tienTe: 'VND', tyGiaUsd: 25400, giaTruLui: { san: 'ICE_LONDON', kyHan: '2027-03', chenhLech: -100 } }));
    await nv.post(`/api/hop-dong/${vnd}/trinh-ky`).expect(400);
  });

  it('hợp đồng hai đợt: mỗi đợt một lô xuất; theo dõi tiến độ giao', async () => {
    const c = await signed(terms({ dotGiao: [{ thang: '2027-02', soLuong: 20 }, { thang: '2027-03', soLuong: 20 }] }));
    // phải chọn đợt
    await nv.post('/api/lo-xuat').send({ hopDongDoiUngId: c, thiTruong: 'EU' }).expect(400);
    await nv.post('/api/lo-xuat').send({ hopDongDoiUngId: c, thiTruong: 'EU', dot: 3 }).expect(400);
    const l1 = (await nv.post('/api/lo-xuat').send({ hopDongDoiUngId: c, thiTruong: 'EU', dot: 1, etd: '2027-02-15' }).expect(201)).body.id;
    await nv.post('/api/lo-xuat').send({ hopDongDoiUngId: c, thiTruong: 'EU', dot: 1 }).expect(400);
    const usable = (await nv.get('/api/lo-mua/hop-dong-kha-dung').expect(200)).body.choLoXuat.find((x: { id: string }) => x.id === c);
    expect(usable.dotGiao).toEqual([{ dot: 2, thang: '2027-03', soLuong: 20, donVi: 'tan' }]);
    await nv.post('/api/lo-xuat').send({ hopDongDoiUngId: c, thiTruong: 'EU', dot: 2, etd: '2027-03-15' }).expect(201);

    const lot = (await nv.get(`/api/lo-xuat/${l1}`).expect(200)).body;
    expect(lot.shipmentNo).toBe(1);
    expect(lot.hopDong.soLuongKg).toBe(20000);

    const p = (await nv.get(`/api/hop-dong/${c}/thuc-hien`).expect(200)).body.thucHien;
    expect(p.nhieuDot).toBe(true);
    expect(p.tongKg).toBe(40000);
    expect(p.daGiaoKg).toBe(0);
    expect(p.toiThieuKg).toBe(38000);
    expect(p.dot.map((d: { dot: number; keHoachKg: number; lo: { id: string } | null }) => [d.dot, d.keHoachKg, !!d.lo])).toEqual([
      [1, 20000, true],
      [2, 20000, true],
    ]);
    await nv2.get(`/api/hop-dong/${c}/thuc-hien`).expect(403);
  });

  it('giá trừ lùi: chốt từng phần, không vượt khối lượng; chưa chốt đủ thì chặn xếp tàu', async () => {
    const c = await signed(terms({ soLuong: 20, giaTruLui: { san: 'ICE_LONDON', kyHan: '2027-03', chenhLech: -120 } }));
    const lx = (await nv.post('/api/lo-xuat').send({ hopDongDoiUngId: c, thiTruong: 'EU', etd: '2027-02-20' }).expect(201)).body.id;
    let s = (await nv.get(`/api/lo-xuat/${lx}/ban-hang`).expect(200)).body;
    expect(s.giaTruLui).toMatchObject({ san: 'ICE_LONDON', chenhLech: -120, canChotKg: 20000, daChotKg: 0, toiDaKg: 21000 });
    expect(s.thieuBanHang).toEqual(['Còn 20 tấn chưa chốt giá']);
    expect(s.quyen.chotGia).toBe(true);

    await nv2.post(`/api/lo-xuat/${lx}/ban-hang/chot-gia`).send({ ngayChot: today(), soKg: 1000, giaSan: 4900 }).expect(403);
    const f1 = (await nv.post(`/api/lo-xuat/${lx}/ban-hang/chot-gia`).send({ ngayChot: today(), soKg: 12000, giaSan: 4900 }).expect(201)).body;
    expect(f1.finalPrice).toBe(4780);
    await nv.post(`/api/lo-xuat/${lx}/ban-hang/chot-gia`).send({ ngayChot: today(), soKg: 9500, giaSan: 5000 }).expect(400);
    await nv.post(`/api/lo-xuat/${lx}/ban-hang/chot-gia`).send({ ngayChot: today(), soKg: 8000, giaSan: 5020 }).expect(201);
    s = (await nv.get(`/api/lo-xuat/${lx}/ban-hang`).expect(200)).body;
    expect(s.giaTruLui.daChotKg).toBe(20000);
    expect(s.giaTruLui.giaBinhQuan).toBe(4828); // (12×4780 + 8×4900) / 20
    expect(s.thieuBanHang).toEqual([]);

    // huỷ một lần chốt thì lại thiếu
    await nv.post(`/api/lo-xuat/${lx}/ban-hang/chot-gia/${f1.id}/huy`).send({ lyDo: 'x' }).expect(400);
    await nv.post(`/api/lo-xuat/${lx}/ban-hang/chot-gia/${f1.id}/huy`).send({ lyDo: 'Người mua gửi nhầm lệnh' }).expect(200);
    await nv.post(`/api/lo-xuat/${lx}/ban-hang/chot-gia/${f1.id}/huy`).send({ lyDo: 'Người mua gửi nhầm lệnh' }).expect(400);
    s = (await nv.get(`/api/lo-xuat/${lx}/ban-hang`).expect(200)).body;
    expect(s.thieuBanHang).toEqual(['Còn 12 tấn chưa chốt giá']);
    expect(s.giaTruLui.lanChot).toHaveLength(2);

    // ghi vào sổ cái của hợp đồng
    const ledger = (await nv.get(`/api/hop-dong/${c}`).expect(200)).body;
    expect(JSON.stringify(ledger)).toContain('chot_gia');

    // hợp đồng giá cố định thì không chốt được
    const fixed = await signed(terms({ soLuong: 20 }));
    const lx2 = (await nv.post('/api/lo-xuat').send({ hopDongDoiUngId: fixed, thiTruong: 'EU' }).expect(201)).body.id;
    await nv.post(`/api/lo-xuat/${lx2}/ban-hang/chot-gia`).send({ ngayChot: today(), soKg: 1000, giaSan: 4900 }).expect(400);
    expect((await nv.get(`/api/lo-xuat/${lx2}/ban-hang`).expect(200)).body).toMatchObject({ giaTruLui: null, thieuBanHang: [] });
  });

  it('hợp đồng cần duyệt mẫu trước xuất: chưa có mẫu đạt thì thiếu điều kiện xếp tàu', async () => {
    const c = await signed(terms({ soLuong: 20, duyetMauTruocXuat: true }));
    const lx = (await nv.post('/api/lo-xuat').send({ hopDongDoiUngId: c, thiTruong: 'EU' }).expect(201)).body.id;
    let s = (await nv.get(`/api/lo-xuat/${lx}/ban-hang`).expect(200)).body;
    expect(s.canMauTruocXuat).toBe(true);
    expect(s.thieuBanHang).toEqual(['Người mua chưa duyệt mẫu trước xuất']);
    const m = (await nv.post('/api/mau').send({ loai: 'truoc_xuat', doiTacId: buyer, matHangId: mh, loXuatId: lx }).expect(201)).body.id;
    await nv.post(`/api/mau/${m}/gui`).send({ hangChuyenPhat: 'DHL', ngayGui: today() }).expect(200);
    await nv.post(`/api/mau/${m}/ket-qua`).send({ dat: false, ngay: today(), nhanXet: 'Độ ẩm 13,2%' }).expect(200);
    s = (await nv.get(`/api/lo-xuat/${lx}/ban-hang`).expect(200)).body;
    expect(s.thieuBanHang).toEqual(['Mẫu trước xuất bị người mua đánh giá không đạt']);
    const m2 = (await nv.post('/api/mau').send({ loai: 'truoc_xuat', doiTacId: buyer, matHangId: mh, loXuatId: lx }).expect(201)).body.id;
    await nv.post(`/api/mau/${m2}/gui`).send({ hangChuyenPhat: 'DHL', ngayGui: today() }).expect(200);
    await nv.post(`/api/mau/${m2}/ket-qua`).send({ dat: true, ngay: today(), diemThuNem: 80 }).expect(200);
    s = (await nv.get(`/api/lo-xuat/${lx}/ban-hang`).expect(200)).body;
    expect(s.thieuBanHang).toEqual([]);
    expect(s.mauTruocXuat).toHaveLength(2);
    // danh sách tài liệu của lô cũng hiện điều kiện bán hàng
    const ck = (await nv.get(`/api/lo-xuat/${lx}/chung-tu`).expect(200)).body;
    expect(ck.thieuTruocXepTau).not.toContain('Người mua chưa duyệt mẫu trước xuất');
  });
});

import { INestApplication } from '@nestjs/common';
import { codeFor, createUser, fullFirstLogin, startApp } from './helpers';

type Agent = Awaited<ReturnType<typeof fullFirstLogin>>['agent'];

const today = () => new Date().toISOString().slice(0, 10);
const later = (days: number) => new Date(Date.now() + days * 864e5).toISOString().slice(0, 10);
const terms = (soLuong: number) => ({
  soLuong,
  donVi: 'tan',
  dungSaiPhanTram: 5,
  donGia: 4800,
  tienTe: 'USD',
  tyGiaUsd: null,
  incoterms: 'FOB',
  cangDi: 'Cát Lái',
  cangDen: 'Hamburg',
  lichGiao: 'Tháng 2/2027',
  dieuKhoanThanhToan: 'CAD',
  tyLePhiPhanTram: null,
  ghiChu: null,
});

describe('Bán hàng: phiếu hỏi hàng và mẫu hàng', () => {
  let app: INestApplication;
  let nv: Agent;
  let nv2: Agent;
  let tp: Agent;
  let tm: Agent;
  let ncc: string;
  let buyer: string;
  let buyer2: string;
  let mh: string;
  let mhTieu: string;
  let n = 0;

  async function partner(roles: string[], country: string) {
    const res = await nv.post('/api/doi-tac').send({ code: `BH${Date.now() % 100000}${++n}`, name: `Đối tác BH ${n}`, country, category: roles.includes('nguoi_mua') ? 'nha_nhap_khau' : 'htx', roles }).expect(201);
    const id = res.body.id as string;
    await nv.post(`/api/doi-tac/${id}/tai-lieu`).send({ docType: 'Giấy đăng ký kinh doanh', number: `DK${n}` }).expect(201);
    await nv.post(`/api/doi-tac/${id}/trinh-tham-dinh`).send({ riskRating: 'thap', screeningNote: 'Không có trong danh sách trừng phạt' }).expect(200);
    await tp.post(`/api/doi-tac/${id}/quyet-dinh-tham-dinh`).send({ dongY: true }).expect(200);
    return id;
  }
  const inquiry = (over: Record<string, unknown> = {}) => ({
    doiTacId: buyer,
    matHangId: mh,
    nguon: 'email',
    ngayNhan: today(),
    soLuong: 100,
    donVi: 'tan',
    quyCach: 'Robusta S18, độ ẩm 12,5%',
    thangGiao: '2027-02',
    incoterms: 'FOB',
    cangDen: 'Hamburg',
    giaMucTieu: 4750,
    tienTe: 'USD',
    ...over,
  });
  const quoteBody = (hoiHangId: string | null, over: Record<string, unknown> = {}) => ({
    loai: 'ban',
    doiTacId: buyer,
    matHangId: mh,
    hoiHangId,
    soLuong: 100,
    donVi: 'tan',
    donGia: 4800,
    tienTe: 'USD',
    incoterms: 'FOB',
    hieuLucDen: later(7),
    ...over,
  });

  beforeAll(async () => {
    app = await startApp();
    nv = (await fullFirstLogin(app, await createUser(app, ['NHAN_VIEN_KD'], 'bhnv'))).agent;
    nv2 = (await fullFirstLogin(app, await createUser(app, ['NHAN_VIEN_KD'], 'bhnv2'))).agent;
    tp = (await fullFirstLogin(app, await createUser(app, ['TRUONG_PHONG_KD'], 'bhtp'))).agent;
    tm = (await fullFirstLogin(app, await createUser(app, ['NHAN_VIEN_THU_MUA'], 'bhtm'))).agent;
    ncc = await partner(['nha_cung_cap'], 'VN');
    buyer = await partner(['nguoi_mua'], 'DE');
    buyer2 = await partner(['nguoi_mua'], 'US');
    mh = (await tp.post('/api/danh-muc/mat-hang').send({ code: `RB${Date.now() % 100000}`, name: 'Cà phê Robusta S18', sector: 'ca_phe', hsCode: '090111' }).expect(201)).body.id;
    mhTieu = (await tp.post('/api/danh-muc/mat-hang').send({ code: `TI${Date.now() % 100000}`, name: 'Tiêu đen 550 g/l', sector: 'gia_vi', hsCode: '090411' }).expect(201)).body.id;
  });

  afterAll(async () => {
    await app.close();
  });

  it('phiếu hỏi hàng: chỉ đối tác người mua; không nhận ngày tương lai; thu mua không lập được', async () => {
    await nv.post('/api/hoi-hang').send(inquiry({ doiTacId: ncc })).expect(400);
    await nv.post('/api/hoi-hang').send(inquiry({ ngayNhan: later(2) })).expect(400);
    await tm.post('/api/hoi-hang').send(inquiry()).expect(403);
    await tm.get('/api/hoi-hang').expect(403);
    const r = await nv.post('/api/hoi-hang').send(inquiry()).expect(201);
    expect(r.body.code).toMatch(/^YCH-\d{4}-\d{4}$/);
    const g = (await nv.get(`/api/hoi-hang/${r.body.id}`).expect(200)).body;
    expect(g.status).toBe('moi');
    expect(g.quaHan).toBe(false);
    expect(g.quyen.lapBaoGia).toBe(true);
    // nhân viên khác không thấy, trưởng phòng thấy
    await nv2.get(`/api/hoi-hang/${r.body.id}`).expect(403);
    await tp.get(`/api/hoi-hang/${r.body.id}`).expect(200);
    expect((await nv2.get('/api/hoi-hang').expect(200)).body.hoiHang.some((i: { id: string }) => i.id === r.body.id)).toBe(false);
  });

  it('phiếu cũ chưa báo giá bị đánh dấu quá hạn và lọc được', async () => {
    const r = await nv.post('/api/hoi-hang').send(inquiry({ ngayNhan: '2026-11-02' })).expect(201);
    const list = (await nv.get('/api/hoi-hang?trangThai=qua_han').expect(200)).body;
    expect(list.hoiHang.map((i: { id: string }) => i.id)).toContain(r.body.id);
    expect(list.tongHop.quaHan).toBeGreaterThanOrEqual(1);
    await nv.post(`/api/hoi-hang/${r.body.id}/huy`).send({ lyDo: 'Trùng phiếu' }).expect(200);
    expect((await nv.get(`/api/hoi-hang/${r.body.id}`).expect(200)).body.status).toBe('huy');
  });

  it('báo giá lập từ phiếu: phiếu sang đang báo giá; chấp nhận thì phiếu thắng', async () => {
    const i = (await nv.post('/api/hoi-hang').send(inquiry()).expect(201)).body.id;
    // khác người mua thì không gắn được
    await nv.post('/api/bao-gia').send(quoteBody(i, { doiTacId: buyer2 })).expect(400);
    // báo giá mua không gắn phiếu hỏi hàng
    await nv.post('/api/bao-gia').send({ ...quoteBody(i), loai: 'mua', doiTacId: ncc, tienTe: 'VND', tyGiaUsd: 25400, donGia: 110_000_000 }).expect(400);

    const mua = (await nv.post('/api/bao-gia').send({ ...quoteBody(null), loai: 'mua', doiTacId: ncc, tienTe: 'VND', tyGiaUsd: 25400, donGia: 110_000_000, incoterms: 'EXW' }).expect(201)).body.id;
    await nv.post(`/api/bao-gia/${mua}/gui`).expect(200);
    const ban = (await nv.post('/api/bao-gia').send(quoteBody(i, { baoGiaNguonId: mua })).expect(201)).body.id;
    let g = (await nv.get(`/api/hoi-hang/${i}`).expect(200)).body;
    expect(g.status).toBe('dang_bao_gia');
    expect(g.baoGia.map((q: { id: string }) => q.id)).toEqual([ban]);
    expect(g.quyen.huy).toBe(false);
    await nv.post(`/api/hoi-hang/${i}/huy`).send({ lyDo: 'Không cần nữa' }).expect(400);
    // đã có báo giá thì không đổi người mua của phiếu
    await nv.put(`/api/hoi-hang/${i}`).send(inquiry({ doiTacId: buyer2 })).expect(400);

    await nv.post(`/api/bao-gia/${ban}/gui`).expect(200);
    await nv.post(`/api/bao-gia/${ban}/chap-nhan`).send({ loaiGiaoDich: 'mua_dut' }).expect(200);
    g = (await nv.get(`/api/hoi-hang/${i}`).expect(200)).body;
    expect(g.status).toBe('thang');
    expect(g.quyen.sua).toBe(false);
    await nv.post('/api/bao-gia').send(quoteBody(i)).expect(400);
  });

  it('đánh dấu thua cần lý do; tổng hợp tính tỷ lệ thắng và lý do thua', async () => {
    const i = (await nv.post('/api/hoi-hang').send(inquiry({ doiTacId: buyer2 })).expect(201)).body.id;
    await nv.post(`/api/hoi-hang/${i}/thua`).send({ lyDo: 'khac' }).expect(400);
    await nv2.post(`/api/hoi-hang/${i}/thua`).send({ lyDo: 'gia' }).expect(403);
    await nv.post(`/api/hoi-hang/${i}/thua`).send({ lyDo: 'gia', ghiChu: 'Đối thủ chào thấp hơn 60 USD/tấn' }).expect(200);
    await nv.post(`/api/hoi-hang/${i}/thua`).send({ lyDo: 'gia' }).expect(400);
    const t = (await tp.get('/api/hoi-hang').expect(200)).body.tongHop;
    expect(t.theoTrangThai.thang).toBeGreaterThanOrEqual(1);
    expect(t.theoTrangThai.thua).toBeGreaterThanOrEqual(1);
    expect(t.lyDoThua.gia).toBeGreaterThanOrEqual(1);
    expect(t.tyLeThang).toBeGreaterThan(0);
  });

  it('mẫu chào hàng: gửi, ghi kết quả có điểm thử nếm; không đạt phải có nhận xét', async () => {
    const i = (await nv.post('/api/hoi-hang').send(inquiry()).expect(201)).body.id;
    // phiếu và mẫu phải cùng người mua
    await nv.post('/api/mau').send({ loai: 'chao_hang', doiTacId: buyer2, matHangId: mh, hoiHangId: i }).expect(400);
    const m = (await nv.post('/api/mau').send({ loai: 'chao_hang', doiTacId: buyer, matHangId: mh, hoiHangId: i, khoiLuongG: 300, moTa: 'Robusta S18 vụ 2026/27' }).expect(201)).body;
    expect(m.code).toMatch(/^MAU-\d{4}-\d{4}$/);
    await nv.post(`/api/mau/${m.id}/ket-qua`).send({ dat: true, ngay: today() }).expect(400);
    await nv.post(`/api/mau/${m.id}/gui`).send({ hangChuyenPhat: 'DHL', soVanDon: '1234567890', ngayGui: today() }).expect(200);
    await nv.post(`/api/mau/${m.id}/ket-qua`).send({ dat: false, ngay: today() }).expect(400);
    await nv.post(`/api/mau/${m.id}/ket-qua`).send({ dat: true, ngay: today(), diemThuNem: 81.5, nhanXet: 'Sạch, đậm' }).expect(200);
    const g = (await nv.get(`/api/hoi-hang/${i}`).expect(200)).body;
    expect(g.mau).toEqual([expect.objectContaining({ id: m.id, status: 'dat', cupScore: 81.5 })]);

    const t = (await nv.post('/api/mau').send({ loai: 'chao_hang', doiTacId: buyer, matHangId: mhTieu }).expect(201)).body.id;
    await nv.post(`/api/mau/${t}/gui`).send({ hangChuyenPhat: 'FedEx', ngayGui: today() }).expect(200);
    await nv.post(`/api/mau/${t}/ket-qua`).send({ dat: true, ngay: today(), diemThuNem: 80 }).expect(400);
    await nv.post(`/api/mau/${t}/ket-qua`).send({ dat: false, ngay: today(), nhanXet: 'Dung trọng chỉ 520 g/l' }).expect(200);
  });

  it('mẫu trước xuất phải gắn lô xuất đúng người mua; mẫu đối chứng được lưu ngay', async () => {
    await nv.post('/api/mau').send({ loai: 'truoc_xuat', doiTacId: buyer, matHangId: mh }).expect(400);
    const c = await nv.post('/api/hop-dong').send({ matHangId: mh, loai: 'mua_ban_truc_tiep', benBanId: ncc, benMuaId: buyer, dieuKhoan: terms(20) }).expect(201);
    await nv.post(`/api/hop-dong/${c.body.id}/trinh-ky`).expect(200);
    const g = await fullFirstLogin(app, await createUser(app, ['GIAM_DOC'], 'bhgd'));
    await g.agent.post(`/api/hop-dong/${c.body.id}/ky`).send({ ma2Lop: codeFor(g.secret, 1) }).expect(200);
    const lx = (await nv.post('/api/lo-xuat').send({ hopDongDoiUngId: c.body.id, thiTruong: 'EU', etd: '2027-02-10' }).expect(201)).body.id;

    await nv.post('/api/mau').send({ loai: 'truoc_xuat', doiTacId: buyer2, matHangId: mh, loXuatId: lx }).expect(400);
    await nv.post('/api/mau').send({ loai: 'truoc_xuat', doiTacId: buyer, matHangId: mhTieu, loXuatId: lx }).expect(400);
    const m = (await nv.post('/api/mau').send({ loai: 'truoc_xuat', doiTacId: buyer, matHangId: mh, loXuatId: lx }).expect(201)).body.id;
    const d = (await nv.post('/api/mau').send({ loai: 'doi_chung', doiTacId: buyer, matHangId: mh, loXuatId: lx, luuDen: '2027-08-10' }).expect(201)).body.id;
    const list = (await nv.get(`/api/mau?loXuatId=${lx}`).expect(200)).body.mau;
    expect(list.find((x: { id: string }) => x.id === m)).toMatchObject({ status: 'chuan_bi', exportLotCode: expect.any(String) });
    expect(list.find((x: { id: string }) => x.id === d)).toMatchObject({ status: 'luu', retainUntil: '2027-08-10', quyen: { gui: false, ketQua: false, huy: true } });
    await nv.post(`/api/mau/${d}/gui`).send({ hangChuyenPhat: 'DHL', ngayGui: today() }).expect(400);
    await nv2.post(`/api/mau/${m}/huy`).send({ lyDo: 'Lấy lại mẫu' }).expect(403);
    await nv.post(`/api/mau/${m}/huy`).send({ lyDo: 'Lấy lại mẫu' }).expect(200);
  });
});

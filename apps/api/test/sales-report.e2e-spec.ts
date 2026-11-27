import { INestApplication } from '@nestjs/common';
import { codeFor, createUser, fullFirstLogin, startApp } from './helpers';

type Agent = Awaited<ReturnType<typeof fullFirstLogin>>['agent'];

const terms = (soLuong: number, donGia: number, over: Record<string, unknown> = {}) => ({
  soLuong,
  donVi: 'tan',
  dungSaiPhanTram: 5,
  donGia,
  tienTe: 'USD',
  tyGiaUsd: null,
  incoterms: 'FOB',
  cangDi: 'Cát Lái',
  cangDen: 'Hamburg',
  lichGiao: 'Tháng 1/2027',
  dieuKhoanThanhToan: 'CAD',
  tyLePhiPhanTram: null,
  ghiChu: null,
  ...over,
});
const monthVn = () => new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 7);

describe('Báo cáo kinh doanh theo tháng', () => {
  let app: INestApplication;
  let nv: Agent;
  let tp: Agent;
  let ncc: string;
  let buyerDe: string;
  let buyerCn: string;
  let mh: string;
  let n = 0;

  async function partner(roles: string[], country: string) {
    const res = await nv.post('/api/doi-tac').send({ code: `BC${Date.now() % 100000}${++n}`, name: `Đối tác báo cáo ${n}`, country, category: roles.includes('nguoi_mua') ? 'nha_nhap_khau' : 'htx', roles }).expect(201);
    const id = res.body.id as string;
    await nv.post(`/api/doi-tac/${id}/tai-lieu`).send({ docType: 'Giấy đăng ký kinh doanh', number: `DK${n}` }).expect(201);
    await nv.post(`/api/doi-tac/${id}/trinh-tham-dinh`).send({ riskRating: 'thap', screeningNote: 'Không có trong danh sách trừng phạt' }).expect(200);
    await tp.post(`/api/doi-tac/${id}/quyet-dinh-tham-dinh`).send({ dongY: true }).expect(200);
    return id;
  }
  async function signed(body: Record<string, unknown>) {
    const c = await nv.post('/api/hop-dong').send({ matHangId: mh, ...body }).expect(201);
    await nv.post(`/api/hop-dong/${c.body.id}/trinh-ky`).expect(200);
    const g = await fullFirstLogin(app, await createUser(app, ['GIAM_DOC'], 'gdbc'));
    await g.agent.post(`/api/hop-dong/${c.body.id}/ky`).send({ ma2Lop: codeFor(g.secret, 1) }).expect(200);
    return c.body.id as string;
  }

  beforeAll(async () => {
    app = await startApp();
    nv = (await fullFirstLogin(app, await createUser(app, ['NHAN_VIEN_KD'], 'bcnv'))).agent;
    tp = (await fullFirstLogin(app, await createUser(app, ['TRUONG_PHONG_KD'], 'bctp'))).agent;
    ncc = await partner(['nha_cung_cap'], 'VN');
    buyerDe = await partner(['nguoi_mua'], 'DE');
    buyerCn = await partner(['nguoi_mua'], 'CN');
    mh = (await tp.post('/api/danh-muc/mat-hang').send({ code: `BCROB${Date.now() % 100000}`, name: 'Cà phê Robusta', sector: 'ca_phe' }).expect(201)).body.id;
  });
  afterAll(async () => {
    await app.close();
  });

  it('chỉ cấp quản lý bán hàng xem; kiểm tháng hợp lệ', async () => {
    await nv.get('/api/bao-cao-kinh-doanh').expect(403);
    await tp.get('/api/bao-cao-kinh-doanh?tuThang=2026-13').expect(400);
    await tp.get('/api/bao-cao-kinh-doanh?tuThang=2026-11&denThang=2026-10').expect(400);
    await tp.get('/api/bao-cao-kinh-doanh?tuThang=2023-01&denThang=2026-01').expect(400);
    const r = (await tp.get('/api/bao-cao-kinh-doanh').expect(200)).body;
    expect(r.thang).toHaveLength(12);
    expect(r.denThang).toBe(monthVn());
  });

  it('hợp đồng bán đã ký tính vào tháng ký, theo người mua và thị trường theo nước người mua', async () => {
    await signed({ loai: 'ban', benMuaId: buyerDe, dieuKhoan: terms(20, 4800) });
    await signed({ loai: 'mua_ban_truc_tiep', benBanId: ncc, benMuaId: buyerCn, dieuKhoan: terms(10, 4700) });
    // hợp đồng mua không tính
    await signed({ loai: 'mua', benBanId: ncc, dieuKhoan: terms(10, 4000, { tyLePhiPhanTram: 1.5 }) });
    const m = monthVn();
    const r = (await tp.get(`/api/bao-cao-kinh-doanh?tuThang=${m}&denThang=${m}`).expect(200)).body;
    const de = r.theoNguoiMua.find((x: { ma: string }) => x.ma === buyerDe);
    const cn = r.theoNguoiMua.find((x: { ma: string }) => x.ma === buyerCn);
    expect(de).toMatchObject({ hopDong: { so: 1, giaTriUsd: 96000 } });
    expect(cn).toMatchObject({ hopDong: { so: 1, giaTriUsd: 47000 } });
    expect(r.theoNguoiMua.some((x: { ma: string }) => x.ma === ncc)).toBe(false);
    expect(r.theoThiTruong.map((x: { ma: string }) => x.ma)).toEqual(expect.arrayContaining(['EU', 'CN']));
    expect(r.theoNganh.find((x: { ma: string }) => x.ma === 'ca_phe').hopDong.giaTriUsd).toBeGreaterThanOrEqual(143000);
    expect(r.thang[0].hopDong.so).toBeGreaterThanOrEqual(2);
  });

  it('tỷ lệ thắng của phiếu hỏi hàng theo tháng nhận', async () => {
    const body = { doiTacId: buyerDe, matHangId: mh, nguon: 'email', ngayNhan: '2020-03-10', soLuong: 50, donVi: 'tan' };
    const a = (await nv.post('/api/hoi-hang').send(body).expect(201)).body.id;
    await nv.post('/api/hoi-hang').send(body).expect(201);
    await nv.post(`/api/hoi-hang/${a}/thua`).send({ lyDo: 'gia' }).expect(200);
    const r = (await tp.get('/api/bao-cao-kinh-doanh?tuThang=2020-03&denThang=2020-03').expect(200)).body;
    expect(r.tong.hoiHang).toMatchObject({ tong: 2, thang: 0, thua: 1, tyLeThangPhanTram: 0 });
    expect(r.tong.hopDong.so).toBe(0);
  });

  it('lô đã xếp tàu tính khối lượng và giá trị vào tháng tàu chạy', async () => {
    const mua = await signed({ loai: 'mua', benBanId: ncc, dieuKhoan: terms(10, 4000, { tyLePhiPhanTram: 1.5 }) });
    const ban = await signed({ loai: 'ban', benMuaId: buyerCn, dieuKhoan: terms(10, 4800) });
    const lm = (await nv.post('/api/lo-mua').send({ hopDongId: mua }).expect(201)).body.id;
    await nv.post(`/api/lo-mua/${lm}/su-kien`).send({ loai: 'thu_gom', khoiLuongKg: 10000 }).expect(200);
    await nv.post(`/api/lo-mua/${lm}/su-kien`).send({ loai: 'so_che', khoiLuongKg: 10000 }).expect(200);
    const lx = (await nv.post('/api/lo-xuat').send({ hopDongDoiUngId: ban, thiTruong: 'CN', etd: '2027-01-20' }).expect(201)).body.id;
    await nv.post(`/api/lo-xuat/${lx}/phan-bo`).send({ loMuaId: lm, khoiLuongKg: 10000 }).expect(201);
    for (const p of (await tp.get(`/api/lo-xuat/${lx}`).expect(200)).body.phanBo) await tp.post(`/api/phan-bo/${p.id}/duyet`).expect(200);
    const d = (await tp.get(`/api/lo-xuat/${lx}/chung-tu`).expect(200)).body.chungTu as { id: string; status: string; obsolete: boolean }[];
    for (const x of d.filter((x) => !x.obsolete && x.status !== 'khong_ap_dung')) await tp.post(`/api/chung-tu/${x.id}/khong-ap-dung`).send({ lyDo: 'Kiểm thử báo cáo' }).expect(204);
    const adv = (b: Record<string, unknown> = {}) => nv.post(`/api/lo-xuat/${lx}/chuyen-buoc`).send(b).expect(200);
    await adv();
    await adv();
    await nv.post(`/api/lo-xuat/${lx}/giam-dinh`).send({ ketQua: 'dat', donViGiamDinh: 'Vinacontrol' }).expect(200);
    await nv.put(`/api/lo-xuat/${lx}/booking`).send({ hangTau: 'COSCO', soBooking: `BKBC${Date.now() % 100000}`, container: [{ so: 'CSNU7654321', chi: 'C-9' }] }).expect(200);
    await adv();
    const shipDay = new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 10);
    await adv({ soVanDon: `BLBC${Date.now() % 100000}`, ngayTauChay: shipDay });
    const m = shipDay.slice(0, 7);
    const r = (await tp.get(`/api/bao-cao-kinh-doanh?tuThang=${m}&denThang=${m}`).expect(200)).body;
    expect(r.theoNguoiMua.find((x: { ma: string }) => x.ma === buyerCn).giaoHang).toEqual({ soLo: 1, kg: 10000, giaTriUsd: 48000 });
    expect(r.theoThiTruong.find((x: { ma: string }) => x.ma === 'CN').giaoHang.kg).toBeGreaterThanOrEqual(10000);
  });
});

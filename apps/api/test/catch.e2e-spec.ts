import { INestApplication } from '@nestjs/common';
import { codeFor, createUser, fullFirstLogin, startApp, uniqueEmail } from './helpers';

type Agent = Awaited<ReturnType<typeof fullFirstLogin>>['agent'];
interface Check { ma: string; dat: boolean; chiTiet: string[] }

const terms = (soLuong: number, over: Record<string, unknown> = {}) => ({ soLuong, donVi: 'tan', dungSaiPhanTram: 5, donGia: 9000, tienTe: 'USD', tyGiaUsd: null, incoterms: 'FOB', cangDi: 'Cát Lái', cangDen: null, lichGiao: 'Tháng 1/2027', dieuKhoanThanhToan: 'L/C trả ngay', tyLePhiPhanTram: 1.5, ghiChu: null, ...over });

describe('Thủy sản khai thác: tàu, chuyến, phiếu thu gom theo chuyến, IUU và SIMP', () => {
  let app: INestApplication;
  let nv: Agent;
  let tp: Agent;
  let tm: Agent;
  let cty: Agent;
  let ncc: string;
  let mh: string;
  let n = 0;
  const ids: Record<string, string> = {};

  async function partner(roles: string[], country: string) {
    const id = (await nv.post('/api/doi-tac').send({ code: `KT${Date.now() % 100000}${++n}`, name: `Đối tác KT ${n}`, country, category: roles.includes('nguoi_mua') ? 'nha_nhap_khau' : 'htx', roles }).expect(201)).body.id as string;
    await nv.post(`/api/doi-tac/${id}/tai-lieu`).send({ docType: 'Giấy đăng ký kinh doanh', number: `DK${n}` }).expect(201);
    await nv.post(`/api/doi-tac/${id}/trinh-tham-dinh`).send({ riskRating: 'thap', screeningNote: 'Không có trong danh sách trừng phạt' }).expect(200);
    await tp.post(`/api/doi-tac/${id}/quyet-dinh-tham-dinh`).send({ dongY: true }).expect(200);
    return id;
  }
  async function signed(body: Record<string, unknown>) {
    const c = await nv.post('/api/hop-dong').send({ matHangId: mh, ...body }).expect(201);
    await nv.post(`/api/hop-dong/${c.body.id}/trinh-ky`).expect(200);
    const g = await fullFirstLogin(app, await createUser(app, ['GIAM_DOC'], 'ktgd'));
    await g.agent.post(`/api/hop-dong/${c.body.id}/ky`).send({ ma2Lop: codeFor(g.secret, 1) }).expect(200);
    return c.body.id as string;
  }
  const tau = (soDangKy: string, over: Record<string, unknown> = {}) => ({ soDangKy, ten: 'Bình Định 01', chuTau: 'Nguyễn Văn Biển', daiM: 18, nghe: 'Câu vàng', giayPhep: 'GP-2026-001', giayPhepDen: '2028-12-31', coVms: true, ...over });
  const chuyen = (tauId: string, over: Record<string, unknown> = {}) => ({ tauId, ngayDi: '2026-10-20', ngayCap: '2026-11-05', cang: 'Cảng cá Quy Nhơn', vungKhaiThac: 'Vùng khơi Nam Trung Bộ', loai: 'Cá ngừ vây vàng', sanLuongKg: 3000, giayKhaiThac: 'GCN-QN-0451', noiCapGiay: 'Chi cục Thủy sản Bình Định', ngayCapGiay: '2026-11-06', ...over });
  const check = (r: { kiemTra: Check[] }, ma: string) => r.kiemTra.find((k) => k.ma === ma)!;

  beforeAll(async () => {
    app = await startApp();
    nv = (await fullFirstLogin(app, await createUser(app, ['NHAN_VIEN_KD'], 'ktnv'))).agent;
    tp = (await fullFirstLogin(app, await createUser(app, ['TRUONG_PHONG_KD'], 'kttp'))).agent;
    tm = (await fullFirstLogin(app, await createUser(app, ['NHAN_VIEN_THU_MUA'], 'kttm'))).agent;
    ncc = await partner(['nha_cung_cap'], 'VN');
    mh = (await tp.post('/api/danh-muc/mat-hang').send({ code: `NGU${Date.now() % 100000}`, name: 'Cá ngừ vây vàng đông lạnh', sector: 'thuy_san', hsCode: '030342' }).expect(201)).body.id;
    const email = uniqueEmail('ctykt');
    const r = await nv.post(`/api/doi-tac/${ncc}/tai-khoan-cong`).send({ email, hoTen: 'Kế toán công ty cá' }).expect(201);
    cty = (await fullFirstLogin(app, { email, password: r.body.matKhauTam })).agent;
  });

  afterAll(async () => {
    await app.close();
  });

  it('tàu và chuyến: nhà cung cấp ghi trên cổng, kinh doanh không ghi; không trùng tàu, không ghi ngày tương lai', async () => {
    ids.tau1 = (await cty.post('/api/cong/tau-ca').send(tau('bđ-96789-ts')).expect(201)).body.id;
    await cty.post('/api/cong/tau-ca').send(tau('BĐ-96789-TS')).expect(400);
    await nv.post('/api/tau-ca').send({ ...tau('BĐ-11111-TS'), doiTacId: ncc }).expect(403);
    ids.tau2 = (await tm.post('/api/tau-ca').send({ ...tau('BĐ-22222-TS', { giayPhep: null, coVms: false }), doiTacId: ncc }).expect(201)).body.id;
    await cty.post('/api/cong/tau-ca/chuyen').send(chuyen(ids.tau1, { ngayCap: '2099-01-01' })).expect(400);
    await cty.post('/api/cong/tau-ca/chuyen').send(chuyen(ids.tau1, { ngayDi: '2026-11-10' })).expect(400);
    const c1 = await cty.post('/api/cong/tau-ca/chuyen').send(chuyen(ids.tau1)).expect(201);
    expect(c1.body.code).toMatch(/-CH001$/);
    ids.c1 = c1.body.id;
    ids.c2 = (await tm.post('/api/tau-ca/chuyen').send(chuyen(ids.tau2, { giayKhaiThac: null, noiCapGiay: null, ngayCapGiay: null, sanLuongKg: 1000 })).expect(201)).body.id;

    const d = (await tm.get(`/api/tau-ca/${ncc}`).expect(200)).body;
    expect(d.tau.map((t: { soDangKy: string }) => t.soDangKy)).toEqual(['BĐ-22222-TS', 'BĐ-96789-TS']);
    const c2 = d.chuyen.find((c: { id: string }) => c.id === ids.c2);
    expect(c2.thieuIuu.join(' ')).toMatch(/giấy chứng nhận/);
    expect(c2.thieuIuu.join(' ')).toMatch(/giám sát hành trình/);
    expect(c2.thieuSimp.join(' ')).toMatch(/giấy phép/);
    expect(d.chuyen.find((c: { id: string }) => c.id === ids.c1)).toMatchObject({ thieuIuu: [], thieuSimp: [], conLaiKg: 3000 });
  });

  it('phiếu thu gom từ chuyến: không vượt sản lượng, không trước ngày cập cảng; chuyến có phiếu thì không huỷ được', async () => {
    ids.mg = await signed({ loai: 'moi_gioi', benBanId: ncc, dieuKhoan: terms(10) });
    ids.lm = (await nv.post('/api/lo-mua').send({ hopDongId: ids.mg }).expect(201)).body.id;
    const f = await tm.get(`/api/lo-mua/${ids.lm}/phieu-thu-gom`).expect(200);
    expect(f.body.chuyen.map((c: { id: string }) => c.id).sort()).toEqual([ids.c1, ids.c2].sort());

    await tm.post(`/api/lo-mua/${ids.lm}/phieu-thu-gom`).send({ catchTripId: ids.c1, harvestDate: '2026-11-01', quantityKg: 100 }).expect(400);
    await tm.post(`/api/lo-mua/${ids.lm}/phieu-thu-gom`).send({ catchTripId: ids.c1, farmerId: ids.c1, harvestDate: '2026-11-06', quantityKg: 100 }).expect(400);
    await tm.post(`/api/lo-mua/${ids.lm}/phieu-thu-gom`).send({ catchTripId: ids.c1, harvestDate: '2026-11-06', quantityKg: 2000 }).expect(201);
    expect((await tm.post(`/api/lo-mua/${ids.lm}/phieu-thu-gom`).send({ catchTripId: ids.c1, harvestDate: '2026-11-06', quantityKg: 1500 }).expect(400)).body.message).toMatch(/Vượt sản lượng/);
    const b = await tm.post(`/api/lo-mua/${ids.lm}/phieu-thu-gom`).send({ catchTripId: ids.c2, harvestDate: '2026-11-06', quantityKg: 1000 }).expect(201);
    expect(b.body.luuY.join(' ')).toMatch(/chưa có số giấy chứng nhận/);
    const list = (await tm.get(`/api/lo-mua/${ids.lm}/phieu-thu-gom`).expect(200)).body;
    expect(list.phieu.map((p: { tripCode: string | null }) => p.tripCode)).toEqual([expect.stringMatching(/-CH001$/), expect.stringMatching(/-CH002$/)]);
    expect(list.chuyen.map((c: { id: string }) => c.id)).toEqual([ids.c1]); // chuyến 2 đã thu hết
    await cty.post(`/api/cong/tau-ca/chuyen/${ids.c1}/huy`).send({ lyDo: 'Ghi nhầm' }).expect(400);
  });

  it('truy xuất: EU kiểm giấy khai thác, không đòi mã cơ sở nuôi; Mỹ kiểm SIMP theo giấy phép tàu', async () => {
    await nv.post(`/api/lo-mua/${ids.lm}/su-kien`).send({ loai: 'so_che', khoiLuongKg: 3000 }).expect(200);
    const lot = async (country: string, market: string, kg: number) => {
      const buyer = await partner(['nguoi_mua'], country);
      const tt = await signed({ loai: 'mua_ban_truc_tiep', benBanId: ncc, benMuaId: buyer, dieuKhoan: terms(2, { tyLePhiPhanTram: null }) });
      const lx = (await nv.post('/api/lo-xuat').send({ hopDongDoiUngId: tt, thiTruong: market }).expect(201)).body.id;
      await nv.post(`/api/lo-xuat/${lx}/phan-bo`).send({ loMuaId: ids.lm, khoiLuongKg: kg }).expect(201);
      return (await nv.get(`/api/lo-xuat/${lx}/truy-xuat`).expect(200)).body;
    };
    const eu = await lot('ES', 'EU', 1500);
    expect(eu.truyDuocKg).toBe(1500);
    expect(eu.chuyen.map((c: { khoiLuongKg: number }) => c.khoiLuongKg)).toEqual([1000, 500]);
    expect(check(eu, 'truy_nguon').dat).toBe(true);
    expect(check(eu, 'ma_so_vung').dat).toBe(true);
    expect(check(eu, 'iuu')).toMatchObject({ dat: false });
    expect(check(eu, 'iuu').chiTiet.join(' ')).toMatch(/CH002: chưa có số giấy chứng nhận/);

    const us = await lot('US', 'US', 1500);
    expect(check(us, 'simp').dat).toBe(false);
    expect(check(us, 'simp').chiTiet.join(' ')).toMatch(/BĐ-22222-TS chưa ghi giấy phép/);
  });
});

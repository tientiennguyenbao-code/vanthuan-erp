import { INestApplication } from '@nestjs/common';
import { codeFor, createUser, fullFirstLogin, startApp, uniqueEmail } from './helpers';

type Agent = Awaited<ReturnType<typeof fullFirstLogin>>['agent'];
interface Check { ma: string; dat: boolean; chiTiet: string[]; canXacMinh: boolean }

const terms = (soLuong: number, over: Record<string, unknown> = {}) => ({
  soLuong,
  donVi: 'tan',
  dungSaiPhanTram: 5,
  donGia: 6200,
  tienTe: 'USD',
  tyGiaUsd: null,
  incoterms: 'FOB',
  cangDi: 'Cát Lái',
  cangDen: null,
  lichGiao: 'Tháng 1/2027',
  dieuKhoanThanhToan: 'L/C trả ngay',
  tyLePhiPhanTram: 1.5,
  ghiChu: null,
  ...over,
});

describe('Truy xuất gia vị và thủy sản: nhật ký thuốc BVTV, mã cơ sở, kiểm theo ngành × thị trường', () => {
  let app: INestApplication;
  let nv: Agent;
  let tp: Agent;
  let tm: Agent;
  let gd: Agent;
  let ncc: string;
  let buyerEu: string;
  let buyerCn: string;
  let mh: string;
  let n = 0;
  const ids: Record<string, string> = {};

  async function partner(roles: string[], country: string) {
    const res = await nv.post('/api/doi-tac').send({ code: `TX${Date.now() % 100000}${++n}`, name: `Đối tác TX ${n}`, country, category: roles.includes('nguoi_mua') ? 'nha_nhap_khau' : 'htx', roles }).expect(201);
    const id = res.body.id as string;
    await nv.post(`/api/doi-tac/${id}/tai-lieu`).send({ docType: 'Giấy đăng ký kinh doanh', number: `DK${n}` }).expect(201);
    await nv.post(`/api/doi-tac/${id}/trinh-tham-dinh`).send({ riskRating: 'thap', screeningNote: 'Không có trong danh sách trừng phạt' }).expect(200);
    await tp.post(`/api/doi-tac/${id}/quyet-dinh-tham-dinh`).send({ dongY: true }).expect(200);
    return id;
  }
  async function signed(body: Record<string, unknown>) {
    const c = await nv.post('/api/hop-dong').send({ matHangId: mh, ...body }).expect(201);
    await nv.post(`/api/hop-dong/${c.body.id}/trinh-ky`).expect(200);
    const g = await fullFirstLogin(app, await createUser(app, ['GIAM_DOC'], 'gdtx'));
    await g.agent.post(`/api/hop-dong/${c.body.id}/ky`).send({ ma2Lop: codeFor(g.secret, 1) }).expect(200);
    return c.body.id as string;
  }
  const spray = (thuaId: string, ngayPhun: string, cachLyNgay = 14) => ({ thuaId, ngayPhun, thuoc: 'Anvil 5SC', hoatChat: 'Hexaconazole', cachLyNgay, lieuLuong: '20 ml/bình 16 lít' });
  const slip = (plotId: string, harvestDate: string, quantityKg: number) => ({ farmerId: ids.ho, plotId, harvestDate, quantityKg });
  const check = (r: { kiemTra: Check[] }, ma: string) => r.kiemTra.find((k) => k.ma === ma)!;

  beforeAll(async () => {
    app = await startApp();
    nv = (await fullFirstLogin(app, await createUser(app, ['NHAN_VIEN_KD'], 'txnv'))).agent;
    tp = (await fullFirstLogin(app, await createUser(app, ['TRUONG_PHONG_KD'], 'txtp'))).agent;
    tm = (await fullFirstLogin(app, await createUser(app, ['NHAN_VIEN_THU_MUA'], 'txtm'))).agent;
    gd = (await fullFirstLogin(app, await createUser(app, ['GIAM_DOC'], 'txgd'))).agent;
    ncc = await partner(['nha_cung_cap'], 'VN');
    buyerEu = await partner(['nguoi_mua'], 'NL');
    buyerCn = await partner(['nguoi_mua'], 'CN');
    mh = (await tp.post('/api/danh-muc/mat-hang').send({ code: `TIEU${Date.now() % 100000}`, name: 'Tiêu đen 500 g/l', sector: 'gia_vi', hsCode: '090411' }).expect(201)).body.id;
    ids.vung = (await tm.post(`/api/nguon-cung/${ncc}/vung`).send({ name: 'Vùng tiêu Chư Sê', kind: 'vung_trong', sector: 'gia_vi', province: 'Gia Lai' }).expect(201)).body.id;
    ids.ho = (await tm.post(`/api/nguon-cung/${ncc}/ho`).send({ fullName: 'Rơ Mah Hlin', province: 'Gia Lai', consentOn: '2026-11-01' }).expect(201)).body.id;
    const thua = (dx: number) =>
      tm.post(`/api/nguon-cung/${ncc}/thua`).send({ farmerId: ids.ho, growingAreaId: ids.vung, kind: 'thua', crop: 'Tiêu', geometry: { type: 'Point', coordinates: [108.07 + dx * 0.01, 13.7] }, declaredAreaHa: 1 }).expect(201);
    ids.p1 = (await thua(0)).body.id;
    ids.p2 = (await thua(3)).body.id;
    ids.mg = await signed({ loai: 'moi_gioi', benBanId: ncc, dieuKhoan: terms(10) });
    ids.lm = (await nv.post('/api/lo-mua').send({ hopDongId: ids.mg }).expect(201)).body.id;
  });

  afterAll(async () => {
    await app.close();
  });

  it('nhật ký thuốc BVTV: thu mua và HTX ghi, kinh doanh không ghi; không ghi ngày tương lai; huỷ có lý do', async () => {
    await tm.post('/api/nhat-ky-thuoc').send(spray(ids.p1, '2026-11-01')).expect(201);
    await nv.post('/api/nhat-ky-thuoc').send(spray(ids.p1, '2026-11-02')).expect(403);
    await tm.post('/api/nhat-ky-thuoc').send(spray(ids.p1, '2099-01-01')).expect(400);

    const email = uniqueEmail('htxtx');
    const r = await nv.post(`/api/doi-tac/${ncc}/tai-khoan-cong`).send({ email, hoTen: 'Kế toán HTX tiêu' }).expect(201);
    const s = (await fullFirstLogin(app, { email, password: r.body.matKhauTam })).agent;
    const nhap = (await s.post('/api/cong/nhat-ky-thuoc').send(spray(ids.p2, '2026-10-01', 7)).expect(201)).body.id;
    await s.post(`/api/cong/nhat-ky-thuoc/${nhap}/huy`).send({ lyDo: 'Ghi nhầm thửa' }).expect(200);
    const d = (await s.get('/api/cong/nhat-ky-thuoc').expect(200)).body;
    expect(d.duocGhi).toBe(true);
    expect(d.thua.map((t: { id: string }) => t.id).sort()).toEqual([ids.p1, ids.p2].sort());
    expect(d.nhatKy).toHaveLength(2);
    expect(d.nhatKy.find((x: { id: string }) => x.id === nhap).lyDoHuy).toBe('Ghi nhầm thửa');
    expect((await nv.get(`/api/nhat-ky-thuoc/${ncc}`).expect(200)).body.duocGhi).toBe(false);
    // HTX không huỷ được dòng do nhân viên thu mua ghi; nhân viên thu mua thì huỷ được
    const cuaNv = d.nhatKy.find((x: { nguon: string }) => x.nguon === 'noi_bo');
    expect(cuaNv.duocHuy).toBe(false);
    await s.post(`/api/cong/nhat-ky-thuoc/${cuaNv.id}/huy`).send({ lyDo: 'Thử huỷ' }).expect(403);
    await tm.post(`/api/nhat-ky-thuoc/${cuaNv.id}/huy`).send({ lyDo: 'Ghi nhầm, ghi lại' }).expect(200);
    await tm.post('/api/nhat-ky-thuoc').send(spray(ids.p1, '2026-11-01')).expect(201);
  });

  it('phiếu thu gom gia vị ghi lưu ý khi thu hoạch trong thời gian cách ly, nhưng không chặn', async () => {
    const a = await tm.post(`/api/lo-mua/${ids.lm}/phieu-thu-gom`).send(slip(ids.p1, '2026-11-10', 2000)).expect(201);
    expect(a.body.luuY.join(' ')).toMatch(/chưa hết 14 ngày cách ly/);
    // Lần phun ở thửa 2 đã huỷ nên không tính
    const b = await tm.post(`/api/lo-mua/${ids.lm}/phieu-thu-gom`).send(slip(ids.p2, '2026-10-03', 1500)).expect(201);
    expect(b.body.luuY).toEqual([]);
    const list = (await tm.get(`/api/lo-mua/${ids.lm}/phieu-thu-gom`).expect(200)).body.phieu;
    expect(list.find((p: { code: string }) => p.code === a.body.code).luuY).toHaveLength(1);
  });

  it('truy xuất lô xuất EU: tỷ lệ kg theo phần phân bổ, chưa đạt khi có hàng ghi tay và thửa thiếu nhật ký thuốc', async () => {
    await nv.post(`/api/lo-mua/${ids.lm}/su-kien`).send({ loai: 'thu_gom', khoiLuongKg: 500, ghiChu: 'Hàng thương lái' }).expect(200);
    ids.xuong = (await tp.post('/api/danh-muc/co-so').send({ name: `Xưởng tiêu Chư Sê ${n}`, kind: 'xuong_so_che', ownership: 'tu_van_hanh' }).expect(201)).body.id;
    await nv.post(`/api/lo-mua/${ids.lm}/su-kien`).send({ loai: 'so_che', khoiLuongKg: 4000, coSoId: ids.xuong }).expect(200);

    ids.ttEu = await signed({ loai: 'mua_ban_truc_tiep', benBanId: ncc, benMuaId: buyerEu, dieuKhoan: terms(2, { tyLePhiPhanTram: null }) });
    ids.lxEu = (await nv.post('/api/lo-xuat').send({ hopDongDoiUngId: ids.ttEu, thiTruong: 'EU' }).expect(201)).body.id;
    await nv.post(`/api/lo-xuat/${ids.lxEu}/phan-bo`).send({ loMuaId: ids.lm, khoiLuongKg: 2000 }).expect(201);

    const r = (await nv.get(`/api/lo-xuat/${ids.lxEu}/truy-xuat`).expect(200)).body;
    expect(r).toMatchObject({ nganh: 'gia_vi', thiTruong: 'EU', mucTruyXuat: 'Vùng trồng', tongKg: 2000, dat: false });
    // Lô mua thu 4.000 kg (3.500 theo phiếu + 500 ghi tay); lô xuất nhận 2.000 kg = một nửa
    expect(r.truyDuocKg).toBe(1750);
    expect(r.nguon.find((x: { ma: string }) => x.ma).khoiLuongKg).toBeGreaterThan(0);
    expect(r.nguon.reduce((s: number, x: { khoiLuongKg: number }) => s + x.khoiLuongKg, 0)).toBe(1750);
    expect(check(r, 'truy_nguon')).toMatchObject({ dat: false, canXacMinh: false });
    const bvtv = check(r, 'thuoc_bvtv');
    expect(bvtv.dat).toBe(false);
    expect(bvtv.chiTiet.join(' ')).toMatch(/chưa có nhật ký thuốc/);
    expect(bvtv.chiTiet.join(' ')).toMatch(/cách ly/);
    expect(r.coSo.map((c: { ten: string }) => c.ten)).toEqual([`Xưởng tiêu Chư Sê ${n}`]);

    await tm.get(`/api/lo-xuat/${ids.lxEu}/truy-xuat`).expect(403);
  });

  it('mã cơ sở: ghi và huỷ trong danh mục; lô đi Trung Quốc cần mã GACC và mã số vùng trồng', async () => {
    ids.ttCn = await signed({ loai: 'mua_ban_truc_tiep', benBanId: ncc, benMuaId: buyerCn, dieuKhoan: terms(1, { tyLePhiPhanTram: null }) });
    ids.lxCn = (await nv.post('/api/lo-xuat').send({ hopDongDoiUngId: ids.ttCn, thiTruong: 'CN' }).expect(201)).body.id;
    await nv.post(`/api/lo-xuat/${ids.lxCn}/phan-bo`).send({ loMuaId: ids.lm, khoiLuongKg: 1000 }).expect(201);

    let r = (await nv.get(`/api/lo-xuat/${ids.lxCn}/truy-xuat`).expect(200)).body;
    expect(check(r, 'gacc')).toMatchObject({ dat: false, canXacMinh: true });
    expect(check(r, 'ma_so_vung').dat).toBe(false);

    await nv.post(`/api/danh-muc/co-so/${ids.xuong}/ma`).send({ loai: 'gacc', ma: 'CVNM12345678' }).expect(403);
    const old = (await tp.post(`/api/danh-muc/co-so/${ids.xuong}/ma`).send({ loai: 'gacc', ma: 'CVNM00000001', hieuLucDen: '2020-01-01' }).expect(201)).body.id;
    r = (await nv.get(`/api/lo-xuat/${ids.lxCn}/truy-xuat`).expect(200)).body;
    expect(check(r, 'gacc').dat).toBe(false); // mã đã hết hạn
    await tp.post(`/api/danh-muc/co-so/${ids.xuong}/ma`).send({ loai: 'gacc', ma: 'CVNM12345678' }).expect(400); // còn mã cũ chưa huỷ
    await tp.post(`/api/danh-muc/ma-co-so/${old}/huy`).send({ lyDo: 'Đã gia hạn mã mới' }).expect(200);
    await tp.post(`/api/danh-muc/co-so/${ids.xuong}/ma`).send({ loai: 'gacc', ma: 'CVNM12345678', hieuLucDen: '2031-12-31' }).expect(201);
    const cs = (await nv.get('/api/danh-muc/co-so').expect(200)).body.coSo.find((c: { id: string }) => c.id === ids.xuong);
    expect(cs.ma).toEqual([expect.objectContaining({ loai: 'gacc', ma: 'CVNM12345678' })]);

    r = (await nv.get(`/api/lo-xuat/${ids.lxCn}/truy-xuat`).expect(200)).body;
    expect(check(r, 'gacc')).toMatchObject({ dat: true });
    expect(check(r, 'gacc').chiTiet.join(' ')).toMatch(/CVNM12345678/);
  });
});

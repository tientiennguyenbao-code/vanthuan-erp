import { INestApplication } from '@nestjs/common';
import { addMonths, currentMonth } from '../src/sourcing/plan.rules';
import { codeFor, createUser, fullFirstLogin, startApp, uniqueEmail } from './helpers';

type Agent = Awaited<ReturnType<typeof fullFirstLogin>>['agent'];
interface Row { thang: string; cungUocTinhKg: number; cungUocTinhEuKg: number; cauBaoGiaKg: number; cauHopDongKg: number; cauEuKg: number; conLaiKg: number; conLaiEuKg: number }

const terms = (soLuong: number, over: Record<string, unknown> = {}) => ({
  soLuong,
  donVi: 'tan',
  dungSaiPhanTram: 5,
  donGia: 4800,
  tienTe: 'USD',
  tyGiaUsd: null,
  incoterms: 'FOB',
  cangDi: 'Cát Lái',
  cangDen: null,
  lichGiao: 'Theo kế hoạch',
  dieuKhoanThanhToan: 'L/C trả ngay',
  tyLePhiPhanTram: 1.5,
  ghiChu: null,
  ...over,
});
const later = (days: number) => new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);

describe('Kế hoạch thu mua: sản lượng ước tính, cung đủ điều kiện so với cầu, cảnh báo báo giá EU', () => {
  let app: INestApplication;
  let nv: Agent;
  let tp: Agent;
  let tm: Agent;
  let gd: Agent;
  let ncc: string;
  let buyerEu: string;
  let buyerUs: string;
  let mh: string;
  let n = 0;
  const ids: Record<string, string> = {};
  const m0 = currentMonth();
  const m = (i: number) => addMonths(m0, i);

  async function partner(roles: string[], country: string) {
    const res = await nv.post('/api/doi-tac').send({ code: `KH${Date.now() % 100000}${++n}`, name: `Đối tác KH ${n}`, country, category: roles.includes('nguoi_mua') ? 'nha_nhap_khau' : 'htx', roles }).expect(201);
    const id = res.body.id as string;
    await nv.post(`/api/doi-tac/${id}/tai-lieu`).send({ docType: 'Giấy đăng ký kinh doanh', number: `DK${n}` }).expect(201);
    await nv.post(`/api/doi-tac/${id}/trinh-tham-dinh`).send({ riskRating: 'thap', screeningNote: 'Không có trong danh sách trừng phạt' }).expect(200);
    await tp.post(`/api/doi-tac/${id}/quyet-dinh-tham-dinh`).send({ dongY: true }).expect(200);
    return id;
  }
  async function signed(body: Record<string, unknown>) {
    const c = await nv.post('/api/hop-dong').send({ matHangId: mh, ...body }).expect(201);
    await nv.post(`/api/hop-dong/${c.body.id}/trinh-ky`).expect(200);
    const g = await fullFirstLogin(app, await createUser(app, ['GIAM_DOC'], 'gdkh'));
    await g.agent.post(`/api/hop-dong/${c.body.id}/ky`).send({ ma2Lop: codeFor(g.secret, 1) }).expect(200);
    return c.body.id as string;
  }
  const plan = async (who: Agent = tm) => (await who.get('/api/ke-hoach-thu-mua?nganh=ca_phe').expect(200)).body as { bang: Row[]; thang: string[]; cau: { ma: string | null; thiTruong: string; thang: string; khoiLuongKg: number; loai: string }[] };
  const row = (p: { bang: Row[] }, month: string) => p.bang.find((r) => r.thang === month)!;
  const est = (thuaId: string, thang: string, khoiLuongKg: number) => ({ thuaId, thang, khoiLuongKg });
  const saleQuote = (doiTacId: string, soLuong: number, thangGiao: string | null) => ({
    loai: 'ban',
    doiTacId,
    matHangId: mh,
    soLuong,
    donVi: 'tan',
    donGia: 4900,
    tienTe: 'USD',
    incoterms: 'FOB',
    hieuLucDen: later(20),
    thangGiao,
  });

  beforeAll(async () => {
    app = await startApp();
    nv = (await fullFirstLogin(app, await createUser(app, ['NHAN_VIEN_KD'], 'khnv'))).agent;
    tp = (await fullFirstLogin(app, await createUser(app, ['TRUONG_PHONG_KD'], 'khtp'))).agent;
    tm = (await fullFirstLogin(app, await createUser(app, ['NHAN_VIEN_THU_MUA'], 'khtm'))).agent;
    gd = (await fullFirstLogin(app, await createUser(app, ['GIAM_DOC'], 'khgd'))).agent;
    ncc = await partner(['nha_cung_cap'], 'VN');
    buyerEu = await partner(['nguoi_mua'], 'DE');
    buyerUs = await partner(['nguoi_mua'], 'US');
    mh = (await tp.post('/api/danh-muc/mat-hang').send({ code: `KHROB${Date.now() % 100000}`, name: 'Cà phê Robusta S16', sector: 'ca_phe', hsCode: '090111' }).expect(201)).body.id;
    ids.vung = (await tm.post(`/api/nguon-cung/${ncc}/vung`).send({ name: 'Vùng Krông Pắc', kind: 'vung_trong', sector: 'ca_phe', province: 'Đắk Lắk' }).expect(201)).body.id;
    await gd.put(`/api/nang-suat/vung/${ids.vung}`).send({ kgMoiHa: 3000 }).expect(200);
    ids.ho = (await tm.post(`/api/nguon-cung/${ncc}/ho`).send({ fullName: 'H Lan Niê', province: 'Đắk Lắk', consentOn: '2026-11-01' }).expect(201)).body.id;
    const thua = (dx: number) =>
      tm.post(`/api/nguon-cung/${ncc}/thua`).send({ farmerId: ids.ho, growingAreaId: ids.vung, kind: 'thua', crop: 'Robusta', geometry: { type: 'Point', coordinates: [108.3 + dx * 0.01, 12.7] }, declaredAreaHa: 2 }).expect(201);
    ids.p1 = (await thua(0)).body.id;
    ids.p2 = (await thua(4)).body.id;
  });

  afterAll(async () => {
    await app.close();
  });

  it('ghi ước tính theo thửa: không vượt trần 12 tháng, không khai tháng đã qua, nhân viên kinh doanh không sửa được', async () => {
    await tm.put('/api/ke-hoach-thu-mua/uoc-tinh').send(est(ids.p1, m(1), 4000)).expect(200);
    // Trần thửa 2 ha × 3.000 kg/ha = 6.000 kg trong 12 tháng
    const over = await tm.put('/api/ke-hoach-thu-mua/uoc-tinh').send(est(ids.p1, m(3), 2500)).expect(400);
    expect(over.body.message).toMatch(/vượt trần 12 tháng/);
    await tm.put('/api/ke-hoach-thu-mua/uoc-tinh').send(est(ids.p1, m(13), 2500)).expect(200);
    await tm.put('/api/ke-hoach-thu-mua/uoc-tinh').send(est(ids.p1, m(-1), 100)).expect(400);
    await tm.put('/api/ke-hoach-thu-mua/uoc-tinh').send(est(ids.p1, m(30), 100)).expect(400);
    await nv.put('/api/ke-hoach-thu-mua/uoc-tinh').send(est(ids.p1, m(2), 100)).expect(403);

    const d = await nv.get(`/api/ke-hoach-thu-mua/uoc-tinh/${ncc}`).expect(200);
    expect(d.body.duocSua).toBe(false);
    expect(d.body.thang[0]).toBe(m0);
    const p1 = d.body.thua.find((t: { id: string }) => t.id === ids.p1);
    expect(p1).toMatchObject({ tranKg: 6000, tongKg: 4000, apDungEudr: true });
    expect(p1.uocTinh[m(1)]).toBe(4000);
    expect(p1.lyDoChuaDuEudr.join(' ')).toMatch(/kiểm tra rừng/);
  });

  it('nhà cung cấp khai ước tính trên cổng cho thửa của mình; xoá bằng 0 kg', async () => {
    const email = uniqueEmail('htxkh');
    const r = await nv.post(`/api/doi-tac/${ncc}/tai-khoan-cong`).send({ email, hoTen: 'Kế toán HTX' }).expect(201);
    const s = (await fullFirstLogin(app, { email, password: r.body.matKhauTam })).agent;
    const d = await s.get('/api/cong/uoc-tinh').expect(200);
    expect(d.body.duocSua).toBe(true);
    expect(d.body.thua.map((t: { id: string }) => t.id).sort()).toEqual([ids.p1, ids.p2].sort());
    await s.put('/api/cong/uoc-tinh').send(est(ids.p2, m(2), 1500)).expect(200);
    await s.put('/api/cong/uoc-tinh').send(est(ids.p2, m(4), 700)).expect(200);
    await s.put('/api/cong/uoc-tinh').send(est(ids.p2, m(4), 0)).expect(200);
    const after = (await s.get('/api/cong/uoc-tinh').expect(200)).body.thua.find((t: { id: string }) => t.id === ids.p2);
    expect(after.uocTinh).toEqual({ [m(2)]: 1500 });
    await tm.get('/api/cong/uoc-tinh').expect(403);

    // Nhà cung cấp khác không sửa được thửa này
    const other = await partner(['nha_cung_cap'], 'VN');
    const e2 = uniqueEmail('htxkh2');
    const r2 = await nv.post(`/api/doi-tac/${other}/tai-khoan-cong`).send({ email: e2, hoTen: 'HTX khác' }).expect(201);
    const s2 = (await fullFirstLogin(app, { email: e2, password: r2.body.matKhauTam })).agent;
    await s2.put('/api/cong/uoc-tinh').send(est(ids.p2, m(2), 10)).expect(404);
  });

  it('cung: ước tính chỉ tính là đủ EUDR sau khi thửa được duyệt không rừng', async () => {
    const before = await plan();
    expect(before.thang).toHaveLength(12);
    expect(row(before, m(1)).cungUocTinhKg).toBeGreaterThanOrEqual(4000);
    const euBefore = row(before, m(1)).cungUocTinhEuKg;

    const sub = await tm.post('/api/kiem-tra-rung').send({ plotIds: [ids.p1], method: 'jrc_2020', result: 'khong_rung', evidence: 'Đối chiếu lớp JRC GFC2020 ngày 26/11/2026' }).expect(201);
    await gd.post('/api/kiem-tra-rung/duyet').send({ ids: sub.body.ids, dongY: true }).expect(200);

    const after = await plan();
    expect(row(after, m(1)).cungUocTinhEuKg - euBefore).toBe(4000);
    // Thửa 2 chưa kiểm rừng: có trong cung tổng, chưa có trong cung đủ EUDR
    expect(row(after, m(2)).cungUocTinhKg - row(after, m(2)).cungUocTinhEuKg).toBeGreaterThanOrEqual(1500);
  });

  it('cầu: báo giá bán đã gửi theo tháng giao; hợp đồng bán chưa có lô xuất tính vào tháng này, có lô xuất thì theo ETD', async () => {
    const before = await plan();
    const q = (await nv.post('/api/bao-gia').send(saleQuote(buyerEu, 3, m(2))).expect(201)).body.id;
    const mid = await plan();
    expect(row(mid, m(2)).cauBaoGiaKg - row(before, m(2)).cauBaoGiaKg).toBe(0); // chưa gửi thì chưa tính
    await nv.post(`/api/bao-gia/${q}/gui`).expect(200);
    const sent = await plan();
    expect(row(sent, m(2)).cauBaoGiaKg - row(before, m(2)).cauBaoGiaKg).toBe(3000);
    expect(row(sent, m(2)).cauEuKg - row(before, m(2)).cauEuKg).toBe(3000);
    expect(row(sent, m(11)).conLaiEuKg - row(before, m(11)).conLaiEuKg).toBe(-3000);

    ids.hd = await signed({ loai: 'ban', benMuaId: buyerUs, dieuKhoan: terms(2) });
    const withContract = await plan(gd);
    expect(row(withContract, m0).cauHopDongKg - row(sent, m0).cauHopDongKg).toBe(2000);
    expect(row(withContract, m0).cauEuKg - row(sent, m0).cauEuKg).toBe(0);
    const line = withContract.cau.find((c) => c.loai === 'hop_dong_ky' && c.khoiLuongKg === 2000 && c.thiTruong === 'US');
    expect(line?.ma).toMatch(/^HDB-/);
    // Nhân viên thu mua không xem hợp đồng: thấy số lượng, không thấy số hợp đồng
    expect((await plan()).cau.filter((c) => c.loai !== 'bao_gia').every((c) => c.ma === null)).toBe(true);

    const lx = (await nv.post('/api/lo-xuat').send({ hopDongDoiUngId: ids.hd, thiTruong: 'US', etd: `${m(3)}-15` }).expect(201)).body.id;
    const withLot = await plan();
    expect(row(withLot, m0).cauHopDongKg - row(sent, m0).cauHopDongKg).toBe(0);
    expect(row(withLot, m(3)).cauHopDongKg - row(sent, m(3)).cauHopDongKg).toBe(2000);

    // Hàng đang có tăng khi thu gom; phân bổ 1.500 kg sang lô xuất thì trừ cả hàng đang có lẫn cầu của hợp đồng
    const hdm = await signed({ loai: 'mua', benBanId: ncc, dieuKhoan: terms(5) });
    const lm = (await nv.post('/api/lo-mua').send({ hopDongId: hdm }).expect(201)).body.id;
    await nv.post(`/api/lo-mua/${lm}/su-kien`).send({ loai: 'thu_gom', khoiLuongKg: 3000 }).expect(200);
    await nv.post(`/api/lo-mua/${lm}/su-kien`).send({ loai: 'so_che', khoiLuongKg: 2800 }).expect(200);
    const s1 = (await tm.get('/api/ke-hoach-thu-mua?nganh=ca_phe').expect(200)).body;
    await nv.post(`/api/lo-xuat/${lx}/phan-bo`).send({ loMuaId: lm, khoiLuongKg: 1500 }).expect(201);
    const s2 = (await tm.get('/api/ke-hoach-thu-mua?nganh=ca_phe').expect(200)).body;
    expect(s1.hangDangCo.tongKg - s2.hangDangCo.tongKg).toBe(1500);
    expect(row(s1, m(3)).cauHopDongKg - row(s2, m(3)).cauHopDongKg).toBe(1500);
  });

  it('báo giá bán cà phê sang EU hiện số hàng đủ EUDR còn trống và cảnh báo khi chào vượt', async () => {
    const small = (await nv.post('/api/bao-gia').send(saleQuote(buyerEu, 1, m(1))).expect(201)).body.id;
    const a = (await nv.get(`/api/bao-gia/${small}`).expect(200)).body;
    expect(a.thangGiao ?? a.deliveryMonth).toBe(m(1));
    expect(a.cungEudr).toMatchObject({ chaoKg: 1000 });
    expect(typeof a.cungEudr.conTrongKg).toBe('number');

    const big = (await nv.post('/api/bao-gia').send(saleQuote(buyerEu, 900_000, m(1))).expect(201)).body.id;
    const b = (await nv.get(`/api/bao-gia/${big}`).expect(200)).body;
    expect(b.cungEudr.canhBao).toMatch(/hàng đủ EUDR còn trống/);

    // Báo giá sang Mỹ không cần kiểm hàng đủ EUDR
    const us = (await nv.post('/api/bao-gia').send(saleQuote(buyerUs, 900_000, null)).expect(201)).body.id;
    expect((await nv.get(`/api/bao-gia/${us}`).expect(200)).body.cungEudr).toBeNull();

    await nv.post('/api/bao-gia').send({ ...saleQuote(buyerEu, 1, null), thangGiao: '2027-13' }).expect(400);
  });

  it('kế hoạch cần quyền xem nguồn cung; ngành sai bị từ chối', async () => {
    const kt = (await fullFirstLogin(app, await createUser(app, ['KE_TOAN_VIEN'], 'khkt'))).agent;
    await kt.get('/api/ke-hoach-thu-mua').expect(403);
    await tm.get('/api/ke-hoach-thu-mua?nganh=lua_gao').expect(400);
    await tm.get('/api/ke-hoach-thu-mua?nganh=thuy_san').expect(200);
  });
});

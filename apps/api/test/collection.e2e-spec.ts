import { INestApplication } from '@nestjs/common';
import { Pool } from 'pg';
import { PG_POOL } from '../src/db/db';
import { codeFor, createUser, fullFirstLogin, startApp, uniqueEmail } from './helpers';

type Agent = Awaited<ReturnType<typeof fullFirstLogin>>['agent'];

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
  lichGiao: 'Tháng 1/2027',
  dieuKhoanThanhToan: 'L/C trả ngay',
  tyLePhiPhanTram: 1.5,
  ghiChu: null,
  ...over,
});

// Ea Kar, Đắk Lắk
const pt = (dx: number): [number, number] => [108.45 + dx * 0.01, 12.8];

describe('Phiếu thu gom, trần sản lượng, nhãn đủ EUDR', () => {
  let app: INestApplication;
  let pool: Pool;
  let nv: Agent; // nhân viên KD phụ trách lô
  let tp: Agent;
  let tm: Agent; // nhân viên thu mua
  let gd: Agent;
  let s1: Agent; // HTX 1 trên cổng
  let s2: Agent;
  let ncc1: string;
  let ncc2: string;
  let buyer: string;
  let mh: string;
  let n = 0;
  const ids: Record<string, string> = {};

  async function partner(roles: string[]) {
    const res = await nv.post('/api/doi-tac').send({ code: `TG${Date.now() % 100000}${++n}`, name: `HTX thu gom ${n}`, country: 'VN', category: 'htx', roles }).expect(201);
    const id = res.body.id as string;
    await nv.post(`/api/doi-tac/${id}/tai-lieu`).send({ docType: 'Giấy chứng nhận đăng ký HTX', number: `HTX${n}` }).expect(201);
    await nv.post(`/api/doi-tac/${id}/trinh-tham-dinh`).send({ riskRating: 'thap', screeningNote: 'Không có trong danh sách trừng phạt' }).expect(200);
    await tp.post(`/api/doi-tac/${id}/quyet-dinh-tham-dinh`).send({ dongY: true }).expect(200);
    return id;
  }
  async function signed(body: Record<string, unknown>) {
    const c = await nv.post('/api/hop-dong').send({ matHangId: mh, ...body }).expect(201);
    await nv.post(`/api/hop-dong/${c.body.id}/trinh-ky`).expect(200);
    const g = await fullFirstLogin(app, await createUser(app, ['GIAM_DOC'], 'gdtg'));
    await g.agent.post(`/api/hop-dong/${c.body.id}/ky`).send({ ma2Lop: codeFor(g.secret, 1) }).expect(200);
    return c.body.id as string;
  }
  async function portal(partnerId: string) {
    const email = uniqueEmail('htxtg');
    const r = await nv.post(`/api/doi-tac/${partnerId}/tai-khoan-cong`).send({ email, hoTen: 'Kế toán HTX' }).expect(201);
    return (await fullFirstLogin(app, { email, password: r.body.matKhauTam })).agent;
  }
  const slip = (over: Record<string, unknown> = {}) => ({ farmerId: ids.ho1, plotId: ids.thuaA, harvestDate: '2026-11-10', quantityKg: 4000, moisturePct: 13.5, weighTicketNo: 'PC-0001', ...over });

  beforeAll(async () => {
    app = await startApp();
    pool = app.get<Pool>(PG_POOL);
    nv = (await fullFirstLogin(app, await createUser(app, ['NHAN_VIEN_KD'], 'tgnv'))).agent;
    tp = (await fullFirstLogin(app, await createUser(app, ['TRUONG_PHONG_KD'], 'tgtp'))).agent;
    tm = (await fullFirstLogin(app, await createUser(app, ['NHAN_VIEN_THU_MUA'], 'tgtm'))).agent;
    gd = (await fullFirstLogin(app, await createUser(app, ['GIAM_DOC'], 'tggd'))).agent;
    ncc1 = await partner(['nha_cung_cap']);
    ncc2 = await partner(['nha_cung_cap']);
    buyer = await partner(['nguoi_mua']);
    mh = (await tp.post('/api/danh-muc/mat-hang').send({ code: `TGROB${Date.now() % 100000}`, name: 'Cà phê Robusta', sector: 'ca_phe' }).expect(201)).body.id;
    ids.mg1 = await signed({ loai: 'moi_gioi', benBanId: ncc1, dieuKhoan: terms(10) });
    ids.tt = await signed({ loai: 'mua_ban_truc_tiep', benBanId: ncc1, benMuaId: buyer, dieuKhoan: terms(5, { tyLePhiPhanTram: null, donGia: 4875 }) });
    ids.lmDu = (await nv.post('/api/lo-mua').send({ hopDongId: ids.mg1 }).expect(201)).body.id;
    ids.lmKhong = (await nv.post('/api/lo-mua').send({ hopDongId: ids.mg1 }).expect(201)).body.id;
    // Hồ sơ vùng trồng của HTX 1: thửa A 2 ha; thửa B ngay cạnh A nên bị cảnh báo trùng vị trí
    ids.vung = (await tm.post(`/api/nguon-cung/${ncc1}/vung`).send({ name: 'Vùng Ea Kar', kind: 'vung_trong', sector: 'ca_phe', province: 'Đắk Lắk' }).expect(201)).body.id;
    ids.vungTieu = (await tm.post(`/api/nguon-cung/${ncc1}/vung`).send({ name: 'Vùng tiêu', kind: 'vung_trong', sector: 'gia_vi', province: 'Đắk Lắk' }).expect(201)).body.id;
    const ho = { province: 'Đắk Lắk', consentOn: '2026-11-01' };
    ids.ho1 = (await tm.post(`/api/nguon-cung/${ncc1}/ho`).send({ ...ho, fullName: 'H Linh Niê' }).expect(201)).body.id;
    ids.hoKhac = (await tm.post(`/api/nguon-cung/${ncc2}/ho`).send({ ...ho, fullName: 'Hộ HTX khác' }).expect(201)).body.id;
    const thua = (body: Record<string, unknown>) => tm.post(`/api/nguon-cung/${ncc1}/thua`).send({ farmerId: ids.ho1, kind: 'thua', growingAreaId: ids.vung, ...body }).expect(201);
    ids.thuaA = (await thua({ geometry: { type: 'Point', coordinates: pt(0) }, declaredAreaHa: 2 })).body.id;
    const b = await thua({ geometry: { type: 'Point', coordinates: pt(0) }, declaredAreaHa: 1 });
    expect(b.body.canhBao.length).toBeGreaterThan(0);
    ids.thuaB = b.body.id;
    ids.thuaTieu = (await thua({ growingAreaId: ids.vungTieu, geometry: { type: 'Point', coordinates: pt(5) }, declaredAreaHa: 1 })).body.id;
    s1 = await portal(ncc1);
    s2 = await portal(ncc2);
  });
  afterAll(async () => {
    await app.close();
  });

  it('năng suất tối đa do Ban Giám đốc đặt; khi chưa đặt, hàng cà phê chưa đủ EUDR', async () => {
    const chua = await tm.get(`/api/lo-mua/${ids.lmDu}/phieu-thu-gom`).expect(200);
    expect(chua.body.thua.find((t: { id: string }) => t.id === ids.thuaA)).toMatchObject({ capKg: null, conLaiKg: null });
    await tm.put('/api/nang-suat').send({ ca_phe: 3000, gia_vi: null, thuy_san: null }).expect(403);
    await nv.put('/api/nang-suat').send({ ca_phe: 3000, gia_vi: null, thuy_san: null }).expect(403);
    // Đặt mức riêng cho vùng này (bảng cài đặt dùng chung với các bài thử khác)
    await gd.put(`/api/nang-suat/vung/${ids.vung}`).send({ kgMoiHa: 3000 }).expect(200);
    const v = await tm.get('/api/nang-suat').expect(200);
    expect(v.body.vung.find((x: { id: string }) => x.id === ids.vung)).toMatchObject({ maxYieldKgPerHa: 3000 });
    const log = await pool.query(`select count(*)::int as n from audit_log where action = 'nang_suat.dat_muc_vung' and entity_id = $1`, [ids.vung]);
    expect(log.rows[0].n).toBe(1);
    const co = await tm.get(`/api/lo-mua/${ids.lmDu}/phieu-thu-gom`).expect(200);
    expect(co.body.thua.find((t: { id: string }) => t.id === ids.thuaA)).toMatchObject({ capKg: 6000, usedKg: 0, conLaiKg: 6000 });
    // Thu mua xem được lô mua để ghi phiếu, nhưng không ghi sự kiện lô thay người phụ trách
    expect((await tm.get(`/api/lo-mua/${ids.lmDu}`).expect(200)).body.quyen.capNhat).toBe(false);
    expect((await tm.get('/api/lo-mua').expect(200)).body.loMua.map((l: { id: string }) => l.id)).toContain(ids.lmDu);
    await tm.post(`/api/lo-mua/${ids.lmDu}/su-kien`).send({ loai: 'thu_gom', khoiLuongKg: 1 }).expect(403);
    await tm.get('/api/lo-xuat').expect(403);
    // Thửa tiêu không hiện trong lô cà phê
    expect(co.body.thua.map((t: { id: string }) => t.id)).not.toContain(ids.thuaTieu);
  });

  it('phiếu đủ EUDR cộng vào lô và định nhãn lô; không vượt trần của thửa', async () => {
    // Kiểm tra rừng cho thửa A và B; người kiểm không tự duyệt
    const kt = await tm.post('/api/kiem-tra-rung').send({ plotIds: [ids.thuaA, ids.thuaB], method: 'jrc_2020', result: 'khong_rung', evidence: 'Đối chiếu bản đồ JRC GFC2020' }).expect(201);
    await tm.post('/api/kiem-tra-rung/duyet').send({ ids: kt.body.ids, dongY: true }).expect(403);
    await gd.post('/api/kiem-tra-rung/duyet').send({ ids: kt.body.ids, dongY: true }).expect(200);
    const r = await tm.post(`/api/lo-mua/${ids.lmDu}/phieu-thu-gom`).send(slip()).expect(201);
    expect(r.body).toMatchObject({ eudrOk: true, eudrReasons: [] });
    expect(r.body.code).toMatch(/-P001$/);
    ids.p1 = r.body.id;
    const over = await tm.post(`/api/lo-mua/${ids.lmDu}/phieu-thu-gom`).send(slip({ quantityKg: 2500 })).expect(400);
    expect(over.body.message).toMatch(/chỉ còn 2\.000 kg/);
    const lot = await nv.get(`/api/lo-mua/${ids.lmDu}`).expect(200);
    expect(lot.body).toMatchObject({ collectedKg: 4000, eudrClass: 'du' });
    expect(lot.body.suKien.at(-1)).toMatchObject({ kind: 'thu_gom', quantityKg: 4000 });
  });

  it('không trộn: lô đủ EUDR từ chối hàng chưa đủ và từ chối ghi tay không theo thửa', async () => {
    const mix = await tm.post(`/api/lo-mua/${ids.lmDu}/phieu-thu-gom`).send(slip({ plotId: ids.thuaB, quantityKg: 500 })).expect(400);
    expect(mix.body.message).toMatch(/chỉ nhận hàng đủ điều kiện EUDR.*cảnh báo/);
    const tay = await nv.post(`/api/lo-mua/${ids.lmDu}/su-kien`).send({ loai: 'thu_gom', khoiLuongKg: 100 }).expect(400);
    expect(tay.body.message).toMatch(/chỉ ghi thu gom bằng phiếu/);
    // Lô khác nhận hàng chưa đủ, và ghi tay được
    const k = await tm.post(`/api/lo-mua/${ids.lmKhong}/phieu-thu-gom`).send(slip({ plotId: ids.thuaB, quantityKg: 500 })).expect(201);
    expect(k.body.eudrOk).toBe(false);
    await nv.post(`/api/lo-mua/${ids.lmKhong}/su-kien`).send({ loai: 'thu_gom', khoiLuongKg: 700 }).expect(200);
    expect((await nv.get(`/api/lo-mua/${ids.lmKhong}`).expect(200)).body).toMatchObject({ collectedKg: 1200, eudrClass: 'khong_du' });
    // Lô không đủ cũng không nhận hàng đủ, để hàng đủ không mất nhãn
    const ve = await tm.post(`/api/lo-mua/${ids.lmKhong}/phieu-thu-gom`).send(slip({ quantityKg: 100 })).expect(400);
    expect(ve.body.message).toMatch(/lô riêng/);
  });

  it('hộ, thửa phải đúng của nhà cung cấp và đúng ngành; ngày thu hoạch không ở tương lai', async () => {
    await tm.post(`/api/lo-mua/${ids.lmDu}/phieu-thu-gom`).send(slip({ farmerId: ids.hoKhac })).expect(400);
    const sai = await tm.post(`/api/lo-mua/${ids.lmDu}/phieu-thu-gom`).send(slip({ plotId: ids.thuaTieu, quantityKg: 10 })).expect(400);
    expect(sai.body.message).toMatch(/ngành khác/);
    await tm.post(`/api/lo-mua/${ids.lmDu}/phieu-thu-gom`).send(slip({ harvestDate: '2099-01-01', quantityKg: 10 })).expect(400);
    // Nhân viên KD không phụ trách lô thì không ghi được
    const nvKhac = (await fullFirstLogin(app, await createUser(app, ['NHAN_VIEN_KD'], 'tgnv2'))).agent;
    await nvKhac.post(`/api/lo-mua/${ids.lmDu}/phieu-thu-gom`).send(slip({ quantityKg: 10 })).expect(403);
  });

  it('cổng: HTX ghi phiếu cho lô của mình, không thấy lô của HTX khác', async () => {
    const ds = await s1.get('/api/cong/thu-gom').expect(200);
    expect(ds.body.lo.map((l: { id: string }) => l.id)).toEqual(expect.arrayContaining([ids.lmDu, ids.lmKhong]));
    expect((await s2.get('/api/cong/thu-gom').expect(200)).body.lo).toEqual([]);
    await s2.get(`/api/cong/thu-gom/${ids.lmDu}`).expect(404);
    await s2.post(`/api/cong/thu-gom/${ids.lmDu}`).send(slip({ quantityKg: 10 })).expect(404);
    const r = await s1.post(`/api/cong/thu-gom/${ids.lmDu}`).send(slip({ quantityKg: 1500, weighTicketNo: 'PC-0002' })).expect(201);
    expect(r.body.eudrOk).toBe(true);
    ids.p2 = r.body.id;
    const d = await s1.get(`/api/cong/thu-gom/${ids.lmDu}`).expect(200);
    expect(d.body.phieu.map((p: { source: string }) => p.source)).toEqual(['noi_bo', 'cong_ncc']);
    expect(d.body.thua.find((t: { id: string }) => t.id === ids.thuaA)).toMatchObject({ usedKg: 5500, conLaiKg: 500 });
    // Nhân viên không dùng đường của cổng
    await tm.get('/api/cong/thu-gom').expect(403);
  });

  it('huỷ phiếu sai: trừ lại khối lượng, ghi lý do; không huỷ được sau khi sơ chế', async () => {
    await s1.post(`/api/cong/thu-gom/phieu/${ids.p2}/huy`).send({ lyDo: 'Cân nhầm, cân lại' }).expect(200);
    await s1.post(`/api/cong/thu-gom/phieu/${ids.p2}/huy`).send({ lyDo: 'Lần nữa' }).expect(400);
    const lot = await nv.get(`/api/lo-mua/${ids.lmDu}`).expect(200);
    expect(lot.body.collectedKg).toBe(4000);
    expect(lot.body.suKien.at(-1)).toMatchObject({ kind: 'huy_phieu', quantityKg: 1500 });
    const audit = await pool.query(`select action from audit_log where entity_id = $1 order by id`, [ids.p2]);
    expect(audit.rows.map((r) => r.action)).toEqual(['phieu_thu_gom.tao', 'phieu_thu_gom.huy']);

    await nv.post(`/api/lo-mua/${ids.lmDu}/su-kien`).send({ loai: 'so_che', khoiLuongKg: 4000 }).expect(200);
    await nv.post(`/api/lo-mua/${ids.lmKhong}/su-kien`).send({ loai: 'so_che', khoiLuongKg: 1200 }).expect(200);
    await tm.post(`/api/phieu-thu-gom/${ids.p1}/huy`).send({ lyDo: 'Thử huỷ' }).expect(400);
    await tm.post(`/api/lo-mua/${ids.lmDu}/phieu-thu-gom`).send(slip({ quantityKg: 10 })).expect(400);
  });

  it('lô xuất đi EU chỉ nhận cà phê đủ EUDR', async () => {
    ids.lx = (await nv.post('/api/lo-xuat').send({ hopDongDoiUngId: ids.tt, thiTruong: 'EU', etd: '2027-01-20' }).expect(201)).body.id;
    const bad = await nv.post(`/api/lo-xuat/${ids.lx}/phan-bo`).send({ loMuaId: ids.lmKhong, khoiLuongKg: 1000 }).expect(400);
    expect(bad.body.message).toMatch(/đủ điều kiện EUDR/);
    await nv.post(`/api/lo-xuat/${ids.lx}/phan-bo`).send({ loMuaId: ids.lmDu, khoiLuongKg: 4000 }).expect(201);
  });
});

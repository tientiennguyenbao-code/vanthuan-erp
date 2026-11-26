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

// Cư M'gar, Đắk Lắk
const pt = (dx: number): [number, number] => [108.1 + dx * 0.01, 12.9];

describe('Kiểm tra rừng (duyệt 4 mắt) và gói dữ liệu EUDR theo lô xuất', () => {
  let app: INestApplication;
  let pool: Pool;
  let nv: Agent;
  let tp: Agent;
  let tm: Agent;
  let gd: Agent;
  let ncc: string;
  let buyer: string;
  let mh: string;
  let n = 0;
  const ids: Record<string, string> = {};

  async function partner(roles: string[]) {
    const res = await nv.post('/api/doi-tac').send({ code: `EU${Date.now() % 100000}${++n}`, name: `HTX EUDR ${n}`, country: 'VN', category: 'htx', roles }).expect(201);
    const id = res.body.id as string;
    await nv.post(`/api/doi-tac/${id}/tai-lieu`).send({ docType: 'Giấy chứng nhận đăng ký HTX', number: `HTX${n}` }).expect(201);
    await nv.post(`/api/doi-tac/${id}/trinh-tham-dinh`).send({ riskRating: 'thap', screeningNote: 'Không có trong danh sách trừng phạt' }).expect(200);
    await tp.post(`/api/doi-tac/${id}/quyet-dinh-tham-dinh`).send({ dongY: true }).expect(200);
    return id;
  }
  async function signed(body: Record<string, unknown>) {
    const c = await nv.post('/api/hop-dong').send({ matHangId: mh, ...body }).expect(201);
    await nv.post(`/api/hop-dong/${c.body.id}/trinh-ky`).expect(200);
    const g = await fullFirstLogin(app, await createUser(app, ['GIAM_DOC'], 'gdeu'));
    await g.agent.post(`/api/hop-dong/${c.body.id}/ky`).send({ ma2Lop: codeFor(g.secret, 1) }).expect(200);
    return c.body.id as string;
  }
  const check = (plotIds: string[], result = 'khong_rung') => ({ plotIds, method: 'jrc_2020', result, evidence: 'Đối chiếu lớp JRC GFC2020 ngày 26/11/2026' });
  const plot = async (id: string) => {
    const d = await tm.get(`/api/nguon-cung/${ncc}`).expect(200);
    return d.body.thua.find((t: { id: string }) => t.id === id) as { forestStatus: string };
  };

  beforeAll(async () => {
    app = await startApp();
    pool = app.get<Pool>(PG_POOL);
    nv = (await fullFirstLogin(app, await createUser(app, ['NHAN_VIEN_KD'], 'eunv'))).agent;
    tp = (await fullFirstLogin(app, await createUser(app, ['TRUONG_PHONG_KD'], 'eutp'))).agent;
    tm = (await fullFirstLogin(app, await createUser(app, ['NHAN_VIEN_THU_MUA'], 'eutm'))).agent;
    gd = (await fullFirstLogin(app, await createUser(app, ['GIAM_DOC'], 'eugd'))).agent;
    ncc = await partner(['nha_cung_cap']);
    buyer = await partner(['nguoi_mua']);
    mh = (await tp.post('/api/danh-muc/mat-hang').send({ code: `EUROB${Date.now() % 100000}`, name: 'Cà phê Robusta', sector: 'ca_phe', hsCode: '090111' }).expect(201)).body.id;
    ids.mg = await signed({ loai: 'moi_gioi', benBanId: ncc, dieuKhoan: terms(10) });
    ids.tt = await signed({ loai: 'mua_ban_truc_tiep', benBanId: ncc, benMuaId: buyer, dieuKhoan: terms(3, { tyLePhiPhanTram: null, donGia: 4875 }) });
    ids.lm = (await nv.post('/api/lo-mua').send({ hopDongId: ids.mg }).expect(201)).body.id;
    ids.vung = (await tm.post(`/api/nguon-cung/${ncc}/vung`).send({ name: "Vùng Cư M'gar", kind: 'vung_trong', sector: 'ca_phe', officialCode: 'DL-CP-0099', province: 'Đắk Lắk' }).expect(201)).body.id;
    await gd.put(`/api/nang-suat/vung/${ids.vung}`).send({ kgMoiHa: 3000 }).expect(200);
    ids.ho = (await tm.post(`/api/nguon-cung/${ncc}/ho`).send({ fullName: 'Y Moan Ênuôl', province: 'Đắk Lắk', consentOn: '2026-11-01' }).expect(201)).body.id;
    const thua = (dx: number) => tm.post(`/api/nguon-cung/${ncc}/thua`).send({ farmerId: ids.ho, growingAreaId: ids.vung, kind: 'thua', crop: 'Robusta', geometry: { type: 'Point', coordinates: pt(dx) }, declaredAreaHa: 2 }).expect(201);
    ids.p1 = (await thua(0)).body.id;
    ids.p2 = (await thua(3)).body.id;
  });
  afterAll(async () => {
    await app.close();
  });

  it('kiểm tra rừng: người kiểm không tự duyệt; thửa đang chờ thì không ghi kết quả mới', async () => {
    expect((await plot(ids.p1)).forestStatus).toBe('chua_kiem');
    await nv.post('/api/kiem-tra-rung').send(check([ids.p1])).expect(403);
    const r = await tp.post('/api/kiem-tra-rung').send(check([ids.p1])).expect(201);
    expect(r.body.soThua).toBe(1);
    expect((await plot(ids.p1)).forestStatus).toBe('cho_duyet');
    await tm.post('/api/kiem-tra-rung').send(check([ids.p1])).expect(400);
    const tu = await tp.post('/api/kiem-tra-rung/duyet').send({ ids: r.body.ids, dongY: true }).expect(400);
    expect(tu.body.message).toMatch(/không tự duyệt/);
    const cho = await gd.get('/api/kiem-tra-rung?trangThai=cho_duyet').expect(200);
    expect(cho.body.ketQua.map((k: { id: string }) => k.id)).toContain(r.body.ids[0]);
    expect(cho.body.duocDuyet).toBe(true);
    await gd.post('/api/kiem-tra-rung/duyet').send({ ids: r.body.ids, dongY: true }).expect(200);
    expect((await plot(ids.p1)).forestStatus).toBe('khong_rung');
    const log = await pool.query(`select count(*)::int as n from audit_log where action = 'nguon_cung.duyet_kiem_tra_rung' and entity_id = $1`, [r.body.ids[0]]);
    expect(log.rows[0].n).toBe(1);
  });

  it('trả lại phải có lý do; đo lại tọa độ thì kết quả đang chờ hết hiệu lực', async () => {
    const r = await tm.post('/api/kiem-tra-rung').send(check([ids.p2])).expect(201);
    await gd.post('/api/kiem-tra-rung/duyet').send({ ids: r.body.ids, dongY: false }).expect(400);
    await gd.post('/api/kiem-tra-rung/duyet').send({ ids: r.body.ids, dongY: false, ghiChu: 'Thiếu ảnh chụp lớp bản đồ' }).expect(200);
    expect((await plot(ids.p2)).forestStatus).toBe('chua_kiem');

    const r2 = await tm.post('/api/kiem-tra-rung').send(check([ids.p2])).expect(201);
    await tm.post(`/api/nguon-cung/thua/${ids.p2}/toa-do`).send({ geometry: { type: 'Point', coordinates: pt(3.1) }, lyDo: 'Đo lại bằng GPS tốt hơn' }).expect(200);
    expect((await plot(ids.p2)).forestStatus).toBe('chua_kiem');
    const het = await gd.post('/api/kiem-tra-rung/duyet').send({ ids: r2.body.ids, dongY: true }).expect(400);
    expect(het.body.message).toMatch(/không còn chờ duyệt/);
  });

  it('thửa chưa kiểm tra rừng thì hàng chưa đủ EUDR', async () => {
    const d = await tm.get(`/api/lo-mua/${ids.lm}/phieu-thu-gom`).expect(200);
    expect(d.body.thua.find((t: { id: string }) => t.id === ids.p2)).toMatchObject({ forestStatus: 'chua_kiem' });
    const lmKhac = (await nv.post('/api/lo-mua').send({ hopDongId: ids.mg }).expect(201)).body.id;
    const s = await tm.post(`/api/lo-mua/${lmKhac}/phieu-thu-gom`).send({ farmerId: ids.ho, plotId: ids.p2, harvestDate: '2026-11-10', quantityKg: 100 }).expect(201);
    expect(s.body.eudrOk).toBe(false);
    expect(s.body.eudrReasons.join(' ')).toMatch(/kiểm tra rừng/);
  });

  it('gói EUDR: đủ thửa, tọa độ, khối lượng, không tên hộ; chốt thì mã băm lên sổ cái', async () => {
    const s = await tm.post(`/api/lo-mua/${ids.lm}/phieu-thu-gom`).send({ farmerId: ids.ho, plotId: ids.p1, harvestDate: '2026-11-12', quantityKg: 3000 }).expect(201);
    expect(s.body.eudrOk).toBe(true);
    await nv.post(`/api/lo-mua/${ids.lm}/su-kien`).send({ loai: 'so_che', khoiLuongKg: 2950 }).expect(200);
    ids.lx = (await nv.post('/api/lo-xuat').send({ hopDongDoiUngId: ids.tt, thiTruong: 'EU', etd: '2027-01-20' }).expect(201)).body.id;
    const truoc = await nv.get(`/api/lo-xuat/${ids.lx}/goi-eudr`).expect(200);
    expect(truoc.body.vanDe[0]).toMatch(/chưa có lô mua/);
    expect(truoc.body.duocChot).toBe(false);
    await nv.post(`/api/lo-xuat/${ids.lx}/goi-eudr`).expect(400);
    await nv.post(`/api/lo-xuat/${ids.lx}/phan-bo`).send({ loMuaId: ids.lm, khoiLuongKg: 2950 }).expect(201);

    const g = await nv.get(`/api/lo-xuat/${ids.lx}/goi-eudr`).expect(200);
    expect(g.body.vanDe).toEqual([]);
    expect(g.body.duocChot).toBe(true);
    expect(g.body.xemTruoc.loXuat).toMatchObject({ thiTruong: 'EU', maHs: '090111', tongKg: 2950 });
    expect(g.body.xemTruoc.thua).toEqual([expect.objectContaining({ maSoVung: 'DL-CP-0099', dienTichHa: 2, khoiLuongKg: 3000, kiemTraRung: expect.objectContaining({ trangThai: 'khong_rung', cach: 'jrc_2020' }) })]);
    expect(JSON.stringify(g.body)).not.toContain('Ênuôl');
    await tm.get(`/api/lo-xuat/${ids.lx}/goi-eudr`).expect(403);

    const c = await nv.post(`/api/lo-xuat/${ids.lx}/goi-eudr`).expect(201);
    expect(c.body.version).toBe(1);
    const so = await pool.query(`select event, note from contract_ledger where contract_id = $1 and content_hash = $2`, [ids.tt, c.body.contentHash]);
    expect(so.rows).toEqual([expect.objectContaining({ event: 'goi_eudr' })]);
    const lai = await nv.post(`/api/lo-xuat/${ids.lx}/goi-eudr`).expect(400);
    expect(lai.body.message).toMatch(/không đổi/);
    const sau = await nv.get(`/api/lo-xuat/${ids.lx}/goi-eudr`).expect(200);
    expect(sau.body).toMatchObject({ khopBanChotGanNhat: true, duocChot: false });
    expect(sau.body.daChot).toHaveLength(1);

    const f = await nv.get(`/api/lo-xuat/${ids.lx}/goi-eudr/1/geojson`).buffer(true).parse((res, cb) => { let t = ''; res.on('data', (x) => (t += x)); res.on('end', () => cb(null, t)); }).expect(200);
    const fc = JSON.parse(f.body as string);
    expect(fc.features[0].properties).toMatchObject({ ProducerCountry: 'VN', Area: 2, khoiLuongKg: 3000, kiemTraRung: 'jrc_2020' });
    expect(fc.features[0].geometry.type).toBe('Point');
    expect(f.body).not.toContain('Ênuôl');
    await nv.get(`/api/lo-xuat/${ids.lx}/goi-eudr/9/geojson`).expect(404);
    // Bản đã chốt không sửa được
    await expect(pool.query(`update eudr_packages set content_hash = 'x' where export_lot_id = $1`, [ids.lx])).rejects.toThrow(/chỉ được ghi thêm/);
  });

  it('thửa đo lại sau khi chốt: gói hiện vấn đề, không chốt bản mới được cho đến khi kiểm lại', async () => {
    await tm.post(`/api/nguon-cung/thua/${ids.p1}/toa-do`).send({ geometry: { type: 'Point', coordinates: pt(0.05) }, lyDo: 'Đo lại' }).expect(200);
    const g = await nv.get(`/api/lo-xuat/${ids.lx}/goi-eudr`).expect(200);
    expect(g.body.vanDe.join(' ')).toMatch(/không rừng/);
    expect(g.body.khopBanChotGanNhat).toBe(false);
    await nv.post(`/api/lo-xuat/${ids.lx}/goi-eudr`).expect(400);
    const r = await tm.post('/api/kiem-tra-rung').send(check([ids.p1])).expect(201);
    await gd.post('/api/kiem-tra-rung/duyet').send({ ids: r.body.ids, dongY: true }).expect(200);
    expect((await nv.post(`/api/lo-xuat/${ids.lx}/goi-eudr`).expect(201)).body.version).toBe(2);
  });
});

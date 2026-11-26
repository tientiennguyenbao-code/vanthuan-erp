import { INestApplication } from '@nestjs/common';
import { Pool } from 'pg';
import { PG_POOL } from '../src/db/db';
import { createUser, fullFirstLogin, startApp, uniqueEmail } from './helpers';

type Agent = Awaited<ReturnType<typeof fullFirstLogin>>['agent'];

// Thửa vuông khoảng 300 m × 300 m (≈ 9 ha) ở Krông Pắc, Đắk Lắk
const lon0 = 108.31;
const lat0 = 12.71;
const m = (dx: number, dy: number): [number, number] => [lon0 + dx / (111_320 * Math.cos((lat0 * Math.PI) / 180)), lat0 + dy / 111_320];
const square = (x: number, y: number, size: number) => ({ type: 'Polygon', coordinates: [[m(x, y), m(x + size, y), m(x + size, y + size), m(x, y + size)]] });

describe('Nguồn cung: nông hộ, vùng trồng, thửa', () => {
  let app: INestApplication;
  let pool: Pool;
  let tm: Agent; // nhân viên thu mua
  let nv: Agent; // nhân viên kinh doanh (chỉ xem)
  let tp: Agent;
  let gd: Agent;
  let s1: Agent; // nhà cung cấp 1 trên cổng
  let s2: Agent;
  let ncc1: string;
  let ncc2: string;
  let nccChuaDuyet: string;
  let n = 0;
  const ids: Record<string, string> = {};

  async function partner(roles: string[], approve = true) {
    const res = await tp.post('/api/doi-tac').send({ code: `NC${Date.now() % 100000}${++n}`, name: `HTX cà phê ${n}`, country: 'VN', category: 'htx', roles }).expect(201);
    const id = res.body.id as string;
    if (!approve) return id;
    await tp.post(`/api/doi-tac/${id}/tai-lieu`).send({ docType: 'Giấy chứng nhận đăng ký HTX', number: `HTX${n}` }).expect(201);
    await tp.post(`/api/doi-tac/${id}/trinh-tham-dinh`).send({ riskRating: 'thap', screeningNote: 'Không có trong danh sách trừng phạt' }).expect(200);
    await gd.post(`/api/doi-tac/${id}/quyet-dinh-tham-dinh`).send({ dongY: true }).expect(200);
    return id;
  }
  async function portalLogin(partnerId: string) {
    const r = await tp.post(`/api/doi-tac/${partnerId}/tai-khoan-cong`).send({ email: uniqueEmail('htx'), hoTen: 'Kế toán HTX' }).expect(201);
    return (await fullFirstLogin(app, { email: r.body.email ?? (await pool.query('select email from users where id = $1', [r.body.id])).rows[0].email, password: r.body.matKhauTam })).agent;
  }
  const farmer = (over: Record<string, unknown> = {}) => ({ fullName: 'Y Bhim Niê', idNumber: '066 090 001 234', phone: '0905000111', commune: 'Ea Kênh', district: 'Krông Pắc', province: 'Đắk Lắk', consentOn: '2026-11-20', ...over });

  beforeAll(async () => {
    app = await startApp();
    pool = app.get<Pool>(PG_POOL);
    tm = (await fullFirstLogin(app, await createUser(app, ['NHAN_VIEN_THU_MUA'], 'tm'))).agent;
    nv = (await fullFirstLogin(app, await createUser(app, ['NHAN_VIEN_KD'], 'ncnv'))).agent;
    tp = (await fullFirstLogin(app, await createUser(app, ['TRUONG_PHONG_KD'], 'nctp'))).agent;
    gd = (await fullFirstLogin(app, await createUser(app, ['GIAM_DOC'], 'ncgd'))).agent;
    ncc1 = await partner(['nha_cung_cap']);
    ncc2 = await partner(['nha_cung_cap']);
    nccChuaDuyet = await partner(['nha_cung_cap'], false);
    s1 = await portalLogin(ncc1);
    s2 = await portalLogin(ncc2);
  });
  afterAll(async () => {
    await app.close();
  });

  it('nhân viên thu mua lập vùng trồng; nhà cung cấp chưa thẩm định thì chưa được', async () => {
    const vung = { name: 'Vùng Ea Kênh', kind: 'vung_trong', sector: 'ca_phe', officialCode: 'DL-CP-0012', officialCodeIssuer: 'Chi cục Trồng trọt và BVTV Đắk Lắk', province: 'Đắk Lắk', district: 'Krông Pắc' };
    const r = await tm.post(`/api/nguon-cung/${ncc1}/vung`).send(vung).expect(201);
    expect(r.body.code).toMatch(/-V01$/);
    ids.vung1 = r.body.id;
    ids.vungNuoi = (await tm.post(`/api/nguon-cung/${ncc1}/vung`).send({ name: 'Ao tôm Cà Mau', kind: 'vung_nuoi', sector: 'thuy_san', province: 'Cà Mau' }).expect(201)).body.id;
    ids.vung2 = (await tm.post(`/api/nguon-cung/${ncc2}/vung`).send({ ...vung, officialCode: null }).expect(201)).body.id;
    const bad = await tm.post(`/api/nguon-cung/${nccChuaDuyet}/vung`).send(vung).expect(400);
    expect(bad.body.message).toMatch(/chưa được duyệt thẩm định/);
    // Nhân viên kinh doanh chỉ xem; nhà cung cấp không lập vùng
    await nv.post(`/api/nguon-cung/${ncc1}/vung`).send(vung).expect(403);
    await s1.post(`/api/nguon-cung/${ncc1}/vung`).send(vung).expect(403);
  });

  it('nông hộ: CCCD mã hoá, chỉ hiện 4 số cuối; không trùng trong một HTX; cảnh báo khi hộ ở HTX khác', async () => {
    const h = await tm.post(`/api/nguon-cung/${ncc1}/ho`).send(farmer()).expect(201);
    ids.ho1 = h.body.id;
    expect(h.body.code).toMatch(/-H001$/);
    expect(h.body.canhBao).toEqual([]);
    const raw = await pool.query('select id_number_enc, id_number_last4 from farmers where id = $1', [ids.ho1]);
    expect(raw.rows[0].id_number_enc).not.toContain('066090001234');
    expect(raw.rows[0].id_number_last4).toBe('1234');

    await tm.post(`/api/nguon-cung/${ncc1}/ho`).send(farmer({ fullName: 'Người khác', idNumber: '066090001234' })).expect(409);
    await tm.post(`/api/nguon-cung/${ncc1}/ho`).send(farmer({ idNumber: '12345' })).expect(400);
    await tm.post(`/api/nguon-cung/${ncc1}/ho`).send(farmer({ consentOn: undefined })).expect(400);
    const other = await tm.post(`/api/nguon-cung/${ncc2}/ho`).send(farmer()).expect(201);
    expect(other.body.canhBao[0]).toMatch(/nhà cung cấp khác/);
    ids.ho2 = other.body.id;

    const d = await nv.get(`/api/nguon-cung/${ncc1}`).expect(200);
    expect(d.body.ho[0]).toMatchObject({ cccd: '••••••••1234', coCccd: true });
    expect(JSON.stringify(d.body)).not.toContain('066090001234');
    expect(d.body.duocSua).toBe(false);
    expect((await tm.get(`/api/nguon-cung/${ncc1}`).expect(200)).body.duocSua).toBe(true);
  });

  it('xem đủ CCCD chỉ Giám đốc và thu mua, mỗi lần xem ghi nhật ký', async () => {
    await nv.get(`/api/nguon-cung/ho/${ids.ho1}/cccd`).expect(403);
    await tp.get(`/api/nguon-cung/ho/${ids.ho1}/cccd`).expect(403);
    expect((await gd.get(`/api/nguon-cung/ho/${ids.ho1}/cccd`).expect(200)).body.cccd).toBe('066090001234');
    const log = await pool.query(`select count(*)::int as n from audit_log where action = 'nguon_cung.xem_cccd' and entity_id = $1`, [ids.ho1]);
    expect(log.rows[0].n).toBe(1);
  });

  it('thửa theo EUDR: ≤ 4 ha được một điểm, trên 4 ha phải vẽ ranh giới', async () => {
    const base = { farmerId: ids.ho1, growingAreaId: ids.vung1, kind: 'thua', crop: 'Robusta', plantedYear: 2012 };
    const p1 = await tm.post(`/api/nguon-cung/${ncc1}/thua`).send({ ...base, geometry: { type: 'Point', coordinates: m(1000, 1000) }, declaredAreaHa: 2.5, gpsAccuracyM: 4 }).expect(201);
    expect(p1.body).toMatchObject({ dienTichHa: 2.5, canhBao: [] });
    expect(p1.body.code).toMatch(/-V01-001$/);
    ids.thuaDiem = p1.body.id;

    const big = await tm.post(`/api/nguon-cung/${ncc1}/thua`).send({ ...base, geometry: { type: 'Point', coordinates: m(2000, 2000) }, declaredAreaHa: 6 }).expect(400);
    expect(big.body.message).toMatch(/phải vẽ ranh giới/);

    const poly = await tm.post(`/api/nguon-cung/${ncc1}/thua`).send({ ...base, geometry: square(0, 0, 300), declaredAreaHa: 9 }).expect(201);
    expect(poly.body.dienTichHa).toBeGreaterThan(8.9);
    expect(poly.body.dienTichHa).toBeLessThan(9.1);
    ids.thuaDaGiac = poly.body.id;

    // Đảo kinh độ / vĩ độ, ranh giới tự cắt, ao đặt vào vùng trồng
    await tm.post(`/api/nguon-cung/${ncc1}/thua`).send({ ...base, geometry: { type: 'Point', coordinates: [lat0, lon0] }, declaredAreaHa: 1 }).expect(400);
    const [a, b, c, d] = square(5000, 5000, 100).coordinates[0];
    const cross = await tm.post(`/api/nguon-cung/${ncc1}/thua`).send({ ...base, geometry: { type: 'Polygon', coordinates: [[a, c, b, d]] } }).expect(400);
    expect(cross.body.message).toMatch(/tự cắt/);
    await tm.post(`/api/nguon-cung/${ncc1}/thua`).send({ ...base, kind: 'ao', geometry: { type: 'Point', coordinates: m(9000, 9000) }, declaredAreaHa: 1 }).expect(400);
    // Hộ của nhà cung cấp khác
    await tm.post(`/api/nguon-cung/${ncc1}/thua`).send({ ...base, farmerId: ids.ho2, geometry: { type: 'Point', coordinates: m(9000, 9000) }, declaredAreaHa: 1 }).expect(400);
  });

  it('cảnh báo khi thửa chồng lên thửa đã khai, kể cả của nhà cung cấp khác', async () => {
    const r = await tm
      .post(`/api/nguon-cung/${ncc2}/thua`)
      .send({ farmerId: ids.ho2, growingAreaId: ids.vung2, kind: 'thua', geometry: { type: 'Point', coordinates: m(150, 150) }, declaredAreaHa: 1 })
      .expect(201);
    expect(r.body.canhBao[0]).toMatch(/Chồng lấn.*-V01-002/);
    const ov = await tm.get('/api/nguon-cung').expect(200);
    expect(ov.body.nhaCungCap.find((x: { id: string }) => x.id === ncc2)).toMatchObject({ soThua: 1, soCanhBao: 1 });
    expect(ov.body.nhaCungCap.find((x: { id: string }) => x.id === ncc1)).toMatchObject({ soHo: 1, soVung: 2, soThua: 2, soDaGiac: 1 });
  });

  it('nhà cung cấp tự thêm hộ và thửa trên cổng, chỉ thấy dữ liệu của mình', async () => {
    const h = await s1.post('/api/cong/nguon-cung/ho').send(farmer({ fullName: 'H Mai Ê Ban', idNumber: '066090009999' })).expect(201);
    const t = await s1
      .post('/api/cong/nguon-cung/thua')
      .send({ farmerId: h.body.id, growingAreaId: ids.vung1, kind: 'thua', crop: 'Robusta', geometry: { type: 'Point', coordinates: m(3000, 3000) }, declaredAreaHa: 1.2, gpsAccuracyM: 6 })
      .expect(201);
    ids.thuaCong = t.body.id;
    const mine = await s1.get('/api/cong/nguon-cung').expect(200);
    expect(mine.body.nhaCungCap.id).toBe(ncc1);
    expect(mine.body.thua.find((x: { id: string }) => x.id === ids.thuaCong)).toMatchObject({ source: 'cong_ncc', gpsAccuracyM: 6 });
    // Không dùng được hộ hay vùng của nhà cung cấp khác, không vào trang nội bộ
    await s2.post('/api/cong/nguon-cung/thua').send({ farmerId: h.body.id, growingAreaId: ids.vung2, kind: 'thua', geometry: { type: 'Point', coordinates: m(7000, 7000) }, declaredAreaHa: 1 }).expect(400);
    await s2.post('/api/cong/nguon-cung/thua').send({ farmerId: ids.ho2, growingAreaId: ids.vung1, kind: 'thua', geometry: { type: 'Point', coordinates: m(7000, 7000) }, declaredAreaHa: 1 }).expect(400);
    await s2.post(`/api/cong/nguon-cung/thua/${ids.thuaCong}/toa-do`).send({ geometry: { type: 'Point', coordinates: m(3001, 3001) }, lyDo: 'Đo lại' }).expect(403);
    await s1.get(`/api/nguon-cung/${ncc1}`).expect(403);
    await s1.get(`/api/nguon-cung/${ncc2}/geojson`).expect(403);
    await nv.get('/api/cong/nguon-cung').expect(403);
    const theirs = await s2.get('/api/cong/nguon-cung').expect(200);
    expect(JSON.stringify(theirs.body)).not.toContain(ids.thuaCong);
  });

  it('đo lại ranh giới: tọa độ cũ giữ trong nhật ký', async () => {
    const r = await s1
      .post(`/api/cong/nguon-cung/thua/${ids.thuaCong}/toa-do`)
      .send({ geometry: square(3000, 3000, 120), lyDo: 'Đi quanh ranh giới thay cho một điểm' })
      .expect(200);
    expect(r.body.dienTichHa).toBeCloseTo(1.44, 1);
    const log = await pool.query(`select detail from audit_log where action = 'nguon_cung.sua_toa_do' and entity_id = $1`, [ids.thuaCong]);
    expect(log.rows[0].detail.truoc.toaDo.type).toBe('Point');
    expect(log.rows[0].detail.sau.toaDo.type).toBe('Polygon');
  });

  it('xuất GeoJSON cho EUDR, không kèm tên hay CCCD của hộ', async () => {
    const r = await tm.get(`/api/nguon-cung/${ncc1}/geojson?vung=${ids.vung1}`).expect(200);
    expect(r.headers['content-type']).toMatch(/geo\+json/);
    const fc = JSON.parse(r.text);
    expect(fc.type).toBe('FeatureCollection');
    expect(fc.features).toHaveLength(3);
    expect(fc.features[0].properties).toMatchObject({ ProducerCountry: 'VN', Area: expect.any(Number) });
    expect(r.text).not.toMatch(/Bhim|Mai Ê Ban|066090/);
    const mine = await s1.get('/api/cong/nguon-cung/geojson').expect(200);
    expect(JSON.parse(mine.text).features).toHaveLength(3);
  });

  it('nhập nhiều thửa từ tệp GeoJSON: có dòng lỗi thì không ghi dòng nào', async () => {
    const d = await tm.get(`/api/nguon-cung/${ncc1}`).expect(200);
    const maHo = d.body.ho[0].code;
    const ok = (dx: number) => ({ type: 'Feature', properties: { maHo, dienTichHa: 0.8 }, geometry: { type: 'Point', coordinates: m(dx, 8000) } });
    const bad = await tm
      .post(`/api/nguon-cung/${ncc1}/nhap-geojson`)
      .send({ growingAreaId: ids.vung1, kind: 'thua', crop: 'Robusta', features: [ok(0), { type: 'Feature', properties: { maHo: 'KHONG-CO' }, geometry: { type: 'Point', coordinates: m(500, 8000) } }, { type: 'Feature', properties: { maHo, dienTichHa: 7 }, geometry: { type: 'Point', coordinates: m(900, 8000) } }] })
      .expect(400);
    expect(bad.body.loi.map((l: { truong: string }) => l.truong)).toEqual(['dong 2', 'dong 3']);
    const before = (await pool.query('select count(*)::int as n from plots where supplier_partner_id = $1', [ncc1])).rows[0].n;
    const good = await tm.post(`/api/nguon-cung/${ncc1}/nhap-geojson`).send({ growingAreaId: ids.vung1, kind: 'thua', crop: 'Robusta', features: [ok(0), ok(400), ok(800)] }).expect(201);
    expect(good.body.soThua).toBe(3);
    const after = (await pool.query('select count(*)::int as n, count(*) filter (where source = $2)::int as tep from plots where supplier_partner_id = $1', [ncc1, 'nhap_tep'])).rows[0];
    expect(after.n).toBe(before + 3);
    expect(after.tep).toBe(3);
  });

  it('chứng nhận gắn phạm vi một vùng; huỷ thửa và hộ có lý do', async () => {
    await tp.post(`/api/doi-tac/${ncc1}/tai-lieu`).send({ docType: 'Rainforest Alliance', number: 'RA-001', expiresOn: '2027-12-31', growingAreaId: ids.vung1 }).expect(201);
    await tp.post(`/api/doi-tac/${ncc1}/tai-lieu`).send({ docType: 'Rainforest Alliance', number: 'RA-002', growingAreaId: ids.vung2 }).expect(400);
    const d = await tm.get(`/api/nguon-cung/${ncc1}`).expect(200);
    expect(d.body.vung.find((v: { id: string }) => v.id === ids.vung1).chungNhan).toEqual([expect.objectContaining({ docType: 'Rainforest Alliance', number: 'RA-001' })]);
    expect(d.body.chungNhanChung.map((c: { docType: string }) => c.docType)).toContain('Giấy chứng nhận đăng ký HTX');

    const r = await tm.post(`/api/nguon-cung/ho/${ids.ho2}/huy`).send({ lyDo: 'Khai nhầm' }).expect(400);
    expect(r.body.message).toMatch(/còn 1 thửa/);
    const t2 = (await tm.get(`/api/nguon-cung/${ncc2}`).expect(200)).body.thua[0].id;
    await tm.post(`/api/nguon-cung/thua/${t2}/huy`).send({ lyDo: 'Trùng thửa của HTX khác' }).expect(200);
    await tm.post(`/api/nguon-cung/ho/${ids.ho2}/huy`).send({ lyDo: 'Hộ đã bán cho HTX khác' }).expect(200);
    await s1.post(`/api/nguon-cung/thua/${ids.thuaDiem}/huy`).send({ lyDo: 'Thử' }).expect(403);
    const ov = (await tm.get('/api/nguon-cung').expect(200)).body.nhaCungCap.find((x: { id: string }) => x.id === ncc2);
    expect(ov).toMatchObject({ soHo: 0, soThua: 0 });
  });
});

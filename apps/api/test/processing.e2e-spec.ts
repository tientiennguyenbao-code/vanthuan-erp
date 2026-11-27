import { INestApplication } from '@nestjs/common';
import { Pool } from 'pg';
import { PG_POOL } from '../src/db/db';
import { codeFor, createUser, fullFirstLogin, startApp, thuGomDuEudr } from './helpers';

type Agent = Awaited<ReturnType<typeof fullFirstLogin>>['agent'];

const terms = () => ({
  soLuong: 20000,
  donVi: 'kg',
  dungSaiPhanTram: 5,
  donGia: 118000,
  tienTe: 'VND',
  tyGiaUsd: 25400,
  incoterms: 'EXW',
  cangDi: null,
  cangDen: null,
  lichGiao: 'Giao tại kho trước 15/01/2027',
  dieuKhoanThanhToan: 'Đặt cọc 30%, phần còn lại khi giao hàng',
  tyLePhiPhanTram: 1.5,
  ghiChu: null,
});

describe('Kho: lệnh sơ chế, định mức hao hụt, truy xuất qua sơ chế', () => {
  let app: INestApplication;
  let pool: Pool;
  let nv: Agent;
  let tp: Agent;
  let gd: Agent;
  let tk1: Agent;
  let tk2: Agent;
  let n = 0;
  const ids: Record<string, string> = {};

  async function partner() {
    const res = await nv.post('/api/doi-tac').send({ code: `SC${Date.now() % 100000}${++n}`, name: `HTX sơ chế ${n}`, country: 'VN', category: 'htx', roles: ['nha_cung_cap'] }).expect(201);
    const id = res.body.id as string;
    await nv.post(`/api/doi-tac/${id}/tai-lieu`).send({ docType: 'Giấy chứng nhận đăng ký HTX', number: `HTXS${n}` }).expect(201);
    await nv.post(`/api/doi-tac/${id}/trinh-tham-dinh`).send({ riskRating: 'thap', screeningNote: 'Không có trong danh sách trừng phạt' }).expect(200);
    await tp.post(`/api/doi-tac/${id}/quyet-dinh-tham-dinh`).send({ dongY: true }).expect(200);
    return id;
  }
  async function lot(supplier: string, mh: string, loai: 'mua' | 'moi_gioi') {
    const c = await nv.post('/api/hop-dong').send({ matHangId: mh, loai, benBanId: supplier, dieuKhoan: terms() }).expect(201);
    await nv.post(`/api/hop-dong/${c.body.id}/trinh-ky`).expect(200);
    const g = await fullFirstLogin(app, await createUser(app, ['GIAM_DOC'], 'gdsc'));
    await g.agent.post(`/api/hop-dong/${c.body.id}/ky`).send({ ma2Lop: codeFor(g.secret, 1) }).expect(200);
    return (await nv.post('/api/lo-mua').send({ hopDongId: c.body.id }).expect(201)).body.id as string;
  }
  async function nhan(loMuaId: string, khuId: string, kg: number, thuGom = true) {
    if (thuGom) await nv.post(`/api/lo-mua/${loMuaId}/su-kien`).send({ loai: 'thu_gom', khoiLuongKg: kg }).expect(200);
    const r = await tk1.post('/api/kho/nhan-hang').send({ loMuaId, khoId: ids.kho1, khuId, ngayNhan: '2026-11-20', khoiLuongKg: kg, soBao: Math.round(kg / 60) }).expect(201);
    return r.body.stockLotId as string;
  }
  const commodity = async (name: string, sector: string) =>
    (await tp.post('/api/danh-muc/mat-hang').send({ code: `S${sector.slice(0, 3)}${Date.now() % 100000}${++n}`, name, sector }).expect(201)).body.id as string;
  const lenh = (over: Record<string, unknown>) => ({ khoId: ids.kho1, congDoan: 'sang_phan_loai', ngay: '2026-11-25', lyDoVuot: null, ghiChu: null, ...over });
  const vao = (loTonId: string, khoiLuongKg: number) => ({ loTonId, khoiLuongKg });
  const ra = (khoiLuongKg: number, hang: string | null, khuId = ids.khuB, loai = 'thanh_pham') => ({ loai, hang, khoiLuongKg, soBao: null, khuId });
  const lo = async (id: string) => (await tk1.get(`/api/kho/lo-ton/${id}`).expect(200)).body;

  beforeAll(async () => {
    app = await startApp();
    pool = app.get<Pool>(PG_POOL);
    nv = (await fullFirstLogin(app, await createUser(app, ['NHAN_VIEN_KD'], 'scnv'))).agent;
    tp = (await fullFirstLogin(app, await createUser(app, ['TRUONG_PHONG_KD'], 'sctp'))).agent;
    gd = (await fullFirstLogin(app, await createUser(app, ['GIAM_DOC'], 'scgd'))).agent;
    const u1 = await createUser(app, ['THU_KHO'], 'sctk1');
    tk1 = (await fullFirstLogin(app, u1)).agent;
    tk2 = (await fullFirstLogin(app, await createUser(app, ['THU_KHO'], 'sctk2'))).agent;
    const ncc1 = await partner();
    const ncc2 = await partner();
    ids.cafe = await commodity('Cà phê Robusta nhân xô', 'ca_phe');
    ids.tom = await commodity('Tôm thẻ nguyên con', 'thuy_san');
    ids.kho1 = (await tp.post('/api/danh-muc/co-so').send({ name: 'Xưởng sơ chế Buôn Ma Thuột', kind: 'xuong_so_che', ownership: 'tu_van_hanh' }).expect(201)).body.id;
    ids.khuA = (await tp.post(`/api/kho/${ids.kho1}/khu`).send({ ma: 'A', ten: 'Khu A – đủ EUDR', loai: 'du_eudr' }).expect(201)).body.id;
    ids.khuB = (await tp.post(`/api/kho/${ids.kho1}/khu`).send({ ma: 'B', ten: 'Khu B – hàng thường', loai: 'thuong' }).expect(201)).body.id;
    ids.khuL = (await tp.post(`/api/kho/${ids.kho1}/khu`).send({ ma: 'L', ten: 'Kho lạnh', loai: 'kho_lanh' }).expect(201)).body.id;
    await tp.post(`/api/kho/${ids.kho1}/thu-kho`).send({ nguoiDungId: u1.id }).expect(200);

    ids.lmA = await lot(ncc1, ids.cafe, 'mua');
    ids.lmB = await lot(ncc2, ids.cafe, 'mua');
    ids.lmDu = await lot(ncc1, ids.cafe, 'mua');
    ids.lmG1 = await lot(ncc1, ids.cafe, 'moi_gioi');
    ids.lmG2 = await lot(ncc2, ids.cafe, 'moi_gioi');
    ids.lmTom = await lot(ncc1, ids.tom, 'mua');
    ids.ltA = await nhan(ids.lmA, ids.khuB, 6000);
    ids.ltB = await nhan(ids.lmB, ids.khuB, 4000);
    await thuGomDuEudr(app, ncc1, ids.lmDu, 3000);
    ids.ltDu = await nhan(ids.lmDu, ids.khuA, 3000, false);
    ids.ltG1 = await nhan(ids.lmG1, ids.khuB, 1000);
    ids.ltG1b = await nhan(ids.lmG1, ids.khuB, 500, false);
    ids.ltG2 = await nhan(ids.lmG2, ids.khuB, 1000);
    ids.ltTom = await nhan(ids.lmTom, ids.khuL, 1000);
  });
  afterAll(async () => {
    await app.close();
  });

  it('chỉ Giám đốc, Phó Giám đốc đặt định mức hao hụt', async () => {
    await tk1.post('/api/kho/dinh-muc').send({ nganh: 'ca_phe', congDoan: 'sang_phan_loai', phanTram: 3 }).expect(403);
    await tp.post('/api/kho/dinh-muc').send({ nganh: 'ca_phe', congDoan: 'sang_phan_loai', phanTram: 3 }).expect(403);
    await gd.post('/api/kho/dinh-muc').send({ nganh: 'ca_phe', congDoan: 'cap_dong', phanTram: 3 }).expect(400);
    await gd.post('/api/kho/dinh-muc').send({ nganh: 'ca_phe', congDoan: 'sang_phan_loai', phanTram: 3 }).expect(200);
    await gd.post('/api/kho/dinh-muc').send({ nganh: 'ca_phe', congDoan: 'dong_bao', phanTram: 0.5 }).expect(200);
    const ds = await tk1.get('/api/kho/dinh-muc').expect(200);
    expect(ds.body.quyen.dat).toBe(false);
    expect(ds.body.dinhMuc.find((x: { sector: string; step: string }) => x.sector === 'ca_phe' && x.step === 'sang_phan_loai')).toMatchObject({ maxLossPct: 3, label: 'Sàng phân loại' });
    expect(ds.body.dinhMuc.find((x: { sector: string; step: string }) => x.sector === 'ca_phe' && x.step === 'say')).toMatchObject({ maxLossPct: null });
    expect((await gd.get('/api/kho/dinh-muc').expect(200)).body.quyen.dat).toBe(true);
  });

  it('chặn trộn sai (KS-1): khác nhãn EUDR, mua đứt với môi giới, môi giới khác nhà cung cấp; chỉ thủ kho được giao ghi lệnh', async () => {
    const out = [ra(1900, 'S18')];
    await tk2.post('/api/kho/so-che').send(lenh({ dauVao: [vao(ids.ltA, 1000)], dauRa: [ra(980, 'S18')] })).expect(403);
    await nv.post('/api/kho/so-che').send(lenh({ dauVao: [vao(ids.ltA, 1000)], dauRa: [ra(980, 'S18')] })).expect(403);
    const eudr = await tk1.post('/api/kho/so-che').send(lenh({ dauVao: [vao(ids.ltA, 1000), vao(ids.ltDu, 1000)], dauRa: out })).expect(400);
    expect(eudr.body.message).toMatch(/Không trộn cà phê đủ EUDR/);
    const loai = await tk1.post('/api/kho/so-che').send(lenh({ dauVao: [vao(ids.ltA, 1000), vao(ids.ltG1, 1000)], dauRa: out })).expect(400);
    expect(loai.body.message).toMatch(/mua đứt với hàng môi giới/);
    const ncc = await tk1.post('/api/kho/so-che').send(lenh({ dauVao: [vao(ids.ltG1, 1000), vao(ids.ltG2, 1000)], dauRa: out })).expect(400);
    expect(ncc.body.message).toMatch(/cùng một nhà cung cấp/);
    const qua = await tk1.post('/api/kho/so-che').send(lenh({ dauVao: [vao(ids.ltA, 7000)], dauRa: out })).expect(400);
    expect(qua.body.message).toMatch(/chỉ còn 6\.000 kg/);
    // Cà phê không đủ EUDR không ra khu đủ EUDR; đầu ra không nhiều hơn đầu vào
    const khu = await tk1.post('/api/kho/so-che').send(lenh({ dauVao: [vao(ids.ltA, 1000)], dauRa: [ra(980, 'S18', ids.khuA)] })).expect(400);
    expect(khu.body.message).toMatch(/chỉ nhận cà phê đủ EUDR/);
    const du = await tk1.post('/api/kho/so-che').send(lenh({ dauVao: [vao(ids.ltA, 1000)], dauRa: [ra(1010, 'S18')] })).expect(400);
    expect(du.body.message).toMatch(/nhiều hơn đầu vào/);
    await tk1.post('/api/kho/so-che').send(lenh({ dauVao: [vao(ids.ltA, 1000)], dauRa: [ra(980, null, ids.khuB, 'phu_pham')] })).expect(400);
    await tk1.post('/api/kho/so-che').send(lenh({ congDoan: 'cap_dong', dauVao: [vao(ids.ltA, 1000)], dauRa: [ra(980, 'S18')] })).expect(400);
    // Không có gì bị trừ
    expect((await lo(ids.ltA)).remainingKg).toBe(6000);
  });

  it('trộn hai lô mua đứt khác nhà cung cấp, tách theo hạng: nguồn gốc theo tỷ lệ khối lượng (KS-2)', async () => {
    const r = await tk1
      .post('/api/kho/so-che')
      .send(lenh({ dauVao: [vao(ids.ltA, 3000), vao(ids.ltB, 2000)], dauRa: [ra(3000, 'S18'), ra(1700, 'S16'), ra(200, null, ids.khuB, 'phu_pham')], ghiChu: 'Sàng 18 và 16' }))
      .expect(201);
    expect(r.body).toMatchObject({ code: expect.stringMatching(/^LSC-2026-\d{4}$/), status: 'xong', inputKg: 5000, outputKg: 4700, byproductKg: 200, lossKg: 100, lossPct: 2, normPct: 3 });
    expect(r.body.outputCodes).toHaveLength(3);
    ids.lenh1 = r.body.id;
    expect((await lo(ids.ltA)).remainingKg).toBe(3000);
    expect((await lo(ids.ltB)).remainingKg).toBe(2000);
    const ds = (await tk1.get(`/api/kho/so-che?khoId=${ids.kho1}`).expect(200)).body.lenh;
    const l = ds.find((x: { id: string }) => x.id === ids.lenh1);
    expect(l.dauVao.map((x: { quantityKg: number }) => x.quantityKg).sort()).toEqual([2000, 3000]);
    expect(l.dauRa.map((x: { grade: string | null; kind: string }) => [x.kind, x.grade])).toEqual([
      ['thanh_pham', 'S18'],
      ['thanh_pham', 'S16'],
      ['phu_pham', null],
    ]);
    ids.s18 = l.dauRa[0].id;
    ids.phu = l.dauRa[2].id;
    const s18 = await lo(ids.s18);
    expect(s18).toMatchObject({ source: 'so_che', status: 'san_sang', kind: 'thanh_pham', grade: 'S18', remainingKg: 3000, dealType: 'mua_dut', eudrClass: 'khong_du' });
    const share = Object.fromEntries(s18.nguonGoc.map((o: { purchaseLotId: string; share: number }) => [o.purchaseLotId, o.share]));
    expect(share).toEqual({ [ids.lmA]: 0.6, [ids.lmB]: 0.4 });
    expect(s18.soKho.map((m: { kind: string; quantityKg: number }) => [m.kind, m.quantityKg])).toEqual([['so_che_ra', 3000]]);
    expect((await lo(ids.ltA)).soKho.map((m: { kind: string }) => m.kind)).toEqual(['nhan_hang', 'so_che_vao']);
    // Bảng tồn tách theo loại và hạng
    const t = (await tk1.get(`/api/kho/ton?khoId=${ids.kho1}`).expect(200)).body.ton.filter((x: { zoneId: string; dealType: string }) => x.zoneId === ids.khuB && x.dealType === 'mua_dut');
    expect(t.map((x: { kind: string; grade: string | null; kg: number }) => [x.kind, x.grade, x.kg]).sort()).toEqual(
      [
        ['nguyen_lieu', null, 5000],
        ['phu_pham', null, 200],
        ['thanh_pham', 'S16', 1700],
        ['thanh_pham', 'S18', 3000],
      ].sort(),
    );
    // Phụ phẩm không vào sơ chế hàng xuất khẩu (KS-8)
    const p = await tk1.post('/api/kho/so-che').send(lenh({ dauVao: [vao(ids.phu, 100)], dauRa: [ra(99, 'X')] })).expect(400);
    expect(p.body.message).toMatch(/Phụ phẩm/);
  });

  it('môi giới: trộn các lô của cùng một nhà cung cấp được', async () => {
    const r = await tk1.post('/api/kho/so-che').send(lenh({ dauVao: [vao(ids.ltG1, 1000), vao(ids.ltG1b, 500)], dauRa: [ra(1470, 'S18')] })).expect(201);
    expect(r.body).toMatchObject({ status: 'xong', lossPct: 2 });
  });

  it('hao hụt vượt định mức: phải ghi lý do, đầu ra chờ duyệt, Giám đốc từ chối thì hàng trở về (KS-3)', async () => {
    const thieu = await tk1.post('/api/kho/so-che').send(lenh({ dauVao: [vao(ids.ltA, 1000)], dauRa: [ra(900, 'S18')] })).expect(400);
    expect(thieu.body.message).toMatch(/Hao hụt 10% vượt định mức 3%/);
    const r = await tk1.post('/api/kho/so-che').send(lenh({ dauVao: [vao(ids.ltA, 1000)], dauRa: [ra(900, 'S18')], lyDoVuot: 'Hàng ẩm, nhiều tạp chất' })).expect(201);
    expect(r.body).toMatchObject({ status: 'cho_duyet', lossPct: 10 });
    ids.lenh2 = r.body.id;
    expect((await lo(ids.ltA)).remainingKg).toBe(2000);
    const cho = (await gd.get('/api/kho/so-che?trangThai=cho_duyet').expect(200)).body.lenh.find((x: { id: string }) => x.id === ids.lenh2);
    expect(cho).toMatchObject({ overReason: 'Hàng ẩm, nhiều tạp chất', quyen: { duyet: true } });
    const out = cho.dauRa[0].id as string;
    const d = await lo(out);
    expect(d).toMatchObject({ status: 'cho_duyet', quyen: { chuyenKhu: false } });
    // Lô chờ duyệt chưa dùng được: không chuyển khu, không đưa vào lệnh khác
    const mv = await tk1.post(`/api/kho/lo-ton/${out}/chuyen-khu`).send({ khuId: ids.khuL }).expect(400);
    expect(mv.body.message).toMatch(/chờ Giám đốc duyệt/);
    const dung = await tk1.post('/api/kho/so-che').send(lenh({ congDoan: 'dong_bao', dauVao: [vao(out, 100)], dauRa: [ra(100, 'S18')] })).expect(400);
    expect(dung.body.message).toMatch(/chờ duyệt/);
    // Bảng tồn tách riêng hàng chờ duyệt
    const t = (await tk1.get(`/api/kho/ton?khoId=${ids.kho1}`).expect(200)).body.ton;
    expect(t.find((x: { status: string }) => x.status === 'cho_duyet')).toMatchObject({ kg: 900 });
    expect((await tk1.get('/api/kho/so-che?trangThai=cho_duyet').expect(200)).body.lenh[0].quyen.duyet).toBe(false);
    await tk1.post(`/api/kho/so-che/${ids.lenh2}/duyet`).send({ dongY: true }).expect(403);
    await gd.post(`/api/kho/so-che/${ids.lenh2}/duyet`).send({ dongY: false }).expect(400);
    await gd.post(`/api/kho/so-che/${ids.lenh2}/duyet`).send({ dongY: false, ghiChu: 'Sàng lại, kiểm tra cân' }).expect(200);
    await gd.post(`/api/kho/so-che/${ids.lenh2}/duyet`).send({ dongY: true }).expect(400);
    const a = await lo(ids.ltA);
    expect(a.remainingKg).toBe(3000);
    expect(a.soKho.map((m: { kind: string }) => m.kind)).toEqual(['nhan_hang', 'so_che_vao', 'so_che_vao', 'tra_lai_so_che']);
    expect(await lo(out)).toMatchObject({ status: 'huy', remainingKg: 0 });
    const log = await pool.query(`select count(*)::int as n from audit_log where action = 'so_che.tu_choi' and entity_id = $1`, [ids.lenh2]);
    expect(log.rows[0].n).toBe(1);
  });

  it('Giám đốc duyệt thì đầu ra dùng được; công đoạn chưa có định mức luôn phải trình duyệt', async () => {
    const chua = await tk1.post('/api/kho/so-che').send(lenh({ congDoan: 'say', dauVao: [vao(ids.ltA, 1000)], dauRa: [ra(990, null)] })).expect(400);
    expect(chua.body.message).toMatch(/Sấy chưa có định mức/);
    const r = await tk1.post('/api/kho/so-che').send(lenh({ congDoan: 'say', dauVao: [vao(ids.ltA, 1000)], dauRa: [ra(880, null)], lyDoVuot: 'Sấy từ độ ẩm 18% xuống 12,5%' })).expect(201);
    expect(r.body).toMatchObject({ status: 'cho_duyet', normPct: null, lossPct: 12 });
    await gd.post(`/api/kho/so-che/${r.body.id}/duyet`).send({ dongY: true, ghiChu: null }).expect(200);
    const l = (await gd.get(`/api/kho/so-che?khoId=${ids.kho1}`).expect(200)).body.lenh.find((x: { id: string }) => x.id === r.body.id);
    expect(l).toMatchObject({ status: 'xong', quyen: { duyet: false } });
    expect(l.dauRa[0].status).toBe('san_sang');
  });

  it('thủy sản mạ băng: đầu ra nặng hơn đầu vào, không xét định mức', async () => {
    const sai = await tk1.post('/api/kho/so-che').send(lenh({ congDoan: 'ma_bang', dauVao: [vao(ids.ltTom, 100)], dauRa: [ra(100, '31/40')] })).expect(400);
    expect(sai.body.message).toMatch(/kho lạnh/);
    const r = await tk1.post('/api/kho/so-che').send(lenh({ congDoan: 'ma_bang', dauVao: [vao(ids.ltTom, 1000)], dauRa: [ra(1100, '31/40', ids.khuL)] })).expect(201);
    expect(r.body).toMatchObject({ status: 'xong', lossKg: -100, lossPct: -10 });
  });

  it('truy xuất lần qua hai lệnh sơ chế và một lần tách lô về phiếu nhận hàng, lô mua', async () => {
    // Tách 1.000 kg S18 sang kho lạnh không được (cà phê); tách sang khu B khác không có, nên dùng một khu thường mới
    const khuC = (await tp.post(`/api/kho/${ids.kho1}/khu`).send({ ma: 'C', ten: 'Khu C – thành phẩm', loai: 'thuong' }).expect(201)).body.id;
    const t = await tk1.post(`/api/kho/lo-ton/${ids.s18}/chuyen-khu`).send({ khuId: khuC, khoiLuongKg: 1000 }).expect(201);
    const r = await tk1.post('/api/kho/so-che').send(lenh({ congDoan: 'dong_bao', dauVao: [vao(t.body.id, 1000)], dauRa: [{ ...ra(998, 'S18', khuC), soBao: 16 }] })).expect(201);
    expect(r.body.status).toBe('xong');
    const ds = (await tk1.get(`/api/kho/so-che?khoId=${ids.kho1}`).expect(200)).body.lenh;
    const dongBao = ds.find((x: { id: string }) => x.id === r.body.id).dauRa[0].id as string;
    const nguon = await lo(dongBao);
    expect(Object.fromEntries(nguon.nguonGoc.map((o: { purchaseLotId: string; share: number }) => [o.purchaseLotId, o.share]))).toEqual({ [ids.lmA]: 0.6, [ids.lmB]: 0.4 });
    const tx = (await nv.get(`/api/kho/lo-ton/${dongBao}/truy-xuat`).expect(200)).body.buoc;
    expect(tx.map((b: { kind: string; label: string; level: number }) => [b.level, b.kind, b.label])).toEqual([
      [0, 'so_che', 'Đóng bao'],
      [1, 'tach_lo', 'Tách lô'],
      [2, 'so_che', 'Sàng phân loại'],
      [3, 'nhan_hang', 'Nhận hàng'],
      [3, 'nhan_hang', 'Nhận hàng'],
    ]);
    expect(tx[2].detail).toMatch(/vào 5\.000 kg, ra 4\.700 kg \+ phụ phẩm 200 kg, hao hụt 2%/);
  });
});

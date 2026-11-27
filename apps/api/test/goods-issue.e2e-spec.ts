import { INestApplication } from '@nestjs/common';
import { Pool } from 'pg';
import { PG_POOL } from '../src/db/db';
import { codeFor, createUser, fullFirstLogin, startApp, thuGomDuEudr } from './helpers';

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
  tyLePhiPhanTram: null,
  ghiChu: null,
  ...over,
});

describe('Kho: phiếu xuất kho cho lô xuất, quy về lô mua (KS-5)', () => {
  let app: INestApplication;
  let pool: Pool;
  let nv: Agent;
  let tp: Agent;
  let gd: Agent;
  let tk1: Agent;
  let tk2: Agent;
  let n = 0;
  const ids: Record<string, string> = {};

  async function partner(roles: string[]) {
    const res = await nv.post('/api/doi-tac').send({ code: `XK${Date.now() % 100000}${++n}`, name: `Đối tác xuất kho ${n}`, country: 'VN', category: 'doanh_nghiep_thuong_mai', roles }).expect(201);
    const id = res.body.id as string;
    await nv.post(`/api/doi-tac/${id}/tai-lieu`).send({ docType: 'Giấy đăng ký kinh doanh', number: `DKX${n}` }).expect(201);
    await nv.post(`/api/doi-tac/${id}/trinh-tham-dinh`).send({ riskRating: 'thap', screeningNote: 'Không có trong danh sách trừng phạt' }).expect(200);
    await tp.post(`/api/doi-tac/${id}/quyet-dinh-tham-dinh`).send({ dongY: true }).expect(200);
    return id;
  }
  async function signed(body: Record<string, unknown>) {
    const c = await nv.post('/api/hop-dong').send({ matHangId: ids.cafe, ...body }).expect(201);
    await nv.post(`/api/hop-dong/${c.body.id}/trinh-ky`).expect(200);
    const g = await fullFirstLogin(app, await createUser(app, ['GIAM_DOC'], 'gdxk'));
    await g.agent.post(`/api/hop-dong/${c.body.id}/ky`).send({ ma2Lop: codeFor(g.secret, 1) }).expect(200);
    return c.body.id as string;
  }
  const lot = async (supplier: string, loai: 'mua' | 'moi_gioi') =>
    (await nv.post('/api/lo-mua').send({ hopDongId: await signed({ loai, benBanId: supplier, dieuKhoan: terms(20, { tyLePhiPhanTram: 1.5 }) }) }).expect(201)).body.id as string;
  async function nhan(loMuaId: string, khuId: string, kg: number, thuGom = true) {
    if (thuGom) await nv.post(`/api/lo-mua/${loMuaId}/su-kien`).send({ loai: 'thu_gom', khoiLuongKg: kg }).expect(200);
    return (await tk1.post('/api/kho/nhan-hang').send({ loMuaId, khoId: ids.kho, khuId, ngayNhan: '2026-11-20', khoiLuongKg: kg }).expect(201)).body.stockLotId as string;
  }
  const phieu = (over: Record<string, unknown>) => ({ khoId: ids.kho, loXuatId: ids.lxUS, ngayXuat: '2026-11-26', bienSoXe: '51C-888.12', soContainer: 'TGHU1234567', ghiChu: null, ...over });
  const dong = (loTonId: string, khoiLuongKg: number) => ({ loTonId, khoiLuongKg });
  const lo = async (id: string) => (await tk1.get(`/api/kho/lo-ton/${id}`).expect(200)).body;
  const lx = async (id: string) => (await tp.get(`/api/lo-xuat/${id}`).expect(200)).body;

  beforeAll(async () => {
    app = await startApp();
    pool = app.get<Pool>(PG_POOL);
    nv = (await fullFirstLogin(app, await createUser(app, ['NHAN_VIEN_KD'], 'xknv'))).agent;
    tp = (await fullFirstLogin(app, await createUser(app, ['TRUONG_PHONG_KD'], 'xktp'))).agent;
    gd = (await fullFirstLogin(app, await createUser(app, ['GIAM_DOC'], 'xkgd'))).agent;
    const u1 = await createUser(app, ['THU_KHO'], 'xktk1');
    tk1 = (await fullFirstLogin(app, u1)).agent;
    tk2 = (await fullFirstLogin(app, await createUser(app, ['THU_KHO'], 'xktk2'))).agent;
    ids.cafe = (await tp.post('/api/danh-muc/mat-hang').send({ code: `XKC${Date.now() % 100000}`, name: 'Cà phê Robusta S18', sector: 'ca_phe' }).expect(201)).body.id;
    const ncc1 = await partner(['nha_cung_cap']);
    const ncc2 = await partner(['nha_cung_cap']);
    const buyer = await partner(['nguoi_mua']);
    ids.kho = (await tp.post('/api/danh-muc/co-so').send({ name: 'Kho Cát Lái xuất', kind: 'kho', ownership: 'tu_van_hanh' }).expect(201)).body.id;
    ids.khuA = (await tp.post(`/api/kho/${ids.kho}/khu`).send({ ma: 'A', ten: 'Khu đủ EUDR', loai: 'du_eudr' }).expect(201)).body.id;
    ids.khuB = (await tp.post(`/api/kho/${ids.kho}/khu`).send({ ma: 'B', ten: 'Khu thường', loai: 'thuong' }).expect(201)).body.id;
    await tp.post(`/api/kho/${ids.kho}/thu-kho`).send({ nguoiDungId: u1.id }).expect(200);
    await gd.post('/api/kho/dinh-muc').send({ nganh: 'ca_phe', congDoan: 'sang_phan_loai', phanTram: 3 }).expect(200);

    ids.lmA = await lot(ncc1, 'mua');
    ids.lmB = await lot(ncc2, 'mua');
    ids.lmDu = await lot(ncc1, 'mua');
    ids.lmG = await lot(ncc1, 'moi_gioi');
    ids.ltA = await nhan(ids.lmA, ids.khuB, 6000);
    ids.ltB = await nhan(ids.lmB, ids.khuB, 4000);
    await thuGomDuEudr(app, ncc1, ids.lmDu, 3000);
    ids.ltDu = await nhan(ids.lmDu, ids.khuA, 3000, false);
    ids.ltG = await nhan(ids.lmG, ids.khuB, 1000);
    // Trộn 3.000 kg lô A với 2.000 kg lô B: S18 4.900 kg mang 60% A, 40% B; phụ phẩm 50 kg
    const so = await tk1
      .post('/api/kho/so-che')
      .send({ khoId: ids.kho, congDoan: 'sang_phan_loai', ngay: '2026-11-25', dauVao: [dong(ids.ltA, 3000), dong(ids.ltB, 2000)].map((d) => ({ loTonId: d.loTonId, khoiLuongKg: d.khoiLuongKg })), dauRa: [{ loai: 'thanh_pham', hang: 'S18', khoiLuongKg: 4850, soBao: null, khuId: ids.khuB }, { loai: 'phu_pham', hang: null, khoiLuongKg: 50, soBao: null, khuId: ids.khuB }] })
      .expect(201);
    const l = (await tk1.get('/api/kho/so-che').expect(200)).body.lenh.find((x: { id: string }) => x.id === so.body.id);
    ids.s18 = l.dauRa.find((x: { kind: string }) => x.kind === 'thanh_pham').id;
    ids.phu = l.dauRa.find((x: { kind: string }) => x.kind === 'phu_pham').id;

    ids.banUS = await signed({ loai: 'ban', benMuaId: buyer, dieuKhoan: terms(8) });
    ids.banEU = await signed({ loai: 'ban', benMuaId: buyer, dieuKhoan: terms(2, { dungSaiPhanTram: 0 }) });
    ids.lxUS = (await nv.post('/api/lo-xuat').send({ hopDongDoiUngId: ids.banUS, thiTruong: 'US' }).expect(201)).body.id;
    ids.lxEU = (await nv.post('/api/lo-xuat').send({ hopDongDoiUngId: ids.banEU, thiTruong: 'EU' }).expect(201)).body.id;
  });
  afterAll(async () => {
    await app.close();
  });

  it('thủ kho thấy các lô xuất đang đóng gói, khối lượng hợp đồng và đã phân bổ', async () => {
    const ds = (await tk1.get('/api/kho/xuat-kho/lo-xuat').expect(200)).body.loXuat;
    expect(ds.find((x: { id: string }) => x.id === ids.lxUS)).toMatchObject({ market: 'US', dealType: 'mua_dut', contractKg: 8000, tolerancePct: 5, allocatedKg: 0 });
  });

  it('chặn xuất sai: kho chưa giao, phụ phẩm, khác loại giao dịch, cà phê không đủ EUDR đi EU, vượt hợp đồng', async () => {
    await tk2.post('/api/kho/xuat-kho').send(phieu({ dong: [dong(ids.s18, 1000)] })).expect(403);
    await nv.post('/api/kho/xuat-kho').send(phieu({ dong: [dong(ids.s18, 1000)] })).expect(403);
    const pp = await tk1.post('/api/kho/xuat-kho').send(phieu({ dong: [dong(ids.phu, 50)] })).expect(400);
    expect(pp.body.message).toMatch(/phụ phẩm, không xuất khẩu/);
    const mg = await tk1.post('/api/kho/xuat-kho').send(phieu({ dong: [dong(ids.ltG, 500)] })).expect(400);
    expect(mg.body.message).toMatch(/khác loại giao dịch/);
    const eu = await tk1.post('/api/kho/xuat-kho').send(phieu({ loXuatId: ids.lxEU, dong: [dong(ids.s18, 1000)] })).expect(400);
    expect(eu.body.message).toMatch(/không đủ EUDR/);
    const qua = await tk1.post('/api/kho/xuat-kho').send(phieu({ dong: [dong(ids.s18, 4850), dong(ids.ltA, 3000), dong(ids.ltB, 1000)] })).expect(400);
    expect(qua.body.message).toMatch(/tối đa 8\.400 kg/);
    const het = await tk1.post('/api/kho/xuat-kho').send(phieu({ dong: [dong(ids.ltB, 2500)] })).expect(400);
    expect(het.body.message).toMatch(/chỉ còn 2\.000 kg/);
    expect((await lo(ids.s18)).remainingKg).toBe(4850);
  });

  it('xuất từ lô tồn đã trộn: phần mềm quy về lô mua theo tỷ lệ, chờ Trưởng phòng KD duyệt như phân bổ thường', async () => {
    const r = await tk1.post('/api/kho/xuat-kho').send(phieu({ dong: [dong(ids.s18, 4850), dong(ids.ltA, 3000)] })).expect(201);
    expect(r.body.code).toMatch(/^PXK-2026-\d{4}$/);
    expect(r.body.quantityKg).toBe(7850);
    // A: 4.850 × 60% + 3.000 = 5.910; B: 4.850 × 40% = 1.940
    expect(Object.fromEntries(r.body.loMua.map((x: { purchaseLotId: string; quantityKg: number }) => [x.purchaseLotId, x.quantityKg]))).toEqual({ [ids.lmA]: 5910, [ids.lmB]: 1940 });
    ids.px1 = r.body.id;
    expect((await lo(ids.s18)).remainingKg).toBe(0);
    expect((await lo(ids.ltA)).soKho.map((m: { kind: string }) => m.kind)).toEqual(['nhan_hang', 'so_che_vao', 'xuat_kho']);
    const x = await lx(ids.lxUS);
    expect(x.allocatedKg).toBe(7850);
    expect(x.phanBo.map((p: { lotCode: string; quantityKg: number; phieuXuatKho: string }) => [p.quantityKg, p.phieuXuatKho])).toEqual([
      [5910, r.body.code],
      [1940, r.body.code],
    ]);
    // Lô mua đã vào kho thì không phân bổ thẳng nữa; dòng từ phiếu xuất không huỷ lẻ được
    const thang = await nv.post(`/api/lo-xuat/${ids.lxUS}/phan-bo`).send({ loMuaId: ids.lmB, khoiLuongKg: 100 }).expect(400);
    expect(thang.body.message).toMatch(/phiếu xuất kho từ lô tồn/);
    const le = await nv.post(`/api/phan-bo/${x.phanBo[0].id}/huy`).send({ lyDo: 'Thử huỷ lẻ' }).expect(400);
    expect(le.body.message).toMatch(/huỷ phiếu xuất kho/);
    for (const p of x.phanBo) expect(p.coTheDuyet).toBe(true);
    await tp.post(`/api/phan-bo/${x.phanBo[1].id}/duyet`).expect(200);
    const ds = (await nv.get(`/api/kho/xuat-kho?loXuatId=${ids.lxUS}`).expect(200)).body.phieu;
    expect(ds[0]).toMatchObject({ code: r.body.code, quantityKg: 7850, containerNo: 'TGHU1234567', quyen: { huy: false } });
    expect(ds[0].loMua.find((m: { purchaseLotId: string }) => m.purchaseLotId === ids.lmB)).toMatchObject({ approved: true });
  });

  it('huỷ phiếu xuất kho: hàng trở về lô tồn, dòng phân bổ bị huỷ', async () => {
    await tk2.post(`/api/kho/xuat-kho/${ids.px1}/huy`).send({ lyDo: 'Xuất nhầm container' }).expect(403);
    expect((await tk1.get(`/api/kho/xuat-kho?loXuatId=${ids.lxUS}`).expect(200)).body.phieu[0].quyen.huy).toBe(true);
    await tk1.post(`/api/kho/xuat-kho/${ids.px1}/huy`).send({ lyDo: 'Xuất nhầm container' }).expect(200);
    await tk1.post(`/api/kho/xuat-kho/${ids.px1}/huy`).send({ lyDo: 'Xuất nhầm container' }).expect(400);
    expect((await lo(ids.s18)).remainingKg).toBe(4850);
    expect((await lo(ids.ltA)).remainingKg).toBe(3000);
    const x = await lx(ids.lxUS);
    expect(x.allocatedKg).toBe(0);
    expect(x.phanBo.every((p: { cancelledAt: string | null; cancelReason: string }) => p.cancelledAt && /Huỷ phiếu xuất kho/.test(p.cancelReason))).toBe(true);
    const log = await pool.query(`select count(*)::int as n from audit_log where action = 'kho.huy_xuat_kho' and entity_id = $1`, [ids.px1]);
    expect(log.rows[0].n).toBe(1);
  });

  it('huỷ lô xuất thì phiếu xuất kho còn hiệu lực bị huỷ theo, hàng về kho', async () => {
    const r = await tk1.post('/api/kho/xuat-kho').send(phieu({ dong: [dong(ids.s18, 2000)] })).expect(201);
    expect((await lo(ids.s18)).remainingKg).toBe(2850);
    await nv.post(`/api/lo-xuat/${ids.lxUS}/huy`).send({ lyDo: 'Người mua đổi lịch giao' }).expect(200);
    expect((await lo(ids.s18)).remainingKg).toBe(4850);
    const g = (await tk1.get(`/api/kho/xuat-kho?loXuatId=${ids.lxUS}`).expect(200)).body.phieu.find((x: { id: string }) => x.id === r.body.id);
    expect(g.voidReason).toMatch(/Huỷ lô xuất/);
    expect((await tk1.get('/api/kho/xuat-kho/lo-xuat').expect(200)).body.loXuat.some((x: { id: string }) => x.id === ids.lxUS)).toBe(false);
  });

  it('cà phê đủ EUDR từ khu đủ EUDR xuất được đi EU', async () => {
    const r = await tk1.post('/api/kho/xuat-kho').send(phieu({ loXuatId: ids.lxEU, dong: [dong(ids.ltDu, 2000)] })).expect(201);
    expect(r.body.loMua).toEqual([{ purchaseLotId: ids.lmDu, quantityKg: 2000 }]);
    const x = await lx(ids.lxEU);
    expect(x.allocatedKg).toBe(2000);
    expect((await lo(ids.ltDu)).remainingKg).toBe(1000);
    // Truy xuất lô xuất ghi kho đã nhận hàng, không đòi bước "sơ chế, nhập kho" cũ trên lô mua
    const t = (await nv.get(`/api/lo-xuat/${ids.lxEU}/truy-xuat`).expect(200)).body;
    expect(t.coSo.map((c: { ten: string }) => c.ten)).toEqual(['Kho Cát Lái xuất']);
    expect(JSON.stringify(t)).not.toMatch(/chưa ghi xưởng sơ chế hay kho/);
  });
});

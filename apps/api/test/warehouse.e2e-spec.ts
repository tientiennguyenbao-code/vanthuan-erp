import { INestApplication } from '@nestjs/common';
import { Pool } from 'pg';
import { PG_POOL } from '../src/db/db';
import { codeFor, createUser, fullFirstLogin, startApp, thuGomDuEudr } from './helpers';

type Agent = Awaited<ReturnType<typeof fullFirstLogin>>['agent'];

const terms = (soLuong: number) => ({
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
});

describe('Kho: khu, thủ kho, nhận hàng, tồn kho, chuyển khu', () => {
  let app: INestApplication;
  let pool: Pool;
  let nv: Agent;
  let tp: Agent;
  let tk1: Agent; // thủ kho được giao kho 1
  let tk2: Agent; // thủ kho chưa được giao
  let ktt: Agent;
  let n = 0;
  const ids: Record<string, string> = {};

  async function partner() {
    const res = await nv.post('/api/doi-tac').send({ code: `KH${Date.now() % 100000}${++n}`, name: `HTX kho ${n}`, country: 'VN', category: 'htx', roles: ['nha_cung_cap'] }).expect(201);
    const id = res.body.id as string;
    await nv.post(`/api/doi-tac/${id}/tai-lieu`).send({ docType: 'Giấy chứng nhận đăng ký HTX', number: `HTXK${n}` }).expect(201);
    await nv.post(`/api/doi-tac/${id}/trinh-tham-dinh`).send({ riskRating: 'thap', screeningNote: 'Không có trong danh sách trừng phạt' }).expect(200);
    await tp.post(`/api/doi-tac/${id}/quyet-dinh-tham-dinh`).send({ dongY: true }).expect(200);
    return id;
  }
  async function lot(supplier: string, mh: string) {
    const c = await nv.post('/api/hop-dong').send({ matHangId: mh, loai: 'moi_gioi', benBanId: supplier, dieuKhoan: terms(20) }).expect(201);
    await nv.post(`/api/hop-dong/${c.body.id}/trinh-ky`).expect(200);
    const g = await fullFirstLogin(app, await createUser(app, ['GIAM_DOC'], 'gdkho'));
    await g.agent.post(`/api/hop-dong/${c.body.id}/ky`).send({ ma2Lop: codeFor(g.secret, 1) }).expect(200);
    return (await nv.post('/api/lo-mua').send({ hopDongId: c.body.id }).expect(201)).body.id as string;
  }
  const commodity = async (name: string, sector: string) =>
    (await tp.post('/api/danh-muc/mat-hang').send({ code: `K${sector.slice(0, 3)}${Date.now() % 100000}${++n}`, name, sector }).expect(201)).body.id as string;
  const receipt = (over: Record<string, unknown>) => ({ khoId: ids.kho1, ngayNhan: '2026-11-20', bienSoXe: '47C-123.45', soPhieuCan: 'PC-01', soBao: 100, doAmPhanTram: 13, ...over });

  beforeAll(async () => {
    app = await startApp();
    pool = app.get<Pool>(PG_POOL);
    nv = (await fullFirstLogin(app, await createUser(app, ['NHAN_VIEN_KD'], 'khonv'))).agent;
    tp = (await fullFirstLogin(app, await createUser(app, ['TRUONG_PHONG_KD'], 'khotp'))).agent;
    ktt = (await fullFirstLogin(app, await createUser(app, ['KE_TOAN_TRUONG'], 'khoktt'))).agent;
    const u1 = await createUser(app, ['THU_KHO'], 'thukho1');
    ids.tk1 = u1.id;
    tk1 = (await fullFirstLogin(app, u1)).agent;
    tk2 = (await fullFirstLogin(app, await createUser(app, ['THU_KHO'], 'thukho2'))).agent;
    ids.nvUser = (await createUser(app, ['NHAN_VIEN_KD'], 'khonv2')).id;
    const ncc = await partner();
    ids.cafe = await commodity('Cà phê Robusta nhân xô', 'ca_phe');
    ids.tom = await commodity('Tôm thẻ nguyên con', 'thuy_san');
    ids.lmDu = await lot(ncc, ids.cafe);
    ids.lmKhong = await lot(ncc, ids.cafe);
    ids.lmTom = await lot(ncc, ids.tom);
    await thuGomDuEudr(app, ncc, ids.lmDu, 6000);
    await nv.post(`/api/lo-mua/${ids.lmKhong}/su-kien`).send({ loai: 'thu_gom', khoiLuongKg: 9000 }).expect(200);
    await nv.post(`/api/lo-mua/${ids.lmTom}/su-kien`).send({ loai: 'thu_gom', khoiLuongKg: 2000 }).expect(200);
    ids.kho1 = (await tp.post('/api/danh-muc/co-so').send({ name: 'Kho Cát Lái (tự vận hành)', kind: 'kho', ownership: 'tu_van_hanh', capacityKg: 500000 }).expect(201)).body.id;
  });
  afterAll(async () => {
    await app.close();
  });

  it('Trưởng phòng KD khai khu và giao thủ kho; nhân viên KD không làm được', async () => {
    await nv.post(`/api/kho/${ids.kho1}/khu`).send({ ma: 'A', ten: 'Khu A', loai: 'du_eudr' }).expect(403);
    ids.khuA = (await tp.post(`/api/kho/${ids.kho1}/khu`).send({ ma: 'a', ten: 'Khu A – cà phê đủ EUDR', loai: 'du_eudr', sucChuaKg: 10000 }).expect(201)).body.id;
    await tp.post(`/api/kho/${ids.kho1}/khu`).send({ ma: 'A', ten: 'Trùng mã', loai: 'thuong' }).expect(409);
    ids.khuB = (await tp.post(`/api/kho/${ids.kho1}/khu`).send({ ma: 'B', ten: 'Khu B – hàng thường', loai: 'thuong' }).expect(201)).body.id;
    ids.khuC = (await tp.post(`/api/kho/${ids.kho1}/khu`).send({ ma: 'C', ten: 'Khu C – hàng thường', loai: 'thuong' }).expect(201)).body.id;
    ids.khuL = (await tp.post(`/api/kho/${ids.kho1}/khu`).send({ ma: 'L', ten: 'Kho lạnh', loai: 'kho_lanh' }).expect(201)).body.id;
    // Chỉ giao kho cho tài khoản thủ kho
    await tp.post(`/api/kho/${ids.kho1}/thu-kho`).send({ nguoiDungId: ids.nvUser }).expect(400);
    await nv.post(`/api/kho/${ids.kho1}/thu-kho`).send({ nguoiDungId: ids.tk1 }).expect(403);
    await tp.post(`/api/kho/${ids.kho1}/thu-kho`).send({ nguoiDungId: ids.tk1 }).expect(200);
    const ds = await tp.get('/api/kho').expect(200);
    const k = ds.body.kho.find((x: { id: string }) => x.id === ids.kho1);
    expect(k.khu.map((z: { code: string }) => z.code)).toEqual(['A', 'B', 'C', 'L']);
    expect(k.thuKho.map((t: { id: string }) => t.id)).toEqual([ids.tk1]);
    expect(ds.body.ungVienThuKho.map((u: { id: string }) => u.id)).toContain(ids.tk1);
    const mine = (await tk1.get('/api/kho').expect(200)).body.kho.find((x: { id: string }) => x.id === ids.kho1);
    expect(mine.quyen).toEqual({ cauHinh: false, ghiPhieu: true });
    expect((await tk1.get('/api/kho').expect(200)).body.ungVienThuKho).toEqual([]);
  });

  it('chỉ thủ kho được giao mới ghi phiếu nhận hàng', async () => {
    await tk2.post('/api/kho/nhan-hang').send(receipt({ loMuaId: ids.lmKhong, khuId: ids.khuB, khoiLuongKg: 100 })).expect(403);
    await nv.post('/api/kho/nhan-hang').send(receipt({ loMuaId: ids.lmKhong, khuId: ids.khuB, khoiLuongKg: 100 })).expect(403);
    await tk1.post('/api/kho/nhan-hang').send(receipt({ loMuaId: ids.lmKhong, khuId: ids.khuB, khoiLuongKg: 100, ngayNhan: '2099-01-01' })).expect(400);
  });

  it('cà phê đủ EUDR chỉ vào khu đủ EUDR; hàng không đủ không vào khu đó; không quá sức chứa', async () => {
    const sai = await tk1.post('/api/kho/nhan-hang').send(receipt({ loMuaId: ids.lmDu, khuId: ids.khuB, khoiLuongKg: 3000 })).expect(400);
    expect(sai.body.message).toMatch(/chỉ được vào khu đủ EUDR/);
    const tron = await tk1.post('/api/kho/nhan-hang').send(receipt({ loMuaId: ids.lmKhong, khuId: ids.khuA, khoiLuongKg: 3000 })).expect(400);
    expect(tron.body.message).toMatch(/chỉ nhận cà phê đủ EUDR/);
    const r1 = await tk1.post('/api/kho/nhan-hang').send(receipt({ loMuaId: ids.lmDu, khuId: ids.khuA, khoiLuongKg: 3000 })).expect(201);
    expect(r1.body.code).toMatch(/^PNH-2026-\d{4}$/);
    expect(r1.body.stockLotCode).toMatch(/^LT-2026-\d{5}$/);
    expect(r1.body.chenhLech.warning).toBeNull();
    ids.ltDu1 = r1.body.stockLotId;
    const r2 = await tk1.post('/api/kho/nhan-hang').send(receipt({ loMuaId: ids.lmDu, khuId: ids.khuA, khoiLuongKg: 3150, soPhieuCan: 'PC-02' })).expect(201);
    // Đã nhận 6.150 kg so với 6.000 kg thu gom: lệch 2,5%
    expect(r2.body.chenhLech).toMatchObject({ receivedKg: 6150, diffKg: 150, diffPct: 2.5 });
    expect(r2.body.chenhLech.warning).toMatch(/nhiều hơn thu gom 150 kg/);
    ids.ptDu2 = r2.body.id;
    const day = await tk1.post('/api/kho/nhan-hang').send(receipt({ loMuaId: ids.lmDu, khuId: ids.khuA, khoiLuongKg: 4000 })).expect(400);
    expect(day.body.message).toMatch(/chỉ còn chỗ cho 3\.850 kg/);
    const b = await tk1.post('/api/kho/nhan-hang').send(receipt({ loMuaId: ids.lmKhong, khuId: ids.khuB, khoiLuongKg: 8900, soBao: 148 })).expect(201);
    ids.ltKhong = b.body.stockLotId;
    ids.ptKhong = b.body.id;
  });

  it('thủy sản chỉ vào kho lạnh', async () => {
    const r = await tk1.post('/api/kho/nhan-hang').send(receipt({ loMuaId: ids.lmTom, khuId: ids.khuB, khoiLuongKg: 1990, soBao: null })).expect(400);
    expect(r.body.message).toMatch(/kho lạnh/);
    await tk1.post('/api/kho/nhan-hang').send(receipt({ loMuaId: ids.lmTom, khuId: ids.khuL, khoiLuongKg: 1990, soBao: null })).expect(201);
  });

  it('bảng tồn cộng theo khu, mặt hàng, nhãn EUDR; mọi phòng liên quan xem được', async () => {
    const t = await ktt.get(`/api/kho/ton?khoId=${ids.kho1}`).expect(200);
    const row = (khu: string) => t.body.ton.filter((x: { zoneId: string }) => x.zoneId === khu);
    expect(row(ids.khuA)).toEqual([expect.objectContaining({ kg: 6150, lots: 2, eudrClass: 'du', kind: 'nguyen_lieu', bags: 200 })]);
    expect(row(ids.khuB)).toEqual([expect.objectContaining({ kg: 8900, eudrClass: 'khong_du' })]);
    expect(row(ids.khuL)).toEqual([expect.objectContaining({ kg: 1990, sector: 'thuy_san' })]);
    expect(t.body.tong.kg).toBe(17040);
    const ds = (await nv.get('/api/kho').expect(200)).body.kho.find((x: { id: string }) => x.id === ids.kho1);
    expect(ds.tonKg).toBe(17040);
    expect(ds.khu.find((z: { id: string }) => z.id === ids.khuA)).toMatchObject({ tonKg: 6150, soLoTon: 2 });
    // Lô mua cho thủ kho chọn: số đã nhận và chênh lệch
    const lm = (await tk1.get('/api/kho/lo-mua').expect(200)).body.loMua.find((x: { id: string }) => x.id === ids.lmKhong);
    expect(lm).toMatchObject({ collectedKg: 9000, receivedKg: 8900 });
    // Lô mua vẫn đang thu gom nên chưa cảnh báo thiếu
    expect(lm.chenhLech.warning).toBeNull();
    const theoLo = (await tk1.get(`/api/kho/lo-ton?loMuaId=${ids.lmDu}`).expect(200)).body.loTon;
    expect(theoLo).toHaveLength(2);
    expect(theoLo[0].nguonGoc).toEqual([expect.objectContaining({ purchaseLotId: ids.lmDu, share: 1 })]);
  });

  it('chuyển một phần sang khu khác tách lô tồn mới cùng nguồn gốc; không chuyển cà phê đủ EUDR ra khu thường', async () => {
    const sai = await tk1.post(`/api/kho/lo-ton/${ids.ltDu1}/chuyen-khu`).send({ khuId: ids.khuB }).expect(400);
    expect(sai.body.message).toMatch(/chỉ được vào khu đủ EUDR/);
    await tk2.post(`/api/kho/lo-ton/${ids.ltKhong}/chuyen-khu`).send({ khuId: ids.khuC, khoiLuongKg: 3000 }).expect(403);
    await tk1.post(`/api/kho/lo-ton/${ids.ltKhong}/chuyen-khu`).send({ khuId: ids.khuC, khoiLuongKg: 9000 }).expect(400);
    const m = await tk1.post(`/api/kho/lo-ton/${ids.ltKhong}/chuyen-khu`).send({ khuId: ids.khuC, khoiLuongKg: 3000 }).expect(201);
    expect(m.body.id).not.toBe(ids.ltKhong);
    const goc = await tk1.get(`/api/kho/lo-ton/${ids.ltKhong}`).expect(200);
    expect(goc.body).toMatchObject({ remainingKg: 5900, initialKg: 8900, zoneCode: 'B', bags: 98 });
    expect(goc.body.soKho.map((x: { kind: string; quantityKg: number }) => [x.kind, x.quantityKg])).toEqual([
      ['nhan_hang', 8900],
      ['tach_ra', -3000],
    ]);
    const moi = await tk1.get(`/api/kho/lo-ton/${m.body.id}`).expect(200);
    expect(moi.body).toMatchObject({ remainingKg: 3000, zoneCode: 'C', parentId: ids.ltKhong, source: 'tach_lo', eudrClass: 'khong_du', bags: 50 });
    expect(moi.body.nguonGoc).toEqual([expect.objectContaining({ purchaseLotId: ids.lmKhong, share: 1 })]);
    // Chuyển cả lô thì giữ nguyên mã lô tồn
    const ca = await tk1.post(`/api/kho/lo-ton/${m.body.id}/chuyen-khu`).send({ khuId: ids.khuB }).expect(201);
    expect(ca.body.id).toBe(m.body.id);
    expect((await tk1.get(`/api/kho/lo-ton/${m.body.id}`).expect(200)).body.zoneCode).toBe('B');
  });

  it('huỷ phiếu nhận hàng chỉ khi hàng chưa bị chuyển; sổ kho chỉ ghi thêm', async () => {
    const khong = await tk1.post(`/api/kho/nhan-hang/${ids.ptKhong}/huy`).send({ lyDo: 'Cân nhầm xe' }).expect(400);
    expect(khong.body.message).toMatch(/đã được chuyển hoặc dùng/);
    await tk1.post(`/api/kho/nhan-hang/${ids.ptDu2}/huy`).send({ lyDo: 'Ghi trùng phiếu cân' }).expect(200);
    await tk1.post(`/api/kho/nhan-hang/${ids.ptDu2}/huy`).send({ lyDo: 'Ghi trùng phiếu cân' }).expect(400);
    const t = await tp.get(`/api/kho/ton?khoId=${ids.kho1}`).expect(200);
    expect(t.body.ton.find((x: { zoneId: string }) => x.zoneId === ids.khuA)).toMatchObject({ kg: 3000, lots: 1 });
    const ds = (await tp.get(`/api/kho/nhan-hang?loMuaId=${ids.lmDu}`).expect(200)).body.phieu;
    expect(ds.find((p: { id: string }) => p.id === ids.ptDu2)).toMatchObject({ voidReason: 'Ghi trùng phiếu cân' });
    await expect(pool.query(`update stock_moves set quantity_kg = 0 where stock_lot_id = $1`, [ids.ltDu1])).rejects.toThrow(/chỉ được ghi thêm/);
    await expect(pool.query(`delete from stock_moves where stock_lot_id = $1`, [ids.ltDu1])).rejects.toThrow(/chỉ được ghi thêm/);
    const log = await pool.query(`select count(*)::int as n from audit_log where action = 'kho.huy_nhan_hang' and entity_id = $1`, [ids.ptDu2]);
    expect(log.rows[0].n).toBe(1);
  });

  it('khu còn hàng không ngừng được; bỏ giao thủ kho thì hết quyền ghi phiếu', async () => {
    await tp.post(`/api/kho/khu/${ids.khuA}/ngung`).expect(400);
    await tp.post(`/api/kho/khu/${ids.khuC}/ngung`).expect(200);
    const r = await tk1.post(`/api/kho/lo-ton/${ids.ltKhong}/chuyen-khu`).send({ khuId: ids.khuC, khoiLuongKg: 100 }).expect(400);
    expect(r.body.message).toMatch(/ngừng dùng/);
    await tp.post(`/api/kho/${ids.kho1}/thu-kho/${ids.tk1}/bo`).expect(200);
    await tk1.post('/api/kho/nhan-hang').send(receipt({ loMuaId: ids.lmKhong, khuId: ids.khuB, khoiLuongKg: 50 })).expect(403);
  });
});

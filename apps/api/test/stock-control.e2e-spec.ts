import { INestApplication } from '@nestjs/common';
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

describe('Kho: chuyển kho giữa các kho và kiểm kê tháng (KS-6)', () => {
  let app: INestApplication;
  let nv: Agent;
  let tp: Agent;
  let tk1: Agent;
  let tk2: Agent;
  let ktt: Agent;
  let n = 0;
  const ids: Record<string, string> = {};
  const sfx = Date.now() % 100000;

  async function partner(roles: string[]) {
    const res = await nv.post('/api/doi-tac').send({ code: `CK${Date.now() % 100000}${++n}`, name: `Đối tác chuyển kho ${n}`, country: 'VN', category: 'doanh_nghiep_thuong_mai', roles }).expect(201);
    const id = res.body.id as string;
    await nv.post(`/api/doi-tac/${id}/tai-lieu`).send({ docType: 'Giấy đăng ký kinh doanh', number: `DKC${n}` }).expect(201);
    await nv.post(`/api/doi-tac/${id}/trinh-tham-dinh`).send({ riskRating: 'thap', screeningNote: 'Không có trong danh sách trừng phạt' }).expect(200);
    await tp.post(`/api/doi-tac/${id}/quyet-dinh-tham-dinh`).send({ dongY: true }).expect(200);
    return id;
  }
  async function lot(supplier: string) {
    const c = await nv.post('/api/hop-dong').send({ matHangId: ids.cafe, loai: 'mua', benBanId: supplier, dieuKhoan: terms(20) }).expect(201);
    await nv.post(`/api/hop-dong/${c.body.id}/trinh-ky`).expect(200);
    const g = await fullFirstLogin(app, await createUser(app, ['GIAM_DOC'], 'gdck'));
    await g.agent.post(`/api/hop-dong/${c.body.id}/ky`).send({ ma2Lop: codeFor(g.secret, 1) }).expect(200);
    return (await nv.post('/api/lo-mua').send({ hopDongId: c.body.id }).expect(201)).body.id as string;
  }
  async function nhan(loMuaId: string, khuId: string, kg: number, thuGom = true) {
    if (thuGom) await nv.post(`/api/lo-mua/${loMuaId}/su-kien`).send({ loai: 'thu_gom', khoiLuongKg: kg }).expect(200);
    return (await tk1.post('/api/kho/nhan-hang').send({ loMuaId, khoId: ids.kho1, khuId, ngayNhan: '2026-11-20', khoiLuongKg: kg }).expect(201)).body.stockLotId as string;
  }
  const lo = async (id: string) => (await tk1.get(`/api/kho/lo-ton/${id}`).expect(200)).body;
  const kinds = async (id: string) => (await lo(id)).soKho.map((m: { kind: string }) => m.kind);
  const chuyen = (loTonId: string, khoiLuongKg: number, over: Record<string, unknown> = {}) => ({ loTonId, denKhoId: ids.kho2, khoiLuongKg, ngayChuyen: '2026-11-26', bienSoXe: '51C-123.45', ghiChu: null, ...over });
  const dot = async (id: string) => (await tk1.get(`/api/kho/kiem-ke?khoId=${ids.kho1}`).expect(200)).body.dot.find((d: { id: string }) => d.id === id);
  const dem = (loTonId: string, soDemKg: number, ghiChu: string | null = null) => ({ loTonId, soDemKg, ghiChu });

  beforeAll(async () => {
    app = await startApp();
    nv = (await fullFirstLogin(app, await createUser(app, ['NHAN_VIEN_KD'], 'cknv'))).agent;
    tp = (await fullFirstLogin(app, await createUser(app, ['TRUONG_PHONG_KD'], 'cktp'))).agent;
    ktt = (await fullFirstLogin(app, await createUser(app, ['KE_TOAN_TRUONG'], 'ckktt'))).agent;
    const u1 = await createUser(app, ['THU_KHO'], 'cktk1');
    const u2 = await createUser(app, ['THU_KHO'], 'cktk2');
    tk1 = (await fullFirstLogin(app, u1)).agent;
    tk2 = (await fullFirstLogin(app, u2)).agent;
    ids.cafe = (await tp.post('/api/danh-muc/mat-hang').send({ code: `CKC${Date.now() % 100000}`, name: 'Cà phê Robusta S16', sector: 'ca_phe' }).expect(201)).body.id;
    ids.kho1 = (await tp.post('/api/danh-muc/co-so').send({ name: `Kho Buôn Ma Thuột ${sfx}`, kind: 'kho', ownership: 'tu_van_hanh' }).expect(201)).body.id;
    ids.kho2 = (await tp.post('/api/danh-muc/co-so').send({ name: `Kho Cát Lái ${sfx}`, kind: 'kho', ownership: 'tu_van_hanh' }).expect(201)).body.id;
    ids.a1 = (await tp.post(`/api/kho/${ids.kho1}/khu`).send({ ma: 'A', ten: 'Khu đủ EUDR', loai: 'du_eudr' }).expect(201)).body.id;
    ids.b1 = (await tp.post(`/api/kho/${ids.kho1}/khu`).send({ ma: 'B', ten: 'Khu thường', loai: 'thuong' }).expect(201)).body.id;
    ids.a2 = (await tp.post(`/api/kho/${ids.kho2}/khu`).send({ ma: 'A', ten: 'Khu đủ EUDR', loai: 'du_eudr' }).expect(201)).body.id;
    ids.b2 = (await tp.post(`/api/kho/${ids.kho2}/khu`).send({ ma: 'B', ten: 'Khu thường', loai: 'thuong' }).expect(201)).body.id;
    await tp.post(`/api/kho/${ids.kho1}/thu-kho`).send({ nguoiDungId: u1.id }).expect(200);
    await tp.post(`/api/kho/${ids.kho2}/thu-kho`).send({ nguoiDungId: u2.id }).expect(200);
    const ncc = await partner(['nha_cung_cap']);
    ids.lmA = await lot(ncc);
    ids.lmB = await lot(ncc);
    ids.lmDu = await lot(ncc);
    ids.ltA = await nhan(ids.lmA, ids.b1, 6000);
    ids.ltB = await nhan(ids.lmB, ids.b1, 4000);
    await thuGomDuEudr(app, ncc, ids.lmDu, 3000);
    ids.ltDu = await nhan(ids.lmDu, ids.a1, 3000, false);
  });
  afterAll(async () => {
    await app.close();
  });

  describe('chuyển kho', () => {
    it('chặn: không phải thủ kho đi, cùng một kho, chuyển quá số còn', async () => {
      await tk2.post('/api/kho/chuyen-kho').send(chuyen(ids.ltA, 1000)).expect(403);
      await nv.post('/api/kho/chuyen-kho').send(chuyen(ids.ltA, 1000)).expect(403);
      const cung = await tk1.post('/api/kho/chuyen-kho').send(chuyen(ids.ltA, 1000, { denKhoId: ids.kho1 })).expect(400);
      expect(cung.body.message).toMatch(/chuyển khu/);
      const qua = await tk1.post('/api/kho/chuyen-kho').send(chuyen(ids.ltA, 6500)).expect(400);
      expect(qua.body.message).toMatch(/6\.000 kg/);
      expect((await lo(ids.ltA)).remainingKg).toBe(6000);
    });

    it('kho đi xuất, kho đến cân lại: lô tồn mới cùng nguồn gốc, chênh cân là hao hụt vận chuyển', async () => {
      const r = await tk1.post('/api/kho/chuyen-kho').send(chuyen(ids.ltA, 2000)).expect(201);
      expect(r.body.code).toMatch(/^CK-2026-\d{4}$/);
      ids.ck1 = r.body.id;
      expect((await lo(ids.ltA)).remainingKg).toBe(4000);
      expect(await kinds(ids.ltA)).toEqual(['nhan_hang', 'chuyen_kho_di']);
      const ds = (await tk2.get(`/api/kho/chuyen-kho?khoId=${ids.kho2}`).expect(200)).body.phieu;
      expect(ds.find((x: { id: string }) => x.id === ids.ck1)).toMatchObject({ status: 'dang_di', fromName: `Kho Buôn Ma Thuột ${sfx}`, toName: `Kho Cát Lái ${sfx}`, quantityKg: 2000, quyen: { nhan: true, huy: false } });

      const nhanBody = { khuId: ids.b2, khoiLuongNhanKg: 1990, ngayNhan: '2026-11-27', soBao: 33 };
      await tk1.post(`/api/kho/chuyen-kho/${ids.ck1}/nhan`).send(nhanBody).expect(403);
      const sai = await tk2.post(`/api/kho/chuyen-kho/${ids.ck1}/nhan`).send({ ...nhanBody, khuId: ids.b1 }).expect(400);
      expect(sai.body.message).toMatch(/Khu không thuộc kho đến/);
      const nhieu = await tk2.post(`/api/kho/chuyen-kho/${ids.ck1}/nhan`).send({ ...nhanBody, khoiLuongNhanKg: 2100 }).expect(400);
      expect(nhieu.body.message).toMatch(/Không nhận nhiều hơn/);
      const som = await tk2.post(`/api/kho/chuyen-kho/${ids.ck1}/nhan`).send({ ...nhanBody, ngayNhan: '2026-11-25' }).expect(400);
      expect(som.body.message).toMatch(/không trước ngày chuyển/);

      const ok = await tk2.post(`/api/kho/chuyen-kho/${ids.ck1}/nhan`).send(nhanBody).expect(200);
      expect(ok.body).toMatchObject({ lossKg: 10, lossPct: 0.5 });
      ids.ltMoi = ok.body.stockLotId;
      const moi = await lo(ids.ltMoi);
      expect(moi).toMatchObject({ facilityId: ids.kho2, zoneId: ids.b2, source: 'chuyen_kho', parentId: ids.ltA, initialKg: 1990, remainingKg: 1990, bags: 33 });
      expect(moi.nguonGoc).toEqual([expect.objectContaining({ purchaseLotId: ids.lmA, share: 1 })]);
      expect(await kinds(ids.ltMoi)).toEqual(['chuyen_kho_den']);
      await tk2.post(`/api/kho/chuyen-kho/${ids.ck1}/nhan`).send(nhanBody).expect(400);
      const sau = (await tk1.get('/api/kho/chuyen-kho').expect(200)).body.phieu.find((x: { id: string }) => x.id === ids.ck1);
      expect(sau).toMatchObject({ status: 'da_nhan', receivedKg: 1990, lossKg: 10, receivedStockLotCode: moi.code, quyen: { nhan: false, huy: false } });
    });

    it('truy xuất lô nhận về đi ngược qua chuyển kho tới lô mua', async () => {
      const goc = await lo(ids.ltA);
      const buoc = (await tk2.get(`/api/kho/lo-ton/${ids.ltMoi}/truy-xuat`).expect(200)).body.buoc;
      expect(buoc.map((b: { kind: string }) => b.kind)).toEqual(['chuyen_kho', 'nhan_hang']);
      expect(buoc[0]).toMatchObject({ label: 'Chuyển kho', lots: [goc.code] });
      expect(buoc[0].detail).toMatch(/từ Kho Buôn Ma Thuột \d+: gửi 2\.000 kg ngày 26\/11\/2026, nhận 1\.990 kg ngày 27\/11\/2026/);
    });

    it('kho đến vẫn giữ quy tắc khu: cà phê đủ EUDR chỉ vào khu đủ EUDR', async () => {
      const r = await tk1.post('/api/kho/chuyen-kho').send(chuyen(ids.ltDu, 1000)).expect(201);
      const sai = await tk2.post(`/api/kho/chuyen-kho/${r.body.id}/nhan`).send({ khuId: ids.b2, khoiLuongNhanKg: 1000, ngayNhan: '2026-11-27' }).expect(400);
      expect(sai.body.message).toMatch(/đủ EUDR chỉ được vào khu đủ EUDR/);
      const ok = await tk2.post(`/api/kho/chuyen-kho/${r.body.id}/nhan`).send({ khuId: ids.a2, khoiLuongNhanKg: 1000, ngayNhan: '2026-11-27' }).expect(200);
      expect(ok.body.lossKg).toBe(0);
      expect((await lo(ok.body.stockLotId)).eudrClass).toBe('du');
    });

    it('kho đi huỷ phiếu chưa nhận: hàng về lại lô tồn', async () => {
      const r = await tk1.post('/api/kho/chuyen-kho').send(chuyen(ids.ltB, 500)).expect(201);
      expect((await lo(ids.ltB)).remainingKg).toBe(3500);
      await tk2.post(`/api/kho/chuyen-kho/${r.body.id}/huy`).send({ lyDo: 'Xe hỏng' }).expect(403);
      await tk1.post(`/api/kho/chuyen-kho/${r.body.id}/huy`).send({ lyDo: 'Xe hỏng giữa đường' }).expect(200);
      expect((await lo(ids.ltB)).remainingKg).toBe(4000);
      expect(await kinds(ids.ltB)).toEqual(['nhan_hang', 'chuyen_kho_di', 'huy_chuyen_kho']);
      await tk2.post(`/api/kho/chuyen-kho/${r.body.id}/nhan`).send({ khuId: ids.b2, khoiLuongNhanKg: 500, ngayNhan: '2026-11-27' }).expect(400);
      await tk1.post(`/api/kho/chuyen-kho/${r.body.id}/huy`).send({ lyDo: 'Lần nữa' }).expect(400);
    });
  });

  describe('kiểm kê tháng', () => {
    // Kho 1 lúc này: lô A 4.000 kg, lô B 4.000 kg, lô đủ EUDR 2.000 kg
    it('mở đợt: chụp số sổ mọi lô còn hàng, mỗi kho một đợt đang mở', async () => {
      await tk2.post('/api/kho/kiem-ke').send({ khoId: ids.kho1, ngayDem: '2026-11-27' }).expect(403);
      await tk1.post('/api/kho/kiem-ke').send({ khoId: ids.kho1, ngayDem: '2026-12-31' }).expect(400);
      const r = await tk1.post('/api/kho/kiem-ke').send({ khoId: ids.kho1, ngayDem: '2026-11-27', ghiChu: 'Kiểm kê tháng 11' }).expect(201);
      expect(r.body).toMatchObject({ code: expect.stringMatching(/^KK-2026-\d{4}$/), lines: 3 });
      ids.kk1 = r.body.id;
      const trung = await tk1.post('/api/kho/kiem-ke').send({ khoId: ids.kho1, ngayDem: '2026-11-27' }).expect(400);
      expect(trung.body.message).toMatch(/chưa xong/);
      const d = await dot(ids.kk1);
      expect(d).toMatchObject({ status: 'dang_dem', period: '2026-11', tolerancePct: 0.5, tong: { bookKg: 10000, countedKg: 0, daDem: 0, vuot: 0 }, quyen: { ghi: true, duyet: false } });
    });

    it('ghi số đếm: chỉ lô trong đợt, chưa đếm đủ thì không chốt được', async () => {
      const ngoai = await tk1.post(`/api/kho/kiem-ke/${ids.kk1}/so-dem`).send({ dong: [dem(ids.ltMoi, 1990)] }).expect(400);
      expect(ngoai.body.message).toMatch(/không có trong đợt/);
      await tk2.post(`/api/kho/kiem-ke/${ids.kk1}/so-dem`).send({ dong: [dem(ids.ltA, 3990)] }).expect(403);
      await tk1.post(`/api/kho/kiem-ke/${ids.kk1}/so-dem`).send({ dong: [dem(ids.ltA, 3990, 'Rách 1 bao')] }).expect(200);
      const thieu = await tk1.post(`/api/kho/kiem-ke/${ids.kk1}/chot`).expect(400);
      expect(thieu.body.message).toMatch(/Còn 2 lô chưa ghi số đếm/);
    });

    it('không lô nào lệch quá 0,5%: chốt là điều chỉnh sổ ngay', async () => {
      await tk1.post(`/api/kho/kiem-ke/${ids.kk1}/so-dem`).send({ dong: [dem(ids.ltB, 4000), dem(ids.ltDu, 2000)] }).expect(200);
      const r = await tk1.post(`/api/kho/kiem-ke/${ids.kk1}/chot`).expect(200);
      expect(r.body).toEqual({ status: 'da_dieu_chinh', overTolerance: 0 });
      expect((await lo(ids.ltA)).remainingKg).toBe(3990);
      const a = await lo(ids.ltA);
      expect(a.soKho.at(-1)).toMatchObject({ kind: 'kiem_ke', quantityKg: -10, note: expect.stringMatching(/sổ 4000 kg, đếm 3990 kg \(Rách 1 bao\)/) });
      expect(await kinds(ids.ltB)).not.toContain('kiem_ke');
      await tk1.post(`/api/kho/kiem-ke/${ids.kk1}/so-dem`).send({ dong: [dem(ids.ltA, 3000)] }).expect(400);
    });

    it('có lô lệch quá ngưỡng: chờ Kế toán trưởng; trả lại thì sổ giữ nguyên', async () => {
      const r = await tk1.post('/api/kho/kiem-ke').send({ khoId: ids.kho1, ngayDem: '2026-11-27' }).expect(201);
      await tk1.post(`/api/kho/kiem-ke/${r.body.id}/so-dem`).send({ dong: [dem(ids.ltA, 3990), dem(ids.ltB, 3900), dem(ids.ltDu, 2000)] }).expect(200);
      expect(await tk1.post(`/api/kho/kiem-ke/${r.body.id}/chot`).expect(200)).toMatchObject({ body: { status: 'cho_duyet', overTolerance: 1 } });
      const d = await dot(r.body.id);
      expect(d.dong.find((x: { stockLotId: string }) => x.stockLotId === ids.ltB)).toMatchObject({ diffKg: -100, diffPct: -2.5, overTolerance: true });
      expect(d.tong.vuot).toBe(1);
      expect((await ktt.get(`/api/kho/kiem-ke?trangThai=cho_duyet`).expect(200)).body.dot.find((x: { id: string }) => x.id === r.body.id).quyen).toEqual({ ghi: false, duyet: true });
      await tk1.post(`/api/kho/kiem-ke/${r.body.id}/so-dem`).send({ dong: [dem(ids.ltB, 4000)] }).expect(400);
      await tk1.post(`/api/kho/kiem-ke/${r.body.id}/duyet`).send({ dongY: true }).expect(403);
      await tp.post(`/api/kho/kiem-ke/${r.body.id}/duyet`).send({ dongY: true }).expect(403);
      await ktt.post(`/api/kho/kiem-ke/${r.body.id}/duyet`).send({ dongY: false }).expect(400);
      await ktt.post(`/api/kho/kiem-ke/${r.body.id}/duyet`).send({ dongY: false, ghiChu: 'Lô B đếm lại cả bao rách' }).expect(200);
      expect(await dot(r.body.id)).toMatchObject({ status: 'tu_choi', decisionNote: 'Lô B đếm lại cả bao rách', decidedByName: expect.any(String) });
      expect((await lo(ids.ltB)).remainingKg).toBe(4000);
      expect((await lo(ids.ltA)).remainingKg).toBe(3990);
    });

    it('Kế toán trưởng duyệt: điều chỉnh theo phần chênh, hàng ra giữa chừng vẫn đúng', async () => {
      const r = await tk1.post('/api/kho/kiem-ke').send({ khoId: ids.kho1, ngayDem: '2026-11-27' }).expect(201);
      await tk1.post(`/api/kho/kiem-ke/${r.body.id}/so-dem`).send({ dong: [dem(ids.ltA, 3990), dem(ids.ltB, 3950), dem(ids.ltDu, 2000)] }).expect(200);
      // Sau khi mở đợt, chuyển 500 kg lô B đi kho khác
      await tk1.post('/api/kho/chuyen-kho').send(chuyen(ids.ltB, 500)).expect(201);
      expect((await tk1.post(`/api/kho/kiem-ke/${r.body.id}/chot`).expect(200)).body.status).toBe('cho_duyet');
      await ktt.post(`/api/kho/kiem-ke/${r.body.id}/duyet`).send({ dongY: true, ghiChu: null }).expect(200);
      expect((await dot(r.body.id)).status).toBe('da_dieu_chinh');
      // 4.000 − 500 chuyển đi − 50 thiếu khi đếm
      expect((await lo(ids.ltB)).remainingKg).toBe(3450);
      expect(await kinds(ids.ltB)).toEqual(['nhan_hang', 'chuyen_kho_di', 'huy_chuyen_kho', 'chuyen_kho_di', 'kiem_ke']);
      await ktt.post(`/api/kho/kiem-ke/${r.body.id}/duyet`).send({ dongY: true }).expect(400);
    });
  });
});

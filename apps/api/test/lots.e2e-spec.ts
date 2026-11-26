import { INestApplication } from '@nestjs/common';
import { Pool } from 'pg';
import { PG_POOL } from '../src/db/db';
import { codeFor, createUser, fullFirstLogin, startApp } from './helpers';

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
const inDays = (d: number) => new Date(Date.now() + d * 864e5).toISOString();

describe('Lô hàng: lô mua, lô xuất, phân bổ, giám định, booking', () => {
  let app: INestApplication;
  let pool: Pool;
  let nv: Agent;
  let nv2: Agent;
  let tp: Agent;
  let ktt: Agent;
  let qt: Agent;
  let ncc1: string;
  let ncc2: string;
  let buyerA: string;
  let buyerB: string;
  let mh: string;
  let kho: string;
  let n = 0;
  const ids: Record<string, string> = {};

  async function partner(roles: string[]) {
    const res = await nv.post('/api/doi-tac').send({ code: `LO${Date.now() % 100000}${++n}`, name: `Đối tác lô ${n}`, country: 'VN', category: 'doanh_nghiep_thuong_mai', roles }).expect(201);
    const id = res.body.id as string;
    await nv.post(`/api/doi-tac/${id}/tai-lieu`).send({ docType: 'Giấy đăng ký kinh doanh', number: `DK${n}` }).expect(201);
    await nv.post(`/api/doi-tac/${id}/trinh-tham-dinh`).send({ riskRating: 'thap', screeningNote: 'Không có trong danh sách trừng phạt' }).expect(200);
    await tp.post(`/api/doi-tac/${id}/quyet-dinh-tham-dinh`).send({ dongY: true }).expect(200);
    return id;
  }

  /** Soạn, trình và ký một hợp đồng (mỗi lần ký dùng một Giám đốc mới để mã 2 lớp không trùng). */
  async function signed(body: Record<string, unknown>) {
    const c = await nv.post('/api/hop-dong').send({ matHangId: mh, ...body }).expect(201);
    await nv.post(`/api/hop-dong/${c.body.id}/trinh-ky`).expect(200);
    const u = await createUser(app, ['GIAM_DOC'], 'gdlo');
    const gd = await fullFirstLogin(app, u);
    await gd.agent.post(`/api/hop-dong/${c.body.id}/ky`).send({ ma2Lop: codeFor(gd.secret, 1) }).expect(200);
    return c.body.id as string;
  }

  beforeAll(async () => {
    app = await startApp();
    pool = app.get<Pool>(PG_POOL);
    nv = (await fullFirstLogin(app, await createUser(app, ['NHAN_VIEN_KD'], 'lonv'))).agent;
    nv2 = (await fullFirstLogin(app, await createUser(app, ['NHAN_VIEN_KD'], 'lonv2'))).agent;
    tp = (await fullFirstLogin(app, await createUser(app, ['TRUONG_PHONG_KD'], 'lotp'))).agent;
    ktt = (await fullFirstLogin(app, await createUser(app, ['KE_TOAN_TRUONG'], 'loktt'))).agent;
    qt = (await fullFirstLogin(app, await createUser(app, ['QUAN_TRI_HE_THONG'], 'loqt'))).agent;
    ncc1 = await partner(['nha_cung_cap']);
    ncc2 = await partner(['nha_cung_cap']);
    buyerA = await partner(['nguoi_mua']);
    buyerB = await partner(['nguoi_mua']);
    mh = (await tp.post('/api/danh-muc/mat-hang').send({ code: `LOROB${Date.now() % 100000}`, name: 'Cà phê Robusta', sector: 'ca_phe' }).expect(201)).body.id;
    const k = await tp.post('/api/danh-muc/co-so').send({ name: 'Kho Tân Uyên', kind: 'kho', ownership: 'tu_van_hanh', address: 'Bình Dương' }).expect(201);
    kho = k.body.id;
    ids.mua1 = await signed({ loai: 'mua', benBanId: ncc1, dieuKhoan: terms(20) });
    ids.mua2 = await signed({ loai: 'mua', benBanId: ncc2, dieuKhoan: terms(10) });
    ids.banA = await signed({ loai: 'ban', benMuaId: buyerA, dieuKhoan: terms(25, { tyLePhiPhanTram: null, donGia: 5100 }) });
    ids.banB = await signed({ loai: 'ban', benMuaId: buyerB, dieuKhoan: terms(3, { tyLePhiPhanTram: null, donGia: 5150, dungSaiPhanTram: 0 }) });
  });
  afterAll(async () => {
    await app.close();
  });

  it('hợp đồng khả dụng: hợp đồng mua cho lô mua, hợp đồng bán cho lô xuất', async () => {
    const r = await nv.get('/api/lo-mua/hop-dong-kha-dung').expect(200);
    const m = r.body.choLoMua.map((c: { id: string }) => c.id);
    const x = r.body.choLoXuat.map((c: { id: string }) => c.id);
    expect(m).toEqual(expect.arrayContaining([ids.mua1, ids.mua2]));
    expect(x).toEqual(expect.arrayContaining([ids.banA, ids.banB]));
    const other = await nv2.get('/api/lo-mua/hop-dong-kha-dung').expect(200);
    expect(other.body.choLoMua.map((c: { id: string }) => c.id)).not.toContain(ids.mua1);
    await nv2.post('/api/lo-mua').send({ hopDongId: ids.mua1 }).expect(403);
    await nv.post('/api/lo-mua').send({ hopDongId: ids.banA }).expect(400);
  });

  it('lô mua: thu gom → sơ chế (hao hụt) → nhập kho, đúng thứ tự', async () => {
    const l1 = await nv.post('/api/lo-mua').send({ hopDongId: ids.mua1, maVungTrong: 'VN-DL-0123', ngayThuHoach: '2026-11-20' }).expect(201);
    expect(l1.body.code).toMatch(/^LM-\d{4}-\d{4}$/);
    ids.lm1 = l1.body.id;
    await nv.post(`/api/lo-mua/${ids.lm1}/su-kien`).send({ loai: 'nhap_kho', khoiLuongKg: 1, coSoId: kho }).expect(400);
    await nv.post(`/api/lo-mua/${ids.lm1}/su-kien`).send({ loai: 'thu_gom', khoiLuongKg: 12000 }).expect(200);
    await nv.post(`/api/lo-mua/${ids.lm1}/su-kien`).send({ loai: 'thu_gom', khoiLuongKg: 8500 }).expect(200);
    const bad = await nv.post(`/api/lo-mua/${ids.lm1}/su-kien`).send({ loai: 'so_che', khoiLuongKg: 20000, haoHutKg: 400 }).expect(400);
    expect(bad.body.message).toMatch(/bằng khối lượng thu gom/);
    await nv.post(`/api/lo-mua/${ids.lm1}/su-kien`).send({ loai: 'so_che', khoiLuongKg: 20000, haoHutKg: 500 }).expect(200);
    await nv.post(`/api/lo-mua/${ids.lm1}/su-kien`).send({ loai: 'thu_gom', khoiLuongKg: 10 }).expect(400);
    await nv.post(`/api/lo-mua/${ids.lm1}/su-kien`).send({ loai: 'nhap_kho', khoiLuongKg: 19000, coSoId: kho }).expect(400);
    await nv.post(`/api/lo-mua/${ids.lm1}/su-kien`).send({ loai: 'nhap_kho', khoiLuongKg: 20000, coSoId: kho }).expect(200);
    const g = await nv.get(`/api/lo-mua/${ids.lm1}`).expect(200);
    expect(g.body).toMatchObject({ status: 'da_nhap_kho', collectedKg: 20500, lossKg: 500, availableKg: 20000, unallocatedKg: 20000, facilityName: 'Kho Tân Uyên' });
    expect(g.body.suKien.map((e: { kind: string }) => e.kind)).toEqual(['tao', 'thu_gom', 'thu_gom', 'so_che', 'nhap_kho']);
    expect(g.body.suKien[3].detail).toMatchObject({ haoHutKg: 500, haoHutPhanTram: 2.44 });
    await nv2.get(`/api/lo-mua/${ids.lm1}`).expect(403);

    ids.lm2 = (await nv.post('/api/lo-mua').send({ hopDongId: ids.mua2 }).expect(201)).body.id;
    await nv.post(`/api/lo-mua/${ids.lm2}/su-kien`).send({ loai: 'thu_gom', khoiLuongKg: 10000 }).expect(200);
    ids.lm3 = (await nv.post('/api/lo-mua').send({ hopDongId: ids.mua2 }).expect(201)).body.id;
    await nv.post(`/api/lo-mua/${ids.lm3}/su-kien`).send({ loai: 'thu_gom', khoiLuongKg: 500 }).expect(200);
    await nv.post(`/api/lo-mua/${ids.lm2}/su-kien`).send({ loai: 'so_che', khoiLuongKg: 9800 }).expect(200);
  });

  it('lô xuất: một hợp đồng đối ứng chỉ một lô xuất', async () => {
    const a = await nv.post('/api/lo-xuat').send({ hopDongDoiUngId: ids.banA, thiTruong: 'US', etd: '2027-01-20' }).expect(201);
    expect(a.body.code).toMatch(/^LX-\d{4}-\d{4}$/);
    ids.lxA = a.body.id;
    const dup = await nv.post('/api/lo-xuat').send({ hopDongDoiUngId: ids.banA, thiTruong: 'US' }).expect(400);
    expect(dup.body.message).toMatch(/đã có lô xuất/);
    await nv.post('/api/lo-xuat').send({ hopDongDoiUngId: ids.mua1, thiTruong: 'US' }).expect(400);
    ids.lxB = (await nv.post('/api/lo-xuat').send({ hopDongDoiUngId: ids.banB, thiTruong: 'CN' }).expect(201)).body.id;
  });

  it('phân bổ: chỉ lô đã sơ chế, không vượt khối lượng còn lại', async () => {
    const r = await nv.post(`/api/lo-xuat/${ids.lxA}/phan-bo`).send({ loMuaId: ids.lm3, khoiLuongKg: 100 }).expect(400);
    expect(r.body.message).toMatch(/chưa sơ chế/);
    await nv.post(`/api/lo-xuat/${ids.lxA}/phan-bo`).send({ loMuaId: ids.lm1, khoiLuongKg: 17000 }).expect(201);
    await nv.post(`/api/lo-xuat/${ids.lxA}/phan-bo`).send({ loMuaId: ids.lm2, khoiLuongKg: 8000 }).expect(201);
    await nv.post(`/api/lo-xuat/${ids.lxB}/phan-bo`).send({ loMuaId: ids.lm1, khoiLuongKg: 3000 }).expect(201);
    const over = await nv.post(`/api/lo-xuat/${ids.lxB}/phan-bo`).send({ loMuaId: ids.lm1, khoiLuongKg: 1 }).expect(400);
    expect(over.body.message).toMatch(/chỉ còn 0 kg/);
    const conHang = await nv.get('/api/lo-mua?conHang=1').expect(200);
    expect(conHang.body.loMua.map((l: { id: string }) => l.id)).toEqual([ids.lm2]);
    // Chốt chặn trong cơ sở dữ liệu
    const [{ id: user }] = (await pool.query(`select created_by as id from purchase_lots where id = $1`, [ids.lm1])).rows;
    await expect(
      pool.query(`insert into lot_allocations (purchase_lot_id, export_lot_id, quantity_kg, created_by) values ($1, $2, 5, $3)`, [ids.lm1, ids.lxB, user]),
    ).rejects.toThrow(/vượt khối lượng/);
  });

  it('phân bổ cần Trưởng phòng duyệt; lô mua bị chia cần nhà cung cấp đồng ý trước giám định', async () => {
    const before = await nv.post(`/api/lo-xuat/${ids.lxA}/chuyen-buoc`).send({}).expect(400);
    expect(before.body.message).toMatch(/chưa được Trưởng phòng/);
    const lx = await tp.get(`/api/lo-xuat/${ids.lxA}`).expect(200);
    expect(lx.body.phanBo.every((p: { coTheDuyet: boolean }) => p.coTheDuyet)).toBe(true);
    await nv.post(`/api/phan-bo/${lx.body.phanBo[0].id}/duyet`).expect(403);
    for (const p of lx.body.phanBo) await tp.post(`/api/phan-bo/${p.id}/duyet`).expect(200);
    await tp.post(`/api/phan-bo/${lx.body.phanBo[0].id}/duyet`).expect(400);
    const s = await nv.post(`/api/lo-xuat/${ids.lxA}/chuyen-buoc`).send({}).expect(200);
    expect(s.body.status).toBe('nhap_kho');

    const blocked = await nv.post(`/api/lo-xuat/${ids.lxA}/chuyen-buoc`).send({}).expect(400);
    expect(blocked.body.message).toMatch(/chưa có xác nhận đồng ý của nhà cung cấp/);
    // Lô 2 không bị chia: không cần đồng ý
    await nv.post(`/api/lo-mua/${ids.lm2}/dong-y-chia-lo`).send({ soVanBan: 'CV 01' }).expect(400);
    await nv.post(`/api/lo-mua/${ids.lm1}/dong-y-chia-lo`).send({ soVanBan: 'Công văn 12/2026 của HTX' }).expect(200);
    await nv.post(`/api/lo-mua/${ids.lm1}/dong-y-chia-lo`).send({ soVanBan: 'Công văn 12/2026 của HTX' }).expect(400);
    const lm = await nv.get(`/api/lo-mua/${ids.lm1}`).expect(200);
    expect(lm.body.chiaLo).toMatchObject({ biChia: true, daXacNhan: true });
    const hd = await nv.get(`/api/hop-dong/${ids.mua1}`).expect(200);
    const entry = hd.body.ledger.at(-1);
    expect(entry.event).toBe('ncc_dong_y_chia_lo');
    expect(entry.contentHash).toBe(lm.body.chiaLo.lanGanNhat.maBam);
    expect((await nv.post(`/api/lo-xuat/${ids.lxA}/chuyen-buoc`).send({}).expect(200)).body.status).toBe('giam_dinh');
  });

  it('giám định không đạt thì đèn đỏ và không đi tiếp; đạt thì sang đặt chỗ', async () => {
    await nv.post(`/api/lo-xuat/${ids.lxA}/giam-dinh`).send({ ketQua: 'khong_dat', donViGiamDinh: 'Vinacontrol', ghiChu: 'Độ ẩm 13,5%' }).expect(200);
    const board = await ktt.get('/api/lo-xuat').expect(200);
    expect(board.body.loXuat.find((l: { id: string }) => l.id === ids.lxA)).toMatchObject({ den: 'do', giamDinh: 'khong_dat' });
    const r = await nv.post(`/api/lo-xuat/${ids.lxA}/chuyen-buoc`).send({}).expect(400);
    expect(r.body.message).toMatch(/không đạt/);
    await nv.post(`/api/lo-xuat/${ids.lxA}/giam-dinh`).send({ ketQua: 'dat', donViGiamDinh: 'Vinacontrol', soChungThu: 'VC-2026-889' }).expect(200);
    await nv.put(`/api/lo-xuat/${ids.lxA}/booking`).send({ hangTau: 'Maersk', soBooking: 'MAEU123456', cutoffSi: inDays(2), cutoffHang: inDays(3), container: [{ so: 'MSKU1234567' }] }).expect(200);
    const g = await nv.get(`/api/lo-xuat/${ids.lxA}`).expect(200);
    expect(g.body).toMatchObject({ ngayDenCutoff: 2, den: 'do', buocKe: 'dat_cho' });
    expect((await nv.post(`/api/lo-xuat/${ids.lxA}/chuyen-buoc`).send({}).expect(200)).body.status).toBe('dat_cho');
  });

  it('xếp tàu cần container kẹp chì, số vận đơn và ngày tàu chạy; sau đó không huỷ được', async () => {
    const noSeal = await nv.post(`/api/lo-xuat/${ids.lxA}/chuyen-buoc`).send({ soVanDon: 'MAEU2611', ngayTauChay: '2027-01-21' }).expect(400);
    expect(noSeal.body.message).toMatch(/số chì/);
    await nv.put(`/api/lo-xuat/${ids.lxA}/booking`).send({ hangTau: 'Maersk', soBooking: 'MAEU123456', container: [{ so: 'msku1234567', chi: 'X' }] }).expect(400);
    await nv
      .put(`/api/lo-xuat/${ids.lxA}/booking`)
      .send({ hangTau: 'Maersk', soBooking: 'MAEU123456', tauChuyen: 'MAERSK KOLKATA 603W', cutoffSi: inDays(2), cutoffHang: inDays(3), container: [{ so: 'MSKU1234567', chi: 'ML-778899' }] })
      .expect(200);
    await nv.post(`/api/lo-xuat/${ids.lxA}/chuyen-buoc`).send({}).expect(400);
    await nv2.post(`/api/lo-xuat/${ids.lxA}/chuyen-buoc`).send({ soVanDon: 'MAEU2611', ngayTauChay: '2027-01-21' }).expect(403);
    // Chứng từ được kiểm thử riêng ở documents.e2e; ở đây đánh dấu không áp dụng để qua cổng chứng từ
    const noDocs = await nv.post(`/api/lo-xuat/${ids.lxA}/chuyen-buoc`).send({ soVanDon: 'MAEU2611', ngayTauChay: '2027-01-21' }).expect(400);
    expect(noDocs.body.message).toMatch(/chứng từ bắt buộc trước xếp tàu/);
    const ct = await tp.get(`/api/lo-xuat/${ids.lxA}/chung-tu`).expect(200);
    for (const d of ct.body.chungTu.filter((x: { requirement: string; stage: string; obsolete: boolean }) => x.requirement === 'bb' && x.stage === 'truoc_xep_tau' && !x.obsolete)) {
      await tp.post(`/api/chung-tu/${d.id}/khong-ap-dung`).send({ lyDo: 'Kiểm thử luồng lô hàng' }).expect(204);
    }
    const ok = await nv.post(`/api/lo-xuat/${ids.lxA}/chuyen-buoc`).send({ soVanDon: 'MAEU2611', ngayTauChay: '2027-01-21' }).expect(200);
    expect(ok.body.status).toBe('xep_tau');
    const g = await nv.get(`/api/lo-xuat/${ids.lxA}`).expect(200);
    expect(g.body).toMatchObject({ blNumber: 'MAEU2611', shippedOn: '2027-01-21', den: 'xanh' });
    await nv.post(`/api/lo-xuat/${ids.lxA}/huy`).send({ lyDo: 'Thử huỷ' }).expect(400);
  });

  it('huỷ lô xuất trả hàng về lô mua; nhật ký lô không sửa được', async () => {
    await nv.post(`/api/lo-xuat/${ids.lxB}/huy`).send({ lyDo: 'Người mua hoãn' }).expect(200);
    const lm = await nv.get(`/api/lo-mua/${ids.lm1}`).expect(200);
    expect(lm.body.unallocatedKg).toBe(3000);
    await nv.post('/api/lo-xuat').send({ hopDongDoiUngId: ids.banB, thiTruong: 'CN' }).expect(400);
    await expect(pool.query(`update lot_events set note = 'x' where export_lot_id = $1`, [ids.lxA])).rejects.toThrow(/chỉ được ghi thêm/);
    await expect(pool.query(`delete from lot_events where export_lot_id = $1`, [ids.lxA])).rejects.toThrow(/chỉ được ghi thêm/);
  });

  it('quyền xem: kế toán trưởng xem bảng điều phối; quản trị và nhân viên khác thì không', async () => {
    await ktt.get(`/api/lo-xuat/${ids.lxA}`).expect(200);
    await nv2.get(`/api/lo-xuat/${ids.lxA}`).expect(403);
    const mine = await nv2.get('/api/lo-xuat').expect(200);
    expect(mine.body.loXuat).toEqual([]);
    await qt.get('/api/lo-xuat').expect(403);
    await ktt.post(`/api/lo-xuat/${ids.lxA}/giam-dinh`).send({ ketQua: 'dat', donViGiamDinh: 'SGS' }).expect(403);
  });
});

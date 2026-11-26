import { INestApplication } from '@nestjs/common';
import { Pool } from 'pg';
import { PG_POOL } from '../src/db/db';
import { codeFor, createUser, fullFirstLogin, startApp, uniqueEmail } from './helpers';

type Agent = Awaited<ReturnType<typeof fullFirstLogin>>['agent'];
type Row = { id: string; kind: string; status: string; plannedAmount: number; paidAmount: number | null; purchaseLotId: string | null; financingId: string | null; denHan: boolean; quyen: Record<string, boolean> };
type Cond = { ma: string; dat: boolean; chiTiet: string };

const terms = (soLuong: number, donGia: number, over: Record<string, unknown> = {}) => ({
  soLuong,
  donVi: 'tan',
  dungSaiPhanTram: 5,
  donGia,
  tienTe: 'USD',
  tyGiaUsd: null,
  incoterms: 'FOB',
  cangDi: 'Cát Lái',
  cangDen: null,
  lichGiao: 'Tháng 1/2027',
  dieuKhoanThanhToan: 'CAD',
  tyLePhiPhanTram: 1.5,
  ghiChu: null,
  ...over,
});

describe('Thanh toán, tài trợ, khiếu nại và quyết toán lô', () => {
  let app: INestApplication;
  let nv: Agent;
  let tp: Agent;
  let ktt: Agent;
  let ktt2: Agent;
  let ktv: Agent;
  let gd: Agent;
  let qt: Agent;
  let ncc1: string;
  let ncc2: string;
  let buyer: string;
  let bank: string;
  let mh: string;
  let n = 0;
  const ids: Record<string, string> = {};

  async function partner(roles: string[], category = 'doanh_nghiep_thuong_mai') {
    const res = await nv.post('/api/doi-tac').send({ code: `TT${Date.now() % 100000}${++n}`, name: `Đối tác thanh toán ${n}`, country: 'VN', category, roles }).expect(201);
    const id = res.body.id as string;
    await nv.post(`/api/doi-tac/${id}/tai-lieu`).send({ docType: 'Giấy đăng ký kinh doanh', number: `DK${n}` }).expect(201);
    await nv.post(`/api/doi-tac/${id}/trinh-tham-dinh`).send({ riskRating: 'thap', screeningNote: 'Không có trong danh sách trừng phạt' }).expect(200);
    await tp.post(`/api/doi-tac/${id}/quyet-dinh-tham-dinh`).send({ dongY: true }).expect(200);
    return id;
  }

  async function signed(body: Record<string, unknown>) {
    const c = await nv.post('/api/hop-dong').send({ matHangId: mh, ...body }).expect(201);
    await nv.post(`/api/hop-dong/${c.body.id}/trinh-ky`).expect(200);
    const g = await fullFirstLogin(app, await createUser(app, ['GIAM_DOC'], 'gdtt'));
    await g.agent.post(`/api/hop-dong/${c.body.id}/ky`).send({ ma2Lop: codeFor(g.secret, 1) }).expect(200);
    return c.body.id as string;
  }

  async function purchaseLot(contractId: string, kg: number) {
    const id = (await nv.post('/api/lo-mua').send({ hopDongId: contractId }).expect(201)).body.id as string;
    await nv.post(`/api/lo-mua/${id}/su-kien`).send({ loai: 'thu_gom', khoiLuongKg: kg }).expect(200);
    await nv.post(`/api/lo-mua/${id}/su-kien`).send({ loai: 'so_che', khoiLuongKg: kg }).expect(200);
    return id;
  }

  /** Thử nghiệm không xét chứng từ: Trưởng phòng đánh dấu mọi dòng "không áp dụng". */
  async function waiveDocs(lot: string) {
    const d = (await tp.get(`/api/lo-xuat/${lot}/chung-tu`).expect(200)).body.chungTu as { id: string; status: string; obsolete: boolean }[];
    for (const x of d.filter((x) => !x.obsolete && x.status !== 'khong_ap_dung' && x.status !== 'da_gui')) {
      await tp.post(`/api/chung-tu/${x.id}/khong-ap-dung`).send({ lyDo: 'Kiểm thử thanh toán' }).expect(204);
    }
  }

  /** Lô xuất từ một lô mua, đi tới xếp tàu. */
  async function shippedLot(counter: string, lm: string, kg: number, bl: string) {
    const lx = (await nv.post('/api/lo-xuat').send({ hopDongDoiUngId: counter, thiTruong: 'CN', etd: '2027-01-20' }).expect(201)).body.id as string;
    await nv.post(`/api/lo-xuat/${lx}/phan-bo`).send({ loMuaId: lm, khoiLuongKg: kg }).expect(201);
    for (const p of (await tp.get(`/api/lo-xuat/${lx}`).expect(200)).body.phanBo) await tp.post(`/api/phan-bo/${p.id}/duyet`).expect(200);
    await waiveDocs(lx);
    const adv = (body: Record<string, unknown> = {}) => nv.post(`/api/lo-xuat/${lx}/chuyen-buoc`).send(body).expect(200);
    await adv();
    await adv();
    await nv.post(`/api/lo-xuat/${lx}/giam-dinh`).send({ ketQua: 'dat', donViGiamDinh: 'Vinacontrol' }).expect(200);
    await nv.put(`/api/lo-xuat/${lx}/booking`).send({ hangTau: 'COSCO', soBooking: `BK${bl}`, container: [{ so: 'CSNU1234567', chi: 'C-1' }] }).expect(200);
    await adv();
    await adv({ soVanDon: bl, ngayTauChay: '2026-11-20' });
    return lx;
  }

  async function complete(lot: string) {
    await waiveDocs(lot);
    expect((await nv.post(`/api/lo-xuat/${lot}/chuyen-buoc`).send({}).expect(200)).body.status).toBe('hoan_tat');
  }

  const pay = async (lot: string, a: Agent = ktv) => (await a.get(`/api/lo-xuat/${lot}/thanh-toan`).expect(200)).body as { dong: Row[]; taiTro: { id: string; status: string }[]; tongHop: Record<string, number>; hanMucTraNccUsd: Record<string, number> | null; khoa: boolean; quyen: Record<string, boolean> };
  const pending = async (lot: string, kind: string) => (await pay(lot)).dong.filter((r) => r.kind === kind && r.status === 'du_kien');
  const plan = (lot: string, body: Record<string, unknown>, a: Agent = ktv) => a.post(`/api/lo-xuat/${lot}/thanh-toan`).send({ moc: 'chung_tu', tienTe: 'USD', ...body });
  const record = (id: string, body: Record<string, unknown>, a: Agent = ktv) => a.post(`/api/thanh-toan/${id}/ghi-nhan`).send({ ngay: '2026-11-25', ...body });
  const settle = async (lot: string, a: Agent = ktv) => (await a.get(`/api/lo-xuat/${lot}/quyet-toan`).expect(200)).body;

  beforeAll(async () => {
    app = await startApp();
    nv = (await fullFirstLogin(app, await createUser(app, ['NHAN_VIEN_KD'], 'ttnv'))).agent;
    tp = (await fullFirstLogin(app, await createUser(app, ['TRUONG_PHONG_KD'], 'tttp'))).agent;
    ktt = (await fullFirstLogin(app, await createUser(app, ['KE_TOAN_TRUONG'], 'ttktt'))).agent;
    ktt2 = (await fullFirstLogin(app, await createUser(app, ['KE_TOAN_TRUONG'], 'ttktt2'))).agent;
    ktv = (await fullFirstLogin(app, await createUser(app, ['KE_TOAN_VIEN'], 'ttktv'))).agent;
    gd = (await fullFirstLogin(app, await createUser(app, ['GIAM_DOC'], 'ttgd'))).agent;
    qt = (await fullFirstLogin(app, await createUser(app, ['QUAN_TRI_HE_THONG'], 'ttqt'))).agent;
    ncc1 = await partner(['nha_cung_cap']);
    ncc2 = await partner(['nha_cung_cap']);
    buyer = await partner(['nguoi_mua']);
    bank = await partner(['ngan_hang'], 'ngan_hang');
    mh = (await tp.post('/api/danh-muc/mat-hang').send({ code: `TTROB${Date.now() % 100000}`, name: 'Cà phê Robusta', sector: 'ca_phe' }).expect(201)).body.id;

    // Mua đứt: mua 4.000 USD/tấn, bán 4.800 USD/tấn, 10 tấn, phí 1,5% trên giá bán
    ids.mua = await signed({ loai: 'mua', benBanId: ncc1, dieuKhoan: terms(10, 4000) });
    ids.ban = await signed({ loai: 'ban', benMuaId: buyer, dieuKhoan: terms(10, 4800, { tyLePhiPhanTram: null }) });
    ids.lm1 = await purchaseLot(ids.mua, 10000);
    // Môi giới: phí 2%
    ids.mg = await signed({ loai: 'moi_gioi', benBanId: ncc2, dieuKhoan: terms(10, 4800, { tyLePhiPhanTram: 2 }) });
    ids.tt = await signed({ loai: 'mua_ban_truc_tiep', benBanId: ncc2, benMuaId: buyer, dieuKhoan: terms(10, 4800, { tyLePhiPhanTram: null }) });
    ids.lm2 = await purchaseLot(ids.mg, 10000);
  });
  afterAll(async () => {
    await app.close();
  });

  it('lập lịch thu chi: chỉ kế toán lập; nhân viên phụ trách xem được; quản trị không xem', async () => {
    ids.lx = (await nv.post('/api/lo-xuat').send({ hopDongDoiUngId: ids.ban, thiTruong: 'CN', etd: '2027-01-20' }).expect(201)).body.id;
    await nv.post(`/api/lo-xuat/${ids.lx}/phan-bo`).send({ loMuaId: ids.lm1, khoiLuongKg: 10000 }).expect(201);
    await plan(ids.lx, { loai: 'tien_hang_ncc', loMuaId: ids.lm1, soTien: 40000, moc: 'giam_dinh' }, nv).expect(403);
    await qt.get(`/api/lo-xuat/${ids.lx}/thanh-toan`).expect(403);
    await plan(ids.lx, { loai: 'tien_hang_ncc', soTien: 40000 }).expect(400);
    await plan(ids.lx, { loai: 'tien_hang_truc_tiep', loMuaId: ids.lm1, soTien: 40000 }).expect(400);
    await plan(ids.lx, { loai: 'phi_thu_xep_von', soTien: 1 }).expect(400);
    await plan(ids.lx, { loai: 'chi_phi', soTien: 100, moc: 'ngay' }).expect(400);
    await plan(ids.lx, { loai: 'tien_hang_ncc', loMuaId: ids.lm1, soTien: 40000, moc: 'giam_dinh' }).expect(201);
    const v = await pay(ids.lx, nv);
    expect(v.dong).toEqual([expect.objectContaining({ kind: 'tien_hang_ncc', status: 'du_kien', denHan: false, partnerId: ncc1 })]);
    expect(v.quyen.lapLich).toBe(false);
    expect(v.hanMucTraNccUsd).toEqual({ hanMucUsd: 0, daTraUsd: 0, conLaiUsd: 0 });
  });

  it('mua đứt: không trả nhà cung cấp vượt số đã thu; tài trợ giải ngân thì được trả tới số giải ngân; Giám đốc cho trả vượt', async () => {
    const [ncc] = await pending(ids.lx, 'tien_hang_ncc');
    const blocked = await record(ncc.id, { soTien: 40000 }).expect(403);
    expect(blocked.body.message).toMatch(/vượt số đã thu của người mua.*Cần Giám đốc duyệt/);

    const fin = { nganHangId: bank, benVayId: ncc1, loai: 'truoc_xuat_khau', soTien: 30000, tienTe: 'USD', tyLePhiPhanTram: 1, ngayDaoHan: '2027-03-01' };
    await ktv.post(`/api/lo-xuat/${ids.lx}/tai-tro`).send({ ...fin, nganHangId: buyer }).expect(400);
    ids.fin = (await ktv.post(`/api/lo-xuat/${ids.lx}/tai-tro`).send(fin).expect(201)).body.id;
    await nv.post(`/api/tai-tro/${ids.fin}/giai-ngan`).send({ ngay: '2026-11-10' }).expect(403);
    await ktv.post(`/api/tai-tro/${ids.fin}/giai-ngan`).send({ ngay: '2026-11-10' }).expect(204);
    await ktv.post(`/api/tai-tro/${ids.fin}/giai-ngan`).send({ ngay: '2026-11-10' }).expect(400);
    const v = await pay(ids.lx);
    // Giải ngân tự lập: phí thu xếp vốn = 1% × 30.000 (đến hạn ngay), và khoản trả nợ ngân hàng
    expect(v.dong.find((r) => r.kind === 'phi_thu_xep_von')).toMatchObject({ plannedAmount: 300, denHan: true, partnerId: ncc1, quyen: { huy: false } });
    expect(v.dong.find((r) => r.kind === 'tra_ngan_hang')).toMatchObject({ plannedAmount: 30000, partnerId: bank });
    expect(v.hanMucTraNccUsd!.hanMucUsd).toBe(30000);

    // Trả một phần 30.000: được; phần còn lại thành khoản mới, vẫn bị chặn
    await record(ncc.id, { soTien: 30000, soThamChieu: 'UNC-001' }).expect(204);
    const [rest] = await pending(ids.lx, 'tien_hang_ncc');
    expect(rest.plannedAmount).toBe(10000);
    await record(rest.id, { soTien: 9200 }).expect(403);
    await ktt.post(`/api/thanh-toan/${rest.id}/duyet-vuot`).send({ lyDo: 'Nhà cung cấp cần tiền thu hoạch' }).expect(403);
    expect(rest.quyen.duyetVuot).toBe(false);
    expect((await pay(ids.lx, gd)).dong.find((r) => r.id === rest.id)!.quyen.duyetVuot).toBe(true);
    await gd.post(`/api/thanh-toan/${rest.id}/duyet-vuot`).send({ lyDo: 'Nhà cung cấp cần tiền thu hoạch, người mua đã mở L/C' }).expect(204);
    await record(rest.id, { soTien: 9200 }).expect(204);
    await record(rest.id, { soTien: 9200 }).expect(400);
  });

  it('khiếu nại: chỉ mở sau xếp tàu; người mở không tự kết luận; giảm trừ phải có phụ lục; lỗi hàng chuyển nhà cung cấp', async () => {
    await nv.post(`/api/lo-xuat/${ids.lx}/khieu-nai`).send({ loai: 'chat_luong', moTa: 'Độ ẩm vượt 13%' }).expect(400);
    // Đưa lô tới xếp tàu
    for (const p of (await tp.get(`/api/lo-xuat/${ids.lx}`).expect(200)).body.phanBo) await tp.post(`/api/phan-bo/${p.id}/duyet`).expect(200);
    await waiveDocs(ids.lx);
    const adv = (body: Record<string, unknown> = {}) => nv.post(`/api/lo-xuat/${ids.lx}/chuyen-buoc`).send(body).expect(200);
    await adv();
    await adv();
    await nv.post(`/api/lo-xuat/${ids.lx}/giam-dinh`).send({ ketQua: 'dat', donViGiamDinh: 'Vinacontrol' }).expect(200);
    await nv.put(`/api/lo-xuat/${ids.lx}/booking`).send({ hangTau: 'COSCO', soBooking: 'BKTT1', container: [{ so: 'CSNU7654321', chi: 'C-2' }] }).expect(200);
    await adv();
    await adv({ soVanDon: 'COSU-TT-01', ngayTauChay: '2026-11-20' });

    await qt.post(`/api/lo-xuat/${ids.lx}/khieu-nai`).send({ loai: 'chat_luong', moTa: 'Độ ẩm vượt 13%' }).expect(403);
    const k = await nv.post(`/api/lo-xuat/${ids.lx}/khieu-nai`).send({ loai: 'chat_luong', moTa: 'Người mua báo độ ẩm 13,6% khi dỡ hàng', soTienYeuCau: 2000, bangChung: 'Biên bản giám định cảng đến số CIQ-778' }).expect(201);
    expect(k.body.code).toMatch(/^KN-\d{4}-\d{4}$/);
    const own = (await tp.post(`/api/lo-xuat/${ids.lx}/khieu-nai`).send({ loai: 'chung_tu', moTa: 'Sai tên người nhận trên C/O' }).expect(201)).body.id;
    const self = await tp.post(`/api/khieu-nai/${own}/dong`).send({ loi: 'van_thuan', soTienGiamTru: 0, ketLuan: 'Đã cấp lại C/O' }).expect(403);
    expect(self.body.message).toMatch(/4 mắt/);
    await gd.post(`/api/khieu-nai/${own}/dong`).send({ loi: 'van_thuan', soTienGiamTru: 0, ketLuan: 'Đã cấp lại C/O, người mua chấp nhận' }).expect(204);

    const list = (await tp.get(`/api/lo-xuat/${ids.lx}/khieu-nai`).expect(200)).body;
    const open = list.khieuNai.find((c: { id: string }) => c.id === k.body.id);
    expect(open.goiY).toMatch(/Giám định cảng đi đạt/);
    expect(open.quyen.dong).toBe(true);
    expect(list.giamDinhCangDi).toBe('dat');
    expect(list.tienTe).toBe('USD');

    const close = (body: Record<string, unknown>, a: Agent = tp) => a.post(`/api/khieu-nai/${k.body.id}/dong`).send({ loi: 'ncc', soTienGiamTru: 1000, soPhuLuc: 'PL-01/HDB', ketLuan: 'Hàng ẩm từ kho nhà cung cấp, cà phê chưa sấy đủ', ...body });
    await close({}, nv).expect(403);
    await close({ soPhuLuc: null }).expect(400);
    await close({ soTienGiamTru: 2500 }).expect(400);
    await close({ loi: 'nguoi_mua' }).expect(400);
    await close({ loi: 'van_chuyen', loMuaChuyenId: ids.lm1, soTienChuyenNcc: 800 }).expect(400);
    await close({ loMuaChuyenId: ids.lm1, soTienChuyenNcc: 1200 }).expect(400);
    await close({ loMuaChuyenId: ids.lm1, soTienChuyenNcc: 800 }).expect(204);
    await close({}).expect(400);
    expect((await tp.get('/api/khieu-nai?trangThai=mo').expect(200)).body.khieuNai.filter((c: { exportLotId: string }) => c.exportLotId === ids.lx)).toEqual([]);

    // Kết luận ghi vào sổ cái của hợp đồng đối ứng
    const c = (await tp.get(`/api/hop-dong/${ids.ban}`).expect(200)).body;
    expect(c.ledger.filter((e: { event: string }) => e.event === 'khieu_nai').map((e: { note: string }) => e.note)).toEqual(
      expect.arrayContaining([expect.stringMatching(/lỗi nhà cung cấp, giảm trừ 1\.000 USD \(phụ lục PL-01\/HDB\)/)]),
    );
  });

  it('quyết toán chưa đủ điều kiện thì không lập được; danh sách điều kiện nói rõ còn thiếu gì', async () => {
    const s = await settle(ids.lx);
    const failed = (s.dieuKien as Cond[]).filter((d) => !d.dat).map((d) => d.ma);
    // Nhà cung cấp đã nhận 39.200 = 40.000 − 800 chuyển trách nhiệm: đạt
    expect(failed).toEqual(['chung_tu', 'nguoi_mua', 'phi', 'tai_tro']);
    // Phí trọn gói tính lại: 720 − 1.000 × 1,5% = 705; tiền phải trả nhà cung cấp 40.000 − 800
    expect(s.duThao.tongHop).toMatchObject({ phaiThuNguoiMuaUsd: 47000, phaiTraNccUsd: 39200, phiPhaiThuUsd: 705, phiThuXepVonPhaiThuUsd: 300 });
    expect(s.quyen.lap).toBe(false);
    const r = await ktv.post(`/api/lo-xuat/${ids.lx}/quyet-toan`).send({ bienDuToanPhanTram: 18 }).expect(400);
    expect(r.body.message).toMatch(/Chưa đủ điều kiện quyết toán: Bộ chứng từ hoàn tất/);
  });

  it('thu đủ, trả đủ, tất toán tài trợ; chi phí bằng VND quy USD theo tỷ giá thực tế', async () => {
    await plan(ids.lx, { loai: 'tien_hang_nguoi_mua', soTien: 48000 }).expect(201);
    const [b] = await pending(ids.lx, 'tien_hang_nguoi_mua');
    expect(b.denHan).toBe(false); // bộ chứng từ chưa hoàn tất
    await record(b.id, { soTien: 47000 }).expect(204);
    const [bRest] = await pending(ids.lx, 'tien_hang_nguoi_mua');
    await ktv.post(`/api/thanh-toan/${bRest.id}/huy`).send({ lyDo: 'Giảm trừ theo khiếu nại' }).expect(204);
    // Phần nhà cung cấp còn lại 800 đã chuyển trách nhiệm do khiếu nại: huỷ
    const [nRest] = await pending(ids.lx, 'tien_hang_ncc');
    expect(nRest.plannedAmount).toBe(800);
    await ktv.post(`/api/thanh-toan/${nRest.id}/huy`).send({ lyDo: 'Trừ theo khiếu nại KN' }).expect(204);

    // Phí trọn gói do nhà cung cấp trả: đề nghị thu phí phải được Kế toán trưởng duyệt
    const fees = (await ktt.get(`/api/de-nghi-thu-phi?loXuatId=${ids.lx}`).expect(200)).body.deNghi;
    expect(fees).toEqual([expect.objectContaining({ amount: 720, status: 'cho_duyet' })]);
    await ktt.post(`/api/de-nghi-thu-phi/${fees[0].id}/duyet`).expect(204);
    await plan(ids.lx, { loai: 'phi_tron_goi', loMuaId: ids.lm1, soTien: 705, moc: 'van_don' }).expect(201);
    const [fee] = await pending(ids.lx, 'phi_tron_goi');
    expect(fee.denHan).toBe(true);
    await record(fee.id, { soTien: 705 }).expect(204);

    const [finFee] = await pending(ids.lx, 'phi_thu_xep_von');
    await record(finFee.id, { soTien: 300 }).expect(204);

    await plan(ids.lx, { loai: 'chi_phi', hangMuc: 'cuoc_bien', soTien: 30480000, tienTe: 'VND', moc: 'van_don' }).expect(201);
    const [cost] = await pending(ids.lx, 'chi_phi');
    await record(cost.id, { soTien: 30480000 }).expect(400); // thiếu tỷ giá
    await record(cost.id, { soTien: 30480000, tyGia: 25400 }).expect(204);
    await record(cost.id, { soTien: 1, ngay: '2099-01-01' }).expect(400);

    // Trả ngân hàng gốc 30.000 và lãi 250: khoản tài trợ tất toán
    const [repay] = await pending(ids.lx, 'tra_ngan_hang');
    await record(repay.id, { soTien: 30250 }).expect(204);
    expect((await pay(ids.lx)).taiTro).toEqual([expect.objectContaining({ status: 'da_tat_toan', repaidOn: '2026-11-25' })]);
  });

  it('đủ điều kiện: kế toán lập, Kế toán trưởng duyệt, Giám đốc duyệt thêm khi biên thấp hơn dự toán quá 10%; duyệt xong khoá số liệu', async () => {
    await complete(ids.lx);
    const s = await settle(ids.lx);
    expect((s.dieuKien as Cond[]).every((d) => d.dat)).toBe(true);
    // 47.000 − 39.200 + 705 + 300 − 1.200 − 250 = 7.355 USD
    expect(s.duThao.bienUsd).toBe(7355);
    expect(s.duThao.bienPhanTram).toBe(15.649);
    expect(s.duToan).toBeNull();
    expect(s.quyen).toEqual({ lap: true, canNhapDuToan: true });
    await nv.post(`/api/lo-xuat/${ids.lx}/quyet-toan`).send({ bienDuToanPhanTram: 18 }).expect(403);
    const noEst = await ktv.post(`/api/lo-xuat/${ids.lx}/quyet-toan`).send({}).expect(400);
    expect(noEst.body.message).toMatch(/ghi biên dự toán/);
    const p = await ktv.post(`/api/lo-xuat/${ids.lx}/quyet-toan`).send({ bienDuToanPhanTram: 18, ghiChu: 'Theo phương án kinh doanh lô đầu' }).expect(201);
    expect(p.body).toEqual({ id: expect.any(String), canGiamDoc: true, lyDo: expect.stringMatching(/thấp hơn dự toán 18% là 13,1%|thấp hơn dự toán 18% là 13.1%/) });
    await ktv.post(`/api/lo-xuat/${ids.lx}/quyet-toan`).send({ bienDuToanPhanTram: 18 }).expect(400);

    // Đang chờ duyệt: số liệu bị khoá
    const locked = await plan(ids.lx, { loai: 'chi_phi', hangMuc: 'khac', soTien: 10 }).expect(400);
    expect(locked.body.message).toMatch(/đang chờ duyệt quyết toán/);
    expect((await pay(ids.lx)).khoa).toBe(true);

    await ktv.post(`/api/quyet-toan/${p.body.id}/duyet`).expect(403);
    await gd.post(`/api/quyet-toan/${p.body.id}/duyet`).expect(403); // chưa tới bước Giám đốc
    expect((await ktt.get('/api/quyet-toan?trangThai=cho_ktt').expect(200)).body.quyetToan.find((x: { id: string }) => x.id === p.body.id).quyen.duyet).toBe(true);
    await ktt.post(`/api/quyet-toan/${p.body.id}/duyet`).expect(204);
    const mid = (await settle(ids.lx, gd)).banQuyetToan[0];
    expect(mid).toMatchObject({ status: 'cho_gd', needsDirector: true, quyen: { duyet: true, traLai: true } });
    await ktt.post(`/api/quyet-toan/${p.body.id}/duyet`).expect(403);
    await gd.post(`/api/quyet-toan/${p.body.id}/duyet`).expect(204);
    await gd.post(`/api/quyet-toan/${p.body.id}/duyet`).expect(400);

    const done = (await settle(ids.lx)).banQuyetToan[0];
    expect(done).toMatchObject({ status: 'da_duyet', marginUsd: 7355, estimateMarginPct: 18, estimateSource: 'nhap_tay' });
    const c = (await tp.get(`/api/hop-dong/${ids.ban}`).expect(200)).body;
    expect(c.ledger.at(-1)).toMatchObject({ event: 'quyet_toan', contentHash: done.contentHash });
    const after = await plan(ids.lx, { loai: 'chi_phi', hangMuc: 'khac', soTien: 10 }).expect(400);
    expect(after.body.message).toMatch(/đã quyết toán/);

    const pool = app.get<Pool>(PG_POOL);
    await expect(pool.query(`update settlements set margin_usd = 1 where id = $1`, [p.body.id])).rejects.toThrow(/không sửa được/);
    await expect(pool.query(`delete from settlements where id = $1`, [p.body.id])).rejects.toThrow(/không được xoá/);
  });

  it('môi giới: Vạn Thuận không thu chi tiền hàng; nhà cung cấp xác nhận đã nhận trên cổng; trả lại thì lập lại', async () => {
    ids.lx2 = await shippedLot(ids.tt, ids.lm2, 10000, 'COSU-MG-01');
    await plan(ids.lx2, { loai: 'tien_hang_nguoi_mua', soTien: 48000 }).expect(400);
    await plan(ids.lx2, { loai: 'tien_hang_truc_tiep', loMuaId: ids.lm2, soTien: 48000 }).expect(201);
    const [direct] = await pending(ids.lx2, 'tien_hang_truc_tiep');
    expect(direct.quyen.ghiNhan).toBe(false);
    await record(direct.id, { soTien: 48000 }).expect(403);

    const email = uniqueEmail('ncc2tt');
    const inv = await nv.post(`/api/doi-tac/${ncc2}/tai-khoan-cong`).send({ email, hoTen: 'Kế toán NCC 2' }).expect(201);
    const s2 = (await fullFirstLogin(app, { email, password: inv.body.matKhauTam })).agent;
    await nv.get('/api/cong/thanh-toan').expect(403);
    const mine = (await s2.get('/api/cong/thanh-toan').expect(200)).body.khoan;
    expect(mine).toEqual([expect.objectContaining({ id: direct.id, plannedAmount: 48000, coTheXacNhan: true })]);
    await s2.get(`/api/lo-xuat/${ids.lx2}/thanh-toan`).expect(403);
    await s2.post(`/api/cong/thanh-toan/${direct.id}/da-nhan`).send({ soTien: 48000, ngay: '2026-11-24', soThamChieu: 'TT-VCB-9981' }).expect(204);
    await s2.post(`/api/cong/thanh-toan/${direct.id}/da-nhan`).send({ soTien: 48000, ngay: '2026-11-24' }).expect(400);

    const fee = (await ktt.get(`/api/de-nghi-thu-phi?loXuatId=${ids.lx2}`).expect(200)).body.deNghi[0];
    expect(fee.amount).toBe(960);
    await ktt.post(`/api/de-nghi-thu-phi/${fee.id}/duyet`).expect(204);
    await plan(ids.lx2, { loai: 'phi_tron_goi', loMuaId: ids.lm2, soTien: 960, moc: 'van_don' }).expect(201);
    await record((await pending(ids.lx2, 'phi_tron_goi'))[0].id, { soTien: 960 }).expect(204);
    await complete(ids.lx2);

    const s = await settle(ids.lx2);
    expect((s.dieuKien as Cond[]).every((d) => d.dat)).toBe(true);
    expect(s.duThao).toMatchObject({ bienUsd: 960, bienPhanTram: 2 });
    expect(s.duThao.dong.map((d: { ma: string }) => d.ma)).toEqual(['phi_tron_goi']);

    const p1 = (await ktt.post(`/api/lo-xuat/${ids.lx2}/quyet-toan`).send({ bienDuToanPhanTram: 2 }).expect(201)).body;
    expect(p1.canGiamDoc).toBe(false);
    const self = await ktt.post(`/api/quyet-toan/${p1.id}/duyet`).expect(403);
    expect(self.body.message).toMatch(/4 mắt/);
    await ktt2.post(`/api/quyet-toan/${p1.id}/tra-lai`).send({ lyDo: 'Đính kèm sao kê ngân hàng' }).expect(204);
    await ktt2.post(`/api/quyet-toan/${p1.id}/duyet`).expect(400);
    // Bị trả lại thì mở khoá, lập lại được
    expect((await pay(ids.lx2)).khoa).toBe(false);
    const p2 = (await ktv.post(`/api/lo-xuat/${ids.lx2}/quyet-toan`).send({ bienDuToanPhanTram: 2 }).expect(201)).body;
    await ktt.post(`/api/quyet-toan/${p2.id}/duyet`).expect(204);
    const list = (await settle(ids.lx2)).banQuyetToan.map((b: { status: string }) => b.status);
    expect(list).toEqual(['da_duyet', 'tra_lai']);
  });
});

import { INestApplication } from '@nestjs/common';
import { codeFor, createUser, fullFirstLogin, startApp } from './helpers';

type Agent = Awaited<ReturnType<typeof fullFirstLogin>>['agent'];

const ago = (days: number) => new Date(Date.now() + 7 * 3600e3 - days * 864e5).toISOString().slice(0, 10);
const terms = (soLuong: number, over: Record<string, unknown> = {}) => ({
  soLuong,
  donVi: 'tan',
  dungSaiPhanTram: 5,
  donGia: 4800,
  tienTe: 'USD',
  tyGiaUsd: null,
  incoterms: 'FOB',
  cangDi: 'Cát Lái',
  cangDen: 'Hamburg',
  lichGiao: 'Tháng 2/2027',
  dieuKhoanThanhToan: 'Trả chậm sau ngày tàu chạy',
  tyLePhiPhanTram: null,
  ghiChu: null,
  ...over,
});

describe('Công nợ và hạn mức nợ người mua', () => {
  let app: INestApplication;
  let nv: Agent;
  let tp: Agent;
  let ktt: Agent;
  let gd: Agent;
  let buyer: string;
  let mh: string;
  let n = 0;

  async function partner(roles: string[], country: string) {
    const res = await nv.post('/api/doi-tac').send({ code: `CN${Date.now() % 100000}${++n}`, name: `Người mua CN ${n}`, country, category: 'nha_nhap_khau', roles }).expect(201);
    const id = res.body.id as string;
    await nv.post(`/api/doi-tac/${id}/tai-lieu`).send({ docType: 'Giấy đăng ký kinh doanh', number: `DK${n}` }).expect(201);
    await nv.post(`/api/doi-tac/${id}/trinh-tham-dinh`).send({ riskRating: 'thap', screeningNote: 'Không có trong danh sách trừng phạt' }).expect(200);
    await tp.post(`/api/doi-tac/${id}/quyet-dinh-tham-dinh`).send({ dongY: true }).expect(200);
    return id;
  }
  const draft = async (dk: Record<string, unknown>) => (await nv.post('/api/hop-dong').send({ matHangId: mh, loai: 'ban', benMuaId: buyer, dieuKhoan: dk }).expect(201)).body.id as string;
  async function sign(id: string) {
    const g = await fullFirstLogin(app, await createUser(app, ['GIAM_DOC'], 'cngd'));
    await g.agent.post(`/api/hop-dong/${id}/ky`).send({ ma2Lop: codeFor(g.secret, 1) }).expect(200);
  }

  beforeAll(async () => {
    app = await startApp();
    nv = (await fullFirstLogin(app, await createUser(app, ['NHAN_VIEN_KD'], 'cnnv'))).agent;
    tp = (await fullFirstLogin(app, await createUser(app, ['TRUONG_PHONG_KD'], 'cntp'))).agent;
    ktt = (await fullFirstLogin(app, await createUser(app, ['KE_TOAN_TRUONG'], 'cnktt'))).agent;
    gd = (await fullFirstLogin(app, await createUser(app, ['GIAM_DOC'], 'cngd'))).agent;
    buyer = await partner(['nguoi_mua'], 'DE');
    mh = (await tp.post('/api/danh-muc/mat-hang').send({ code: `CN${Date.now() % 100000}`, name: 'Cà phê Robusta S18', sector: 'ca_phe', hsCode: '090111' }).expect(201)).body.id;
  });

  afterAll(async () => {
    await app.close();
  });

  it('chưa có hạn mức thì không trình ký hợp đồng trả chậm; hợp đồng trả theo chứng từ vẫn được', async () => {
    const c = await draft(terms(40, { traChamNgay: 30 }));
    const r = await nv.post(`/api/hop-dong/${c}/trinh-ky`).expect(400);
    expect(JSON.stringify(r.body)).toContain('chưa có hạn mức');
    const thuong = await draft(terms(10));
    await nv.post(`/api/hop-dong/${thuong}/trinh-ky`).expect(200);
  });

  it('Kế toán trưởng đề xuất, Giám đốc duyệt hạn mức; người khác không làm được', async () => {
    await nv.get('/api/cong-no').expect(403);
    await nv.post(`/api/cong-no/${buyer}/han-muc`).send({ hanMucUsd: 200000, soNgayToiDa: 45, lyDo: 'Khách quen' }).expect(403);
    const p = (await ktt.post(`/api/cong-no/${buyer}/han-muc`).send({ hanMucUsd: 200000, soNgayToiDa: 45, lyDo: 'Nhà nhập khẩu lâu năm, báo cáo tài chính tốt' }).expect(201)).body.id;
    await ktt.post(`/api/cong-no/${buyer}/han-muc`).send({ hanMucUsd: 300000, soNgayToiDa: 45, lyDo: 'Đề xuất lần hai' }).expect(400);
    await ktt.post(`/api/cong-no/han-muc/${p}/quyet-dinh`).send({ dongY: true }).expect(403);
    await gd.post(`/api/cong-no/han-muc/${p}/quyet-dinh`).send({ dongY: false }).expect(400);
    await gd.post(`/api/cong-no/han-muc/${p}/quyet-dinh`).send({ dongY: true, ghiChu: 'Đồng ý' }).expect(200);
    await gd.post(`/api/cong-no/han-muc/${p}/quyet-dinh`).send({ dongY: true }).expect(400);
    const d = (await ktt.get(`/api/cong-no/${buyer}`).expect(200)).body;
    expect(d.hanMuc).toEqual({ amountUsd: 200000, maxDays: 45 });
    expect(d.lichSuHanMuc[0]).toMatchObject({ status: 'da_duyet', decisionNote: 'Đồng ý' });
  });

  it('trả chậm trong hạn mức thì trình ký được; vượt hạn mức hoặc vượt số ngày thì không', async () => {
    const lau = await draft(terms(10, { traChamNgay: 60 }));
    expect(JSON.stringify((await nv.post(`/api/hop-dong/${lau}/trinh-ky`).expect(400)).body)).toContain('60 ngày vượt');
    const a = await draft(terms(40, { traChamNgay: 30 })); // 192.000 USD
    await nv.post(`/api/hop-dong/${a}/trinh-ky`).expect(200);
    const b = await draft(terms(20, { traChamNgay: 30 })); // 96.000 USD
    expect(JSON.stringify((await nv.post(`/api/hop-dong/${b}/trinh-ky`).expect(400)).body)).toContain('Vượt hạn mức');
    const list = (await ktt.get('/api/cong-no').expect(200)).body;
    const row = list.nguoiMua.find((x: { id: string }) => x.id === buyer);
    expect(row).toMatchObject({ duNo: 192000, hopDongChoLenLich: 192000, conLai: 8000, biChan: false });
    await sign(a);
  });

  it('nợ quá hạn trên 30 ngày thì chặn hợp đồng trả chậm mới', async () => {
    const list = (await ktt.get('/api/cong-no').expect(200)).body;
    expect(list.nguoiMua.find((x: { id: string }) => x.id === buyer).duNo).toBe(192000);
    // hợp đồng trả chậm đã ký: lập lô và lịch thu, một khoản đã quá hạn 40 ngày
    const usable = (await nv.get('/api/lo-mua/hop-dong-kha-dung').expect(200)).body.choLoXuat;
    const ky = usable.find((x: { buyerName: string; kind: string }) => x.kind === 'ban');
    const lx = (await nv.post('/api/lo-xuat').send({ hopDongDoiUngId: ky.id, thiTruong: 'EU' }).expect(201)).body.id;
    await ktt.post(`/api/lo-xuat/${lx}/thanh-toan`).send({ loai: 'tien_hang_nguoi_mua', moc: 'ngay', ngayDenHan: ago(40), soTien: 50000, tienTe: 'USD' }).expect(201);
    await ktt.post(`/api/lo-xuat/${lx}/thanh-toan`).send({ loai: 'tien_hang_nguoi_mua', moc: 'ngay', ngayDenHan: ago(-20), soTien: 142000, tienTe: 'USD' }).expect(201);
    const d = (await ktt.get(`/api/cong-no/${buyer}`).expect(200)).body;
    expect(d.duNo).toBe(192000);
    expect(d.hopDongChoLenLich).toEqual([]);
    expect(d.tuoiNo.buckets).toMatchObject({ qua_31_60: 50000, chua_den_han: 142000 });
    expect(d.biChan).toBe(true);
    expect(d.khoanPhaiThu[0]).toMatchObject({ soNgayQuaHan: 40, amountUsd: 50000 });
    const c = await draft(terms(1, { traChamNgay: 30 }));
    expect(JSON.stringify((await nv.post(`/api/hop-dong/${c}/trinh-ky`).expect(400)).body)).toContain('quá hạn 40 ngày');
    // hợp đồng thanh toán theo chứng từ vẫn ký được
    const t = await draft(terms(1));
    await nv.post(`/api/hop-dong/${t}/trinh-ky`).expect(200);
  });
});

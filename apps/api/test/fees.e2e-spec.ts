import { INestApplication } from '@nestjs/common';
import { codeFor, createUser, fullFirstLogin, startApp } from './helpers';

type Agent = Awaited<ReturnType<typeof fullFirstLogin>>['agent'];
type Login = { agent: Agent; secret: string; id: string };

const terms = (over: Record<string, unknown> = {}) => ({
  soLuong: 19200,
  donVi: 'kg',
  dungSaiPhanTram: 5,
  donGia: 118000,
  tienTe: 'VND',
  tyGiaUsd: 25400,
  incoterms: 'EXW',
  cangDi: null,
  cangDen: null,
  lichGiao: 'Giao tại kho trước 15/01/2027',
  dieuKhoanThanhToan: 'Trả khi giao hàng',
  tyLePhiPhanTram: 1.5,
  ghiChu: null,
  ...over,
});

describe('Phí trọn gói: mức sàn, duyệt khi dưới sàn, gợi ý tỷ lệ', () => {
  let app: INestApplication;
  let nv: Login;
  let tp: Login;
  let ktt: Login;
  let pgd: Login;
  let ncc: string;
  let nguoiMua: string;
  let matHang: string;
  let n = 0;

  async function login(roles: Parameters<typeof createUser>[1], prefix: string): Promise<Login> {
    const u = await createUser(app, roles, prefix);
    const { agent, secret } = await fullFirstLogin(app, u);
    return { agent, secret, id: u.id };
  }

  async function partner(roles: string[]) {
    const res = await nv.agent
      .post('/api/doi-tac')
      .send({ code: `PH${Date.now() % 100000}${++n}`, name: `Đối tác phí ${n}`, country: 'VN', category: 'doanh_nghiep_thuong_mai', roles })
      .expect(201);
    const id = res.body.id as string;
    await nv.agent.post(`/api/doi-tac/${id}/tai-lieu`).send({ docType: 'Giấy đăng ký kinh doanh', number: `DK${n}` }).expect(201);
    await nv.agent.post(`/api/doi-tac/${id}/trinh-tham-dinh`).send({ riskRating: 'thap', screeningNote: 'Không có trong danh sách trừng phạt' }).expect(200);
    await tp.agent.post(`/api/doi-tac/${id}/quyet-dinh-tham-dinh`).send({ dongY: true }).expect(200);
    return id;
  }

  async function submitted(over: Record<string, unknown> = {}, body: Record<string, unknown> = {}) {
    const res = await nv.agent
      .post('/api/hop-dong')
      .send({ loai: 'mua', benBanId: ncc, matHangId: matHang, dieuKhoan: terms(over), ...body })
      .expect(201);
    await nv.agent.post(`/api/hop-dong/${res.body.id}/trinh-ky`).expect(200);
    return res.body.id as string;
  }

  /** Mỗi lần ký dùng một Giám đốc mới để mã 2 lớp không bị trùng. */
  async function signAsNewDirector(id: string) {
    const gd = await login(['GIAM_DOC'], 'gdphi');
    return gd.agent.post(`/api/hop-dong/${id}/ky`).send({ ma2Lop: codeFor(gd.secret, 1) });
  }

  beforeAll(async () => {
    app = await startApp();
    nv = await login(['NHAN_VIEN_KD'], 'nvphi');
    tp = await login(['TRUONG_PHONG_KD'], 'tpphi');
    ktt = await login(['KE_TOAN_TRUONG'], 'kttphi');
    pgd = await login(['PHO_GIAM_DOC'], 'pgdphi');
    ncc = await partner(['nha_cung_cap']);
    nguoiMua = await partner(['nguoi_mua']);
    const mh = await tp.agent
      .post('/api/danh-muc/mat-hang')
      .send({ code: `TIEU${Date.now() % 100000}`, name: 'Hồ tiêu đen', sector: 'gia_vi' })
      .expect(201);
    matHang = mh.body.id;
  });
  afterAll(async () => {
    await pgd.agent.put('/api/phi/muc-san').send({ sanTyLePhi: null }).expect(200);
    await app.close();
  });

  it('hợp đồng mang phí phải có tỷ lệ phí mới trình ký được; hợp đồng bán thì không cần', async () => {
    const res = await nv.agent
      .post('/api/hop-dong')
      .send({ loai: 'mua', benBanId: ncc, matHangId: matHang, dieuKhoan: terms({ tyLePhiPhanTram: null }) })
      .expect(201);
    const bad = await nv.agent.post(`/api/hop-dong/${res.body.id}/trinh-ky`).expect(400);
    expect(bad.body.message).toMatch(/tỷ lệ phí trọn gói/);

    const ban = await nv.agent
      .post('/api/hop-dong')
      .send({ loai: 'ban', benMuaId: nguoiMua, matHangId: matHang, dieuKhoan: terms({ tyLePhiPhanTram: null, tienTe: 'USD', donGia: 4.85, tyGiaUsd: null }) })
      .expect(201);
    await nv.agent.post(`/api/hop-dong/${ban.body.id}/trinh-ky`).expect(200);
    const detail = await nv.agent.get(`/api/hop-dong/${ban.body.id}`).expect(200);
    expect(detail.body.phi).toBeNull();
  });

  it('chỉ Ban Giám đốc đặt mức sàn; ai đăng nhập cũng xem được', async () => {
    await nv.agent.put('/api/phi/muc-san').send({ sanTyLePhi: 1 }).expect(403);
    await tp.agent.put('/api/phi/muc-san').send({ sanTyLePhi: 1 }).expect(403);
    await ktt.agent.put('/api/phi/muc-san').send({ sanTyLePhi: 1 }).expect(403);
    await pgd.agent.put('/api/phi/muc-san').send({ sanTyLePhi: -1 }).expect(400);
    await pgd.agent.put('/api/phi/muc-san').send({ sanTyLePhi: 1.2 }).expect(200);
    const res = await nv.agent.get('/api/phi/muc-san').expect(200);
    expect(res.body.sanTyLePhi).toBe(1.2);
  });

  it('phí dưới sàn: chặn ký tới khi Ban Giám đốc duyệt; người trình không tự duyệt', async () => {
    const id = await submitted({ tyLePhiPhanTram: 0.8 });
    const detail = await nv.agent.get(`/api/hop-dong/${id}`).expect(200);
    expect(detail.body.phi).toEqual({ tyLe: 0.8, san: 1.2, duoiSan: true, daDuyet: false });
    expect(detail.body.quyen.duyetPhi).toBe(false);

    const blocked = await signAsNewDirector(id);
    expect(blocked.status).toBe(403);
    expect(blocked.body.message).toMatch(/thấp hơn mức sàn/);

    await nv.agent.post(`/api/hop-dong/${id}/duyet-phi`).send({}).expect(403);
    await tp.agent.post(`/api/hop-dong/${id}/duyet-phi`).send({}).expect(403);
    const pv = await pgd.agent.get(`/api/hop-dong/${id}`).expect(200);
    expect(pv.body.quyen.duyetPhi).toBe(true);
    await pgd.agent.post(`/api/hop-dong/${id}/duyet-phi`).send({ ghiChu: 'Khách hàng chiến lược, lô đầu' }).expect(200);
    await pgd.agent.post(`/api/hop-dong/${id}/duyet-phi`).send({}).expect(400);

    const after = await nv.agent.get(`/api/hop-dong/${id}`).expect(200);
    expect(after.body.phi.daDuyet).toBe(true);
    const entry = after.body.ledger.at(-1);
    expect(entry.event).toBe('duyet_phi');
    expect(entry.note).toMatch(/0\.8% dưới sàn 1\.2%: Khách hàng chiến lược/);

    const ok = await signAsNewDirector(id);
    expect(ok.status).toBe(200);
  });

  it('Giám đốc tự trình thì không tự duyệt phí của mình (nguyên tắc 4 mắt)', async () => {
    const gdKd = await login(['GIAM_DOC', 'TRUONG_PHONG_KD'], 'gdkdphi');
    const res = await gdKd.agent
      .post('/api/hop-dong')
      .send({ loai: 'mua', benBanId: ncc, matHangId: matHang, dieuKhoan: terms({ tyLePhiPhanTram: 0.5 }) })
      .expect(201);
    await gdKd.agent.post(`/api/hop-dong/${res.body.id}/trinh-ky`).expect(200);
    const r = await gdKd.agent.post(`/api/hop-dong/${res.body.id}/duyet-phi`).send({}).expect(403);
    expect(r.body.message).toMatch(/4 mắt/);
  });

  it('duyệt phí gắn với nội dung: trả lại sửa phí thì phải duyệt lại', async () => {
    const id = await submitted({ tyLePhiPhanTram: 1 });
    await pgd.agent.post(`/api/hop-dong/${id}/duyet-phi`).send({}).expect(200);
    const gd = await login(['GIAM_DOC'], 'gdtl');
    await gd.agent.post(`/api/hop-dong/${id}/tra-lai`).send({ lyDo: 'Hạ thêm phí theo đàm phán' }).expect(200);
    await nv.agent.put(`/api/hop-dong/${id}/dieu-khoan`).send(terms({ tyLePhiPhanTram: 0.9 })).expect(200);
    await nv.agent.post(`/api/hop-dong/${id}/trinh-ky`).expect(200);
    const detail = await nv.agent.get(`/api/hop-dong/${id}`).expect(200);
    expect(detail.body.phi.daDuyet).toBe(false);
    const blocked = await gd.agent.post(`/api/hop-dong/${id}/ky`).send({ ma2Lop: codeFor(gd.secret, 1) });
    expect(blocked.status).toBe(403);
  });

  it('phí bằng hoặc trên sàn: không cần duyệt, không duyệt được', async () => {
    const id = await submitted({ tyLePhiPhanTram: 1.2 });
    const r = await pgd.agent.post(`/api/hop-dong/${id}/duyet-phi`).send({}).expect(400);
    expect(r.body.message).toMatch(/không cần duyệt/);
    const ok = await signAsNewDirector(id);
    expect(ok.status).toBe(200);
  });

  it('gợi ý tỷ lệ từ các hợp đồng đã ký cùng mặt hàng; chỉ trả số thống kê', async () => {
    const id = await submitted({ tyLePhiPhanTram: 2 });
    expect((await signAsNewDirector(id)).status).toBe(200);
    const res = await nv.agent.get(`/api/phi/goi-y?matHangId=${matHang}`).expect(200);
    // Đã ký: 0.8 (đã duyệt), 1.2, 2
    expect(res.body).toEqual({ soHopDong: 3, trungBinh: 1.333, trungVi: 1.2, thapNhat: 0.8, caoNhat: 2, san: 1.2 });
    const none = await nv.agent.get(`/api/phi/goi-y?matHangId=00000000-0000-0000-0000-000000000000`).expect(200);
    expect(none.body.soHopDong).toBe(0);
    await ktt.agent.get('/api/phi/goi-y').expect(403);
  });

  it('bỏ mức sàn thì không còn cần duyệt', async () => {
    await pgd.agent.put('/api/phi/muc-san').send({ sanTyLePhi: null }).expect(200);
    const id = await submitted({ tyLePhiPhanTram: 0.3 });
    const detail = await nv.agent.get(`/api/hop-dong/${id}`).expect(200);
    expect(detail.body.phi).toMatchObject({ san: null, duoiSan: false });
  });
});

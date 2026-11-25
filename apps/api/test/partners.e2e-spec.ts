import { INestApplication } from '@nestjs/common';
import { createUser, fullFirstLogin, startApp } from './helpers';

type Agent = Awaited<ReturnType<typeof fullFirstLogin>>['agent'];

describe('Đối tác và thẩm định', () => {
  let app: INestApplication;
  let nv: Agent;
  let nv2: Agent;
  let tp: Agent;
  let gd: Agent;
  let qt: Agent;
  let n = 0;
  const code = () => `NCC${Date.now() % 100000}${++n}`;

  beforeAll(async () => {
    app = await startApp();
    nv = (await fullFirstLogin(app, await createUser(app, ['NHAN_VIEN_KD']))).agent;
    nv2 = (await fullFirstLogin(app, await createUser(app, ['NHAN_VIEN_KD']))).agent;
    tp = (await fullFirstLogin(app, await createUser(app, ['TRUONG_PHONG_KD'], 'tp'))).agent;
    gd = (await fullFirstLogin(app, await createUser(app, ['GIAM_DOC'], 'gd'))).agent;
    qt = (await fullFirstLogin(app, await createUser(app, ['QUAN_TRI_HE_THONG'], 'qt'))).agent;
  });
  afterAll(async () => {
    await app.close();
  });

  async function newPartner(agent: Agent, extra: Record<string, unknown> = {}) {
    const res = await agent
      .post('/api/doi-tac')
      .send({ code: code(), name: 'HTX Cà phê Ea Tu', country: 'vn', taxCode: '6001234567', category: 'htx', roles: ['nha_cung_cap'], ...extra })
      .expect(201);
    return res.body.id as string;
  }

  it('nhân viên tạo đối tác; mặc định là người phụ trách, trạng thái nháp', async () => {
    const id = await newPartner(nv);
    const res = await nv.get(`/api/doi-tac/${id}`).expect(200);
    expect(res.body.kycStatus).toBe('nhap');
    expect(res.body.country).toBe('VN');
    expect(res.body.roles).toEqual(['nha_cung_cap']);
  });

  it('không cho trùng mã đối tác', async () => {
    const c = code();
    await nv.post('/api/doi-tac').send({ code: c, name: 'A B', country: 'VN', category: 'htx', roles: ['nha_cung_cap'] }).expect(201);
    await nv.post('/api/doi-tac').send({ code: c, name: 'A C', country: 'VN', category: 'htx', roles: ['nha_cung_cap'] }).expect(409);
  });

  it('nhân viên chỉ sửa được đối tác mình phụ trách; trưởng phòng sửa được tất cả', async () => {
    const id = await newPartner(nv);
    await nv2.patch(`/api/doi-tac/${id}`).send({ address: 'Đắk Lắk' }).expect(403);
    await tp.patch(`/api/doi-tac/${id}`).send({ address: 'Buôn Ma Thuột, Đắk Lắk' }).expect(200);
  });

  it('quản trị hệ thống không xem được đối tác', async () => {
    await qt.get('/api/doi-tac').expect(403);
  });

  it('không trình thẩm định khi chưa có tài liệu', async () => {
    const id = await newPartner(nv);
    const res = await nv.post(`/api/doi-tac/${id}/trinh-tham-dinh`).send({ riskRating: 'thap', screeningNote: 'Không có trong danh sách trừng phạt' }).expect(400);
    expect(res.body.message).toMatch(/tài liệu/);
  });

  it('quy trình thẩm định: trình → người khác duyệt → đạt, có hạn 12 tháng', async () => {
    const id = await newPartner(nv);
    await nv.post(`/api/doi-tac/${id}/tai-lieu`).send({ docType: 'Giấy đăng ký HTX', number: '40A8001234', issuedOn: '2020-03-01' }).expect(201);
    await nv.post(`/api/doi-tac/${id}/trinh-tham-dinh`).send({ riskRating: 'thap', screeningNote: 'Đã tra danh sách trừng phạt, không trùng' }).expect(200);
    // Nhân viên không có quyền duyệt
    await nv.post(`/api/doi-tac/${id}/quyet-dinh-tham-dinh`).send({ dongY: true }).expect(403);
    await tp.post(`/api/doi-tac/${id}/quyet-dinh-tham-dinh`).send({ dongY: true }).expect(200);
    const res = await nv.get(`/api/doi-tac/${id}`).expect(200);
    expect(res.body.kycStatus).toBe('dat');
    const months = (new Date(res.body.kycExpiresAt).getTime() - Date.now()) / (30.4 * 24 * 3600 * 1000);
    expect(Math.round(months)).toBe(12);
  });

  it('người trình không tự duyệt được (nguyên tắc 4 mắt)', async () => {
    const id = await newPartner(tp);
    await tp.post(`/api/doi-tac/${id}/tai-lieu`).send({ docType: 'ĐKKD', number: '1' }).expect(201);
    await tp.post(`/api/doi-tac/${id}/trinh-tham-dinh`).send({ riskRating: 'trung_binh', screeningNote: 'Đã tra cứu, không trùng' }).expect(200);
    const res = await tp.post(`/api/doi-tac/${id}/quyet-dinh-tham-dinh`).send({ dongY: true }).expect(403);
    expect(res.body.message).toMatch(/4 mắt/);
  });

  it('rủi ro cao: trưởng phòng không duyệt được, Giám đốc duyệt, hạn 6 tháng', async () => {
    const id = await newPartner(nv, { roles: ['nguoi_mua'], category: 'nha_nhap_khau', country: 'CN' });
    await nv.post(`/api/doi-tac/${id}/tai-lieu`).send({ docType: 'Business licence', number: 'X1' }).expect(201);
    await nv.post(`/api/doi-tac/${id}/trinh-tham-dinh`).send({ riskRating: 'cao', screeningNote: 'Người mua mới, chưa có lịch sử giao dịch' }).expect(200);
    await tp.post(`/api/doi-tac/${id}/quyet-dinh-tham-dinh`).send({ dongY: true }).expect(403);
    await gd.post(`/api/doi-tac/${id}/quyet-dinh-tham-dinh`).send({ dongY: true }).expect(200);
    const res = await gd.get(`/api/doi-tac/${id}`).expect(200);
    const months = (new Date(res.body.kycExpiresAt).getTime() - Date.now()) / (30.4 * 24 * 3600 * 1000);
    expect(Math.round(months)).toBe(6);
  });

  it('từ chối phải có lý do; bị từ chối thì trình lại được', async () => {
    const id = await newPartner(nv);
    await nv.post(`/api/doi-tac/${id}/tai-lieu`).send({ docType: 'ĐKKD', number: '2' }).expect(201);
    await nv.post(`/api/doi-tac/${id}/trinh-tham-dinh`).send({ riskRating: 'thap', screeningNote: 'Đã tra cứu' }).expect(200);
    await tp.post(`/api/doi-tac/${id}/quyet-dinh-tham-dinh`).send({ dongY: false }).expect(400);
    await tp.post(`/api/doi-tac/${id}/quyet-dinh-tham-dinh`).send({ dongY: false, lyDo: 'Thiếu chứng nhận VietGAP' }).expect(200);
    const res = await nv.get(`/api/doi-tac/${id}`).expect(200);
    expect(res.body.kycStatus).toBe('tu_choi');
    expect(res.body.kycRejectReason).toBe('Thiếu chứng nhận VietGAP');
    await nv.post(`/api/doi-tac/${id}/trinh-tham-dinh`).send({ riskRating: 'thap', screeningNote: 'Đã bổ sung VietGAP' }).expect(200);
  });

  it('đổi tên hoặc mã số thuế sau khi đã duyệt thì phải thẩm định lại', async () => {
    const id = await newPartner(nv);
    await nv.post(`/api/doi-tac/${id}/tai-lieu`).send({ docType: 'ĐKKD', number: '3' }).expect(201);
    await nv.post(`/api/doi-tac/${id}/trinh-tham-dinh`).send({ riskRating: 'thap', screeningNote: 'Đã tra cứu' }).expect(200);
    await tp.post(`/api/doi-tac/${id}/quyet-dinh-tham-dinh`).send({ dongY: true }).expect(200);
    await nv.patch(`/api/doi-tac/${id}`).send({ address: 'Địa chỉ mới' }).expect(200);
    expect((await nv.get(`/api/doi-tac/${id}`)).body.kycStatus).toBe('dat');
    await nv.patch(`/api/doi-tac/${id}`).send({ taxCode: '6009999999' }).expect(200);
    expect((await nv.get(`/api/doi-tac/${id}`)).body.kycStatus).toBe('nhap');
  });

  it('huỷ tài liệu (không xoá) và liệt kê tài liệu sắp hết hạn', async () => {
    const id = await newPartner(nv);
    const soon = new Date(Date.now() + 10 * 24 * 3600 * 1000).toISOString().slice(0, 10);
    const doc = await nv.post(`/api/doi-tac/${id}/tai-lieu`).send({ docType: 'HACCP', number: 'H-1', issuedOn: '2024-01-01', expiresOn: soon }).expect(201);
    await nv.post(`/api/doi-tac/${id}/tai-lieu`).send({ docType: 'X', issuedOn: '2025-01-02', expiresOn: '2025-01-01' }).expect(400);
    const exp = await nv.get('/api/doi-tac/sap-het-han?ngay=30').expect(200);
    expect(exp.body.taiLieu.some((d: { id: string }) => d.id === doc.body.id)).toBe(true);

    await nv.post(`/api/doi-tac/${id}/tai-lieu/${doc.body.id}/huy`).send({ lyDo: 'Nhập nhầm số' }).expect(200);
    const detail = await nv.get(`/api/doi-tac/${id}`).expect(200);
    expect(detail.body.documents[0].voidReason).toBe('Nhập nhầm số');
    const exp2 = await nv.get('/api/doi-tac/sap-het-han?ngay=30').expect(200);
    expect(exp2.body.taiLieu.some((d: { id: string }) => d.id === doc.body.id)).toBe(false);
  });

  it('lọc danh sách theo vai và từ khoá', async () => {
    const c = code();
    await nv.post('/api/doi-tac').send({ code: c, name: 'Hãng tàu Thử', country: 'SG', category: 'hang_tau', roles: ['hang_tau'] }).expect(201);
    const res = await nv.get('/api/doi-tac?vai=hang_tau&q=Thử').expect(200);
    expect(res.body.doiTac.map((p: { code: string }) => p.code)).toContain(c);
    expect(res.body.doiTac.every((p: { roles: string[] }) => p.roles.includes('hang_tau'))).toBe(true);
  });

  it('danh mục: trưởng phòng thêm mặt hàng, nhân viên chỉ xem', async () => {
    await nv.post('/api/danh-muc/mat-hang').send({ code: 'ROB-G2', name: 'Cà phê Robusta nhân loại 2', sector: 'ca_phe' }).expect(403);
    await tp
      .post('/api/danh-muc/mat-hang')
      .send({ code: 'ROB-G2', name: 'Cà phê Robusta nhân loại 2', sector: 'ca_phe', hsCode: '0901.11', specFields: ['Độ ẩm %', 'Tạp chất %', 'Sàng 13'] })
      .expect(201);
    await tp.post('/api/danh-muc/mat-hang').send({ code: 'rob-g2', name: 'Trùng', sector: 'ca_phe' }).expect(409);
    const list = await nv.get('/api/danh-muc/mat-hang').expect(200);
    expect(list.body.matHang.find((m: { code: string }) => m.code === 'ROB-G2').specFields).toEqual(['Độ ẩm %', 'Tạp chất %', 'Sàng 13']);
  });

  it('kho đi thuê phải ghi đối tác sở hữu', async () => {
    await tp.post('/api/danh-muc/co-so').send({ name: 'Kho Cát Lái', kind: 'kho', ownership: 'thue' }).expect(400);
    const owner = await newPartner(tp, { roles: ['kho'], category: 'kho' });
    await tp.post('/api/danh-muc/co-so').send({ name: 'Kho Cát Lái', kind: 'kho', ownership: 'thue', partnerId: owner, capacityKg: 500000 }).expect(201);
    await tp.post('/api/danh-muc/co-so').send({ name: 'Xưởng sơ chế Vạn Thuận', kind: 'xuong_so_che', ownership: 'tu_van_hanh' }).expect(201);
  });
});

import { INestApplication } from '@nestjs/common';
import { Pool } from 'pg';
import request from 'supertest';
import { PG_POOL } from '../src/db/db';
import { codeFor, createUser, fullFirstLogin, startApp } from './helpers';

type Agent = Awaited<ReturnType<typeof fullFirstLogin>>['agent'];
type Login = { agent: Agent; secret: string; id: string };

const year = new Date().getUTCFullYear();

/** Điều khoản mẫu: cà phê Robusta, hợp đồng mua bằng VND. */
const termsMua = (over: Record<string, unknown> = {}) => ({
  soLuong: 19200,
  donVi: 'kg',
  dungSaiPhanTram: 5,
  donGia: 118000,
  tienTe: 'VND',
  tyGiaUsd: 25400,
  incoterms: 'EXW',
  cangDi: null,
  cangDen: null,
  lichGiao: 'Giao tại kho Buôn Ma Thuột trước 15/01/2027',
  dieuKhoanThanhToan: 'Đặt cọc 30%, phần còn lại khi giao hàng',
  tyLePhiPhanTram: null,
  ghiChu: 'Robusta loại 1, sàng 18',
  ...over,
});

describe('Hợp đồng và sổ cái kiểu blockchain', () => {
  let app: INestApplication;
  let pool: Pool;
  let nv: Login;
  let nv2: Login;
  let tp: Login;
  let gd: Login;
  let gdKiemKd: Login;
  let pgd: Login;
  let ktt: Login;
  let qt: Login;
  let ncc: string;
  let nccChuaDuyet: string;
  let nguoiMua: string;
  let matHang: string;
  let n = 0;

  async function login(roles: Parameters<typeof createUser>[1], prefix: string): Promise<Login> {
    const u = await createUser(app, roles, prefix);
    const { agent, secret } = await fullFirstLogin(app, u);
    return { agent, secret, id: u.id };
  }

  async function partner(roles: string[], approve = true) {
    const res = await nv.agent
      .post('/api/doi-tac')
      .send({ code: `HD${Date.now() % 100000}${++n}`, name: `Đối tác ${n}`, country: 'VN', category: 'doanh_nghiep_thuong_mai', roles })
      .expect(201);
    const id = res.body.id as string;
    if (approve) {
      await nv.agent.post(`/api/doi-tac/${id}/tai-lieu`).send({ docType: 'Giấy đăng ký kinh doanh', number: `DK${n}` }).expect(201);
      await nv.agent.post(`/api/doi-tac/${id}/trinh-tham-dinh`).send({ riskRating: 'thap', screeningNote: 'Không có trong danh sách trừng phạt' }).expect(200);
      await tp.agent.post(`/api/doi-tac/${id}/quyet-dinh-tham-dinh`).send({ dongY: true }).expect(200);
    }
    return id;
  }

  async function newContract(by: Login, over: Record<string, unknown> = {}) {
    const res = await by.agent
      .post('/api/hop-dong')
      .send({ loai: 'mua', benBanId: ncc, matHangId: matHang, dieuKhoan: termsMua(), ...over })
      .expect(201);
    return res.body as { id: string; code: string };
  }

  async function submitted(by: Login = nv, over: Record<string, unknown> = {}) {
    const c = await newContract(by, over);
    await by.agent.post(`/api/hop-dong/${c.id}/trinh-ky`).expect(200);
    return c;
  }

  beforeAll(async () => {
    app = await startApp();
    pool = app.get<Pool>(PG_POOL);
    nv = await login(['NHAN_VIEN_KD'], 'nv');
    nv2 = await login(['NHAN_VIEN_KD'], 'nv2');
    tp = await login(['TRUONG_PHONG_KD'], 'tp');
    gd = await login(['GIAM_DOC'], 'gd');
    gdKiemKd = await login(['GIAM_DOC', 'TRUONG_PHONG_KD'], 'gdkd');
    pgd = await login(['PHO_GIAM_DOC'], 'pgd');
    ktt = await login(['KE_TOAN_TRUONG'], 'ktt');
    qt = await login(['QUAN_TRI_HE_THONG'], 'qt');
    ncc = await partner(['nha_cung_cap']);
    nccChuaDuyet = await partner(['nha_cung_cap'], false);
    nguoiMua = await partner(['nguoi_mua']);
    const mh = await tp.agent
      .post('/api/danh-muc/mat-hang')
      .send({ code: `ROB${Date.now() % 100000}`, name: 'Cà phê Robusta', sector: 'ca_phe' })
      .expect(201);
    matHang = mh.body.id;
  });
  afterAll(async () => {
    await app.close();
  });

  it('nhân viên soạn hợp đồng mua: có số hợp đồng, trạng thái soạn, sổ cái ghi "tạo"', async () => {
    const c = await newContract(nv);
    expect(c.code).toMatch(new RegExp(`^HDM-${year}-\\d{4}$`));
    const res = await nv.agent.get(`/api/hop-dong/${c.id}`).expect(200);
    expect(res.body.status).toBe('nhap');
    expect(res.body.dealType).toBe('mua_dut');
    expect(res.body.giaTri).toBe(2265600000);
    expect(res.body.giaTriUsd).toBe(89196.85);
    expect(res.body.ledger.map((l: { event: string }) => l.event)).toEqual(['tao']);
    expect(res.body.versions[0].contentHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('chặn tạo hợp đồng khi đối tác chưa thẩm định đạt', async () => {
    const res = await nv.agent.post('/api/hop-dong').send({ loai: 'mua', benBanId: nccChuaDuyet, matHangId: matHang, dieuKhoan: termsMua() }).expect(400);
    expect(res.body.message).toMatch(/chưa thẩm định đạt/);
  });

  it('chặn sai vai: người mua không đứng bên bán của hợp đồng mua', async () => {
    const res = await nv.agent.post('/api/hop-dong').send({ loai: 'mua', benBanId: nguoiMua, matHangId: matHang, dieuKhoan: termsMua() }).expect(400);
    expect(res.body.message).toMatch(/nhà cung cấp/);
  });

  it('hợp đồng mua bán trực tiếp (môi giới) cần cả hai bên', async () => {
    await nv.agent.post('/api/hop-dong').send({ loai: 'mua_ban_truc_tiep', benBanId: ncc, matHangId: matHang, dieuKhoan: termsMua() }).expect(400);
    const res = await nv.agent
      .post('/api/hop-dong')
      .send({ loai: 'mua_ban_truc_tiep', benBanId: ncc, benMuaId: nguoiMua, matHangId: matHang, dieuKhoan: termsMua({ tienTe: 'USD', donGia: 4.85, incoterms: 'FOB' }) })
      .expect(201);
    expect(res.body.code).toMatch(/^HDTT-/);
  });

  it('nhân viên chỉ thấy hợp đồng của mình; kế toán trưởng thấy tất cả; quản trị không thấy', async () => {
    const c = await newContract(nv);
    await nv2.agent.get(`/api/hop-dong/${c.id}`).expect(403);
    const list = await nv2.agent.get('/api/hop-dong').expect(200);
    expect(list.body.hopDong.find((h: { id: string }) => h.id === c.id)).toBeUndefined();
    await ktt.agent.get(`/api/hop-dong/${c.id}`).expect(200);
    await qt.agent.get('/api/hop-dong').expect(403);
    await qt.agent.get(`/api/hop-dong/${c.id}`).expect(403);
  });

  it('điều khoản được mã hoá trong cơ sở dữ liệu', async () => {
    const c = await newContract(nv);
    const { rows } = await pool.query(`select content_enc from contract_versions where contract_id = $1`, [c.id]);
    expect(rows[0].content_enc).not.toMatch(/118000|Robusta|Buôn Ma Thuột/);
  });

  it('sửa khi soạn → trình ký (cần tỷ giá) → khoá nội dung', async () => {
    const c = await newContract(nv, { dieuKhoan: termsMua({ tyGiaUsd: null }) });
    const bad = await nv.agent.post(`/api/hop-dong/${c.id}/trinh-ky`).expect(400);
    expect(bad.body.message).toMatch(/tỷ giá/);
    await nv.agent.put(`/api/hop-dong/${c.id}/dieu-khoan`).send(termsMua({ donGia: 119000 })).expect(200);
    await nv.agent.post(`/api/hop-dong/${c.id}/trinh-ky`).expect(200);
    await nv.agent.put(`/api/hop-dong/${c.id}/dieu-khoan`).send(termsMua({ donGia: 120000 })).expect(400);
    const res = await nv.agent.get(`/api/hop-dong/${c.id}`).expect(200);
    expect(res.body.status).toBe('cho_ky');
    expect(res.body.terms.donGia).toBe(119000);
    expect(res.body.ledger.map((l: { event: string }) => l.event)).toEqual(['tao', 'sua', 'trinh_ky']);
  });

  it('người ký trả lại để sửa, kèm lý do', async () => {
    const c = await submitted();
    await nv.agent.post(`/api/hop-dong/${c.id}/tra-lai`).send({ lyDo: 'Xem lại' }).expect(403);
    await gd.agent.post(`/api/hop-dong/${c.id}/tra-lai`).send({ lyDo: 'Ghi rõ quy cách sàng' }).expect(200);
    const res = await nv.agent.get(`/api/hop-dong/${c.id}`).expect(200);
    expect(res.body.status).toBe('nhap');
    expect(res.body.ledger.at(-1)).toMatchObject({ event: 'tra_lai', note: 'Ghi rõ quy cách sàng' });
    await nv.agent.put(`/api/hop-dong/${c.id}/dieu-khoan`).send(termsMua({ ghiChu: 'Robusta loại 1, sàng 18, độ ẩm ≤ 12,5%' })).expect(200);
  });

  it('nhân viên và kế toán trưởng không ký được', async () => {
    const c = await submitted();
    await nv.agent.post(`/api/hop-dong/${c.id}/ky`).send({ ma2Lop: codeFor(nv.secret, 1) }).expect(403);
    await ktt.agent.post(`/api/hop-dong/${c.id}/ky`).send({ ma2Lop: codeFor(ktt.secret, 1) }).expect(403);
  });

  it('người trình không tự ký (nguyên tắc 4 mắt)', async () => {
    const c = await submitted(gdKiemKd);
    const res = await gdKiemKd.agent.post(`/api/hop-dong/${c.id}/ky`).send({ ma2Lop: '000000' }).expect(403);
    expect(res.body.message).toMatch(/4 mắt/);
  });

  it('Phó Giám đốc chỉ ký khi có ủy quyền và trong hạn mức; ký xong có mã xác minh và được neo', async () => {
    const c = await submitted();
    const noAuth = await pgd.agent.post(`/api/hop-dong/${c.id}/ky`).send({ ma2Lop: '000000' }).expect(403);
    expect(noAuth.body.message).toMatch(/ủy quyền/);

    // Chỉ Giám đốc cấp ủy quyền
    await pgd.agent.post('/api/uy-quyen-ky').send({ nguoiDuocUyQuyenId: pgd.id, soVanBan: '01/UQ', tuNgay: '2026-01-01', denNgay: '2030-12-31' }).expect(403);
    await gd.agent.post('/api/uy-quyen-ky').send({ nguoiDuocUyQuyenId: nv.id, soVanBan: '01/UQ', tuNgay: '2026-01-01', denNgay: '2030-12-31' }).expect(400);
    await gd.agent
      .post('/api/uy-quyen-ky')
      .send({ nguoiDuocUyQuyenId: pgd.id, soVanBan: '01/2026/UQ-VTG', tuNgay: '2026-01-01', denNgay: '2030-12-31', hanMucUsd: 100000 })
      .expect(201);
    const deputies = await gd.agent.get('/api/uy-quyen-ky/pho-giam-doc').expect(200);
    expect(deputies.body.phoGiamDoc.map((d: { id: string }) => d.id)).toContain(pgd.id);
    await pgd.agent.get('/api/uy-quyen-ky/pho-giam-doc').expect(403);
    const list = await pgd.agent.get('/api/uy-quyen-ky').expect(200);
    expect(list.body.uyQuyen.some((a: { conHieuLuc: boolean; granteeUserId: string }) => a.conHieuLuc && a.granteeUserId === pgd.id)).toBe(true);

    // Vượt hạn mức (khoảng 150.000 USD) thì không ký được
    const big = await submitted(nv, { dieuKhoan: termsMua({ soLuong: 32000 }) });
    const over = await pgd.agent.post(`/api/hop-dong/${big.id}/ky`).send({ ma2Lop: '000000' }).expect(403);
    expect(over.body.message).toMatch(/vượt hạn mức/);

    // Sai mã 2 lớp thì không ký
    await pgd.agent.post(`/api/hop-dong/${c.id}/ky`).send({ ma2Lop: '000000' }).expect(401);
    const ok = await pgd.agent.post(`/api/hop-dong/${c.id}/ky`).send({ ma2Lop: codeFor(pgd.secret, 1) }).expect(200);
    expect(ok.body.maXacMinh).toMatch(/^[0-9A-F]{4}(-[0-9A-F]{4}){15}$/);

    const res = await nv.agent.get(`/api/hop-dong/${c.id}`).expect(200);
    expect(res.body.status).toBe('da_ky');
    expect(res.body.signedVersion).toBe(1);
    const kyEntry = res.body.ledger.at(-1);
    expect(kyEntry.event).toBe('ky');
    expect(kyEntry.signature).toMatchObject({ provider: 'noi_bo_tam_thoi' });

    // Xác minh công khai, không cần đăng nhập, không lộ tên đối tác hay giá
    const v = await request(app.getHttpServer()).get(`/api/xac-minh/${ok.body.maXacMinh}`).expect(200);
    expect(v.body).toMatchObject({ hopLe: true, phienBan: 1, tinhTrang: 'con_hieu_luc', chuKy: { hopLe: true } });
    expect(v.body.neo).toMatchObject({ noiNeo: 'noi_bo', khopMaGoc: true });
    const raw = JSON.stringify(v.body);
    expect(raw).not.toMatch(/Đối tác|118000|Robusta|HDM-/);
  });

  it('mã xác minh lạ trả về "không hợp lệ"; sai dạng báo lỗi', async () => {
    const res = await request(app.getHttpServer()).get(`/api/xac-minh/${'b'.repeat(64)}`).expect(200);
    expect(res.body).toEqual({ hopLe: false });
    await request(app.getHttpServer()).get('/api/xac-minh/abc').expect(400);
  });

  it('phụ lục: phiên bản mới, bản đã ký cũ còn hiệu lực tới khi phụ lục được ký', async () => {
    const c = await submitted();
    const signed = await gd.agent.post(`/api/hop-dong/${c.id}/ky`).send({ ma2Lop: codeFor(gd.secret, 1) }).expect(200);
    await nv2.agent.post(`/api/hop-dong/${c.id}/phu-luc`).send({ lyDo: 'Giảm giá', dieuKhoan: termsMua() }).expect(403);
    const pl = await nv.agent
      .post(`/api/hop-dong/${c.id}/phu-luc`)
      .send({ lyDo: 'Giảm giá do giám định độ ẩm 13%', dieuKhoan: termsMua({ donGia: 115000 }) })
      .expect(201);
    expect(pl.body.version).toBe(2);
    const old = await request(app.getHttpServer()).get(`/api/xac-minh/${signed.body.maXacMinh}`).expect(200);
    expect(old.body.tinhTrang).toBe('con_hieu_luc');

    await nv.agent.post(`/api/hop-dong/${c.id}/trinh-ky`).expect(200);
    const signed2 = await gd.agent.post(`/api/hop-dong/${c.id}/ky`).send({ ma2Lop: codeFor(gd.secret, 2) }).expect(200);
    expect(signed2.body.maXacMinh).not.toBe(signed.body.maXacMinh);
    const after = await request(app.getHttpServer()).get(`/api/xac-minh/${signed.body.maXacMinh}`).expect(200);
    expect(after.body.tinhTrang).toBe('da_co_phu_luc_moi');

    const res = await nv.agent.get(`/api/hop-dong/${c.id}`).expect(200);
    expect(res.body.versions.map((v: { version: number }) => v.version)).toEqual([1, 2]);
    const v1 = await nv.agent.get(`/api/hop-dong/${c.id}/phien-ban/1`).expect(200);
    expect(v1.body.terms.donGia).toBe(118000);

    // Hợp đồng đã ký: nhân viên không huỷ được, Giám đốc huỷ được
    await nv.agent.post(`/api/hop-dong/${c.id}/huy`).send({ lyDo: 'Người bán không giao' }).expect(403);
    await gd.agent.post(`/api/hop-dong/${c.id}/huy`).send({ lyDo: 'Nhà cung cấp không giao hàng' }).expect(200);
    const cancelled = await request(app.getHttpServer()).get(`/api/xac-minh/${signed2.body.maXacMinh}`).expect(200);
    expect(cancelled.body.tinhTrang).toBe('da_huy');
  });

  it('hợp đồng chưa ký: người soạn tự huỷ được', async () => {
    const c = await newContract(nv);
    await nv2.agent.post(`/api/hop-dong/${c.id}/huy`).send({ lyDo: 'Không cần nữa' }).expect(403);
    await nv.agent.post(`/api/hop-dong/${c.id}/huy`).send({ lyDo: 'Khách đổi ý' }).expect(200);
    await nv.agent.post(`/api/hop-dong/${c.id}/trinh-ky`).expect(400);
  });

  it('thu hồi ủy quyền thì Phó Giám đốc không ký được nữa', async () => {
    const list = await gd.agent.get('/api/uy-quyen-ky').expect(200);
    const a = list.body.uyQuyen.find((x: { granteeUserId: string; conHieuLuc: boolean }) => x.granteeUserId === pgd.id && x.conHieuLuc);
    await gd.agent.post(`/api/uy-quyen-ky/${a.id}/thu-hoi`).send({ lyDo: 'Hết nhiệm kỳ' }).expect(200);
    const c = await submitted();
    const res = await pgd.agent.post(`/api/hop-dong/${c.id}/ky`).send({ ma2Lop: '000000' }).expect(403);
    expect(res.body.message).toMatch(/chưa có văn bản ủy quyền/);
  });

  it('sổ cái nguyên vẹn; cơ sở dữ liệu chặn sửa, xoá sổ cái và phiên bản đã ký', async () => {
    const check = await gd.agent.get('/api/so-cai/kiem-tra').expect(200);
    expect(check.body.ok).toBe(true);
    expect(check.body.checked).toBeGreaterThan(10);
    await expect(pool.query(`update contract_ledger set note = 'gia_mao' where id = 1`)).rejects.toThrow(/chỉ được ghi thêm/);
    await expect(pool.query(`delete from contract_ledger where id = 1`)).rejects.toThrow(/chỉ được ghi thêm/);
    await expect(pool.query(`update anchor_batches set merkle_root = 'x'`)).rejects.toThrow(/chỉ được ghi thêm/);
    await expect(pool.query(`update contract_versions set content_hash = 'x' where signed_at is not null`)).rejects.toThrow(/đã ký/);
    await expect(pool.query(`delete from contract_versions`)).rejects.toThrow(/xoá/);
    const batches = await gd.agent.get('/api/so-cai/dot-neo').expect(200);
    expect(batches.body.dotNeo.length).toBeGreaterThan(0);
  });
});

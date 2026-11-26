import { INestApplication } from '@nestjs/common';
import { Pool } from 'pg';
import { PG_POOL } from '../src/db/db';
import request from 'supertest';
import { codeFor, createUser, fullFirstLogin, NEW_PASSWORD, startApp, uniqueEmail } from './helpers';

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

describe('Cổng nhà cung cấp', () => {
  let app: INestApplication;
  let pool: Pool;
  let nv: Agent;
  let nv2: Agent;
  let tp: Agent;
  let s1: Agent;
  let s2: Agent;
  let ncc1: string;
  let ncc2: string;
  let buyer: string;
  let mh: string;
  let n = 0;
  const ids: Record<string, string> = {};
  const emails: Record<string, string> = {};

  async function partner(roles: string[]) {
    const res = await nv.post('/api/doi-tac').send({ code: `CG${Date.now() % 100000}${++n}`, name: `Nhà cung cấp cổng ${n}`, country: 'VN', category: 'htx', roles }).expect(201);
    const id = res.body.id as string;
    await nv.post(`/api/doi-tac/${id}/tai-lieu`).send({ docType: 'Giấy đăng ký kinh doanh', number: `DK${n}` }).expect(201);
    await nv.post(`/api/doi-tac/${id}/trinh-tham-dinh`).send({ riskRating: 'thap', screeningNote: 'Không có trong danh sách trừng phạt' }).expect(200);
    await tp.post(`/api/doi-tac/${id}/quyet-dinh-tham-dinh`).send({ dongY: true }).expect(200);
    return id;
  }
  async function signed(body: Record<string, unknown>) {
    const c = await nv.post('/api/hop-dong').send({ matHangId: mh, ...body }).expect(201);
    await nv.post(`/api/hop-dong/${c.body.id}/trinh-ky`).expect(200);
    const g = await fullFirstLogin(app, await createUser(app, ['GIAM_DOC'], 'gdcg'));
    await g.agent.post(`/api/hop-dong/${c.body.id}/ky`).send({ ma2Lop: codeFor(g.secret, 1) }).expect(200);
    return c.body.id as string;
  }
  async function purchaseLot(contractId: string, kg: number) {
    const id = (await nv.post('/api/lo-mua').send({ hopDongId: contractId }).expect(201)).body.id as string;
    await nv.post(`/api/lo-mua/${id}/su-kien`).send({ loai: 'thu_gom', khoiLuongKg: kg }).expect(200);
    await nv.post(`/api/lo-mua/${id}/su-kien`).send({ loai: 'so_che', khoiLuongKg: kg }).expect(200);
    return id;
  }
  const pdf = (text: string) => Buffer.from(`%PDF-1.4\n${text}\n%%EOF`);
  type PDoc = { id: string; name: string; status: string; chungCaLo: boolean; tep: { id: string }[]; coTheCapNhat: boolean };

  beforeAll(async () => {
    app = await startApp();
    pool = app.get<Pool>(PG_POOL);
    nv = (await fullFirstLogin(app, await createUser(app, ['NHAN_VIEN_KD'], 'cgnv'))).agent;
    nv2 = (await fullFirstLogin(app, await createUser(app, ['NHAN_VIEN_KD'], 'cgnv2'))).agent;
    tp = (await fullFirstLogin(app, await createUser(app, ['TRUONG_PHONG_KD'], 'cgtp'))).agent;
    ncc1 = await partner(['nha_cung_cap']);
    ncc2 = await partner(['nha_cung_cap']);
    buyer = await partner(['nguoi_mua']);
    mh = (await tp.post('/api/danh-muc/mat-hang').send({ code: `CGROB${Date.now() % 100000}`, name: 'Cà phê Robusta', sector: 'ca_phe' }).expect(201)).body.id;
    ids.mg1 = await signed({ loai: 'moi_gioi', benBanId: ncc1, dieuKhoan: terms(10) });
    ids.mg2 = await signed({ loai: 'moi_gioi', benBanId: ncc2, dieuKhoan: terms(5) });
    ids.tt = await signed({ loai: 'mua_ban_truc_tiep', benBanId: ncc1, benMuaId: buyer, dieuKhoan: terms(15, { tyLePhiPhanTram: null, donGia: 4875 }) });
    ids.lm1 = await purchaseLot(ids.mg1, 10000);
    ids.lm2 = await purchaseLot(ids.mg2, 5000);
  });
  afterAll(async () => {
    await app.close();
  });

  it('nhân viên mời người của nhà cung cấp vào cổng; chỉ nhà cung cấp đã thẩm định, do mình phụ trách', async () => {
    await nv.post(`/api/doi-tac/${buyer}/tai-khoan-cong`).send({ email: uniqueEmail('mua'), hoTen: 'Người mua' }).expect(400);
    await nv2.post(`/api/doi-tac/${ncc1}/tai-khoan-cong`).send({ email: uniqueEmail('x'), hoTen: 'Ai đó' }).expect(403);
    for (const [k, p] of [['s1', ncc1], ['s2', ncc2]] as const) {
      emails[k] = uniqueEmail(k);
      const r = await nv.post(`/api/doi-tac/${p}/tai-khoan-cong`).send({ email: emails[k], hoTen: `Kế toán ${k}` }).expect(201);
      const login = await fullFirstLogin(app, { email: emails[k], password: r.body.matKhauTam });
      if (k === 's1') s1 = login.agent;
      else s2 = login.agent;
    }
    await nv.post(`/api/doi-tac/${ncc1}/tai-khoan-cong`).send({ email: emails.s1, hoTen: 'Trùng' }).expect(409);
    const list = await nv.get(`/api/doi-tac/${ncc1}/tai-khoan-cong`).expect(200);
    expect(list.body.taiKhoan).toEqual([expect.objectContaining({ email: emails.s1, daCai2Lop: true })]);
    // Nhà cung cấp không vào được trang nội bộ, nhân viên không vào trang cổng
    await s1.get('/api/lo-xuat').expect(403);
    await s1.get('/api/hop-dong').expect(403);
    await nv.get('/api/cong/lo').expect(403);
    expect((await s1.get('/api/cong/lo').expect(200)).body.lo).toEqual([]);
  });

  it('nhà cung cấp chỉ thấy lô có hàng của mình, không thấy giá và hàng của người khác', async () => {
    ids.lx = (await nv.post('/api/lo-xuat').send({ hopDongDoiUngId: ids.tt, thiTruong: 'EU', etd: '2027-01-20' }).expect(201)).body.id;
    await nv.post(`/api/lo-xuat/${ids.lx}/phan-bo`).send({ loMuaId: ids.lm1, khoiLuongKg: 10000 }).expect(201);
    await nv.post(`/api/lo-xuat/${ids.lx}/phan-bo`).send({ loMuaId: ids.lm2, khoiLuongKg: 5000 }).expect(201);
    const l1 = await s1.get('/api/cong/lo').expect(200);
    expect(l1.body.lo).toEqual([expect.objectContaining({ id: ids.lx, khoiLuongCuaToiKg: 10000, soNhaCungCap: 2, laNhaCungCapChinh: true, buyerName: expect.any(String) })]);
    const l2 = await s2.get('/api/cong/lo').expect(200);
    expect(l2.body.lo[0]).toMatchObject({ khoiLuongCuaToiKg: 5000, laNhaCungCapChinh: false });
    for (const r of [l1, l2]) expect(JSON.stringify(r.body)).not.toMatch(/4875|4800|donGia|unitPrice/);

    const d2 = await s2.get(`/api/cong/lo/${ids.lx}`).expect(200);
    const names2 = d2.body.chungTu.map((d: PDoc) => d.name);
    expect(names2).toEqual(expect.arrayContaining(['Hóa đơn thương mại', 'Phiếu đóng gói']));
    expect(d2.body.chungTu.filter((d: PDoc) => d.chungCaLo).map((d: PDoc) => d.name)[0]).toMatch(/ủy quyền/);
    expect(d2.body.chungTuNhaCungCapKhac).toEqual([]);
    expect(JSON.stringify(d2.body)).not.toContain('Nhà cung cấp cổng 1');
    const d1 = await s1.get(`/api/cong/lo/${ids.lx}`).expect(200);
    expect(d1.body.chungTuNhaCungCapKhac.length).toBeGreaterThan(0);
    expect(d1.body.chungTuNhaCungCapKhac[0]).toEqual({ name: expect.any(String), supplierName: expect.stringContaining('Nhà cung cấp cổng'), requirement: expect.any(String), stage: expect.any(String), status: 'thieu' });
    await s2.get(`/api/lo-xuat/${ids.lx}/chung-tu`).expect(403);
  });

  it('nhà cung cấp cập nhật và nộp tệp chứng từ của mình; Vạn Thuận duyệt', async () => {
    const d2 = (await s2.get(`/api/cong/lo/${ids.lx}`).expect(200)).body.chungTu as PDoc[];
    const hd2 = d2.find((d) => d.name === 'Hóa đơn thương mại')!;
    await s2.put(`/api/chung-tu/${hd2.id}`).send({ trangThai: 'nhap', so: 'INV-NCC2-01', ngayCap: '2026-11-25' }).expect(204);
    const up = await s2.post(`/api/chung-tu/${hd2.id}/tep`).attach('tep', pdf('hoa don ncc2'), 'hoa-don.pdf').expect(201);
    await s2.post(`/api/chung-tu/${hd2.id}/duyet`).expect(403);
    await tp.post(`/api/chung-tu/${hd2.id}/duyet`).expect(204);
    // Không đụng được chứng từ của nhà cung cấp khác
    const staff = (await nv.get(`/api/lo-xuat/${ids.lx}/chung-tu`).expect(200)).body.chungTu as (PDoc & { code: string; supplierPartnerId: string; obsolete: boolean })[];
    const hd1 = staff.find((d) => d.code === 'hoa_don' && d.supplierPartnerId === ncc1 && !d.obsolete)!;
    await s2.put(`/api/chung-tu/${hd1.id}`).send({ trangThai: 'dang_xin' }).expect(403);
    await s2.post(`/api/chung-tu/${hd1.id}/tep`).attach('tep', pdf('x'), 'x.pdf').expect(403);
    const f1 = await nv.post(`/api/chung-tu/${hd1.id}/tep`).attach('tep', pdf('hoa don ncc1'), 'hd1.pdf').expect(201);
    await s2.post(`/api/tep/${f1.body.id}/lien-ket`).expect(403);
    await s1.post(`/api/tep/${f1.body.id}/lien-ket`).expect(200);
    const link = await s2.post(`/api/tep/${up.body.id}/lien-ket`).expect(200);
    expect(Buffer.from((await s2.get(link.body.duongDan).buffer(true).expect(200)).body).toString()).toContain('hoa don ncc2');
    // Bị trả lại thì nhà cung cấp thấy lý do
    await tp.post(`/api/chung-tu/${hd2.id}/tra-lai`).send({ lyDo: 'Thiếu chữ ký và dấu' }).expect(204);
    const after = (await s2.get(`/api/cong/lo/${ids.lx}`).expect(200)).body;
    expect(after.chungTu.find((d: PDoc) => d.id === hd2.id)).toMatchObject({ status: 'dang_xin', note: 'Trả lại: Thiếu chữ ký và dấu' });
    expect((await s2.get('/api/cong/lo').expect(200)).body.lo[0].biTraLai).toBe(1);
  });

  it('huỷ phân bổ thì nhà cung cấp không còn thấy lô', async () => {
    const lx = (await nv.get(`/api/lo-xuat/${ids.lx}`).expect(200)).body;
    const a2 = lx.phanBo.find((p: { purchaseLotId: string }) => p.purchaseLotId === ids.lm2);
    await nv.post(`/api/phan-bo/${a2.id}/huy`).send({ lyDo: 'Nhà cung cấp giao thiếu' }).expect(200);
    expect((await s2.get('/api/cong/lo').expect(200)).body.lo).toEqual([]);
    await s2.get(`/api/cong/lo/${ids.lx}`).expect(404);
  });

  it('tài khoản nhà cung cấp không dùng 90 ngày thì tự khoá', async () => {
    await pool.query(`update users set last_login_at = now() - interval '91 days' where lower(email) = lower($1)`, [emails.s2]);
    const r = await request(app.getHttpServer()).post('/api/auth/dang-nhap').send({ email: emails.s2, matKhau: NEW_PASSWORD }).expect(401);
    expect(r.body.message).toMatch(/90 ngày/);
    const { rows } = await pool.query(`select status from users where lower(email) = lower($1)`, [emails.s2]);
    expect(rows[0].status).toBe('bi_khoa');
  });
});

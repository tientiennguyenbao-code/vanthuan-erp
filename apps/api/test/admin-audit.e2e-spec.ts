import { INestApplication } from '@nestjs/common';
import { Pool } from 'pg';
import request from 'supertest';
import { PG_POOL } from '../src/db/db';
import { createUser, fullFirstLogin, NEW_PASSWORD } from './helpers';
import { startApp } from './helpers';

describe('Quản trị tài khoản, phân quyền và nhật ký', () => {
  let app: INestApplication;
  let admin: Awaited<ReturnType<typeof fullFirstLogin>>;
  let adminId: string;

  beforeAll(async () => {
    app = await startApp();
    const a = await createUser(app, ['QUAN_TRI_HE_THONG'], 'qt');
    adminId = a.id;
    admin = await fullFirstLogin(app, a);
  });
  afterAll(async () => {
    await app.close();
  });

  it('quản trị tạo tài khoản; mật khẩu tạm dùng được để đăng nhập', async () => {
    const res = await admin.agent
      .post('/api/nguoi-dung')
      .send({ email: 'moi.nv@vanthuan.test', hoTen: 'Nhân viên mới', vaiTro: ['NHAN_VIEN_KD'] })
      .expect(201);
    expect(res.body.matKhauTam).toBeTruthy();
    const login = await request(app.getHttpServer())
      .post('/api/auth/dang-nhap')
      .send({ email: 'Moi.NV@vanthuan.test', matKhau: res.body.matKhauTam })
      .expect(200);
    expect(login.body.buoc).toBe('can_cai_2_lop');

    await admin.agent
      .post('/api/nguoi-dung')
      .send({ email: 'moi.nv@vanthuan.test', hoTen: 'Trùng email', vaiTro: ['NHAN_VIEN_KD'] })
      .expect(409);
  });

  it('không cho quản trị kiêm vai trò nghiệp vụ, không cho tự đổi vai trò', async () => {
    await admin.agent
      .post('/api/nguoi-dung')
      .send({ email: 'kiem@vanthuan.test', hoTen: 'Kiêm nhiệm', vaiTro: ['QUAN_TRI_HE_THONG', 'GIAM_DOC'] })
      .expect(400);
    await admin.agent.put(`/api/nguoi-dung/${adminId}/vai-tro`).send({ vaiTro: ['GIAM_DOC'] }).expect(403);
  });

  it('người không phải quản trị không vào được trang quản lý tài khoản', async () => {
    const nv = await createUser(app, ['TRUONG_PHONG_KD']);
    const { agent } = await fullFirstLogin(app, nv);
    const res = await agent.get('/api/nguoi-dung').expect(403);
    expect(res.body.thieuQuyen).toEqual(['TAI_KHOAN_QUAN_LY']);
  });

  it('quản trị không xem được nhật ký nghiệp vụ; Giám đốc xem được', async () => {
    await admin.agent.get('/api/nhat-ky').expect(403);
    const gd = await createUser(app, ['GIAM_DOC'], 'gd');
    const { agent } = await fullFirstLogin(app, gd);
    const res = await agent.get('/api/nhat-ky?soDong=5').expect(200);
    expect(res.body.dong.length).toBeGreaterThan(0);
    const check = await agent.get('/api/nhat-ky/kiem-tra').expect(200);
    expect(check.body.ok).toBe(true);
  });

  it('mở khoá tài khoản bị khoá', async () => {
    const u = await createUser(app, ['KE_TOAN_VIEN']);
    const server = app.getHttpServer();
    for (let i = 0; i < 5; i++) await request(server).post('/api/auth/dang-nhap').send({ email: u.email, matKhau: 'sai-mat-khau-1' });
    await request(server).post('/api/auth/dang-nhap').send({ email: u.email, matKhau: u.password }).expect(401);
    await admin.agent.post(`/api/nguoi-dung/${u.id}/mo-khoa`).expect(200);
    await request(server).post('/api/auth/dang-nhap').send({ email: u.email, matKhau: u.password }).expect(200);
  });

  it('đổi vai trò thì người đó bị đăng xuất để quyền mới có hiệu lực', async () => {
    const u = await createUser(app, ['NHAN_VIEN_KD']);
    const { agent } = await fullFirstLogin(app, u);
    await agent.get('/api/auth/toi').expect(200);
    await admin.agent.put(`/api/nguoi-dung/${u.id}/vai-tro`).send({ vaiTro: ['TRUONG_PHONG_KD'] }).expect(200);
    await agent.get('/api/auth/toi').expect(401);
  });

  it('vô hiệu hoá thì không đăng nhập được nữa', async () => {
    const u = await createUser(app, ['KE_TOAN_VIEN']);
    await fullFirstLogin(app, u);
    await admin.agent.post(`/api/nguoi-dung/${u.id}/vo-hieu`).expect(200);
    await request(app.getHttpServer()).post('/api/auth/dang-nhap').send({ email: u.email, matKhau: NEW_PASSWORD }).expect(401);
  });

  it('đặt lại tài khoản (mất điện thoại): phải cài lại 2 lớp và đổi mật khẩu', async () => {
    const u = await createUser(app, ['KE_TOAN_VIEN']);
    await fullFirstLogin(app, u);
    const res = await admin.agent.post(`/api/nguoi-dung/${u.id}/dat-lai`).expect(200);
    const login = await request(app.getHttpServer()).post('/api/auth/dang-nhap').send({ email: u.email, matKhau: res.body.matKhauTam }).expect(200);
    expect(login.body.buoc).toBe('can_cai_2_lop');
  });

  it('cơ sở dữ liệu từ chối sửa hoặc xoá nhật ký, kể cả khi truy cập thẳng', async () => {
    const pool = app.get<Pool>(PG_POOL);
    await expect(pool.query(`update audit_log set action = 'gia_mao' where id = 1`)).rejects.toThrow(/chỉ được ghi thêm/);
    await expect(pool.query(`delete from audit_log where id = 1`)).rejects.toThrow(/chỉ được ghi thêm/);
    await expect(pool.query(`truncate audit_log`)).rejects.toThrow(/chỉ được ghi thêm/);
  });

  it('phát hiện dòng nhật ký bị sửa lén (khi ai đó tắt được chốt chặn)', async () => {
    const pool = app.get<Pool>(PG_POOL);
    const client = await pool.connect();
    try {
      await client.query('begin');
      await client.query('alter table audit_log disable trigger audit_log_khong_sua_xoa');
      await client.query(`update audit_log set detail = '{"gia_mao": true}' where id = (select min(id) + 1 from audit_log)`);
      const { AuditService } = await import('../src/audit/audit.service');
      // Kiểm tra trong cùng giao dịch, rồi huỷ để không làm hỏng dữ liệu thử
      const { createDb } = await import('../src/db/db');
      const svc = new AuditService(createDb(client as unknown as Pool));
      const result = await svc.verifyChain();
      expect(result.ok).toBe(false);
      expect(result.brokenAtId).toBeGreaterThan(1);
    } finally {
      await client.query('rollback');
      client.release();
    }
  });
});

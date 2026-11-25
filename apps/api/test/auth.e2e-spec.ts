import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { codeFor, createUser, fullFirstLogin, NEW_PASSWORD, startApp } from './helpers';

describe('Đăng nhập', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await startApp();
  });
  afterAll(async () => {
    await app.close();
  });

  it('chặn mọi đường dẫn khi chưa đăng nhập, trừ trang kiểm tra sức khoẻ', async () => {
    await request(app.getHttpServer()).get('/api/auth/toi').expect(401);
    await request(app.getHttpServer()).get('/api/nguoi-dung').expect(401);
    await request(app.getHttpServer()).get('/api/suc-khoe').expect(200);
  });

  it('báo cùng một câu khi sai email hoặc sai mật khẩu', async () => {
    const u = await createUser(app, ['NHAN_VIEN_KD']);
    const a = await request(app.getHttpServer()).post('/api/auth/dang-nhap').send({ email: 'khongco@vanthuan.test', matKhau: 'x' }).expect(401);
    const b = await request(app.getHttpServer()).post('/api/auth/dang-nhap').send({ email: u.email, matKhau: 'sai-mat-khau' }).expect(401);
    expect(a.body.message).toBe(b.body.message);
  });

  it('lần đầu: bắt cài 2 lớp, rồi bắt đổi mật khẩu, rồi mới vào được', async () => {
    const u = await createUser(app, ['NHAN_VIEN_KD']);
    const agent = request.agent(app.getHttpServer());
    const login = await agent.post('/api/auth/dang-nhap').send({ email: u.email, matKhau: u.password }).expect(200);
    expect(login.body.buoc).toBe('can_cai_2_lop');

    // Chưa cài 2 lớp thì chưa xem được gì ngoài thông tin của mình
    const me = await agent.get('/api/auth/toi').expect(200);
    expect(me.body.buoc).toBe('can_cai_2_lop');
    expect(me.body.quyen).toEqual([]);

    const start = await agent.post('/api/auth/cai-2-lop/bat-dau').expect(200);
    expect(start.body.otpauthUrl).toMatch(/^otpauth:\/\/totp\//);
    await agent.post('/api/auth/cai-2-lop/xac-nhan').send({ ma: '000000' }).expect(400);
    const confirm = await agent.post('/api/auth/cai-2-lop/xac-nhan').send({ ma: codeFor(start.body.maBiMat, 0) }).expect(200);
    expect(confirm.body.buoc).toBe('phai_doi_mat_khau');

    await agent.post('/api/auth/doi-mat-khau').send({ matKhauCu: u.password, matKhauMoi: 'ngan' }).expect(400);
    const changed = await agent.post('/api/auth/doi-mat-khau').send({ matKhauCu: u.password, matKhauMoi: NEW_PASSWORD }).expect(200);
    expect(changed.body.buoc).toBe('day_du');

    const me2 = await agent.get('/api/auth/toi').expect(200);
    expect(me2.body.buoc).toBe('day_du');
    expect(me2.body.quyen).toContain('LO_HANG_QUAN_LY_CUA_MINH');
    expect(me2.body.vaiTro).toEqual([{ ma: 'NHAN_VIEN_KD', ten: 'Nhân viên kinh doanh' }]);
  });

  it('lần sau: mật khẩu rồi mã 2 lớp; một mã không dùng được hai lần', async () => {
    const u = await createUser(app, ['KE_TOAN_VIEN']);
    const { secret } = await fullFirstLogin(app, u);

    const agent = request.agent(app.getHttpServer());
    const login = await agent.post('/api/auth/dang-nhap').send({ email: u.email, matKhau: NEW_PASSWORD }).expect(200);
    expect(login.body.buoc).toBe('cho_ma_2_lop');
    // Mã đã dùng khi cài đặt thì không dùng lại được
    await agent.post('/api/auth/ma-2-lop').send({ ma: codeFor(secret, 0) }).expect(401);
    const ok = await agent.post('/api/auth/ma-2-lop').send({ ma: codeFor(secret, 1) }).expect(200);
    expect(ok.body.buoc).toBe('day_du');
    await agent.get('/api/auth/toi').expect(200);
  });

  it('phiên chưa nhập mã 2 lớp không vào được trang nghiệp vụ', async () => {
    const u = await createUser(app, ['QUAN_TRI_HE_THONG'], 'qt');
    await fullFirstLogin(app, u);
    const agent = request.agent(app.getHttpServer());
    await agent.post('/api/auth/dang-nhap').send({ email: u.email, matKhau: NEW_PASSWORD }).expect(200);
    const res = await agent.get('/api/nguoi-dung').expect(403);
    expect(res.body.buoc).toBe('cho_ma_2_lop');
  });

  it('khoá tài khoản sau 5 lần nhập sai', async () => {
    const u = await createUser(app, ['NHAN_VIEN_KD']);
    const server = app.getHttpServer();
    for (let i = 0; i < 5; i++) {
      await request(server).post('/api/auth/dang-nhap').send({ email: u.email, matKhau: 'sai-mat-khau-123' }).expect(401);
    }
    // Đúng mật khẩu cũng không vào được, và được báo là bị khoá
    const res = await request(server).post('/api/auth/dang-nhap').send({ email: u.email, matKhau: u.password }).expect(401);
    expect(res.body.message).toMatch(/bị khoá/);
  });

  it('nhập sai mã 2 lớp cũng tính vào 5 lần, và đăng xuất phiên đang dở', async () => {
    const u = await createUser(app, ['NHAN_VIEN_KD']);
    const { secret } = await fullFirstLogin(app, u);
    const agent = request.agent(app.getHttpServer());
    await agent.post('/api/auth/dang-nhap').send({ email: u.email, matKhau: NEW_PASSWORD }).expect(200);
    for (let i = 0; i < 4; i++) await agent.post('/api/auth/ma-2-lop').send({ ma: '000000' }).expect(401);
    const fifth = await agent.post('/api/auth/ma-2-lop').send({ ma: '000000' }).expect(401);
    expect(fifth.body.message).toMatch(/bị khoá/);
    await agent.post('/api/auth/ma-2-lop').send({ ma: codeFor(secret, 1) }).expect(401);
  });

  it('đăng xuất thì cookie cũ hết dùng được', async () => {
    const u = await createUser(app, ['KE_TOAN_TRUONG']);
    const { agent } = await fullFirstLogin(app, u);
    await agent.get('/api/auth/toi').expect(200);
    await agent.post('/api/auth/dang-xuat').expect(200);
    await agent.get('/api/auth/toi').expect(401);
  });
});

import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createApp } from '../src/app.factory';
import { totpAt } from '../src/auth/totp';
import type { Role } from '../src/permissions/roles';
import { UsersService } from '../src/users/users.service';

export const NEW_PASSWORD = 'MatKhauMoi2026';

export async function startApp(): Promise<INestApplication> {
  const app = await createApp();
  await app.init();
  return app;
}

let counter = 0;
export function uniqueEmail(prefix: string): string {
  counter += 1;
  return `${prefix}.${Date.now()}.${counter}@vanthuan.test`;
}

export async function createUser(app: INestApplication, roles: Role[], prefix = 'nv') {
  const email = uniqueEmail(prefix);
  const { id, matKhauTam } = await app.get(UsersService).create({ email, hoTen: `Người thử ${prefix}`, vaiTro: roles }, null, null);
  return { id, email, password: matKhauTam };
}

/**
 * Mã 2 lớp cho lần dùng thứ `use` (0, 1, 2...). Mỗi lần lấy mã của bước 30 giây kế tiếp,
 * vì hệ thống không cho dùng lại một mã đã dùng.
 */
export function codeFor(secret: string, use = 0): string {
  return totpAt(secret, Date.now() + use * 30_000 - 30_000);
}

/**
 * Đi trọn quy trình đăng nhập lần đầu: mật khẩu tạm → cài 2 lớp → đổi mật khẩu.
 * Trả về "agent" giữ cookie phiên đầy đủ, và mã bí mật 2 lớp.
 */
export async function fullFirstLogin(app: INestApplication, user: { email: string; password: string }) {
  const agent = request.agent(app.getHttpServer());
  const login = await agent.post('/api/auth/dang-nhap').send({ email: user.email, matKhau: user.password }).expect(200);
  if (login.body.buoc !== 'can_cai_2_lop') throw new Error(`Bước không đúng: ${login.body.buoc}`);
  const start = await agent.post('/api/auth/cai-2-lop/bat-dau').expect(200);
  const secret: string = start.body.maBiMat;
  const confirm = await agent.post('/api/auth/cai-2-lop/xac-nhan').send({ ma: codeFor(secret, 0) }).expect(200);
  if (confirm.body.buoc !== 'phai_doi_mat_khau') throw new Error(`Bước không đúng: ${confirm.body.buoc}`);
  await agent.post('/api/auth/doi-mat-khau').send({ matKhauCu: user.password, matKhauMoi: NEW_PASSWORD }).expect(200);
  return { agent, secret };
}

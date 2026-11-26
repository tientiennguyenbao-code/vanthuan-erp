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

type Agent = Awaited<ReturnType<typeof fullFirstLogin>>['agent'];
const eudrAgents = new WeakMap<INestApplication, Promise<{ tm: Agent; gd: Agent }>>();

/**
 * Ghi thu gom cà phê đủ điều kiện EUDR vào lô mua (để phân bổ được sang lô xuất EU):
 * lập một vùng có năng suất riêng 10.000 kg/ha, một hộ, một thửa 4 ha đã kiểm tra rừng (duyệt 4 mắt), rồi một phiếu thu gom.
 */
export async function thuGomDuEudr(app: INestApplication, partnerId: string, lotId: string, kg: number) {
  if (!eudrAgents.has(app)) {
    eudrAgents.set(
      app,
      (async () => ({
        tm: (await fullFirstLogin(app, await createUser(app, ['NHAN_VIEN_THU_MUA'], 'eudrtm'))).agent,
        gd: (await fullFirstLogin(app, await createUser(app, ['GIAM_DOC'], 'eudrgd'))).agent,
      }))(),
    );
  }
  const { tm, gd } = await eudrAgents.get(app)!;
  const vung = (await tm.post(`/api/nguon-cung/${partnerId}/vung`).send({ name: 'Vùng thử', kind: 'vung_trong', sector: 'ca_phe', province: 'Đắk Lắk' }).expect(201)).body.id;
  await gd.put(`/api/nang-suat/vung/${vung}`).send({ kgMoiHa: 10_000 }).expect(200);
  const ho = (await tm.post(`/api/nguon-cung/${partnerId}/ho`).send({ fullName: 'Hộ thử', province: 'Đắk Lắk', consentOn: '2026-11-01' }).expect(201)).body.id;
  // Mỗi thửa một chỗ riêng để không bị cảnh báo trùng vị trí
  const pt: [number, number] = [107.9 + Math.random() * 0.6, 12.4 + Math.random() * 0.6];
  const thua = (await tm.post(`/api/nguon-cung/${partnerId}/thua`).send({ farmerId: ho, growingAreaId: vung, kind: 'thua', geometry: { type: 'Point', coordinates: pt }, declaredAreaHa: 4 }).expect(201)).body.id;
  const kt = await tm.post('/api/kiem-tra-rung').send({ plotIds: [thua], method: 'jrc_2020', result: 'khong_rung', evidence: 'Đối chiếu bản đồ JRC GFC2020' }).expect(201);
  await gd.post('/api/kiem-tra-rung/duyet').send({ ids: kt.body.ids, dongY: true }).expect(200);
  const r = await tm.post(`/api/lo-mua/${lotId}/phieu-thu-gom`).send({ farmerId: ho, plotId: thua, harvestDate: '2026-11-15', quantityKg: kg }).expect(201);
  if (!r.body.eudrOk) throw new Error(`Phiếu chưa đủ EUDR: ${r.body.eudrReasons.join('; ')}`);
}

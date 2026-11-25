import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { UsersService } from '../users/users.service';

/**
 * Tạo tài khoản Quản trị hệ thống đầu tiên khi cài đặt lần đầu.
 * Cách dùng: pnpm --filter @vanthuan/api tao-quan-tri <email> "<Họ tên>"
 */
async function main() {
  const [email, hoTen] = process.argv.slice(2);
  if (!email || !hoTen) {
    console.error('Cách dùng: tao-quan-tri <email> "<Họ tên>"');
    process.exit(1);
  }
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error'] });
  const { matKhauTam } = await app.get(UsersService).create({ email, hoTen, vaiTro: ['QUAN_TRI_HE_THONG'] }, null, null);
  console.log(`Đã tạo tài khoản quản trị ${email}. Mật khẩu tạm (chỉ hiện một lần): ${matKhauTam}`);
  await app.close();
}

void main();

import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Put, Req } from '@nestjs/common';
import type { Request } from 'express';
import { z } from 'zod';
import type { AuthContext } from '../auth/auth.types';
import { CurrentAuth, RequirePermissions } from '../auth/decorators';
import { parseBody } from '../common/validation';
import { ROLE_LABELS, ROLES } from '../permissions/roles';
import { UsersService } from './users.service';

const roleList = z.array(z.enum(ROLES)).min(1, 'Phải chọn ít nhất một vai trò');
const createSchema = z.object({
  email: z.email('Email không hợp lệ'),
  hoTen: z.string().trim().min(2, 'Nhập họ tên').max(120),
  vaiTro: roleList,
});
const rolesSchema = z.object({ vaiTro: roleList });

/** Quản lý tài khoản: chỉ dành cho vai trò Quản trị hệ thống. */
@Controller('nguoi-dung')
@RequirePermissions('TAI_KHOAN_QUAN_LY')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  async list() {
    return { nguoiDung: await this.users.list() };
  }

  @Get('vai-tro')
  roles() {
    return { vaiTro: ROLES.map((ma) => ({ ma, ten: ROLE_LABELS[ma] })) };
  }

  @Post()
  create(@Body() body: unknown, @CurrentAuth() ctx: AuthContext, @Req() req: Request) {
    return this.users.create(parseBody(createSchema, body), ctx.user.id, req.ip ?? null);
  }

  @Put(':id/vai-tro')
  async setRoles(@Param('id', ParseUUIDPipe) id: string, @Body() body: unknown, @CurrentAuth() ctx: AuthContext, @Req() req: Request) {
    await this.users.setRoles(id, parseBody(rolesSchema, body).vaiTro, ctx.user.id, req.ip ?? null);
    return { ok: true };
  }

  @Post(':id/mo-khoa')
  @HttpCode(200)
  async unlock(@Param('id', ParseUUIDPipe) id: string, @CurrentAuth() ctx: AuthContext, @Req() req: Request) {
    await this.users.unlock(id, ctx.user.id, req.ip ?? null);
    return { ok: true };
  }

  @Post(':id/vo-hieu')
  @HttpCode(200)
  async disable(@Param('id', ParseUUIDPipe) id: string, @CurrentAuth() ctx: AuthContext, @Req() req: Request) {
    await this.users.setActive(id, false, ctx.user.id, req.ip ?? null);
    return { ok: true };
  }

  @Post(':id/kich-hoat')
  @HttpCode(200)
  async enable(@Param('id', ParseUUIDPipe) id: string, @CurrentAuth() ctx: AuthContext, @Req() req: Request) {
    await this.users.setActive(id, true, ctx.user.id, req.ip ?? null);
    return { ok: true };
  }

  @Post(':id/dat-lai')
  @HttpCode(200)
  reset(@Param('id', ParseUUIDPipe) id: string, @CurrentAuth() ctx: AuthContext, @Req() req: Request) {
    return this.users.resetCredentials(id, ctx.user.id, req.ip ?? null);
  }
}

import { Body, Controller, Get, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { z } from 'zod';
import type { AuthContext } from '../auth/auth.types';
import { CurrentAuth } from '../auth/decorators';
import { parseBody } from '../common/validation';
import { PortalService } from './portal.service';

const inviteSchema = z.object({
  email: z.email('Email không hợp lệ').max(200),
  hoTen: z.string().trim().min(2, 'Ghi họ tên người liên hệ').max(200),
});

/** Nhân viên quản lý tài khoản cổng của nhà cung cấp. */
@Controller('doi-tac')
export class PartnerPortalAccountsController {
  constructor(private readonly portal: PortalService) {}

  @Get(':id/tai-khoan-cong')
  async list(@Param('id', ParseUUIDPipe) id: string, @CurrentAuth() ctx: AuthContext) {
    return { taiKhoan: await this.portal.listAccounts(id, ctx) };
  }

  @Post(':id/tai-khoan-cong')
  invite(@Param('id', ParseUUIDPipe) id: string, @Body() body: unknown, @CurrentAuth() ctx: AuthContext) {
    return this.portal.invite(id, parseBody(inviteSchema, body), ctx);
  }
}

/** Cổng nhà cung cấp. Cập nhật và tải tệp chứng từ dùng chung đường /api/chung-tu và /api/tep. */
@Controller('cong')
export class PortalController {
  constructor(private readonly portal: PortalService) {}

  @Get('lo')
  async lots(@CurrentAuth() ctx: AuthContext) {
    return { lo: await this.portal.myLots(ctx) };
  }

  @Get('lo/:id')
  lot(@Param('id', ParseUUIDPipe) id: string, @CurrentAuth() ctx: AuthContext) {
    return this.portal.lotDetail(id, ctx);
  }
}

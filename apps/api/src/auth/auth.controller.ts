import { Body, Controller, Get, HttpCode, Post, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { loadConfig } from '../config/config';
import { parseBody } from '../common/validation';
import { permissionsFor, ROLE_LABELS } from '../permissions/roles';
import { AuthService, ClientInfo, StageResult } from './auth.service';
import { AuthContext, FULL_TTL_MS, SESSION_COOKIE } from './auth.types';
import { AllowStages, CurrentAuth, Public } from './decorators';

const loginSchema = z.object({ email: z.email('Email không hợp lệ'), matKhau: z.string().min(1, 'Nhập mật khẩu') });
const codeSchema = z.object({ ma: z.string().regex(/^\s*\d{6}\s*$/, 'Mã gồm 6 chữ số') });
const changePasswordSchema = z.object({ matKhauCu: z.string().min(1), matKhauMoi: z.string().min(1) });

export function clientOf(req: Request): ClientInfo {
  return { ip: req.ip ?? null, userAgent: req.get('user-agent') ?? null };
}

function setSessionCookie(res: Response, token: string): void {
  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: loadConfig().COOKIE_SECURE,
    sameSite: 'strict',
    path: '/',
    maxAge: FULL_TTL_MS,
  });
}

function reply(res: Response, result: StageResult) {
  if (result.token) setSessionCookie(res, result.token);
  return { buoc: result.stage };
}

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Post('dang-nhap')
  @HttpCode(200)
  async login(@Body() body: unknown, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const { email, matKhau } = parseBody(loginSchema, body);
    return reply(res, await this.auth.login(email, matKhau, clientOf(req)));
  }

  @AllowStages('cho_ma_2_lop')
  @Post('ma-2-lop')
  @HttpCode(200)
  async secondFactor(@CurrentAuth() ctx: AuthContext, @Body() body: unknown, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const { ma } = parseBody(codeSchema, body);
    return reply(res, await this.auth.verifySecondFactor(ctx, ma, clientOf(req)));
  }

  @AllowStages('can_cai_2_lop')
  @Post('cai-2-lop/bat-dau')
  @HttpCode(200)
  async startEnrollment(@CurrentAuth() ctx: AuthContext) {
    const { secret, otpauthUrl } = await this.auth.startEnrollment(ctx);
    return { maBiMat: secret, otpauthUrl };
  }

  @AllowStages('can_cai_2_lop')
  @Post('cai-2-lop/xac-nhan')
  @HttpCode(200)
  async confirmEnrollment(@CurrentAuth() ctx: AuthContext, @Body() body: unknown, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const { ma } = parseBody(codeSchema, body);
    return reply(res, await this.auth.confirmEnrollment(ctx, ma, clientOf(req)));
  }

  @AllowStages('phai_doi_mat_khau', 'day_du')
  @Post('doi-mat-khau')
  @HttpCode(200)
  async changePassword(@CurrentAuth() ctx: AuthContext, @Body() body: unknown, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const { matKhauCu, matKhauMoi } = parseBody(changePasswordSchema, body);
    return reply(res, await this.auth.changePassword(ctx, matKhauCu, matKhauMoi, clientOf(req)));
  }

  @AllowStages('cho_ma_2_lop', 'can_cai_2_lop', 'phai_doi_mat_khau', 'day_du')
  @Post('dang-xuat')
  @HttpCode(200)
  async logout(@CurrentAuth() ctx: AuthContext, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    await this.auth.logout(ctx, clientOf(req));
    res.clearCookie(SESSION_COOKIE, { path: '/' });
    return { ok: true };
  }

  /** Thông tin người đang đăng nhập: tên, vai trò, quyền, và bước đăng nhập hiện tại. */
  @AllowStages('cho_ma_2_lop', 'can_cai_2_lop', 'phai_doi_mat_khau', 'day_du')
  @Get('toi')
  me(@CurrentAuth() ctx: AuthContext) {
    const full = ctx.session.stage === 'day_du';
    return {
      id: ctx.user.id,
      email: ctx.user.email,
      hoTen: ctx.user.fullName,
      buoc: ctx.session.stage,
      vaiTro: ctx.roles.map((r) => ({ ma: r, ten: ROLE_LABELS[r] })),
      quyen: full ? permissionsFor(ctx.roles) : [],
    };
  }
}

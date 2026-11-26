import { Body, Controller, ForbiddenException, Get, HttpCode, Param, ParseUUIDPipe, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import { z } from 'zod';
import type { AuthContext } from '../auth/auth.types';
import { CurrentAuth, RequirePermissions } from '../auth/decorators';
import { parseBody } from '../common/validation';
import { SourcingService } from './sourcing.service';
import { SprayService } from './spray.service';

const opt = (max: number) => z.string().trim().max(max).nullish().transform((v) => (v ? v : null));
const spraySchema = z.object({
  thuaId: z.uuid(),
  ngayPhun: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Ngày dạng YYYY-MM-DD'),
  thuoc: z.string().trim().min(2, 'Ghi tên thuốc').max(120),
  hoatChat: opt(200),
  cachLyNgay: z.number().int('Số ngày nguyên').min(0).max(365),
  lieuLuong: opt(120),
  ghiChu: opt(300),
});
const voidSchema = z.object({ lyDo: z.string().trim().min(3, 'Ghi lý do huỷ').max(300) });
const toInput = (b: z.infer<typeof spraySchema>) => ({ plotId: b.thuaId, sprayedOn: b.ngayPhun, product: b.thuoc, activeIngredient: b.hoatChat, phiDays: b.cachLyNgay, dose: b.lieuLuong, note: b.ghiChu });

/** Nhân viên: nhật ký dùng thuốc BVTV theo thửa gia vị. */
@Controller('nhat-ky-thuoc')
export class SprayController {
  constructor(private readonly spray: SprayService) {}

  @RequirePermissions('NGUON_CUNG_XEM')
  @Get(':partnerId')
  list(@Param('partnerId', ParseUUIDPipe) partnerId: string, @CurrentAuth() ctx: AuthContext) {
    return this.spray.list(partnerId, ctx);
  }

  @RequirePermissions('NGUON_CUNG_QUAN_LY')
  @Post()
  create(@Body() body: unknown, @CurrentAuth() ctx: AuthContext, @Req() req: Request) {
    return this.spray.create(toInput(parseBody(spraySchema, body)), ctx, req.ip ?? null);
  }

  @RequirePermissions('NGUON_CUNG_QUAN_LY')
  @Post(':id/huy')
  @HttpCode(200)
  async void(@Param('id', ParseUUIDPipe) id: string, @Body() body: unknown, @CurrentAuth() ctx: AuthContext, @Req() req: Request) {
    await this.spray.void(id, parseBody(voidSchema, body).lyDo, ctx, req.ip ?? null);
    return { ok: true };
  }
}

/** Cổng nhà cung cấp: ghi nhật ký thuốc cho thửa của mình. */
@Controller('cong/nhat-ky-thuoc')
export class PortalSprayController {
  constructor(
    private readonly spray: SprayService,
    private readonly sourcing: SourcingService,
  ) {}

  private async own(ctx: AuthContext) {
    if (!(await this.sourcing.portalPartner(ctx))) throw new ForbiddenException('Trang này dành cho nhà cung cấp');
  }

  @Get()
  async list(@CurrentAuth() ctx: AuthContext) {
    await this.own(ctx);
    return this.spray.list(null, ctx);
  }

  @Post()
  async create(@Body() body: unknown, @CurrentAuth() ctx: AuthContext, @Req() req: Request) {
    await this.own(ctx);
    return this.spray.create(toInput(parseBody(spraySchema, body)), ctx, req.ip ?? null);
  }

  @Post(':id/huy')
  @HttpCode(200)
  async void(@Param('id', ParseUUIDPipe) id: string, @Body() body: unknown, @CurrentAuth() ctx: AuthContext, @Req() req: Request) {
    await this.own(ctx);
    await this.spray.void(id, parseBody(voidSchema, body).lyDo, ctx, req.ip ?? null);
    return { ok: true };
  }
}

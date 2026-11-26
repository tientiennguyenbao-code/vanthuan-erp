import { Body, Controller, ForbiddenException, Get, Param, ParseUUIDPipe, Put, Query, Req } from '@nestjs/common';
import type { Request } from 'express';
import { z } from 'zod';
import type { AuthContext } from '../auth/auth.types';
import { CurrentAuth, RequirePermissions } from '../auth/decorators';
import { parseBody } from '../common/validation';
import { PlanService } from './plan.service';
import { SourcingService } from './sourcing.service';

const estimateSchema = z.object({
  thuaId: z.uuid(),
  thang: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Tháng dạng YYYY-MM'),
  khoiLuongKg: z.number().min(0, 'Khối lượng không được âm').max(100_000_000),
  ghiChu: z.string().trim().max(300).nullish(),
});
const toInput = (b: z.infer<typeof estimateSchema>) => ({ plotId: b.thuaId, month: b.thang, estimatedKg: b.khoiLuongKg, note: b.ghiChu ?? null });

/** Nhân viên: kế hoạch thu mua theo ngành, và sản lượng ước tính theo thửa. */
@Controller('ke-hoach-thu-mua')
export class PlanController {
  constructor(private readonly plan: PlanService) {}

  @RequirePermissions('NGUON_CUNG_XEM')
  @Get()
  overview(@Query('nganh') sector: string | undefined, @CurrentAuth() ctx: AuthContext) {
    return this.plan.plan(sector || 'ca_phe', ctx);
  }

  @RequirePermissions('NGUON_CUNG_XEM')
  @Get('uoc-tinh/:partnerId')
  estimates(@Param('partnerId', ParseUUIDPipe) partnerId: string, @CurrentAuth() ctx: AuthContext) {
    return this.plan.estimates(partnerId, ctx);
  }

  @RequirePermissions('NGUON_CUNG_QUAN_LY')
  @Put('uoc-tinh')
  setEstimate(@Body() body: unknown, @CurrentAuth() ctx: AuthContext, @Req() req: Request) {
    return this.plan.setEstimate(toInput(parseBody(estimateSchema, body)), ctx, req.ip ?? null);
  }
}

/** Cổng nhà cung cấp: khai sản lượng ước tính cho thửa của mình. */
@Controller('cong/uoc-tinh')
export class PortalPlanController {
  constructor(
    private readonly plan: PlanService,
    private readonly sourcing: SourcingService,
  ) {}

  private async own(ctx: AuthContext) {
    if (!(await this.sourcing.portalPartner(ctx))) throw new ForbiddenException('Trang này dành cho nhà cung cấp');
  }

  @Get()
  async estimates(@CurrentAuth() ctx: AuthContext) {
    await this.own(ctx);
    return this.plan.estimates(null, ctx);
  }

  @Put()
  async setEstimate(@Body() body: unknown, @CurrentAuth() ctx: AuthContext, @Req() req: Request) {
    await this.own(ctx);
    return this.plan.setEstimate(toInput(parseBody(estimateSchema, body)), ctx, req.ip ?? null);
  }
}

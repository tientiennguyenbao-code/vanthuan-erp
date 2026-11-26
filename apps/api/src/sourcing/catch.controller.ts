import { Body, Controller, ForbiddenException, Get, HttpCode, Param, ParseUUIDPipe, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import { z } from 'zod';
import type { AuthContext } from '../auth/auth.types';
import { CurrentAuth, RequirePermissions } from '../auth/decorators';
import { parseBody } from '../common/validation';
import { CatchService } from './catch.service';
import { SourcingService } from './sourcing.service';

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Ngày dạng YYYY-MM-DD');
const opt = (max: number) => z.string().trim().max(max).nullish().transform((v) => (v ? v : null));
const vesselSchema = z.object({
  doiTacId: z.uuid().nullish(),
  soDangKy: z.string().trim().min(4, 'Ghi số đăng ký tàu').max(40),
  ten: opt(120),
  chuTau: z.string().trim().min(2, 'Ghi tên chủ tàu').max(120),
  quocTich: z.string().trim().length(2).default('VN'),
  daiM: z.number().positive().max(200).nullish().transform((v) => v ?? null),
  nghe: z.string().trim().min(2, 'Ghi nghề khai thác').max(80),
  giayPhep: opt(60),
  giayPhepDen: day.nullish().transform((v) => v ?? null),
  coVms: z.boolean().default(false),
  ghiChu: opt(300),
});
const tripSchema = z.object({
  tauId: z.uuid(),
  ngayDi: day,
  ngayCap: day,
  cang: z.string().trim().min(2, 'Ghi cảng cá cập bến').max(120),
  vungKhaiThac: z.string().trim().min(2, 'Ghi vùng khai thác').max(120),
  loai: z.string().trim().min(2, 'Ghi loài').max(120),
  sanLuongKg: z.number().positive('Sản lượng phải lớn hơn 0').max(10_000_000),
  giayKhaiThac: opt(60),
  noiCapGiay: opt(200),
  ngayCapGiay: day.nullish().transform((v) => v ?? null),
  ghiChu: opt(300),
});
const voidSchema = z.object({ lyDo: z.string().trim().min(3, 'Ghi lý do huỷ').max(300) });
const toVessel = (b: z.infer<typeof vesselSchema>) => ({
  partnerId: b.doiTacId ?? null, registrationNo: b.soDangKy, name: b.ten, ownerName: b.chuTau, flag: b.quocTich.toUpperCase(), lengthM: b.daiM, gear: b.nghe,
  licenseNo: b.giayPhep, licenseValidUntil: b.giayPhepDen, hasVms: b.coVms, note: b.ghiChu,
});
const toTrip = (b: z.infer<typeof tripSchema>) => ({
  vesselId: b.tauId, departedOn: b.ngayDi, landedOn: b.ngayCap, landingPort: b.cang, fishingArea: b.vungKhaiThac, species: b.loai, catchKg: b.sanLuongKg,
  certificateNo: b.giayKhaiThac, certificateIssuer: b.noiCapGiay, certificateDate: b.ngayCapGiay, note: b.ghiChu,
});

/** Nhân viên: tàu cá và chuyến khai thác của nhà cung cấp. */
@Controller('tau-ca')
export class CatchController {
  constructor(private readonly catches: CatchService) {}

  @RequirePermissions('NGUON_CUNG_XEM')
  @Get(':partnerId')
  list(@Param('partnerId', ParseUUIDPipe) partnerId: string, @CurrentAuth() ctx: AuthContext) {
    return this.catches.list(partnerId, ctx);
  }

  @RequirePermissions('NGUON_CUNG_QUAN_LY')
  @Post()
  createVessel(@Body() body: unknown, @CurrentAuth() ctx: AuthContext, @Req() req: Request) {
    return this.catches.createVessel(toVessel(parseBody(vesselSchema, body)), ctx, req.ip ?? null);
  }

  @RequirePermissions('NGUON_CUNG_QUAN_LY')
  @Post(':id/huy')
  @HttpCode(200)
  async voidVessel(@Param('id', ParseUUIDPipe) id: string, @Body() body: unknown, @CurrentAuth() ctx: AuthContext, @Req() req: Request) {
    await this.catches.voidVessel(id, parseBody(voidSchema, body).lyDo, ctx, req.ip ?? null);
    return { ok: true };
  }

  @RequirePermissions('NGUON_CUNG_QUAN_LY')
  @Post('chuyen')
  createTrip(@Body() body: unknown, @CurrentAuth() ctx: AuthContext, @Req() req: Request) {
    return this.catches.createTrip(toTrip(parseBody(tripSchema, body)), ctx, req.ip ?? null);
  }

  @RequirePermissions('NGUON_CUNG_QUAN_LY')
  @Post('chuyen/:id/huy')
  @HttpCode(200)
  async voidTrip(@Param('id', ParseUUIDPipe) id: string, @Body() body: unknown, @CurrentAuth() ctx: AuthContext, @Req() req: Request) {
    await this.catches.voidTrip(id, parseBody(voidSchema, body).lyDo, ctx, req.ip ?? null);
    return { ok: true };
  }
}

/** Cổng nhà cung cấp: ghi tàu và chuyến khai thác của mình. */
@Controller('cong/tau-ca')
export class PortalCatchController {
  constructor(
    private readonly catches: CatchService,
    private readonly sourcing: SourcingService,
  ) {}

  private async own(ctx: AuthContext) {
    if (!(await this.sourcing.portalPartner(ctx))) throw new ForbiddenException('Trang này dành cho nhà cung cấp');
  }

  @Get()
  async list(@CurrentAuth() ctx: AuthContext) {
    await this.own(ctx);
    return this.catches.list(null, ctx);
  }

  @Post()
  async createVessel(@Body() body: unknown, @CurrentAuth() ctx: AuthContext, @Req() req: Request) {
    await this.own(ctx);
    return this.catches.createVessel({ ...toVessel(parseBody(vesselSchema, body)), partnerId: null }, ctx, req.ip ?? null);
  }

  @Post(':id/huy')
  @HttpCode(200)
  async voidVessel(@Param('id', ParseUUIDPipe) id: string, @Body() body: unknown, @CurrentAuth() ctx: AuthContext, @Req() req: Request) {
    await this.own(ctx);
    await this.catches.voidVessel(id, parseBody(voidSchema, body).lyDo, ctx, req.ip ?? null);
    return { ok: true };
  }

  @Post('chuyen')
  async createTrip(@Body() body: unknown, @CurrentAuth() ctx: AuthContext, @Req() req: Request) {
    await this.own(ctx);
    return this.catches.createTrip(toTrip(parseBody(tripSchema, body)), ctx, req.ip ?? null);
  }

  @Post('chuyen/:id/huy')
  @HttpCode(200)
  async voidTrip(@Param('id', ParseUUIDPipe) id: string, @Body() body: unknown, @CurrentAuth() ctx: AuthContext, @Req() req: Request) {
    await this.own(ctx);
    await this.catches.voidTrip(id, parseBody(voidSchema, body).lyDo, ctx, req.ip ?? null);
    return { ok: true };
  }
}

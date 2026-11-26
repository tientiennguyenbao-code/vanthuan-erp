import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { z } from 'zod';
import type { AuthContext } from '../auth/auth.types';
import { CurrentAuth, RequirePermissions } from '../auth/decorators';
import { parseBody } from '../common/validation';
import { AREA_KINDS, PLOT_KINDS, SECTORS } from './sourcing.rules';
import { SourcingService } from './sourcing.service';

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Ngày dạng YYYY-MM-DD');
const optText = (max: number) => z.string().trim().max(max).nullish();
const thisYear = new Date().getFullYear();

const areaSchema = z.object({
  name: z.string().trim().min(2, 'Nhập tên vùng').max(200),
  kind: z.enum(AREA_KINDS),
  sector: z.enum(SECTORS),
  officialCode: optText(80),
  officialCodeIssuer: optText(200),
  commune: optText(120),
  district: optText(120),
  province: z.string().trim().min(2, 'Nhập tỉnh').max(120),
  note: optText(500),
});
const farmerSchema = z.object({
  fullName: z.string().trim().min(2, 'Nhập họ tên chủ hộ').max(200),
  idNumber: optText(20),
  phone: optText(40),
  commune: optText(120),
  district: optText(120),
  province: z.string().trim().min(2, 'Nhập tỉnh').max(120),
  joinedOn: date.nullish(),
  consentOn: date.refine((v) => v <= new Date().toISOString().slice(0, 10), 'Ngày ký đồng ý không được sau hôm nay'),
});
const geometry = z.object({ type: z.string(), coordinates: z.unknown() }).passthrough();
const plotSchema = z.object({
  farmerId: z.uuid(),
  growingAreaId: z.uuid(),
  kind: z.enum(PLOT_KINDS),
  crop: optText(80),
  plantedYear: z.number().int().min(1950).max(thisYear).nullish(),
  geometry,
  declaredAreaHa: z.number().positive().max(10_000).nullish(),
  gpsAccuracyM: z.number().nonnegative().max(10_000).nullish(),
  landDocType: optText(120),
  landDocNumber: optText(80),
});
const geomSchema = z.object({
  geometry,
  declaredAreaHa: z.number().positive().max(10_000).nullish(),
  gpsAccuracyM: z.number().nonnegative().max(10_000).nullish(),
  lyDo: z.string().trim().min(3, 'Ghi lý do đo lại').max(300),
});
const importSchema = z.object({
  growingAreaId: z.uuid(),
  kind: z.enum(PLOT_KINDS),
  crop: optText(80),
  features: z.array(z.unknown()).max(1000),
});
const voidSchema = z.object({ lyDo: z.string().trim().min(3, 'Ghi lý do huỷ').max(300) });

function sendGeojson(res: Response, name: string, data: unknown) {
  res.setHeader('Content-Type', 'application/geo+json; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${name}.geojson"`);
  res.send(JSON.stringify(data));
}

/** Nhân viên: hồ sơ nguồn cung của mọi nhà cung cấp. */
@Controller('nguon-cung')
export class SourcingController {
  constructor(private readonly sourcing: SourcingService) {}

  @RequirePermissions('NGUON_CUNG_XEM')
  @Get()
  async overview(@CurrentAuth() ctx: AuthContext) {
    return { nhaCungCap: await this.sourcing.overview(ctx) };
  }

  @RequirePermissions('NGUON_CUNG_XEM')
  @Get(':partnerId')
  detail(@Param('partnerId', ParseUUIDPipe) id: string, @CurrentAuth() ctx: AuthContext) {
    return this.sourcing.detailForStaff(id, ctx);
  }

  @RequirePermissions('NGUON_CUNG_XEM')
  @Get(':partnerId/geojson')
  async geojson(@Param('partnerId', ParseUUIDPipe) id: string, @Query('vung') vung: string | undefined, @CurrentAuth() ctx: AuthContext, @Res() res: Response) {
    const areaId = vung && z.uuid().safeParse(vung).success ? vung : undefined;
    sendGeojson(res, `thua-${id.slice(0, 8)}`, await this.sourcing.geojson(id, areaId, ctx));
  }

  @RequirePermissions('NGUON_CUNG_QUAN_LY')
  @Post(':partnerId/vung')
  createArea(@Param('partnerId', ParseUUIDPipe) id: string, @Body() body: unknown, @CurrentAuth() ctx: AuthContext, @Req() req: Request) {
    return this.sourcing.createArea(id, parseBody(areaSchema, body), ctx, req.ip ?? null);
  }

  @RequirePermissions('NGUON_CUNG_QUAN_LY')
  @Post(':partnerId/ho')
  createFarmer(@Param('partnerId', ParseUUIDPipe) id: string, @Body() body: unknown, @CurrentAuth() ctx: AuthContext, @Req() req: Request) {
    return this.sourcing.createFarmer(id, parseBody(farmerSchema, body), ctx, req.ip ?? null);
  }

  @RequirePermissions('NGUON_CUNG_QUAN_LY')
  @Post(':partnerId/thua')
  createPlot(@Param('partnerId', ParseUUIDPipe) id: string, @Body() body: unknown, @CurrentAuth() ctx: AuthContext, @Req() req: Request) {
    return this.sourcing.createPlot(id, parseBody(plotSchema, body), ctx, req.ip ?? null);
  }

  @RequirePermissions('NGUON_CUNG_QUAN_LY')
  @Post(':partnerId/nhap-geojson')
  importGeojson(@Param('partnerId', ParseUUIDPipe) id: string, @Body() body: unknown, @CurrentAuth() ctx: AuthContext, @Req() req: Request) {
    return this.sourcing.importGeojson(id, parseBody(importSchema, body), ctx, req.ip ?? null);
  }

  @RequirePermissions('NGUON_CUNG_QUAN_LY')
  @Post('thua/:id/toa-do')
  @HttpCode(200)
  updateGeometry(@Param('id', ParseUUIDPipe) id: string, @Body() body: unknown, @CurrentAuth() ctx: AuthContext, @Req() req: Request) {
    return this.sourcing.updateGeometry(id, parseBody(geomSchema, body), ctx, req.ip ?? null);
  }

  @RequirePermissions('NGUON_CUNG_QUAN_LY')
  @Post('thua/:id/huy')
  @HttpCode(200)
  async voidPlot(@Param('id', ParseUUIDPipe) id: string, @Body() body: unknown, @CurrentAuth() ctx: AuthContext, @Req() req: Request) {
    await this.sourcing.voidPlot(id, parseBody(voidSchema, body).lyDo, ctx, req.ip ?? null);
    return { ok: true };
  }

  @RequirePermissions('NGUON_CUNG_QUAN_LY')
  @Post('ho/:id/huy')
  @HttpCode(200)
  async voidFarmer(@Param('id', ParseUUIDPipe) id: string, @Body() body: unknown, @CurrentAuth() ctx: AuthContext, @Req() req: Request) {
    await this.sourcing.voidFarmer(id, parseBody(voidSchema, body).lyDo, ctx, req.ip ?? null);
    return { ok: true };
  }

  @RequirePermissions('NGUON_CUNG_XEM_CCCD')
  @Get('ho/:id/cccd')
  reveal(@Param('id', ParseUUIDPipe) id: string, @CurrentAuth() ctx: AuthContext, @Req() req: Request) {
    return this.sourcing.revealIdNumber(id, ctx, req.ip ?? null);
  }
}

/** Cổng nhà cung cấp: hồ sơ nông hộ và thửa của chính mình. Vùng trồng do nhân viên Vạn Thuận lập. */
@Controller('cong/nguon-cung')
export class PortalSourcingController {
  constructor(private readonly sourcing: SourcingService) {}

  @Get()
  detail(@CurrentAuth() ctx: AuthContext) {
    return this.sourcing.detailForPortal(ctx);
  }

  @Get('geojson')
  async geojson(@CurrentAuth() ctx: AuthContext, @Res() res: Response) {
    const partnerId = await this.sourcing.portalPartner(ctx);
    if (!partnerId) return res.status(403).json({ message: 'Trang này dành cho nhà cung cấp' });
    sendGeojson(res, 'thua-cua-toi', await this.sourcing.geojson(partnerId, undefined, ctx));
  }

  @Post('ho')
  createFarmer(@Body() body: unknown, @CurrentAuth() ctx: AuthContext, @Req() req: Request) {
    return this.sourcing.createFarmer(null, parseBody(farmerSchema, body), ctx, req.ip ?? null);
  }

  @Post('thua')
  createPlot(@Body() body: unknown, @CurrentAuth() ctx: AuthContext, @Req() req: Request) {
    return this.sourcing.createPlot(null, parseBody(plotSchema, body), ctx, req.ip ?? null);
  }

  @Post('nhap-geojson')
  importGeojson(@Body() body: unknown, @CurrentAuth() ctx: AuthContext, @Req() req: Request) {
    return this.sourcing.importGeojson(null, parseBody(importSchema, body), ctx, req.ip ?? null);
  }

  @Post('thua/:id/toa-do')
  @HttpCode(200)
  updateGeometry(@Param('id', ParseUUIDPipe) id: string, @Body() body: unknown, @CurrentAuth() ctx: AuthContext, @Req() req: Request) {
    return this.sourcing.updateGeometry(id, parseBody(geomSchema, body), ctx, req.ip ?? null);
  }
}

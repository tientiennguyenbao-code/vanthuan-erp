import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Put, Query, Req } from '@nestjs/common';
import type { Request } from 'express';
import { z } from 'zod';
import type { AuthContext } from '../auth/auth.types';
import { CurrentAuth, RequirePermissions } from '../auth/decorators';
import { parseBody } from '../common/validation';
import { FOREST_METHODS, FOREST_RESULTS } from './collection.rules';
import { CollectionService } from './collection.service';
import { ForestService } from './forest.service';

const slipSchema = z.object({
  farmerId: z.uuid().nullish(),
  plotId: z.uuid().nullish(),
  /** Hàng khai thác: chuyến thay cho hộ và thửa */
  catchTripId: z.uuid().nullish(),
  harvestDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Ngày dạng YYYY-MM-DD'),
  quantityKg: z.number().positive('Khối lượng phải lớn hơn 0').max(1_000_000),
  moisturePct: z.number().min(0).max(100).nullish(),
  weighTicketNo: z.string().trim().max(60).nullish(),
  note: z.string().trim().max(300).nullish(),
}).refine((b) => (b.catchTripId ? !b.farmerId && !b.plotId : !!b.farmerId && !!b.plotId), { message: 'Chọn hộ và thửa, hoặc chọn chuyến khai thác', path: ['plotId'] });
const voidSchema = z.object({ lyDo: z.string().trim().min(3, 'Ghi lý do huỷ').max(300) });
const kgHa = z.number().positive().max(100_000).nullable();
const yieldSchema = z.object({ ca_phe: kgHa, gia_vi: kgHa, thuy_san: kgHa });
const areaYieldSchema = z.object({ kgMoiHa: kgHa });
const forestSchema = z.object({
  plotIds: z.array(z.uuid()).min(1, 'Chọn ít nhất một thửa').max(500),
  method: z.enum(FOREST_METHODS),
  result: z.enum(FOREST_RESULTS),
  evidence: z.string().trim().min(5, 'Ghi căn cứ: lớp bản đồ, ngày tra cứu, hoặc biên bản khảo sát').max(1000),
});
const forestReviewSchema = z.object({ ids: z.array(z.uuid()).min(1).max(500), dongY: z.boolean(), ghiChu: z.string().trim().max(500).nullish() });

/** Kiểm tra rừng theo thửa, duyệt 4 mắt. */
@Controller('kiem-tra-rung')
export class ForestController {
  constructor(private readonly forest: ForestService) {}

  @RequirePermissions('NGUON_CUNG_XEM')
  @Get()
  list(@Query('trangThai') status: string | undefined, @Query('nhaCungCap') partnerId: string | undefined, @CurrentAuth() ctx: AuthContext) {
    return this.forest.list({ status: status && /^[a-z_]{3,20}$/.test(status) ? status : undefined, partnerId: partnerId && z.uuid().safeParse(partnerId).success ? partnerId : undefined }, ctx);
  }

  @RequirePermissions('NGUON_CUNG_QUAN_LY')
  @Post()
  submit(@Body() body: unknown, @CurrentAuth() ctx: AuthContext, @Req() req: Request) {
    return this.forest.submit(parseBody(forestSchema, body), ctx, req.ip ?? null);
  }

  @RequirePermissions('NGUON_CUNG_DUYET_RUNG')
  @Post('duyet')
  @HttpCode(200)
  async review(@Body() body: unknown, @CurrentAuth() ctx: AuthContext, @Req() req: Request) {
    await this.forest.review(parseBody(forestReviewSchema, body), ctx, req.ip ?? null);
    return { ok: true };
  }
}

/** Nhân viên: phiếu thu gom của lô mua, và năng suất tối đa. */
@Controller()
export class CollectionController {
  constructor(private readonly collection: CollectionService) {}

  @Get('lo-mua/:id/phieu-thu-gom')
  list(@Param('id', ParseUUIDPipe) id: string, @CurrentAuth() ctx: AuthContext) {
    return this.collection.forLot(id, ctx);
  }

  @Post('lo-mua/:id/phieu-thu-gom')
  create(@Param('id', ParseUUIDPipe) id: string, @Body() body: unknown, @CurrentAuth() ctx: AuthContext, @Req() req: Request) {
    return this.collection.create(id, parseBody(slipSchema, body), ctx, req.ip ?? null);
  }

  @Post('phieu-thu-gom/:id/huy')
  @HttpCode(200)
  async voidSlip(@Param('id', ParseUUIDPipe) id: string, @Body() body: unknown, @CurrentAuth() ctx: AuthContext, @Req() req: Request) {
    await this.collection.voidSlip(id, parseBody(voidSchema, body).lyDo, ctx, req.ip ?? null);
    return { ok: true };
  }

  @RequirePermissions('NGUON_CUNG_XEM')
  @Get('nang-suat')
  yields() {
    return this.collection.yieldOverview();
  }

  @RequirePermissions('NANG_SUAT_DAT')
  @Put('nang-suat')
  async setYields(@Body() body: unknown, @CurrentAuth() ctx: AuthContext) {
    await this.collection.setYieldSetting(parseBody(yieldSchema, body), ctx);
    return { ok: true };
  }

  @RequirePermissions('NANG_SUAT_DAT')
  @Put('nang-suat/vung/:id')
  async setAreaYield(@Param('id', ParseUUIDPipe) id: string, @Body() body: unknown, @CurrentAuth() ctx: AuthContext) {
    await this.collection.setAreaYield(id, parseBody(areaYieldSchema, body).kgMoiHa, ctx);
    return { ok: true };
  }
}

/** Cổng nhà cung cấp: ghi phiếu thu gom cho lô mua của chính mình. */
@Controller('cong/thu-gom')
export class PortalCollectionController {
  constructor(private readonly collection: CollectionService) {}

  @Get()
  lots(@CurrentAuth() ctx: AuthContext) {
    return this.collection.portalLots(ctx);
  }

  @Get(':id')
  list(@Param('id', ParseUUIDPipe) id: string, @CurrentAuth() ctx: AuthContext) {
    return this.collection.forLot(id, ctx);
  }

  @Post(':id')
  create(@Param('id', ParseUUIDPipe) id: string, @Body() body: unknown, @CurrentAuth() ctx: AuthContext, @Req() req: Request) {
    return this.collection.create(id, parseBody(slipSchema, body), ctx, req.ip ?? null);
  }

  @Post('phieu/:id/huy')
  @HttpCode(200)
  async voidSlip(@Param('id', ParseUUIDPipe) id: string, @Body() body: unknown, @CurrentAuth() ctx: AuthContext, @Req() req: Request) {
    await this.collection.voidSlip(id, parseBody(voidSchema, body).lyDo, ctx, req.ip ?? null);
    return { ok: true };
  }
}

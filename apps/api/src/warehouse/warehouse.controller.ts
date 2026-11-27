import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import type { AuthContext } from '../auth/auth.types';
import { CurrentAuth } from '../auth/decorators';
import { parseBody } from '../common/validation';
import { ZONE_KINDS } from './kho.rules';
import { WarehouseService } from './warehouse.service';

const optText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((v) => (v ? v : null));
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Ngày dạng YYYY-MM-DD');

const zoneSchema = z.object({
  ma: z.string().trim().regex(/^[A-Za-z0-9_-]{1,20}$/, 'Mã khu 1–20 ký tự, chỉ chữ, số, gạch'),
  ten: z.string().trim().min(2, 'Ghi tên khu').max(120),
  loai: z.enum(ZONE_KINDS),
  sucChuaKg: z.number().positive().max(1e9).nullish(),
});
const keeperSchema = z.object({ nguoiDungId: z.uuid() });
const receiptSchema = z.object({
  loMuaId: z.uuid(),
  khoId: z.uuid(),
  khuId: z.uuid(),
  ngayNhan: date,
  bienSoXe: optText(30),
  soPhieuCan: optText(60),
  khoiLuongKg: z.number().positive('Khối lượng phải lớn hơn 0').max(1e8),
  soBao: z.number().int().positive().max(1e6).nullish(),
  doAmPhanTram: z.number().min(0).max(100).nullish(),
  ghiChu: optText(1000),
});
const reasonSchema = z.object({ lyDo: z.string().trim().min(3, 'Ghi lý do').max(500) });
const moveSchema = z.object({ khuId: z.uuid(), khoiLuongKg: z.number().positive().max(1e8).nullish() });
const listSchema = z.object({
  khoId: z.uuid().optional(),
  khuId: z.uuid().optional(),
  loMuaId: z.uuid().optional(),
  conHang: z.enum(['1', '0']).optional(),
});

@Controller('kho')
export class WarehouseController {
  constructor(private readonly kho: WarehouseService) {}

  @Get()
  list(@CurrentAuth() ctx: AuthContext) {
    return this.kho.listFacilities(ctx);
  }

  @Get('ton')
  stock(@Query() query: unknown, @CurrentAuth() ctx: AuthContext) {
    const q = parseBody(listSchema, query);
    return this.kho.stockSummary(ctx, { facilityId: q.khoId });
  }

  @Get('lo-ton')
  async stockLots(@Query() query: unknown, @CurrentAuth() ctx: AuthContext) {
    const q = parseBody(listSchema, query);
    return { loTon: await this.kho.listStockLots(ctx, { facilityId: q.khoId, zoneId: q.khuId, purchaseLotId: q.loMuaId, conHang: q.conHang === '1' }) };
  }

  @Get('lo-ton/:id')
  stockLot(@Param('id', ParseUUIDPipe) id: string, @CurrentAuth() ctx: AuthContext) {
    return this.kho.stockLotDetail(id, ctx);
  }

  @Post('lo-ton/:id/chuyen-khu')
  move(@Param('id', ParseUUIDPipe) id: string, @Body() body: unknown, @CurrentAuth() ctx: AuthContext) {
    const b = parseBody(moveSchema, body);
    return this.kho.moveZone(id, { zoneId: b.khuId, quantityKg: b.khoiLuongKg ?? null }, ctx);
  }

  @Get('lo-mua')
  async openLots(@CurrentAuth() ctx: AuthContext) {
    return { loMua: await this.kho.openPurchaseLots(ctx) };
  }

  @Get('nhan-hang')
  async receipts(@Query() query: unknown, @CurrentAuth() ctx: AuthContext) {
    const q = parseBody(listSchema, query);
    return { phieu: await this.kho.listReceipts(ctx, { purchaseLotId: q.loMuaId, facilityId: q.khoId }) };
  }

  @Post('nhan-hang')
  receive(@Body() body: unknown, @CurrentAuth() ctx: AuthContext) {
    const b = parseBody(receiptSchema, body);
    return this.kho.createReceipt(
      {
        purchaseLotId: b.loMuaId,
        facilityId: b.khoId,
        zoneId: b.khuId,
        receivedOn: b.ngayNhan,
        vehicleNo: b.bienSoXe,
        weighTicketNo: b.soPhieuCan,
        quantityKg: b.khoiLuongKg,
        bags: b.soBao ?? null,
        moisturePct: b.doAmPhanTram ?? null,
        note: b.ghiChu,
      },
      ctx,
    );
  }

  @Post('nhan-hang/:id/huy')
  @HttpCode(200)
  async voidReceipt(@Param('id', ParseUUIDPipe) id: string, @Body() body: unknown, @CurrentAuth() ctx: AuthContext) {
    await this.kho.voidReceipt(id, parseBody(reasonSchema, body).lyDo, ctx);
    return { ok: true };
  }

  @Post('khu/:id/ngung')
  @HttpCode(200)
  async deactivateZone(@Param('id', ParseUUIDPipe) id: string, @CurrentAuth() ctx: AuthContext) {
    await this.kho.deactivateZone(id, ctx);
    return { ok: true };
  }

  @Post(':id/khu')
  createZone(@Param('id', ParseUUIDPipe) id: string, @Body() body: unknown, @CurrentAuth() ctx: AuthContext) {
    const b = parseBody(zoneSchema, body);
    return this.kho.createZone(id, { code: b.ma, name: b.ten, kind: b.loai, capacityKg: b.sucChuaKg ?? null }, ctx);
  }

  @Post(':id/thu-kho')
  @HttpCode(200)
  async assign(@Param('id', ParseUUIDPipe) id: string, @Body() body: unknown, @CurrentAuth() ctx: AuthContext) {
    await this.kho.assignKeeper(id, parseBody(keeperSchema, body).nguoiDungId, ctx);
    return { ok: true };
  }

  @Post(':id/thu-kho/:userId/bo')
  @HttpCode(200)
  async unassign(@Param('id', ParseUUIDPipe) id: string, @Param('userId', ParseUUIDPipe) userId: string, @CurrentAuth() ctx: AuthContext) {
    await this.kho.removeKeeper(id, userId, ctx);
    return { ok: true };
  }
}

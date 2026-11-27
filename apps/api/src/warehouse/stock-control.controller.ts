import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import type { AuthContext } from '../auth/auth.types';
import { CurrentAuth } from '../auth/decorators';
import { parseBody } from '../common/validation';
import { CountService } from './count.service';
import { TransferService } from './transfer.service';

const optText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((v) => (v ? v : null));
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Ngày dạng YYYY-MM-DD');

const transferSchema = z.object({ loTonId: z.uuid(), denKhoId: z.uuid(), khoiLuongKg: z.number().positive('Khối lượng chuyển phải lớn hơn 0').max(1e8), ngayChuyen: date, bienSoXe: optText(30), ghiChu: optText(1000) });
const receiveSchema = z.object({ khuId: z.uuid(), khoiLuongNhanKg: z.number().positive('Khối lượng nhận phải lớn hơn 0').max(1e8), ngayNhan: date, soBao: z.number().int().positive().max(1e6).nullish() });
const reasonSchema = z.object({ lyDo: z.string().trim().min(3, 'Ghi lý do').max(500) });
const facilityQuery = z.object({ khoId: z.uuid().optional(), trangThai: z.enum(['dang_dem', 'cho_duyet', 'da_dieu_chinh', 'tu_choi']).optional() });
const openSchema = z.object({ khoId: z.uuid(), ngayDem: date, ghiChu: optText(1000) });
const recordSchema = z.object({ dong: z.array(z.object({ loTonId: z.uuid(), soDemKg: z.number().min(0, 'Số đếm không âm').max(1e8), ghiChu: optText(300) })).min(1).max(1000) });
const decideSchema = z.object({ dongY: z.boolean(), ghiChu: optText(500) });

@Controller('kho')
export class StockControlController {
  constructor(
    private readonly transfers: TransferService,
    private readonly counts: CountService,
  ) {}

  @Get('chuyen-kho')
  async listTransfers(@Query() query: unknown, @CurrentAuth() ctx: AuthContext) {
    const q = parseBody(facilityQuery, query);
    return { phieu: await this.transfers.list(ctx, { facilityId: q.khoId }) };
  }

  @Post('chuyen-kho')
  transfer(@Body() body: unknown, @CurrentAuth() ctx: AuthContext) {
    const b = parseBody(transferSchema, body);
    return this.transfers.create({ stockLotId: b.loTonId, toFacilityId: b.denKhoId, quantityKg: b.khoiLuongKg, sentOn: b.ngayChuyen, vehicleNo: b.bienSoXe, note: b.ghiChu }, ctx);
  }

  @Post('chuyen-kho/:id/nhan')
  @HttpCode(200)
  receive(@Param('id', ParseUUIDPipe) id: string, @Body() body: unknown, @CurrentAuth() ctx: AuthContext) {
    const b = parseBody(receiveSchema, body);
    return this.transfers.receive(id, { zoneId: b.khuId, receivedKg: b.khoiLuongNhanKg, receivedOn: b.ngayNhan, bags: b.soBao ?? null }, ctx);
  }

  @Post('chuyen-kho/:id/huy')
  @HttpCode(200)
  async cancelTransfer(@Param('id', ParseUUIDPipe) id: string, @Body() body: unknown, @CurrentAuth() ctx: AuthContext) {
    await this.transfers.cancel(id, parseBody(reasonSchema, body).lyDo, ctx);
    return { ok: true };
  }

  @Get('kiem-ke')
  async listCounts(@Query() query: unknown, @CurrentAuth() ctx: AuthContext) {
    const q = parseBody(facilityQuery, query);
    return { dot: await this.counts.list(ctx, { facilityId: q.khoId, status: q.trangThai }) };
  }

  @Post('kiem-ke')
  open(@Body() body: unknown, @CurrentAuth() ctx: AuthContext) {
    const b = parseBody(openSchema, body);
    return this.counts.open(b.khoId, b.ngayDem, b.ghiChu, ctx);
  }

  @Post('kiem-ke/:id/so-dem')
  @HttpCode(200)
  async record(@Param('id', ParseUUIDPipe) id: string, @Body() body: unknown, @CurrentAuth() ctx: AuthContext) {
    const b = parseBody(recordSchema, body);
    await this.counts.record(id, b.dong.map((d) => ({ stockLotId: d.loTonId, countedKg: d.soDemKg, note: d.ghiChu })), ctx);
    return { ok: true };
  }

  @Post('kiem-ke/:id/chot')
  @HttpCode(200)
  submit(@Param('id', ParseUUIDPipe) id: string, @CurrentAuth() ctx: AuthContext) {
    return this.counts.submit(id, ctx);
  }

  @Post('kiem-ke/:id/duyet')
  @HttpCode(200)
  async decide(@Param('id', ParseUUIDPipe) id: string, @Body() body: unknown, @CurrentAuth() ctx: AuthContext) {
    const b = parseBody(decideSchema, body);
    await this.counts.decide(id, b.dongY, b.ghiChu, ctx);
    return { ok: true };
  }
}

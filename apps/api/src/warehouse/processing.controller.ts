import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import type { AuthContext } from '../auth/auth.types';
import { CurrentAuth } from '../auth/decorators';
import { parseBody } from '../common/validation';
import { ProcessingService } from './processing.service';

const optText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((v) => (v ? v : null));

const normSchema = z.object({
  nganh: z.string().min(1),
  congDoan: z.string().min(1),
  phanTram: z.number().min(0, 'Định mức từ 0%').max(100, 'Định mức tối đa 100%'),
});
const orderSchema = z.object({
  khoId: z.uuid(),
  congDoan: z.string().min(1, 'Chọn công đoạn'),
  ngay: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Ngày dạng YYYY-MM-DD'),
  dauVao: z.array(z.object({ loTonId: z.uuid(), khoiLuongKg: z.number().positive('Khối lượng lấy vào phải lớn hơn 0').max(1e8) })).min(1, 'Chọn ít nhất một lô tồn đầu vào').max(50),
  dauRa: z
    .array(
      z.object({
        loai: z.enum(['thanh_pham', 'phu_pham']),
        hang: optText(40),
        khoiLuongKg: z.number().positive('Khối lượng đầu ra phải lớn hơn 0').max(1e8),
        soBao: z.number().int().positive().max(1e6).nullish(),
        khuId: z.uuid(),
      }),
    )
    .min(1, 'Ghi ít nhất một dòng đầu ra')
    .max(30),
  lyDoVuot: optText(1000),
  ghiChu: optText(1000),
});
const decideSchema = z.object({ dongY: z.boolean(), ghiChu: optText(500) });
const listSchema = z.object({ khoId: z.uuid().optional(), trangThai: z.enum(['xong', 'cho_duyet', 'tu_choi']).optional() });

@Controller('kho')
export class ProcessingController {
  constructor(private readonly soChe: ProcessingService) {}

  @Get('dinh-muc')
  norms(@CurrentAuth() ctx: AuthContext) {
    return this.soChe.listNorms(ctx);
  }

  @Post('dinh-muc')
  @HttpCode(200)
  async setNorm(@Body() body: unknown, @CurrentAuth() ctx: AuthContext) {
    const b = parseBody(normSchema, body);
    await this.soChe.setNorm(b.nganh, b.congDoan, b.phanTram, ctx);
    return { ok: true };
  }

  @Get('so-che')
  async orders(@Query() query: unknown, @CurrentAuth() ctx: AuthContext) {
    const q = parseBody(listSchema, query);
    return { lenh: await this.soChe.listOrders(ctx, { facilityId: q.khoId, status: q.trangThai }) };
  }

  @Post('so-che')
  create(@Body() body: unknown, @CurrentAuth() ctx: AuthContext) {
    const b = parseBody(orderSchema, body);
    return this.soChe.createOrder(
      {
        facilityId: b.khoId,
        step: b.congDoan,
        processedOn: b.ngay,
        inputs: b.dauVao.map((i) => ({ stockLotId: i.loTonId, quantityKg: i.khoiLuongKg })),
        outputs: b.dauRa.map((o) => ({ kind: o.loai, grade: o.hang, quantityKg: o.khoiLuongKg, bags: o.soBao ?? null, zoneId: o.khuId })),
        overReason: b.lyDoVuot,
        note: b.ghiChu,
      },
      ctx,
    );
  }

  @Post('so-che/:id/duyet')
  @HttpCode(200)
  async decide(@Param('id', ParseUUIDPipe) id: string, @Body() body: unknown, @CurrentAuth() ctx: AuthContext) {
    const b = parseBody(decideSchema, body);
    await this.soChe.decide(id, b.dongY, b.ghiChu, ctx);
    return { ok: true };
  }

  @Get('lo-ton/:id/truy-xuat')
  trace(@Param('id', ParseUUIDPipe) id: string, @CurrentAuth() ctx: AuthContext) {
    return this.soChe.trace(id, ctx);
  }
}

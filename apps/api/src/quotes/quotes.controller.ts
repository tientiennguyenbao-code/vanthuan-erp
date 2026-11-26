import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Put, Query } from '@nestjs/common';
import { z } from 'zod';
import type { AuthContext } from '../auth/auth.types';
import { CurrentAuth } from '../auth/decorators';
import { parseBody } from '../common/validation';
import { CURRENCIES, INCOTERMS, UNITS } from '../contracts/contract.rules';
import { COST_KINDS, costKindsFor, QUOTE_KINDS } from './quote.rules';
import { QuotesService } from './quotes.service';

const optText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((v) => (v ? v : null));
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Ngày dạng YYYY-MM-DD');

const quoteFields = {
  doiTacId: z.uuid(),
  matHangId: z.uuid(),
  baoGiaNguonId: z.uuid().nullish(),
  hoiHangId: z.uuid().nullish(),
  soLuong: z.number().positive('Số lượng phải lớn hơn 0').max(1e9),
  donVi: z.enum(UNITS),
  donGia: z.number().positive('Đơn giá phải lớn hơn 0').max(1e12),
  tienTe: z.enum(CURRENCIES),
  tyGiaUsd: z.number().positive().nullish(),
  incoterms: z.enum(INCOTERMS),
  cangDi: optText(120),
  cangDen: optText(120),
  hieuLucDen: date,
  quyCach: optText(2000),
  chungNhan: optText(500),
  thoiGianGiao: optText(300),
  thangGiao: z
    .string()
    .regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Tháng giao dạng YYYY-MM')
    .nullish()
    .transform((v) => v ?? null),
  thanhToan: optText(500),
  tyLePhiPhanTram: z.number().min(0).max(100).nullish(),
  ghiChu: optText(2000),
  nguoiPhuTrachId: z.uuid().nullish(),
};
const createSchema = z.object({ loai: z.enum(QUOTE_KINDS), ...quoteFields });
const updateSchema = z.object(quoteFields);
const costSchema = z.object({
  dong: z
    .array(
      z.object({
        loai: z.enum(COST_KINDS),
        moTa: optText(200),
        soTien: z.number().min(0).max(1e12),
        tienTe: z.enum(CURRENCIES),
        tyGiaUsd: z.number().positive().nullish(),
      }),
    )
    .max(30),
});
const reasonSchema = z.object({ lyDo: z.string().trim().min(3, 'Ghi lý do').max(500) });
const acceptSchema = z.object({ loaiGiaoDich: z.enum(['mua_dut', 'moi_gioi']).default('mua_dut') });
const listSchema = z.object({ loai: z.enum(QUOTE_KINDS).optional(), trangThai: z.string().max(20).optional(), matHangId: z.uuid().optional(), q: z.string().max(100).optional() });

function toInput(b: z.infer<typeof updateSchema>) {
  return {
    partnerId: b.doiTacId,
    commodityId: b.matHangId,
    sourceQuoteId: b.baoGiaNguonId ?? null,
    inquiryId: b.hoiHangId ?? null,
    quantity: b.soLuong,
    unit: b.donVi,
    unitPrice: b.donGia,
    currency: b.tienTe,
    fxPerUsd: b.tyGiaUsd ?? null,
    incoterms: b.incoterms,
    portFrom: b.cangDi,
    portTo: b.cangDen,
    validUntil: b.hieuLucDen,
    spec: b.quyCach,
    certifications: b.chungNhan,
    deliveryTime: b.thoiGianGiao,
    deliveryMonth: b.thangGiao,
    paymentTerms: b.thanhToan,
    feeRatePct: b.tyLePhiPhanTram ?? null,
    note: b.ghiChu,
    ownerUserId: b.nguoiPhuTrachId ?? null,
  };
}

@Controller('bao-gia')
export class QuotesController {
  constructor(private readonly quotes: QuotesService) {}

  @Get()
  async list(@Query() query: unknown, @CurrentAuth() ctx: AuthContext) {
    const q = parseBody(listSchema, query);
    return { baoGia: await this.quotes.list(ctx, { kind: q.loai, status: q.trangThai, commodityId: q.matHangId, q: q.q }) };
  }

  @Get('so-sanh')
  async compare(@Query('matHangId', ParseUUIDPipe) matHangId: string, @CurrentAuth() ctx: AuthContext) {
    return { baoGia: await this.quotes.compare(matHangId, ctx) };
  }

  @Get('chi-phi-goi-y')
  suggest(@Query('incoterms') incoterms: string) {
    return { loai: costKindsFor(incoterms ?? '') };
  }

  @Get(':id')
  get(@Param('id', ParseUUIDPipe) id: string, @CurrentAuth() ctx: AuthContext) {
    return this.quotes.get(id, ctx);
  }

  @Post()
  create(@Body() body: unknown, @CurrentAuth() ctx: AuthContext) {
    const b = parseBody(createSchema, body);
    return this.quotes.create({ kind: b.loai, ...toInput(b) }, ctx);
  }

  @Put(':id')
  async update(@Param('id', ParseUUIDPipe) id: string, @Body() body: unknown, @CurrentAuth() ctx: AuthContext) {
    await this.quotes.update(id, toInput(parseBody(updateSchema, body)), ctx);
    return { ok: true };
  }

  @Put(':id/chi-phi')
  async costs(@Param('id', ParseUUIDPipe) id: string, @Body() body: unknown, @CurrentAuth() ctx: AuthContext) {
    const b = parseBody(costSchema, body);
    await this.quotes.setCostLines(
      id,
      b.dong.map((d) => ({ kind: d.loai, description: d.moTa, amount: d.soTien, currency: d.tienTe, fxPerUsd: d.tyGiaUsd ?? null })),
      ctx,
    );
    return { ok: true };
  }

  @Post(':id/gui')
  @HttpCode(200)
  async send(@Param('id', ParseUUIDPipe) id: string, @CurrentAuth() ctx: AuthContext) {
    await this.quotes.send(id, ctx);
    return { ok: true };
  }

  @Post(':id/sua-doi')
  @HttpCode(200)
  async revise(@Param('id', ParseUUIDPipe) id: string, @CurrentAuth() ctx: AuthContext) {
    await this.quotes.revise(id, ctx);
    return { ok: true };
  }

  @Post(':id/tu-choi')
  @HttpCode(200)
  async reject(@Param('id', ParseUUIDPipe) id: string, @Body() body: unknown, @CurrentAuth() ctx: AuthContext) {
    await this.quotes.reject(id, parseBody(reasonSchema, body).lyDo, ctx);
    return { ok: true };
  }

  @Post(':id/huy')
  @HttpCode(200)
  async cancel(@Param('id', ParseUUIDPipe) id: string, @Body() body: unknown, @CurrentAuth() ctx: AuthContext) {
    await this.quotes.cancel(id, parseBody(reasonSchema, body).lyDo, ctx);
    return { ok: true };
  }

  @Post(':id/chap-nhan')
  @HttpCode(200)
  accept(@Param('id', ParseUUIDPipe) id: string, @Body() body: unknown, @CurrentAuth() ctx: AuthContext) {
    return this.quotes.accept(id, parseBody(acceptSchema, body ?? {}).loaiGiaoDich, ctx);
  }
}

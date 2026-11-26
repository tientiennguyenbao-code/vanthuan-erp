import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Put, Query } from '@nestjs/common';
import { z } from 'zod';
import type { AuthContext } from '../auth/auth.types';
import { CurrentAuth } from '../auth/decorators';
import { parseBody } from '../common/validation';
import { CURRENCIES, INCOTERMS, UNITS } from '../contracts/contract.rules';
import { CreditService } from './credit.service';
import { InquiriesService } from './inquiries.service';
import { PriceFixingService } from './price-fixing.service';
import { INQUIRY_SOURCES, LOST_REASONS, SAMPLE_KINDS } from './sales.rules';
import { SamplesService } from './samples.service';

const optText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((v) => (v ? v : null));
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Ngày dạng YYYY-MM-DD');

const inquirySchema = z.object({
  doiTacId: z.uuid(),
  matHangId: z.uuid(),
  nguon: z.enum(INQUIRY_SOURCES),
  ngayNhan: date,
  soLuong: z.number().positive('Số lượng phải lớn hơn 0').max(1e9),
  donVi: z.enum(UNITS),
  quyCach: optText(2000),
  chungNhan: optText(500),
  thangGiao: z
    .string()
    .regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Tháng giao dạng YYYY-MM')
    .nullish()
    .transform((v) => v ?? null),
  incoterms: z.enum(INCOTERMS).nullish(),
  cangDen: optText(120),
  giaMucTieu: z.number().positive().max(1e12).nullish(),
  tienTe: z.enum(CURRENCIES).nullish(),
  ghiChu: optText(2000),
  nguoiPhuTrachId: z.uuid().nullish(),
});
const lostSchema = z.object({ lyDo: z.enum(LOST_REASONS), ghiChu: optText(500) });
const reasonSchema = z.object({ lyDo: z.string().trim().min(3, 'Ghi lý do').max(500) });
const listInquirySchema = z.object({ trangThai: z.string().max(20).optional(), doiTacId: z.uuid().optional(), q: z.string().max(100).optional() });

const sampleSchema = z.object({
  loai: z.enum(SAMPLE_KINDS),
  doiTacId: z.uuid(),
  matHangId: z.uuid(),
  hoiHangId: z.uuid().nullish(),
  baoGiaId: z.uuid().nullish(),
  loXuatId: z.uuid().nullish(),
  loMuaId: z.uuid().nullish(),
  khoiLuongG: z.number().int().positive().max(100_000).nullish(),
  moTa: optText(1000),
  luuDen: date.nullish(),
});
const sentSchema = z.object({ hangChuyenPhat: z.string().trim().min(2, 'Ghi hãng chuyển phát').max(100), soVanDon: optText(100), ngayGui: date });
const resultSchema = z.object({ dat: z.boolean(), ngay: date, diemThuNem: z.number().min(0).max(100).nullish(), nhanXet: optText(1000) });
const listSampleSchema = z.object({ loai: z.enum(SAMPLE_KINDS).optional(), trangThai: z.string().max(20).optional(), loXuatId: z.uuid().optional(), hoiHangId: z.uuid().optional() });

function toInquiry(b: z.infer<typeof inquirySchema>) {
  return {
    partnerId: b.doiTacId,
    commodityId: b.matHangId,
    source: b.nguon,
    receivedOn: b.ngayNhan,
    quantity: b.soLuong,
    unit: b.donVi,
    spec: b.quyCach,
    certifications: b.chungNhan,
    deliveryMonth: b.thangGiao,
    incoterms: b.incoterms ?? null,
    portTo: b.cangDen,
    targetPrice: b.giaMucTieu ?? null,
    currency: b.tienTe ?? null,
    note: b.ghiChu,
    ownerUserId: b.nguoiPhuTrachId ?? null,
  };
}

@Controller('hoi-hang')
export class InquiriesController {
  constructor(private readonly inquiries: InquiriesService) {}

  @Get()
  list(@Query() query: unknown, @CurrentAuth() ctx: AuthContext) {
    const q = parseBody(listInquirySchema, query);
    return this.inquiries.list(ctx, { status: q.trangThai, partnerId: q.doiTacId, q: q.q });
  }

  @Get(':id')
  get(@Param('id', ParseUUIDPipe) id: string, @CurrentAuth() ctx: AuthContext) {
    return this.inquiries.get(id, ctx);
  }

  @Post()
  create(@Body() body: unknown, @CurrentAuth() ctx: AuthContext) {
    return this.inquiries.create(toInquiry(parseBody(inquirySchema, body)), ctx);
  }

  @Put(':id')
  async update(@Param('id', ParseUUIDPipe) id: string, @Body() body: unknown, @CurrentAuth() ctx: AuthContext) {
    await this.inquiries.update(id, toInquiry(parseBody(inquirySchema, body)), ctx);
    return { ok: true };
  }

  @Post(':id/thua')
  @HttpCode(200)
  async lost(@Param('id', ParseUUIDPipe) id: string, @Body() body: unknown, @CurrentAuth() ctx: AuthContext) {
    const b = parseBody(lostSchema, body);
    await this.inquiries.markLost(id, b.lyDo, b.ghiChu, ctx);
    return { ok: true };
  }

  @Post(':id/huy')
  @HttpCode(200)
  async cancel(@Param('id', ParseUUIDPipe) id: string, @Body() body: unknown, @CurrentAuth() ctx: AuthContext) {
    await this.inquiries.cancel(id, parseBody(reasonSchema, body).lyDo, ctx);
    return { ok: true };
  }
}

@Controller('mau')
export class SamplesController {
  constructor(private readonly samples: SamplesService) {}

  @Get()
  async list(@Query() query: unknown, @CurrentAuth() ctx: AuthContext) {
    const q = parseBody(listSampleSchema, query);
    return { mau: await this.samples.list(ctx, { kind: q.loai, status: q.trangThai, exportLotId: q.loXuatId, inquiryId: q.hoiHangId }) };
  }

  @Post()
  create(@Body() body: unknown, @CurrentAuth() ctx: AuthContext) {
    const b = parseBody(sampleSchema, body);
    return this.samples.create(
      {
        kind: b.loai,
        partnerId: b.doiTacId,
        commodityId: b.matHangId,
        inquiryId: b.hoiHangId ?? null,
        quoteId: b.baoGiaId ?? null,
        exportLotId: b.loXuatId ?? null,
        purchaseLotId: b.loMuaId ?? null,
        weightG: b.khoiLuongG ?? null,
        description: b.moTa,
        retainUntil: b.luuDen ?? null,
      },
      ctx,
    );
  }

  @Post(':id/gui')
  @HttpCode(200)
  async send(@Param('id', ParseUUIDPipe) id: string, @Body() body: unknown, @CurrentAuth() ctx: AuthContext) {
    const b = parseBody(sentSchema, body);
    await this.samples.markSent(id, { courier: b.hangChuyenPhat, trackingNo: b.soVanDon, sentOn: b.ngayGui }, ctx);
    return { ok: true };
  }

  @Post(':id/ket-qua')
  @HttpCode(200)
  async result(@Param('id', ParseUUIDPipe) id: string, @Body() body: unknown, @CurrentAuth() ctx: AuthContext) {
    const b = parseBody(resultSchema, body);
    await this.samples.recordResult(id, { passed: b.dat, resultOn: b.ngay, cupScore: b.diemThuNem ?? null, note: b.nhanXet }, ctx);
    return { ok: true };
  }

  @Post(':id/huy')
  @HttpCode(200)
  async cancel(@Param('id', ParseUUIDPipe) id: string, @Body() body: unknown, @CurrentAuth() ctx: AuthContext) {
    await this.samples.cancel(id, parseBody(reasonSchema, body).lyDo, ctx);
    return { ok: true };
  }
}

const fixationSchema = z.object({
  ngayChot: date,
  soKg: z.number().positive('Khối lượng chốt phải lớn hơn 0').max(1e9),
  giaSan: z.number().positive('Giá sàn phải lớn hơn 0').max(1e6),
  nguoiYeuCau: z.enum(['nguoi_mua', 'van_thuan']).default('nguoi_mua'),
  ghiChu: optText(500),
});
const voidSchema = z.object({ lyDo: z.string().trim().min(3, 'Ghi lý do').max(500) });

/** Chốt giá trừ lùi và điều kiện bán hàng của một lô xuất. */
@Controller('lo-xuat/:id/ban-hang')
export class LotSalesController {
  constructor(private readonly fixing: PriceFixingService) {}

  @Get()
  state(@Param('id', ParseUUIDPipe) id: string, @CurrentAuth() ctx: AuthContext) {
    return this.fixing.state(id, ctx);
  }

  @Post('chot-gia')
  record(@Param('id', ParseUUIDPipe) id: string, @Body() body: unknown, @CurrentAuth() ctx: AuthContext) {
    const b = parseBody(fixationSchema, body);
    return this.fixing.record(id, { fixedOn: b.ngayChot, quantityKg: b.soKg, futuresPrice: b.giaSan, requestedBy: b.nguoiYeuCau, note: b.ghiChu }, ctx);
  }

  @Post('chot-gia/:fid/huy')
  @HttpCode(200)
  async void(@Param('id', ParseUUIDPipe) id: string, @Param('fid', ParseUUIDPipe) fid: string, @Body() body: unknown, @CurrentAuth() ctx: AuthContext) {
    await this.fixing.void(id, fid, parseBody(voidSchema, body).lyDo, ctx);
    return { ok: true };
  }
}

@Controller('hop-dong/:id/thuc-hien')
export class ContractProgressController {
  constructor(private readonly fixing: PriceFixingService) {}

  @Get()
  async get(@Param('id', ParseUUIDPipe) id: string, @CurrentAuth() ctx: AuthContext) {
    return { thucHien: await this.fixing.contractProgress(id, ctx) };
  }
}

const limitSchema = z.object({
  hanMucUsd: z.number().min(0).max(1e10),
  soNgayToiDa: z.number().int().min(1, 'Số ngày từ 1').max(365),
  lyDo: z.string().trim().min(3, 'Ghi lý do đề xuất').max(1000),
});
const decideSchema = z.object({ dongY: z.boolean(), ghiChu: optText(500) });

/** Công nợ và hạn mức nợ của người mua. */
@Controller('cong-no')
export class CreditController {
  constructor(private readonly credit: CreditService) {}

  @Get()
  list(@CurrentAuth() ctx: AuthContext) {
    return this.credit.list(ctx);
  }

  @Get(':partnerId')
  get(@Param('partnerId', ParseUUIDPipe) partnerId: string, @CurrentAuth() ctx: AuthContext) {
    return this.credit.get(partnerId, ctx);
  }

  @Post(':partnerId/han-muc')
  propose(@Param('partnerId', ParseUUIDPipe) partnerId: string, @Body() body: unknown, @CurrentAuth() ctx: AuthContext) {
    const b = parseBody(limitSchema, body);
    return this.credit.propose(partnerId, { amountUsd: b.hanMucUsd, maxDays: b.soNgayToiDa, reason: b.lyDo }, ctx);
  }

  @Post('han-muc/:id/quyet-dinh')
  @HttpCode(200)
  async decide(@Param('id', ParseUUIDPipe) id: string, @Body() body: unknown, @CurrentAuth() ctx: AuthContext) {
    const b = parseBody(decideSchema, body);
    await this.credit.decide(id, { approve: b.dongY, note: b.ghiChu }, ctx);
    return { ok: true };
  }
}

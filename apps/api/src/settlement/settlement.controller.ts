import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import type { AuthContext } from '../auth/auth.types';
import { CurrentAuth } from '../auth/decorators';
import { parseBody } from '../common/validation';
import { CURRENCIES } from '../contracts/contract.rules';
import { ComplaintsService } from './complaints.service';
import { PaymentsService } from './payments.service';
import { COMPLAINT_KINDS, COST_KINDS, FAULTS, FINANCING_KINDS, MILESTONES, PAYMENT_KINDS } from './settlement.rules';
import { SettlementsService } from './settlements.service';

const optText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((v) => (v ? v : null));
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Ngày dạng YYYY-MM-DD');
const money = z.number().positive('Số tiền phải lớn hơn 0').max(1e12);
const fx = z.number().positive('Tỷ giá phải lớn hơn 0').nullish().transform((v) => v ?? null);
const reasonSchema = z.object({ lyDo: z.string().trim().min(3, 'Ghi lý do').max(500) });

const planSchema = z.object({
  loai: z.enum(PAYMENT_KINDS),
  loMuaId: z.uuid().nullish(),
  doiTacId: z.uuid().nullish(),
  moc: z.enum(MILESTONES),
  ngayDenHan: date.nullish(),
  soTien: money,
  tienTe: z.enum(CURRENCIES),
  hangMuc: z.enum(COST_KINDS).nullish(),
  ghiChu: optText(500),
});

const recordSchema = z.object({ soTien: money, ngay: date, tyGia: fx, soThamChieu: optText(100) });

const financingSchema = z.object({
  nganHangId: z.uuid(),
  benVayId: z.uuid(),
  loai: z.enum(FINANCING_KINDS),
  soTien: money,
  tienTe: z.enum(CURRENCIES),
  tyGia: fx,
  tyLePhiPhanTram: z.number().min(0).max(10, 'Tỷ lệ phí thu xếp vốn tối đa 10%'),
  ngayDaoHan: date,
  taiSanBaoDam: optText(500),
  ghiChu: optText(500),
});

const complaintSchema = z.object({
  loai: z.enum(COMPLAINT_KINDS),
  moTa: z.string().trim().min(5, 'Mô tả nội dung khiếu nại').max(2000),
  soTienYeuCau: money.nullish().transform((v) => v ?? null),
  bangChung: optText(2000),
});

const closeSchema = z.object({
  loi: z.enum(FAULTS),
  soTienGiamTru: z.number().min(0).max(1e12),
  loMuaChuyenId: z.uuid().nullish().transform((v) => v ?? null),
  soTienChuyenNcc: money.nullish().transform((v) => v ?? null),
  soPhuLuc: optText(100),
  ketLuan: z.string().trim().min(5, 'Ghi kết luận').max(2000),
});

const prepareSchema = z.object({
  bienDuToanPhanTram: z.number().min(-100).max(100).nullish().transform((v) => v ?? null),
  ghiChu: optText(1000),
});

const toRecord = (b: z.infer<typeof recordSchema>) => ({ amount: b.soTien, paidOn: b.ngay, fxPerUsd: b.tyGia, reference: b.soThamChieu });

@Controller('lo-xuat')
export class LotMoneyController {
  constructor(
    private readonly payments: PaymentsService,
    private readonly complaints: ComplaintsService,
    private readonly settlements: SettlementsService,
  ) {}

  @Get(':id/thanh-toan')
  overview(@Param('id', ParseUUIDPipe) id: string, @CurrentAuth() ctx: AuthContext) {
    return this.payments.overview(id, ctx);
  }

  @Post(':id/thanh-toan')
  plan(@Param('id', ParseUUIDPipe) id: string, @Body() body: unknown, @CurrentAuth() ctx: AuthContext) {
    const b = parseBody(planSchema, body);
    return this.payments.plan(
      id,
      { kind: b.loai, purchaseLotId: b.loMuaId ?? null, partnerId: b.doiTacId ?? null, milestone: b.moc, dueDate: b.ngayDenHan ?? null, amount: b.soTien, currency: b.tienTe, category: b.hangMuc ?? null, note: b.ghiChu },
      ctx,
    );
  }

  @Post(':id/tai-tro')
  financing(@Param('id', ParseUUIDPipe) id: string, @Body() body: unknown, @CurrentAuth() ctx: AuthContext) {
    const b = parseBody(financingSchema, body);
    return this.payments.createFinancing(
      id,
      { bankPartnerId: b.nganHangId, borrowerPartnerId: b.benVayId, kind: b.loai, amount: b.soTien, currency: b.tienTe, fxPerUsd: b.tyGia, feeRatePct: b.tyLePhiPhanTram, dueOn: b.ngayDaoHan, collateral: b.taiSanBaoDam, note: b.ghiChu },
      ctx,
    );
  }

  @Get(':id/khieu-nai')
  complaintsOf(@Param('id', ParseUUIDPipe) id: string, @CurrentAuth() ctx: AuthContext) {
    return this.complaints.listForLot(id, ctx);
  }

  @Post(':id/khieu-nai')
  openComplaint(@Param('id', ParseUUIDPipe) id: string, @Body() body: unknown, @CurrentAuth() ctx: AuthContext) {
    const b = parseBody(complaintSchema, body);
    return this.complaints.open(id, { kind: b.loai, description: b.moTa, claimedAmount: b.soTienYeuCau, evidence: b.bangChung }, ctx);
  }

  @Get(':id/quyet-toan')
  settlement(@Param('id', ParseUUIDPipe) id: string, @CurrentAuth() ctx: AuthContext) {
    return this.settlements.view(id, ctx);
  }

  @Post(':id/quyet-toan')
  prepare(@Param('id', ParseUUIDPipe) id: string, @Body() body: unknown, @CurrentAuth() ctx: AuthContext) {
    const b = parseBody(prepareSchema, body);
    return this.settlements.prepare(id, { estimatePct: b.bienDuToanPhanTram, note: b.ghiChu }, ctx);
  }
}

@Controller('thanh-toan')
export class PaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  @Post(':id/ghi-nhan')
  @HttpCode(204)
  async record(@Param('id', ParseUUIDPipe) id: string, @Body() body: unknown, @CurrentAuth() ctx: AuthContext) {
    await this.payments.record(id, toRecord(parseBody(recordSchema, body)), ctx);
  }

  @Post(':id/huy')
  @HttpCode(204)
  async cancel(@Param('id', ParseUUIDPipe) id: string, @Body() body: unknown, @CurrentAuth() ctx: AuthContext) {
    await this.payments.cancel(id, parseBody(reasonSchema, body).lyDo, ctx);
  }

  @Post(':id/duyet-vuot')
  @HttpCode(204)
  async approveOverpay(@Param('id', ParseUUIDPipe) id: string, @Body() body: unknown, @CurrentAuth() ctx: AuthContext) {
    await this.payments.approveOverpay(id, parseBody(reasonSchema, body).lyDo, ctx);
  }
}

@Controller('tai-tro')
export class FinancingsController {
  constructor(private readonly payments: PaymentsService) {}

  @Post(':id/giai-ngan')
  @HttpCode(204)
  async disburse(@Param('id', ParseUUIDPipe) id: string, @Body() body: unknown, @CurrentAuth() ctx: AuthContext) {
    await this.payments.disburse(id, parseBody(z.object({ ngay: date }), body).ngay, ctx);
  }

  @Post(':id/huy')
  @HttpCode(204)
  async cancel(@Param('id', ParseUUIDPipe) id: string, @Body() body: unknown, @CurrentAuth() ctx: AuthContext) {
    await this.payments.cancelFinancing(id, parseBody(reasonSchema, body).lyDo, ctx);
  }
}

@Controller('khieu-nai')
export class ComplaintsController {
  constructor(private readonly complaints: ComplaintsService) {}

  @Get()
  async list(@CurrentAuth() ctx: AuthContext, @Query('trangThai') status?: string) {
    return { khieuNai: await this.complaints.list(ctx, status) };
  }

  @Post(':id/dong')
  @HttpCode(204)
  async close(@Param('id', ParseUUIDPipe) id: string, @Body() body: unknown, @CurrentAuth() ctx: AuthContext) {
    const b = parseBody(closeSchema, body);
    await this.complaints.close(
      id,
      { fault: b.loi, agreedAmount: b.soTienGiamTru, passBackPurchaseLotId: b.loMuaChuyenId, passBackAmount: b.soTienChuyenNcc, amendmentRef: b.soPhuLuc, resolution: b.ketLuan },
      ctx,
    );
  }
}

@Controller('quyet-toan')
export class SettlementsController {
  constructor(private readonly settlements: SettlementsService) {}

  @Get()
  async list(@CurrentAuth() ctx: AuthContext, @Query('trangThai') status?: string) {
    return { quyetToan: await this.settlements.list(ctx, status) };
  }

  @Post(':id/duyet')
  @HttpCode(204)
  async approve(@Param('id', ParseUUIDPipe) id: string, @CurrentAuth() ctx: AuthContext) {
    await this.settlements.approve(id, ctx);
  }

  @Post(':id/tra-lai')
  @HttpCode(204)
  async returnBack(@Param('id', ParseUUIDPipe) id: string, @Body() body: unknown, @CurrentAuth() ctx: AuthContext) {
    await this.settlements.returnBack(id, parseBody(reasonSchema, body).lyDo, ctx);
  }
}

/** Cổng nhà cung cấp (môi giới): xác nhận đã nhận tiền hàng người mua trả thẳng. */
@Controller('cong/thanh-toan')
export class PortalPaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  @Get()
  async list(@CurrentAuth() ctx: AuthContext) {
    return { khoan: await this.payments.portalPayments(ctx) };
  }

  @Post(':id/da-nhan')
  @HttpCode(204)
  async confirm(@Param('id', ParseUUIDPipe) id: string, @Body() body: unknown, @CurrentAuth() ctx: AuthContext) {
    await this.payments.portalConfirm(id, toRecord(parseBody(recordSchema, body)), ctx);
  }
}

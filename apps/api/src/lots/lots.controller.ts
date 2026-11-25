import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Put, Query } from '@nestjs/common';
import { z } from 'zod';
import type { AuthContext } from '../auth/auth.types';
import { CurrentAuth } from '../auth/decorators';
import { parseBody } from '../common/validation';
import { MARKETS } from './lot.rules';
import { LotsService } from './lots.service';

const optText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((v) => (v ? v : null));
const optDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Ngày dạng YYYY-MM-DD')
  .nullish()
  .transform((v) => v ?? null);
const optTime = z.iso
  .datetime({ offset: true, message: 'Thời điểm không hợp lệ' })
  .nullish()
  .transform((v) => (v ? new Date(v) : null));
const kg = z.number().positive('Khối lượng phải lớn hơn 0').max(1e9);
const reasonSchema = z.object({ lyDo: z.string().trim().min(3, 'Ghi lý do').max(500) });

const purchaseCreate = z.object({
  hopDongId: z.uuid(),
  maVungTrong: optText(100),
  maCoSoDongGoi: optText(100),
  ngayThuHoach: optDate,
  chungNhan: optText(500),
  nguoiPhuTrachId: z.uuid().nullish(),
});
const purchaseEvent = z.object({
  loai: z.enum(['thu_gom', 'so_che', 'nhap_kho']),
  khoiLuongKg: kg,
  haoHutKg: z.number().min(0).max(1e9).nullish(),
  coSoId: z.uuid().nullish(),
  ghiChu: optText(1000),
});
const consentSchema = z.object({ soVanBan: z.string().trim().min(3, 'Ghi số hoặc tên văn bản đồng ý').max(300) });
const exportCreate = z.object({ hopDongDoiUngId: z.uuid(), thiTruong: z.enum(MARKETS), etd: optDate, eta: optDate, nguoiPhuTrachId: z.uuid().nullish() });
const exportUpdate = z.object({ etd: optDate, eta: optDate });
const allocSchema = z.object({ loMuaId: z.uuid(), khoiLuongKg: kg });
const inspectionSchema = z.object({ ketQua: z.enum(['dat', 'khong_dat']), donViGiamDinh: z.string().trim().min(2).max(200), soChungThu: optText(100), ghiChu: optText(1000) });
const bookingSchema = z.object({
  hangTau: z.string().trim().min(2, 'Ghi hãng tàu hoặc forwarder').max(200),
  soBooking: z.string().trim().min(3, 'Ghi số booking').max(100),
  tauChuyen: optText(200),
  cutoffSi: optTime,
  cutoffVgm: optTime,
  cutoffHang: optTime,
  container: z
    .array(z.object({ so: z.string().trim().regex(/^[A-Z]{4}\d{7}$/, 'Số container dạng 4 chữ + 7 số, ví dụ MSKU1234567'), chi: optText(50) }))
    .max(200)
    .default([]),
});
const advanceSchema = z.object({ soVanDon: optText(100), ngayTauChay: optDate });

@Controller('lo-mua')
export class PurchaseLotsController {
  constructor(private readonly lots: LotsService) {}

  @Get()
  async list(@CurrentAuth() ctx: AuthContext, @Query('trangThai') status?: string, @Query('matHangId') commodityId?: string, @Query('loai') dealType?: string, @Query('conHang') conHang?: string) {
    return { loMua: await this.lots.listPurchaseLots(ctx, { status, commodityId: commodityId || undefined, dealType, conHang: conHang === '1' }) };
  }

  @Get('hop-dong-kha-dung')
  usable(@CurrentAuth() ctx: AuthContext) {
    return this.lots.usableContracts(ctx);
  }

  @Post()
  create(@Body() body: unknown, @CurrentAuth() ctx: AuthContext) {
    const b = parseBody(purchaseCreate, body);
    return this.lots.createPurchaseLot(
      { contractId: b.hopDongId, growingAreaCode: b.maVungTrong, packingFacilityCode: b.maCoSoDongGoi, harvestDate: b.ngayThuHoach, certifications: b.chungNhan, ownerUserId: b.nguoiPhuTrachId },
      ctx,
    );
  }

  @Get(':id')
  get(@Param('id', ParseUUIDPipe) id: string, @CurrentAuth() ctx: AuthContext) {
    return this.lots.getPurchaseLot(id, ctx);
  }

  @Post(':id/su-kien')
  @HttpCode(200)
  async event(@Param('id', ParseUUIDPipe) id: string, @Body() body: unknown, @CurrentAuth() ctx: AuthContext) {
    const b = parseBody(purchaseEvent, body);
    await this.lots.recordPurchaseEvent(id, { kind: b.loai, quantityKg: b.khoiLuongKg, lossKg: b.haoHutKg, facilityId: b.coSoId, note: b.ghiChu }, ctx);
    return { ok: true };
  }

  @Post(':id/dong-y-chia-lo')
  @HttpCode(200)
  async consent(@Param('id', ParseUUIDPipe) id: string, @Body() body: unknown, @CurrentAuth() ctx: AuthContext) {
    await this.lots.recordSplitConsent(id, parseBody(consentSchema, body).soVanBan, ctx);
    return { ok: true };
  }

  @Post(':id/huy')
  @HttpCode(200)
  async cancel(@Param('id', ParseUUIDPipe) id: string, @Body() body: unknown, @CurrentAuth() ctx: AuthContext) {
    await this.lots.cancelPurchaseLot(id, parseBody(reasonSchema, body).lyDo, ctx);
    return { ok: true };
  }
}

@Controller('lo-xuat')
export class ExportLotsController {
  constructor(private readonly lots: LotsService) {}

  @Get()
  async board(@CurrentAuth() ctx: AuthContext, @Query('trangThai') status?: string, @Query('thiTruong') market?: string, @Query('matHangId') commodityId?: string) {
    return { loXuat: await this.lots.board(ctx, { status, market, commodityId: commodityId || undefined }) };
  }

  @Post()
  create(@Body() body: unknown, @CurrentAuth() ctx: AuthContext) {
    const b = parseBody(exportCreate, body);
    return this.lots.createExportLot({ contractId: b.hopDongDoiUngId, market: b.thiTruong, etd: b.etd, eta: b.eta, ownerUserId: b.nguoiPhuTrachId }, ctx);
  }

  @Get(':id')
  get(@Param('id', ParseUUIDPipe) id: string, @CurrentAuth() ctx: AuthContext) {
    return this.lots.getExportLot(id, ctx);
  }

  @Put(':id')
  async update(@Param('id', ParseUUIDPipe) id: string, @Body() body: unknown, @CurrentAuth() ctx: AuthContext) {
    await this.lots.updateExportLot(id, parseBody(exportUpdate, body), ctx);
    return { ok: true };
  }

  @Post(':id/phan-bo')
  allocate(@Param('id', ParseUUIDPipe) id: string, @Body() body: unknown, @CurrentAuth() ctx: AuthContext) {
    const b = parseBody(allocSchema, body);
    return this.lots.allocate(id, { purchaseLotId: b.loMuaId, quantityKg: b.khoiLuongKg }, ctx);
  }

  @Post(':id/giam-dinh')
  @HttpCode(200)
  async inspect(@Param('id', ParseUUIDPipe) id: string, @Body() body: unknown, @CurrentAuth() ctx: AuthContext) {
    const b = parseBody(inspectionSchema, body);
    await this.lots.recordInspection(id, { result: b.ketQua, provider: b.donViGiamDinh, certificateNo: b.soChungThu, note: b.ghiChu }, ctx);
    return { ok: true };
  }

  @Put(':id/booking')
  async booking(@Param('id', ParseUUIDPipe) id: string, @Body() body: unknown, @CurrentAuth() ctx: AuthContext) {
    const b = parseBody(bookingSchema, body);
    await this.lots.saveBooking(
      id,
      { carrier: b.hangTau, bookingNumber: b.soBooking, vesselVoyage: b.tauChuyen, cutoffSi: b.cutoffSi, cutoffVgm: b.cutoffVgm, cutoffCargo: b.cutoffHang, containers: b.container },
      ctx,
    );
    return { ok: true };
  }

  @Post(':id/chuyen-buoc')
  @HttpCode(200)
  advance(@Param('id', ParseUUIDPipe) id: string, @Body() body: unknown, @CurrentAuth() ctx: AuthContext) {
    const b = parseBody(advanceSchema, body ?? {});
    return this.lots.advance(id, { blNumber: b.soVanDon, shippedOn: b.ngayTauChay }, ctx);
  }

  @Post(':id/huy')
  @HttpCode(200)
  async cancel(@Param('id', ParseUUIDPipe) id: string, @Body() body: unknown, @CurrentAuth() ctx: AuthContext) {
    await this.lots.cancelExportLot(id, parseBody(reasonSchema, body).lyDo, ctx);
    return { ok: true };
  }
}

@Controller('phan-bo')
export class AllocationsController {
  constructor(private readonly lots: LotsService) {}

  @Post(':id/duyet')
  @HttpCode(200)
  async approve(@Param('id', ParseUUIDPipe) id: string, @CurrentAuth() ctx: AuthContext) {
    await this.lots.approveAllocation(id, ctx);
    return { ok: true };
  }

  @Post(':id/huy')
  @HttpCode(200)
  async cancel(@Param('id', ParseUUIDPipe) id: string, @Body() body: unknown, @CurrentAuth() ctx: AuthContext) {
    await this.lots.cancelAllocation(id, parseBody(reasonSchema, body).lyDo, ctx);
    return { ok: true };
  }
}

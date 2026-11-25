import { Body, Controller, Get, HttpCode, Param, ParseIntPipe, ParseUUIDPipe, Post, Put, Query, Req } from '@nestjs/common';
import type { Request } from 'express';
import { z } from 'zod';
import type { AuthContext } from '../auth/auth.types';
import { CurrentAuth, Public, RequirePermissions } from '../auth/decorators';
import { parseBody } from '../common/validation';
import { CONTRACT_KINDS, ContractTerms, CURRENCIES, INCOTERMS, UNITS } from './contract.rules';
import { ContractsService } from './contracts.service';
import { LedgerService } from './ledger.service';

const optText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((v) => (v ? v : null));

const termsSchema = z
  .object({
    soLuong: z.number().positive('Số lượng phải lớn hơn 0').max(1e9),
    donVi: z.enum(UNITS),
    dungSaiPhanTram: z.number().min(0).max(20, 'Dung sai tối đa 20%'),
    donGia: z.number().positive('Đơn giá phải lớn hơn 0').max(1e12),
    tienTe: z.enum(CURRENCIES),
    tyGiaUsd: z.number().positive().nullish(),
    incoterms: z.enum(INCOTERMS),
    cangDi: optText(120),
    cangDen: optText(120),
    lichGiao: z.string().trim().max(500),
    dieuKhoanThanhToan: z.string().trim().max(1000),
    tyLePhiPhanTram: z.number().min(0).max(100).nullish(),
    ghiChu: optText(2000),
  })
  .transform(
    (t): ContractTerms => ({
      ...t,
      tyGiaUsd: t.tienTe === 'USD' ? null : (t.tyGiaUsd ?? null),
      tyLePhiPhanTram: t.tyLePhiPhanTram ?? null,
    }),
  );

const createSchema = z.object({
  loai: z.enum(CONTRACT_KINDS),
  benBanId: z.uuid().nullish(),
  benMuaId: z.uuid().nullish(),
  matHangId: z.uuid(),
  nguoiPhuTrachId: z.uuid().nullish(),
  dieuKhoan: termsSchema,
});
const reasonSchema = z.object({ lyDo: z.string().trim().min(3, 'Ghi lý do').max(500) });
const signSchema = z.object({ ma2Lop: z.string().trim().regex(/^\d{6}$/, 'Mã 2 lớp gồm 6 chữ số') });
const amendSchema = z.object({ lyDo: z.string().trim().min(3, 'Ghi lý do lập phụ lục').max(500), dieuKhoan: termsSchema });
const listSchema = z.object({ q: z.string().max(100).optional(), trangThai: z.string().max(20).optional(), loai: z.string().max(30).optional() });
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Ngày dạng YYYY-MM-DD');
const authorizationSchema = z.object({
  nguoiDuocUyQuyenId: z.uuid(),
  soVanBan: z.string().trim().min(2, 'Nhập số văn bản ủy quyền').max(80),
  tuNgay: date,
  denNgay: date,
  hanMucUsd: z.number().positive().nullish(),
});

/** Ngày theo giờ Việt Nam: bắt đầu từ 0 giờ ngày đầu, hết hạn sau 24 giờ ngày cuối. */
function vnDayStart(d: string) {
  return new Date(`${d}T00:00:00+07:00`);
}
function vnDayEnd(d: string) {
  return new Date(new Date(`${d}T00:00:00+07:00`).getTime() + 24 * 3600 * 1000);
}

function client(req: Request) {
  return { ip: req.ip ?? null, userAgent: req.get('user-agent') ?? null };
}

@Controller('hop-dong')
export class ContractsController {
  constructor(private readonly contracts: ContractsService) {}

  @Get()
  async list(@Query() query: unknown, @CurrentAuth() ctx: AuthContext) {
    const q = parseBody(listSchema, query);
    return { hopDong: await this.contracts.list(ctx, { q: q.q, status: q.trangThai, kind: q.loai }) };
  }

  @Get(':id')
  get(@Param('id', ParseUUIDPipe) id: string, @CurrentAuth() ctx: AuthContext) {
    return this.contracts.get(id, ctx);
  }

  @Get(':id/phien-ban/:v')
  version(@Param('id', ParseUUIDPipe) id: string, @Param('v', ParseIntPipe) v: number, @CurrentAuth() ctx: AuthContext) {
    return this.contracts.versionTerms(id, v, ctx);
  }

  @Post()
  create(@Body() body: unknown, @CurrentAuth() ctx: AuthContext) {
    const b = parseBody(createSchema, body);
    return this.contracts.create(
      { kind: b.loai, sellerPartnerId: b.benBanId, buyerPartnerId: b.benMuaId, commodityId: b.matHangId, ownerUserId: b.nguoiPhuTrachId, terms: b.dieuKhoan },
      ctx,
    );
  }

  @Put(':id/dieu-khoan')
  async update(@Param('id', ParseUUIDPipe) id: string, @Body() body: unknown, @CurrentAuth() ctx: AuthContext) {
    await this.contracts.updateTerms(id, parseBody(termsSchema, body), ctx);
    return { ok: true };
  }

  @Post(':id/trinh-ky')
  @HttpCode(200)
  async submit(@Param('id', ParseUUIDPipe) id: string, @CurrentAuth() ctx: AuthContext) {
    await this.contracts.submit(id, ctx);
    return { ok: true };
  }

  @RequirePermissions('HOP_DONG_DUYET_KY')
  @Post(':id/tra-lai')
  @HttpCode(200)
  async returnForEdit(@Param('id', ParseUUIDPipe) id: string, @Body() body: unknown, @CurrentAuth() ctx: AuthContext) {
    await this.contracts.returnForEdit(id, parseBody(reasonSchema, body).lyDo, ctx);
    return { ok: true };
  }

  @RequirePermissions('HOP_DONG_DUYET_KY')
  @Post(':id/ky')
  @HttpCode(200)
  sign(@Param('id', ParseUUIDPipe) id: string, @Body() body: unknown, @CurrentAuth() ctx: AuthContext, @Req() req: Request) {
    return this.contracts.sign(id, parseBody(signSchema, body).ma2Lop, ctx, client(req));
  }

  @Post(':id/phu-luc')
  amend(@Param('id', ParseUUIDPipe) id: string, @Body() body: unknown, @CurrentAuth() ctx: AuthContext) {
    const b = parseBody(amendSchema, body);
    return this.contracts.amend(id, { reason: b.lyDo, terms: b.dieuKhoan }, ctx);
  }

  @Post(':id/huy')
  @HttpCode(200)
  async cancel(@Param('id', ParseUUIDPipe) id: string, @Body() body: unknown, @CurrentAuth() ctx: AuthContext) {
    await this.contracts.cancel(id, parseBody(reasonSchema, body).lyDo, ctx);
    return { ok: true };
  }
}

@Controller('uy-quyen-ky')
export class SignAuthorizationsController {
  constructor(private readonly contracts: ContractsService) {}

  @RequirePermissions('HOP_DONG_DUYET_KY')
  @Get()
  async list() {
    return { uyQuyen: await this.contracts.listAuthorizations() };
  }

  @RequirePermissions('HOP_DONG_UY_QUYEN')
  @Get('pho-giam-doc')
  async deputies() {
    return { phoGiamDoc: await this.contracts.deputyDirectors() };
  }

  @RequirePermissions('HOP_DONG_UY_QUYEN')
  @Post()
  grant(@Body() body: unknown, @CurrentAuth() ctx: AuthContext) {
    const b = parseBody(authorizationSchema, body);
    return this.contracts.grantAuthorization(
      { granteeUserId: b.nguoiDuocUyQuyenId, documentRef: b.soVanBan, validFrom: vnDayStart(b.tuNgay), validTo: vnDayEnd(b.denNgay), maxValueUsd: b.hanMucUsd ?? null },
      ctx,
    );
  }

  @RequirePermissions('HOP_DONG_UY_QUYEN')
  @Post(':id/thu-hoi')
  @HttpCode(200)
  async revoke(@Param('id', ParseUUIDPipe) id: string, @Body() body: unknown, @CurrentAuth() ctx: AuthContext) {
    await this.contracts.revokeAuthorization(id, parseBody(reasonSchema, body).lyDo, ctx);
    return { ok: true };
  }
}

@Controller('so-cai')
export class LedgerController {
  constructor(private readonly ledger: LedgerService) {}

  @RequirePermissions('HOP_DONG_XEM_TAT_CA')
  @Get('kiem-tra')
  verify() {
    return this.ledger.verifyChain();
  }

  @RequirePermissions('HOP_DONG_XEM_TAT_CA')
  @Get('dot-neo')
  async batches() {
    return { dotNeo: await this.ledger.listBatches() };
  }

  @RequirePermissions('HOP_DONG_DUYET_KY')
  @Post('neo')
  @HttpCode(200)
  async anchor() {
    return { dotNeo: await this.ledger.anchorPending() };
  }
}

/** Trang xác minh công khai: không cần đăng nhập, không lộ nội dung hợp đồng. */
@Controller('xac-minh')
export class VerifyController {
  constructor(private readonly contracts: ContractsService) {}

  @Public()
  @Get(':ma')
  verify(@Param('ma') ma: string) {
    return this.contracts.verifyPublic(ma);
  }
}

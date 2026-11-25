import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query, Req } from '@nestjs/common';
import type { Request } from 'express';
import { z } from 'zod';
import type { AuthContext } from '../auth/auth.types';
import { CurrentAuth, RequirePermissions } from '../auth/decorators';
import { parseBody } from '../common/validation';
import { PARTNER_CATEGORIES, PARTNER_ROLES, RISK_RATINGS } from './partner.rules';
import { PartnersService } from './partners.service';

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Ngày dạng YYYY-MM-DD');
const optText = (max: number) => z.string().trim().max(max).nullish();

const partnerSchema = z.object({
  code: z.string().trim().regex(/^[A-Za-z0-9_-]{2,30}$/, 'Mã 2–30 ký tự, chỉ chữ, số, gạch'),
  name: z.string().trim().min(2, 'Nhập tên đối tác').max(200),
  country: z.string().trim().regex(/^[A-Za-z]{2}$/, 'Mã quốc gia 2 chữ cái (VN, US, CN...)'),
  taxCode: optText(50),
  address: optText(300),
  category: z.enum(PARTNER_CATEGORIES),
  roles: z.array(z.enum(PARTNER_ROLES)).min(1, 'Chọn ít nhất một vai'),
  ownerUserId: z.uuid().nullish(),
});
const contactSchema = z.object({
  name: z.string().trim().min(2).max(120),
  position: optText(120),
  email: z.email().nullish(),
  phone: optText(40),
  isPrimary: z.boolean().optional(),
});
const documentSchema = z.object({
  docType: z.string().trim().min(2).max(80),
  number: optText(80),
  issuer: optText(200),
  issuedOn: date.nullish(),
  expiresOn: date.nullish(),
  note: optText(500),
});
const voidSchema = z.object({ lyDo: z.string().trim().min(3, 'Ghi lý do huỷ').max(300) });
const submitSchema = z.object({
  riskRating: z.enum(RISK_RATINGS),
  screeningNote: z.string().trim().min(5, 'Ghi kết quả sàng lọc (danh sách trừng phạt, người có ảnh hưởng chính trị...)').max(1000),
});
const decideSchema = z.object({ dongY: z.boolean(), lyDo: z.string().trim().max(500).optional() });
const listSchema = z.object({ q: z.string().max(100).optional(), vai: z.enum(PARTNER_ROLES).optional(), kyc: z.string().max(20).optional() });

@Controller('doi-tac')
export class PartnersController {
  constructor(private readonly partners: PartnersService) {}

  @RequirePermissions('DOI_TAC_XEM')
  @Get()
  async list(@Query() query: unknown) {
    const q = parseBody(listSchema, query);
    return { doiTac: await this.partners.list({ q: q.q, role: q.vai, kyc: q.kyc }) };
  }

  @RequirePermissions('DOI_TAC_XEM')
  @Get('sap-het-han')
  expiring(@Query('ngay') ngay?: string) {
    const days = Math.min(Math.max(Number(ngay) || 30, 1), 365);
    return this.partners.expiring(days);
  }

  @RequirePermissions('DOI_TAC_XEM')
  @Get(':id')
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.partners.get(id);
  }

  @RequirePermissions('DOI_TAC_QUAN_LY')
  @Post()
  create(@Body() body: unknown, @CurrentAuth() ctx: AuthContext, @Req() req: Request) {
    return this.partners.create(parseBody(partnerSchema, body), ctx, req.ip ?? null);
  }

  @RequirePermissions('DOI_TAC_QUAN_LY')
  @Patch(':id')
  async update(@Param('id', ParseUUIDPipe) id: string, @Body() body: unknown, @CurrentAuth() ctx: AuthContext, @Req() req: Request) {
    await this.partners.update(id, parseBody(partnerSchema.omit({ code: true }).partial(), body), ctx, req.ip ?? null);
    return { ok: true };
  }

  @RequirePermissions('DOI_TAC_QUAN_LY')
  @Post(':id/lien-he')
  addContact(@Param('id', ParseUUIDPipe) id: string, @Body() body: unknown, @CurrentAuth() ctx: AuthContext, @Req() req: Request) {
    return this.partners.addContact(id, parseBody(contactSchema, body), ctx, req.ip ?? null);
  }

  @RequirePermissions('DOI_TAC_QUAN_LY')
  @Post(':id/tai-lieu')
  addDocument(@Param('id', ParseUUIDPipe) id: string, @Body() body: unknown, @CurrentAuth() ctx: AuthContext, @Req() req: Request) {
    return this.partners.addDocument(id, parseBody(documentSchema, body), ctx, req.ip ?? null);
  }

  @RequirePermissions('DOI_TAC_QUAN_LY')
  @Post(':id/tai-lieu/:docId/huy')
  @HttpCode(200)
  async voidDocument(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('docId', ParseUUIDPipe) docId: string,
    @Body() body: unknown,
    @CurrentAuth() ctx: AuthContext,
    @Req() req: Request,
  ) {
    await this.partners.voidDocument(id, docId, parseBody(voidSchema, body).lyDo, ctx, req.ip ?? null);
    return { ok: true };
  }

  @RequirePermissions('DOI_TAC_QUAN_LY')
  @Post(':id/trinh-tham-dinh')
  @HttpCode(200)
  async submit(@Param('id', ParseUUIDPipe) id: string, @Body() body: unknown, @CurrentAuth() ctx: AuthContext, @Req() req: Request) {
    await this.partners.submitKyc(id, parseBody(submitSchema, body), ctx, req.ip ?? null);
    return { ok: true };
  }

  @RequirePermissions('DOI_TAC_DUYET')
  @Post(':id/quyet-dinh-tham-dinh')
  @HttpCode(200)
  async decide(@Param('id', ParseUUIDPipe) id: string, @Body() body: unknown, @CurrentAuth() ctx: AuthContext, @Req() req: Request) {
    const d = parseBody(decideSchema, body);
    await this.partners.decideKyc(id, { approve: d.dongY, reason: d.lyDo }, ctx, req.ip ?? null);
    return { ok: true };
  }
}

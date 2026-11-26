import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Put, Query, Res, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { z } from 'zod';
import type { AuthContext } from '../auth/auth.types';
import { CurrentAuth } from '../auth/decorators';
import { SECTORS } from '../catalog/catalog.controller';
import { parseBody } from '../common/validation';
import { INCOTERMS } from '../contracts/contract.rules';
import { MAX_FILE_BYTES } from '../documents/file.rules';
import { EDITABLE_STATUSES, PARTIES, REQUIREMENTS, SCOPES, STAGES } from '../documents/doc.rules';
import { DocumentsService, type UploadedFile as Tep } from './documents.service';
import { MARKETS } from './lot.rules';

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
const reasonSchema = z.object({ lyDo: z.string().trim().min(3, 'Ghi lý do').max(500) });

const ruleSchema = z.object({
  ma: z
    .string()
    .trim()
    .regex(/^[a-z0-9_]{2,60}$/, 'Mã gồm chữ thường, số và dấu gạch dưới'),
  ten: z.string().trim().min(3, 'Ghi tên chứng từ').max(300),
  nganh: z.enum(SECTORS).nullish(),
  thiTruong: z.enum(MARKETS).nullish(),
  incoterms: z.array(z.enum(INCOTERMS)).max(11).nullish(),
  loaiGiaoDich: z.enum(['mua_dut', 'moi_gioi']).nullish(),
  yeuCau: z.enum(REQUIREMENTS),
  giaiDoan: z.enum(STAGES),
  phamVi: z.enum(SCOPES),
  benLam: z.enum(PARTIES),
  noiCap: optText(300),
  canCu: optText(1000),
  chuaChac: z.boolean().default(false),
  ghiChu: optText(1000),
  hieuLuc: z.boolean().default(true),
});

const docSchema = z.object({
  trangThai: z.enum(EDITABLE_STATUSES),
  so: optText(100),
  ngayCap: optDate,
  noiCap: optText(300),
  ngayHetHan: optDate,
  ghiChu: optText(1000),
});

const toRule = (b: z.infer<typeof ruleSchema>) => ({
  code: b.ma,
  name: b.ten,
  sector: b.nganh ?? null,
  market: b.thiTruong ?? null,
  incoterms: b.incoterms?.length ? b.incoterms : null,
  dealType: b.loaiGiaoDich ?? null,
  requirement: b.yeuCau,
  stage: b.giaiDoan,
  scope: b.phamVi,
  party: b.benLam,
  issuer: b.noiCap,
  legalBasis: b.canCu,
  uncertain: b.chuaChac,
  note: b.ghiChu,
  active: b.hieuLuc,
});

@Controller('quy-tac-chung-tu')
export class DocRulesController {
  constructor(private readonly docs: DocumentsService) {}

  @Get()
  async list(@CurrentAuth() ctx: AuthContext, @Query('thiTruong') market?: string, @Query('nganh') sector?: string) {
    return { quyTac: await this.docs.listRules(ctx, { market: market || undefined, sector: sector || undefined }) };
  }

  @Post()
  create(@Body() body: unknown, @CurrentAuth() ctx: AuthContext) {
    return this.docs.createRule(toRule(parseBody(ruleSchema, body)), ctx);
  }

  @Put(':id')
  @HttpCode(204)
  async update(@Param('id', ParseUUIDPipe) id: string, @Body() body: unknown, @CurrentAuth() ctx: AuthContext) {
    await this.docs.updateRule(id, toRule(parseBody(ruleSchema, body)), ctx);
  }

  @Post(':id/da-ra-soat')
  @HttpCode(204)
  async reviewed(@Param('id', ParseUUIDPipe) id: string, @CurrentAuth() ctx: AuthContext) {
    await this.docs.markRuleReviewed(id, ctx);
  }
}

@Controller('lo-xuat')
export class LotDocumentsController {
  constructor(private readonly docs: DocumentsService) {}

  @Get(':id/chung-tu')
  checklist(@Param('id', ParseUUIDPipe) id: string, @CurrentAuth() ctx: AuthContext) {
    return this.docs.checklist(id, ctx);
  }

  @Post(':id/chung-tu/dong-bo')
  @HttpCode(204)
  async resync(@Param('id', ParseUUIDPipe) id: string, @CurrentAuth() ctx: AuthContext) {
    await this.docs.resync(id, ctx);
  }

  @Post(':id/mo-chan')
  @HttpCode(204)
  async override(@Param('id', ParseUUIDPipe) id: string, @Body() body: unknown, @CurrentAuth() ctx: AuthContext) {
    await this.docs.overrideGate(id, parseBody(reasonSchema, body).lyDo, ctx);
  }
}

@Controller('chung-tu')
export class DocumentsController {
  constructor(private readonly docs: DocumentsService) {}

  @Put(':id')
  @HttpCode(204)
  async update(@Param('id', ParseUUIDPipe) id: string, @Body() body: unknown, @CurrentAuth() ctx: AuthContext) {
    const b = parseBody(docSchema, body);
    await this.docs.updateDoc(id, { status: b.trangThai, number: b.so, issuedOn: b.ngayCap, issuer: b.noiCap, expiresOn: b.ngayHetHan, note: b.ghiChu }, ctx);
  }

  @Post(':id/duyet')
  @HttpCode(204)
  async approve(@Param('id', ParseUUIDPipe) id: string, @CurrentAuth() ctx: AuthContext) {
    await this.docs.approveDoc(id, ctx);
  }

  /** Tải tệp lên (trường "tep", PDF/JPG/PNG, tối đa 25 MB). */
  @Post(':id/tep')
  @UseInterceptors(FileInterceptor('tep', { limits: { fileSize: MAX_FILE_BYTES, files: 1 } }))
  upload(@Param('id', ParseUUIDPipe) id: string, @UploadedFile() file: Tep | undefined, @CurrentAuth() ctx: AuthContext) {
    return this.docs.uploadFile(id, file, ctx);
  }

  @Post(':id/tra-lai')
  @HttpCode(204)
  async giveBack(@Param('id', ParseUUIDPipe) id: string, @Body() body: unknown, @CurrentAuth() ctx: AuthContext) {
    await this.docs.returnDoc(id, parseBody(reasonSchema, body).lyDo, ctx);
  }

  @Post(':id/da-gui')
  @HttpCode(204)
  async sent(@Param('id', ParseUUIDPipe) id: string, @CurrentAuth() ctx: AuthContext) {
    await this.docs.markSent(id, ctx);
  }

  @Post(':id/khong-ap-dung')
  @HttpCode(204)
  async notApplicable(@Param('id', ParseUUIDPipe) id: string, @Body() body: unknown, @CurrentAuth() ctx: AuthContext) {
    await this.docs.markNotApplicable(id, parseBody(reasonSchema, body).lyDo, ctx);
  }
}

@Controller('tep')
export class FilesController {
  constructor(private readonly docs: DocumentsService) {}

  @Post(':id/lien-ket')
  @HttpCode(200)
  link(@Param('id', ParseUUIDPipe) id: string, @CurrentAuth() ctx: AuthContext) {
    return this.docs.fileLink(id, ctx);
  }

  @Get('tai/:token')
  async download(@Param('token') token: string, @CurrentAuth() ctx: AuthContext, @Res() res: Response) {
    const f = await this.docs.download(token, ctx);
    res.setHeader('Content-Type', f.mimeType);
    res.setHeader('Content-Length', String(f.data.length));
    res.setHeader('Content-Disposition', `inline; filename="tep.${f.fileName.split('.').pop()}"; filename*=UTF-8''${encodeURIComponent(f.fileName)}`);
    res.setHeader('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; plugin-types application/pdf");
    res.end(f.data);
  }
}

@Controller('de-nghi-thu-phi')
export class FeeRequestsController {
  constructor(private readonly docs: DocumentsService) {}

  @Get()
  async list(@CurrentAuth() ctx: AuthContext, @Query('trangThai') status?: string, @Query('loXuatId') exportLotId?: string) {
    return { deNghi: await this.docs.listFees(ctx, { status: status || undefined, exportLotId: exportLotId || undefined }) };
  }

  @Post(':id/duyet')
  @HttpCode(204)
  async approve(@Param('id', ParseUUIDPipe) id: string, @CurrentAuth() ctx: AuthContext) {
    await this.docs.approveFee(id, ctx);
  }
}

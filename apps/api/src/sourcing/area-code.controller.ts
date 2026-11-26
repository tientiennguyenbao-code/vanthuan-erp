import { Body, Controller, ForbiddenException, Get, HttpCode, Param, ParseUUIDPipe, Post, Query, Req, Res, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Request, Response } from 'express';
import { z } from 'zod';
import type { AuthContext } from '../auth/auth.types';
import { CurrentAuth, RequirePermissions } from '../auth/decorators';
import { parseBody } from '../common/validation';
import { MAX_FILE_BYTES } from '../documents/file.rules';
import { AreaCodeService, type CodeFile } from './area-code.service';
import { SourcingService } from './sourcing.service';

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Ngày dạng YYYY-MM-DD');
const opt = (max: number) => z.string().trim().max(max).nullish().transform((v) => (v ? v : null));
const codeSchema = z.object({
  vungId: z.uuid(),
  ma: z.string().trim().min(3, 'Ghi mã số').max(80),
  noiCap: opt(200),
  ngayCap: day.nullish().transform((v) => v ?? null),
  hieuLucDen: day.nullish().transform((v) => v ?? null),
  phamVi: opt(200),
});
const reviewSchema = z.object({ dongY: z.boolean(), ghiChu: opt(500) });
const reasonSchema = z.object({ lyDo: z.string().trim().min(3, 'Ghi lý do').max(300) });
const STATUSES = ['cho_duyet', 'da_duyet', 'tu_choi', 'thay_the', 'thu_hoi'];
const toInput = (b: z.infer<typeof codeSchema>) => ({ areaId: b.vungId, code: b.ma, issuer: b.noiCap, issuedOn: b.ngayCap, validUntil: b.hieuLucDen, scope: b.phamVi });
const upload = FileInterceptor('tep', { limits: { fileSize: MAX_FILE_BYTES, files: 1 } });

/** Nhân viên: gửi, đối chiếu và duyệt mã số vùng trồng / mã cơ sở nuôi. Quyền chi tiết kiểm trong dịch vụ. */
@Controller('ma-vung')
export class AreaCodeController {
  constructor(private readonly codes: AreaCodeService) {}

  @Get()
  list(@Query('nhaCungCap') partnerId: string | undefined, @Query('trangThai') status: string | undefined, @CurrentAuth() ctx: AuthContext) {
    return this.codes.list({ partnerId: partnerId && z.uuid().safeParse(partnerId).success ? partnerId : null, status: status && STATUSES.includes(status) ? status : undefined }, ctx);
  }

  @RequirePermissions('NGUON_CUNG_QUAN_LY')
  @Post()
  submit(@Body() body: unknown, @CurrentAuth() ctx: AuthContext, @Req() req: Request) {
    return this.codes.submit(toInput(parseBody(codeSchema, body)), ctx, req.ip ?? null);
  }

  @RequirePermissions('NGUON_CUNG_QUAN_LY')
  @Post(':id/tep')
  @UseInterceptors(upload)
  attach(@Param('id', ParseUUIDPipe) id: string, @UploadedFile() file: CodeFile | undefined, @CurrentAuth() ctx: AuthContext, @Req() req: Request) {
    return this.codes.attach(id, file, ctx, req.ip ?? null);
  }

  @Post(':id/lien-ket')
  @HttpCode(200)
  link(@Param('id', ParseUUIDPipe) id: string, @CurrentAuth() ctx: AuthContext) {
    return this.codes.fileLink(id, ctx);
  }

  @Get('tai/:token')
  async download(@Param('token') token: string, @CurrentAuth() ctx: AuthContext, @Res() res: Response) {
    const f = await this.codes.download(token, ctx);
    res.setHeader('Content-Type', f.mimeType);
    res.setHeader('Content-Length', String(f.data.length));
    res.setHeader('Content-Disposition', `inline; filename="tep.${f.fileName.split('.').pop()}"; filename*=UTF-8''${encodeURIComponent(f.fileName)}`);
    res.setHeader('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; plugin-types application/pdf");
    res.end(f.data);
  }

  @RequirePermissions('NGUON_CUNG_DUYET_MA')
  @Post(':id/duyet')
  @HttpCode(200)
  async review(@Param('id', ParseUUIDPipe) id: string, @Body() body: unknown, @CurrentAuth() ctx: AuthContext, @Req() req: Request) {
    const b = parseBody(reviewSchema, body);
    await this.codes.review(id, b.dongY, b.ghiChu, ctx, req.ip ?? null);
    return { ok: true };
  }

  @RequirePermissions('NGUON_CUNG_DUYET_MA')
  @Post(':id/thu-hoi')
  @HttpCode(200)
  async revoke(@Param('id', ParseUUIDPipe) id: string, @Body() body: unknown, @CurrentAuth() ctx: AuthContext, @Req() req: Request) {
    await this.codes.revoke(id, parseBody(reasonSchema, body).lyDo, ctx, req.ip ?? null);
    return { ok: true };
  }
}

/** Cổng nhà cung cấp: gửi mã của vùng mình kèm bản scan; Vạn Thuận đối chiếu và duyệt. */
@Controller('cong/ma-vung')
export class PortalAreaCodeController {
  constructor(
    private readonly codes: AreaCodeService,
    private readonly sourcing: SourcingService,
  ) {}

  private async own(ctx: AuthContext) {
    if (!(await this.sourcing.portalPartner(ctx))) throw new ForbiddenException('Trang này dành cho nhà cung cấp');
  }

  @Get()
  async list(@CurrentAuth() ctx: AuthContext) {
    await this.own(ctx);
    return this.codes.list({}, ctx);
  }

  @Post()
  async submit(@Body() body: unknown, @CurrentAuth() ctx: AuthContext, @Req() req: Request) {
    await this.own(ctx);
    return this.codes.submit(toInput(parseBody(codeSchema, body)), ctx, req.ip ?? null);
  }

  @Post(':id/tep')
  @UseInterceptors(upload)
  async attach(@Param('id', ParseUUIDPipe) id: string, @UploadedFile() file: CodeFile | undefined, @CurrentAuth() ctx: AuthContext, @Req() req: Request) {
    await this.own(ctx);
    return this.codes.attach(id, file, ctx, req.ip ?? null);
  }
}

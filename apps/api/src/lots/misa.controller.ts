import { Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Res } from '@nestjs/common';
import type { Response } from 'express';
import type { AuthContext } from '../auth/auth.types';
import { CurrentAuth } from '../auth/decorators';
import { MisaService } from './misa.service';

function send(res: Response, f: { data: Buffer; mimeType: string; fileName: string }) {
  res.setHeader('Content-Type', f.mimeType);
  res.setHeader('Content-Length', String(f.data.length));
  res.setHeader('Content-Disposition', `attachment; filename="${f.fileName}"`);
  res.setHeader('Cache-Control', 'no-store');
  res.end(f.data);
}

@Controller('xuat-misa')
export class MisaController {
  constructor(private readonly misa: MisaService) {}

  @Get()
  overview(@CurrentAuth() ctx: AuthContext) {
    return this.misa.overview(ctx);
  }

  /** Lập đợt xuất mới gồm mọi đề nghị thu phí đã duyệt chưa xuất; trả về tệp Excel. */
  @Post('phi-tron-goi')
  @HttpCode(200)
  async exportFees(@CurrentAuth() ctx: AuthContext, @Res() res: Response) {
    const f = await this.misa.exportFees(ctx);
    res.setHeader('X-Dot-Xuat', f.code);
    send(res, f);
  }

  @Get(':id/tep')
  async download(@Param('id', ParseUUIDPipe) id: string, @CurrentAuth() ctx: AuthContext, @Res() res: Response) {
    send(res, await this.misa.download(id, ctx));
  }
}

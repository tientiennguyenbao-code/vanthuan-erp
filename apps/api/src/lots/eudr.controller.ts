import { Controller, Get, Param, ParseIntPipe, ParseUUIDPipe, Post, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import type { AuthContext } from '../auth/auth.types';
import { CurrentAuth } from '../auth/decorators';
import { EudrService } from './eudr.service';
import { TraceService } from './trace.service';

/** Gói dữ liệu EUDR của lô xuất. */
@Controller('lo-xuat/:id/goi-eudr')
export class EudrController {
  constructor(private readonly eudr: EudrService) {}

  @Get()
  view(@Param('id', ParseUUIDPipe) id: string, @CurrentAuth() ctx: AuthContext) {
    return this.eudr.view(id, ctx);
  }

  @Post()
  seal(@Param('id', ParseUUIDPipe) id: string, @CurrentAuth() ctx: AuthContext, @Req() req: Request) {
    return this.eudr.seal(id, ctx, req.ip ?? null);
  }

  @Get(':version/geojson')
  async geojson(@Param('id', ParseUUIDPipe) id: string, @Param('version', ParseIntPipe) version: number, @CurrentAuth() ctx: AuthContext, @Res() res: Response) {
    const { name, data } = await this.eudr.geojson(id, version, ctx);
    res.setHeader('Content-Type', 'application/geo+json; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${name}.geojson"`);
    res.send(JSON.stringify(data));
  }
}

/** Truy xuất nguồn gốc của lô xuất (mọi ngành), kèm kiểm theo cặp ngành × thị trường. */
@Controller('lo-xuat/:id/truy-xuat')
export class TraceController {
  constructor(private readonly trace: TraceService) {}

  @Get()
  view(@Param('id', ParseUUIDPipe) id: string, @CurrentAuth() ctx: AuthContext) {
    return this.trace.forExportLot(id, ctx);
  }
}

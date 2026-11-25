import { BadRequestException, Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import { z } from 'zod';
import type { AuthContext } from '../auth/auth.types';
import { CurrentAuth, RequirePermissions } from '../auth/decorators';
import { parseBody } from '../common/validation';
import { CatalogService } from './catalog.service';

export const SECTORS = ['ca_phe', 'gia_vi', 'thuy_san'] as const;

const commoditySchema = z.object({
  code: z.string().trim().regex(/^[A-Za-z0-9_-]{2,30}$/, 'Mã 2–30 ký tự, chỉ chữ, số, gạch'),
  name: z.string().trim().min(2).max(200),
  sector: z.enum(SECTORS),
  hsCode: z.string().trim().regex(/^\d{4}(\.?\d{2}){0,3}$/, 'Mã HS dạng 0901.11 hoặc 09011110').nullish(),
  specFields: z.array(z.string().trim().min(1).max(80)).max(30).default([]),
});
const facilitySchema = z.object({
  name: z.string().trim().min(2).max(200),
  kind: z.enum(['kho', 'xuong_so_che']),
  ownership: z.enum(['thue', 'cua_nha_cung_cap', 'tu_van_hanh']),
  partnerId: z.uuid().nullish(),
  address: z.string().trim().max(300).nullish(),
  capacityKg: z.number().int().positive().nullish(),
  certifications: z.string().trim().max(300).nullish(),
});

@Controller('danh-muc')
export class CatalogController {
  constructor(private readonly catalog: CatalogService) {}

  @RequirePermissions('DOI_TAC_XEM')
  @Get('mat-hang')
  async commodities() {
    return { matHang: await this.catalog.listCommodities() };
  }

  @RequirePermissions('DANH_MUC_QUAN_LY')
  @Post('mat-hang')
  createCommodity(@Body() body: unknown, @CurrentAuth() ctx: AuthContext, @Req() req: Request) {
    return this.catalog.createCommodity(parseBody(commoditySchema, body), ctx.user.id, req.ip ?? null);
  }

  @RequirePermissions('DANH_MUC_QUAN_LY')
  @Post('mat-hang/:id/ngung')
  @HttpCode(200)
  async deactivate(@Param('id', ParseUUIDPipe) id: string, @CurrentAuth() ctx: AuthContext, @Req() req: Request) {
    await this.catalog.setCommodityActive(id, false, ctx.user.id, req.ip ?? null);
    return { ok: true };
  }

  @RequirePermissions('DOI_TAC_XEM')
  @Get('co-so')
  async facilities() {
    return { coSo: await this.catalog.listFacilities() };
  }

  @RequirePermissions('DANH_MUC_QUAN_LY')
  @Post('co-so')
  createFacility(@Body() body: unknown, @CurrentAuth() ctx: AuthContext, @Req() req: Request) {
    const input = parseBody(facilitySchema, body);
    if (input.ownership !== 'tu_van_hanh' && !input.partnerId) {
      throw new BadRequestException('Kho, xưởng đi thuê hoặc của nhà cung cấp phải ghi đối tác sở hữu');
    }
    return this.catalog.createFacility(input, ctx.user.id, req.ip ?? null);
  }
}

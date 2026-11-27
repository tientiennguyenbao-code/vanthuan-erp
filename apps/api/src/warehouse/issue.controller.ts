import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import type { AuthContext } from '../auth/auth.types';
import { CurrentAuth } from '../auth/decorators';
import { parseBody } from '../common/validation';
import { IssueService } from './issue.service';

const optText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((v) => (v ? v : null));

const issueSchema = z.object({
  loXuatId: z.uuid(),
  khoId: z.uuid(),
  ngayXuat: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Ngày dạng YYYY-MM-DD'),
  bienSoXe: optText(30),
  soContainer: optText(30),
  dong: z.array(z.object({ loTonId: z.uuid(), khoiLuongKg: z.number().positive('Khối lượng xuất phải lớn hơn 0').max(1e8) })).min(1, 'Chọn ít nhất một lô tồn').max(50),
  ghiChu: optText(1000),
});
const listSchema = z.object({ khoId: z.uuid().optional(), loXuatId: z.uuid().optional() });
const reasonSchema = z.object({ lyDo: z.string().trim().min(3, 'Ghi lý do').max(500) });

@Controller('kho/xuat-kho')
export class IssueController {
  constructor(private readonly xuat: IssueService) {}

  @Get('lo-xuat')
  async targets(@CurrentAuth() ctx: AuthContext) {
    return { loXuat: await this.xuat.targets(ctx) };
  }

  @Get()
  async list(@Query() query: unknown, @CurrentAuth() ctx: AuthContext) {
    const q = parseBody(listSchema, query);
    return { phieu: await this.xuat.list(ctx, { facilityId: q.khoId, exportLotId: q.loXuatId }) };
  }

  @Post()
  create(@Body() body: unknown, @CurrentAuth() ctx: AuthContext) {
    const b = parseBody(issueSchema, body);
    return this.xuat.create(
      { exportLotId: b.loXuatId, facilityId: b.khoId, issuedOn: b.ngayXuat, vehicleNo: b.bienSoXe, containerNo: b.soContainer, lines: b.dong.map((d) => ({ stockLotId: d.loTonId, quantityKg: d.khoiLuongKg })), note: b.ghiChu },
      ctx,
    );
  }

  @Post(':id/huy')
  @HttpCode(200)
  async void(@Param('id', ParseUUIDPipe) id: string, @Body() body: unknown, @CurrentAuth() ctx: AuthContext) {
    await this.xuat.void(id, parseBody(reasonSchema, body).lyDo, ctx);
    return { ok: true };
  }
}

import { Controller, Get, Query } from '@nestjs/common';
import { z } from 'zod';
import { RequirePermissions } from '../auth/decorators';
import { parseBody } from '../common/validation';
import { AuditService } from './audit.service';

const listSchema = z.object({
  soDong: z.coerce.number().int().min(1).max(200).default(50),
  truocId: z.coerce.number().int().positive().optional(),
  loai: z.string().max(50).optional(),
  ma: z.string().max(100).optional(),
});

@Controller('nhat-ky')
export class AuditController {
  constructor(private readonly audit: AuditService) {}

  @RequirePermissions('NHAT_KY_XEM')
  @Get()
  async list(@Query() query: unknown) {
    const q = parseBody(listSchema, query);
    const rows = await this.audit.list({ limit: q.soDong, beforeId: q.truocId, entityType: q.loai, entityId: q.ma });
    return { dong: rows };
  }

  /** Kiểm tra toàn bộ nhật ký còn nguyên vẹn (không dòng nào bị sửa hoặc rút bỏ). */
  @RequirePermissions('NHAT_KY_XEM')
  @Get('kiem-tra')
  verify() {
    return this.audit.verifyChain();
  }
}

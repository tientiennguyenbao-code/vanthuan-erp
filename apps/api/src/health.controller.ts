import { Controller, Get, Inject } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import { Public } from './auth/decorators';
import { DB, Db } from './db/db';

@Controller('suc-khoe')
export class HealthController {
  constructor(@Inject(DB) private readonly db: Db) {}

  /** Dùng cho máy giám sát: máy chủ và cơ sở dữ liệu còn chạy không. */
  @Public()
  @Get()
  async check() {
    await this.db.execute(sql`select 1`);
    return { ok: true };
  }
}

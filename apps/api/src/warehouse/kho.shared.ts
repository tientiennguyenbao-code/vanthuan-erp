import { ForbiddenException } from '@nestjs/common';
import { and, eq, sql } from 'drizzle-orm';
import type { PgColumn, PgTable } from 'drizzle-orm/pg-core';
import type { AuthContext } from '../auth/auth.types';
import type { DbExecutor } from '../db/db';
import { facilityKeepers } from '../db/schema';

export const r2 = (n: number) => Math.round(n * 100) / 100;

/** Chỉ thủ kho được giao kho này mới ghi phiếu ở kho đó. */
export async function assertKeeperOf(facilityId: string, ctx: AuthContext, exec: DbExecutor, what = 'ghi phiếu kho') {
  if (!ctx.permissions.includes('KHO_GHI_PHIEU')) throw new ForbiddenException(`Chỉ thủ kho ${what}`);
  const [k] = await exec.select().from(facilityKeepers).where(and(eq(facilityKeepers.facilityId, facilityId), eq(facilityKeepers.userId, ctx.user.id)));
  if (!k) throw new ForbiddenException('Bạn chưa được giao kho này');
}

export async function keeperFacilityIds(userId: string, exec: DbExecutor): Promise<Set<string>> {
  return new Set((await exec.select({ f: facilityKeepers.facilityId }).from(facilityKeepers).where(eq(facilityKeepers.userId, userId))).map((x) => x.f));
}

/** Mã tăng dần theo tiền tố, khoá theo tiền tố để hai giao dịch cùng lúc không trùng mã. */
export async function nextKhoCode(tx: DbExecutor, table: PgTable, col: PgColumn, prefix: string, width: number) {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${'kho_code:' + prefix}))`);
  const [{ max }] = await tx
    .select({ max: sql<number | null>`max(substring(${col}, ${prefix.length + 1}::int)::int)` })
    .from(table)
    .where(sql`${col} like ${prefix + '%'}`);
  return `${prefix}${String((max ?? 0) + 1).padStart(width, '0')}`;
}

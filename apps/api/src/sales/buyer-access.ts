import { ForbiddenException } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import type { AuthContext } from '../auth/auth.types';
import type { DbExecutor } from '../db/db';
import { partnerUsers } from '../db/schema';

/** Người mua (đối tác) mà tài khoản cổng này thuộc về; null với tài khoản không phải người mua. */
export async function buyerPartnerOf(ctx: AuthContext, exec: DbExecutor): Promise<string | null> {
  if (!ctx.roles.includes('NGUOI_MUA')) return null;
  const [r] = await exec.select({ p: partnerUsers.partnerId }).from(partnerUsers).where(eq(partnerUsers.userId, ctx.user.id));
  if (!r) throw new ForbiddenException('This account is not linked to a buyer');
  return r.p;
}

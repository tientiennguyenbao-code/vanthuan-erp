import { ForbiddenException } from '@nestjs/common';
import type { AuthContext } from '../auth/auth.types';

/** Bán hàng dùng chung quyền với báo giá và hợp đồng: nhân viên thấy việc của mình, cấp quản lý thấy tất cả. */
export const salesAccess = {
  seeAll: (ctx: AuthContext) => ctx.permissions.includes('HOP_DONG_XEM_TAT_CA'),
  draftAll: (ctx: AuthContext) => ctx.permissions.includes('HOP_DONG_SOAN_TAT_CA'),
  canDraft: (ctx: AuthContext) => ctx.permissions.includes('HOP_DONG_SOAN_TAT_CA') || ctx.permissions.includes('HOP_DONG_SOAN_CUA_MINH'),
  assertUse(ctx: AuthContext) {
    if (!this.seeAll(ctx) && !this.canDraft(ctx)) throw new ForbiddenException('Bạn không có quyền xem việc bán hàng');
  },
  assertDraft(ctx: AuthContext) {
    if (!this.canDraft(ctx)) throw new ForbiddenException('Bạn không có quyền lập phiếu bán hàng');
  },
  canView(ownerUserId: string, ctx: AuthContext) {
    return this.seeAll(ctx) || ownerUserId === ctx.user.id;
  },
  canEdit(ownerUserId: string, ctx: AuthContext) {
    return this.draftAll(ctx) || (this.canDraft(ctx) && ownerUserId === ctx.user.id);
  },
};

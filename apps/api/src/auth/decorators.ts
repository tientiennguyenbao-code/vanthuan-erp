import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';
import type { Permission } from '../permissions/roles';
import type { AuthContext, AuthedRequest, SessionStage } from './auth.types';

export const PUBLIC_KEY = 'vt:public';
export const STAGES_KEY = 'vt:stages';
export const PERMISSIONS_KEY = 'vt:permissions';

/** Không cần đăng nhập. */
export const Public = () => SetMetadata(PUBLIC_KEY, true);

/** Cho phép cả phiên đang ở bước dở dang (mặc định chỉ phiên đầy đủ mới vào được). */
export const AllowStages = (...stages: SessionStage[]) => SetMetadata(STAGES_KEY, stages);

/** Yêu cầu người dùng có ĐỦ tất cả các quyền liệt kê. */
export const RequirePermissions = (...perms: Permission[]) => SetMetadata(PERMISSIONS_KEY, perms);

export const CurrentAuth = createParamDecorator((_: unknown, ctx: ExecutionContext): AuthContext => {
  const req = ctx.switchToHttp().getRequest<AuthedRequest>();
  if (!req.auth) throw new Error('Thiếu thông tin đăng nhập');
  return req.auth;
});

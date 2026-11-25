import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Permission } from '../permissions/roles';
import { AuthService } from './auth.service';
import { AuthedRequest, SESSION_COOKIE, SessionStage } from './auth.types';
import { PERMISSIONS_KEY, PUBLIC_KEY, STAGES_KEY } from './decorators';

/**
 * Cổng kiểm soát chung cho mọi đường dẫn: phải đăng nhập, phiên phải ở đúng bước,
 * và phải có đủ quyền. Đường dẫn nào muốn mở cho người chưa đăng nhập phải ghi rõ @Public().
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly auth: AuthService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const targets = [ctx.getHandler(), ctx.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(PUBLIC_KEY, targets)) return true;

    const req = ctx.switchToHttp().getRequest<AuthedRequest>();
    const token: unknown = req.cookies?.[SESSION_COOKIE];
    if (typeof token !== 'string' || !token) throw new UnauthorizedException('Chưa đăng nhập');

    const auth = await this.auth.resolveSession(token);
    if (!auth) throw new UnauthorizedException('Phiên đăng nhập đã hết hạn, vui lòng đăng nhập lại');

    const stages = this.reflector.getAllAndOverride<SessionStage[]>(STAGES_KEY, targets) ?? ['day_du'];
    if (!stages.includes(auth.session.stage as SessionStage)) {
      throw new ForbiddenException({ message: 'Cần hoàn tất bước đăng nhập', buoc: auth.session.stage });
    }

    const required = this.reflector.getAllAndOverride<Permission[]>(PERMISSIONS_KEY, targets) ?? [];
    const missing = required.filter((p) => !auth.permissions.includes(p));
    if (missing.length) throw new ForbiddenException({ message: 'Bạn không có quyền thực hiện thao tác này', thieuQuyen: missing });

    req.auth = auth;
    return true;
  }
}

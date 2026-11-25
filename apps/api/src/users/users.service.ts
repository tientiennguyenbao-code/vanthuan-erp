import { BadRequestException, ConflictException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, asc, eq, isNull, sql } from 'drizzle-orm';
import { AuditService } from '../audit/audit.service';
import { generateTemporaryPassword, hashPassword } from '../auth/password';
import { DB, Db, DbExecutor } from '../db/db';
import { sessions, userRoles, users } from '../db/schema';
import { isRole, Role, validateRoleSet } from '../permissions/roles';

export interface UserSummary {
  id: string;
  email: string;
  hoTen: string;
  trangThai: string;
  vaiTro: Role[];
  daCai2Lop: boolean;
  lanDangNhapCuoi: Date | null;
}

@Injectable()
export class UsersService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly audit: AuditService,
  ) {}

  async list(): Promise<UserSummary[]> {
    const rows = await this.db
      .select({
        id: users.id,
        email: users.email,
        hoTen: users.fullName,
        trangThai: users.status,
        daCai2Lop: users.totpEnabled,
        lanDangNhapCuoi: users.lastLoginAt,
        vaiTro: sql<string[]>`coalesce(array_agg(${userRoles.role}) filter (where ${userRoles.role} is not null), '{}')`,
      })
      .from(users)
      .leftJoin(userRoles, eq(userRoles.userId, users.id))
      .groupBy(users.id)
      .orderBy(asc(users.fullName));
    return rows.map((r) => ({ ...r, vaiTro: r.vaiTro.filter(isRole) }));
  }

  /** Tạo tài khoản với mật khẩu tạm; người dùng phải đổi ở lần đăng nhập đầu. */
  async create(
    input: { email: string; hoTen: string; vaiTro: Role[] },
    actorId: string | null,
    ip: string | null,
  ): Promise<{ id: string; matKhauTam: string }> {
    const roleError = validateRoleSet(input.vaiTro);
    if (roleError) throw new BadRequestException(roleError);
    const temp = generateTemporaryPassword();
    const passwordHash = await hashPassword(temp);
    try {
      const id = await this.db.transaction(async (tx) => {
        const [u] = await tx
          .insert(users)
          .values({ email: input.email.trim(), fullName: input.hoTen.trim(), passwordHash, mustChangePassword: true })
          .returning({ id: users.id });
        await tx.insert(userRoles).values(input.vaiTro.map((role) => ({ userId: u.id, role, grantedBy: actorId })));
        await this.audit.record(
          { actorUserId: actorId, action: 'tai_khoan.tao', entityType: 'user', entityId: u.id, ip, detail: { email: input.email, vaiTro: input.vaiTro } },
          tx,
        );
        return u.id;
      });
      return { id, matKhauTam: temp };
    } catch (err: unknown) {
      if ((err as { cause?: { code?: string }; code?: string }).cause?.code === '23505' || (err as { code?: string }).code === '23505') {
        throw new ConflictException('Email này đã có tài khoản');
      }
      throw err;
    }
  }

  async setRoles(userId: string, roles: Role[], actorId: string, ip: string | null): Promise<void> {
    if (userId === actorId) throw new ForbiddenException('Không được tự đổi vai trò của chính mình');
    const roleError = validateRoleSet(roles);
    if (roleError) throw new BadRequestException(roleError);
    await this.db.transaction(async (tx) => {
      await this.mustExist(userId, tx);
      const before = (await tx.select({ role: userRoles.role }).from(userRoles).where(eq(userRoles.userId, userId))).map((r) => r.role);
      await tx.delete(userRoles).where(eq(userRoles.userId, userId));
      await tx.insert(userRoles).values(roles.map((role) => ({ userId, role, grantedBy: actorId })));
      // Đổi vai trò thì đăng xuất người đó để quyền mới có hiệu lực ngay.
      await this.revokeSessions(userId, tx);
      await this.audit.record(
        { actorUserId: actorId, action: 'tai_khoan.doi_vai_tro', entityType: 'user', entityId: userId, ip, detail: { truoc: before, sau: roles } },
        tx,
      );
    });
  }

  async unlock(userId: string, actorId: string, ip: string | null): Promise<void> {
    await this.db.transaction(async (tx) => {
      const u = await this.mustExist(userId, tx);
      if (u.status !== 'bi_khoa') throw new BadRequestException('Tài khoản không bị khoá');
      await tx.update(users).set({ status: 'hoat_dong', failedAttempts: 0, lockedAt: null, updatedAt: new Date() }).where(eq(users.id, userId));
      await this.audit.record({ actorUserId: actorId, action: 'tai_khoan.mo_khoa', entityType: 'user', entityId: userId, ip }, tx);
    });
  }

  async setActive(userId: string, active: boolean, actorId: string, ip: string | null): Promise<void> {
    if (userId === actorId) throw new ForbiddenException('Không được tự vô hiệu hoá chính mình');
    await this.db.transaction(async (tx) => {
      await this.mustExist(userId, tx);
      await tx
        .update(users)
        .set({ status: active ? 'hoat_dong' : 'vo_hieu', failedAttempts: 0, lockedAt: null, updatedAt: new Date() })
        .where(eq(users.id, userId));
      if (!active) await this.revokeSessions(userId, tx);
      await this.audit.record(
        { actorUserId: actorId, action: active ? 'tai_khoan.kich_hoat' : 'tai_khoan.vo_hieu', entityType: 'user', entityId: userId, ip },
        tx,
      );
    });
  }

  /** Người dùng mất điện thoại: xoá cài đặt 2 lớp và cấp mật khẩu tạm mới; họ phải cài lại từ đầu. */
  async resetCredentials(userId: string, actorId: string, ip: string | null): Promise<{ matKhauTam: string }> {
    if (userId === actorId) throw new ForbiddenException('Không được tự đặt lại tài khoản của chính mình');
    const temp = generateTemporaryPassword();
    const passwordHash = await hashPassword(temp);
    await this.db.transaction(async (tx) => {
      await this.mustExist(userId, tx);
      await tx
        .update(users)
        .set({
          passwordHash,
          mustChangePassword: true,
          totpEnabled: false,
          totpSecretEnc: null,
          totpLastStep: null,
          failedAttempts: 0,
          updatedAt: new Date(),
        })
        .where(eq(users.id, userId));
      await this.revokeSessions(userId, tx);
      await this.audit.record({ actorUserId: actorId, action: 'tai_khoan.dat_lai', entityType: 'user', entityId: userId, ip }, tx);
    });
    return { matKhauTam: temp };
  }

  private async mustExist(userId: string, exec: DbExecutor) {
    const [u] = await exec.select().from(users).where(eq(users.id, userId)).limit(1);
    if (!u) throw new NotFoundException('Không tìm thấy tài khoản');
    return u;
  }

  private async revokeSessions(userId: string, exec: DbExecutor) {
    await exec.update(sessions).set({ revokedAt: new Date() }).where(and(eq(sessions.userId, userId), isNull(sessions.revokedAt)));
  }
}

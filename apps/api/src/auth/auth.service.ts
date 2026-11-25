import { BadRequestException, Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { and, eq, isNull, sql } from 'drizzle-orm';
import { AuditService } from '../audit/audit.service';
import { loadConfig } from '../config/config';
import { decrypt, encrypt, randomToken, sha256Hex } from '../common/crypto';
import { DB, Db, DbExecutor } from '../db/db';
import { Session, sessions, User, userRoles, users } from '../db/schema';
import { isRole, permissionsFor, requiresTwoFactor, Role } from '../permissions/roles';
import { checkPasswordPolicy, hashPassword, verifyPassword } from './password';
import { generateTotpSecret, otpauthUrl, verifyTotp } from './totp';
import {
  AuthContext,
  FULL_TTL_MS,
  IDLE_TIMEOUT_MS,
  MAX_FAILED_ATTEMPTS,
  PENDING_TTL_MS,
  SessionStage,
} from './auth.types';

export interface ClientInfo {
  ip?: string | null;
  userAgent?: string | null;
}

export interface StageResult {
  /** Mã phiên mới cần đặt vào cookie (nếu có đổi). */
  token?: string;
  stage: SessionStage;
}

const WRONG_CREDENTIALS = 'Email hoặc mật khẩu không đúng';
const LOCKED_MESSAGE = 'Tài khoản đang bị khoá do nhập sai quá 5 lần. Liên hệ quản trị hệ thống để mở khoá.';
// Mã băm giả để người dò email không đoán được email nào có thật qua thời gian phản hồi.
let dummyHash: Promise<string> | undefined;

@Injectable()
export class AuthService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly audit: AuditService,
  ) {}

  private get key(): Buffer {
    return Buffer.from(loadConfig().APP_KEY, 'base64');
  }

  async rolesOf(userId: string, exec: DbExecutor = this.db): Promise<Role[]> {
    const rows = await exec.select({ role: userRoles.role }).from(userRoles).where(eq(userRoles.userId, userId));
    return rows.map((r) => r.role).filter(isRole);
  }

  // ---------- Bước 1: email + mật khẩu ----------

  async login(email: string, password: string, client: ClientInfo): Promise<StageResult> {
    const [user] = await this.db
      .select()
      .from(users)
      .where(sql`lower(${users.email}) = lower(${email})`)
      .limit(1);

    if (!user) {
      dummyHash ??= hashPassword('khong-ton-tai-0000');
      await verifyPassword(await dummyHash, password);
      await this.audit.record({ action: 'dang_nhap.sai_email', ip: client.ip, detail: { email } });
      throw new UnauthorizedException(WRONG_CREDENTIALS);
    }

    const passwordOk = await verifyPassword(user.passwordHash, password);
    if (user.status === 'vo_hieu') {
      throw new UnauthorizedException(WRONG_CREDENTIALS);
    }
    if (user.status === 'bi_khoa') {
      // Chỉ nói rõ "bị khoá" khi mật khẩu đúng, để người lạ không dò được tình trạng tài khoản.
      throw new UnauthorizedException(passwordOk ? LOCKED_MESSAGE : WRONG_CREDENTIALS);
    }
    if (!passwordOk) {
      await this.registerFailure(user, 'mat_khau', client);
      throw new UnauthorizedException(WRONG_CREDENTIALS);
    }

    const roles = await this.rolesOf(user.id);
    let stage: SessionStage;
    if (user.totpEnabled) stage = 'cho_ma_2_lop';
    else if (requiresTwoFactor(roles)) stage = 'can_cai_2_lop';
    else stage = user.mustChangePassword ? 'phai_doi_mat_khau' : 'day_du';

    if (stage === 'day_du' || stage === 'phai_doi_mat_khau') await this.markLoginSuccess(user.id);

    const token = await this.createSession(user.id, stage, client);
    await this.audit.record({ actorUserId: user.id, action: 'dang_nhap.dung_mat_khau', ip: client.ip, detail: { buoc_tiep: stage } });
    return { token, stage };
  }

  // ---------- Bước 2: mã xác thực 2 lớp ----------

  async verifySecondFactor(ctx: AuthContext, code: string, client: ClientInfo): Promise<StageResult> {
    const { user, session } = ctx;
    if (!user.totpSecretEnc) throw new BadRequestException('Tài khoản chưa cài đặt xác thực 2 lớp');
    const step = verifyTotp(decrypt(user.totpSecretEnc, this.key), code.trim());
    if (step === null || (user.totpLastStep !== null && step <= user.totpLastStep)) {
      const locked = await this.registerFailure(user, 'ma_2_lop', client);
      if (locked) throw new UnauthorizedException(LOCKED_MESSAGE);
      throw new UnauthorizedException('Mã xác thực không đúng hoặc đã dùng');
    }
    await this.db.update(users).set({ totpLastStep: step }).where(eq(users.id, user.id));
    await this.markLoginSuccess(user.id);
    const next: SessionStage = user.mustChangePassword ? 'phai_doi_mat_khau' : 'day_du';
    const token = await this.advanceSession(session, next);
    await this.audit.record({ actorUserId: user.id, action: 'dang_nhap.thanh_cong', ip: client.ip });
    return { token, stage: next };
  }

  // ---------- Cài đặt 2 lớp lần đầu ----------

  async startEnrollment(ctx: AuthContext): Promise<{ secret: string; otpauthUrl: string }> {
    const secret = generateTotpSecret();
    await this.db
      .update(sessions)
      .set({ pendingTotpSecretEnc: encrypt(secret, this.key) })
      .where(eq(sessions.id, ctx.session.id));
    return { secret, otpauthUrl: otpauthUrl(secret, ctx.user.email, loadConfig().TOTP_ISSUER) };
  }

  async confirmEnrollment(ctx: AuthContext, code: string, client: ClientInfo): Promise<StageResult> {
    const [current] = await this.db.select().from(sessions).where(eq(sessions.id, ctx.session.id));
    if (!current?.pendingTotpSecretEnc) throw new BadRequestException('Chưa bắt đầu cài đặt xác thực 2 lớp');
    const secretEnc = current.pendingTotpSecretEnc;
    const step = verifyTotp(decrypt(secretEnc, this.key), code.trim());
    if (step === null) {
      const locked = await this.registerFailure(ctx.user, 'cai_2_lop', client);
      if (locked) throw new UnauthorizedException(LOCKED_MESSAGE);
      throw new BadRequestException('Mã xác thực không đúng, hãy thử lại với mã mới trên điện thoại');
    }
    await this.db
      .update(users)
      .set({ totpSecretEnc: secretEnc, totpEnabled: true, totpLastStep: step, updatedAt: new Date() })
      .where(eq(users.id, ctx.user.id));
    await this.markLoginSuccess(ctx.user.id);
    const next: SessionStage = ctx.user.mustChangePassword ? 'phai_doi_mat_khau' : 'day_du';
    const token = await this.advanceSession(current, next);
    await this.audit.record({ actorUserId: ctx.user.id, action: 'xac_thuc_2_lop.da_cai', ip: client.ip });
    return { token, stage: next };
  }

  // ---------- Đổi mật khẩu ----------

  async changePassword(ctx: AuthContext, oldPassword: string, newPassword: string, client: ClientInfo): Promise<StageResult> {
    if (!(await verifyPassword(ctx.user.passwordHash, oldPassword))) {
      throw new BadRequestException('Mật khẩu hiện tại không đúng');
    }
    const policy = checkPasswordPolicy(newPassword, ctx.user.email);
    if (policy) throw new BadRequestException(policy);
    if (oldPassword === newPassword) throw new BadRequestException('Mật khẩu mới phải khác mật khẩu cũ');

    const passwordHash = await hashPassword(newPassword);
    await this.db.transaction(async (tx) => {
      await tx.update(users).set({ passwordHash, mustChangePassword: false, updatedAt: new Date() }).where(eq(users.id, ctx.user.id));
      // Đăng xuất mọi phiên khác của người này.
      await tx
        .update(sessions)
        .set({ revokedAt: new Date() })
        .where(and(eq(sessions.userId, ctx.user.id), isNull(sessions.revokedAt), sql`${sessions.id} <> ${ctx.session.id}`));
      await this.audit.record({ actorUserId: ctx.user.id, action: 'mat_khau.da_doi', ip: client.ip }, tx);
    });
    const token = await this.advanceSession(ctx.session, 'day_du');
    return { token, stage: 'day_du' };
  }

  async logout(ctx: AuthContext, client: ClientInfo): Promise<void> {
    await this.db.update(sessions).set({ revokedAt: new Date() }).where(eq(sessions.id, ctx.session.id));
    await this.audit.record({ actorUserId: ctx.user.id, action: 'dang_xuat', ip: client.ip });
  }

  // ---------- Phiên ----------

  /** Tìm phiên còn hiệu lực theo mã trong cookie. */
  async resolveSession(token: string): Promise<AuthContext | null> {
    const [row] = await this.db
      .select({ session: sessions, user: users })
      .from(sessions)
      .innerJoin(users, eq(users.id, sessions.userId))
      .where(and(eq(sessions.tokenHash, sha256Hex(token)), isNull(sessions.revokedAt)))
      .limit(1);
    if (!row) return null;
    const now = Date.now();
    const { session, user } = row;
    const idle = session.stage === 'day_du' && now - session.lastSeenAt.getTime() > IDLE_TIMEOUT_MS;
    if (session.expiresAt.getTime() <= now || idle || user.status !== 'hoat_dong') {
      await this.db.update(sessions).set({ revokedAt: new Date() }).where(eq(sessions.id, session.id));
      return null;
    }
    if (now - session.lastSeenAt.getTime() > 60_000) {
      await this.db.update(sessions).set({ lastSeenAt: new Date() }).where(eq(sessions.id, session.id));
    }
    const roles = await this.rolesOf(user.id);
    return { session, user, roles, permissions: session.stage === 'day_du' ? permissionsFor(roles) : [] };
  }

  private async createSession(userId: string, stage: SessionStage, client: ClientInfo): Promise<string> {
    const token = randomToken();
    await this.db.insert(sessions).values({
      userId,
      tokenHash: sha256Hex(token),
      stage,
      expiresAt: new Date(Date.now() + (stage === 'day_du' ? FULL_TTL_MS : PENDING_TTL_MS)),
      ip: client.ip ?? null,
      userAgent: client.userAgent?.slice(0, 300) ?? null,
    });
    return token;
  }

  /** Chuyển phiên sang bước mới và cấp mã phiên mới (mã cũ hết dùng được). */
  private async advanceSession(session: Session, stage: SessionStage): Promise<string> {
    const token = randomToken();
    await this.db
      .update(sessions)
      .set({
        stage,
        tokenHash: sha256Hex(token),
        pendingTotpSecretEnc: null,
        lastSeenAt: new Date(),
        expiresAt: new Date(Date.now() + (stage === 'day_du' ? FULL_TTL_MS : PENDING_TTL_MS)),
      })
      .where(eq(sessions.id, session.id));
    return token;
  }

  private async markLoginSuccess(userId: string): Promise<void> {
    await this.db.update(users).set({ failedAttempts: 0, lastLoginAt: new Date() }).where(eq(users.id, userId));
  }

  /** Ghi một lần nhập sai; đủ 5 lần thì khoá tài khoản và đăng xuất mọi phiên. Trả về true nếu vừa khoá. */
  private async registerFailure(user: User, kind: string, client: ClientInfo): Promise<boolean> {
    return this.db.transaction(async (tx) => {
      const [updated] = await tx
        .update(users)
        .set({ failedAttempts: sql`${users.failedAttempts} + 1` })
        .where(eq(users.id, user.id))
        .returning({ failedAttempts: users.failedAttempts });
      await this.audit.record(
        { actorUserId: user.id, action: 'dang_nhap.nhap_sai', ip: client.ip, detail: { loai: kind, lan: updated.failedAttempts } },
        tx,
      );
      if (updated.failedAttempts < MAX_FAILED_ATTEMPTS) return false;
      await tx.update(users).set({ status: 'bi_khoa', lockedAt: new Date(), updatedAt: new Date() }).where(eq(users.id, user.id));
      await tx.update(sessions).set({ revokedAt: new Date() }).where(and(eq(sessions.userId, user.id), isNull(sessions.revokedAt)));
      await this.audit.record({ actorUserId: user.id, action: 'tai_khoan.bi_khoa', entityType: 'user', entityId: user.id, ip: client.ip }, tx);
      return true;
    });
  }
}

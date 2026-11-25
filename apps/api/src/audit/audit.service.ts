import { Inject, Injectable } from '@nestjs/common';
import { asc, desc, eq, sql } from 'drizzle-orm';
import { sha256Hex } from '../common/crypto';
import { stableStringify } from '../common/stable-json';
import { DB, Db, DbExecutor } from '../db/db';
import { auditLog, AuditEntry, users } from '../db/schema';

export const GENESIS_HASH = '0'.repeat(64);

export interface AuditInput {
  actorUserId?: string | null;
  action: string;
  entityType?: string | null;
  entityId?: string | null;
  ip?: string | null;
  detail?: Record<string, unknown>;
}

export function computeAuditHash(
  prevHash: string,
  row: { at: Date; actorUserId: string | null; action: string; entityType: string | null; entityId: string | null; ip: string | null; detail: unknown },
): string {
  return sha256Hex(
    prevHash +
      '|' +
      stableStringify({
        at: row.at.toISOString(),
        actorUserId: row.actorUserId,
        action: row.action,
        entityType: row.entityType,
        entityId: row.entityId,
        ip: row.ip,
        detail: row.detail,
      }),
  );
}

/** Chuẩn hoá địa chỉ IP để lưu vào cột kiểu inet (bỏ tiền tố IPv6 của IPv4). */
function normalizeIp(ip: string | null | undefined): string | null {
  if (!ip) return null;
  return ip.startsWith('::ffff:') ? ip.slice(7) : ip;
}

@Injectable()
export class AuditService {
  constructor(@Inject(DB) private readonly db: Db) {}

  /**
   * Ghi một dòng nhật ký. Truyền `tx` để dòng nhật ký nằm cùng giao dịch với thao tác nghiệp vụ:
   * thao tác thất bại thì nhật ký cũng không được ghi, và ngược lại.
   */
  async record(input: AuditInput, tx?: DbExecutor): Promise<void> {
    const write = async (exec: DbExecutor) => {
      // Khoá để các dòng nhật ký nối chuỗi lần lượt, không chen ngang nhau.
      await exec.execute(sql`select pg_advisory_xact_lock(hashtext('audit_log'))`);
      const [last] = await exec.select({ hash: auditLog.hash }).from(auditLog).orderBy(desc(auditLog.id)).limit(1);
      const prevHash = last?.hash ?? GENESIS_HASH;
      const row = {
        at: new Date(),
        actorUserId: input.actorUserId ?? null,
        action: input.action,
        entityType: input.entityType ?? null,
        entityId: input.entityId ?? null,
        ip: normalizeIp(input.ip),
        detail: input.detail ?? {},
      };
      await exec.insert(auditLog).values({ ...row, prevHash, hash: computeAuditHash(prevHash, row) });
    };
    if (tx) await write(tx);
    else await this.db.transaction(write);
  }

  async list(opts: {
    limit: number;
    beforeId?: number;
    entityType?: string;
    entityId?: string;
  }): Promise<(AuditEntry & { actorName: string | null })[]> {
    const conds = [];
    if (opts.beforeId) conds.push(sql`${auditLog.id} < ${opts.beforeId}`);
    if (opts.entityType) conds.push(eq(auditLog.entityType, opts.entityType));
    if (opts.entityId) conds.push(eq(auditLog.entityId, opts.entityId));
    const where = conds.length ? sql.join(conds, sql` and `) : undefined;
    const rows = await this.db
      .select({ entry: auditLog, actorName: users.fullName })
      .from(auditLog)
      .leftJoin(users, eq(users.id, auditLog.actorUserId))
      .where(where)
      .orderBy(desc(auditLog.id))
      .limit(opts.limit);
    return rows.map((r) => ({ ...r.entry, actorName: r.actorName }));
  }

  /** Đi lại toàn bộ chuỗi nhật ký và báo dòng đầu tiên bị sửa hoặc mất (nếu có). */
  async verifyChain(): Promise<{ ok: boolean; checked: number; brokenAtId?: number }> {
    let prevHash = GENESIS_HASH;
    let checked = 0;
    let lastId = 0;
    const pageSize = 1000;
    for (;;) {
      const rows = await this.db
        .select()
        .from(auditLog)
        .where(sql`${auditLog.id} > ${lastId}`)
        .orderBy(asc(auditLog.id))
        .limit(pageSize);
      for (const r of rows) {
        const expected = computeAuditHash(prevHash, {
          at: r.at,
          actorUserId: r.actorUserId,
          action: r.action,
          entityType: r.entityType,
          entityId: r.entityId,
          ip: r.ip,
          detail: r.detail,
        });
        if (r.prevHash !== prevHash || r.hash !== expected) return { ok: false, checked, brokenAtId: r.id };
        prevHash = r.hash;
        checked++;
        lastId = r.id;
      }
      if (rows.length < pageSize) return { ok: true, checked };
    }
  }
}

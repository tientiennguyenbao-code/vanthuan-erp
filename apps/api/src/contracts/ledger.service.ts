import { Inject, Injectable } from '@nestjs/common';
import { and, asc, desc, eq, gte, lte, sql } from 'drizzle-orm';
import { sha256Hex } from '../common/crypto';
import { stableStringify } from '../common/stable-json';
import { DB, Db, DbExecutor } from '../db/db';
import { anchorBatches, contractLedger, LedgerEntry } from '../db/schema';
import type { LedgerEvent } from './contract.rules';
import { merkleProof, merkleRoot, ProofStep, verifyMerkleProof } from './merkle';
import { ANCHOR_PROVIDER, AnchorProvider } from './providers';

export const LEDGER_GENESIS = '0'.repeat(64);

export interface LedgerInput {
  contractId: string;
  version: number;
  event: LedgerEvent;
  actorUserId: string;
  contentHash: string;
  signature?: { provider: string; value: string } | null;
  note?: string | null;
}

export function computeLedgerHash(prevHash: string, row: LedgerInput & { at: Date }): string {
  return sha256Hex(
    prevHash +
      '|' +
      stableStringify({
        at: row.at.toISOString(),
        contractId: row.contractId,
        version: row.version,
        event: row.event,
        actorUserId: row.actorUserId,
        contentHash: row.contentHash,
        signature: row.signature ?? null,
        note: row.note ?? null,
      }),
  );
}

export interface AnchorReceipt {
  dotNeo: number;
  luc: Date;
  maGoc: string;
  noiNeo: string;
  maGiaoDich: string | null;
  duongDi: ProofStep[];
  khopMaGoc: boolean;
}

/**
 * Sổ cái hợp đồng: ghi thêm, kiểm tra chuỗi, gom thành cây Merkle và neo mã gốc.
 */
@Injectable()
export class LedgerService {
  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(ANCHOR_PROVIDER) private readonly anchorProvider: AnchorProvider,
  ) {}

  /** Ghi một dòng, luôn trong giao dịch của thao tác nghiệp vụ. */
  async append(input: LedgerInput, tx: DbExecutor): Promise<LedgerEntry> {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext('contract_ledger'))`);
    const [last] = await tx.select({ hash: contractLedger.hash }).from(contractLedger).orderBy(desc(contractLedger.id)).limit(1);
    const prevHash = last?.hash ?? LEDGER_GENESIS;
    const at = new Date();
    const [row] = await tx
      .insert(contractLedger)
      .values({
        at,
        contractId: input.contractId,
        version: input.version,
        event: input.event,
        actorUserId: input.actorUserId,
        contentHash: input.contentHash,
        signature: input.signature ?? null,
        note: input.note ?? null,
        prevHash,
        hash: computeLedgerHash(prevHash, { ...input, at }),
      })
      .returning();
    return row;
  }

  forContract(contractId: string) {
    return this.db.select().from(contractLedger).where(eq(contractLedger.contractId, contractId)).orderBy(asc(contractLedger.id));
  }

  /** Đi lại toàn bộ chuỗi; báo dòng đầu tiên bị sửa hoặc mất. */
  async verifyChain(): Promise<{ ok: boolean; checked: number; brokenAtId?: number }> {
    let prevHash = LEDGER_GENESIS;
    let lastId = 0;
    let checked = 0;
    const pageSize = 1000;
    for (;;) {
      const rows = await this.db.select().from(contractLedger).where(sql`${contractLedger.id} > ${lastId}`).orderBy(asc(contractLedger.id)).limit(pageSize);
      for (const r of rows) {
        const expected = computeLedgerHash(prevHash, {
          at: r.at,
          contractId: r.contractId,
          version: r.version,
          event: r.event as LedgerEvent,
          actorUserId: r.actorUserId,
          contentHash: r.contentHash,
          signature: r.signature as LedgerInput['signature'],
          note: r.note,
        });
        if (r.prevHash !== prevHash || r.hash !== expected) return { ok: false, checked, brokenAtId: r.id };
        prevHash = r.hash;
        lastId = r.id;
        checked++;
      }
      if (rows.length < pageSize) return { ok: true, checked };
    }
  }

  /** Gom mọi dòng chưa neo thành một cây Merkle và neo mã gốc. Không có dòng mới thì không làm gì. */
  async anchorPending(): Promise<typeof anchorBatches.$inferSelect | null> {
    return this.db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext('anchor_batches'))`);
      const [last] = await tx.select({ toId: anchorBatches.toLedgerId }).from(anchorBatches).orderBy(desc(anchorBatches.id)).limit(1);
      const rows = await tx
        .select({ id: contractLedger.id, hash: contractLedger.hash })
        .from(contractLedger)
        .where(sql`${contractLedger.id} > ${last?.toId ?? 0}`)
        .orderBy(asc(contractLedger.id));
      if (rows.length === 0) return null;
      const root = merkleRoot(rows.map((r) => r.hash));
      const { txRef } = await this.anchorProvider.publish(root);
      const [batch] = await tx
        .insert(anchorBatches)
        .values({ fromLedgerId: rows[0].id, toLedgerId: rows[rows.length - 1].id, leafCount: rows.length, merkleRoot: root, provider: this.anchorProvider.name, txRef })
        .returning();
      return batch;
    });
  }

  listBatches(limit = 50) {
    return this.db.select().from(anchorBatches).orderBy(desc(anchorBatches.id)).limit(limit);
  }

  /** Biên nhận neo của một dòng sổ cái: đợt neo, mã gốc và đường đi trong cây. Chưa neo thì trả về null. */
  async receiptFor(entry: { id: number; hash: string }): Promise<AnchorReceipt | null> {
    const [batch] = await this.db
      .select()
      .from(anchorBatches)
      .where(and(lte(anchorBatches.fromLedgerId, entry.id), gte(anchorBatches.toLedgerId, entry.id)));
    if (!batch) return null;
    const leaves = await this.db
      .select({ id: contractLedger.id, hash: contractLedger.hash })
      .from(contractLedger)
      .where(and(gte(contractLedger.id, batch.fromLedgerId), lte(contractLedger.id, batch.toLedgerId)))
      .orderBy(asc(contractLedger.id));
    const index = leaves.findIndex((l) => l.id === entry.id);
    const proof = merkleProof(
      leaves.map((l) => l.hash),
      index,
    );
    return {
      dotNeo: batch.id,
      luc: batch.at,
      maGoc: batch.merkleRoot,
      noiNeo: batch.provider,
      maGiaoDich: batch.txRef,
      duongDi: proof,
      khopMaGoc: verifyMerkleProof(entry.hash, proof, batch.merkleRoot),
    };
  }
}

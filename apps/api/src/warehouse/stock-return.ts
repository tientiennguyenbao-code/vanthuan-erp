import { and, eq, isNull } from 'drizzle-orm';
import type { DbExecutor } from '../db/db';
import { goodsIssueLines, goodsIssues, stockLots, stockMoves } from '../db/schema';

const r2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Huỷ một phiếu xuất kho còn hiệu lực: trả khối lượng về các lô tồn, ghi sổ kho "huỷ xuất kho".
 * Dùng chung khi thủ kho huỷ phiếu và khi lô xuất bị huỷ. Trả về false nếu phiếu đã huỷ trước đó.
 */
export async function returnIssuedStock(tx: DbExecutor, issueId: string, actorUserId: string, reason: string): Promise<boolean> {
  const [g] = await tx.select().from(goodsIssues).where(and(eq(goodsIssues.id, issueId), isNull(goodsIssues.voidedAt))).for('update');
  if (!g) return false;
  const lines = await tx.select().from(goodsIssueLines).where(eq(goodsIssueLines.issueId, issueId));
  for (const l of [...lines].sort((a, b) => a.stockLotId.localeCompare(b.stockLotId))) {
    const [s] = await tx.select().from(stockLots).where(eq(stockLots.id, l.stockLotId)).for('update');
    await tx.update(stockLots).set({ remainingKg: r2(s.remainingKg + l.quantityKg) }).where(eq(stockLots.id, s.id));
    await tx.insert(stockMoves).values({ stockLotId: s.id, kind: 'huy_xuat_kho', quantityKg: l.quantityKg, toZoneId: s.zoneId, refId: issueId, note: `${g.code}: ${reason}`, actorUserId });
  }
  await tx.update(goodsIssues).set({ voidedAt: new Date(), voidedBy: actorUserId, voidReason: reason }).where(eq(goodsIssues.id, issueId));
  return true;
}

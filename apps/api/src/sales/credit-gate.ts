import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import type { ContractTerms } from '../contracts/contract.rules';
import type { DbExecutor } from '../db/db';
import { Contract, contracts, creditLimits, exportLots, lotPayments } from '../db/schema';
import { agingSummary } from './credit.rules';

/**
 * Khoản thu tiền hàng của người mua (lịch thu theo lô). Chỉ mua đứt: với môi giới người mua trả thẳng nhà cung cấp,
 * Vạn Thuận không cho nợ nên không tính hạn mức.
 */
export const BUYER_RECEIVABLE_KINDS = ['tien_hang_nguoi_mua'];
/** Hợp đồng Vạn Thuận bán và cho người mua nợ */
export const SALE_KINDS = ['ban'];

export const todayVn = () => new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 10);

const toUsd = (amount: number, currency: string, fx: number | null) => (currency === 'USD' ? amount : fx && fx > 0 ? amount / fx : null);

/** Hạn mức đang hiệu lực: dòng được duyệt mới nhất. */
export async function activeLimit(partnerId: string, exec: DbExecutor) {
  const [l] = await exec
    .select()
    .from(creditLimits)
    .where(and(eq(creditLimits.partnerId, partnerId), eq(creditLimits.status, 'da_duyet')))
    .orderBy(desc(creditLimits.decidedAt))
    .limit(1);
  return l ?? null;
}

/** Các khoản người mua còn phải trả (đã lên lịch thu, chưa thu). */
export async function openReceivables(partnerIds: string[] | null, exec: DbExecutor) {
  const rows = await exec
    .select({
      id: lotPayments.id,
      partnerId: exportLots.buyerPartnerId,
      exportLotId: lotPayments.exportLotId,
      lotCode: exportLots.code,
      contractId: exportLots.counterContractId,
      milestone: lotPayments.milestone,
      dueDate: lotPayments.dueDate,
      amount: lotPayments.plannedAmount,
      currency: lotPayments.currency,
      fx: lotPayments.fxPerUsd,
    })
    .from(lotPayments)
    .innerJoin(exportLots, eq(exportLots.id, lotPayments.exportLotId))
    .where(
      and(
        eq(lotPayments.direction, 'thu'),
        inArray(lotPayments.kind, BUYER_RECEIVABLE_KINDS),
        eq(lotPayments.status, 'du_kien'),
        partnerIds ? inArray(exportLots.buyerPartnerId, partnerIds) : undefined,
      ),
    );
  return rows.map((r) => ({ ...r, amountUsd: toUsd(r.amount, r.currency, r.fx) }));
}

/**
 * Hợp đồng bán trả chậm đã trình hoặc đã ký mà chưa lên lịch thu khoản nào: giá trị cả hợp đồng tính vào dư nợ
 * (sắp thành nợ). Khi đã có lịch thu thì lịch thu thay cho giá trị hợp đồng.
 */
export async function pendingDeferredContracts(partnerId: string, excludeId: string | null, termsOf: (c: Contract) => Promise<ContractTerms>, exec: DbExecutor) {
  const cs = await exec
    .select()
    .from(contracts)
    .where(
      and(
        eq(contracts.buyerPartnerId, partnerId),
        inArray(contracts.kind, SALE_KINDS),
        inArray(contracts.status, ['cho_ky', 'da_ky']),
        sql`not exists (select 1 from lot_payments p join export_lots e on e.id = p.export_lot_id where e.counter_contract_id = ${contracts.id} and p.direction = 'thu' and p.status <> 'da_huy')`,
      ),
    );
  const out: { id: string; code: string; usd: number | null }[] = [];
  for (const c of cs) {
    if (c.id === excludeId) continue;
    const t = await termsOf(c);
    if (!t.traChamNgay) continue;
    const v = t.soLuong * t.donGia;
    out.push({ id: c.id, code: c.code, usd: toUsd(v, t.tienTe, t.tyGiaUsd ?? null) });
  }
  return out;
}

/** Dư nợ hiện có của người mua và khoản quá hạn lâu nhất. */
export async function buyerExposure(partnerId: string, excludeContractId: string | null, termsOf: (c: Contract) => Promise<ContractTerms>, exec: DbExecutor) {
  const today = todayVn();
  const rec = await openReceivables([partnerId], exec);
  const aging = agingSummary(rec, today);
  const pending = await pendingDeferredContracts(partnerId, excludeContractId, termsOf, exec);
  const pendingUsd = pending.reduce((a, p) => a + (p.usd ?? 0), 0);
  return { aging, receivables: rec, pending, exposureUsd: Math.round((aging.total + pendingUsd) * 100) / 100 };
}

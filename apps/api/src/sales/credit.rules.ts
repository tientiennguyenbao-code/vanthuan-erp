/** Công nợ và hạn mức nợ của người mua (BH-3). */

/** Có nợ quá hạn quá số ngày này thì không ký thêm hợp đồng bán trả chậm. */
export const BLOCK_OVERDUE_DAYS = 30;

export const AGING_BUCKETS = ['chua_den_han', 'qua_1_30', 'qua_31_60', 'qua_61_90', 'qua_tren_90', 'chua_co_han'] as const;
export type AgingBucket = (typeof AGING_BUCKETS)[number];

const parse = (s: string) => new Date(`${s}T00:00:00Z`).getTime();

/** Số ngày quá hạn (âm hoặc 0 là chưa đến hạn); null khi chưa có ngày đến hạn. */
export function daysOverdue(dueDate: string | null, today: string): number | null {
  if (!dueDate) return null;
  return Math.round((parse(today) - parse(dueDate)) / 864e5);
}

export function agingBucket(dueDate: string | null, today: string): AgingBucket {
  const d = daysOverdue(dueDate, today);
  if (d === null) return 'chua_co_han';
  if (d <= 0) return 'chua_den_han';
  if (d <= 30) return 'qua_1_30';
  if (d <= 60) return 'qua_31_60';
  if (d <= 90) return 'qua_61_90';
  return 'qua_tren_90';
}

export interface Receivable {
  amountUsd: number | null;
  dueDate: string | null;
}

/** Tổng hợp tuổi nợ: số tiền (USD) theo từng nhóm, khoản quá hạn lâu nhất, khoản chưa quy đổi được USD. */
export function agingSummary(rows: Receivable[], today: string) {
  const buckets = Object.fromEntries(AGING_BUCKETS.map((b) => [b, 0])) as Record<AgingBucket, number>;
  let maxOverdue = 0;
  let missingFx = 0;
  for (const r of rows) {
    if (r.amountUsd === null) {
      missingFx++;
      continue;
    }
    buckets[agingBucket(r.dueDate, today)] += r.amountUsd;
    const d = daysOverdue(r.dueDate, today);
    if (d !== null && d > maxOverdue) maxOverdue = d;
  }
  const r2 = (n: number) => Math.round(n * 100) / 100;
  for (const b of AGING_BUCKETS) buckets[b] = r2(buckets[b]);
  const total = r2(AGING_BUCKETS.reduce((a, b) => a + buckets[b], 0));
  const overdue = r2(buckets.qua_1_30 + buckets.qua_31_60 + buckets.qua_61_90 + buckets.qua_tren_90);
  return { buckets, total, overdue, maxOverdueDays: maxOverdue, missingFx };
}

export interface CreditCheck {
  /** Số ngày trả chậm của hợp đồng đang xét; null là không trả chậm */
  deferredDays: number | null;
  contractUsd: number | null;
  limit: { amountUsd: number; maxDays: number } | null;
  /** Dư nợ hiện có của người mua, chưa tính hợp đồng đang xét */
  exposureUsd: number;
  maxOverdueDays: number;
}

/** Lý do không trình ký / không ký được hợp đồng bán trả chậm. Hợp đồng không trả chậm thì không bị chặn. */
export function creditProblems(c: CreditCheck): string[] {
  if (!c.deferredDays) return [];
  const out: string[] = [];
  const usd = (n: number) => `${Math.round(n).toLocaleString('vi-VN')} USD`;
  if (c.maxOverdueDays > BLOCK_OVERDUE_DAYS) out.push(`Người mua có khoản nợ quá hạn ${c.maxOverdueDays} ngày (quá ${BLOCK_OVERDUE_DAYS} ngày): không ký thêm hợp đồng trả chậm`);
  if (!c.limit || c.limit.amountUsd <= 0) {
    out.push('Người mua chưa có hạn mức nợ được Giám đốc duyệt: chỉ bán thanh toán trước hoặc theo chứng từ');
    return out;
  }
  if (c.deferredDays > c.limit.maxDays) out.push(`Trả chậm ${c.deferredDays} ngày vượt thời hạn được duyệt ${c.limit.maxDays} ngày`);
  if (c.contractUsd === null) out.push('Chưa quy đổi được giá trị hợp đồng ra USD để so với hạn mức');
  else if (c.exposureUsd + c.contractUsd > c.limit.amountUsd + 0.005) {
    out.push(`Vượt hạn mức nợ: dư nợ ${usd(c.exposureUsd)} cộng hợp đồng này ${usd(c.contractUsd)} lớn hơn hạn mức ${usd(c.limit.amountUsd)}`);
  }
  return out;
}

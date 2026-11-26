import { agingBucket, agingSummary, creditProblems, daysOverdue } from './credit.rules';

describe('Công nợ và hạn mức người mua', () => {
  it('chia tuổi nợ theo ngày đến hạn', () => {
    expect(daysOverdue('2026-11-01', '2026-11-26')).toBe(25);
    expect(agingBucket('2026-11-26', '2026-11-26')).toBe('chua_den_han');
    expect(agingBucket('2026-11-25', '2026-11-26')).toBe('qua_1_30');
    expect(agingBucket('2026-10-27', '2026-11-26')).toBe('qua_1_30');
    expect(agingBucket('2026-10-26', '2026-11-26')).toBe('qua_31_60');
    expect(agingBucket('2026-08-01', '2026-11-26')).toBe('qua_tren_90');
    expect(agingBucket(null, '2026-11-26')).toBe('chua_co_han');
  });

  it('tổng hợp tuổi nợ, khoản quá hạn lâu nhất, khoản chưa quy đổi', () => {
    const s = agingSummary(
      [
        { amountUsd: 50000, dueDate: '2026-12-10' },
        { amountUsd: 20000, dueDate: '2026-11-10' },
        { amountUsd: 10000, dueDate: '2026-10-01' },
        { amountUsd: null, dueDate: '2026-10-01' },
      ],
      '2026-11-26',
    );
    expect(s.total).toBe(80000);
    expect(s.overdue).toBe(30000);
    expect(s.buckets.qua_31_60).toBe(10000);
    expect(s.maxOverdueDays).toBe(56);
    expect(s.missingFx).toBe(1);
  });

  it('hợp đồng không trả chậm thì không bị chặn', () => {
    expect(creditProblems({ deferredDays: null, contractUsd: 1e6, limit: null, exposureUsd: 0, maxOverdueDays: 90 })).toEqual([]);
  });

  it('trả chậm: cần hạn mức, không vượt hạn mức và số ngày, không có nợ quá hạn quá 30 ngày', () => {
    const base = { deferredDays: 30, contractUsd: 90000, limit: { amountUsd: 200000, maxDays: 45 }, exposureUsd: 100000, maxOverdueDays: 0 };
    expect(creditProblems(base)).toEqual([]);
    expect(creditProblems({ ...base, limit: null })[0]).toMatch(/chưa có hạn mức/);
    expect(creditProblems({ ...base, exposureUsd: 120000 })[0]).toMatch(/Vượt hạn mức/);
    expect(creditProblems({ ...base, deferredDays: 60 })[0]).toMatch(/60 ngày vượt/);
    expect(creditProblems({ ...base, maxOverdueDays: 30 })).toEqual([]);
    expect(creditProblems({ ...base, maxOverdueDays: 31 })[0]).toMatch(/quá hạn 31 ngày/);
  });
});

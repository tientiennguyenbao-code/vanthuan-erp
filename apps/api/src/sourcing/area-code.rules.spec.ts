import { codeInEffect, reviewRefusal } from './area-code.rules';

describe('đối chiếu mã số vùng', () => {
  const s = { status: 'cho_duyet', hasFile: true, submittedBy: 'u1', validUntil: '2027-12-31' };

  it('hiệu lực theo ngày', () => {
    expect(codeInEffect(null, '2026-11-26')).toBe(true);
    expect(codeInEffect('2026-11-26', '2026-11-26')).toBe(true);
    expect(codeInEffect('2026-11-25', '2026-11-26')).toBe(false);
  });

  it('duyệt 4 mắt, cần bản scan và giấy còn hạn; từ chối cần lý do', () => {
    expect(reviewRefusal(s, 'u2', true, null, '2026-11-26')).toBeNull();
    expect(reviewRefusal(s, 'u1', true, null, '2026-11-26')).toMatch(/không tự duyệt/);
    expect(reviewRefusal({ ...s, hasFile: false }, 'u2', true, null, '2026-11-26')).toMatch(/bản scan/);
    expect(reviewRefusal({ ...s, validUntil: '2026-01-01' }, 'u2', true, null, '2026-11-26')).toMatch(/hết hạn/);
    expect(reviewRefusal(s, 'u2', false, '', '2026-11-26')).toMatch(/lý do/);
    expect(reviewRefusal(s, 'u2', false, 'Số mã trên giấy khác', '2026-11-26')).toBeNull();
    expect(reviewRefusal({ ...s, status: 'da_duyet' }, 'u2', true, null, '2026-11-26')).toMatch(/không còn chờ/);
  });
});

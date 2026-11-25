import { addMonths, effectiveKycStatus, isExpiringWithin, isKycValid, kycValidityMonths } from './partner.rules';

describe('Quy tắc thẩm định đối tác', () => {
  const now = new Date('2026-11-25T00:00:00Z');

  it('tái thẩm định 12 tháng, rủi ro cao 6 tháng', () => {
    expect(kycValidityMonths('thap')).toBe(12);
    expect(kycValidityMonths('trung_binh')).toBe(12);
    expect(kycValidityMonths('cao')).toBe(6);
    expect(addMonths(now, 6).toISOString().slice(0, 10)).toBe('2027-05-25');
  });

  it('đạt nhưng quá hạn thì thành "hết hạn" và không dùng được', () => {
    expect(effectiveKycStatus('dat', new Date('2026-11-24T00:00:00Z'), now)).toBe('het_han');
    expect(isKycValid('dat', new Date('2026-11-24T00:00:00Z'), now)).toBe(false);
    expect(isKycValid('dat', new Date('2027-01-01T00:00:00Z'), now)).toBe(true);
    expect(isKycValid('cho_tham_dinh', null, now)).toBe(false);
  });

  it('nhận ra tài liệu sắp hết hạn trong 30 ngày hoặc đã hết hạn', () => {
    expect(isExpiringWithin('2026-12-20', 30, now)).toBe(true);
    expect(isExpiringWithin('2026-10-01', 30, now)).toBe(true);
    expect(isExpiringWithin('2027-06-01', 30, now)).toBe(false);
    expect(isExpiringWithin(null, 30, now)).toBe(false);
  });
});

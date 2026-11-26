import { iuuIssues, simpIssues, TripFacts } from './catch.rules';

const trip = (over: Partial<TripFacts> = {}, v: Partial<TripFacts['vessel']> = {}): TripFacts => ({
  code: 'C1',
  landedOn: '2026-11-10',
  certificateNo: 'GCN-123',
  vessel: { registrationNo: 'BĐ-96789-TS', lengthM: 18, hasVms: true, licenseNo: 'GP-01', licenseValidUntil: '2027-12-31', ...v },
  ...over,
});

describe('thủy sản khai thác: IUU và SIMP', () => {
  it('chuyến đủ giấy thì không thiếu gì', () => {
    expect(iuuIssues(trip())).toEqual([]);
    expect(simpIssues(trip())).toEqual([]);
  });

  it('thiếu giấy khai thác, giấy phép hết hạn, tàu lớn không có thiết bị giám sát', () => {
    expect(iuuIssues(trip({ certificateNo: null }))).toEqual(['chưa có số giấy chứng nhận / xác nhận thủy sản khai thác']);
    expect(iuuIssues(trip({}, { licenseValidUntil: '2026-11-01' }))[0]).toMatch(/hết hạn trước ngày cập cảng/);
    expect(simpIssues(trip({}, { licenseNo: null }))[0]).toMatch(/chưa ghi giấy phép/);
    expect(iuuIssues(trip({}, { hasVms: false }))[0]).toMatch(/giám sát hành trình/);
    expect(iuuIssues(trip({}, { hasVms: false, lengthM: 12 }))).toEqual([]);
  });
});

/**
 * Thủy sản khai thác: điểm còn thiếu của một chuyến để chứng minh không khai thác bất hợp pháp (IUU, hàng đi EU) và đủ
 * dữ liệu SIMP cho người nhập Mỹ. Theo hiểu biết chung về quy định, CHƯA đối chiếu văn bản gốc (cần xác minh).
 */

export interface TripFacts {
  code: string;
  landedOn: string;
  certificateNo: string | null;
  vessel: { registrationNo: string; lengthM: number | null; hasVms: boolean; licenseNo: string | null; licenseValidUntil: string | null };
}

/** Tàu từ 15 m trở lên phải có thiết bị giám sát hành trình (cần xác minh ngưỡng hiện hành). */
export const VMS_MIN_LENGTH_M = 15;

function licenseIssue(t: TripFacts): string | null {
  const v = t.vessel;
  if (!v.licenseNo) return `tàu ${v.registrationNo} chưa ghi giấy phép khai thác`;
  if (v.licenseValidUntil && v.licenseValidUntil < t.landedOn) return `giấy phép khai thác của tàu ${v.registrationNo} hết hạn trước ngày cập cảng`;
  return null;
}

/** Điểm còn thiếu để chứng minh chuyến không IUU (hàng đi EU cần giấy chứng nhận khai thác). */
export function iuuIssues(t: TripFacts): string[] {
  const out: string[] = [];
  if (!t.certificateNo) out.push('chưa có số giấy chứng nhận / xác nhận thủy sản khai thác');
  const lic = licenseIssue(t);
  if (lic) out.push(lic);
  if (t.vessel.lengthM !== null && t.vessel.lengthM >= VMS_MIN_LENGTH_M && !t.vessel.hasVms) out.push(`tàu ${t.vessel.registrationNo} dài từ ${VMS_MIN_LENGTH_M} m chưa ghi có thiết bị giám sát hành trình`);
  return out;
}

/**
 * Dữ liệu SIMP còn thiếu. Tên, số đăng ký, quốc tịch tàu, nghề, vùng khai thác, ngày và nơi cập cảng là trường bắt
 * buộc khi ghi tàu và chuyến; ở đây chỉ còn giấy phép khai thác.
 */
export function simpIssues(t: TripFacts): string[] {
  const lic = licenseIssue(t);
  return lic ? [lic] : [];
}

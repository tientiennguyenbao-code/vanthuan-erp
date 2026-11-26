/**
 * Đối chiếu mã số vùng trồng / mã cơ sở nuôi: mã chỉ được tính khi truy xuất sau khi người thứ hai so mã với
 * bản scan giấy chứng nhận và duyệt, và khi giấy còn hạn. Chưa có nguồn dữ liệu chính thức để tra tự động.
 */

export type CodeStatus = 'cho_duyet' | 'da_duyet' | 'tu_choi' | 'thay_the' | 'thu_hoi';

/** Mã còn hiệu lực vào ngày `on` (YYYY-MM-DD); giấy không ghi hạn thì coi là còn. */
export function codeInEffect(validUntil: string | null, on: string): boolean {
  return !validUntil || validUntil >= on;
}

export interface ReviewFacts {
  status: string;
  hasFile: boolean;
  submittedBy: string;
  validUntil: string | null;
}

/** Lý do không duyệt được (null là được). Người gửi không tự duyệt; duyệt đồng ý cần bản scan và giấy còn hạn. */
export function reviewRefusal(s: ReviewFacts, reviewerId: string, dongY: boolean, ghiChu: string | null, today: string): string | null {
  if (s.status !== 'cho_duyet') return 'Lần gửi này không còn chờ duyệt';
  if (s.submittedBy === reviewerId) return 'Người gửi mã không tự duyệt; nhờ người khác có quyền duyệt';
  if (!dongY) return ghiChu && ghiChu.trim().length >= 3 ? null : 'Ghi lý do từ chối để người gửi sửa';
  if (!s.hasFile) return 'Chưa có bản scan giấy chứng nhận để đối chiếu';
  if (!codeInEffect(s.validUntil, today)) return 'Giấy chứng nhận đã hết hạn';
  return null;
}

# Đối tác, thẩm định và danh mục

Theo "Thiết kế phân hệ Giao dịch & Đối tác", mục 3.1 và 5.

## Thẩm định (KYC)

Trạng thái: `nhap` → `cho_tham_dinh` → `dat` / `tu_choi`. Hiển thị thêm `het_han` khi đã đạt nhưng quá hạn.

- Trình thẩm định cần: xếp hạng rủi ro, ghi chú sàng lọc, ít nhất một tài liệu còn hiệu lực.
- Người trình không tự duyệt (nguyên tắc 4 mắt).
- Rủi ro thấp/trung bình: Trưởng phòng KD hoặc Ban Giám đốc duyệt. Rủi ro cao: chỉ Giám đốc/Phó Giám đốc.
  [Giả định: thiết kế nghiệp vụ có vai "Tuân thủ/KYC" nhưng bảng phân quyền đã chốt không có vai này, nên giao cho Trưởng phòng KD.]
- Hạn tái thẩm định 12 tháng, rủi ro cao 6 tháng [Giả định GĐ-4].
- Sửa tên, quốc gia hoặc mã số thuế sau khi đã duyệt thì hồ sơ quay về `nhap`, phải thẩm định lại.
- Sàng lọc trừng phạt nhập tay [Giả định GĐ-3].
- `isKycValid()` trong `partner.rules.ts` dùng cho phân hệ hợp đồng: chặn tạo hợp đồng với đối tác chưa đạt hoặc hết hạn.

## Quyền

- Nhân viên KD: tạo đối tác (tự thành người phụ trách), chỉ sửa đối tác mình phụ trách.
- Trưởng phòng KD: sửa mọi đối tác, đổi người phụ trách, duyệt thẩm định, quản lý danh mục.
- Quản trị hệ thống: không xem đối tác.

## Chưa làm trong phần này

- Đính kèm tệp scan tài liệu (làm cùng kho lưu tệp ở phần chứng từ).
- Gửi email nhắc tài liệu sắp hết hạn (cần hàng đợi việc nền); hiện nhắc trên màn hình Đối tác.
- Cổng cho đối tác tự nộp hồ sơ (GĐ-11 chưa chốt).

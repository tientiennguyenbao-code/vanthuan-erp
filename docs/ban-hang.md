# Bán hàng: hỏi hàng và mẫu hàng

Theo "Thiết kế phân hệ Bán hàng và Người mua" (Giám đốc chốt BH-1 đến BH-7 ngày 26/11/2026). Đây là bước 1.

## Phiếu hỏi hàng (`/ban-hang/hoi-hang`)

- Mỗi yêu cầu của người mua là một phiếu `YCH-YYYY-NNNN`: người mua (đối tác mang vai người mua), mặt hàng, số lượng, quy cách, chứng nhận, tháng giao, Incoterms, cảng đến, giá mục tiêu, nguồn (email, hội chợ, giới thiệu, trang web, cổng).
- Trạng thái: `moi` → `dang_bao_gia` (tự chuyển khi lập báo giá bán từ phiếu) → `thang` (tự chuyển khi báo giá đó được chấp nhận) hoặc `thua` (ghi lý do: giá, chất lượng, thời gian giao, chứng nhận, không phản hồi, khác). Phiếu chưa có báo giá có thể huỷ.
- Phiếu mới quá 2 ngày làm việc (bỏ thứ Bảy, Chủ nhật; chưa tính ngày lễ) mà chưa có báo giá thì bị đánh dấu "quá hạn báo giá".
- Trang danh sách có tổng hợp: số phiếu đang mở, quá hạn, tỷ lệ thắng (trên phiếu đã có kết quả), lý do thua.
- Nút "Lập báo giá bán từ phiếu" mở form báo giá bán điền sẵn từ phiếu. Báo giá lập từ phiếu không được đổi người mua hay mặt hàng.

## Mẫu hàng (`/ban-hang/mau`)

- `chao_hang`: gửi theo phiếu hỏi hàng. `truoc_xuat`: phải gắn lô xuất đúng người mua và mặt hàng. `doi_chung`: Vạn Thuận lưu lại (gắn lô xuất hoặc lô mua, có hạn lưu), không gửi đi.
- Luồng: đang chuẩn bị → đã gửi (hãng chuyển phát, số vận đơn) → đạt / không đạt (không đạt bắt buộc ghi nhận xét). Điểm thử nếm (thang 100) chỉ dùng cho cà phê.
- Bước 2 sẽ dùng mẫu trước xuất "đạt" làm điều kiện xếp tàu khi hợp đồng đánh dấu "duyệt mẫu trước xuất" (BH-4).

## Quyền

Dùng chung quyền với báo giá: nhân viên kinh doanh thấy và sửa phiếu, mẫu của mình; Trưởng phòng KD, Ban Giám đốc, Kế toán trưởng xem tất cả (`HOP_DONG_XEM_TAT_CA`), Trưởng phòng sửa được tất cả (`HOP_DONG_SOAN_TAT_CA`).

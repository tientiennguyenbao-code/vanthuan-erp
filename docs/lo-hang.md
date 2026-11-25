# Lô hàng

Theo "Thiết kế phân hệ Điều phối lô hàng và chứng từ".

## Lô mua
- Tạo từ hợp đồng mang phí đã ký với nhà cung cấp: hợp đồng mua (mua đứt) hoặc hợp đồng môi giới.
- Các bước theo thứ tự: thu gom (cộng dồn kg) → sơ chế (khối lượng đầu ra + hao hụt = thu gom) → nhập kho (khớp khối lượng sau sơ chế).
- Lưu mã số vùng trồng, mã cơ sở đóng gói, ngày thu hoạch, chứng nhận.

## Lô xuất
- Tạo từ hợp đồng đối ứng đã ký: hợp đồng bán (mua đứt) hoặc hợp đồng mua bán trực tiếp (môi giới). Mỗi hợp đồng đối ứng chỉ một lô xuất; mỗi lô xuất một booking.
- Các bước: đóng gói, phân bổ → nhập kho → giám định → đặt chỗ, đóng cont → xếp tàu → hoàn tất. Không đủ điều kiện thì không chuyển bước:
  - sang nhập kho: có phân bổ, tổng phân bổ trong dung sai hợp đồng, mọi dòng phân bổ đã được Trưởng phòng KD duyệt (người tạo không tự duyệt);
  - sang giám định: lô mua bị chia cho từ hai lô xuất trở lên phải có xác nhận đồng ý của nhà cung cấp (mã băm ghi lên sổ cái hợp đồng với nhà cung cấp);
  - sang đặt chỗ: giám định gần nhất đạt;
  - sang xếp tàu: có booking, mọi container đã có số chì, nhập số vận đơn và ngày tàu chạy.
- Cổng chứng từ trước xếp tàu và đề nghị thu phí theo lô làm ở phần chứng từ.

## Phân bổ
- Nhiều–nhiều giữa lô mua và lô xuất; cùng mặt hàng, cùng loại giao dịch; chỉ khi lô xuất đang đóng gói và lô mua đã sơ chế.
- Tổng phân bổ không vượt khối lượng còn lại của lô mua (kiểm cả trong cơ sở dữ liệu).
- Lô môi giới gom nhiều nhà cung cấp: phần mềm đề xuất nhà cung cấp chính là người góp nhiều nhất; bằng nhau thì điều phối viên chọn.

## Bảng điều phối và cảnh báo
- Đèn đỏ: còn ≤ 3 ngày đến cut-off (SI hoặc hàng) mà lô chưa xếp tàu, hoặc giám định gần nhất không đạt. Vàng: còn ≤ 7 ngày.
- Nhật ký lô chỉ ghi thêm (chặn sửa, xoá trong cơ sở dữ liệu).

## Quyền
- Trưởng phòng KD: quản lý mọi lô, giao lô, duyệt phân bổ. Nhân viên KD: tạo lô từ hợp đồng mình phụ trách, quản lý lô của mình.
- Ban Giám đốc, Kế toán trưởng, kế toán viên: xem mọi lô.

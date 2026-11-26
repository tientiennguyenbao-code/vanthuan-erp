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

# Bước 2: hợp đồng nhiều đợt, giá trừ lùi, mẫu trước xuất

## Hợp đồng bán giao nhiều đợt (BH-1)

- Điều khoản hợp đồng bán (`ban`, `mua_ban_truc_tiep`) có thêm `dotGiao`: danh sách `{ thang: 'YYYY-MM', soLuong }`, tối đa 24 đợt. Tổng các đợt phải bằng số lượng hợp đồng, tháng tăng dần; nếu không thì không trình ký được.
- Mỗi đợt một lô xuất: khi tạo lô xuất phải chọn đợt (`dot`). Lô xuất lưu `shipmentNo` và `plannedKg` (khối lượng của đợt). Dung sai của hợp đồng áp cho từng lô theo khối lượng đợt.
- Hợp đồng giao một lần giữ nguyên cách cũ (một hợp đồng một lô xuất).
- `GET /hop-dong/:id/thuc-hien`: tiến độ từng đợt (kế hoạch, lô xuất, đã phân bổ, đã giao khi lô đã xếp tàu, đã chốt giá) và tổng đã giao so với dung sai.
- Kế hoạch thu mua tính cầu theo từng đợt, theo tháng của đợt.

## Giá trừ lùi cà phê (BH-2)

- `giaTruLui: { san: 'ICE_LONDON' | 'ICE_NY', kyHan: 'YYYY-MM', chenhLech }` (USD/tấn). Chỉ dùng cho cà phê, hợp đồng phải tính bằng USD và theo tấn. Đơn giá trong hợp đồng là giá tạm tính.
- Chốt giá theo từng lô xuất (`/lo-xuat/:id/ban-hang/chot-gia`): mỗi lần ghi ngày, khối lượng, giá sàn. Sàn London tính USD/tấn; sàn New York nhập US cent/lb và quy ra USD/tấn (× 22,0462). Giá chốt = giá sàn + chênh lệch.
- Không chốt vượt khối lượng của lô cộng dung sai; huỷ một lần chốt phải ghi lý do. Mỗi lần chốt và huỷ được ghi vào sổ cái của hợp đồng.
- Khối lượng phải chốt = khối lượng đã phân bổ (chưa phân bổ thì lấy khối lượng đợt). Chưa chốt đủ thì chặn xếp tàu; còn dưới 10 ngày đến ETD mà chưa chốt hết thì hiện cảnh báo.
- Giá trị lô (thu chi, quyết toán, khiếu nại) dùng giá bình quân gia quyền các lần chốt; chưa chốt thì tạm dùng đơn giá hợp đồng.

## Mẫu trước xuất bắt buộc (BH-4)

- Điều khoản `duyetMauTruocXuat: true`: lô xuất phải có một mẫu trước xuất "đạt" mới được xếp tàu.
- Điều kiện bán hàng (mẫu, chốt giá) nằm chung danh sách "chưa đủ để xếp tàu" với chứng từ, nên Giám đốc mở chặn được như thiếu chứng từ.

## Quyền

Xem: người xem được lô (`LO_HANG_XEM_TAT_CA`), cấp quản lý bán hàng (`HOP_DONG_XEM_TAT_CA`) hoặc người phụ trách lô. Chốt giá và huỷ chốt: `LO_HANG_PHAN_CONG`, `HOP_DONG_SOAN_TAT_CA`, hoặc người phụ trách lô có quyền quản lý lô của mình.

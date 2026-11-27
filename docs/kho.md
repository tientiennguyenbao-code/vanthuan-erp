# Kho và sơ chế

Theo "Thiết kế phân hệ Kho và Sơ chế" (KS-1..9). Bước K1: kho, khu, nhận hàng, tồn kho, chuyển khu. Bước K2: lệnh sơ chế, định mức hao hụt, truy xuất qua sơ chế.

## Khu
- Mỗi kho, xưởng (danh mục cơ sở) chia thành khu. Loại khu: khu thường, khu đủ EUDR, kho lạnh; có thể ghi sức chứa.
- Cà phê đủ EUDR chỉ vào khu đủ EUDR; khu đủ EUDR chỉ nhận cà phê đủ EUDR. Thủy sản chỉ vào kho lạnh.
- Không nhận quá sức chứa của khu. Khu còn hàng không ngừng dùng được.

## Thủ kho
- Vai trò mới Thủ kho (bắt buộc đăng nhập 2 lớp). Trưởng phòng KD hoặc Ban Giám đốc giao thủ kho cho từng kho.
- Thủ kho chỉ ghi phiếu ở kho mình được giao.

## Lô tồn và nhận hàng
- Phiếu nhận hàng: mỗi chuyến xe một phiếu (cân tại kho, số bao, độ ẩm). Mỗi phiếu sinh một lô tồn nguyên liệu, mang 100% nguồn gốc từ lô mua.
- Phần mềm so tổng đã nhận với tổng thu gom của lô mua: nhận nhiều hơn quá 1% thì cảnh báo; nhận ít hơn quá 1% chỉ cảnh báo khi lô đã thôi thu gom. Không chặn.
- Huỷ phiếu (kèm lý do) chỉ khi hàng của phiếu chưa bị chuyển, tách hay dùng.
- Chuyển khu trong cùng kho: chuyển cả lô giữ nguyên mã; chuyển một phần thì tách thành lô tồn mới, cùng tỷ lệ nguồn gốc.
- Sổ kho (stock_moves) chỉ ghi thêm, chặn sửa, xoá trong cơ sở dữ liệu.

## Sơ chế (K2)
- Lệnh sơ chế (LSC-YYYY-NNNN): thủ kho được giao ghi; nhiều lô tồn vào, nhiều dòng ra theo hạng, cộng phụ phẩm. Vào = ra + phụ phẩm + hao hụt.
- Trộn (KS-1): cùng kho, cùng mặt hàng, cùng nhãn EUDR, cùng loại giao dịch. Hàng môi giới chỉ trộn các lô của cùng một nhà cung cấp. Phụ phẩm không vào sơ chế (KS-8).
- Công đoạn theo ngành (cà phê: phơi, sấy, xát, sàng phân loại, tách màu, đánh bóng, đóng bao; gia vị; thủy sản). Mạ băng (thủy sản) được tăng khối lượng, không xét định mức.
- Định mức hao hụt: Giám đốc, Phó Giám đốc đặt theo ngành và công đoạn (quyền SO_CHE_DINH_MUC).
- Vượt định mức, hoặc công đoạn chưa có định mức (KS-3): thủ kho phải ghi lý do; lô ra ở trạng thái "chờ duyệt", không chuyển khu, không sơ chế tiếp. Giám đốc, Phó Giám đốc (SO_CHE_DUYET) duyệt thì lô ra dùng được; từ chối (kèm lý do) thì lô ra bị huỷ, hàng trả lại các lô vào.
- Nguồn gốc lô ra (KS-2): trộn theo tỷ lệ khối lượng các lô vào. Trang lô tồn có "Đường đi của hàng": lần ngược qua các lệnh sơ chế, các lần tách lô, về phiếu nhận hàng và lô mua (GET /kho/lo-ton/:id/truy-xuat).
- Bảng tồn tách theo loại (nguyên liệu, thành phẩm, phụ phẩm), hạng và trạng thái.

## Chưa làm (K3..K4)
- Xuất kho cho lô xuất, chuyển kho khác địa điểm, kiểm kê, nhiệt độ kho lạnh.
- Chi phí kho, sơ chế vào quyết toán; kho thuê và kho nhà cung cấp ghi qua cổng đối tác.
- Bước "sơ chế" và "nhập kho" cũ trên lô mua vẫn giữ cho tới K3, vì việc phân bổ lô mua vào lô xuất còn dựa vào trạng thái "đã nhập kho". K3 chuyển sang lấy hàng từ lô tồn (KS-5).

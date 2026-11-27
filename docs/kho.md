# Kho và sơ chế

Theo "Thiết kế phân hệ Kho và Sơ chế" (KS-1..9). Bước K1: kho, khu, nhận hàng, tồn kho, chuyển khu.

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

## Chưa làm (K2..K4)
- Lệnh sơ chế nhiều đầu vào, đầu ra theo hạng, phụ phẩm, định mức hao hụt; truy xuất theo tỷ lệ qua sơ chế.
- Xuất kho cho lô xuất, chuyển kho khác địa điểm, kiểm kê, nhiệt độ kho lạnh.
- Chi phí kho, sơ chế vào quyết toán; kho thuê và kho nhà cung cấp ghi qua cổng đối tác.
- Bước "sơ chế" và "nhập kho" cũ trên lô mua vẫn giữ cho tới khi K2 thay.

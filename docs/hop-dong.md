# Hợp đồng và sổ cái kiểu blockchain (phần 2b)

Theo "Thiết kế phân hệ Giao dịch & Đối tác" mục 3.3, 3.6, 3.7 và "Thiết kế kỹ thuật GĐ1" mục Sổ cái.

## Quy trình

Soạn (`nhap`) → Trình ký (`cho_ky`, nội dung bị khoá) → Ký (`da_ky`) → Phụ lục (phiên bản mới, quay về `nhap`; bản đã ký cũ vẫn hiệu lực tới khi phụ lục được ký) → Huỷ (`da_huy`).

- Loại hợp đồng: `mua` (HDM), `ban` (HDB), `moi_gioi` (HDMG, dịch vụ môi giới với bên bán), `mua_ban_truc_tiep` (HDTT, NCC ký thẳng với người mua). Số hợp đồng `HDM-2026-0001`, đánh số theo loại và năm.
- Đối tác phải đúng vai (nhà cung cấp / người mua) và thẩm định đạt còn hạn: kiểm khi tạo, khi trình ký và khi ký.
- Ký: Giám đốc ký mọi hợp đồng. Phó Giám đốc cần văn bản ủy quyền còn hiệu lực, giá trị hợp đồng (quy USD) trong hạn mức. Người trình không tự ký. Người ký nhập lại mã 2 lớp.
- Huỷ: chưa từng ký thì người soạn huỷ; đã ký thì chỉ Ban Giám đốc.

## Bảo mật nội dung

Điều khoản (số lượng, giá, thanh toán...) mã hoá AES-256-GCM theo từng phiên bản bằng khoá riêng của hợp đồng; khoá này được khoá bằng `APP_KEY`. Quản trị hệ thống không có quyền xem hợp đồng.

## Sổ cái

- `contract_ledger`: mỗi lần tạo, sửa, trình ký, trả lại, ký, phụ lục, huỷ là một dòng; mang mã băm SHA-256 của đúng phiên bản và mã băm dòng trước. Cơ sở dữ liệu chặn sửa, xoá (trigger).
- `contract_versions`: đã trình ký thì không đổi nội dung, đã ký thì không đổi gì, không xoá được (trigger).
- Neo: sau mỗi lần ký, các dòng chưa neo được gom thành cây Merkle (kiểu RFC 6962) và lưu mã gốc vào `anchor_batches` (chỉ ghi thêm). Có thể neo tay: `POST /api/so-cai/neo`.
- Xác minh công khai: `GET /api/xac-minh/:ma` và trang `/xac-minh`, không cần đăng nhập, chỉ trả lời khớp hay không, tình trạng hiệu lực, chữ ký, biên nhận neo; không lộ tên, giá, điều khoản.

## Phần còn tạm thời (cần làm trước khi dùng với đối tác thật)

1. **Chữ ký**: đang dùng chữ ký nội bộ (HMAC bằng khoá suy ra từ `APP_KEY`), chưa có giá trị pháp lý. Thay bằng MISA eSign qua giao diện `SignatureProvider` (`src/contracts/providers.ts`) khi có hợp đồng dịch vụ.
2. **Neo ra blockchain công khai**: đang neo nội bộ (`InternalAnchorProvider`). Ghi lên Polygon / OpenTimestamps cần ví và một ít phí; thay qua `AnchorProvider`.
3. Hạn mức duyệt hợp đồng theo giá trị cho cả Giám đốc (thiết kế mục 2) và tỷ lệ phí dưới sàn: làm cùng phần báo giá và phí.
4. Bản PDF hợp đồng song ngữ có mã QR xác minh: làm sau khi có mẫu hợp đồng.

## Phí trọn gói

- Hợp đồng mua (mua đứt) và hợp đồng môi giới mang tỷ lệ phí trọn gói; thiếu tỷ lệ thì không trình ký được.
- Ban Giám đốc đặt **mức sàn** tại trang *Hợp đồng → Mức sàn phí* (`PUT /api/phi/muc-san`). Mỗi lần đổi đều ghi nhật ký.
- Hợp đồng có tỷ lệ thấp hơn mức sàn vẫn trình ký được, nhưng **không ký được** cho tới khi Ban Giám đốc bấm *Duyệt phí* (`POST /api/hop-dong/:id/duyet-phi`). Người trình không tự duyệt (4 mắt).
- Việc duyệt ghi vào sổ cái (sự kiện `duyet_phi`) và gắn với mã băm nội dung: sửa điều khoản hay lập phụ lục thì phải duyệt lại.
- Gợi ý tỷ lệ (`GET /api/phi/goi-y?matHangId=`): số thống kê (phổ biến, trung bình, thấp nhất, cao nhất) từ các hợp đồng mang phí đã ký, không lộ hợp đồng cụ thể.
- Việc tính và thu phí theo từng lô (khi giao hàng) làm cùng phần lô hàng.

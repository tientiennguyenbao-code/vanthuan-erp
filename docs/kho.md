# Kho và sơ chế

Theo "Thiết kế phân hệ Kho và Sơ chế" (KS-1..9). Bước K1: kho, khu, nhận hàng, tồn kho, chuyển khu. Bước K2: lệnh sơ chế, định mức hao hụt, truy xuất qua sơ chế. Bước K3a: phiếu xuất kho cho lô xuất.

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

## Xuất kho cho lô xuất (K3a, KS-5)
- Phiếu xuất kho (PXK-YYYY-NNNN): thủ kho được giao chọn một lô xuất đang đóng gói và các lô tồn ở kho mình, ghi khối lượng, xe, container.
- Lô tồn xuất được: sẵn sàng (không chờ duyệt hao hụt), không phải phụ phẩm, cùng mặt hàng và loại giao dịch với lô xuất; cà phê đi EU phải đủ EUDR. Không xuất quá khối lượng hợp đồng cộng dung sai.
- Phần mềm quy khối lượng về từng lô mua theo tỷ lệ nguồn gốc của lô tồn và ghi thành dòng phân bổ trên lô xuất (gắn mã phiếu). Các dòng này vẫn chờ Trưởng phòng KD duyệt; chia lô, đồng ý của nhà cung cấp, chứng từ, truy xuất, quyết toán đọc như trước.
- Lô mua đã nhận vào kho thì không phân bổ thẳng nữa. Dòng phân bổ từ phiếu xuất không huỷ lẻ: thủ kho huỷ cả phiếu (khi lô xuất còn đóng gói), hàng trở về lô tồn. Huỷ lô xuất cũng huỷ các phiếu xuất còn hiệu lực.
- Truy xuất của lô xuất ghi các kho đã nhận hàng của lô mua.

## Chuyển kho (K3b)
- Phiếu chuyển kho (CK-YYYY-NNNN): thủ kho của kho đi chọn lô tồn sẵn sàng, kho đến (khác kho đi; trong cùng kho thì dùng chuyển khu), khối lượng, xe. Hàng trừ khỏi lô tồn ngay và "đang đi đường".
- Thủ kho của kho đến cân lại, chọn khu (vẫn theo quy tắc khu: EUDR, kho lạnh, sức chứa) và nhận. Phần mềm sinh lô tồn mới ở kho đến, cùng mặt hàng, hạng, loại giao dịch, EUDR và cùng nguồn gốc lô mua. Không nhận nhiều hơn số đã gửi; phần thiếu là hao hụt vận chuyển, ghi trên phiếu.
- Khi chưa nhận, kho đi huỷ được phiếu (ghi lý do), hàng về lại lô tồn.
- Truy xuất lô nhận về có bước "Chuyển kho" rồi đi tiếp về lô ở kho đi.

## Kiểm kê tháng (K3b, KS-6)
- Thủ kho mở đợt (KK-YYYY-NNNN) cho kho mình; mỗi kho chỉ một đợt chưa xong. Mở đợt thì chụp số sổ của mọi lô tồn còn hàng.
- Thủ kho ghi số đếm từng lô (lưu nhiều lần được), rồi chốt khi đã đếm đủ.
- Không lô nào lệch quá 0,5%: sổ điều chỉnh ngay. Có lô lệch hơn: chờ Kế toán trưởng (KIEM_KE_DUYET) duyệt thì điều chỉnh, trả lại (ghi lý do) thì sổ giữ nguyên và thủ kho mở đợt mới để đếm lại.
- Điều chỉnh theo phần chênh (đếm trừ sổ lúc mở), nên hàng ra vào trong lúc đếm vẫn giữ đúng. Mỗi điều chỉnh là một dòng "kiểm kê" trong sổ kho của lô.

## Chưa làm (K3c..K4)
- Nhiệt độ kho lạnh và hạn dùng (KS-9).
- Chi phí kho, sơ chế vào quyết toán; kho thuê và kho nhà cung cấp ghi qua cổng đối tác.
- Bước "sơ chế" và "nhập kho" cũ trên lô mua chỉ còn dùng cho hàng không qua kho có thủ kho (kho thuê, kho nhà cung cấp) cho tới khi có cổng kho đối tác (K4, KS-4).

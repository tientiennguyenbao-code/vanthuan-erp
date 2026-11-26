# Chứng từ lô hàng và đề nghị thu phí

Theo "Thiết kế phân hệ Điều phối lô hàng và chứng từ" và bản rà soát ma trận 9 cặp (25/11/2026).

## Quy tắc chứng từ (ma trận)
- Mỗi quy tắc ghi: ngành, thị trường, Incoterms (nếu chỉ áp dụng cho một số điều kiện, ví dụ bảo hiểm khi CIF/CIP), loại giao dịch, yêu cầu (bắt buộc hoặc người mua yêu cầu), giai đoạn (trước/sau xếp tàu), phạm vi (cả lô, theo người xuất khẩu, theo từng nhà cung cấp), bên làm, căn cứ pháp lý, cờ "chưa chắc chắn".
- Khởi tạo 39 quy tắc cho cà phê, gia vị, thủy sản × Mỹ, EU, Trung Quốc.
- Ban Giám đốc, Kế toán trưởng, Trưởng phòng KD sửa và ghi "đã rà soát". Quy tắc quá 12 tháng chưa rà soát bị đánh dấu.

## Checklist của lô xuất
- Sinh khi tạo lô và cập nhật mỗi khi phân bổ hoặc huỷ phân bổ. Dòng không còn áp dụng được giữ lại để tra cứu.
- Lô môi giới: chứng từ "người xuất khẩu" tách theo từng nhà cung cấp (vì nhà cung cấp đứng tên xuất khẩu). Gom từ hai nhà cung cấp trở lên thì thêm thỏa thuận ủy quyền nhà cung cấp chính.
- Nhân viên phụ trách cập nhật (chưa có, đang xin, có bản nháp + số chứng từ). Trưởng phòng KD duyệt; người cập nhật không tự duyệt. Sửa chứng từ đã duyệt thì phải duyệt lại.

## Tệp chứng từ
- Nhận PDF, JPG, PNG, tối đa 25 MB; loại tệp kiểm theo nội dung, không theo đuôi tên.
- Mỗi tệp mã hoá bằng khoá riêng (khoá này khoá bằng APP_KEY) rồi mới lưu; ghi mã băm SHA-256 và người nộp.
- Nộp lại tạo phiên bản mới, bản cũ giữ nguyên (cơ sở dữ liệu chặn sửa, xoá). Chứng từ đã duyệt mà nộp tệp mới thì phải duyệt lại.
- Trưởng phòng chỉ duyệt được chứng từ đã có tệp.
- Tải xuống qua đường dẫn tạm hết hạn sau 10 phút, chỉ người xin dùng được; mỗi lần tải ghi nhật ký.
- Hiện lưu trên đĩa máy chủ (FILE_DIR). Khi chạy thật đổi sang kho chuẩn S3 đặt tại Việt Nam, có khoá chống xoá, và bật quét virus (cột scan_status đã có sẵn).

## Cổng chặn
- Sang "xếp tàu": mọi chứng từ bắt buộc trước xếp tàu phải đã duyệt (hoặc đánh dấu không áp dụng, có lý do) và không hết hạn trước ngày tàu chạy.
- Giám đốc có thể mở chặn một lần, bắt buộc ghi lý do; lưu vào nhật ký lô và nhật ký hệ thống.
- Sang "hoàn tất": mọi chứng từ bắt buộc đã gửi người mua hoặc ngân hàng (chứng từ do người nhập khẩu làm chỉ cần xác nhận đã có).

## Đề nghị thu phí
- Khi lô xếp tàu, tự lập một đề nghị cho mỗi lô mua: khối lượng thực giao × đơn giá bán của hợp đồng đối ứng × tỷ lệ phí của hợp đồng với nhà cung cấp.
- Hợp đồng chưa có tỷ lệ phí thì đề nghị ở trạng thái "thiếu tỷ lệ". Kế toán trưởng duyệt.

## Chưa làm (phần sau)
- Quét virus tệp tải lên, neo mã băm tệp lên blockchain.

## Cổng nhà cung cấp
- Nhân viên phụ trách đối tác mời người của nhà cung cấp (đã thẩm định đạt) từ trang đối tác; phần mềm cấp mật khẩu tạm, nhân viên gửi riêng. Lần đầu đăng nhập phải đổi mật khẩu và cài đăng nhập 2 lớp.
- Nhà cung cấp chỉ thấy lô xuất có hàng của mình (phân bổ còn hiệu lực), khối lượng của mình, ngày tàu, cut-off. Không thấy giá, không thấy hàng của nhà cung cấp khác. Tên người mua chỉ hiện ở lô môi giới.
- Nhà cung cấp cập nhật và nộp tệp cho chứng từ mang tên mình và chứng từ chung cả lô do nhà cung cấp lập (thỏa thuận ủy quyền). Không duyệt được; Trưởng phòng KD duyệt. Bị trả lại thì thấy lý do.
- Nhà cung cấp chính của lô môi giới gom thấy thêm tình trạng (không tệp, không số) chứng từ của các nhà cung cấp cùng lô.
- Tài khoản đối tác không dùng 90 ngày thì tự khoá.
- Chưa có: gửi email mời và email báo trả lại, giao diện tiếng Anh, cổng cho người mua và ngân hàng.

## Chuyển đề nghị thu phí sang MISA AMIS

- Kế toán trưởng và kế toán viên (quyền `KE_TOAN_XUAT_MISA`) bấm **Xuất tệp Excel** ở trang Đề nghị thu phí.
- Mỗi lần xuất lập một **đợt** mã `MISA-YYYYMMDD-NN`, gồm mọi đề nghị **đã duyệt** chưa chuyển. Đề nghị đã nằm trong một đợt thì không xuất lại; danh sách đề nghị hiện "Đã chuyển kế toán (mã đợt)".
- Tệp có 3 trang: "Ban dich vu" (một dòng mỗi đề nghị: ngày vận đơn, số chứng từ `PTG-…`, khách hàng là nhà cung cấp, Nợ 131 / Có 5113, số tiền, loại tiền), "Khach hang" (danh mục khách hàng cần có trong AMIS) và "Ghi chu".
- Cột tỷ giá để trống với ngoại tệ: kế toán điền tỷ giá ngày hạch toán khi nhập AMIS.
- Tệp mỗi đợt được lưu mã hoá kèm mã băm; **Tải lại** trả đúng tệp đã xuất. Mỗi lần xuất và tải lại ghi vào nhật ký.
- Danh sách cột nằm ở `apps/api/src/accounting/misa.ts`. Khi công ty có AMIS, lấy tệp mẫu nhập khẩu của AMIS và chỉnh danh sách cột cho khớp; tài khoản 131/5113 do Kế toán trưởng chốt.

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

## Cổng chặn
- Sang "xếp tàu": mọi chứng từ bắt buộc trước xếp tàu phải đã duyệt (hoặc đánh dấu không áp dụng, có lý do) và không hết hạn trước ngày tàu chạy.
- Giám đốc có thể mở chặn một lần, bắt buộc ghi lý do; lưu vào nhật ký lô và nhật ký hệ thống.
- Sang "hoàn tất": mọi chứng từ bắt buộc đã gửi người mua hoặc ngân hàng (chứng từ do người nhập khẩu làm chỉ cần xác nhận đã có).

## Đề nghị thu phí
- Khi lô xếp tàu, tự lập một đề nghị cho mỗi lô mua: khối lượng thực giao × đơn giá bán của hợp đồng đối ứng × tỷ lệ phí của hợp đồng với nhà cung cấp.
- Hợp đồng chưa có tỷ lệ phí thì đề nghị ở trạng thái "thiếu tỷ lệ". Kế toán trưởng duyệt.

## Chưa làm (phần sau)
- Tải tệp chứng từ lên, cổng cho nhà cung cấp tự cập nhật, xuất Excel sang MISA AMIS.

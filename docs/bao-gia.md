# Báo giá

Theo "Thiết kế phân hệ Giao dịch & Đối tác" mục 3.2, 3.4, 3.5.

- Báo giá mua (`BGM-…`) từ nhà cung cấp; báo giá bán (`BGB-…`) cho người mua, chọn một báo giá mua làm nguồn.
- Trạng thái: soạn → đã gửi → đối tác chấp nhận / từ chối; huỷ được khi chưa chấp nhận. Đã gửi thì không sửa thẳng, phải "lập sửa đổi" (tăng phiên bản, quay về soạn). Báo giá quá ngày hiệu lực không gửi, không chấp nhận được.
- So sánh báo giá mua cùng mặt hàng: quy về USD/kg, bỏ báo giá hết hạn, huỷ, bị từ chối.
- Chi phí ngoài giá hàng của báo giá bán: gợi ý các khoản theo Incoterms (FOB: vận tải nội địa, thủ tục xuất khẩu, xếp hàng; CFR thêm cước biển; CIF thêm bảo hiểm).
- Biên dự kiến (mua đứt) = giá trị bán − giá vốn (giá mua/kg × sản lượng bán) − chi phí + phí trọn gói (bên bán trả, % trên giá bán).
- Chấp nhận sinh hợp đồng nháp trong cùng một giao dịch cơ sở dữ liệu (lỗi thì không tạo gì):
  - báo giá mua → hợp đồng mua;
  - báo giá bán, mua đứt → hợp đồng mua (từ báo giá nguồn, ghi tỷ lệ phí) + hợp đồng bán;
  - báo giá bán, môi giới → hợp đồng mua bán trực tiếp + hợp đồng dịch vụ môi giới (ghi tỷ lệ phí).
  Đối tác phải thẩm định đạt mới sinh được hợp đồng; lập báo giá thì chưa bắt buộc.

Giả định: dùng chung quyền với hợp đồng (người soạn hợp đồng lập báo giá; nhân viên chỉ thấy báo giá của mình). Câu hỏi GĐ-2 (nhân viên bán có thấy giá mua không) chưa chốt nên hiện ai lập báo giá bán đều thấy giá vốn. Dung sai mặc định 5% khi sinh hợp đồng. Xuất PDF song ngữ để sau.

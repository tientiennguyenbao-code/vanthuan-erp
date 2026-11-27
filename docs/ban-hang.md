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

# Bước 3: hạn mức nợ và tuổi nợ người mua (BH-3)

- Hợp đồng bán mua đứt (`ban`) có thể đánh dấu trả chậm: `traChamNgay` là số ngày người mua trả sau ngày tàu chạy. Hợp đồng môi giới không tính vì người mua trả thẳng nhà cung cấp.
- Hạn mức nợ (`credit_limits`): Kế toán trưởng đề xuất (`HAN_MUC_DE_XUAT`), Giám đốc duyệt hoặc từ chối (`HAN_MUC_DUYET`, từ chối phải ghi lý do, người đề xuất không tự duyệt). Dòng được duyệt mới nhất có hiệu lực. Chưa có hạn mức thì là 0.
- Dư nợ = các khoản tiền hàng người mua đã lên lịch thu mà chưa thu (quy USD) + giá trị các hợp đồng bán trả chậm đã trình hoặc đã ký nhưng chưa lên lịch thu khoản nào.
- Tuổi nợ theo ngày đến hạn của từng khoản: chưa đến hạn, quá 1–30, 31–60, 61–90, trên 90 ngày, chưa có ngày đến hạn.
- Trình ký và ký hợp đồng trả chậm bị chặn khi: chưa có hạn mức; số ngày trả chậm vượt số ngày được duyệt; dư nợ cộng hợp đồng này vượt hạn mức; hoặc người mua có khoản quá hạn trên 30 ngày. Hợp đồng thanh toán trước hoặc theo chứng từ không bị chặn.
- Trang `/ban-hang/cong-no` (quyền `CONG_NO_XEM`: Ban Giám đốc, Kế toán trưởng, kế toán viên, Trưởng phòng KD) và trang chi tiết từng người mua.

# Bước 4a: cổng người mua tiếng Anh (BH-5, BH-6, BH-7)

- Nhân viên mời người của người mua từ trang đối tác (chọn vai "Người mua", `vai: 'nguoi_mua'`). Tài khoản mang vai `NGUOI_MUA`, không có quyền nội bộ nào, không bắt buộc đăng nhập 2 lớp, không dùng 90 ngày thì tự khoá. Trang đăng nhập và đổi mật khẩu hiện song ngữ.
- `GET /cong-nguoi-mua`: hợp đồng đã ký (điều khoản, mã xác minh), lô hàng, khoản phải trả và tổng còn nợ. `GET /cong-nguoi-mua/lo/:id`: tiến độ lô, tàu, vận đơn, người gửi hàng, mã truy xuất, chứng từ chung của lô, mẫu, các lần chốt giá, khoản phải trả, khiếu nại.
- Người mua không thấy: giá mua, tỷ lệ phí, chi phí, ghi chú nội bộ, giấy tờ riêng của từng nhà cung cấp. Lô mua đứt: người gửi hàng là Vạn Thuận, không hiện tên nhà cung cấp; chỉ hiện mã vùng trồng và mã cơ sở đóng gói đã duyệt (BH-7). Lô môi giới: hiện nhà cung cấp chính đứng tên trên vận đơn.
- Chứng từ: người mua xem tệp khi chứng từ ở bản nháp, đã duyệt hoặc đã gửi. Với bản nháp và bản đã duyệt có tệp, người mua bấm đồng ý hoặc yêu cầu sửa (phải ghi nội dung) qua `POST /cong-nguoi-mua/chung-tu/:id/y-kien`. Ý kiến không đổi trạng thái chứng từ; nhân viên thấy ý kiến mới nhất ngay trong danh mục chứng từ của lô và trong nhật ký lô.
- Khiếu nại: người mua tự mở khiếu nại cho lô của mình sau khi hàng đã xếp tàu và lô chưa quyết toán (dùng chung `POST /lo-xuat/:id/khieu-nai`).

# Bước 4b: báo cáo kinh doanh theo tháng

- `GET /bao-cao-kinh-doanh?tuThang=YYYY-MM&denThang=YYYY-MM` (mặc định 12 tháng gần nhất, tối đa 24 tháng). Chỉ cấp quản lý bán hàng (`HOP_DONG_XEM_TAT_CA`). Trang `/ban-hang/bao-cao`.
- Hợp đồng bán đã ký: hợp đồng `ban` (mua đứt) và `mua_ban_truc_tiep` (môi giới), tính vào tháng ký bản gốc, giá trị theo bản đang hiệu lực, quy USD theo tỷ giá trên hợp đồng.
- Hàng đã giao: lô đã xếp tàu hoặc hoàn tất, tính vào tháng tàu chạy; khối lượng là phần phân bổ; giá trị theo giá bán (giá trừ lùi dùng giá bình quân đã chốt).
- Tỷ lệ thắng hỏi hàng = thắng / (thắng + thua), theo tháng nhận phiếu, bỏ phiếu huỷ. Tỷ lệ chấp nhận báo giá bán = chấp nhận / (chấp nhận + từ chối), theo tháng lập.
- Chia theo ngành, thị trường, người mua. Thị trường của hợp đồng lấy theo nước người mua (US, EU, CN, khác); của lô đã giao lấy theo thị trường ghi trên lô. Hợp đồng hoặc lô thiếu tỷ giá được đếm riêng, không cộng vào giá trị.

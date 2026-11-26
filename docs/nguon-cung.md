# Nguồn cung: nông hộ, vùng trồng, thửa

Bước 1 của phân hệ Nguồn cung và Thu mua (bản thiết kế đã được Giám đốc chốt ngày 26/11/2026). Mục tiêu: mỗi kg cà phê xuất sang EU truy được về thửa có tọa độ, kịp mốc EUDR 30/12/2026.

## Dữ liệu

| Bảng | Nội dung |
|---|---|
| `growing_areas` | Vùng trồng / vùng nuôi của nhà cung cấp, mã số chính thức nếu có. Chỉ nhân viên lập. Mã tự sinh `<mã NCC>-Vnn`. |
| `farmers` | Nông hộ. Số CCCD mã hoá AES-256-GCM bằng `APP_KEY`; lưu mã băm có khoá để phát hiện trùng, và 4 số cuối để hiển thị. Bắt buộc ngày hộ ký đồng ý xử lý dữ liệu. Mã `<mã NCC>-Hnnn`. |
| `plots` | Thửa / ao, GeoJSON WGS84 (6 chữ số thập phân). Mã `<mã vùng>-nnn`. Cảnh báo (chồng lấn, lệch diện tích) lưu ở cột `warnings`. |
| `partner_documents.growing_area_id` | Phạm vi chứng nhận: trống là cả nhà cung cấp. |

## Quy tắc (`apps/api/src/sourcing/sourcing.rules.ts`)

- Thửa ≤ 4 ha: một điểm + diện tích khai. Thửa > 4 ha: bắt buộc đa giác (EUDR).
- Đa giác: tự khép, bỏ điểm trùng liên tiếp, từ chối tự cắt hoặc có lỗ; diện tích đo trên mặt cầu, dùng thay diện tích khai; lệch > 20% thì cảnh báo.
- Nhà cung cấp ở Việt Nam: mọi điểm phải nằm trong khung lãnh thổ Việt Nam (bắt lỗi đảo kinh độ, vĩ độ).
- Chồng lấn với thửa còn hiệu lực của mọi nhà cung cấp (điểm cách < 10 m, điểm trong ranh giới, cạnh cắt nhau) → cảnh báo, không chặn.
- Nhà cung cấp phải đạt thẩm định mới được thêm vùng, hộ, thửa. Không xoá, chỉ huỷ có lý do; sửa tọa độ ghi tọa độ cũ vào nhật ký.

## Quyền

Vai trò mới **Nhân viên thu mua**. `NGUON_CUNG_QUAN_LY`: thu mua, Trưởng phòng KD. `NGUON_CUNG_XEM_CCCD`: thu mua, Giám đốc (mỗi lần xem ghi nhật ký). Ban Giám đốc, Kế toán trưởng, NV kinh doanh chỉ xem.

## Đường dẫn

Nội bộ `/api/nguon-cung`: danh sách, `/:partnerId`, `/:partnerId/vung|ho|thua|nhap-geojson`, `/:partnerId/geojson?vung=`, `/thua/:id/toa-do`, `/thua/:id/huy`, `/ho/:id/huy`, `/ho/:id/cccd`.
Cổng `/api/cong/nguon-cung`: xem, `ho`, `thua`, `nhap-geojson`, `thua/:id/toa-do`, `geojson` (chỉ dữ liệu của mình).

GeoJSON xuất ra có `ProducerCountry`, `ProductionPlace`, `Area` cho mỗi thửa, không có tên hay CCCD của hộ.

## Giao diện

- `/nguon-cung`, `/nguon-cung/[id]`: tổng hợp, hình vẽ vị trí thửa (không cần bản đồ nền), bảng vùng, hộ, thửa, nhập tệp GeoJSON.
- `/cong/vung-trong`: điện thoại. Thửa nhỏ: bấm một lần ở giữa thửa. Thửa lớn: đi quanh ranh giới, bấm “Ghi góc này” ở mỗi góc. Mất sóng thì thửa được giữ trong trình duyệt và tự gửi khi có mạng.

## Chưa làm (các bước sau)

Bước 5b: thủy sản khai thác (giấy khai thác IUU theo tàu, chuyến; phiếu thu gom từ chuyến khai thác) và dữ liệu SIMP đầy đủ cho người nhập Mỹ; nối gói EUDR với dòng "Hồ sơ thẩm định EUDR" của checklist chứng từ; nhập tệp KML.

## Bước 2: phiếu thu gom, trần sản lượng, nhãn đủ EUDR

- **Phiếu thu gom**: mỗi lần cân hàng của một hộ, từ một thửa, vào một lô mua. Khối lượng tự cộng vào lô mua. Nhân viên thu mua, người phụ trách lô hoặc HTX trên cổng (mục Thu gom) đều ghi được. Phiếu sai huỷ kèm lý do khi lô còn đang thu gom; khối lượng được trừ lại.
- **Trần sản lượng**: trần của thửa trong 12 tháng = diện tích × năng suất tối đa. Ban Giám đốc đặt mức chung theo ngành và mức riêng cho vùng ở trang Nguồn cung → Năng suất tối đa. Phiếu làm vượt trần bị từ chối.
- **Nhãn EUDR (chỉ cà phê)**: hàng của phiếu đủ EUDR khi vùng đã có mức năng suất và thửa không còn cảnh báo. Phiếu đầu tiên định nhãn cho cả lô; lô đủ EUDR không nhận hàng chưa đủ hay hàng ghi tay, và ngược lại. Bước 3 sẽ thêm điều kiện kiểm tra rừng.
- **Chặn đi EU**: lô xuất thị trường EU chỉ phân bổ được lô mua cà phê có nhãn đủ EUDR.

## Bước 3: kiểm tra rừng và gói dữ liệu EUDR

- **Kiểm tra rừng theo thửa**: nhân viên thu mua đối chiếu tọa độ thửa với bản đồ rừng 2020 (JRC, Global Forest Watch) hoặc khảo sát thực địa, ghi kết quả và căn cứ cho một hay nhiều thửa. Trưởng phòng KD hoặc Ban Giám đốc duyệt ở trang Nguồn cung → Kiểm tra rừng (quyền `NGUON_CUNG_DUYET_RUNG`); người ghi không tự duyệt. Đo lại tọa độ thì kết quả cũ hết hiệu lực, phải kiểm lại.
- **Nhãn đủ EUDR** nay đòi thêm: thửa có kết quả "không rừng" đã duyệt.
- **Gói dữ liệu EUDR** ở trang lô xuất đi EU: thửa, hộ (chỉ mã), vùng, diện tích, khối lượng, ngày thu hoạch, kết quả kiểm tra rừng. Chốt gói thì lưu thành một bản (không sửa được) và ghi mã băm lên sổ cái hợp đồng đối ứng. Tải GeoJSON của từng bản để gửi người nhập khẩu nộp DDS.

## Bước 4: kế hoạch thu mua

- **Sản lượng ước tính** theo thửa và tháng thu hoạch (bảng `harvest_estimates`): HTX khai trên cổng (mục Sản lượng dự kiến), nhân viên thu mua chỉnh ở hồ sơ nguồn cung. Chỉ khai từ tháng này đến 24 tháng tới; tổng trong 12 tháng liên tiếp không vượt trần của thửa. 0 kg là xoá. Mỗi lần đổi ghi nhật ký kèm số cũ.
- **Kế hoạch thu mua** (Nguồn cung → Kế hoạch thu mua, quyền `NGUON_CUNG_XEM`), mỗi ngành một bảng 12 tháng:
  - Cung = hàng đang có (lô mua chưa huỷ: đã thu gom − hao hụt − đã phân bổ) tính vào tháng đầu, cộng ước tính theo tháng (trừ phần đã thu gom từ thửa trong cùng tháng).
  - Cầu = báo giá bán đã gửi còn hiệu lực (theo tháng giao dự kiến) và hợp đồng bán/mua bán trực tiếp chưa huỷ, chưa xếp tàu, trừ phần đã phân bổ (theo ETD của lô xuất, không có thì tháng giao của báo giá gốc). Chưa ghi tháng hoặc đã quá tháng thì tính vào tháng này.
  - Thị trường: lô xuất đã lập thì theo lô; chưa thì theo nước của người mua (27 nước EU, Mỹ, Trung Quốc, khác).
  - Cà phê: cầu đi EU chỉ dùng hàng đủ EUDR (lô mua nhãn đủ, ước tính từ thửa đang đủ điều kiện), nên có thêm cột "còn lại đủ EUDR". Số hợp đồng chỉ hiện với người có quyền xem mọi hợp đồng.
- **Báo giá bán** có thêm ô tháng giao dự kiến. Báo giá cà phê sang EU (đang soạn hoặc đã gửi) hiện số hàng đủ EUDR còn trống và cảnh báo khi chào vượt; chỉ cảnh báo, không chặn.

## Bước 5a: truy xuất gia vị và thủy sản nuôi

- **Mã đăng ký của kho, xưởng** (bảng `facility_codes`, Danh mục → Kho và xưởng sơ chế): mã FDA (Mỹ), GACC (Trung Quốc), danh sách cơ sở được xuất vào EU, kèm hạn hiệu lực. Mỗi cơ sở một mã còn dùng cho mỗi loại; đổi mã thì huỷ mã cũ có lý do. Quyền `DANH_MUC_QUAN_LY`.
- **Nhật ký thuốc BVTV** (bảng `spray_logs`) theo thửa gia vị: HTX ghi trên cổng (mục Nhật ký thuốc), nhân viên thu mua ghi ở hồ sơ nguồn cung. Không ghi ngày tương lai. HTX chỉ huỷ được dòng do cổng ghi.
- **Phiếu thu gom gia vị** ghi lưu ý (`trace_issues`) khi ngày thu hoạch còn trong thời gian cách ly của một lần phun chưa huỷ. Chỉ ghi lưu ý, không chặn.
- **Truy xuất lô xuất** (`GET /api/lo-xuat/:id/truy-xuat`, mục Truy xuất nguồn gốc ở trang lô): lô xuất → lô mua → phiếu → thửa/ao. Khi lô mua chia cho nhiều lô xuất, kg của từng thửa chia theo tỷ lệ kg phân bổ / kg lô mua đã thu gom. Cơ sở xử lý hàng lấy từ xưởng của lô mua và sự kiện có cơ sở.
- **Kiểm theo ngành × thị trường** (`apps/api/src/sourcing/trace.rules.ts`):

| Ngành | EU | Mỹ | Trung Quốc |
|---|---|---|---|
| Cà phê | truy tới thửa, đủ EUDR | mã FDA | mã GACC |
| Gia vị | truy tới thửa, nhật ký thuốc và cách ly | mã FDA | mã GACC, mã số vùng trồng |
| Thủy sản | truy tới ao, mã cơ sở nuôi, danh sách EU | mã FDA, SIMP | mã GACC, mã cơ sở nuôi |

  Các điểm về quy định nước nhập (trừ truy nguồn và EUDR) là hiểu biết chung, chưa đối chiếu văn bản gốc, nên màn hình ghi "quy định cần xác minh". Loài SIMP nhận theo tên mặt hàng hoặc loài nuôi.

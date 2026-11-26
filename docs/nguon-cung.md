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

Phiếu thu gom và trần sản lượng (bước 2); kiểm tra phá rừng, duyệt 4 mắt, gói dữ liệu EUDR theo lô xuất (bước 3); kế hoạch thu mua (bước 4); nhập tệp KML.

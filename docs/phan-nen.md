# Phần nền: đăng nhập, phân quyền, nhật ký

Ghi chú cho kỹ sư duyệt mã và vận hành.

## Đăng nhập

Phiên đăng nhập đi qua các bước (`sessions.stage`):

1. `dang-nhap` (email + mật khẩu) → `cho_ma_2_lop` nếu đã cài 2 lớp, `can_cai_2_lop` nếu vai trò bắt buộc 2 lớp mà chưa cài.
2. `ma-2-lop` hoặc `cai-2-lop/xac-nhan` → `phai_doi_mat_khau` nếu đang dùng mật khẩu tạm, ngược lại `day_du`.
3. `doi-mat-khau` → `day_du`.

- Chỉ phiên `day_du` có quyền nghiệp vụ. Mỗi lần lên bước, mã phiên được cấp mới.
- Cookie `vt_phien`: httpOnly, SameSite=Strict, Secure khi `COOKIE_SECURE=true`. Máy chủ chỉ lưu SHA-256 của mã phiên.
- Phiên dở dang hết hạn sau 10 phút; phiên đầy đủ tối đa 12 giờ, tự thoát sau 60 phút không thao tác.
- Nhập sai 5 lần (mật khẩu hoặc mã 2 lớp, cộng dồn) thì khoá tài khoản và huỷ mọi phiên. Chỉ quản trị mở khoá.
- Mật khẩu băm Argon2id. Mã bí mật 2 lớp mã hoá AES-256-GCM bằng `APP_KEY`; mất `APP_KEY` thì mọi người phải cài lại 2 lớp.
- Mỗi mã 2 lớp chỉ dùng được một lần (`users.totp_last_step`).
- Bắt buộc 2 lớp: mọi vai trò nội bộ và nhà cung cấp. Người mua, ngân hàng: không bắt buộc.

## Phân quyền

Bảng vai trò → quyền ở `apps/api/src/permissions/roles.ts`, theo bảng phân quyền trong thiết kế kỹ thuật GĐ1.

- Mọi đường dẫn mặc định phải đăng nhập đầy đủ (`AuthGuard` toàn cục). Mở cho khách phải ghi `@Public()`.
- `@RequirePermissions(...)` đòi đủ mọi quyền liệt kê.
- Quản trị hệ thống chỉ có `TAI_KHOAN_QUAN_LY`, không kiêm vai trò khác, không tự đổi vai trò hay tự vô hiệu chính mình.
- Quyền "của mình" (`*_CUA_MINH`) sẽ được lọc theo người phụ trách trong từng phân hệ.
- Phó Giám đốc có quyền ký như Giám đốc; kiểm tra văn bản ủy quyền còn hiệu lực sẽ làm trong phân hệ hợp đồng.

## Nhật ký thao tác

- Bảng `audit_log` chỉ ghi thêm: trigger trong cơ sở dữ liệu chặn UPDATE, DELETE, TRUNCATE.
- Mỗi dòng giữ mã băm dòng trước (`prev_hash`) và mã băm của chính nó; `GET /api/nhat-ky/kiem-tra` đi lại cả chuỗi.
- Ghi nhật ký trong cùng giao dịch với thao tác nghiệp vụ (`AuditService.record(input, tx)`).
- Lưu ý vận hành: tài khoản cơ sở dữ liệu mà ứng dụng dùng không nên là chủ bảng (để không tắt được trigger). Việc tách tài khoản này làm khi dựng máy chủ thật.

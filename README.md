# Vạn Thuận ERP

Phần mềm quản trị vận hành của Công ty TNHH Vạn Thuận Global: giao dịch và đối tác, lô hàng, chứng từ, phí và kế toán.

Thiết kế nghiệp vụ và kỹ thuật nằm trong các tài liệu thiết kế giai đoạn 1 của dự án. Mã nguồn chỉ được gộp vào nhánh `main` sau khi Ban Giám đốc duyệt.

## Cấu trúc

| Thư mục | Nội dung |
|---|---|
| `apps/api` | Máy chủ nghiệp vụ (NestJS, TypeScript), cơ sở dữ liệu PostgreSQL 16 qua Drizzle ORM |
| `apps/api/drizzle` | Các tệp thay đổi cấu trúc cơ sở dữ liệu (SQL), chạy lần lượt |
| `apps/web` | Giao diện web (Next.js), dùng được trên máy tính và điện thoại |
| `docs` | Ghi chú kỹ thuật cho kỹ sư |

## Chạy trên máy lập trình

Cần Node.js 22, pnpm 10 và PostgreSQL 16 (hoặc Docker).

```bash
pnpm install
docker compose up -d                       # hoặc tự chạy PostgreSQL
cp apps/api/.env.example apps/api/.env     # rồi điền APP_KEY: openssl rand -base64 32
set -a; . apps/api/.env; set +a
pnpm --filter @vanthuan/api db:migrate     # dựng bảng dữ liệu
pnpm --filter @vanthuan/api tao-quan-tri quantri@congty.vn "Tên quản trị"   # in mật khẩu tạm một lần
pnpm dev:api                               # máy chủ ở cổng 4000
pnpm dev:web                               # giao diện ở http://localhost:3000
```

Đăng nhập lần đầu: mật khẩu tạm → cài xác thực 2 lớp bằng ứng dụng trên điện thoại → đặt mật khẩu mới.

## Kiểm thử

```bash
createdb vanthuan_test                     # một lần
pnpm --filter @vanthuan/api test           # xoá sạch và dựng lại vanthuan_test mỗi lần chạy
```

Đặt `TEST_DATABASE_URL` nếu cơ sở dữ liệu kiểm thử ở chỗ khác. GitHub Actions chạy kiểm thử cho mọi yêu cầu gộp mã.

Xem thêm: [docs/phan-nen.md](docs/phan-nen.md).

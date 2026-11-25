-- Nhật ký thao tác chỉ được ghi thêm: chặn mọi lệnh sửa, xoá, xoá sạch ngay trong cơ sở dữ liệu,
-- kể cả khi ai đó truy cập thẳng vào cơ sở dữ liệu mà không qua phần mềm.
CREATE OR REPLACE FUNCTION audit_log_chi_ghi_them() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'Nhật ký thao tác chỉ được ghi thêm, không được sửa hoặc xoá'
    USING ERRCODE = 'insufficient_privilege';
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER audit_log_khong_sua_xoa
  BEFORE UPDATE OR DELETE ON "audit_log"
  FOR EACH ROW EXECUTE FUNCTION audit_log_chi_ghi_them();
--> statement-breakpoint
CREATE TRIGGER audit_log_khong_xoa_sach
  BEFORE TRUNCATE ON "audit_log"
  FOR EACH STATEMENT EXECUTE FUNCTION audit_log_chi_ghi_them();

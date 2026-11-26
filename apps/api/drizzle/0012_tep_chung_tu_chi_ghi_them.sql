-- Tệp chứng từ chỉ được ghi thêm: nộp lại tạo phiên bản mới, không sửa hay xoá bản cũ.
-- Riêng cột kết quả quét virus được cập nhật một lần (chua_quet → sach/nhiem).
CREATE OR REPLACE FUNCTION tep_chung_tu_chi_ghi_them() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.scan_status = 'chua_quet'
     AND (to_jsonb(NEW) - 'scan_status') = (to_jsonb(OLD) - 'scan_status') THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'Tệp chứng từ chỉ được ghi thêm, không được sửa hoặc xoá'
    USING ERRCODE = 'insufficient_privilege';
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER document_files_khong_sua_xoa BEFORE UPDATE OR DELETE ON "document_files"
  FOR EACH ROW EXECUTE FUNCTION tep_chung_tu_chi_ghi_them();
--> statement-breakpoint
CREATE TRIGGER document_files_khong_xoa_sach BEFORE TRUNCATE ON "document_files"
  FOR EACH STATEMENT EXECUTE FUNCTION tep_chung_tu_chi_ghi_them();

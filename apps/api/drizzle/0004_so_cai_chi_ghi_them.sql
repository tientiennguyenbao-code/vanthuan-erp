-- Sổ cái hợp đồng và các đợt neo chỉ được ghi thêm: chặn sửa, xoá, xoá sạch ngay trong cơ sở dữ liệu.
-- Dùng lại hàm chặn đã tạo cho nhật ký thao tác, với lời báo riêng.
CREATE OR REPLACE FUNCTION so_cai_chi_ghi_them() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'Sổ cái hợp đồng chỉ được ghi thêm, không được sửa hoặc xoá'
    USING ERRCODE = 'insufficient_privilege';
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER contract_ledger_khong_sua_xoa BEFORE UPDATE OR DELETE ON "contract_ledger"
  FOR EACH ROW EXECUTE FUNCTION so_cai_chi_ghi_them();
--> statement-breakpoint
CREATE TRIGGER contract_ledger_khong_xoa_sach BEFORE TRUNCATE ON "contract_ledger"
  FOR EACH STATEMENT EXECUTE FUNCTION so_cai_chi_ghi_them();
--> statement-breakpoint
CREATE TRIGGER anchor_batches_khong_sua_xoa BEFORE UPDATE OR DELETE ON "anchor_batches"
  FOR EACH ROW EXECUTE FUNCTION so_cai_chi_ghi_them();
--> statement-breakpoint
CREATE TRIGGER anchor_batches_khong_xoa_sach BEFORE TRUNCATE ON "anchor_batches"
  FOR EACH STATEMENT EXECUTE FUNCTION so_cai_chi_ghi_them();
--> statement-breakpoint
-- Phiên bản hợp đồng: không xoá; đã trình ký thì không đổi nội dung; đã ký thì không đổi gì nữa.
CREATE OR REPLACE FUNCTION phien_ban_hop_dong_khoa() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Không được xoá phiên bản hợp đồng' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF OLD.signed_at IS NOT NULL THEN
    RAISE EXCEPTION 'Phiên bản hợp đồng đã ký không được sửa' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF OLD.submitted_at IS NOT NULL AND (NEW.content_hash IS DISTINCT FROM OLD.content_hash OR NEW.content_enc IS DISTINCT FROM OLD.content_enc) THEN
    RAISE EXCEPTION 'Phiên bản hợp đồng đã trình ký không được sửa nội dung' USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER contract_versions_khoa BEFORE UPDATE OR DELETE ON "contract_versions"
  FOR EACH ROW EXECUTE FUNCTION phien_ban_hop_dong_khoa();
--> statement-breakpoint
CREATE TRIGGER contract_versions_khong_xoa_sach BEFORE TRUNCATE ON "contract_versions"
  FOR EACH STATEMENT EXECUTE FUNCTION so_cai_chi_ghi_them();

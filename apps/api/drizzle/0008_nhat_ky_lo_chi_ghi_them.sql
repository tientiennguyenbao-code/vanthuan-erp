-- Nhật ký lô và xác nhận đồng ý chia lô chỉ được ghi thêm.
CREATE OR REPLACE FUNCTION nhat_ky_lo_chi_ghi_them() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'Nhật ký lô hàng chỉ được ghi thêm, không được sửa hoặc xoá'
    USING ERRCODE = 'insufficient_privilege';
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER lot_events_khong_sua_xoa BEFORE UPDATE OR DELETE ON "lot_events"
  FOR EACH ROW EXECUTE FUNCTION nhat_ky_lo_chi_ghi_them();
--> statement-breakpoint
CREATE TRIGGER lot_events_khong_xoa_sach BEFORE TRUNCATE ON "lot_events"
  FOR EACH STATEMENT EXECUTE FUNCTION nhat_ky_lo_chi_ghi_them();
--> statement-breakpoint
CREATE TRIGGER split_consents_khong_sua_xoa BEFORE UPDATE OR DELETE ON "split_consents"
  FOR EACH ROW EXECUTE FUNCTION nhat_ky_lo_chi_ghi_them();
--> statement-breakpoint
-- Không phân bổ quá khối lượng còn lại của lô mua (sau hao hụt), kể cả khi hai người thao tác cùng lúc.
CREATE OR REPLACE FUNCTION phan_bo_khong_vuot_lo_mua() RETURNS trigger AS $$
DECLARE
  con_lai numeric;
  da_phan_bo numeric;
BEGIN
  SELECT collected_kg - loss_kg INTO con_lai FROM purchase_lots WHERE id = NEW.purchase_lot_id FOR UPDATE;
  SELECT coalesce(sum(quantity_kg), 0) INTO da_phan_bo FROM lot_allocations
    WHERE purchase_lot_id = NEW.purchase_lot_id AND cancelled_at IS NULL;
  IF da_phan_bo > con_lai THEN
    RAISE EXCEPTION 'Tổng phân bổ vượt khối lượng còn lại của lô mua' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER lot_allocations_khong_vuot AFTER INSERT OR UPDATE ON "lot_allocations"
  DEFERRABLE INITIALLY IMMEDIATE
  FOR EACH ROW EXECUTE FUNCTION phan_bo_khong_vuot_lo_mua();

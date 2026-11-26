CREATE TABLE "complaints" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"export_lot_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"description" text NOT NULL,
	"claimed_amount" numeric(18, 2),
	"currency" text NOT NULL,
	"evidence" text,
	"status" text DEFAULT 'mo' NOT NULL,
	"fault" text,
	"agreed_amount" numeric(18, 2),
	"pass_back_purchase_lot_id" uuid,
	"pass_back_amount" numeric(18, 2),
	"amendment_ref" text,
	"resolution" text,
	"opened_by" uuid NOT NULL,
	"opened_at" timestamp with time zone DEFAULT now() NOT NULL,
	"closed_by" uuid,
	"closed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "financings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"export_lot_id" uuid NOT NULL,
	"bank_partner_id" uuid NOT NULL,
	"borrower_partner_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"amount" numeric(18, 2) NOT NULL,
	"currency" text NOT NULL,
	"fx_per_usd" numeric(18, 4),
	"fee_rate_pct" numeric(6, 3) NOT NULL,
	"status" text DEFAULT 'du_kien' NOT NULL,
	"disbursed_on" text,
	"due_on" text NOT NULL,
	"repaid_on" text,
	"collateral" text,
	"note" text,
	"cancel_reason" text,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lot_payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"export_lot_id" uuid NOT NULL,
	"purchase_lot_id" uuid,
	"financing_id" uuid,
	"direction" text NOT NULL,
	"kind" text NOT NULL,
	"category" text,
	"partner_id" uuid,
	"milestone" text NOT NULL,
	"due_date" text,
	"planned_amount" numeric(18, 2) NOT NULL,
	"currency" text NOT NULL,
	"status" text DEFAULT 'du_kien' NOT NULL,
	"paid_amount" numeric(18, 2),
	"paid_on" text,
	"fx_per_usd" numeric(18, 4),
	"reference" text,
	"note" text,
	"overpay_approved_by" uuid,
	"overpay_approved_at" timestamp with time zone,
	"overpay_reason" text,
	"recorded_by" uuid,
	"recorded_at" timestamp with time zone,
	"cancel_reason" text,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "settlements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"export_lot_id" uuid NOT NULL,
	"status" text NOT NULL,
	"data" jsonb NOT NULL,
	"content_hash" text NOT NULL,
	"margin_usd" numeric(18, 2) NOT NULL,
	"margin_pct" numeric(8, 3),
	"estimate_margin_pct" numeric(8, 3),
	"estimate_source" text,
	"needs_director" boolean NOT NULL,
	"director_reason" text,
	"note" text,
	"prepared_by" uuid NOT NULL,
	"prepared_at" timestamp with time zone DEFAULT now() NOT NULL,
	"chief_accountant_by" uuid,
	"chief_accountant_at" timestamp with time zone,
	"director_by" uuid,
	"director_at" timestamp with time zone,
	"returned_by" uuid,
	"returned_at" timestamp with time zone,
	"return_reason" text
);
--> statement-breakpoint
ALTER TABLE "complaints" ADD CONSTRAINT "complaints_export_lot_id_export_lots_id_fk" FOREIGN KEY ("export_lot_id") REFERENCES "public"."export_lots"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "complaints" ADD CONSTRAINT "complaints_pass_back_purchase_lot_id_purchase_lots_id_fk" FOREIGN KEY ("pass_back_purchase_lot_id") REFERENCES "public"."purchase_lots"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "complaints" ADD CONSTRAINT "complaints_opened_by_users_id_fk" FOREIGN KEY ("opened_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "complaints" ADD CONSTRAINT "complaints_closed_by_users_id_fk" FOREIGN KEY ("closed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "financings" ADD CONSTRAINT "financings_export_lot_id_export_lots_id_fk" FOREIGN KEY ("export_lot_id") REFERENCES "public"."export_lots"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "financings" ADD CONSTRAINT "financings_bank_partner_id_partners_id_fk" FOREIGN KEY ("bank_partner_id") REFERENCES "public"."partners"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "financings" ADD CONSTRAINT "financings_borrower_partner_id_partners_id_fk" FOREIGN KEY ("borrower_partner_id") REFERENCES "public"."partners"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "financings" ADD CONSTRAINT "financings_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lot_payments" ADD CONSTRAINT "lot_payments_export_lot_id_export_lots_id_fk" FOREIGN KEY ("export_lot_id") REFERENCES "public"."export_lots"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lot_payments" ADD CONSTRAINT "lot_payments_purchase_lot_id_purchase_lots_id_fk" FOREIGN KEY ("purchase_lot_id") REFERENCES "public"."purchase_lots"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lot_payments" ADD CONSTRAINT "lot_payments_financing_id_financings_id_fk" FOREIGN KEY ("financing_id") REFERENCES "public"."financings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lot_payments" ADD CONSTRAINT "lot_payments_partner_id_partners_id_fk" FOREIGN KEY ("partner_id") REFERENCES "public"."partners"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lot_payments" ADD CONSTRAINT "lot_payments_overpay_approved_by_users_id_fk" FOREIGN KEY ("overpay_approved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lot_payments" ADD CONSTRAINT "lot_payments_recorded_by_users_id_fk" FOREIGN KEY ("recorded_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lot_payments" ADD CONSTRAINT "lot_payments_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "settlements" ADD CONSTRAINT "settlements_export_lot_id_export_lots_id_fk" FOREIGN KEY ("export_lot_id") REFERENCES "public"."export_lots"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "settlements" ADD CONSTRAINT "settlements_prepared_by_users_id_fk" FOREIGN KEY ("prepared_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "settlements" ADD CONSTRAINT "settlements_chief_accountant_by_users_id_fk" FOREIGN KEY ("chief_accountant_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "settlements" ADD CONSTRAINT "settlements_director_by_users_id_fk" FOREIGN KEY ("director_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "settlements" ADD CONSTRAINT "settlements_returned_by_users_id_fk" FOREIGN KEY ("returned_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "complaints_code_uq" ON "complaints" USING btree ("code");--> statement-breakpoint
CREATE INDEX "complaints_lot_idx" ON "complaints" USING btree ("export_lot_id");--> statement-breakpoint
CREATE INDEX "financings_lot_idx" ON "financings" USING btree ("export_lot_id");--> statement-breakpoint
CREATE INDEX "lot_payments_lot_idx" ON "lot_payments" USING btree ("export_lot_id");--> statement-breakpoint
CREATE INDEX "lot_payments_partner_idx" ON "lot_payments" USING btree ("partner_id");--> statement-breakpoint
CREATE INDEX "settlements_lot_idx" ON "settlements" USING btree ("export_lot_id");--> statement-breakpoint
CREATE UNIQUE INDEX "settlements_active_uq" ON "settlements" USING btree ("export_lot_id") WHERE "settlements"."status" <> 'tra_lai';--> statement-breakpoint
-- Quyết toán đã duyệt không sửa, không xoá được; bản chưa duyệt cũng không xoá được (bị trả lại thì giữ để tra cứu).
CREATE OR REPLACE FUNCTION settlements_khoa() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' OR TG_OP = 'TRUNCATE' THEN
    RAISE EXCEPTION 'Quyết toán không được xoá';
  END IF;
  IF OLD.status = 'da_duyet' OR OLD.status = 'tra_lai' THEN
    RAISE EXCEPTION 'Quyết toán đã duyệt hoặc đã trả lại thì không sửa được';
  END IF;
  IF NEW.data IS DISTINCT FROM OLD.data OR NEW.content_hash IS DISTINCT FROM OLD.content_hash OR NEW.margin_usd IS DISTINCT FROM OLD.margin_usd THEN
    RAISE EXCEPTION 'Nội dung quyết toán đã chốt, không sửa được';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER settlements_khoa BEFORE UPDATE OR DELETE ON settlements FOR EACH ROW EXECUTE FUNCTION settlements_khoa();
--> statement-breakpoint
CREATE TRIGGER settlements_khong_xoa_sach BEFORE TRUNCATE ON settlements EXECUTE FUNCTION settlements_khoa();

CREATE TABLE "eudr_packages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"export_lot_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"content" jsonb NOT NULL,
	"content_hash" text NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "plot_forest_checks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"plot_id" uuid NOT NULL,
	"method" text NOT NULL,
	"result" text NOT NULL,
	"evidence" text NOT NULL,
	"geometry_hash" text NOT NULL,
	"checked_by" uuid NOT NULL,
	"checked_at" timestamp with time zone DEFAULT now() NOT NULL,
	"status" text DEFAULT 'cho_duyet' NOT NULL,
	"reviewed_by" uuid,
	"reviewed_at" timestamp with time zone,
	"review_note" text
);
--> statement-breakpoint
ALTER TABLE "plots" ADD COLUMN "forest_status" text DEFAULT 'chua_kiem' NOT NULL;--> statement-breakpoint
ALTER TABLE "eudr_packages" ADD CONSTRAINT "eudr_packages_export_lot_id_export_lots_id_fk" FOREIGN KEY ("export_lot_id") REFERENCES "public"."export_lots"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eudr_packages" ADD CONSTRAINT "eudr_packages_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plot_forest_checks" ADD CONSTRAINT "plot_forest_checks_plot_id_plots_id_fk" FOREIGN KEY ("plot_id") REFERENCES "public"."plots"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plot_forest_checks" ADD CONSTRAINT "plot_forest_checks_checked_by_users_id_fk" FOREIGN KEY ("checked_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plot_forest_checks" ADD CONSTRAINT "plot_forest_checks_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "eudr_packages_lot_version_uq" ON "eudr_packages" USING btree ("export_lot_id","version");--> statement-breakpoint
CREATE INDEX "plot_forest_checks_plot_idx" ON "plot_forest_checks" USING btree ("plot_id");--> statement-breakpoint
CREATE INDEX "plot_forest_checks_status_idx" ON "plot_forest_checks" USING btree ("status");--> statement-breakpoint
-- Gói EUDR đã chốt chỉ được ghi thêm (mã băm đã lên sổ cái).
CREATE TRIGGER eudr_packages_khong_sua_xoa BEFORE UPDATE OR DELETE ON "eudr_packages"
  FOR EACH ROW EXECUTE FUNCTION nhat_ky_lo_chi_ghi_them();

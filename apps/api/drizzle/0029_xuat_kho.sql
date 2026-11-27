CREATE TABLE "goods_issue_lines" (
	"issue_id" uuid NOT NULL,
	"stock_lot_id" uuid NOT NULL,
	"quantity_kg" numeric(14, 2) NOT NULL,
	CONSTRAINT "goods_issue_lines_issue_id_stock_lot_id_pk" PRIMARY KEY("issue_id","stock_lot_id")
);
--> statement-breakpoint
CREATE TABLE "goods_issues" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"export_lot_id" uuid NOT NULL,
	"facility_id" uuid NOT NULL,
	"issued_on" text NOT NULL,
	"vehicle_no" text,
	"container_no" text,
	"quantity_kg" numeric(14, 2) NOT NULL,
	"note" text,
	"voided_at" timestamp with time zone,
	"voided_by" uuid,
	"void_reason" text,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "lot_allocations" ADD COLUMN "goods_issue_id" uuid;--> statement-breakpoint
ALTER TABLE "goods_issue_lines" ADD CONSTRAINT "goods_issue_lines_issue_id_goods_issues_id_fk" FOREIGN KEY ("issue_id") REFERENCES "public"."goods_issues"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goods_issue_lines" ADD CONSTRAINT "goods_issue_lines_stock_lot_id_stock_lots_id_fk" FOREIGN KEY ("stock_lot_id") REFERENCES "public"."stock_lots"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goods_issues" ADD CONSTRAINT "goods_issues_export_lot_id_export_lots_id_fk" FOREIGN KEY ("export_lot_id") REFERENCES "public"."export_lots"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goods_issues" ADD CONSTRAINT "goods_issues_facility_id_facilities_id_fk" FOREIGN KEY ("facility_id") REFERENCES "public"."facilities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goods_issues" ADD CONSTRAINT "goods_issues_voided_by_users_id_fk" FOREIGN KEY ("voided_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goods_issues" ADD CONSTRAINT "goods_issues_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "goods_issue_lines_lot_idx" ON "goods_issue_lines" USING btree ("stock_lot_id");--> statement-breakpoint
CREATE UNIQUE INDEX "goods_issues_code_uq" ON "goods_issues" USING btree ("code");--> statement-breakpoint
CREATE INDEX "goods_issues_export_idx" ON "goods_issues" USING btree ("export_lot_id");--> statement-breakpoint
CREATE INDEX "goods_issues_facility_idx" ON "goods_issues" USING btree ("facility_id");--> statement-breakpoint
ALTER TABLE "lot_allocations" ADD CONSTRAINT "lot_allocations_goods_issue_id_goods_issues_id_fk" FOREIGN KEY ("goods_issue_id") REFERENCES "public"."goods_issues"("id") ON DELETE no action ON UPDATE no action;
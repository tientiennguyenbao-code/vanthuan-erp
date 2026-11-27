CREATE TABLE "facility_keepers" (
	"facility_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"assigned_by" uuid NOT NULL,
	"assigned_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "facility_keepers_facility_id_user_id_pk" PRIMARY KEY("facility_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "facility_zones" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"facility_id" uuid NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"kind" text NOT NULL,
	"capacity_kg" numeric(14, 2),
	"active" boolean DEFAULT true NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "goods_receipts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"purchase_lot_id" uuid NOT NULL,
	"facility_id" uuid NOT NULL,
	"zone_id" uuid NOT NULL,
	"stock_lot_id" uuid NOT NULL,
	"received_on" text NOT NULL,
	"vehicle_no" text,
	"weigh_ticket_no" text,
	"quantity_kg" numeric(14, 2) NOT NULL,
	"bags" integer,
	"moisture_pct" numeric(5, 2),
	"note" text,
	"voided_at" timestamp with time zone,
	"voided_by" uuid,
	"void_reason" text,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stock_lot_origins" (
	"stock_lot_id" uuid NOT NULL,
	"purchase_lot_id" uuid NOT NULL,
	"share" numeric(12, 9) NOT NULL,
	CONSTRAINT "stock_lot_origins_stock_lot_id_purchase_lot_id_pk" PRIMARY KEY("stock_lot_id","purchase_lot_id")
);
--> statement-breakpoint
CREATE TABLE "stock_lots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"facility_id" uuid NOT NULL,
	"zone_id" uuid NOT NULL,
	"commodity_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"grade" text,
	"deal_type" text NOT NULL,
	"eudr_class" text,
	"initial_kg" numeric(14, 2) NOT NULL,
	"remaining_kg" numeric(14, 2) NOT NULL,
	"bags" integer,
	"source" text NOT NULL,
	"parent_id" uuid,
	"received_on" text NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "stock_lots_con_lai_ck" CHECK ("stock_lots"."remaining_kg" >= 0 and "stock_lots"."remaining_kg" <= "stock_lots"."initial_kg")
);
--> statement-breakpoint
CREATE TABLE "stock_moves" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"stock_lot_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"quantity_kg" numeric(14, 2) NOT NULL,
	"from_zone_id" uuid,
	"to_zone_id" uuid,
	"ref_id" uuid,
	"note" text,
	"actor_user_id" uuid NOT NULL
);
--> statement-breakpoint
ALTER TABLE "facility_keepers" ADD CONSTRAINT "facility_keepers_facility_id_facilities_id_fk" FOREIGN KEY ("facility_id") REFERENCES "public"."facilities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "facility_keepers" ADD CONSTRAINT "facility_keepers_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "facility_keepers" ADD CONSTRAINT "facility_keepers_assigned_by_users_id_fk" FOREIGN KEY ("assigned_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "facility_zones" ADD CONSTRAINT "facility_zones_facility_id_facilities_id_fk" FOREIGN KEY ("facility_id") REFERENCES "public"."facilities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "facility_zones" ADD CONSTRAINT "facility_zones_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goods_receipts" ADD CONSTRAINT "goods_receipts_purchase_lot_id_purchase_lots_id_fk" FOREIGN KEY ("purchase_lot_id") REFERENCES "public"."purchase_lots"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goods_receipts" ADD CONSTRAINT "goods_receipts_facility_id_facilities_id_fk" FOREIGN KEY ("facility_id") REFERENCES "public"."facilities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goods_receipts" ADD CONSTRAINT "goods_receipts_zone_id_facility_zones_id_fk" FOREIGN KEY ("zone_id") REFERENCES "public"."facility_zones"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goods_receipts" ADD CONSTRAINT "goods_receipts_stock_lot_id_stock_lots_id_fk" FOREIGN KEY ("stock_lot_id") REFERENCES "public"."stock_lots"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goods_receipts" ADD CONSTRAINT "goods_receipts_voided_by_users_id_fk" FOREIGN KEY ("voided_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goods_receipts" ADD CONSTRAINT "goods_receipts_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_lot_origins" ADD CONSTRAINT "stock_lot_origins_stock_lot_id_stock_lots_id_fk" FOREIGN KEY ("stock_lot_id") REFERENCES "public"."stock_lots"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_lot_origins" ADD CONSTRAINT "stock_lot_origins_purchase_lot_id_purchase_lots_id_fk" FOREIGN KEY ("purchase_lot_id") REFERENCES "public"."purchase_lots"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_lots" ADD CONSTRAINT "stock_lots_facility_id_facilities_id_fk" FOREIGN KEY ("facility_id") REFERENCES "public"."facilities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_lots" ADD CONSTRAINT "stock_lots_zone_id_facility_zones_id_fk" FOREIGN KEY ("zone_id") REFERENCES "public"."facility_zones"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_lots" ADD CONSTRAINT "stock_lots_commodity_id_commodities_id_fk" FOREIGN KEY ("commodity_id") REFERENCES "public"."commodities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_lots" ADD CONSTRAINT "stock_lots_parent_id_stock_lots_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."stock_lots"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_lots" ADD CONSTRAINT "stock_lots_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_moves" ADD CONSTRAINT "stock_moves_stock_lot_id_stock_lots_id_fk" FOREIGN KEY ("stock_lot_id") REFERENCES "public"."stock_lots"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_moves" ADD CONSTRAINT "stock_moves_from_zone_id_facility_zones_id_fk" FOREIGN KEY ("from_zone_id") REFERENCES "public"."facility_zones"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_moves" ADD CONSTRAINT "stock_moves_to_zone_id_facility_zones_id_fk" FOREIGN KEY ("to_zone_id") REFERENCES "public"."facility_zones"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_moves" ADD CONSTRAINT "stock_moves_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "facility_zones_code_uq" ON "facility_zones" USING btree ("facility_id","code");--> statement-breakpoint
CREATE UNIQUE INDEX "goods_receipts_code_uq" ON "goods_receipts" USING btree ("code");--> statement-breakpoint
CREATE INDEX "goods_receipts_lot_idx" ON "goods_receipts" USING btree ("purchase_lot_id");--> statement-breakpoint
CREATE INDEX "goods_receipts_facility_idx" ON "goods_receipts" USING btree ("facility_id");--> statement-breakpoint
CREATE INDEX "stock_lot_origins_purchase_idx" ON "stock_lot_origins" USING btree ("purchase_lot_id");--> statement-breakpoint
CREATE UNIQUE INDEX "stock_lots_code_uq" ON "stock_lots" USING btree ("code");--> statement-breakpoint
CREATE INDEX "stock_lots_facility_idx" ON "stock_lots" USING btree ("facility_id","zone_id");--> statement-breakpoint
CREATE INDEX "stock_moves_lot_idx" ON "stock_moves" USING btree ("stock_lot_id");--> statement-breakpoint
-- Sổ kho chỉ được ghi thêm (dùng lại hàm của nhật ký lô).
CREATE TRIGGER stock_moves_khong_sua_xoa BEFORE UPDATE OR DELETE ON "stock_moves"
  FOR EACH ROW EXECUTE FUNCTION nhat_ky_lo_chi_ghi_them();
--> statement-breakpoint
CREATE TRIGGER stock_moves_khong_xoa_sach BEFORE TRUNCATE ON "stock_moves"
  FOR EACH STATEMENT EXECUTE FUNCTION nhat_ky_lo_chi_ghi_them();

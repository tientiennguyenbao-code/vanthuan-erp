CREATE TABLE "processing_inputs" (
	"order_id" uuid NOT NULL,
	"stock_lot_id" uuid NOT NULL,
	"quantity_kg" numeric(14, 2) NOT NULL,
	CONSTRAINT "processing_inputs_order_id_stock_lot_id_pk" PRIMARY KEY("order_id","stock_lot_id")
);
--> statement-breakpoint
CREATE TABLE "processing_norms" (
	"sector" text NOT NULL,
	"step" text NOT NULL,
	"max_loss_pct" numeric(6, 2) NOT NULL,
	"set_by" uuid NOT NULL,
	"set_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "processing_norms_sector_step_pk" PRIMARY KEY("sector","step")
);
--> statement-breakpoint
CREATE TABLE "processing_orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"facility_id" uuid NOT NULL,
	"commodity_id" uuid NOT NULL,
	"step" text NOT NULL,
	"processed_on" text NOT NULL,
	"input_kg" numeric(14, 2) NOT NULL,
	"output_kg" numeric(14, 2) NOT NULL,
	"byproduct_kg" numeric(14, 2) NOT NULL,
	"loss_kg" numeric(14, 2) NOT NULL,
	"loss_pct" numeric(7, 2) NOT NULL,
	"norm_pct" numeric(6, 2),
	"status" text NOT NULL,
	"over_reason" text,
	"note" text,
	"decided_by" uuid,
	"decided_at" timestamp with time zone,
	"decision_note" text,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "stock_lots" ADD COLUMN "processing_order_id" uuid;--> statement-breakpoint
ALTER TABLE "stock_lots" ADD COLUMN "status" text DEFAULT 'san_sang' NOT NULL;--> statement-breakpoint
ALTER TABLE "processing_inputs" ADD CONSTRAINT "processing_inputs_order_id_processing_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."processing_orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "processing_inputs" ADD CONSTRAINT "processing_inputs_stock_lot_id_stock_lots_id_fk" FOREIGN KEY ("stock_lot_id") REFERENCES "public"."stock_lots"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "processing_norms" ADD CONSTRAINT "processing_norms_set_by_users_id_fk" FOREIGN KEY ("set_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "processing_orders" ADD CONSTRAINT "processing_orders_facility_id_facilities_id_fk" FOREIGN KEY ("facility_id") REFERENCES "public"."facilities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "processing_orders" ADD CONSTRAINT "processing_orders_commodity_id_commodities_id_fk" FOREIGN KEY ("commodity_id") REFERENCES "public"."commodities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "processing_orders" ADD CONSTRAINT "processing_orders_decided_by_users_id_fk" FOREIGN KEY ("decided_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "processing_orders" ADD CONSTRAINT "processing_orders_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "processing_inputs_lot_idx" ON "processing_inputs" USING btree ("stock_lot_id");--> statement-breakpoint
CREATE UNIQUE INDEX "processing_orders_code_uq" ON "processing_orders" USING btree ("code");--> statement-breakpoint
CREATE INDEX "processing_orders_facility_idx" ON "processing_orders" USING btree ("facility_id","status");--> statement-breakpoint
ALTER TABLE "stock_lots" ADD CONSTRAINT "stock_lots_processing_order_id_processing_orders_id_fk" FOREIGN KEY ("processing_order_id") REFERENCES "public"."processing_orders"("id") ON DELETE no action ON UPDATE no action;
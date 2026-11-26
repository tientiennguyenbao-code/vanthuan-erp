CREATE TABLE "collection_slips" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"purchase_lot_id" uuid NOT NULL,
	"supplier_partner_id" uuid NOT NULL,
	"farmer_id" uuid NOT NULL,
	"plot_id" uuid NOT NULL,
	"harvest_date" text NOT NULL,
	"quantity_kg" numeric(14, 2) NOT NULL,
	"moisture_pct" numeric(5, 2),
	"weigh_ticket_no" text,
	"eudr_ok" boolean,
	"eudr_reasons" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"cap_kg" numeric(14, 2),
	"source" text NOT NULL,
	"note" text,
	"voided_at" timestamp with time zone,
	"voided_by" uuid,
	"void_reason" text,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "growing_areas" ADD COLUMN "max_yield_kg_per_ha" numeric(10, 2);--> statement-breakpoint
ALTER TABLE "purchase_lots" ADD COLUMN "eudr_class" text;--> statement-breakpoint
ALTER TABLE "collection_slips" ADD CONSTRAINT "collection_slips_purchase_lot_id_purchase_lots_id_fk" FOREIGN KEY ("purchase_lot_id") REFERENCES "public"."purchase_lots"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collection_slips" ADD CONSTRAINT "collection_slips_supplier_partner_id_partners_id_fk" FOREIGN KEY ("supplier_partner_id") REFERENCES "public"."partners"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collection_slips" ADD CONSTRAINT "collection_slips_farmer_id_farmers_id_fk" FOREIGN KEY ("farmer_id") REFERENCES "public"."farmers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collection_slips" ADD CONSTRAINT "collection_slips_plot_id_plots_id_fk" FOREIGN KEY ("plot_id") REFERENCES "public"."plots"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collection_slips" ADD CONSTRAINT "collection_slips_voided_by_users_id_fk" FOREIGN KEY ("voided_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collection_slips" ADD CONSTRAINT "collection_slips_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "collection_slips_code_uq" ON "collection_slips" USING btree ("code");--> statement-breakpoint
CREATE INDEX "collection_slips_lot_idx" ON "collection_slips" USING btree ("purchase_lot_id");--> statement-breakpoint
CREATE INDEX "collection_slips_plot_idx" ON "collection_slips" USING btree ("plot_id","harvest_date");
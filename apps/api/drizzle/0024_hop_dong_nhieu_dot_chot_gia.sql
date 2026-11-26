CREATE TABLE "price_fixations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"export_lot_id" uuid NOT NULL,
	"contract_id" uuid NOT NULL,
	"fixed_on" text NOT NULL,
	"quantity_kg" numeric(14, 3) NOT NULL,
	"futures_price" numeric(12, 2) NOT NULL,
	"differential" numeric(12, 2) NOT NULL,
	"final_price" numeric(12, 2) NOT NULL,
	"requested_by" text NOT NULL,
	"note" text,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"voided_at" timestamp with time zone,
	"voided_by" uuid,
	"void_reason" text
);
--> statement-breakpoint
DROP INDEX "export_lots_counter_contract_uq";--> statement-breakpoint
ALTER TABLE "export_lots" ADD COLUMN "shipment_no" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "export_lots" ADD COLUMN "planned_kg" numeric(14, 3);--> statement-breakpoint
ALTER TABLE "price_fixations" ADD CONSTRAINT "price_fixations_export_lot_id_export_lots_id_fk" FOREIGN KEY ("export_lot_id") REFERENCES "public"."export_lots"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "price_fixations" ADD CONSTRAINT "price_fixations_contract_id_contracts_id_fk" FOREIGN KEY ("contract_id") REFERENCES "public"."contracts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "price_fixations" ADD CONSTRAINT "price_fixations_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "price_fixations" ADD CONSTRAINT "price_fixations_voided_by_users_id_fk" FOREIGN KEY ("voided_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "price_fixations_lot_idx" ON "price_fixations" USING btree ("export_lot_id");--> statement-breakpoint
CREATE UNIQUE INDEX "export_lots_contract_shipment_uq" ON "export_lots" USING btree ("counter_contract_id","shipment_no") WHERE "export_lots"."status" <> 'da_huy';
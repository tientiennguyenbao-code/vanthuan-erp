CREATE TABLE "bookings" (
	"export_lot_id" uuid PRIMARY KEY NOT NULL,
	"carrier" text NOT NULL,
	"booking_number" text NOT NULL,
	"vessel_voyage" text,
	"cutoff_si" timestamp with time zone,
	"cutoff_vgm" timestamp with time zone,
	"cutoff_cargo" timestamp with time zone,
	"containers" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"updated_by" uuid NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "export_lots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"deal_type" text NOT NULL,
	"counter_contract_id" uuid NOT NULL,
	"buyer_partner_id" uuid NOT NULL,
	"commodity_id" uuid NOT NULL,
	"market" text NOT NULL,
	"status" text DEFAULT 'dong_goi' NOT NULL,
	"etd" text,
	"eta" text,
	"bl_number" text,
	"shipped_on" text,
	"owner_user_id" uuid NOT NULL,
	"cancel_reason" text,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lot_allocations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"purchase_lot_id" uuid NOT NULL,
	"export_lot_id" uuid NOT NULL,
	"quantity_kg" numeric(14, 2) NOT NULL,
	"approved_by" uuid,
	"approved_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"cancel_reason" text,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lot_events" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"purchase_lot_id" uuid,
	"export_lot_id" uuid,
	"kind" text NOT NULL,
	"quantity_kg" numeric(14, 2),
	"facility_id" uuid,
	"result" text,
	"note" text,
	"detail" jsonb,
	"actor_user_id" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "purchase_lots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"deal_type" text NOT NULL,
	"contract_id" uuid NOT NULL,
	"supplier_partner_id" uuid NOT NULL,
	"commodity_id" uuid NOT NULL,
	"status" text DEFAULT 'thu_gom' NOT NULL,
	"collected_kg" numeric(14, 2) DEFAULT 0 NOT NULL,
	"loss_kg" numeric(14, 2) DEFAULT 0 NOT NULL,
	"growing_area_code" text,
	"packing_facility_code" text,
	"harvest_date" text,
	"facility_id" uuid,
	"certifications" text,
	"owner_user_id" uuid NOT NULL,
	"cancel_reason" text,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "split_consents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"purchase_lot_id" uuid NOT NULL,
	"export_lot_ids" jsonb NOT NULL,
	"document_ref" text NOT NULL,
	"content_hash" text NOT NULL,
	"recorded_by" uuid NOT NULL,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_export_lot_id_export_lots_id_fk" FOREIGN KEY ("export_lot_id") REFERENCES "public"."export_lots"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "export_lots" ADD CONSTRAINT "export_lots_counter_contract_id_contracts_id_fk" FOREIGN KEY ("counter_contract_id") REFERENCES "public"."contracts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "export_lots" ADD CONSTRAINT "export_lots_buyer_partner_id_partners_id_fk" FOREIGN KEY ("buyer_partner_id") REFERENCES "public"."partners"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "export_lots" ADD CONSTRAINT "export_lots_commodity_id_commodities_id_fk" FOREIGN KEY ("commodity_id") REFERENCES "public"."commodities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "export_lots" ADD CONSTRAINT "export_lots_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "export_lots" ADD CONSTRAINT "export_lots_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lot_allocations" ADD CONSTRAINT "lot_allocations_purchase_lot_id_purchase_lots_id_fk" FOREIGN KEY ("purchase_lot_id") REFERENCES "public"."purchase_lots"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lot_allocations" ADD CONSTRAINT "lot_allocations_export_lot_id_export_lots_id_fk" FOREIGN KEY ("export_lot_id") REFERENCES "public"."export_lots"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lot_allocations" ADD CONSTRAINT "lot_allocations_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lot_allocations" ADD CONSTRAINT "lot_allocations_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lot_events" ADD CONSTRAINT "lot_events_purchase_lot_id_purchase_lots_id_fk" FOREIGN KEY ("purchase_lot_id") REFERENCES "public"."purchase_lots"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lot_events" ADD CONSTRAINT "lot_events_export_lot_id_export_lots_id_fk" FOREIGN KEY ("export_lot_id") REFERENCES "public"."export_lots"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lot_events" ADD CONSTRAINT "lot_events_facility_id_facilities_id_fk" FOREIGN KEY ("facility_id") REFERENCES "public"."facilities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lot_events" ADD CONSTRAINT "lot_events_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_lots" ADD CONSTRAINT "purchase_lots_contract_id_contracts_id_fk" FOREIGN KEY ("contract_id") REFERENCES "public"."contracts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_lots" ADD CONSTRAINT "purchase_lots_supplier_partner_id_partners_id_fk" FOREIGN KEY ("supplier_partner_id") REFERENCES "public"."partners"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_lots" ADD CONSTRAINT "purchase_lots_commodity_id_commodities_id_fk" FOREIGN KEY ("commodity_id") REFERENCES "public"."commodities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_lots" ADD CONSTRAINT "purchase_lots_facility_id_facilities_id_fk" FOREIGN KEY ("facility_id") REFERENCES "public"."facilities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_lots" ADD CONSTRAINT "purchase_lots_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_lots" ADD CONSTRAINT "purchase_lots_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "split_consents" ADD CONSTRAINT "split_consents_purchase_lot_id_purchase_lots_id_fk" FOREIGN KEY ("purchase_lot_id") REFERENCES "public"."purchase_lots"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "split_consents" ADD CONSTRAINT "split_consents_recorded_by_users_id_fk" FOREIGN KEY ("recorded_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "export_lots_code_uq" ON "export_lots" USING btree ("code");--> statement-breakpoint
CREATE UNIQUE INDEX "export_lots_counter_contract_uq" ON "export_lots" USING btree ("counter_contract_id");--> statement-breakpoint
CREATE INDEX "lot_allocations_purchase_idx" ON "lot_allocations" USING btree ("purchase_lot_id");--> statement-breakpoint
CREATE INDEX "lot_allocations_export_idx" ON "lot_allocations" USING btree ("export_lot_id");--> statement-breakpoint
CREATE INDEX "lot_events_purchase_idx" ON "lot_events" USING btree ("purchase_lot_id");--> statement-breakpoint
CREATE INDEX "lot_events_export_idx" ON "lot_events" USING btree ("export_lot_id");--> statement-breakpoint
CREATE UNIQUE INDEX "purchase_lots_code_uq" ON "purchase_lots" USING btree ("code");--> statement-breakpoint
CREATE INDEX "purchase_lots_contract_idx" ON "purchase_lots" USING btree ("contract_id");--> statement-breakpoint
CREATE INDEX "split_consents_purchase_idx" ON "split_consents" USING btree ("purchase_lot_id");
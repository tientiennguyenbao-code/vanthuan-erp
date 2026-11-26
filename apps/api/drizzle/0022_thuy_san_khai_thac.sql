CREATE TABLE "catch_trips" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"vessel_id" uuid NOT NULL,
	"supplier_partner_id" uuid NOT NULL,
	"departed_on" text NOT NULL,
	"landed_on" text NOT NULL,
	"landing_port" text NOT NULL,
	"fishing_area" text NOT NULL,
	"species" text NOT NULL,
	"catch_kg" numeric(14, 2) NOT NULL,
	"certificate_no" text,
	"certificate_issuer" text,
	"certificate_date" text,
	"note" text,
	"source" text NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"voided_at" timestamp with time zone,
	"voided_by" uuid,
	"void_reason" text
);
--> statement-breakpoint
CREATE TABLE "fishing_vessels" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"supplier_partner_id" uuid NOT NULL,
	"registration_no" text NOT NULL,
	"name" text,
	"owner_name" text NOT NULL,
	"flag" text DEFAULT 'VN' NOT NULL,
	"length_m" numeric(6, 2),
	"gear" text NOT NULL,
	"license_no" text,
	"license_valid_until" text,
	"has_vms" boolean DEFAULT false NOT NULL,
	"note" text,
	"source" text NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"voided_at" timestamp with time zone,
	"voided_by" uuid,
	"void_reason" text
);
--> statement-breakpoint
ALTER TABLE "collection_slips" ALTER COLUMN "farmer_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "collection_slips" ALTER COLUMN "plot_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "collection_slips" ADD COLUMN "catch_trip_id" uuid;--> statement-breakpoint
ALTER TABLE "catch_trips" ADD CONSTRAINT "catch_trips_vessel_id_fishing_vessels_id_fk" FOREIGN KEY ("vessel_id") REFERENCES "public"."fishing_vessels"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catch_trips" ADD CONSTRAINT "catch_trips_supplier_partner_id_partners_id_fk" FOREIGN KEY ("supplier_partner_id") REFERENCES "public"."partners"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catch_trips" ADD CONSTRAINT "catch_trips_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catch_trips" ADD CONSTRAINT "catch_trips_voided_by_users_id_fk" FOREIGN KEY ("voided_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fishing_vessels" ADD CONSTRAINT "fishing_vessels_supplier_partner_id_partners_id_fk" FOREIGN KEY ("supplier_partner_id") REFERENCES "public"."partners"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fishing_vessels" ADD CONSTRAINT "fishing_vessels_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fishing_vessels" ADD CONSTRAINT "fishing_vessels_voided_by_users_id_fk" FOREIGN KEY ("voided_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "catch_trips_code_uq" ON "catch_trips" USING btree ("code");--> statement-breakpoint
CREATE INDEX "catch_trips_vessel_idx" ON "catch_trips" USING btree ("vessel_id");--> statement-breakpoint
CREATE INDEX "fishing_vessels_supplier_idx" ON "fishing_vessels" USING btree ("supplier_partner_id");--> statement-breakpoint
ALTER TABLE "collection_slips" ADD CONSTRAINT "collection_slips_catch_trip_id_catch_trips_id_fk" FOREIGN KEY ("catch_trip_id") REFERENCES "public"."catch_trips"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "collection_slips_trip_idx" ON "collection_slips" USING btree ("catch_trip_id");--> statement-breakpoint
ALTER TABLE "collection_slips" ADD CONSTRAINT "collection_slips_nguon_ck" CHECK (("collection_slips"."plot_id" is not null and "collection_slips"."farmer_id" is not null and "collection_slips"."catch_trip_id" is null) or ("collection_slips"."plot_id" is null and "collection_slips"."farmer_id" is null and "collection_slips"."catch_trip_id" is not null));
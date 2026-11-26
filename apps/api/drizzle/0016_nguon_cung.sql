CREATE TABLE "farmers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"supplier_partner_id" uuid NOT NULL,
	"code" text NOT NULL,
	"full_name" text NOT NULL,
	"id_number_enc" text,
	"id_number_hash" text,
	"id_number_last4" text,
	"phone" text,
	"commune" text,
	"district" text,
	"province" text NOT NULL,
	"joined_on" text,
	"consent_on" text NOT NULL,
	"source" text NOT NULL,
	"voided_at" timestamp with time zone,
	"voided_by" uuid,
	"void_reason" text,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "growing_areas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"supplier_partner_id" uuid NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"kind" text NOT NULL,
	"sector" text NOT NULL,
	"official_code" text,
	"official_code_issuer" text,
	"commune" text,
	"district" text,
	"province" text NOT NULL,
	"note" text,
	"active" boolean DEFAULT true NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "plots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"supplier_partner_id" uuid NOT NULL,
	"farmer_id" uuid NOT NULL,
	"growing_area_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"crop" text,
	"planted_year" integer,
	"geometry" jsonb NOT NULL,
	"geometry_type" text NOT NULL,
	"declared_area_ha" numeric(10, 4),
	"measured_area_ha" numeric(10, 4),
	"area_ha" numeric(10, 4) NOT NULL,
	"gps_accuracy_m" numeric(8, 1),
	"land_doc_type" text,
	"land_doc_number" text,
	"warnings" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"source" text NOT NULL,
	"voided_at" timestamp with time zone,
	"voided_by" uuid,
	"void_reason" text,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "partner_documents" ADD COLUMN "growing_area_id" uuid;--> statement-breakpoint
ALTER TABLE "farmers" ADD CONSTRAINT "farmers_supplier_partner_id_partners_id_fk" FOREIGN KEY ("supplier_partner_id") REFERENCES "public"."partners"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "farmers" ADD CONSTRAINT "farmers_voided_by_users_id_fk" FOREIGN KEY ("voided_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "farmers" ADD CONSTRAINT "farmers_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "growing_areas" ADD CONSTRAINT "growing_areas_supplier_partner_id_partners_id_fk" FOREIGN KEY ("supplier_partner_id") REFERENCES "public"."partners"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "growing_areas" ADD CONSTRAINT "growing_areas_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plots" ADD CONSTRAINT "plots_supplier_partner_id_partners_id_fk" FOREIGN KEY ("supplier_partner_id") REFERENCES "public"."partners"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plots" ADD CONSTRAINT "plots_farmer_id_farmers_id_fk" FOREIGN KEY ("farmer_id") REFERENCES "public"."farmers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plots" ADD CONSTRAINT "plots_growing_area_id_growing_areas_id_fk" FOREIGN KEY ("growing_area_id") REFERENCES "public"."growing_areas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plots" ADD CONSTRAINT "plots_voided_by_users_id_fk" FOREIGN KEY ("voided_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plots" ADD CONSTRAINT "plots_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "farmers_code_uq" ON "farmers" USING btree ("code");--> statement-breakpoint
CREATE INDEX "farmers_supplier_idx" ON "farmers" USING btree ("supplier_partner_id");--> statement-breakpoint
CREATE UNIQUE INDEX "farmers_supplier_id_uq" ON "farmers" USING btree ("supplier_partner_id","id_number_hash") WHERE "farmers"."voided_at" is null and "farmers"."id_number_hash" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "growing_areas_code_uq" ON "growing_areas" USING btree ("code");--> statement-breakpoint
CREATE INDEX "growing_areas_supplier_idx" ON "growing_areas" USING btree ("supplier_partner_id");--> statement-breakpoint
CREATE UNIQUE INDEX "plots_code_uq" ON "plots" USING btree ("code");--> statement-breakpoint
CREATE INDEX "plots_supplier_idx" ON "plots" USING btree ("supplier_partner_id");--> statement-breakpoint
CREATE INDEX "plots_farmer_idx" ON "plots" USING btree ("farmer_id");--> statement-breakpoint
CREATE INDEX "plots_area_idx" ON "plots" USING btree ("growing_area_id");--> statement-breakpoint
ALTER TABLE "partner_documents" ADD CONSTRAINT "partner_documents_growing_area_id_growing_areas_id_fk" FOREIGN KEY ("growing_area_id") REFERENCES "public"."growing_areas"("id") ON DELETE no action ON UPDATE no action;
CREATE TABLE "misa_exports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" text NOT NULL,
	"code" text NOT NULL,
	"row_count" integer NOT NULL,
	"file_sha256" text NOT NULL,
	"storage_key" text NOT NULL,
	"key_enc" text NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "misa_exports_code_unique" UNIQUE("code")
);
--> statement-breakpoint
ALTER TABLE "fee_requests" ADD COLUMN "misa_export_id" uuid;--> statement-breakpoint
ALTER TABLE "misa_exports" ADD CONSTRAINT "misa_exports_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fee_requests" ADD CONSTRAINT "fee_requests_misa_export_id_misa_exports_id_fk" FOREIGN KEY ("misa_export_id") REFERENCES "public"."misa_exports"("id") ON DELETE no action ON UPDATE no action;
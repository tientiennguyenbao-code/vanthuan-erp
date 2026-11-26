CREATE TABLE "area_code_submissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"growing_area_id" uuid NOT NULL,
	"official_code" text NOT NULL,
	"issuer" text,
	"issued_on" text,
	"valid_until" text,
	"scope" text,
	"file_name" text,
	"mime_type" text,
	"size_bytes" integer,
	"sha256" text,
	"storage_key" text,
	"key_enc" text,
	"status" text DEFAULT 'cho_duyet' NOT NULL,
	"source" text NOT NULL,
	"submitted_by" uuid NOT NULL,
	"submitted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"reviewed_by" uuid,
	"reviewed_at" timestamp with time zone,
	"review_note" text
);
--> statement-breakpoint
ALTER TABLE "growing_areas" ADD COLUMN "official_code_valid_until" text;--> statement-breakpoint
ALTER TABLE "growing_areas" ADD COLUMN "official_code_submission_id" uuid;--> statement-breakpoint
ALTER TABLE "area_code_submissions" ADD CONSTRAINT "area_code_submissions_growing_area_id_growing_areas_id_fk" FOREIGN KEY ("growing_area_id") REFERENCES "public"."growing_areas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "area_code_submissions" ADD CONSTRAINT "area_code_submissions_submitted_by_users_id_fk" FOREIGN KEY ("submitted_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "area_code_submissions" ADD CONSTRAINT "area_code_submissions_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "area_code_submissions_area_idx" ON "area_code_submissions" USING btree ("growing_area_id","status");--> statement-breakpoint
-- Mã ghi trước khi có bước đối chiếu chưa ai duyệt: chuyển thành lần gửi chờ duyệt, bỏ khỏi vùng cho đến khi duyệt.
INSERT INTO "area_code_submissions" ("growing_area_id", "official_code", "issuer", "status", "source", "submitted_by", "submitted_at")
SELECT "id", "official_code", "official_code_issuer", 'cho_duyet', 'noi_bo', "created_by", "created_at" FROM "growing_areas" WHERE "official_code" IS NOT NULL;--> statement-breakpoint
UPDATE "growing_areas" SET "official_code" = NULL, "official_code_issuer" = NULL WHERE "official_code" IS NOT NULL;

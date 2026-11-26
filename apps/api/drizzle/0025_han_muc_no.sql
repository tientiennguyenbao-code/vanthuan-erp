CREATE TABLE "credit_limits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"partner_id" uuid NOT NULL,
	"amount_usd" numeric(18, 2) NOT NULL,
	"max_days" integer NOT NULL,
	"status" text DEFAULT 'de_xuat' NOT NULL,
	"reason" text NOT NULL,
	"proposed_by" uuid NOT NULL,
	"proposed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"decided_by" uuid,
	"decided_at" timestamp with time zone,
	"decision_note" text
);
--> statement-breakpoint
ALTER TABLE "credit_limits" ADD CONSTRAINT "credit_limits_partner_id_partners_id_fk" FOREIGN KEY ("partner_id") REFERENCES "public"."partners"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_limits" ADD CONSTRAINT "credit_limits_proposed_by_users_id_fk" FOREIGN KEY ("proposed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_limits" ADD CONSTRAINT "credit_limits_decided_by_users_id_fk" FOREIGN KEY ("decided_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "credit_limits_partner_idx" ON "credit_limits" USING btree ("partner_id");
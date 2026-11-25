CREATE TABLE "quote_cost_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"quote_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"description" text,
	"amount" numeric(18, 2) NOT NULL,
	"currency" text NOT NULL,
	"fx_per_usd" numeric(18, 4)
);
--> statement-breakpoint
CREATE TABLE "quotes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"kind" text NOT NULL,
	"partner_id" uuid NOT NULL,
	"commodity_id" uuid NOT NULL,
	"source_quote_id" uuid,
	"status" text DEFAULT 'nhap' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"quantity" numeric(18, 3) NOT NULL,
	"unit" text NOT NULL,
	"unit_price" numeric(18, 4) NOT NULL,
	"currency" text NOT NULL,
	"fx_per_usd" numeric(18, 4),
	"incoterms" text NOT NULL,
	"port_from" text,
	"port_to" text,
	"valid_until" text NOT NULL,
	"spec" text,
	"certifications" text,
	"delivery_time" text,
	"payment_terms" text,
	"fee_rate_pct" numeric(6, 3),
	"note" text,
	"reject_reason" text,
	"contract_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"owner_user_id" uuid NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "quote_cost_lines" ADD CONSTRAINT "quote_cost_lines_quote_id_quotes_id_fk" FOREIGN KEY ("quote_id") REFERENCES "public"."quotes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_partner_id_partners_id_fk" FOREIGN KEY ("partner_id") REFERENCES "public"."partners"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_commodity_id_commodities_id_fk" FOREIGN KEY ("commodity_id") REFERENCES "public"."commodities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "quote_cost_lines_quote_idx" ON "quote_cost_lines" USING btree ("quote_id");--> statement-breakpoint
CREATE UNIQUE INDEX "quotes_code_uq" ON "quotes" USING btree ("code");--> statement-breakpoint
CREATE INDEX "quotes_commodity_idx" ON "quotes" USING btree ("commodity_id","kind");--> statement-breakpoint
CREATE INDEX "quotes_owner_idx" ON "quotes" USING btree ("owner_user_id");
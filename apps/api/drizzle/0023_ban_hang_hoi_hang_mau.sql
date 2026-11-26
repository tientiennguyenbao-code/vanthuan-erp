CREATE TABLE "inquiries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"partner_id" uuid NOT NULL,
	"commodity_id" uuid NOT NULL,
	"source" text NOT NULL,
	"received_on" text NOT NULL,
	"quantity" numeric(18, 3) NOT NULL,
	"unit" text NOT NULL,
	"spec" text,
	"certifications" text,
	"delivery_month" text,
	"incoterms" text,
	"port_to" text,
	"target_price" numeric(18, 4),
	"currency" text,
	"note" text,
	"status" text DEFAULT 'moi' NOT NULL,
	"lost_reason" text,
	"close_note" text,
	"closed_at" timestamp with time zone,
	"owner_user_id" uuid NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "samples" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"kind" text NOT NULL,
	"partner_id" uuid NOT NULL,
	"commodity_id" uuid NOT NULL,
	"inquiry_id" uuid,
	"quote_id" uuid,
	"export_lot_id" uuid,
	"purchase_lot_id" uuid,
	"weight_g" integer,
	"description" text,
	"status" text NOT NULL,
	"courier" text,
	"tracking_no" text,
	"sent_on" text,
	"retain_until" text,
	"result_on" text,
	"cup_score" numeric(5, 2),
	"result_note" text,
	"result_by" uuid,
	"cancel_reason" text,
	"owner_user_id" uuid NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "quotes" ADD COLUMN "inquiry_id" uuid;--> statement-breakpoint
ALTER TABLE "inquiries" ADD CONSTRAINT "inquiries_partner_id_partners_id_fk" FOREIGN KEY ("partner_id") REFERENCES "public"."partners"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inquiries" ADD CONSTRAINT "inquiries_commodity_id_commodities_id_fk" FOREIGN KEY ("commodity_id") REFERENCES "public"."commodities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inquiries" ADD CONSTRAINT "inquiries_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inquiries" ADD CONSTRAINT "inquiries_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "samples" ADD CONSTRAINT "samples_partner_id_partners_id_fk" FOREIGN KEY ("partner_id") REFERENCES "public"."partners"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "samples" ADD CONSTRAINT "samples_commodity_id_commodities_id_fk" FOREIGN KEY ("commodity_id") REFERENCES "public"."commodities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "samples" ADD CONSTRAINT "samples_inquiry_id_inquiries_id_fk" FOREIGN KEY ("inquiry_id") REFERENCES "public"."inquiries"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "samples" ADD CONSTRAINT "samples_quote_id_quotes_id_fk" FOREIGN KEY ("quote_id") REFERENCES "public"."quotes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "samples" ADD CONSTRAINT "samples_export_lot_id_export_lots_id_fk" FOREIGN KEY ("export_lot_id") REFERENCES "public"."export_lots"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "samples" ADD CONSTRAINT "samples_purchase_lot_id_purchase_lots_id_fk" FOREIGN KEY ("purchase_lot_id") REFERENCES "public"."purchase_lots"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "samples" ADD CONSTRAINT "samples_result_by_users_id_fk" FOREIGN KEY ("result_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "samples" ADD CONSTRAINT "samples_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "samples" ADD CONSTRAINT "samples_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "inquiries_code_uq" ON "inquiries" USING btree ("code");--> statement-breakpoint
CREATE INDEX "inquiries_partner_idx" ON "inquiries" USING btree ("partner_id");--> statement-breakpoint
CREATE INDEX "inquiries_owner_idx" ON "inquiries" USING btree ("owner_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "samples_code_uq" ON "samples" USING btree ("code");--> statement-breakpoint
CREATE INDEX "samples_inquiry_idx" ON "samples" USING btree ("inquiry_id");--> statement-breakpoint
CREATE INDEX "samples_export_lot_idx" ON "samples" USING btree ("export_lot_id");--> statement-breakpoint
CREATE INDEX "samples_partner_idx" ON "samples" USING btree ("partner_id");
CREATE TABLE "doc_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"sector" text,
	"market" text,
	"incoterms" jsonb,
	"deal_type" text,
	"requirement" text NOT NULL,
	"stage" text NOT NULL,
	"scope" text NOT NULL,
	"party" text NOT NULL,
	"issuer" text,
	"legal_basis" text,
	"uncertain" boolean DEFAULT false NOT NULL,
	"note" text,
	"reviewed_at" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"updated_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fee_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"export_lot_id" uuid NOT NULL,
	"purchase_lot_id" uuid NOT NULL,
	"supplier_partner_id" uuid NOT NULL,
	"fee_contract_id" uuid NOT NULL,
	"quantity_kg" numeric(14, 2) NOT NULL,
	"unit_price_per_kg" numeric(18, 6) NOT NULL,
	"currency" text NOT NULL,
	"base_value" numeric(18, 2) NOT NULL,
	"rate_pct" numeric(6, 3),
	"amount" numeric(18, 2),
	"fx_per_usd" numeric(18, 4),
	"bl_number" text NOT NULL,
	"bl_date" text NOT NULL,
	"status" text NOT NULL,
	"approved_by" uuid,
	"approved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "gate_overrides" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"export_lot_id" uuid NOT NULL,
	"reason" text NOT NULL,
	"missing" jsonb NOT NULL,
	"granted_by" uuid NOT NULL,
	"granted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"used_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "lot_documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"export_lot_id" uuid NOT NULL,
	"rule_id" uuid,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"requirement" text NOT NULL,
	"stage" text NOT NULL,
	"party" text NOT NULL,
	"issuer" text,
	"supplier_partner_id" uuid,
	"status" text DEFAULT 'thieu' NOT NULL,
	"number" text,
	"issued_on" text,
	"expires_on" text,
	"note" text,
	"obsolete" boolean DEFAULT false NOT NULL,
	"updated_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"approved_by" uuid,
	"approved_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "doc_rules" ADD CONSTRAINT "doc_rules_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fee_requests" ADD CONSTRAINT "fee_requests_export_lot_id_export_lots_id_fk" FOREIGN KEY ("export_lot_id") REFERENCES "public"."export_lots"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fee_requests" ADD CONSTRAINT "fee_requests_purchase_lot_id_purchase_lots_id_fk" FOREIGN KEY ("purchase_lot_id") REFERENCES "public"."purchase_lots"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fee_requests" ADD CONSTRAINT "fee_requests_supplier_partner_id_partners_id_fk" FOREIGN KEY ("supplier_partner_id") REFERENCES "public"."partners"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fee_requests" ADD CONSTRAINT "fee_requests_fee_contract_id_contracts_id_fk" FOREIGN KEY ("fee_contract_id") REFERENCES "public"."contracts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fee_requests" ADD CONSTRAINT "fee_requests_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gate_overrides" ADD CONSTRAINT "gate_overrides_export_lot_id_export_lots_id_fk" FOREIGN KEY ("export_lot_id") REFERENCES "public"."export_lots"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gate_overrides" ADD CONSTRAINT "gate_overrides_granted_by_users_id_fk" FOREIGN KEY ("granted_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lot_documents" ADD CONSTRAINT "lot_documents_export_lot_id_export_lots_id_fk" FOREIGN KEY ("export_lot_id") REFERENCES "public"."export_lots"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lot_documents" ADD CONSTRAINT "lot_documents_rule_id_doc_rules_id_fk" FOREIGN KEY ("rule_id") REFERENCES "public"."doc_rules"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lot_documents" ADD CONSTRAINT "lot_documents_supplier_partner_id_partners_id_fk" FOREIGN KEY ("supplier_partner_id") REFERENCES "public"."partners"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lot_documents" ADD CONSTRAINT "lot_documents_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lot_documents" ADD CONSTRAINT "lot_documents_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "doc_rules_market_idx" ON "doc_rules" USING btree ("market","sector");--> statement-breakpoint
CREATE INDEX "fee_requests_lot_idx" ON "fee_requests" USING btree ("export_lot_id");--> statement-breakpoint
CREATE UNIQUE INDEX "fee_requests_uq" ON "fee_requests" USING btree ("export_lot_id","purchase_lot_id");--> statement-breakpoint
CREATE INDEX "lot_documents_lot_idx" ON "lot_documents" USING btree ("export_lot_id");--> statement-breakpoint
CREATE UNIQUE INDEX "lot_documents_uq" ON "lot_documents" USING btree ("export_lot_id","code",coalesce("supplier_partner_id", '00000000-0000-0000-0000-000000000000'::uuid));
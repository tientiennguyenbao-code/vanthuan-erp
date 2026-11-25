CREATE TABLE "anchor_batches" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"from_ledger_id" bigint NOT NULL,
	"to_ledger_id" bigint NOT NULL,
	"leaf_count" integer NOT NULL,
	"merkle_root" text NOT NULL,
	"provider" text NOT NULL,
	"tx_ref" text
);
--> statement-breakpoint
CREATE TABLE "contract_ledger" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"at" timestamp with time zone NOT NULL,
	"contract_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"event" text NOT NULL,
	"actor_user_id" uuid NOT NULL,
	"content_hash" text NOT NULL,
	"signature" jsonb,
	"note" text,
	"prev_hash" text NOT NULL,
	"hash" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "contract_versions" (
	"contract_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"content_enc" text NOT NULL,
	"content_hash" text NOT NULL,
	"reason" text,
	"submitted_by" uuid,
	"submitted_at" timestamp with time zone,
	"signed_by" uuid,
	"signed_at" timestamp with time zone,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "contract_versions_contract_id_version_pk" PRIMARY KEY("contract_id","version")
);
--> statement-breakpoint
CREATE TABLE "contracts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"kind" text NOT NULL,
	"deal_type" text NOT NULL,
	"seller_partner_id" uuid,
	"buyer_partner_id" uuid,
	"commodity_id" uuid NOT NULL,
	"status" text DEFAULT 'nhap' NOT NULL,
	"current_version" integer DEFAULT 1 NOT NULL,
	"signed_version" integer,
	"owner_user_id" uuid NOT NULL,
	"data_key_enc" text NOT NULL,
	"cancel_reason" text,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sign_authorizations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"grantee_user_id" uuid NOT NULL,
	"granted_by" uuid NOT NULL,
	"document_ref" text NOT NULL,
	"valid_from" timestamp with time zone NOT NULL,
	"valid_to" timestamp with time zone NOT NULL,
	"max_value_usd" numeric(18, 2),
	"revoked_at" timestamp with time zone,
	"revoked_by" uuid,
	"revoke_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "contract_ledger" ADD CONSTRAINT "contract_ledger_contract_id_contracts_id_fk" FOREIGN KEY ("contract_id") REFERENCES "public"."contracts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contract_ledger" ADD CONSTRAINT "contract_ledger_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contract_versions" ADD CONSTRAINT "contract_versions_contract_id_contracts_id_fk" FOREIGN KEY ("contract_id") REFERENCES "public"."contracts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contract_versions" ADD CONSTRAINT "contract_versions_submitted_by_users_id_fk" FOREIGN KEY ("submitted_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contract_versions" ADD CONSTRAINT "contract_versions_signed_by_users_id_fk" FOREIGN KEY ("signed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contract_versions" ADD CONSTRAINT "contract_versions_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_seller_partner_id_partners_id_fk" FOREIGN KEY ("seller_partner_id") REFERENCES "public"."partners"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_buyer_partner_id_partners_id_fk" FOREIGN KEY ("buyer_partner_id") REFERENCES "public"."partners"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_commodity_id_commodities_id_fk" FOREIGN KEY ("commodity_id") REFERENCES "public"."commodities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sign_authorizations" ADD CONSTRAINT "sign_authorizations_grantee_user_id_users_id_fk" FOREIGN KEY ("grantee_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sign_authorizations" ADD CONSTRAINT "sign_authorizations_granted_by_users_id_fk" FOREIGN KEY ("granted_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sign_authorizations" ADD CONSTRAINT "sign_authorizations_revoked_by_users_id_fk" FOREIGN KEY ("revoked_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "contract_ledger_contract_idx" ON "contract_ledger" USING btree ("contract_id");--> statement-breakpoint
CREATE INDEX "contract_ledger_content_idx" ON "contract_ledger" USING btree ("content_hash");--> statement-breakpoint
CREATE INDEX "contract_versions_hash_idx" ON "contract_versions" USING btree ("content_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "contracts_code_uq" ON "contracts" USING btree ("code");--> statement-breakpoint
CREATE INDEX "contracts_owner_idx" ON "contracts" USING btree ("owner_user_id");--> statement-breakpoint
CREATE INDEX "contracts_seller_idx" ON "contracts" USING btree ("seller_partner_id");--> statement-breakpoint
CREATE INDEX "contracts_buyer_idx" ON "contracts" USING btree ("buyer_partner_id");--> statement-breakpoint
CREATE INDEX "sign_authorizations_grantee_idx" ON "sign_authorizations" USING btree ("grantee_user_id");
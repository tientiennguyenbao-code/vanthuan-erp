CREATE TABLE "buyer_doc_reviews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lot_document_id" uuid NOT NULL,
	"decision" text NOT NULL,
	"comment" text,
	"user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "buyer_doc_reviews" ADD CONSTRAINT "buyer_doc_reviews_lot_document_id_lot_documents_id_fk" FOREIGN KEY ("lot_document_id") REFERENCES "public"."lot_documents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "buyer_doc_reviews" ADD CONSTRAINT "buyer_doc_reviews_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "buyer_doc_reviews_doc_idx" ON "buyer_doc_reviews" USING btree ("lot_document_id");
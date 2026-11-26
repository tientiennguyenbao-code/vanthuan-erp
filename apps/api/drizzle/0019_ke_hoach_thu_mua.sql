CREATE TABLE "harvest_estimates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"plot_id" uuid NOT NULL,
	"month" text NOT NULL,
	"estimated_kg" numeric(14, 2) NOT NULL,
	"source" text NOT NULL,
	"note" text,
	"updated_by" uuid NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "quotes" ADD COLUMN "delivery_month" text;--> statement-breakpoint
ALTER TABLE "harvest_estimates" ADD CONSTRAINT "harvest_estimates_plot_id_plots_id_fk" FOREIGN KEY ("plot_id") REFERENCES "public"."plots"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "harvest_estimates" ADD CONSTRAINT "harvest_estimates_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "harvest_estimates_plot_month_uq" ON "harvest_estimates" USING btree ("plot_id","month");--> statement-breakpoint
CREATE INDEX "harvest_estimates_month_idx" ON "harvest_estimates" USING btree ("month");
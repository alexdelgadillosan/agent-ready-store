CREATE TABLE "catalog_publish_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"status" text DEFAULT 'running' NOT NULL,
	"dry_run" integer DEFAULT 1 NOT NULL,
	"product_count" integer DEFAULT 0 NOT NULL,
	"published_count" integer DEFAULT 0 NOT NULL,
	"failed_count" integer DEFAULT 0 NOT NULL,
	"errors" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "catalog_products" ADD COLUMN "shopify_product_id" text;--> statement-breakpoint
ALTER TABLE "catalog_products" ADD COLUMN "publish_status" text DEFAULT 'unpublished' NOT NULL;--> statement-breakpoint
ALTER TABLE "catalog_products" ADD COLUMN "published_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "catalog_variants" ADD COLUMN "shopify_variant_id" text;--> statement-breakpoint
ALTER TABLE "catalog_variants" ADD COLUMN "shopify_inventory_item_id" text;--> statement-breakpoint
ALTER TABLE "catalog_variants" ADD COLUMN "publish_error" text;--> statement-breakpoint
CREATE INDEX "catalog_publish_jobs_created_idx" ON "catalog_publish_jobs" USING btree ("created_at");
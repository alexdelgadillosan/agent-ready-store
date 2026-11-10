CREATE TABLE "agent_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cart_id" uuid,
	"tool_name" text NOT NULL,
	"input" jsonb,
	"output" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "carts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"merchant_id" uuid NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"paypal_order_id" text,
	"approval_url" text,
	"shopify_draft_order_id" text,
	"subtotal_cents" integer DEFAULT 0 NOT NULL,
	"shipping_cents" integer DEFAULT 0 NOT NULL,
	"tax_cents" integer DEFAULT 0 NOT NULL,
	"total_cents" integer DEFAULT 0 NOT NULL,
	"currency" text DEFAULT 'USD' NOT NULL,
	"buyer_email" text,
	"buyer_name" text,
	"items" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "catalog_imports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"format" text NOT NULL,
	"mode" text NOT NULL,
	"fixture" integer DEFAULT 0 NOT NULL,
	"status" text NOT NULL,
	"product_count" integer DEFAULT 0 NOT NULL,
	"variant_count" integer DEFAULT 0 NOT NULL,
	"payload" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "catalog_products" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_id" uuid NOT NULL,
	"external_id" text NOT NULL,
	"title" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"images" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "catalog_provenance" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"import_id" uuid NOT NULL,
	"entity_type" text NOT NULL,
	"entity_key" text NOT NULL,
	"source_url" text NOT NULL,
	"source_record_id" text NOT NULL,
	"license_name" text NOT NULL,
	"license_url" text NOT NULL,
	"attribution" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "catalog_sources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"url" text NOT NULL,
	"record_id" text NOT NULL,
	"license_name" text NOT NULL,
	"license_url" text NOT NULL,
	"license_attribution" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "catalog_variants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" uuid NOT NULL,
	"external_id" text NOT NULL,
	"title" text DEFAULT '' NOT NULL,
	"sku" text NOT NULL,
	"original_price_cents" integer NOT NULL,
	"currency" text NOT NULL,
	"inventory" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "merchants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"shop_domain" text NOT NULL,
	"access_token" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cart_id" uuid NOT NULL,
	"paypal_capture_id" text,
	"shopify_order_id" text,
	"shopify_order_name" text,
	"amount_cents" integer DEFAULT 0 NOT NULL,
	"currency" text DEFAULT 'USD' NOT NULL,
	"status" text DEFAULT 'paid' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "products" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"merchant_id" uuid NOT NULL,
	"shopify_product_id" text NOT NULL,
	"title" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"image_url" text,
	"alt_text" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reservations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"variant_id" uuid NOT NULL,
	"cart_id" uuid NOT NULL,
	"quantity" integer NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "variants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"merchant_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"shopify_variant_id" text NOT NULL,
	"title" text DEFAULT '' NOT NULL,
	"sku" text DEFAULT '' NOT NULL,
	"price_cents" integer DEFAULT 0 NOT NULL,
	"currency" text DEFAULT 'USD' NOT NULL,
	"stock_cached" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "agent_events_created_idx" ON "agent_events" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "carts_status_idx" ON "carts" USING btree ("status");--> statement-breakpoint
CREATE INDEX "catalog_imports_created_idx" ON "catalog_imports" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "catalog_products_source_external_idx" ON "catalog_products" USING btree ("source_id","external_id");--> statement-breakpoint
CREATE INDEX "catalog_provenance_import_idx" ON "catalog_provenance" USING btree ("import_id");--> statement-breakpoint
CREATE UNIQUE INDEX "catalog_sources_identity_idx" ON "catalog_sources" USING btree ("url","record_id");--> statement-breakpoint
CREATE UNIQUE INDEX "catalog_variants_product_external_idx" ON "catalog_variants" USING btree ("product_id","external_id");--> statement-breakpoint
CREATE UNIQUE INDEX "catalog_variants_sku_idx" ON "catalog_variants" USING btree ("sku");--> statement-breakpoint
CREATE UNIQUE INDEX "merchants_shop_domain_idx" ON "merchants" USING btree ("shop_domain");--> statement-breakpoint
CREATE UNIQUE INDEX "orders_cart_idx" ON "orders" USING btree ("cart_id");--> statement-breakpoint
CREATE UNIQUE INDEX "products_merchant_shopify_idx" ON "products" USING btree ("merchant_id","shopify_product_id");--> statement-breakpoint
CREATE INDEX "products_title_idx" ON "products" USING btree ("title");--> statement-breakpoint
CREATE INDEX "reservations_variant_idx" ON "reservations" USING btree ("variant_id");--> statement-breakpoint
CREATE INDEX "reservations_cart_idx" ON "reservations" USING btree ("cart_id");--> statement-breakpoint
CREATE UNIQUE INDEX "variants_merchant_shopify_idx" ON "variants" USING btree ("merchant_id","shopify_variant_id");--> statement-breakpoint
CREATE INDEX "variants_product_idx" ON "variants" USING btree ("product_id");
CREATE TYPE "public"."product_condition" AS ENUM('new', 'refurbished');--> statement-breakpoint
DROP INDEX "products_organization_name_unaccent_idx";--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "brand" text;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "category" text;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "condition" "product_condition" DEFAULT 'new' NOT NULL;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "search" "tsvector" GENERATED ALWAYS AS (to_tsvector('simple', immutable_unaccent(lower("products"."name" || ' ' || coalesce("products"."brand", '') || ' ' || coalesce("products"."category", ''))))) STORED NOT NULL;--> statement-breakpoint
CREATE INDEX "products_search_idx" ON "products" USING gin ("search");
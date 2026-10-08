ALTER TABLE "products" ADD COLUMN "barcode" text;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "weight_kg" numeric(10, 3);--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "length_cm" numeric(8, 1);--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "width_cm" numeric(8, 1);--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "height_cm" numeric(8, 1);--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "location" text;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "shelf" text;--> statement-breakpoint
CREATE UNIQUE INDEX "products_organization_barcode_lower_unique" ON "products" USING btree ("organization_id",lower("barcode")) WHERE "products"."barcode" is not null;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_barcode_format" CHECK ("products"."barcode" ~ '^\S{1,64}$');--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_weight_kg_positive" CHECK ("products"."weight_kg" > 0);--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_length_cm_positive" CHECK ("products"."length_cm" > 0);--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_width_cm_positive" CHECK ("products"."width_cm" > 0);--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_height_cm_positive" CHECK ("products"."height_cm" > 0);--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_dimensions_together" CHECK (("products"."length_cm" is null and "products"."width_cm" is null and "products"."height_cm" is null) or ("products"."length_cm" is not null and "products"."width_cm" is not null and "products"."height_cm" is not null));--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_location_length" CHECK (char_length("products"."location") between 1 and 60);--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_shelf_length" CHECK (char_length("products"."shelf") between 1 and 30);
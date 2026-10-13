ALTER TYPE "public"."inventory_movement_type" ADD VALUE 'sale';--> statement-breakpoint
ALTER TABLE "sales" ALTER COLUMN "order_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "sales" ALTER COLUMN "client_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "sales" ADD CONSTRAINT "sales_order_has_client" CHECK ("sales"."order_id" IS NULL OR "sales"."client_id" IS NOT NULL);
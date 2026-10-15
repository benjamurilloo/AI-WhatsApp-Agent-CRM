ALTER TYPE "public"."receipt_target" ADD VALUE 'account';--> statement-breakpoint
ALTER TABLE "receipts" DROP CONSTRAINT "receipts_target_check";--> statement-breakpoint
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_target_check" CHECK (("receipts"."target"::text = 'sale' AND "receipts"."sale_id" IS NOT NULL AND "receipts"."order_id" IS NULL)
        OR ("receipts"."target"::text = 'order' AND "receipts"."order_id" IS NOT NULL AND "receipts"."sale_id" IS NULL)
        OR ("receipts"."target"::text = 'account' AND "receipts"."client_id" IS NOT NULL AND "receipts"."sale_id" IS NULL AND "receipts"."order_id" IS NULL));
-- La seña: el cobro contra un pedido (brief-21.4, D-1; ADR 0022, puntos 2 y 5). Generada con
-- drizzle-kit y comentada a mano.
--
-- receipts_target_check compara target::text y no el enum: el migrador de Drizzle aplica todas las
-- migraciones pendientes en una sola transacción, y PostgreSQL no deja usar el valor 'order' antes
-- de confirmar la transacción que lo agregó (brief-21.4, H-2). Los triggers de la 0043 (solo
-- inserción, sesión cerrada, efectivo y su sesión) no miran el destino y valen igual para una seña.
-- La columna nueva queda cubierta por el SELECT e INSERT de crm_app sobre la tabla.
ALTER TYPE "public"."receipt_target" ADD VALUE 'order';--> statement-breakpoint
ALTER TABLE "receipts" DROP CONSTRAINT "receipts_target_check";--> statement-breakpoint
ALTER TABLE "receipts" ADD COLUMN "order_id" uuid;--> statement-breakpoint
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_order_fk" FOREIGN KEY ("organization_id","order_id") REFERENCES "public"."orders"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "receipts_order_idx" ON "receipts" USING btree ("organization_id","order_id");--> statement-breakpoint
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_target_check" CHECK (("receipts"."target"::text = 'sale' AND "receipts"."sale_id" IS NOT NULL AND "receipts"."order_id" IS NULL)
        OR ("receipts"."target"::text = 'order' AND "receipts"."order_id" IS NOT NULL AND "receipts"."sale_id" IS NULL));
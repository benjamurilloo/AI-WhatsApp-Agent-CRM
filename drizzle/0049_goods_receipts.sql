ALTER TYPE "public"."audit_entity_type" ADD VALUE 'goods_receipt';--> statement-breakpoint
ALTER TYPE "public"."inventory_movement_type" ADD VALUE 'goods_receipt';--> statement-breakpoint
ALTER TYPE "public"."document_kind" ADD VALUE 'goods_receipt';--> statement-breakpoint
CREATE TABLE "goods_receipt_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"goods_receipt_id" uuid NOT NULL,
	"purchase_order_line_id" uuid,
	"product_id" uuid NOT NULL,
	"position" smallint NOT NULL,
	"quantity" numeric(14, 3) NOT NULL,
	"unit_cost" numeric(14, 2) NOT NULL,
	"line_total" numeric(14, 2) NOT NULL,
	CONSTRAINT "goods_receipt_lines_receipt_product_unique" UNIQUE("goods_receipt_id","product_id"),
	CONSTRAINT "goods_receipt_lines_receipt_position_unique" UNIQUE("goods_receipt_id","position"),
	CONSTRAINT "goods_receipt_lines_position_range" CHECK ("goods_receipt_lines"."position" between 1 and 50),
	CONSTRAINT "goods_receipt_lines_quantity_positive" CHECK ("goods_receipt_lines"."quantity" > 0),
	CONSTRAINT "goods_receipt_lines_unit_cost_positive" CHECK ("goods_receipt_lines"."unit_cost" > 0),
	CONSTRAINT "goods_receipt_lines_line_total_positive" CHECK ("goods_receipt_lines"."line_total" > 0)
);
--> statement-breakpoint
CREATE TABLE "goods_receipts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"number" bigint NOT NULL,
	"supplier_id" uuid NOT NULL,
	"purchase_order_id" uuid,
	"currency" text NOT NULL,
	"total" numeric(14, 2) NOT NULL,
	"supplier_reference" text,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
	CONSTRAINT "goods_receipts_organization_number_unique" UNIQUE("organization_id","number"),
	CONSTRAINT "goods_receipts_organization_id_id_unique" UNIQUE("organization_id","id"),
	CONSTRAINT "goods_receipts_number_positive" CHECK ("goods_receipts"."number" > 0),
	CONSTRAINT "goods_receipts_total_positive" CHECK ("goods_receipts"."total" > 0),
	CONSTRAINT "goods_receipts_currency_format" CHECK ("goods_receipts"."currency" ~ '^[A-Z]{3}$'),
	CONSTRAINT "goods_receipts_supplier_reference_format" CHECK (char_length("goods_receipts"."supplier_reference") between 1 and 40
        and "goods_receipts"."supplier_reference" ~ '^[A-Za-z0-9 /-]+$'
        and "goods_receipts"."supplier_reference" = btrim("goods_receipts"."supplier_reference"))
);
--> statement-breakpoint
-- Movidos a mano antes de las claves foráneas que los usan (brief-22.4, D-1): drizzle-kit los
-- generó al final, y una clave foránea necesita su único ya creado.
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_organization_id_supplier_currency_unique" UNIQUE("organization_id","id","supplier_id","currency");--> statement-breakpoint
ALTER TABLE "purchase_order_lines" ADD CONSTRAINT "purchase_order_lines_organization_id_product_unique" UNIQUE("organization_id","id","product_id");--> statement-breakpoint
ALTER TABLE "goods_receipt_lines" ADD CONSTRAINT "goods_receipt_lines_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goods_receipt_lines" ADD CONSTRAINT "goods_receipt_lines_receipt_fk" FOREIGN KEY ("organization_id","goods_receipt_id") REFERENCES "public"."goods_receipts"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goods_receipt_lines" ADD CONSTRAINT "goods_receipt_lines_product_fk" FOREIGN KEY ("organization_id","product_id") REFERENCES "public"."products"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goods_receipt_lines" ADD CONSTRAINT "goods_receipt_lines_order_line_fk" FOREIGN KEY ("organization_id","purchase_order_line_id","product_id") REFERENCES "public"."purchase_order_lines"("organization_id","id","product_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goods_receipts" ADD CONSTRAINT "goods_receipts_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goods_receipts" ADD CONSTRAINT "goods_receipts_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goods_receipts" ADD CONSTRAINT "goods_receipts_supplier_fk" FOREIGN KEY ("organization_id","supplier_id") REFERENCES "public"."suppliers"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goods_receipts" ADD CONSTRAINT "goods_receipts_order_fk" FOREIGN KEY ("organization_id","purchase_order_id","supplier_id","currency") REFERENCES "public"."purchase_orders"("organization_id","id","supplier_id","currency") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "goods_receipt_lines_order_line_idx" ON "goods_receipt_lines" USING btree ("organization_id","purchase_order_line_id") WHERE "goods_receipt_lines"."purchase_order_line_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "goods_receipts_list_idx" ON "goods_receipts" USING btree ("organization_id","created_at" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "goods_receipts_supplier_idx" ON "goods_receipts" USING btree ("organization_id","supplier_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "goods_receipts_order_idx" ON "goods_receipts" USING btree ("organization_id","purchase_order_id") WHERE "goods_receipts"."purchase_order_id" IS NOT NULL;--> statement-breakpoint
-- Escrito a mano (brief-22.4, D-2; ADR 0023, punto 4; ADR 0013). Ningún CHECK ni trigger de esta
-- migración usa los valores nuevos de audit_entity_type, inventory_movement_type ni document_kind:
-- un valor agregado con ALTER TYPE no se puede usar en la misma transacción (H-7).
--
-- La recepción es un comprobante emitido: crm_app la lee y la inserta, nunca la cambia ni la borra.
GRANT SELECT, INSERT ON TABLE goods_receipts TO crm_app;--> statement-breakpoint
GRANT SELECT, INSERT ON TABLE goods_receipt_lines TO crm_app;--> statement-breakpoint
-- Las dos tablas, de solo inserción para cualquier rol, con el molde de sale_voids (0041).
CREATE FUNCTION goods_receipts_reject_change() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'goods_receipts es de solo inserción: % rechazado', TG_OP;
END
$$;--> statement-breakpoint
CREATE TRIGGER goods_receipts_insert_only
BEFORE UPDATE OR DELETE ON goods_receipts
FOR EACH ROW EXECUTE FUNCTION goods_receipts_reject_change();--> statement-breakpoint
CREATE FUNCTION goods_receipt_lines_reject_change() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'goods_receipt_lines es de solo inserción: % rechazado', TG_OP;
END
$$;--> statement-breakpoint
CREATE TRIGGER goods_receipt_lines_insert_only
BEFORE UPDATE OR DELETE ON goods_receipt_lines
FOR EACH ROW EXECUTE FUNCTION goods_receipt_lines_reject_change();

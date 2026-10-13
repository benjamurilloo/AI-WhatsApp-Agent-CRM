CREATE TYPE "public"."sale_void_reason" AS ENUM('data_entry_error', 'not_completed', 'wrong_client', 'other');--> statement-breakpoint
ALTER TYPE "public"."audit_action" ADD VALUE 'void';--> statement-breakpoint
ALTER TYPE "public"."inventory_movement_type" ADD VALUE 'sale_void';--> statement-breakpoint
ALTER TYPE "public"."document_kind" ADD VALUE 'sale_void';--> statement-breakpoint
CREATE TABLE "sale_voids" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"number" bigint NOT NULL,
	"sale_id" uuid NOT NULL,
	"currency" text NOT NULL,
	"total" numeric(14, 2) NOT NULL,
	"reason" "sale_void_reason" NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
	CONSTRAINT "sale_voids_organization_number_unique" UNIQUE("organization_id","number"),
	CONSTRAINT "sale_voids_sale_unique" UNIQUE("sale_id"),
	CONSTRAINT "sale_voids_number_positive" CHECK ("sale_voids"."number" > 0),
	CONSTRAINT "sale_voids_total_positive" CHECK ("sale_voids"."total" > 0),
	CONSTRAINT "sale_voids_currency_format" CHECK ("sale_voids"."currency" ~ '^[A-Z]{3}$')
);
--> statement-breakpoint
DROP INDEX "sales_organization_order_unique";--> statement-breakpoint
ALTER TABLE "sales" ADD COLUMN "replaces_sale_id" uuid;--> statement-breakpoint
ALTER TABLE "sale_voids" ADD CONSTRAINT "sale_voids_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sale_voids" ADD CONSTRAINT "sale_voids_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sale_voids" ADD CONSTRAINT "sale_voids_sale_fk" FOREIGN KEY ("organization_id","sale_id") REFERENCES "public"."sales"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales" ADD CONSTRAINT "sales_replaces_sale_fk" FOREIGN KEY ("organization_id","replaces_sale_id") REFERENCES "public"."sales"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "sales_organization_order_first_unique" ON "sales" USING btree ("organization_id","order_id") WHERE "sales"."replaces_sale_id" IS NULL;--> statement-breakpoint
CREATE INDEX "sales_order_idx" ON "sales" USING btree ("organization_id","order_id");--> statement-breakpoint
ALTER TABLE "sales" ADD CONSTRAINT "sales_replaces_sale_unique" UNIQUE("replaces_sale_id");--> statement-breakpoint
ALTER TABLE "sales" ADD CONSTRAINT "sales_replaces_needs_order" CHECK ("sales"."replaces_sale_id" IS NULL OR "sales"."order_id" IS NOT NULL);--> statement-breakpoint
-- Escrito a mano (brief-20.4; ADR 0021, puntos 3, 6 y 7; ADR 0013).
--
-- La anulación es un comprobante emitido: sale_voids es de solo inserción para crm_app, y el
-- trigger de la 0039 la defiende para cualquier rol (P0001).
GRANT SELECT, INSERT ON TABLE sale_voids TO crm_app;--> statement-breakpoint
CREATE TRIGGER sale_voids_insert_only
BEFORE UPDATE OR DELETE ON sale_voids
FOR EACH ROW EXECUTE FUNCTION sales_reject_change();--> statement-breakpoint
-- La anulación copia la moneda y el total de su venta (brief-20.4, D-1): nunca dice otro monto. Si
-- la venta no existe en la organización, la clave foránea lo rechaza después.
CREATE FUNCTION sale_voids_check_copy() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  sale_currency text;
  sale_total numeric(14, 2);
BEGIN
  SELECT currency, total INTO sale_currency, sale_total
  FROM sales
  WHERE organization_id = NEW.organization_id AND id = NEW.sale_id;
  IF FOUND AND (NEW.currency IS DISTINCT FROM sale_currency
                OR NEW.total IS DISTINCT FROM sale_total) THEN
    RAISE EXCEPTION 'la anulación % no copia la moneda y el total de su venta', NEW.number;
  END IF;
  RETURN NEW;
END
$$;--> statement-breakpoint
CREATE TRIGGER sale_voids_copy_sale
BEFORE INSERT ON sale_voids
FOR EACH ROW EXECUTE FUNCTION sale_voids_check_copy();--> statement-breakpoint
-- La cadena de reemplazos (ADR 0021, punto 3; brief-20.4, D-3): una venta reemplaza solo a una venta
-- anulada del mismo pedido. Con el índice parcial (una sola primera venta por pedido) y
-- sales_replaces_sale_unique (cada venta reemplazada una vez), las ventas de un pedido forman una
-- sola cadena, y solo su último eslabón puede estar vigente. IS DISTINCT FROM, para que un pedido
-- nulo no se escape de la comparación.
CREATE FUNCTION sales_check_replacement() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  replaced_order uuid;
BEGIN
  IF NEW.replaces_sale_id IS NULL THEN
    RETURN NEW;
  END IF;
  SELECT order_id INTO replaced_order
  FROM sales
  WHERE organization_id = NEW.organization_id AND id = NEW.replaces_sale_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'la venta reemplazada % no existe en la organización', NEW.replaces_sale_id;
  END IF;
  IF replaced_order IS DISTINCT FROM NEW.order_id THEN
    RAISE EXCEPTION 'la venta reemplazada % es de otro pedido', NEW.replaces_sale_id;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM sale_voids
    WHERE organization_id = NEW.organization_id AND sale_id = NEW.replaces_sale_id
  ) THEN
    RAISE EXCEPTION 'la venta reemplazada % no está anulada', NEW.replaces_sale_id;
  END IF;
  RETURN NEW;
END
$$;--> statement-breakpoint
CREATE TRIGGER sales_replacement_chain
BEFORE INSERT ON sales
FOR EACH ROW EXECUTE FUNCTION sales_check_replacement();

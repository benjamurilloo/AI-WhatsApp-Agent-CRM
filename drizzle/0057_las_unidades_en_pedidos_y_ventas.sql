ALTER TYPE "public"."stock_unit_status" ADD VALUE 'reserved';--> statement-breakpoint
ALTER TYPE "public"."stock_unit_status" ADD VALUE 'sold';--> statement-breakpoint
CREATE TABLE "order_line_units" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"order_line_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"unit_id" uuid NOT NULL,
	"unit_price" numeric(14, 2) NOT NULL,
	CONSTRAINT "order_line_units_line_unit_unique" UNIQUE("order_line_id","unit_id"),
	CONSTRAINT "order_line_units_unit_price_positive" CHECK ("order_line_units"."unit_price" > 0)
);
--> statement-breakpoint
CREATE TABLE "sale_line_units" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"sale_line_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"unit_id" uuid NOT NULL,
	"unit_price" numeric(14, 2) NOT NULL,
	CONSTRAINT "sale_line_units_line_unit_unique" UNIQUE("sale_line_id","unit_id"),
	CONSTRAINT "sale_line_units_unit_price_positive" CHECK ("sale_line_units"."unit_price" > 0)
);
--> statement-breakpoint
ALTER TABLE "stock_units" ADD COLUMN "price" numeric(14, 2);--> statement-breakpoint
ALTER TABLE "stock_units" ADD COLUMN "price_currency" text;--> statement-breakpoint
ALTER TABLE "order_lines" ADD CONSTRAINT "order_lines_organization_id_product_unique" UNIQUE("organization_id","id","product_id");--> statement-breakpoint
ALTER TABLE "sale_lines" ADD CONSTRAINT "sale_lines_organization_id_product_unique" UNIQUE("organization_id","id","product_id");--> statement-breakpoint
ALTER TABLE "order_line_units" ADD CONSTRAINT "order_line_units_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_line_units" ADD CONSTRAINT "order_line_units_line_fk" FOREIGN KEY ("organization_id","order_line_id","product_id") REFERENCES "public"."order_lines"("organization_id","id","product_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_line_units" ADD CONSTRAINT "order_line_units_unit_fk" FOREIGN KEY ("organization_id","product_id","unit_id") REFERENCES "public"."stock_units"("organization_id","product_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sale_line_units" ADD CONSTRAINT "sale_line_units_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sale_line_units" ADD CONSTRAINT "sale_line_units_line_fk" FOREIGN KEY ("organization_id","sale_line_id","product_id") REFERENCES "public"."sale_lines"("organization_id","id","product_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sale_line_units" ADD CONSTRAINT "sale_line_units_unit_fk" FOREIGN KEY ("organization_id","product_id","unit_id") REFERENCES "public"."stock_units"("organization_id","product_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "order_line_units_unit_idx" ON "order_line_units" USING btree ("organization_id","unit_id");--> statement-breakpoint
CREATE INDEX "sale_line_units_unit_idx" ON "sale_line_units" USING btree ("organization_id","unit_id");--> statement-breakpoint
ALTER TABLE "stock_units" ADD CONSTRAINT "stock_units_price_pair" CHECK (("stock_units"."price" is null) = ("stock_units"."price_currency" is null));--> statement-breakpoint
ALTER TABLE "stock_units" ADD CONSTRAINT "stock_units_price_positive" CHECK ("stock_units"."price" > 0);--> statement-breakpoint
ALTER TABLE "stock_units" ADD CONSTRAINT "stock_units_price_currency_format" CHECK ("stock_units"."price_currency" ~ '^[A-Z]{3}$');--> statement-breakpoint
-- Las unidades en pedidos y ventas (brief-29.5.2, D-3 y D-4). Ningún CHECK, índice, trigger ni dato
-- de esta migración nombra como enum los valores reserved y sold que agrega arriba: scripts/migrar.ts
-- aplica las pendientes en una transacción, y PostgreSQL no deja usar en ella un valor recién agregado
-- a un enum. La función compara el estado como texto, como en la 0056.
--
-- Las transiciones de la 29.5.2: available -> reserved (confirmar un pedido), reserved -> available
-- (cancelar un confirmado), reserved -> sold (entregarlo), available -> sold (la venta sin pedido) y
-- sold -> available (su anulación), además de available -> written_off de la 29.5. written_off sigue
-- siendo final. Una subfase con un estado nuevo cambia solo esta función.
CREATE OR REPLACE FUNCTION stock_units_guard_change() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'stock_units no se borra: una unidad se da de baja';
  END IF;
  IF TG_OP = 'INSERT' THEN
    IF NEW.status::text <> 'available' THEN
      RAISE EXCEPTION 'stock_units: una unidad nace disponible';
    END IF;
    RETURN NEW;
  END IF;
  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.organization_id IS DISTINCT FROM OLD.organization_id
     OR NEW.product_id IS DISTINCT FROM OLD.product_id
     OR NEW.serial IS DISTINCT FROM OLD.serial
     OR NEW.origin_type IS DISTINCT FROM OLD.origin_type
     OR NEW.origin_id IS DISTINCT FROM OLD.origin_id
     OR NEW.created_by IS DISTINCT FROM OLD.created_by
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'stock_units: la unidad, su producto, su IMEI y su origen no cambian';
  END IF;
  IF OLD.status::text = 'written_off' THEN
    RAISE EXCEPTION 'stock_units: una unidad dada de baja no cambia';
  END IF;
  IF NEW.status IS DISTINCT FROM OLD.status
     AND (OLD.status::text, NEW.status::text) NOT IN (
       ('available', 'written_off'),
       ('available', 'reserved'),
       ('reserved', 'available'),
       ('reserved', 'sold'),
       ('available', 'sold'),
       ('sold', 'available')
     ) THEN
    RAISE EXCEPTION 'stock_units: transición % -> % no permitida', OLD.status, NEW.status;
  END IF;
  RETURN NEW;
END
$$;--> statement-breakpoint
-- Las unidades de cada línea de un pedido y de una venta, de solo inserción, como order_lines (0036)
-- y sale_lines (0039).
CREATE FUNCTION order_line_units_reject_change() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'order_line_units es de solo inserción: % rechazado', TG_OP;
END
$$;--> statement-breakpoint
CREATE TRIGGER order_line_units_insert_only
BEFORE UPDATE OR DELETE ON order_line_units
FOR EACH ROW EXECUTE FUNCTION order_line_units_reject_change();--> statement-breakpoint
CREATE FUNCTION sale_line_units_reject_change() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'sale_line_units es de solo inserción: % rechazado', TG_OP;
END
$$;--> statement-breakpoint
CREATE TRIGGER sale_line_units_insert_only
BEFORE UPDATE OR DELETE ON sale_line_units
FOR EACH ROW EXECUTE FUNCTION sale_line_units_reject_change();--> statement-breakpoint
GRANT SELECT, INSERT ON TABLE order_line_units TO crm_app;--> statement-breakpoint
GRANT SELECT, INSERT ON TABLE sale_line_units TO crm_app;

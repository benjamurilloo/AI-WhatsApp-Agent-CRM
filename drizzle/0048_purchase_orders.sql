CREATE TYPE "public"."purchase_order_status" AS ENUM('open', 'closed', 'cancelled');--> statement-breakpoint
ALTER TYPE "public"."audit_entity_type" ADD VALUE 'purchase_order';--> statement-breakpoint
ALTER TYPE "public"."document_kind" ADD VALUE 'purchase_order';--> statement-breakpoint
CREATE TABLE "purchase_order_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"purchase_order_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"position" smallint NOT NULL,
	"quantity" numeric(14, 3) NOT NULL,
	"unit_cost" numeric(14, 2) NOT NULL,
	"line_total" numeric(14, 2) NOT NULL,
	CONSTRAINT "purchase_order_lines_order_product_unique" UNIQUE("purchase_order_id","product_id"),
	CONSTRAINT "purchase_order_lines_order_position_unique" UNIQUE("purchase_order_id","position"),
	CONSTRAINT "purchase_order_lines_position_range" CHECK ("purchase_order_lines"."position" between 1 and 50),
	CONSTRAINT "purchase_order_lines_quantity_positive" CHECK ("purchase_order_lines"."quantity" > 0),
	CONSTRAINT "purchase_order_lines_unit_cost_positive" CHECK ("purchase_order_lines"."unit_cost" > 0),
	CONSTRAINT "purchase_order_lines_line_total_positive" CHECK ("purchase_order_lines"."line_total" > 0)
);
--> statement-breakpoint
CREATE TABLE "purchase_orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"number" bigint NOT NULL,
	"supplier_id" uuid NOT NULL,
	"currency" text NOT NULL,
	"total" numeric(14, 2) NOT NULL,
	"status" "purchase_order_status" DEFAULT 'open' NOT NULL,
	"closed_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "purchase_orders_organization_number_unique" UNIQUE("organization_id","number"),
	CONSTRAINT "purchase_orders_organization_id_id_unique" UNIQUE("organization_id","id"),
	CONSTRAINT "purchase_orders_number_positive" CHECK ("purchase_orders"."number" > 0),
	CONSTRAINT "purchase_orders_total_positive" CHECK ("purchase_orders"."total" > 0),
	CONSTRAINT "purchase_orders_currency_format" CHECK ("purchase_orders"."currency" ~ '^[A-Z]{3}$'),
	CONSTRAINT "purchase_orders_status_dates" CHECK (("purchase_orders"."closed_at" is not null) = ("purchase_orders"."status" = 'closed')
        and ("purchase_orders"."cancelled_at" is not null) = ("purchase_orders"."status" = 'cancelled'))
);
--> statement-breakpoint
ALTER TABLE "purchase_order_lines" ADD CONSTRAINT "purchase_order_lines_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_order_lines" ADD CONSTRAINT "purchase_order_lines_order_fk" FOREIGN KEY ("organization_id","purchase_order_id") REFERENCES "public"."purchase_orders"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_order_lines" ADD CONSTRAINT "purchase_order_lines_product_fk" FOREIGN KEY ("organization_id","product_id") REFERENCES "public"."products"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_supplier_fk" FOREIGN KEY ("organization_id","supplier_id") REFERENCES "public"."suppliers"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "purchase_orders_list_idx" ON "purchase_orders" USING btree ("organization_id","created_at" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "purchase_orders_supplier_idx" ON "purchase_orders" USING btree ("organization_id","supplier_id","created_at" DESC NULLS LAST);--> statement-breakpoint
-- Escrito a mano (brief-22.3, D-2; ADR 0023, punto 3; ADR 0013). Ningún CHECK ni trigger de esta
-- migración usa los valores nuevos de document_kind ni de audit_entity_type: un valor agregado con
-- ALTER TYPE no se puede usar en la misma transacción (H-7). purchase_order_status sí, porque se crea.
--
-- purchase_orders: se actualiza su estado, nunca se borra. purchase_order_lines: de solo inserción.
GRANT SELECT, INSERT, UPDATE ON TABLE purchase_orders TO crm_app;--> statement-breakpoint
GRANT SELECT, INSERT ON TABLE purchase_order_lines TO crm_app;--> statement-breakpoint
-- La cabecera de la orden (ADR 0023, punto 3), con el molde de orders_guard (0036): nace abierta y
-- sin fechas de estado, no se borra, y un UPDATE solo cambia las columnas de la lista permitida. La
-- lista es de columnas permitidas, no prohibidas: una columna que se agregue después queda fija sin
-- tocar este trigger. El estado solo pasa de open a closed o a cancelled, y una fecha puesta no
-- cambia. open -> closed queda permitido desde ahora, aunque lo use recién la 22.4 (D-2 y D-3).
CREATE FUNCTION purchase_orders_guard_change() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  mutable text[] := ARRAY['status', 'closed_at', 'cancelled_at', 'updated_at'];
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'purchase_orders no se borra';
  END IF;
  IF TG_OP = 'INSERT' THEN
    IF NEW.status <> 'open' OR NEW.closed_at IS NOT NULL OR NEW.cancelled_at IS NOT NULL THEN
      RAISE EXCEPTION 'una orden de compra nace abierta';
    END IF;
    RETURN NEW;
  END IF;
  IF (to_jsonb(NEW) - mutable) IS DISTINCT FROM (to_jsonb(OLD) - mutable) THEN
    RAISE EXCEPTION 'purchase_orders: solo cambian el estado y sus fechas';
  END IF;
  IF NEW.status IS DISTINCT FROM OLD.status
     AND (OLD.status, NEW.status) NOT IN (
       ('open'::purchase_order_status, 'closed'::purchase_order_status),
       ('open'::purchase_order_status, 'cancelled'::purchase_order_status)
     ) THEN
    RAISE EXCEPTION 'purchase_orders: transición % -> % no permitida', OLD.status, NEW.status;
  END IF;
  IF (OLD.closed_at IS NOT NULL AND NEW.closed_at IS DISTINCT FROM OLD.closed_at)
     OR (OLD.cancelled_at IS NOT NULL AND NEW.cancelled_at IS DISTINCT FROM OLD.cancelled_at) THEN
    RAISE EXCEPTION 'purchase_orders: una fecha de estado no cambia';
  END IF;
  RETURN NEW;
END
$$;--> statement-breakpoint
CREATE TRIGGER purchase_orders_guard
BEFORE INSERT OR UPDATE OR DELETE ON purchase_orders
FOR EACH ROW EXECUTE FUNCTION purchase_orders_guard_change();--> statement-breakpoint
-- Las líneas, de solo inserción, como order_lines en la 0036.
CREATE FUNCTION purchase_order_lines_reject_change() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'purchase_order_lines es de solo inserción: % rechazado', TG_OP;
END
$$;--> statement-breakpoint
CREATE TRIGGER purchase_order_lines_insert_only
BEFORE UPDATE OR DELETE ON purchase_order_lines
FOR EACH ROW EXECUTE FUNCTION purchase_order_lines_reject_change();

CREATE TYPE "public"."service_order_cancel_reason" AS ENUM('customer_withdrew', 'not_repairable', 'entered_by_mistake', 'other');--> statement-breakpoint
CREATE TYPE "public"."service_order_kind" AS ENUM('customer_device');--> statement-breakpoint
CREATE TYPE "public"."service_order_status" AS ENUM('received', 'sent', 'quoted', 'approved', 'rejected', 'repaired', 'delivered', 'cancelled');--> statement-breakpoint
ALTER TYPE "public"."audit_entity_type" ADD VALUE 'repair_type';--> statement-breakpoint
ALTER TYPE "public"."audit_entity_type" ADD VALUE 'repair_price';--> statement-breakpoint
ALTER TYPE "public"."audit_entity_type" ADD VALUE 'service_order';--> statement-breakpoint
ALTER TYPE "public"."document_kind" ADD VALUE 'service_order';--> statement-breakpoint
ALTER TYPE "public"."capability" ADD VALUE 'repairs';--> statement-breakpoint
CREATE TABLE "repair_prices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"repair_type_id" uuid NOT NULL,
	"model_id" uuid NOT NULL,
	"price" numeric(14, 2) NOT NULL,
	"price_currency" text NOT NULL,
	"cost" numeric(14, 2) NOT NULL,
	"cost_currency" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "repair_prices_organization_type_model_unique" UNIQUE("organization_id","repair_type_id","model_id"),
	CONSTRAINT "repair_prices_price_positive" CHECK ("repair_prices"."price" > 0),
	CONSTRAINT "repair_prices_cost_positive" CHECK ("repair_prices"."cost" > 0),
	CONSTRAINT "repair_prices_price_currency_format" CHECK ("repair_prices"."price_currency" ~ '^[A-Z]{3}$'),
	CONSTRAINT "repair_prices_cost_currency_format" CHECK ("repair_prices"."cost_currency" ~ '^[A-Z]{3}$')
);
--> statement-breakpoint
CREATE TABLE "repair_types" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"name" text NOT NULL,
	"position" smallint DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"is_example" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "repair_types_organization_id_id_unique" UNIQUE("organization_id","id"),
	CONSTRAINT "repair_types_name_length" CHECK (char_length("repair_types"."name") between 1 and 60 and "repair_types"."name" = btrim("repair_types"."name")),
	CONSTRAINT "repair_types_position_range" CHECK ("repair_types"."position" >= 0)
);
--> statement-breakpoint
CREATE TABLE "service_order_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"service_order_id" uuid NOT NULL,
	"repair_type_id" uuid NOT NULL,
	"position" smallint NOT NULL,
	"price" numeric(14, 2) NOT NULL,
	"cost" numeric(14, 2) NOT NULL,
	CONSTRAINT "service_order_lines_order_type_unique" UNIQUE("service_order_id","repair_type_id"),
	CONSTRAINT "service_order_lines_order_position_unique" UNIQUE("service_order_id","position"),
	CONSTRAINT "service_order_lines_position_range" CHECK ("service_order_lines"."position" between 1 and 20),
	CONSTRAINT "service_order_lines_price_positive" CHECK ("service_order_lines"."price" > 0),
	CONSTRAINT "service_order_lines_cost_positive" CHECK ("service_order_lines"."cost" > 0)
);
--> statement-breakpoint
CREATE TABLE "service_orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"number" bigint NOT NULL,
	"kind" "service_order_kind" DEFAULT 'customer_device' NOT NULL,
	"client_id" uuid NOT NULL,
	"model_id" uuid NOT NULL,
	"device_serial" text,
	"reported_issue" text,
	"technician_id" uuid,
	"status" "service_order_status" DEFAULT 'received' NOT NULL,
	"customer_currency" text,
	"customer_total" numeric(14, 2),
	"technician_currency" text,
	"technician_total" numeric(14, 2),
	"sent_at" timestamp with time zone,
	"quoted_at" timestamp with time zone,
	"approved_at" timestamp with time zone,
	"rejected_at" timestamp with time zone,
	"repaired_at" timestamp with time zone,
	"delivered_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"cancel_reason" "service_order_cancel_reason",
	"sale_id" uuid,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "service_orders_organization_number_unique" UNIQUE("organization_id","number"),
	CONSTRAINT "service_orders_organization_id_id_unique" UNIQUE("organization_id","id"),
	CONSTRAINT "service_orders_sale_unique" UNIQUE("sale_id"),
	CONSTRAINT "service_orders_number_positive" CHECK ("service_orders"."number" > 0),
	CONSTRAINT "service_orders_device_serial_format" CHECK ("service_orders"."device_serial" ~ '^[A-Za-z0-9][A-Za-z0-9-]{0,31}$'),
	CONSTRAINT "service_orders_reported_issue_length" CHECK (char_length("service_orders"."reported_issue") between 1 and 1000 and "service_orders"."reported_issue" = btrim("service_orders"."reported_issue")),
	CONSTRAINT "service_orders_customer_currency_format" CHECK ("service_orders"."customer_currency" ~ '^[A-Z]{3}$'),
	CONSTRAINT "service_orders_technician_currency_format" CHECK ("service_orders"."technician_currency" ~ '^[A-Z]{3}$'),
	CONSTRAINT "service_orders_customer_total_positive" CHECK ("service_orders"."customer_total" > 0),
	CONSTRAINT "service_orders_technician_total_positive" CHECK ("service_orders"."technician_total" > 0),
	CONSTRAINT "service_orders_technician_sent" CHECK (("service_orders"."technician_id" is not null) = ("service_orders"."sent_at" is not null)),
	CONSTRAINT "service_orders_quote_together" CHECK (("service_orders"."quoted_at" is not null) = ("service_orders"."customer_currency" is not null)
        and ("service_orders"."quoted_at" is not null) = ("service_orders"."customer_total" is not null)
        and ("service_orders"."quoted_at" is not null) = ("service_orders"."technician_currency" is not null)
        and ("service_orders"."quoted_at" is not null) = ("service_orders"."technician_total" is not null)),
	CONSTRAINT "service_orders_dates_chain" CHECK (("service_orders"."quoted_at" is null or "service_orders"."sent_at" is not null)
        and ("service_orders"."approved_at" is null or "service_orders"."quoted_at" is not null)
        and ("service_orders"."rejected_at" is null or "service_orders"."quoted_at" is not null)
        and ("service_orders"."approved_at" is null or "service_orders"."rejected_at" is null)
        and ("service_orders"."repaired_at" is null or "service_orders"."approved_at" is not null)),
	CONSTRAINT "service_orders_status_dates" CHECK (("service_orders"."delivered_at" is not null) = ("service_orders"."status" = 'delivered')
        and ("service_orders"."cancelled_at" is not null) = ("service_orders"."status" = 'cancelled')
        and ("service_orders"."cancel_reason" is not null) = ("service_orders"."status" = 'cancelled')
        and case "service_orders"."status"
          when 'received' then "service_orders"."sent_at" is null
          when 'sent' then "service_orders"."sent_at" is not null and "service_orders"."quoted_at" is null
          when 'quoted' then "service_orders"."quoted_at" is not null and "service_orders"."approved_at" is null and "service_orders"."rejected_at" is null
          when 'approved' then "service_orders"."approved_at" is not null and "service_orders"."repaired_at" is null
          when 'rejected' then "service_orders"."rejected_at" is not null
          when 'repaired' then "service_orders"."repaired_at" is not null
          when 'delivered' then ("service_orders"."repaired_at" is not null) <> ("service_orders"."rejected_at" is not null)
          when 'cancelled' then "service_orders"."repaired_at" is null and "service_orders"."rejected_at" is null
        end),
	CONSTRAINT "service_orders_sale_delivered" CHECK (("service_orders"."sale_id" is not null) = ("service_orders"."status" = 'delivered' and "service_orders"."repaired_at" is not null))
);
--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "is_service" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "suppliers" ADD COLUMN "is_technician" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "repair_prices" ADD CONSTRAINT "repair_prices_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "repair_prices" ADD CONSTRAINT "repair_prices_type_fk" FOREIGN KEY ("organization_id","repair_type_id") REFERENCES "public"."repair_types"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "repair_prices" ADD CONSTRAINT "repair_prices_model_fk" FOREIGN KEY ("organization_id","model_id") REFERENCES "public"."product_models"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "repair_types" ADD CONSTRAINT "repair_types_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_order_lines" ADD CONSTRAINT "service_order_lines_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_order_lines" ADD CONSTRAINT "service_order_lines_order_fk" FOREIGN KEY ("organization_id","service_order_id") REFERENCES "public"."service_orders"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_order_lines" ADD CONSTRAINT "service_order_lines_type_fk" FOREIGN KEY ("organization_id","repair_type_id") REFERENCES "public"."repair_types"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_orders" ADD CONSTRAINT "service_orders_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_orders" ADD CONSTRAINT "service_orders_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_orders" ADD CONSTRAINT "service_orders_client_fk" FOREIGN KEY ("organization_id","client_id") REFERENCES "public"."clients"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_orders" ADD CONSTRAINT "service_orders_model_fk" FOREIGN KEY ("organization_id","model_id") REFERENCES "public"."product_models"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_orders" ADD CONSTRAINT "service_orders_technician_fk" FOREIGN KEY ("organization_id","technician_id") REFERENCES "public"."suppliers"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_orders" ADD CONSTRAINT "service_orders_sale_fk" FOREIGN KEY ("organization_id","sale_id") REFERENCES "public"."sales"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "repair_prices_model_idx" ON "repair_prices" USING btree ("organization_id","model_id");--> statement-breakpoint
CREATE UNIQUE INDEX "repair_types_organization_name_lower_unique" ON "repair_types" USING btree ("organization_id",lower("name"));--> statement-breakpoint
CREATE INDEX "service_orders_list_idx" ON "service_orders" USING btree ("organization_id","created_at" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "service_orders_status_idx" ON "service_orders" USING btree ("organization_id","status","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "service_orders_client_idx" ON "service_orders" USING btree ("organization_id","client_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "service_orders_technician_idx" ON "service_orders" USING btree ("organization_id","technician_id") WHERE "service_orders"."technician_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "products_organization_service_unique" ON "products" USING btree ("organization_id") WHERE "products"."is_service";--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_service_quantity" CHECK (not "products"."is_service" or "products"."tracking" = 'quantity');--> statement-breakpoint
-- Las reparaciones de equipos de clientes (brief-29.6, D-2 a D-5 y D-12). Ningún CHECK, trigger ni
-- dato de esta migración nombra los valores que agrega arriba con ALTER TYPE (repairs, service_order,
-- repair_type, repair_price): scripts/migrar.ts aplica las pendientes en una transacción, y PostgreSQL
-- no deja usar en ella un valor recién agregado a un enum que ya existía. Los enums nuevos de esta
-- migración sí se pueden nombrar.
--
-- El producto de servicio (D-5): lo fija el alta y no cambia, y nunca tiene saldo ni movimientos. Un
-- producto común no se vuelve de servicio, ni al revés. Las dos defensas de inventario son la última:
-- el pedido, la venta de la pantalla, el ajuste, la orden de compra y la recepción lo rechazan antes.
CREATE FUNCTION products_service_fixed() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.is_service IS DISTINCT FROM OLD.is_service THEN
    RAISE EXCEPTION 'products: is_service no cambia';
  END IF;
  RETURN NEW;
END
$$;--> statement-breakpoint
CREATE TRIGGER products_service_fixed
BEFORE UPDATE ON products
FOR EACH ROW EXECUTE FUNCTION products_service_fixed();--> statement-breakpoint
CREATE FUNCTION inventory_reject_service_product() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM products p
    WHERE p.organization_id = NEW.organization_id AND p.id = NEW.product_id AND p.is_service
  ) THEN
    RAISE EXCEPTION '%: el producto de servicio no tiene stock', TG_TABLE_NAME;
  END IF;
  RETURN NEW;
END
$$;--> statement-breakpoint
CREATE TRIGGER inventories_no_service_product
BEFORE INSERT ON inventories
FOR EACH ROW EXECUTE FUNCTION inventory_reject_service_product();--> statement-breakpoint
CREATE TRIGGER inventory_movements_no_service_product
BEFORE INSERT ON inventory_movements
FOR EACH ROW EXECUTE FUNCTION inventory_reject_service_product();--> statement-breakpoint
-- La orden de servicio (D-4), con el molde de purchase_orders_guard (0048): nace recibida y con lo que
-- reporta el cliente, y no se borra. Cada transición permitida cambia el estado, updated_at y solo sus
-- columnas, que se fijan una sola vez: el técnico al mandarla, el presupuesto al presupuestarla, su
-- fecha al aprobarla, rechazarla o repararla, la fecha y la venta al entregarla, y la fecha y el motivo
-- al cancelarla. Un UPDATE sin cambio de estado no cambia nada, salvo el vaciado de datos de un cliente
-- (D-11), que deja en null el IMEI y lo que reportó, y nada más, en cualquier estado.
CREATE FUNCTION service_orders_guard_change() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  fixed text[];
  vaciada service_orders;
  column_name text;
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'service_orders no se borra';
  END IF;
  IF TG_OP = 'INSERT' THEN
    IF NEW.status <> 'received' OR NEW.reported_issue IS NULL THEN
      RAISE EXCEPTION 'una orden de servicio nace recibida y con lo que reporta el cliente';
    END IF;
    RETURN NEW;
  END IF;
  vaciada := OLD;
  vaciada.device_serial := NULL;
  vaciada.reported_issue := NULL;
  vaciada.updated_at := NEW.updated_at;
  IF NEW IS NOT DISTINCT FROM vaciada THEN
    RETURN NEW;
  END IF;
  IF NEW.status = OLD.status THEN
    IF (to_jsonb(NEW) - 'updated_at') IS DISTINCT FROM (to_jsonb(OLD) - 'updated_at') THEN
      RAISE EXCEPTION 'service_orders: sin cambio de estado no cambia nada';
    END IF;
    RETURN NEW;
  END IF;
  fixed := CASE
    WHEN OLD.status = 'received' AND NEW.status = 'sent' THEN
      ARRAY['technician_id', 'sent_at']
    WHEN OLD.status = 'sent' AND NEW.status = 'quoted' THEN
      ARRAY['customer_currency', 'customer_total', 'technician_currency', 'technician_total',
        'quoted_at']
    WHEN OLD.status = 'quoted' AND NEW.status = 'approved' THEN ARRAY['approved_at']
    WHEN OLD.status = 'quoted' AND NEW.status = 'rejected' THEN ARRAY['rejected_at']
    WHEN OLD.status = 'approved' AND NEW.status = 'repaired' THEN ARRAY['repaired_at']
    WHEN OLD.status = 'repaired' AND NEW.status = 'delivered' THEN
      ARRAY['delivered_at', 'sale_id']
    WHEN OLD.status = 'rejected' AND NEW.status = 'delivered' THEN ARRAY['delivered_at']
    WHEN OLD.status IN ('received', 'sent', 'quoted', 'approved') AND NEW.status = 'cancelled' THEN
      ARRAY['cancelled_at', 'cancel_reason']
  END;
  IF fixed IS NULL THEN
    RAISE EXCEPTION 'service_orders: transición % -> % no permitida', OLD.status, NEW.status;
  END IF;
  IF (to_jsonb(NEW) - fixed - 'status' - 'updated_at')
     IS DISTINCT FROM (to_jsonb(OLD) - fixed - 'status' - 'updated_at') THEN
    RAISE EXCEPTION 'service_orders: la transición % -> % solo fija %', OLD.status, NEW.status, fixed;
  END IF;
  FOREACH column_name IN ARRAY fixed LOOP
    IF to_jsonb(OLD) -> column_name <> 'null'::jsonb
       AND (to_jsonb(NEW) -> column_name) IS DISTINCT FROM (to_jsonb(OLD) -> column_name) THEN
      RAISE EXCEPTION 'service_orders: % ya está fijado', column_name;
    END IF;
  END LOOP;
  RETURN NEW;
END
$$;--> statement-breakpoint
CREATE TRIGGER service_orders_guard
BEFORE INSERT OR UPDATE OR DELETE ON service_orders
FOR EACH ROW EXECUTE FUNCTION service_orders_guard_change();--> statement-breakpoint
-- Las líneas del presupuesto, de solo inserción como order_lines (0036), y solo en una orden que se
-- está presupuestando: el servicio la pasa a quoted y después inserta sus líneas, en la misma
-- transacción (D-4). Lo que suman, con la línea nueva, no pasa los totales de la orden: como cada
-- precio y cada costo es mayor que cero, una vez completo el presupuesto no entra otra línea. Un
-- trigger BEFORE ROW ve las filas que la misma sentencia ya insertó.
CREATE FUNCTION service_order_lines_guard_change() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  parent service_orders;
  price_sum numeric;
  cost_sum numeric;
BEGIN
  IF TG_OP <> 'INSERT' THEN
    RAISE EXCEPTION 'service_order_lines es de solo inserción: % rechazado', TG_OP;
  END IF;
  SELECT * INTO parent FROM service_orders o
  WHERE o.organization_id = NEW.organization_id AND o.id = NEW.service_order_id;
  IF NOT FOUND OR parent.status <> 'quoted' THEN
    RAISE EXCEPTION 'service_order_lines: las líneas se insertan con el presupuesto';
  END IF;
  SELECT coalesce(sum(l.price), 0), coalesce(sum(l.cost), 0) INTO price_sum, cost_sum
  FROM service_order_lines l
  WHERE l.organization_id = NEW.organization_id AND l.service_order_id = NEW.service_order_id;
  IF price_sum + NEW.price > parent.customer_total
     OR cost_sum + NEW.cost > parent.technician_total THEN
    RAISE EXCEPTION 'service_order_lines: las líneas pasan los totales del presupuesto';
  END IF;
  RETURN NEW;
END
$$;--> statement-breakpoint
CREATE TRIGGER service_order_lines_guard
BEFORE INSERT OR UPDATE OR DELETE ON service_order_lines
FOR EACH ROW EXECUTE FUNCTION service_order_lines_guard_change();--> statement-breakpoint
-- Permisos de crm_app: la lista y la orden se editan, nunca se borran (el tipo se desactiva y la orden
-- se cancela); las líneas, solo se insertan.
GRANT SELECT, INSERT, UPDATE ON TABLE repair_types TO crm_app;--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON TABLE repair_prices TO crm_app;--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON TABLE service_orders TO crm_app;--> statement-breakpoint
GRANT SELECT, INSERT ON TABLE service_order_lines TO crm_app;

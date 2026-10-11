CREATE TYPE "public"."document_kind" AS ENUM('order');--> statement-breakpoint
CREATE TYPE "public"."order_status" AS ENUM('pending', 'confirmed', 'delivered', 'cancelled');--> statement-breakpoint
ALTER TYPE "public"."audit_entity_type" ADD VALUE 'order';--> statement-breakpoint
CREATE TABLE "document_counters" (
	"organization_id" uuid NOT NULL,
	"kind" "document_kind" NOT NULL,
	"last_number" bigint NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "document_counters_pkey" PRIMARY KEY("organization_id","kind"),
	CONSTRAINT "document_counters_last_number_non_negative" CHECK ("document_counters"."last_number" >= 0)
);
--> statement-breakpoint
CREATE TABLE "order_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"order_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"position" smallint NOT NULL,
	"quantity" numeric(14, 3) NOT NULL,
	"unit_price" numeric(14, 2) NOT NULL,
	"currency" text NOT NULL,
	"line_total" numeric(14, 2) NOT NULL,
	CONSTRAINT "order_lines_order_product_unique" UNIQUE("order_id","product_id"),
	CONSTRAINT "order_lines_order_position_unique" UNIQUE("order_id","position"),
	CONSTRAINT "order_lines_position_range" CHECK ("order_lines"."position" between 1 and 50),
	CONSTRAINT "order_lines_quantity_positive" CHECK ("order_lines"."quantity" > 0),
	CONSTRAINT "order_lines_unit_price_positive" CHECK ("order_lines"."unit_price" > 0),
	CONSTRAINT "order_lines_line_total_positive" CHECK ("order_lines"."line_total" > 0),
	CONSTRAINT "order_lines_currency_format" CHECK ("order_lines"."currency" ~ '^[A-Z]{3}$')
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"number" bigint NOT NULL,
	"client_id" uuid NOT NULL,
	"currency" text NOT NULL,
	"total" numeric(14, 2) NOT NULL,
	"status" "order_status" DEFAULT 'pending' NOT NULL,
	"confirmed_at" timestamp with time zone,
	"delivered_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "orders_organization_number_unique" UNIQUE("organization_id","number"),
	CONSTRAINT "orders_organization_id_id_unique" UNIQUE("organization_id","id"),
	CONSTRAINT "orders_number_positive" CHECK ("orders"."number" > 0),
	CONSTRAINT "orders_total_positive" CHECK ("orders"."total" > 0),
	CONSTRAINT "orders_currency_format" CHECK ("orders"."currency" ~ '^[A-Z]{3}$'),
	CONSTRAINT "orders_status_dates" CHECK (("orders"."delivered_at" is not null) = ("orders"."status" = 'delivered')
        and ("orders"."cancelled_at" is not null) = ("orders"."status" = 'cancelled')
        and ("orders"."status" not in ('confirmed', 'delivered') or "orders"."confirmed_at" is not null)
        and ("orders"."status" <> 'pending' or "orders"."confirmed_at" is null))
);
--> statement-breakpoint
ALTER TABLE "document_counters" ADD CONSTRAINT "document_counters_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_lines" ADD CONSTRAINT "order_lines_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_lines" ADD CONSTRAINT "order_lines_order_fk" FOREIGN KEY ("organization_id","order_id") REFERENCES "public"."orders"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_lines" ADD CONSTRAINT "order_lines_product_fk" FOREIGN KEY ("organization_id","product_id") REFERENCES "public"."products"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_client_fk" FOREIGN KEY ("organization_id","client_id") REFERENCES "public"."clients"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "orders_list_idx" ON "orders" USING btree ("organization_id","created_at" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "orders_client_idx" ON "orders" USING btree ("organization_id","client_id","created_at" DESC NULLS LAST);--> statement-breakpoint
-- Escrito a mano (brief-19.2; ADR 0020, puntos 2 y 3; ADR 0013).
--
-- document_counters: crm_app lee, crea la fila y la incrementa, nunca la borra (D-2).
GRANT SELECT, INSERT, UPDATE ON TABLE document_counters TO crm_app;--> statement-breakpoint
-- orders: se actualiza su estado, nunca se borra. order_lines: de solo inserción.
GRANT SELECT, INSERT, UPDATE ON TABLE orders TO crm_app;--> statement-breakpoint
GRANT SELECT, INSERT ON TABLE order_lines TO crm_app;--> statement-breakpoint
-- Segunda defensa del contador, para cualquier rol. SQLSTATE P0001, distinto de 42501: nace en 0,
-- no se borra, no cambia de organización ni de tipo, y cada UPDATE suma exactamente 1. Un contador
-- que retrocede repetiría números (brief-19.2, D-2).
CREATE FUNCTION document_counters_guard_change() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'document_counters no se borra';
  END IF;
  IF TG_OP = 'INSERT' THEN
    IF NEW.last_number <> 0 THEN
      RAISE EXCEPTION 'document_counters nace en 0';
    END IF;
    RETURN NEW;
  END IF;
  IF NEW.organization_id IS DISTINCT FROM OLD.organization_id
     OR NEW.kind IS DISTINCT FROM OLD.kind
     OR NEW.last_number IS DISTINCT FROM OLD.last_number + 1 THEN
    RAISE EXCEPTION 'document_counters solo suma 1 a su último número';
  END IF;
  RETURN NEW;
END
$$;--> statement-breakpoint
CREATE TRIGGER document_counters_guard
BEFORE INSERT OR UPDATE OR DELETE ON document_counters
FOR EACH ROW EXECUTE FUNCTION document_counters_guard_change();--> statement-breakpoint
-- La cabecera del pedido (ADR 0020, puntos 3 y 4): nace pendiente y sin fechas de estado, no se
-- borra, y un UPDATE solo cambia las columnas de la lista permitida. La lista es de columnas
-- permitidas, no prohibidas: una columna que se agregue después queda fija sin tocar este trigger.
-- El estado solo cambia por las transiciones de la tabla del punto 4, y una fecha puesta no cambia.
CREATE FUNCTION orders_guard_change() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  mutable text[] := ARRAY['status', 'confirmed_at', 'delivered_at', 'cancelled_at', 'updated_at'];
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'orders no se borra';
  END IF;
  IF TG_OP = 'INSERT' THEN
    IF NEW.status <> 'pending' OR NEW.confirmed_at IS NOT NULL
       OR NEW.delivered_at IS NOT NULL OR NEW.cancelled_at IS NOT NULL THEN
      RAISE EXCEPTION 'un pedido nace pendiente';
    END IF;
    RETURN NEW;
  END IF;
  IF (to_jsonb(NEW) - mutable) IS DISTINCT FROM (to_jsonb(OLD) - mutable) THEN
    RAISE EXCEPTION 'orders: solo cambian el estado y sus fechas';
  END IF;
  IF NEW.status IS DISTINCT FROM OLD.status
     AND (OLD.status, NEW.status) NOT IN (
       ('pending'::order_status, 'confirmed'::order_status),
       ('pending'::order_status, 'cancelled'::order_status),
       ('confirmed'::order_status, 'cancelled'::order_status),
       ('confirmed'::order_status, 'delivered'::order_status)
     ) THEN
    RAISE EXCEPTION 'orders: transición % -> % no permitida', OLD.status, NEW.status;
  END IF;
  IF (OLD.confirmed_at IS NOT NULL AND NEW.confirmed_at IS DISTINCT FROM OLD.confirmed_at)
     OR (OLD.delivered_at IS NOT NULL AND NEW.delivered_at IS DISTINCT FROM OLD.delivered_at)
     OR (OLD.cancelled_at IS NOT NULL AND NEW.cancelled_at IS DISTINCT FROM OLD.cancelled_at) THEN
    RAISE EXCEPTION 'orders: una fecha de estado no cambia';
  END IF;
  -- confirmed_at solo se pone al confirmar. El CHECK ata delivered_at y cancelled_at a su estado,
  -- pero no puede atar confirmed_at: un cancelado pudo pasar o no por confirmed (revisión
  -- independiente de la 19.2, R-1).
  IF OLD.confirmed_at IS NULL AND NEW.confirmed_at IS NOT NULL
     AND NOT (OLD.status = 'pending' AND NEW.status = 'confirmed') THEN
    RAISE EXCEPTION 'orders: confirmed_at solo se pone al confirmar';
  END IF;
  RETURN NEW;
END
$$;--> statement-breakpoint
CREATE TRIGGER orders_guard
BEFORE INSERT OR UPDATE OR DELETE ON orders
FOR EACH ROW EXECUTE FUNCTION orders_guard_change();--> statement-breakpoint
-- Las líneas, de solo inserción, como product_prices en la 0017.
CREATE FUNCTION order_lines_reject_change() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'order_lines es de solo inserción: % rechazado', TG_OP;
END
$$;--> statement-breakpoint
CREATE TRIGGER order_lines_insert_only
BEFORE UPDATE OR DELETE ON order_lines
FOR EACH ROW EXECUTE FUNCTION order_lines_reject_change();

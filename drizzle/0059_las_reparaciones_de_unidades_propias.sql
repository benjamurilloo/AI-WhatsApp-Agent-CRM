ALTER TYPE "public"."inventory_movement_type" ADD VALUE 'unit_to_repair';--> statement-breakpoint
ALTER TYPE "public"."inventory_movement_type" ADD VALUE 'unit_released';--> statement-breakpoint
ALTER TYPE "public"."stock_unit_status" ADD VALUE 'in_repair';--> statement-breakpoint
ALTER TYPE "public"."stock_unit_status" ADD VALUE 'in_review';--> statement-breakpoint
ALTER TYPE "public"."service_order_kind" ADD VALUE 'own_unit';--> statement-breakpoint
ALTER TABLE "service_orders" DROP CONSTRAINT "service_orders_quote_together";--> statement-breakpoint
ALTER TABLE "service_orders" DROP CONSTRAINT "service_orders_dates_chain";--> statement-breakpoint
ALTER TABLE "service_order_lines" ALTER COLUMN "price" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "service_orders" ALTER COLUMN "client_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "service_orders" ADD COLUMN "unit_id" uuid;--> statement-breakpoint
ALTER TABLE "service_orders" ADD CONSTRAINT "service_orders_unit_fk" FOREIGN KEY ("organization_id","unit_id") REFERENCES "public"."stock_units"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "service_orders_unit_idx" ON "service_orders" USING btree ("organization_id","unit_id","created_at" DESC NULLS LAST) WHERE "service_orders"."unit_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "service_orders_unit_open_unique" ON "service_orders" USING btree ("organization_id","unit_id") WHERE "service_orders"."unit_id" is not null and "service_orders"."status" = 'sent';--> statement-breakpoint
ALTER TABLE "service_orders" ADD CONSTRAINT "service_orders_kind_subject" CHECK (("service_orders"."kind" = 'customer_device') = ("service_orders"."client_id" is not null)
        and ("service_orders"."kind" = 'customer_device') = ("service_orders"."unit_id" is null)
        and ("service_orders"."kind" = 'customer_device' or "service_orders"."device_serial" is null));--> statement-breakpoint
ALTER TABLE "service_orders" ADD CONSTRAINT "service_orders_own_unit_path" CHECK ("service_orders"."kind" = 'customer_device'
        or ("service_orders"."quoted_at" is null and "service_orders"."delivered_at" is null and "service_orders"."sale_id" is null));--> statement-breakpoint
ALTER TABLE "service_orders" ADD CONSTRAINT "service_orders_quote_together" CHECK (("service_orders"."quoted_at" is not null) = ("service_orders"."customer_currency" is not null)
        and ("service_orders"."quoted_at" is not null) = ("service_orders"."customer_total" is not null)
        and ("service_orders"."technician_currency" is not null) = ("service_orders"."technician_total" is not null)
        and ("service_orders"."technician_total" is not null) = case when "service_orders"."kind" = 'customer_device'
          then "service_orders"."quoted_at" is not null else "service_orders"."repaired_at" is not null end);--> statement-breakpoint
ALTER TABLE "service_orders" ADD CONSTRAINT "service_orders_dates_chain" CHECK (("service_orders"."quoted_at" is null or "service_orders"."sent_at" is not null)
        and ("service_orders"."approved_at" is null or "service_orders"."quoted_at" is not null)
        and ("service_orders"."rejected_at" is null or "service_orders"."quoted_at" is not null)
        and ("service_orders"."approved_at" is null or "service_orders"."rejected_at" is null)
        and ("service_orders"."repaired_at" is null or "service_orders"."sent_at" is not null)
        and ("service_orders"."repaired_at" is null or "service_orders"."approved_at" is not null or "service_orders"."kind" <> 'customer_device'));--> statement-breakpoint
-- Las reparaciones de unidades propias (brief-29.6.2, D-1, D-3 y D-9). Ningún CHECK, índice, trigger
-- ni dato de esta migración nombra como enum los valores que agrega arriba (unit_to_repair,
-- unit_released, in_repair, in_review, own_unit): scripts/migrar.ts aplica las pendientes en una
-- transacción, y PostgreSQL no deja usar en ella un valor recién agregado a un enum. Los CHECK nombran
-- solo customer_device, y las funciones comparan como texto.
--
-- La unidad (D-1): además de las transiciones de la 29.5.2, available -> in_repair e in_review ->
-- in_repair (mandarla a reparar), in_repair -> in_review (volver de reparación, o cancelar la orden),
-- in_review -> available (liberarla) e in_review -> written_off (la baja, U-2). El costo cambia solo al
-- volver de reparación, y solo sube: es lo que cobró el técnico (D-2). Su moneda no cambia nunca.
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
       ('sold', 'available'),
       ('available', 'in_repair'),
       ('in_review', 'in_repair'),
       ('in_repair', 'in_review'),
       ('in_review', 'available'),
       ('in_review', 'written_off')
     ) THEN
    RAISE EXCEPTION 'stock_units: transición % -> % no permitida', OLD.status, NEW.status;
  END IF;
  IF NEW.cost_currency IS DISTINCT FROM OLD.cost_currency THEN
    RAISE EXCEPTION 'stock_units: la moneda del costo no cambia';
  END IF;
  IF NEW.cost IS DISTINCT FROM OLD.cost
     AND NOT (OLD.status::text = 'in_repair' AND NEW.status::text = 'in_review'
              AND NEW.cost > OLD.cost) THEN
    RAISE EXCEPTION 'stock_units: el costo solo sube al volver de reparación';
  END IF;
  RETURN NEW;
END
$$;--> statement-breakpoint
-- La orden (D-3): la del equipo de un cliente sigue igual que en la 0058. La de una unidad propia nace
-- mandada al técnico, con qué hay que reparar, y pasa a reparada, que es final y fija lo que cobró el
-- técnico, o a cancelada. El tipo y la unidad no cambian: no están en ninguna lista de columnas que
-- fija una transición. El vaciado de datos de un cliente toca solo las órdenes de un cliente.
CREATE OR REPLACE FUNCTION service_orders_guard_change() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  fixed text[];
  vaciada service_orders;
  column_name text;
  own boolean;
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'service_orders no se borra';
  END IF;
  IF TG_OP = 'INSERT' THEN
    IF NEW.kind::text = 'own_unit' THEN
      -- Los CHECK no impiden que nazca con la reparación hecha (revisión independiente de la
      -- 29.6.2, hallazgo 1): repaired_at arrastra el costo del técnico, que la cuenta le debería.
      IF NEW.status::text <> 'sent' OR NEW.reported_issue IS NULL
        OR NEW.repaired_at IS NOT NULL OR NEW.technician_total IS NOT NULL THEN
        RAISE EXCEPTION 'una orden de una unidad propia nace mandada al técnico y con qué hay que reparar';
      END IF;
    ELSIF NEW.status::text <> 'received' OR NEW.reported_issue IS NULL THEN
      RAISE EXCEPTION 'una orden de servicio nace recibida y con lo que reporta el cliente';
    END IF;
    RETURN NEW;
  END IF;
  own := OLD.kind::text = 'own_unit';
  IF NOT own THEN
    vaciada := OLD;
    vaciada.device_serial := NULL;
    vaciada.reported_issue := NULL;
    vaciada.updated_at := NEW.updated_at;
    IF NEW IS NOT DISTINCT FROM vaciada THEN
      RETURN NEW;
    END IF;
  END IF;
  IF NEW.status = OLD.status THEN
    IF (to_jsonb(NEW) - 'updated_at') IS DISTINCT FROM (to_jsonb(OLD) - 'updated_at') THEN
      RAISE EXCEPTION 'service_orders: sin cambio de estado no cambia nada';
    END IF;
    RETURN NEW;
  END IF;
  fixed := CASE
    WHEN own AND OLD.status::text = 'sent' AND NEW.status::text = 'repaired' THEN
      ARRAY['technician_currency', 'technician_total', 'repaired_at']
    WHEN own AND OLD.status::text = 'sent' AND NEW.status::text = 'cancelled' THEN
      ARRAY['cancelled_at', 'cancel_reason']
    WHEN own THEN NULL
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
-- Las líneas (D-3), de solo inserción. En la orden de un cliente, con precio y con la orden quoted; en
-- la de una unidad propia, sin precio y con la orden repaired, que el servicio marca antes de
-- insertarlas en la misma transacción. Lo que suman no pasa los totales de la orden, así que una vez
-- completas no entra otra línea.
CREATE OR REPLACE FUNCTION service_order_lines_guard_change() RETURNS trigger
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
  IF NOT FOUND THEN
    RAISE EXCEPTION 'service_order_lines: las líneas se insertan con el presupuesto';
  END IF;
  IF parent.kind::text = 'own_unit' THEN
    IF parent.status::text <> 'repaired' THEN
      RAISE EXCEPTION 'service_order_lines: las líneas de una unidad propia se insertan al repararla';
    END IF;
    IF NEW.price IS NOT NULL THEN
      RAISE EXCEPTION 'service_order_lines: una unidad propia no tiene precio al cliente';
    END IF;
  ELSE
    IF parent.status <> 'quoted' THEN
      RAISE EXCEPTION 'service_order_lines: las líneas se insertan con el presupuesto';
    END IF;
    IF NEW.price IS NULL THEN
      RAISE EXCEPTION 'service_order_lines: la línea de un equipo de cliente tiene precio';
    END IF;
  END IF;
  SELECT coalesce(sum(l.price), 0), coalesce(sum(l.cost), 0) INTO price_sum, cost_sum
  FROM service_order_lines l
  WHERE l.organization_id = NEW.organization_id AND l.service_order_id = NEW.service_order_id;
  IF (NEW.price IS NOT NULL AND price_sum + NEW.price > parent.customer_total)
     OR cost_sum + NEW.cost > parent.technician_total THEN
    RAISE EXCEPTION 'service_order_lines: las líneas pasan los totales del presupuesto';
  END IF;
  RETURN NEW;
END
$$;

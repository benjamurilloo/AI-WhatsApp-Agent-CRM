ALTER TYPE "public"."service_order_cancel_reason" ADD VALUE 'not_covered';--> statement-breakpoint
ALTER TYPE "public"."service_order_kind" ADD VALUE 'warranty_claim';--> statement-breakpoint
ALTER TABLE "service_orders" DROP CONSTRAINT "service_orders_own_unit_path";--> statement-breakpoint
ALTER TABLE "service_orders" DROP CONSTRAINT "service_orders_kind_subject";--> statement-breakpoint
ALTER TABLE "service_orders" DROP CONSTRAINT "service_orders_quote_together";--> statement-breakpoint
ALTER TABLE "service_orders" DROP CONSTRAINT "service_orders_sale_delivered";--> statement-breakpoint
ALTER TABLE "service_orders" ADD COLUMN "claim_unit_id" uuid;--> statement-breakpoint
ALTER TABLE "service_orders" ADD COLUMN "claim_service_order_id" uuid;--> statement-breakpoint
ALTER TABLE "service_orders" ADD CONSTRAINT "service_orders_claim_unit_fk" FOREIGN KEY ("organization_id","claim_unit_id") REFERENCES "public"."stock_units"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_orders" ADD CONSTRAINT "service_orders_claim_order_fk" FOREIGN KEY ("organization_id","claim_service_order_id") REFERENCES "public"."service_orders"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "service_orders_claim_unit_idx" ON "service_orders" USING btree ("organization_id","claim_unit_id","created_at" DESC NULLS LAST) WHERE "service_orders"."claim_unit_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "service_orders_claim_unit_open_unique" ON "service_orders" USING btree ("organization_id","claim_unit_id") WHERE "service_orders"."claim_unit_id" is not null and "service_orders"."status" in ('received', 'sent', 'repaired');--> statement-breakpoint
CREATE INDEX "service_orders_claim_order_idx" ON "service_orders" USING btree ("organization_id","claim_service_order_id","created_at" DESC NULLS LAST) WHERE "service_orders"."claim_service_order_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "service_orders_claim_order_open_unique" ON "service_orders" USING btree ("organization_id","claim_service_order_id") WHERE "service_orders"."claim_service_order_id" is not null and "service_orders"."status" in ('received', 'sent', 'repaired');--> statement-breakpoint
ALTER TABLE "service_orders" ADD CONSTRAINT "service_orders_unquoted_path" CHECK ("service_orders"."kind" = 'customer_device'
        or ("service_orders"."quoted_at" is null and "service_orders"."sale_id" is null
          and ("service_orders"."kind"::text <> 'own_unit' or "service_orders"."delivered_at" is null)));--> statement-breakpoint
ALTER TABLE "service_orders" ADD CONSTRAINT "service_orders_not_covered_claim" CHECK ("service_orders"."cancel_reason" is null or "service_orders"."cancel_reason"::text <> 'not_covered' or "service_orders"."kind"::text = 'warranty_claim');--> statement-breakpoint
ALTER TABLE "service_orders" ADD CONSTRAINT "service_orders_kind_subject" CHECK (("service_orders"."kind"::text = 'own_unit') = ("service_orders"."unit_id" is not null)
        and ("service_orders"."kind"::text = 'own_unit') = ("service_orders"."client_id" is null)
        and ("service_orders"."kind"::text <> 'own_unit' or "service_orders"."device_serial" is null)
        and ("service_orders"."kind"::text = 'warranty_claim') = ("service_orders"."claim_unit_id" is not null or "service_orders"."claim_service_order_id" is not null)
        and ("service_orders"."claim_unit_id" is null or "service_orders"."claim_service_order_id" is null));--> statement-breakpoint
ALTER TABLE "service_orders" ADD CONSTRAINT "service_orders_quote_together" CHECK (("service_orders"."quoted_at" is not null) = ("service_orders"."customer_currency" is not null)
        and ("service_orders"."quoted_at" is not null) = ("service_orders"."customer_total" is not null)
        and ("service_orders"."technician_currency" is not null) = ("service_orders"."technician_total" is not null)
        and case "service_orders"."kind"::text
          when 'customer_device' then ("service_orders"."technician_total" is not null) = ("service_orders"."quoted_at" is not null)
          when 'own_unit' then ("service_orders"."technician_total" is not null) = ("service_orders"."repaired_at" is not null)
          else "service_orders"."technician_total" is null or "service_orders"."repaired_at" is not null
        end);--> statement-breakpoint
ALTER TABLE "service_orders" ADD CONSTRAINT "service_orders_sale_delivered" CHECK (("service_orders"."sale_id" is not null) = ("service_orders"."kind" = 'customer_device' and "service_orders"."status" = 'delivered' and "service_orders"."repaired_at" is not null));--> statement-breakpoint
-- El reclamo de garantía (brief-29.9.2, D-1 a D-3). Ningún CHECK, índice ni trigger de esta migración
-- nombra como enum un valor agregado con ALTER TYPE (own_unit en la 0059; warranty_claim y not_covered
-- arriba): scripts/migrar.ts aplica las pendientes en una transacción, y en una base nueva son todas.
-- Se comparan como texto (H-8). Ninguna orden existente cambia: los CHECK nuevos valen para todas las
-- de antes, que no tienen reclamo (lo prueba tests/integration/migration-0064.test.ts).
--
-- La orden (D-2 y D-3): la de un cliente y la de una unidad propia siguen igual que en la 0059. El
-- reclamo nace recibido, con lo que reporta el cliente; received -> sent fija el técnico; sent ->
-- repaired fija lo que cobró el técnico, o nada si lo hizo sin cargo (U-2); repaired -> delivered, sin
-- venta; y cancelled desde received o sent. El tipo, el cliente, el IMEI y el equipo original no están
-- en ninguna lista de columnas que fija una transición: no cambian. El vaciado de datos de un cliente
-- alcanza también a sus reclamos.
CREATE OR REPLACE FUNCTION service_orders_guard_change() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  fixed text[];
  vaciada service_orders;
  column_name text;
  own boolean;
  claim boolean;
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
  claim := OLD.kind::text = 'warranty_claim';
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
    WHEN claim AND OLD.status::text = 'received' AND NEW.status::text = 'sent' THEN
      ARRAY['technician_id', 'sent_at']
    WHEN claim AND OLD.status::text = 'sent' AND NEW.status::text = 'repaired' THEN
      ARRAY['technician_currency', 'technician_total', 'repaired_at']
    WHEN claim AND OLD.status::text = 'repaired' AND NEW.status::text = 'delivered' THEN
      ARRAY['delivered_at']
    WHEN claim AND OLD.status::text IN ('received', 'sent') AND NEW.status::text = 'cancelled' THEN
      ARRAY['cancelled_at', 'cancel_reason']
    WHEN claim THEN NULL
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
-- Las líneas (D-2): las de un reclamo, como las de una unidad propia, sin precio y con la orden
-- repaired. Un reclamo sin cargo no tiene total del técnico, y entonces ninguna línea: sin esta regla,
-- la suma contra un total null no rechazaría nada.
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
  ELSIF parent.kind::text = 'warranty_claim' THEN
    IF parent.status::text <> 'repaired' THEN
      RAISE EXCEPTION 'service_order_lines: las líneas de un reclamo se insertan al repararlo';
    END IF;
    IF NEW.price IS NOT NULL THEN
      RAISE EXCEPTION 'service_order_lines: un reclamo no tiene precio al cliente';
    END IF;
  ELSE
    IF parent.status <> 'quoted' THEN
      RAISE EXCEPTION 'service_order_lines: las líneas se insertan con el presupuesto';
    END IF;
    IF NEW.price IS NULL THEN
      RAISE EXCEPTION 'service_order_lines: la línea de un equipo de cliente tiene precio';
    END IF;
  END IF;
  IF parent.technician_total IS NULL THEN
    RAISE EXCEPTION 'service_order_lines: una orden sin costo del técnico no tiene líneas';
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

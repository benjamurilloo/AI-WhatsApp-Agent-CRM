CREATE TYPE "public"."trade_in_destination" AS ENUM('sale_credit', 'purchase');--> statement-breakpoint
CREATE TYPE "public"."trade_in_void_reason" AS ENUM('entered_by_mistake', 'customer_withdrew', 'other');--> statement-breakpoint
ALTER TYPE "public"."audit_entity_type" ADD VALUE 'trade_in';--> statement-breakpoint
ALTER TYPE "public"."audit_entity_type" ADD VALUE 'trade_in_checklist_item';--> statement-breakpoint
ALTER TYPE "public"."inventory_movement_type" ADD VALUE 'unit_written_off';--> statement-breakpoint
ALTER TYPE "public"."stock_unit_origin" ADD VALUE 'trade_in';--> statement-breakpoint
ALTER TYPE "public"."document_kind" ADD VALUE 'trade_in';--> statement-breakpoint
ALTER TYPE "public"."document_kind" ADD VALUE 'trade_in_void';--> statement-breakpoint
ALTER TYPE "public"."capability" ADD VALUE 'trade_ins';--> statement-breakpoint
CREATE TABLE "trade_in_checklist_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"name" text NOT NULL,
	"is_mandatory" boolean DEFAULT false NOT NULL,
	"position" smallint DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"is_example" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "trade_in_checklist_items_organization_id_id_unique" UNIQUE("organization_id","id"),
	CONSTRAINT "trade_in_checklist_items_name_length" CHECK (char_length("trade_in_checklist_items"."name") between 1 and 80 and "trade_in_checklist_items"."name" = btrim("trade_in_checklist_items"."name")),
	CONSTRAINT "trade_in_checklist_items_position_range" CHECK ("trade_in_checklist_items"."position" >= 0)
);
--> statement-breakpoint
CREATE TABLE "trade_in_checklist_results" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"trade_in_id" uuid NOT NULL,
	"checklist_item_id" uuid NOT NULL,
	"position" smallint NOT NULL,
	"item_name" text NOT NULL,
	"was_mandatory" boolean NOT NULL,
	"passed" boolean NOT NULL,
	CONSTRAINT "trade_in_checklist_results_trade_in_item_unique" UNIQUE("trade_in_id","checklist_item_id"),
	CONSTRAINT "trade_in_checklist_results_trade_in_position_unique" UNIQUE("trade_in_id","position"),
	CONSTRAINT "trade_in_checklist_results_position_range" CHECK ("trade_in_checklist_results"."position" between 1 and 40),
	CONSTRAINT "trade_in_checklist_results_item_name_length" CHECK (char_length("trade_in_checklist_results"."item_name") between 1 and 80),
	CONSTRAINT "trade_in_checklist_results_mandatory_passed" CHECK (not "trade_in_checklist_results"."was_mandatory" or "trade_in_checklist_results"."passed")
);
--> statement-breakpoint
CREATE TABLE "trade_in_voids" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"number" bigint NOT NULL,
	"trade_in_id" uuid NOT NULL,
	"reason" "trade_in_void_reason" NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
	CONSTRAINT "trade_in_voids_organization_number_unique" UNIQUE("organization_id","number"),
	CONSTRAINT "trade_in_voids_trade_in_unique" UNIQUE("trade_in_id"),
	CONSTRAINT "trade_in_voids_number_positive" CHECK ("trade_in_voids"."number" > 0)
);
--> statement-breakpoint
CREATE TABLE "trade_ins" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"number" bigint NOT NULL,
	"client_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"unit_id" uuid NOT NULL,
	"serial" text NOT NULL,
	"battery_health" smallint NOT NULL,
	"grade_id" uuid NOT NULL,
	"value" numeric(14, 2) NOT NULL,
	"currency" text NOT NULL,
	"destination" "trade_in_destination" NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
	CONSTRAINT "trade_ins_organization_number_unique" UNIQUE("organization_id","number"),
	CONSTRAINT "trade_ins_organization_id_id_unique" UNIQUE("organization_id","id"),
	CONSTRAINT "trade_ins_unit_unique" UNIQUE("unit_id"),
	CONSTRAINT "trade_ins_number_positive" CHECK ("trade_ins"."number" > 0),
	CONSTRAINT "trade_ins_serial_format" CHECK ("trade_ins"."serial" ~ '^[A-Za-z0-9][A-Za-z0-9-]{0,31}$'),
	CONSTRAINT "trade_ins_battery_health_range" CHECK ("trade_ins"."battery_health" between 0 and 100),
	CONSTRAINT "trade_ins_value_positive" CHECK ("trade_ins"."value" > 0),
	CONSTRAINT "trade_ins_currency_format" CHECK ("trade_ins"."currency" ~ '^[A-Z]{3}$')
);
--> statement-breakpoint
DROP INDEX "stock_units_organization_serial_lower_unique";--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "document_number" text;--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "instagram" text;--> statement-breakpoint
ALTER TABLE "trade_in_checklist_items" ADD CONSTRAINT "trade_in_checklist_items_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trade_in_checklist_results" ADD CONSTRAINT "trade_in_checklist_results_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trade_in_checklist_results" ADD CONSTRAINT "trade_in_checklist_results_trade_in_fk" FOREIGN KEY ("organization_id","trade_in_id") REFERENCES "public"."trade_ins"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trade_in_checklist_results" ADD CONSTRAINT "trade_in_checklist_results_item_fk" FOREIGN KEY ("organization_id","checklist_item_id") REFERENCES "public"."trade_in_checklist_items"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trade_in_voids" ADD CONSTRAINT "trade_in_voids_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trade_in_voids" ADD CONSTRAINT "trade_in_voids_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trade_in_voids" ADD CONSTRAINT "trade_in_voids_trade_in_fk" FOREIGN KEY ("organization_id","trade_in_id") REFERENCES "public"."trade_ins"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trade_ins" ADD CONSTRAINT "trade_ins_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trade_ins" ADD CONSTRAINT "trade_ins_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trade_ins" ADD CONSTRAINT "trade_ins_client_fk" FOREIGN KEY ("organization_id","client_id") REFERENCES "public"."clients"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trade_ins" ADD CONSTRAINT "trade_ins_product_fk" FOREIGN KEY ("organization_id","product_id") REFERENCES "public"."products"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trade_ins" ADD CONSTRAINT "trade_ins_unit_fk" FOREIGN KEY ("organization_id","unit_id") REFERENCES "public"."stock_units"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trade_ins" ADD CONSTRAINT "trade_ins_grade_fk" FOREIGN KEY ("organization_id","grade_id") REFERENCES "public"."unit_grades"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "trade_in_checklist_items_organization_name_lower_unique" ON "trade_in_checklist_items" USING btree ("organization_id",lower("name"));--> statement-breakpoint
CREATE INDEX "trade_ins_list_idx" ON "trade_ins" USING btree ("organization_id","created_at" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "trade_ins_client_idx" ON "trade_ins" USING btree ("organization_id","client_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "trade_ins_serial_idx" ON "trade_ins" USING btree ("organization_id",lower("serial"));--> statement-breakpoint
CREATE UNIQUE INDEX "stock_units_organization_serial_lower_unique" ON "stock_units" USING btree ("organization_id",lower("serial")) WHERE "stock_units"."status" not in ('written_off', 'sold');--> statement-breakpoint
ALTER TABLE "clients" ADD CONSTRAINT "clients_document_number_format" CHECK ("clients"."document_number" ~ '^[0-9]{7,8}$');--> statement-breakpoint
ALTER TABLE "clients" ADD CONSTRAINT "clients_instagram_format" CHECK ("clients"."instagram" ~ '^[A-Za-z0-9._]{1,30}$');--> statement-breakpoint
-- La recepción de usados (brief-29.7, D-2 a D-6 y D-9). Ningún CHECK, índice, trigger ni dato de esta
-- migración nombra como enum los valores que agrega arriba con ALTER TYPE (trade_ins, trade_in,
-- trade_in_void, trade_in_checklist_item, unit_written_off): scripts/migrar.ts aplica las pendientes en
-- una transacción, y PostgreSQL no deja usar en ella un valor recién agregado a un enum que ya existía.
-- Las funciones comparan como texto. Los enums nuevos de esta migración (trade_in_destination y
-- trade_in_void_reason) sí se pueden nombrar.
--
-- El índice único del IMEI (U-2), recreado arriba, deja afuera también las vendidas: un equipo que el
-- local vendió puede volver como usado. Las unidades que ya existen no lo violan: el predicado nuevo
-- incluye menos filas que el viejo.
--
-- La unidad (D-2): las transiciones y el costo siguen como en la 0059. Al nacer, la de un usado nace en
-- revisión, con su comprobante como origen, su grado y su batería, y sin precio propio; las demás
-- nacen disponibles, como hasta ahora.
CREATE OR REPLACE FUNCTION stock_units_guard_change() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'stock_units no se borra: una unidad se da de baja';
  END IF;
  IF TG_OP = 'INSERT' THEN
    IF NEW.origin_type::text = 'trade_in' THEN
      IF NEW.status::text <> 'in_review' OR NEW.origin_id IS NULL OR NEW.grade_id IS NULL
         OR NEW.battery_health IS NULL OR NEW.price IS NOT NULL THEN
        RAISE EXCEPTION 'stock_units: la unidad de un usado nace en revisión, con su comprobante, su grado y su batería, y sin precio';
      END IF;
    ELSIF NEW.status::text <> 'available' THEN
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
-- Las tablas de usados son de solo inserción, salvo los puntos del checklist, que se editan y se
-- desactivan (D-3). crm_app no tiene UPDATE ni DELETE en ellas, y el trigger lo rechaza para cualquier
-- rol, también el dueño, con el molde de goods_receipts (0049).
CREATE FUNCTION tradeins_reject_change() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION '% es de solo inserción: % rechazado', TG_TABLE_NAME, TG_OP;
END
$$;--> statement-breakpoint
CREATE TRIGGER trade_ins_insert_only
BEFORE UPDATE OR DELETE ON trade_ins
FOR EACH ROW EXECUTE FUNCTION tradeins_reject_change();--> statement-breakpoint
CREATE TRIGGER trade_in_checklist_results_insert_only
BEFORE UPDATE OR DELETE ON trade_in_checklist_results
FOR EACH ROW EXECUTE FUNCTION tradeins_reject_change();--> statement-breakpoint
CREATE TRIGGER trade_in_voids_insert_only
BEFORE UPDATE OR DELETE ON trade_in_voids
FOR EACH ROW EXECUTE FUNCTION tradeins_reject_change();--> statement-breakpoint
-- La recepción y su unidad (D-4): tradeins crea la unidad con registerTradeInUnit y después inserta el
-- comprobante, en la misma transacción. La unidad tiene que ser la del comprobante, en revisión, con su
-- producto, su IMEI, su grado, su batería y el valor como costo; y el producto, usado y llevado por
-- unidad. Si la unidad no existe en la organización, lo rechaza después la clave compuesta.
CREATE FUNCTION trade_ins_check_unit() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  unit stock_units;
BEGIN
  SELECT * INTO unit FROM stock_units u
  WHERE u.organization_id = NEW.organization_id AND u.id = NEW.unit_id;
  IF NOT FOUND THEN
    RETURN NEW;
  END IF;
  IF unit.origin_type::text <> 'trade_in' OR unit.origin_id IS DISTINCT FROM NEW.id
     OR unit.status::text <> 'in_review' OR unit.product_id <> NEW.product_id
     OR unit.serial <> NEW.serial OR unit.grade_id IS DISTINCT FROM NEW.grade_id
     OR unit.battery_health IS DISTINCT FROM NEW.battery_health
     OR unit.cost <> NEW.value OR unit.cost_currency <> NEW.currency THEN
    RAISE EXCEPTION 'trade_ins: la unidad no es la del comprobante %', NEW.number;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM products p
    WHERE p.organization_id = NEW.organization_id AND p.id = NEW.product_id
      AND p.condition = 'used' AND p.tracking = 'unit'
  ) THEN
    RAISE EXCEPTION 'trade_ins: el producto de un usado es usado y se lleva por unidad';
  END IF;
  RETURN NEW;
END
$$;--> statement-breakpoint
CREATE TRIGGER trade_ins_check_unit
BEFORE INSERT ON trade_ins
FOR EACH ROW EXECUTE FUNCTION trade_ins_check_unit();--> statement-breakpoint
-- La anulación (D-5): tradeins da de baja la unidad con writeOffTradeInUnit y después inserta la
-- anulación, en la misma transacción. Un usado anulado tiene su unidad dada de baja.
CREATE FUNCTION trade_in_voids_check_unit() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM trade_ins t
    JOIN stock_units u ON u.organization_id = t.organization_id AND u.id = t.unit_id
    WHERE t.organization_id = NEW.organization_id AND t.id = NEW.trade_in_id
      AND u.status::text = 'written_off'
  ) THEN
    RAISE EXCEPTION 'trade_in_voids: la unidad del usado se da de baja antes de anularlo';
  END IF;
  RETURN NEW;
END
$$;--> statement-breakpoint
CREATE TRIGGER trade_in_voids_check_unit
BEFORE INSERT ON trade_in_voids
FOR EACH ROW EXECUTE FUNCTION trade_in_voids_check_unit();--> statement-breakpoint
-- Permisos de crm_app: el checklist se edita y se desactiva, nunca se borra; lo demás, solo se inserta.
GRANT SELECT, INSERT, UPDATE ON TABLE trade_in_checklist_items TO crm_app;--> statement-breakpoint
GRANT SELECT, INSERT ON TABLE trade_ins TO crm_app;--> statement-breakpoint
GRANT SELECT, INSERT ON TABLE trade_in_checklist_results TO crm_app;--> statement-breakpoint
GRANT SELECT, INSERT ON TABLE trade_in_voids TO crm_app;

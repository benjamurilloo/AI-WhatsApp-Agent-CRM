CREATE TYPE "public"."stock_tracking" AS ENUM('quantity', 'unit');--> statement-breakpoint
CREATE TYPE "public"."stock_unit_origin" AS ENUM('goods_receipt', 'manual');--> statement-breakpoint
CREATE TYPE "public"."stock_unit_status" AS ENUM('available', 'written_off');--> statement-breakpoint
ALTER TYPE "public"."audit_entity_type" ADD VALUE 'stock_unit';--> statement-breakpoint
ALTER TYPE "public"."audit_entity_type" ADD VALUE 'unit_grade';--> statement-breakpoint
ALTER TYPE "public"."product_condition" ADD VALUE 'used';--> statement-breakpoint
ALTER TYPE "public"."capability" ADD VALUE 'serialized_units';--> statement-breakpoint
CREATE TABLE "stock_units" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"serial" text NOT NULL,
	"status" "stock_unit_status" DEFAULT 'available' NOT NULL,
	"grade_id" uuid,
	"battery_health" smallint,
	"cost" numeric(14, 2) NOT NULL,
	"cost_currency" text NOT NULL,
	"origin_type" "stock_unit_origin" NOT NULL,
	"origin_id" uuid,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "stock_units_organization_id_id_unique" UNIQUE("organization_id","id"),
	CONSTRAINT "stock_units_organization_product_id_unique" UNIQUE("organization_id","product_id","id"),
	CONSTRAINT "stock_units_serial_format" CHECK ("stock_units"."serial" ~ '^[A-Za-z0-9][A-Za-z0-9-]{0,31}$'),
	CONSTRAINT "stock_units_battery_health_range" CHECK ("stock_units"."battery_health" between 0 and 100),
	CONSTRAINT "stock_units_cost_positive" CHECK ("stock_units"."cost" > 0),
	CONSTRAINT "stock_units_cost_currency_format" CHECK ("stock_units"."cost_currency" ~ '^[A-Z]{3}$')
);
--> statement-breakpoint
CREATE TABLE "unit_grades" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"position" smallint DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"is_example" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "unit_grades_organization_id_id_unique" UNIQUE("organization_id","id"),
	CONSTRAINT "unit_grades_name_length" CHECK (char_length("unit_grades"."name") between 1 and 40 and "unit_grades"."name" = btrim("unit_grades"."name")),
	CONSTRAINT "unit_grades_description_length" CHECK (char_length("unit_grades"."description") between 1 and 120),
	CONSTRAINT "unit_grades_position_range" CHECK ("unit_grades"."position" >= 0)
);
--> statement-breakpoint
CREATE TABLE "goods_receipt_line_units" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"goods_receipt_line_id" uuid NOT NULL,
	"unit_id" uuid NOT NULL,
	CONSTRAINT "goods_receipt_line_units_unit_unique" UNIQUE("unit_id")
);
--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "tracking" "stock_tracking" DEFAULT 'quantity' NOT NULL;--> statement-breakpoint
ALTER TABLE "inventory_movements" ADD COLUMN "unit_id" uuid;--> statement-breakpoint
ALTER TABLE "stock_units" ADD CONSTRAINT "stock_units_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_units" ADD CONSTRAINT "stock_units_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_units" ADD CONSTRAINT "stock_units_product_fk" FOREIGN KEY ("organization_id","product_id") REFERENCES "public"."products"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_units" ADD CONSTRAINT "stock_units_grade_fk" FOREIGN KEY ("organization_id","grade_id") REFERENCES "public"."unit_grades"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "unit_grades" ADD CONSTRAINT "unit_grades_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goods_receipt_line_units" ADD CONSTRAINT "goods_receipt_line_units_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goods_receipt_lines" ADD CONSTRAINT "goods_receipt_lines_organization_id_id_unique" UNIQUE("organization_id","id");--> statement-breakpoint
ALTER TABLE "goods_receipt_line_units" ADD CONSTRAINT "goods_receipt_line_units_line_fk" FOREIGN KEY ("organization_id","goods_receipt_line_id") REFERENCES "public"."goods_receipt_lines"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goods_receipt_line_units" ADD CONSTRAINT "goods_receipt_line_units_unit_fk" FOREIGN KEY ("organization_id","unit_id") REFERENCES "public"."stock_units"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "stock_units_organization_serial_lower_unique" ON "stock_units" USING btree ("organization_id",lower("serial")) WHERE "stock_units"."status" <> 'written_off';--> statement-breakpoint
CREATE INDEX "stock_units_product_status_idx" ON "stock_units" USING btree ("organization_id","product_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "unit_grades_organization_name_lower_unique" ON "unit_grades" USING btree ("organization_id",lower("name"));--> statement-breakpoint
CREATE INDEX "goods_receipt_line_units_line_idx" ON "goods_receipt_line_units" USING btree ("organization_id","goods_receipt_line_id");--> statement-breakpoint
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_unit_fk" FOREIGN KEY ("organization_id","product_id","unit_id") REFERENCES "public"."stock_units"("organization_id","product_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "inventory_movements_unit_idx" ON "inventory_movements" USING btree ("organization_id","unit_id") WHERE "inventory_movements"."unit_id" is not null;--> statement-breakpoint
-- Las unidades (brief-29.5, D-2). Ningún CHECK, trigger ni dato de esta migración nombra los valores
-- agregados arriba con ALTER TYPE (serialized_units, used, stock_unit, unit_grade): scripts/migrar.ts
-- aplica las pendientes en una transacción, y PostgreSQL no deja usar en ella un valor recién
-- agregado a un enum que ya existía (H-10). Los enums nuevos de esta migración sí se pueden nombrar.
--
-- La unidad: nace disponible, no se borra, y su id, su organización, su producto, su IMEI, su origen,
-- su autor y su alta no cambian. En la 29.5 la única transición es available -> written_off, y una
-- unidad dada de baja ya no cambia. Las transiciones se comparan como texto, para que una subfase que
-- sume un estado solo tenga que cambiar esta función.
CREATE FUNCTION stock_units_guard_change() RETURNS trigger
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
     AND (OLD.status::text, NEW.status::text) NOT IN (('available', 'written_off')) THEN
    RAISE EXCEPTION 'stock_units: transición % -> % no permitida', OLD.status, NEW.status;
  END IF;
  RETURN NEW;
END
$$;--> statement-breakpoint
CREATE TRIGGER stock_units_guard
BEFORE INSERT OR UPDATE OR DELETE ON stock_units
FOR EACH ROW EXECUTE FUNCTION stock_units_guard_change();--> statement-breakpoint
-- Las unidades de cada línea de una recepción, de solo inserción, como goods_receipt_lines (0049).
CREATE FUNCTION goods_receipt_line_units_reject_change() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'goods_receipt_line_units es de solo inserción: % rechazado', TG_OP;
END
$$;--> statement-breakpoint
CREATE TRIGGER goods_receipt_line_units_insert_only
BEFORE UPDATE OR DELETE ON goods_receipt_line_units
FOR EACH ROW EXECUTE FUNCTION goods_receipt_line_units_reject_change();--> statement-breakpoint
-- Permisos de crm_app: la unidad y el grado se editan, nunca se borran (la unidad se da de baja y el
-- grado se desactiva); las unidades de una línea, solo se insertan.
GRANT SELECT, INSERT, UPDATE ON TABLE stock_units TO crm_app;--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON TABLE unit_grades TO crm_app;--> statement-breakpoint
GRANT SELECT, INSERT ON TABLE goods_receipt_line_units TO crm_app;

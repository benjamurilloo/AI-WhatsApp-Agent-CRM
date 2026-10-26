CREATE TYPE "public"."appointment_status" AS ENUM('requested', 'confirmed', 'cancelled', 'attended', 'no_show');--> statement-breakpoint
ALTER TYPE "public"."audit_entity_type" ADD VALUE 'appointment';--> statement-breakpoint
ALTER TYPE "public"."audit_entity_type" ADD VALUE 'appointment_reason';--> statement-breakpoint
ALTER TYPE "public"."audit_entity_type" ADD VALUE 'appointment_settings';--> statement-breakpoint
ALTER TYPE "public"."capability" ADD VALUE 'appointments';--> statement-breakpoint
CREATE TABLE "appointment_reasons" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"name" text NOT NULL,
	"position" smallint DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"is_example" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "appointment_reasons_organization_id_id_unique" UNIQUE("organization_id","id"),
	CONSTRAINT "appointment_reasons_name_length" CHECK (char_length("appointment_reasons"."name") between 1 and 60 and "appointment_reasons"."name" = btrim("appointment_reasons"."name")),
	CONSTRAINT "appointment_reasons_position_range" CHECK ("appointment_reasons"."position" >= 0)
);
--> statement-breakpoint
CREATE TABLE "appointment_settings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"slot_minutes" smallint NOT NULL,
	"capacity" smallint NOT NULL,
	"is_example" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "appointment_settings_organization_unique" UNIQUE("organization_id"),
	CONSTRAINT "appointment_settings_slot_minutes_allowed" CHECK ("appointment_settings"."slot_minutes" in (15, 20, 30, 45, 60, 90, 120)),
	CONSTRAINT "appointment_settings_capacity_range" CHECK ("appointment_settings"."capacity" between 1 and 20)
);
--> statement-breakpoint
CREATE TABLE "appointments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"reason_id" uuid NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"product_id" uuid,
	"unit_id" uuid,
	"note" text,
	"status" "appointment_status" NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"confirmed_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"attended_at" timestamp with time zone,
	"no_show_at" timestamp with time zone,
	CONSTRAINT "appointments_organization_id_id_unique" UNIQUE("organization_id","id"),
	CONSTRAINT "appointments_ends_after_start" CHECK ("appointments"."ends_at" > "appointments"."starts_at" and "appointments"."ends_at" <= "appointments"."starts_at" + interval '120 minutes'),
	CONSTRAINT "appointments_single_reference" CHECK (num_nonnulls("appointments"."product_id", "appointments"."unit_id") <= 1),
	CONSTRAINT "appointments_note_length" CHECK (char_length("appointments"."note") between 1 and 500),
	CONSTRAINT "appointments_status_dates" CHECK (case "appointments"."status"
        when 'requested' then "appointments"."confirmed_at" is null and "appointments"."cancelled_at" is null
          and "appointments"."attended_at" is null and "appointments"."no_show_at" is null
        when 'confirmed' then "appointments"."confirmed_at" is not null and "appointments"."cancelled_at" is null
          and "appointments"."attended_at" is null and "appointments"."no_show_at" is null
        when 'cancelled' then "appointments"."cancelled_at" is not null
          and "appointments"."attended_at" is null and "appointments"."no_show_at" is null
        when 'attended' then "appointments"."confirmed_at" is not null and "appointments"."attended_at" is not null
          and "appointments"."cancelled_at" is null and "appointments"."no_show_at" is null
        when 'no_show' then "appointments"."confirmed_at" is not null and "appointments"."no_show_at" is not null
          and "appointments"."cancelled_at" is null and "appointments"."attended_at" is null
      end)
);
--> statement-breakpoint
ALTER TABLE "appointment_reasons" ADD CONSTRAINT "appointment_reasons_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointment_settings" ADD CONSTRAINT "appointment_settings_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_client_fk" FOREIGN KEY ("organization_id","client_id") REFERENCES "public"."clients"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_reason_fk" FOREIGN KEY ("organization_id","reason_id") REFERENCES "public"."appointment_reasons"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_product_fk" FOREIGN KEY ("organization_id","product_id") REFERENCES "public"."products"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_unit_fk" FOREIGN KEY ("organization_id","unit_id") REFERENCES "public"."stock_units"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "appointment_reasons_organization_name_lower_unique" ON "appointment_reasons" USING btree ("organization_id",lower("name"));--> statement-breakpoint
CREATE INDEX "appointments_starts_idx" ON "appointments" USING btree ("organization_id","starts_at");--> statement-breakpoint
CREATE INDEX "appointments_client_idx" ON "appointments" USING btree ("organization_id","client_id","starts_at" DESC NULLS LAST);--> statement-breakpoint
-- Los turnos (brief-29.10, D-2). Ningún CHECK, índice, trigger ni dato de esta migración nombra los
-- valores que agrega arriba con ALTER TYPE (appointments, appointment, appointment_reason,
-- appointment_settings): scripts/migrar.ts aplica las pendientes en una transacción, y PostgreSQL no deja
-- usar en ella un valor recién agregado a un enum que ya existía. appointment_status nace en esta
-- migración, así que sus valores sí se pueden nombrar; igual se comparan como texto, como en la 0059.
-- Sin datos: los valores y los motivos los crea org:capability con los del perfil.
--
-- El turno (D-2 y D-6): nace pedido (requested, desde la 29.10.2) o confirmado; requested -> confirmed
-- fija confirmed_at; requested o confirmed -> cancelled fija cancelled_at; confirmed -> attended o
-- no_show fija su fecha, y solo cuando el turno ya empezó. El cliente, el motivo, el horario, la
-- referencia y el autor no están en ninguna lista de columnas que fija una transición: no cambian. El
-- vaciado de datos de un cliente deja la nota en nulo, sin cambio de estado, y es el único cambio que
-- pasa sin transición. Un turno no se borra.
CREATE FUNCTION appointments_guard_change() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  fixed text[];
  vaciado appointments;
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'appointments no se borra: un turno se cancela';
  END IF;
  IF TG_OP = 'INSERT' THEN
    IF NEW.status::text NOT IN ('requested', 'confirmed') THEN
      RAISE EXCEPTION 'un turno nace pedido o confirmado';
    END IF;
    RETURN NEW;
  END IF;
  vaciado := OLD;
  vaciado.note := NULL;
  vaciado.updated_at := NEW.updated_at;
  IF NEW IS NOT DISTINCT FROM vaciado THEN
    RETURN NEW;
  END IF;
  IF NEW.status = OLD.status THEN
    RAISE EXCEPTION 'appointments: sin cambio de estado no cambia nada';
  END IF;
  fixed := CASE
    WHEN OLD.status::text = 'requested' AND NEW.status::text = 'confirmed' THEN
      ARRAY['confirmed_at']
    WHEN OLD.status::text IN ('requested', 'confirmed') AND NEW.status::text = 'cancelled' THEN
      ARRAY['cancelled_at']
    WHEN OLD.status::text = 'confirmed' AND NEW.status::text = 'attended' THEN
      ARRAY['attended_at']
    WHEN OLD.status::text = 'confirmed' AND NEW.status::text = 'no_show' THEN
      ARRAY['no_show_at']
  END;
  IF fixed IS NULL THEN
    RAISE EXCEPTION 'appointments: transición % -> % no permitida', OLD.status, NEW.status;
  END IF;
  IF (to_jsonb(NEW) - fixed - 'status' - 'updated_at')
     IS DISTINCT FROM (to_jsonb(OLD) - fixed - 'status' - 'updated_at') THEN
    RAISE EXCEPTION 'appointments: la transición % -> % solo fija %', OLD.status, NEW.status, fixed;
  END IF;
  IF NEW.status::text IN ('attended', 'no_show') AND now() < OLD.starts_at THEN
    RAISE EXCEPTION 'appointments: un turno que no empezó no se marca atendido ni ausente';
  END IF;
  RETURN NEW;
END
$$;--> statement-breakpoint
CREATE TRIGGER appointments_guard_change
BEFORE INSERT OR UPDATE OR DELETE ON appointments
FOR EACH ROW EXECUTE FUNCTION appointments_guard_change();--> statement-breakpoint
-- Permisos de crm_app: los valores y los motivos se editan, y los motivos se desactivan, nunca se borran;
-- los turnos cambian de estado por el trigger, nunca se borran.
GRANT SELECT, INSERT, UPDATE ON TABLE appointment_settings TO crm_app;--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON TABLE appointment_reasons TO crm_app;--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON TABLE appointments TO crm_app;

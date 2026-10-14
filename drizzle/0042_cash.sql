CREATE TYPE "public"."cash_movement_kind" AS ENUM('contribution', 'withdrawal');--> statement-breakpoint
CREATE TYPE "public"."cash_movement_reason" AS ENUM('change_fund', 'owner_contribution', 'bank_deposit', 'owner_withdrawal', 'correction', 'other');--> statement-breakpoint
ALTER TYPE "public"."audit_action" ADD VALUE 'close';--> statement-breakpoint
ALTER TYPE "public"."audit_entity_type" ADD VALUE 'cash_session';--> statement-breakpoint
ALTER TYPE "public"."audit_entity_type" ADD VALUE 'payment_method';--> statement-breakpoint
ALTER TYPE "public"."document_kind" ADD VALUE 'cash_session';--> statement-breakpoint
CREATE TABLE "cash_movements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"session_id" uuid NOT NULL,
	"kind" "cash_movement_kind" NOT NULL,
	"currency" text NOT NULL,
	"amount" numeric(14, 2) NOT NULL,
	"reason" "cash_movement_reason" NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
	CONSTRAINT "cash_movements_amount_positive" CHECK ("cash_movements"."amount" > 0),
	CONSTRAINT "cash_movements_currency_format" CHECK ("cash_movements"."currency" ~ '^[A-Z]{3}$'),
	CONSTRAINT "cash_movements_reason_fits_kind" CHECK (("cash_movements"."kind" = 'contribution' AND "cash_movements"."reason" IN ('change_fund', 'owner_contribution', 'correction', 'other'))
        OR ("cash_movements"."kind" = 'withdrawal' AND "cash_movements"."reason" IN ('bank_deposit', 'owner_withdrawal', 'correction', 'other')))
);
--> statement-breakpoint
CREATE TABLE "cash_session_closing_amounts" (
	"organization_id" uuid NOT NULL,
	"session_id" uuid NOT NULL,
	"currency" text NOT NULL,
	"counted" numeric(14, 2) NOT NULL,
	"expected" numeric(14, 2) NOT NULL,
	CONSTRAINT "cash_session_closing_amounts_pkey" PRIMARY KEY("session_id","currency"),
	CONSTRAINT "cash_session_closing_amounts_counted_non_negative" CHECK ("cash_session_closing_amounts"."counted" >= 0),
	CONSTRAINT "cash_session_closing_amounts_expected_non_negative" CHECK ("cash_session_closing_amounts"."expected" >= 0),
	CONSTRAINT "cash_session_closing_amounts_currency_format" CHECK ("cash_session_closing_amounts"."currency" ~ '^[A-Z]{3}$')
);
--> statement-breakpoint
CREATE TABLE "cash_session_closings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"session_id" uuid NOT NULL,
	"closed_by" uuid NOT NULL,
	"closed_at" timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
	CONSTRAINT "cash_session_closings_session_unique" UNIQUE("session_id")
);
--> statement-breakpoint
CREATE TABLE "cash_session_opening_amounts" (
	"organization_id" uuid NOT NULL,
	"session_id" uuid NOT NULL,
	"currency" text NOT NULL,
	"amount" numeric(14, 2) NOT NULL,
	CONSTRAINT "cash_session_opening_amounts_pkey" PRIMARY KEY("session_id","currency"),
	CONSTRAINT "cash_session_opening_amounts_amount_non_negative" CHECK ("cash_session_opening_amounts"."amount" >= 0),
	CONSTRAINT "cash_session_opening_amounts_currency_format" CHECK ("cash_session_opening_amounts"."currency" ~ '^[A-Z]{3}$')
);
--> statement-breakpoint
CREATE TABLE "cash_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"number" bigint NOT NULL,
	"previous_session_id" uuid,
	"opened_by" uuid NOT NULL,
	"opened_at" timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
	CONSTRAINT "cash_sessions_organization_number_unique" UNIQUE("organization_id","number"),
	CONSTRAINT "cash_sessions_organization_id_id_unique" UNIQUE("organization_id","id"),
	CONSTRAINT "cash_sessions_previous_unique" UNIQUE("previous_session_id"),
	CONSTRAINT "cash_sessions_number_positive" CHECK ("cash_sessions"."number" > 0)
);
--> statement-breakpoint
CREATE TABLE "payment_methods" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"name" text NOT NULL,
	"is_cash" boolean NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payment_methods_organization_id_id_unique" UNIQUE("organization_id","id"),
	CONSTRAINT "payment_methods_name_length" CHECK (char_length("payment_methods"."name") between 1 and 40),
	CONSTRAINT "payment_methods_name_trimmed" CHECK ("payment_methods"."name" = btrim("payment_methods"."name"))
);
--> statement-breakpoint
ALTER TABLE "cash_movements" ADD CONSTRAINT "cash_movements_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cash_movements" ADD CONSTRAINT "cash_movements_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cash_movements" ADD CONSTRAINT "cash_movements_session_fk" FOREIGN KEY ("organization_id","session_id") REFERENCES "public"."cash_sessions"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cash_session_closing_amounts" ADD CONSTRAINT "cash_session_closing_amounts_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cash_session_closing_amounts" ADD CONSTRAINT "cash_session_closing_amounts_session_fk" FOREIGN KEY ("organization_id","session_id") REFERENCES "public"."cash_sessions"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cash_session_closings" ADD CONSTRAINT "cash_session_closings_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cash_session_closings" ADD CONSTRAINT "cash_session_closings_closed_by_users_id_fk" FOREIGN KEY ("closed_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cash_session_closings" ADD CONSTRAINT "cash_session_closings_session_fk" FOREIGN KEY ("organization_id","session_id") REFERENCES "public"."cash_sessions"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cash_session_opening_amounts" ADD CONSTRAINT "cash_session_opening_amounts_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cash_session_opening_amounts" ADD CONSTRAINT "cash_session_opening_amounts_session_fk" FOREIGN KEY ("organization_id","session_id") REFERENCES "public"."cash_sessions"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cash_sessions" ADD CONSTRAINT "cash_sessions_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cash_sessions" ADD CONSTRAINT "cash_sessions_opened_by_users_id_fk" FOREIGN KEY ("opened_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cash_sessions" ADD CONSTRAINT "cash_sessions_previous_fk" FOREIGN KEY ("organization_id","previous_session_id") REFERENCES "public"."cash_sessions"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_methods" ADD CONSTRAINT "payment_methods_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "cash_movements_session_idx" ON "cash_movements" USING btree ("organization_id","session_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "cash_sessions_first_unique" ON "cash_sessions" USING btree ("organization_id") WHERE "cash_sessions"."previous_session_id" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "payment_methods_organization_name_lower_unique" ON "payment_methods" USING btree ("organization_id",lower("name"));--> statement-breakpoint
-- Escrito a mano (brief-21.2; ADR 0022, puntos 8 y 10; ADR 0013).
--
-- Los medios de pago se editan con borrado lógico: SELECT, INSERT y UPDATE, sin DELETE (regla 8).
-- La caja mueve dinero: sus cinco tablas son de solo inserción para crm_app.
GRANT SELECT, INSERT, UPDATE ON TABLE payment_methods TO crm_app;--> statement-breakpoint
GRANT SELECT, INSERT ON TABLE cash_sessions, cash_session_opening_amounts, cash_session_closings, cash_session_closing_amounts, cash_movements TO crm_app;--> statement-breakpoint
-- Propia de cash, para no depender de sales en la base (brief-21.2, H-3): rechaza UPDATE y DELETE
-- para cualquier rol, también el dueño.
CREATE FUNCTION cash_reject_change() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION '% es de solo inserción: % rechazado', TG_TABLE_NAME, TG_OP;
END
$$;--> statement-breakpoint
CREATE TRIGGER cash_sessions_insert_only
BEFORE UPDATE OR DELETE ON cash_sessions
FOR EACH ROW EXECUTE FUNCTION cash_reject_change();--> statement-breakpoint
CREATE TRIGGER cash_session_opening_amounts_insert_only
BEFORE UPDATE OR DELETE ON cash_session_opening_amounts
FOR EACH ROW EXECUTE FUNCTION cash_reject_change();--> statement-breakpoint
CREATE TRIGGER cash_session_closings_insert_only
BEFORE UPDATE OR DELETE ON cash_session_closings
FOR EACH ROW EXECUTE FUNCTION cash_reject_change();--> statement-breakpoint
CREATE TRIGGER cash_session_closing_amounts_insert_only
BEFORE UPDATE OR DELETE ON cash_session_closing_amounts
FOR EACH ROW EXECUTE FUNCTION cash_reject_change();--> statement-breakpoint
CREATE TRIGGER cash_movements_insert_only
BEFORE UPDATE OR DELETE ON cash_movements
FOR EACH ROW EXECUTE FUNCTION cash_reject_change();--> statement-breakpoint
-- La cadena de sesiones (ADR 0022, punto 8; brief-21.2, D-1): una sesión se abre solo si la
-- anterior tiene cierre. Con cash_sessions_previous_unique (cada sesión, a lo sumo una siguiente) y
-- el índice parcial cash_sessions_first_unique (una sola primera por organización), las sesiones de
-- una organización forman una sola cadena, y solo la última puede estar abierta. La clave compuesta
-- rechaza después una anterior que no exista en la organización.
--
-- En READ COMMITTED este trigger no ve un cierre sin confirmar: contra dos escrituras simultáneas
-- defiende el bloqueo de cobros, que toman todos los caminos del servicio; contra una escritura
-- posterior a un estado ya confirmado, el trigger, para cualquier rol (brief-21.2, H-4).
CREATE FUNCTION cash_sessions_check_previous() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.previous_session_id IS NULL THEN
    RETURN NEW;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM cash_session_closings
    WHERE organization_id = NEW.organization_id AND session_id = NEW.previous_session_id
  ) THEN
    RAISE EXCEPTION 'la sesión anterior % no está cerrada', NEW.previous_session_id;
  END IF;
  RETURN NEW;
END
$$;--> statement-breakpoint
CREATE TRIGGER cash_sessions_chain
BEFORE INSERT ON cash_sessions
FOR EACH ROW EXECUTE FUNCTION cash_sessions_check_previous();--> statement-breakpoint
-- Una sesión cerrada no cambia (ADR 0022, punto 8; brief-21.2, D-1): ninguna fila nueva apunta a
-- una sesión con cierre. El cierre escribe sus filas por moneda antes de su cabecera. Desde la 21.3,
-- también los cobros y las devoluciones. Lo que no ve en READ COMMITTED, igual que el de la cadena.
CREATE FUNCTION cash_reject_closed_session() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM cash_session_closings
    WHERE organization_id = NEW.organization_id AND session_id = NEW.session_id
  ) THEN
    RAISE EXCEPTION 'la sesión % está cerrada: % rechazado en %', NEW.session_id, TG_OP, TG_TABLE_NAME;
  END IF;
  RETURN NEW;
END
$$;--> statement-breakpoint
CREATE TRIGGER cash_session_opening_amounts_open_session
BEFORE INSERT ON cash_session_opening_amounts
FOR EACH ROW EXECUTE FUNCTION cash_reject_closed_session();--> statement-breakpoint
CREATE TRIGGER cash_session_closing_amounts_open_session
BEFORE INSERT ON cash_session_closing_amounts
FOR EACH ROW EXECUTE FUNCTION cash_reject_closed_session();--> statement-breakpoint
CREATE TRIGGER cash_movements_open_session
BEFORE INSERT ON cash_movements
FOR EACH ROW EXECUTE FUNCTION cash_reject_closed_session();--> statement-breakpoint
-- «Es efectivo» se fija al crear el medio y no se edita, para que un cobro viejo no cambie de caja
-- (ADR 0022, punto 10; brief-21.2, D-6). Tampoco cambia de organización.
CREATE FUNCTION payment_methods_check_fixed() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.is_cash IS DISTINCT FROM OLD.is_cash THEN
    RAISE EXCEPTION 'el medio de pago % no cambia si es efectivo', OLD.id;
  END IF;
  IF NEW.organization_id IS DISTINCT FROM OLD.organization_id THEN
    RAISE EXCEPTION 'el medio de pago % no cambia de organización', OLD.id;
  END IF;
  RETURN NEW;
END
$$;--> statement-breakpoint
CREATE TRIGGER payment_methods_fixed
BEFORE UPDATE ON payment_methods
FOR EACH ROW EXECUTE FUNCTION payment_methods_check_fixed();

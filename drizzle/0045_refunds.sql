-- La anulación de un cobro, la devolución y su anulación (brief-21.5, D-1 a D-3; ADR 0022, puntos 7,
-- 8 y 11). Generada con drizzle-kit y completada a mano.
--
-- Ningún CHECK usa un valor agregado con ALTER TYPE en esta migración: el migrador de Drizzle aplica
-- todas las pendientes en una sola transacción (brief-21.4, H-2). refunds_target_check usa
-- refund_target, un enum creado acá con CREATE TYPE, cuyos valores sí se pueden usar (brief-21.5,
-- H-7). Los valores nuevos de document_kind y audit_entity_type los usa el código.
CREATE TYPE "public"."receipt_void_reason" AS ENUM('not_received', 'wrong_method', 'wrong_amount', 'wrong_target', 'other');--> statement-breakpoint
CREATE TYPE "public"."refund_target" AS ENUM('account', 'sale');--> statement-breakpoint
CREATE TYPE "public"."refund_void_reason" AS ENUM('not_paid', 'wrong_method', 'wrong_amount', 'wrong_client', 'other');--> statement-breakpoint
ALTER TYPE "public"."audit_entity_type" ADD VALUE 'refund';--> statement-breakpoint
ALTER TYPE "public"."document_kind" ADD VALUE 'receipt_void';--> statement-breakpoint
ALTER TYPE "public"."document_kind" ADD VALUE 'refund';--> statement-breakpoint
ALTER TYPE "public"."document_kind" ADD VALUE 'refund_void';--> statement-breakpoint
CREATE TABLE "receipt_voids" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"number" bigint NOT NULL,
	"receipt_id" uuid NOT NULL,
	"currency" text NOT NULL,
	"amount" numeric(14, 2) NOT NULL,
	"reason" "receipt_void_reason" NOT NULL,
	"session_id" uuid,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
	CONSTRAINT "receipt_voids_organization_number_unique" UNIQUE("organization_id","number"),
	CONSTRAINT "receipt_voids_receipt_unique" UNIQUE("receipt_id"),
	CONSTRAINT "receipt_voids_number_positive" CHECK ("receipt_voids"."number" > 0),
	CONSTRAINT "receipt_voids_amount_positive" CHECK ("receipt_voids"."amount" > 0),
	CONSTRAINT "receipt_voids_currency_format" CHECK ("receipt_voids"."currency" ~ '^[A-Z]{3}$')
);
--> statement-breakpoint
CREATE TABLE "refund_voids" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"number" bigint NOT NULL,
	"refund_id" uuid NOT NULL,
	"currency" text NOT NULL,
	"amount" numeric(14, 2) NOT NULL,
	"reason" "refund_void_reason" NOT NULL,
	"session_id" uuid,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
	CONSTRAINT "refund_voids_organization_number_unique" UNIQUE("organization_id","number"),
	CONSTRAINT "refund_voids_refund_unique" UNIQUE("refund_id"),
	CONSTRAINT "refund_voids_number_positive" CHECK ("refund_voids"."number" > 0),
	CONSTRAINT "refund_voids_amount_positive" CHECK ("refund_voids"."amount" > 0),
	CONSTRAINT "refund_voids_currency_format" CHECK ("refund_voids"."currency" ~ '^[A-Z]{3}$')
);
--> statement-breakpoint
CREATE TABLE "refunds" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"number" bigint NOT NULL,
	"target" "refund_target" NOT NULL,
	"client_id" uuid,
	"sale_id" uuid,
	"payment_method_id" uuid NOT NULL,
	"session_id" uuid,
	"currency" text NOT NULL,
	"amount" numeric(14, 2) NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
	CONSTRAINT "refunds_organization_number_unique" UNIQUE("organization_id","number"),
	CONSTRAINT "refunds_organization_id_id_unique" UNIQUE("organization_id","id"),
	CONSTRAINT "refunds_target_check" CHECK (("refunds"."target" = 'account' AND "refunds"."client_id" IS NOT NULL AND "refunds"."sale_id" IS NULL)
        OR ("refunds"."target" = 'sale' AND "refunds"."sale_id" IS NOT NULL AND "refunds"."client_id" IS NULL)),
	CONSTRAINT "refunds_number_positive" CHECK ("refunds"."number" > 0),
	CONSTRAINT "refunds_amount_positive" CHECK ("refunds"."amount" > 0),
	CONSTRAINT "refunds_currency_format" CHECK ("refunds"."currency" ~ '^[A-Z]{3}$')
);
--> statement-breakpoint
ALTER TABLE "receipt_voids" ADD CONSTRAINT "receipt_voids_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receipt_voids" ADD CONSTRAINT "receipt_voids_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receipt_voids" ADD CONSTRAINT "receipt_voids_receipt_fk" FOREIGN KEY ("organization_id","receipt_id") REFERENCES "public"."receipts"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receipt_voids" ADD CONSTRAINT "receipt_voids_session_fk" FOREIGN KEY ("organization_id","session_id") REFERENCES "public"."cash_sessions"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refund_voids" ADD CONSTRAINT "refund_voids_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refund_voids" ADD CONSTRAINT "refund_voids_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refund_voids" ADD CONSTRAINT "refund_voids_refund_fk" FOREIGN KEY ("organization_id","refund_id") REFERENCES "public"."refunds"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refund_voids" ADD CONSTRAINT "refund_voids_session_fk" FOREIGN KEY ("organization_id","session_id") REFERENCES "public"."cash_sessions"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_client_fk" FOREIGN KEY ("organization_id","client_id") REFERENCES "public"."clients"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_sale_fk" FOREIGN KEY ("organization_id","sale_id") REFERENCES "public"."sales"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_payment_method_fk" FOREIGN KEY ("organization_id","payment_method_id") REFERENCES "public"."payment_methods"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_session_fk" FOREIGN KEY ("organization_id","session_id") REFERENCES "public"."cash_sessions"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "receipt_voids_session_idx" ON "receipt_voids" USING btree ("organization_id","session_id");--> statement-breakpoint
CREATE INDEX "refund_voids_session_idx" ON "refund_voids" USING btree ("organization_id","session_id");--> statement-breakpoint
CREATE INDEX "refunds_client_idx" ON "refunds" USING btree ("organization_id","client_id");--> statement-breakpoint
CREATE INDEX "refunds_sale_idx" ON "refunds" USING btree ("organization_id","sale_id");--> statement-breakpoint
CREATE INDEX "refunds_session_idx" ON "refunds" USING btree ("organization_id","session_id");--> statement-breakpoint
-- Escrito a mano (brief-21.5, D-1 a D-3; ADR 0013).
--
-- Las tres mueven dinero o lo corrigen: son de solo inserción para crm_app, y cash_reject_change()
-- de la 0042 rechaza UPDATE y DELETE para cualquier rol, también el dueño.
GRANT SELECT, INSERT ON TABLE receipt_voids TO crm_app;--> statement-breakpoint
GRANT SELECT, INSERT ON TABLE refunds TO crm_app;--> statement-breakpoint
GRANT SELECT, INSERT ON TABLE refund_voids TO crm_app;--> statement-breakpoint
CREATE TRIGGER receipt_voids_insert_only
BEFORE UPDATE OR DELETE ON receipt_voids
FOR EACH ROW EXECUTE FUNCTION cash_reject_change();--> statement-breakpoint
CREATE TRIGGER refunds_insert_only
BEFORE UPDATE OR DELETE ON refunds
FOR EACH ROW EXECUTE FUNCTION cash_reject_change();--> statement-breakpoint
CREATE TRIGGER refund_voids_insert_only
BEFORE UPDATE OR DELETE ON refund_voids
FOR EACH ROW EXECUTE FUNCTION cash_reject_change();--> statement-breakpoint
-- Nada entra en una sesión con cierre (H-6): la función de la 0042 lee NEW.session_id, y con la
-- sesión nula no encuentra nada.
CREATE TRIGGER receipt_voids_open_session
BEFORE INSERT ON receipt_voids
FOR EACH ROW EXECUTE FUNCTION cash_reject_closed_session();--> statement-breakpoint
CREATE TRIGGER refunds_open_session
BEFORE INSERT ON refunds
FOR EACH ROW EXECUTE FUNCTION cash_reject_closed_session();--> statement-breakpoint
CREATE TRIGGER refund_voids_open_session
BEFORE INSERT ON refund_voids
FOR EACH ROW EXECUTE FUNCTION cash_reject_closed_session();--> statement-breakpoint
-- La devolución en efectivo va en una sesión, y la que no es en efectivo, en ninguna (D-2). La
-- función de la 0043 lee NEW.payment_method_id y NEW.session_id, que refunds también tiene (H-6).
CREATE TRIGGER refunds_cash_session
BEFORE INSERT ON refunds
FOR EACH ROW EXECUTE FUNCTION receipts_check_cash_session();--> statement-breakpoint
-- La anulación de un cobro copia su moneda y su monto, y la sesión en la que impacta (D-1; H-5): la
-- del cobro si esa sesión no tiene cierre, y ninguna si lo tiene o si el cobro no fue en efectivo.
-- Así lo esperado de una sesión cuenta solo lo anulado mientras estaba abierta. Si el cobro no
-- existe en la organización, lo rechaza después la clave compuesta.
CREATE FUNCTION receipt_voids_check_copy() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  source_currency text;
  source_amount numeric(14, 2);
  source_session uuid;
BEGIN
  SELECT currency, amount, session_id
  INTO source_currency, source_amount, source_session
  FROM receipts
  WHERE organization_id = NEW.organization_id AND id = NEW.receipt_id;
  IF NOT FOUND THEN
    RETURN NEW;
  END IF;
  IF NEW.currency IS DISTINCT FROM source_currency
     OR NEW.amount IS DISTINCT FROM source_amount THEN
    RAISE EXCEPTION 'la anulación % no copia la moneda y el monto de su cobro', NEW.number;
  END IF;
  IF source_session IS NULL OR EXISTS (
    SELECT 1 FROM cash_session_closings
    WHERE organization_id = NEW.organization_id AND session_id = source_session
  ) THEN
    IF NEW.session_id IS NOT NULL THEN
      RAISE EXCEPTION 'la anulación % no impacta en ninguna sesión abierta', NEW.number;
    END IF;
  ELSIF NEW.session_id IS DISTINCT FROM source_session THEN
    RAISE EXCEPTION 'la anulación % impacta en la sesión abierta de su cobro', NEW.number;
  END IF;
  RETURN NEW;
END
$$;--> statement-breakpoint
CREATE TRIGGER receipt_voids_copy_receipt
BEFORE INSERT ON receipt_voids
FOR EACH ROW EXECUTE FUNCTION receipt_voids_check_copy();--> statement-breakpoint
-- Lo mismo para la anulación de una devolución (D-3).
CREATE FUNCTION refund_voids_check_copy() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  source_currency text;
  source_amount numeric(14, 2);
  source_session uuid;
BEGIN
  SELECT currency, amount, session_id
  INTO source_currency, source_amount, source_session
  FROM refunds
  WHERE organization_id = NEW.organization_id AND id = NEW.refund_id;
  IF NOT FOUND THEN
    RETURN NEW;
  END IF;
  IF NEW.currency IS DISTINCT FROM source_currency
     OR NEW.amount IS DISTINCT FROM source_amount THEN
    RAISE EXCEPTION 'la anulación % no copia la moneda y el monto de su devolución', NEW.number;
  END IF;
  IF source_session IS NULL OR EXISTS (
    SELECT 1 FROM cash_session_closings
    WHERE organization_id = NEW.organization_id AND session_id = source_session
  ) THEN
    IF NEW.session_id IS NOT NULL THEN
      RAISE EXCEPTION 'la anulación % no impacta en ninguna sesión abierta', NEW.number;
    END IF;
  ELSIF NEW.session_id IS DISTINCT FROM source_session THEN
    RAISE EXCEPTION 'la anulación % impacta en la sesión abierta de su devolución', NEW.number;
  END IF;
  RETURN NEW;
END
$$;--> statement-breakpoint
CREATE TRIGGER refund_voids_copy_refund
BEFORE INSERT ON refund_voids
FOR EACH ROW EXECUTE FUNCTION refund_voids_check_copy();

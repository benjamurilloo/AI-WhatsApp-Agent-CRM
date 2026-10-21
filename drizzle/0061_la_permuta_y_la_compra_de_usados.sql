CREATE TYPE "public"."payment_method_system_role" AS ENUM('trade_in');--> statement-breakpoint
CREATE TYPE "public"."trade_in_payment_void_reason" AS ENUM('not_paid', 'wrong_method', 'wrong_amount', 'wrong_target', 'other');--> statement-breakpoint
ALTER TYPE "public"."audit_entity_type" ADD VALUE 'trade_in_payment';--> statement-breakpoint
ALTER TYPE "public"."document_kind" ADD VALUE 'trade_in_payment';--> statement-breakpoint
ALTER TYPE "public"."document_kind" ADD VALUE 'trade_in_payment_void';--> statement-breakpoint
CREATE TABLE "trade_in_payment_voids" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"number" bigint NOT NULL,
	"trade_in_payment_id" uuid NOT NULL,
	"currency" text NOT NULL,
	"amount" numeric(14, 2) NOT NULL,
	"tendered_currency" text,
	"tendered_amount" numeric(14, 2),
	"exchange_rate" numeric(18, 6),
	"exchange_rate_id" uuid,
	"reason" "trade_in_payment_void_reason" NOT NULL,
	"session_id" uuid,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
	CONSTRAINT "trade_in_payment_voids_organization_number_unique" UNIQUE("organization_id","number"),
	CONSTRAINT "trade_in_payment_voids_trade_in_payment_unique" UNIQUE("trade_in_payment_id"),
	CONSTRAINT "trade_in_payment_voids_tendered_together" CHECK (("trade_in_payment_voids"."tendered_currency" IS NULL AND "trade_in_payment_voids"."tendered_amount" IS NULL AND "trade_in_payment_voids"."exchange_rate" IS NULL)
        OR ("trade_in_payment_voids"."tendered_currency" IS NOT NULL AND "trade_in_payment_voids"."tendered_amount" IS NOT NULL AND "trade_in_payment_voids"."exchange_rate" IS NOT NULL)),
	CONSTRAINT "trade_in_payment_voids_exchange_rate_id_tendered" CHECK ("trade_in_payment_voids"."exchange_rate_id" IS NULL OR "trade_in_payment_voids"."tendered_currency" IS NOT NULL),
	CONSTRAINT "trade_in_payment_voids_tendered_currency_distinct" CHECK ("trade_in_payment_voids"."tendered_currency" IS NULL OR "trade_in_payment_voids"."tendered_currency" <> "trade_in_payment_voids"."currency"),
	CONSTRAINT "trade_in_payment_voids_tendered_currency_format" CHECK ("trade_in_payment_voids"."tendered_currency" IS NULL OR "trade_in_payment_voids"."tendered_currency" ~ '^[A-Z]{3}$'),
	CONSTRAINT "trade_in_payment_voids_tendered_amount_positive" CHECK ("trade_in_payment_voids"."tendered_amount" IS NULL OR "trade_in_payment_voids"."tendered_amount" > 0),
	CONSTRAINT "trade_in_payment_voids_exchange_rate_minimum" CHECK ("trade_in_payment_voids"."exchange_rate" IS NULL OR "trade_in_payment_voids"."exchange_rate" >= 1),
	CONSTRAINT "trade_in_payment_voids_number_positive" CHECK ("trade_in_payment_voids"."number" > 0),
	CONSTRAINT "trade_in_payment_voids_amount_positive" CHECK ("trade_in_payment_voids"."amount" > 0),
	CONSTRAINT "trade_in_payment_voids_currency_format" CHECK ("trade_in_payment_voids"."currency" ~ '^[A-Z]{3}$')
);
--> statement-breakpoint
CREATE TABLE "trade_in_payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"number" bigint NOT NULL,
	"trade_in_id" uuid NOT NULL,
	"payment_method_id" uuid NOT NULL,
	"session_id" uuid,
	"currency" text NOT NULL,
	"amount" numeric(14, 2) NOT NULL,
	"tendered_currency" text,
	"tendered_amount" numeric(14, 2),
	"exchange_rate" numeric(18, 6),
	"exchange_rate_id" uuid,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
	CONSTRAINT "trade_in_payments_organization_number_unique" UNIQUE("organization_id","number"),
	CONSTRAINT "trade_in_payments_organization_id_id_unique" UNIQUE("organization_id","id"),
	CONSTRAINT "trade_in_payments_tendered_together" CHECK (("trade_in_payments"."tendered_currency" IS NULL AND "trade_in_payments"."tendered_amount" IS NULL AND "trade_in_payments"."exchange_rate" IS NULL)
        OR ("trade_in_payments"."tendered_currency" IS NOT NULL AND "trade_in_payments"."tendered_amount" IS NOT NULL AND "trade_in_payments"."exchange_rate" IS NOT NULL)),
	CONSTRAINT "trade_in_payments_exchange_rate_id_tendered" CHECK ("trade_in_payments"."exchange_rate_id" IS NULL OR "trade_in_payments"."tendered_currency" IS NOT NULL),
	CONSTRAINT "trade_in_payments_tendered_currency_distinct" CHECK ("trade_in_payments"."tendered_currency" IS NULL OR "trade_in_payments"."tendered_currency" <> "trade_in_payments"."currency"),
	CONSTRAINT "trade_in_payments_tendered_currency_format" CHECK ("trade_in_payments"."tendered_currency" IS NULL OR "trade_in_payments"."tendered_currency" ~ '^[A-Z]{3}$'),
	CONSTRAINT "trade_in_payments_tendered_amount_positive" CHECK ("trade_in_payments"."tendered_amount" IS NULL OR "trade_in_payments"."tendered_amount" > 0),
	CONSTRAINT "trade_in_payments_exchange_rate_minimum" CHECK ("trade_in_payments"."exchange_rate" IS NULL OR "trade_in_payments"."exchange_rate" >= 1),
	CONSTRAINT "trade_in_payments_number_positive" CHECK ("trade_in_payments"."number" > 0),
	CONSTRAINT "trade_in_payments_amount_positive" CHECK ("trade_in_payments"."amount" > 0),
	CONSTRAINT "trade_in_payments_currency_format" CHECK ("trade_in_payments"."currency" ~ '^[A-Z]{3}$')
);
--> statement-breakpoint
ALTER TABLE "payment_methods" ADD COLUMN "system_role" "payment_method_system_role";--> statement-breakpoint
ALTER TABLE "receipts" ADD COLUMN "trade_in_id" uuid;--> statement-breakpoint
ALTER TABLE "trade_in_payment_voids" ADD CONSTRAINT "trade_in_payment_voids_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trade_in_payment_voids" ADD CONSTRAINT "trade_in_payment_voids_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trade_in_payment_voids" ADD CONSTRAINT "trade_in_payment_voids_trade_in_payment_fk" FOREIGN KEY ("organization_id","trade_in_payment_id") REFERENCES "public"."trade_in_payments"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trade_in_payment_voids" ADD CONSTRAINT "trade_in_payment_voids_session_fk" FOREIGN KEY ("organization_id","session_id") REFERENCES "public"."cash_sessions"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trade_in_payment_voids" ADD CONSTRAINT "trade_in_payment_voids_exchange_rate_fk" FOREIGN KEY ("organization_id","exchange_rate_id") REFERENCES "public"."exchange_rates"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trade_in_payments" ADD CONSTRAINT "trade_in_payments_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trade_in_payments" ADD CONSTRAINT "trade_in_payments_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trade_in_payments" ADD CONSTRAINT "trade_in_payments_trade_in_fk" FOREIGN KEY ("organization_id","trade_in_id") REFERENCES "public"."trade_ins"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trade_in_payments" ADD CONSTRAINT "trade_in_payments_payment_method_fk" FOREIGN KEY ("organization_id","payment_method_id") REFERENCES "public"."payment_methods"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trade_in_payments" ADD CONSTRAINT "trade_in_payments_session_fk" FOREIGN KEY ("organization_id","session_id") REFERENCES "public"."cash_sessions"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trade_in_payments" ADD CONSTRAINT "trade_in_payments_exchange_rate_fk" FOREIGN KEY ("organization_id","exchange_rate_id") REFERENCES "public"."exchange_rates"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "trade_in_payment_voids_session_idx" ON "trade_in_payment_voids" USING btree ("organization_id","session_id");--> statement-breakpoint
CREATE INDEX "trade_in_payments_trade_in_idx" ON "trade_in_payments" USING btree ("organization_id","trade_in_id");--> statement-breakpoint
CREATE INDEX "trade_in_payments_session_idx" ON "trade_in_payments" USING btree ("organization_id","session_id");--> statement-breakpoint
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_trade_in_fk" FOREIGN KEY ("organization_id","trade_in_id") REFERENCES "public"."trade_ins"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "payment_methods_organization_system_role_unique" ON "payment_methods" USING btree ("organization_id","system_role") WHERE "payment_methods"."system_role" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "receipts_trade_in_idx" ON "receipts" USING btree ("organization_id","trade_in_id");--> statement-breakpoint
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_trade_in_check" CHECK ("receipts"."trade_in_id" IS NULL OR ("receipts"."target"::text = 'sale' AND "receipts"."tendered_currency" IS NULL));--> statement-breakpoint
-- Escrito a mano (brief-29.7.2, D-1 a D-3 y D-7; ADR 0024, punto 8; ADR 0013). Ningún CHECK, índice ni
-- trigger de esta migración nombra los valores que agrega arriba con ALTER TYPE (trade_in_payment y
-- trade_in_payment_void): scripts/migrar.ts aplica las pendientes en una transacción, y PostgreSQL no deja
-- usar en ella un valor recién agregado a un enum que ya existía. payment_method_system_role y
-- trade_in_payment_void_reason nacen enteros en ella y sí se pueden nombrar. La migración no escribe
-- datos: el medio «Permuta» lo crea org:capability (U-4).
--
-- El medio de sistema (D-1): el papel se fija al crearlo, como «es efectivo», y un medio de sistema no se
-- renombra ni se desactiva. Reemplaza la función de la 0042 con las mismas dos reglas de antes.
CREATE OR REPLACE FUNCTION payment_methods_check_fixed() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.is_cash IS DISTINCT FROM OLD.is_cash THEN
    RAISE EXCEPTION 'el medio de pago % no cambia si es efectivo', OLD.id;
  END IF;
  IF NEW.organization_id IS DISTINCT FROM OLD.organization_id THEN
    RAISE EXCEPTION 'el medio de pago % no cambia de organización', OLD.id;
  END IF;
  IF NEW.system_role IS DISTINCT FROM OLD.system_role THEN
    RAISE EXCEPTION 'el medio de pago % no cambia su papel de sistema', OLD.id;
  END IF;
  IF OLD.system_role IS NOT NULL
     AND (NEW.name IS DISTINCT FROM OLD.name OR NEW.is_active IS DISTINCT FROM OLD.is_active) THEN
    RAISE EXCEPTION 'el medio de sistema % no se renombra ni se desactiva', OLD.id;
  END IF;
  RETURN NEW;
END
$$;--> statement-breakpoint
-- El cobro con «Permuta» (D-2): el medio de sistema va siempre con un usado, y un usado siempre con ese
-- medio. Que el usado sea del cliente y la moneda de la venta, y que no se use de más, lo asegura el
-- servicio con el bloqueo de cobros: un trigger cruzaría módulos en la base.
CREATE FUNCTION receipts_check_trade_in() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  method_role payment_method_system_role;
BEGIN
  SELECT system_role INTO method_role FROM payment_methods
  WHERE organization_id = NEW.organization_id AND id = NEW.payment_method_id;
  IF NOT FOUND THEN
    RETURN NEW;
  END IF;
  IF method_role = 'trade_in' AND NEW.trade_in_id IS NULL THEN
    RAISE EXCEPTION 'un cobro con «Permuta» necesita su usado';
  END IF;
  IF method_role IS DISTINCT FROM 'trade_in' AND NEW.trade_in_id IS NOT NULL THEN
    RAISE EXCEPTION 'un cobro con un usado va con «Permuta»';
  END IF;
  RETURN NEW;
END
$$;--> statement-breakpoint
CREATE TRIGGER receipts_trade_in
BEFORE INSERT ON receipts
FOR EACH ROW EXECUTE FUNCTION receipts_check_trade_in();--> statement-breakpoint
-- El pago de un usado (D-3) mueve dinero: es de solo inserción para crm_app, y cash_reject_change() de
-- la 0042 rechaza UPDATE y DELETE para cualquier rol, también el dueño. Su anulación, igual.
GRANT SELECT, INSERT ON TABLE trade_in_payments TO crm_app;--> statement-breakpoint
GRANT SELECT, INSERT ON TABLE trade_in_payment_voids TO crm_app;--> statement-breakpoint
CREATE TRIGGER trade_in_payments_insert_only
BEFORE UPDATE OR DELETE ON trade_in_payments
FOR EACH ROW EXECUTE FUNCTION cash_reject_change();--> statement-breakpoint
CREATE TRIGGER trade_in_payment_voids_insert_only
BEFORE UPDATE OR DELETE ON trade_in_payment_voids
FOR EACH ROW EXECUTE FUNCTION cash_reject_change();--> statement-breakpoint
-- Nada entra en una sesión con cierre, y el pago en efectivo va en una sesión y el que no, en ninguna:
-- las funciones de la 0042 y la 0043, como en supplier_payments.
CREATE TRIGGER trade_in_payments_open_session
BEFORE INSERT ON trade_in_payments
FOR EACH ROW EXECUTE FUNCTION cash_reject_closed_session();--> statement-breakpoint
CREATE TRIGGER trade_in_payment_voids_open_session
BEFORE INSERT ON trade_in_payment_voids
FOR EACH ROW EXECUTE FUNCTION cash_reject_closed_session();--> statement-breakpoint
CREATE TRIGGER trade_in_payments_cash_session
BEFORE INSERT ON trade_in_payments
FOR EACH ROW EXECUTE FUNCTION receipts_check_cash_session();--> statement-breakpoint
-- Un usado no se paga con un medio de sistema: «Permuta» descuenta el usado de una venta, no le paga al
-- cliente.
CREATE FUNCTION trade_in_payments_check_method() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM payment_methods
    WHERE organization_id = NEW.organization_id AND id = NEW.payment_method_id
      AND system_role IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'el pago % de un usado no va con un medio de sistema', NEW.number;
  END IF;
  RETURN NEW;
END
$$;--> statement-breakpoint
CREATE TRIGGER trade_in_payments_method
BEFORE INSERT ON trade_in_payments
FOR EACH ROW EXECUTE FUNCTION trade_in_payments_check_method();--> statement-breakpoint
-- La anulación de un pago copia su moneda, su monto y lo que salió, y la sesión en la que impacta: la del
-- pago si esa sesión no tiene cierre, y ninguna si lo tiene o si el pago no fue en efectivo, como
-- supplier_payment_voids_check_copy() de la 0055. Si el pago no existe en la organización, lo rechaza
-- después la clave compuesta.
CREATE FUNCTION trade_in_payment_voids_check_copy() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  source_currency text;
  source_amount numeric(14, 2);
  source_session uuid;
  source_tendered_currency text;
  source_tendered_amount numeric(14, 2);
  source_exchange_rate numeric(18, 6);
  source_exchange_rate_id uuid;
BEGIN
  SELECT currency, amount, session_id, tendered_currency, tendered_amount, exchange_rate,
    exchange_rate_id
  INTO source_currency, source_amount, source_session, source_tendered_currency,
    source_tendered_amount, source_exchange_rate, source_exchange_rate_id
  FROM trade_in_payments
  WHERE organization_id = NEW.organization_id AND id = NEW.trade_in_payment_id;
  IF NOT FOUND THEN
    RETURN NEW;
  END IF;
  IF NEW.currency IS DISTINCT FROM source_currency
     OR NEW.amount IS DISTINCT FROM source_amount THEN
    RAISE EXCEPTION 'la anulación % no copia la moneda y el monto de su pago', NEW.number;
  END IF;
  IF NEW.tendered_currency IS DISTINCT FROM source_tendered_currency
     OR NEW.tendered_amount IS DISTINCT FROM source_tendered_amount
     OR NEW.exchange_rate IS DISTINCT FROM source_exchange_rate
     OR NEW.exchange_rate_id IS DISTINCT FROM source_exchange_rate_id THEN
    RAISE EXCEPTION 'la anulación % no copia lo que salió en su pago', NEW.number;
  END IF;
  IF source_session IS NULL OR EXISTS (
    SELECT 1 FROM cash_session_closings
    WHERE organization_id = NEW.organization_id AND session_id = source_session
  ) THEN
    IF NEW.session_id IS NOT NULL THEN
      RAISE EXCEPTION 'la anulación % no impacta en ninguna sesión abierta', NEW.number;
    END IF;
  ELSIF NEW.session_id IS DISTINCT FROM source_session THEN
    RAISE EXCEPTION 'la anulación % impacta en la sesión abierta de su pago', NEW.number;
  END IF;
  RETURN NEW;
END
$$;--> statement-breakpoint
CREATE TRIGGER trade_in_payment_voids_copy_payment
BEFORE INSERT ON trade_in_payment_voids
FOR EACH ROW EXECUTE FUNCTION trade_in_payment_voids_check_copy();

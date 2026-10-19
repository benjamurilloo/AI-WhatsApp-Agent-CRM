CREATE TYPE "public"."exchange_rate_source" AS ENUM('manual');--> statement-breakpoint
ALTER TYPE "public"."audit_entity_type" ADD VALUE 'organization';--> statement-breakpoint
ALTER TYPE "public"."audit_entity_type" ADD VALUE 'exchange_rate_setting';--> statement-breakpoint
ALTER TYPE "public"."audit_entity_type" ADD VALUE 'exchange_rate';--> statement-breakpoint
CREATE TABLE "exchange_rate_settings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"quote_currency" text NOT NULL,
	"source" "exchange_rate_source" DEFAULT 'manual' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "exchange_rate_settings_organization_unique" UNIQUE("organization_id"),
	CONSTRAINT "exchange_rate_settings_quote_currency_format" CHECK ("exchange_rate_settings"."quote_currency" ~ '^[A-Z]{3}$')
);
--> statement-breakpoint
CREATE TABLE "exchange_rates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"base_currency" text NOT NULL,
	"quote_currency" text NOT NULL,
	"rate" numeric(18, 6) NOT NULL,
	"source" "exchange_rate_source" NOT NULL,
	"recorded_by" uuid NOT NULL,
	"recorded_at" timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
	CONSTRAINT "exchange_rates_organization_id_id_unique" UNIQUE("organization_id","id"),
	CONSTRAINT "exchange_rates_rate_minimum" CHECK ("exchange_rates"."rate" >= 1),
	CONSTRAINT "exchange_rates_currencies_distinct" CHECK ("exchange_rates"."base_currency" <> "exchange_rates"."quote_currency"),
	CONSTRAINT "exchange_rates_base_currency_format" CHECK ("exchange_rates"."base_currency" ~ '^[A-Z]{3}$'),
	CONSTRAINT "exchange_rates_quote_currency_format" CHECK ("exchange_rates"."quote_currency" ~ '^[A-Z]{3}$')
);
--> statement-breakpoint
ALTER TABLE "receipt_voids" ADD COLUMN "tendered_currency" text;--> statement-breakpoint
ALTER TABLE "receipt_voids" ADD COLUMN "tendered_amount" numeric(14, 2);--> statement-breakpoint
ALTER TABLE "receipt_voids" ADD COLUMN "exchange_rate" numeric(18, 6);--> statement-breakpoint
ALTER TABLE "receipt_voids" ADD COLUMN "exchange_rate_id" uuid;--> statement-breakpoint
ALTER TABLE "receipts" ADD COLUMN "tendered_currency" text;--> statement-breakpoint
ALTER TABLE "receipts" ADD COLUMN "tendered_amount" numeric(14, 2);--> statement-breakpoint
ALTER TABLE "receipts" ADD COLUMN "exchange_rate" numeric(18, 6);--> statement-breakpoint
ALTER TABLE "receipts" ADD COLUMN "exchange_rate_id" uuid;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "main_currency" text;--> statement-breakpoint
ALTER TABLE "exchange_rate_settings" ADD CONSTRAINT "exchange_rate_settings_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exchange_rates" ADD CONSTRAINT "exchange_rates_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exchange_rates" ADD CONSTRAINT "exchange_rates_recorded_by_users_id_fk" FOREIGN KEY ("recorded_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "exchange_rates_pair_idx" ON "exchange_rates" USING btree ("organization_id","base_currency","quote_currency","recorded_at");--> statement-breakpoint
ALTER TABLE "receipt_voids" ADD CONSTRAINT "receipt_voids_exchange_rate_fk" FOREIGN KEY ("organization_id","exchange_rate_id") REFERENCES "public"."exchange_rates"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_exchange_rate_fk" FOREIGN KEY ("organization_id","exchange_rate_id") REFERENCES "public"."exchange_rates"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receipt_voids" ADD CONSTRAINT "receipt_voids_tendered_together" CHECK (("receipt_voids"."tendered_currency" IS NULL AND "receipt_voids"."tendered_amount" IS NULL AND "receipt_voids"."exchange_rate" IS NULL)
        OR ("receipt_voids"."tendered_currency" IS NOT NULL AND "receipt_voids"."tendered_amount" IS NOT NULL AND "receipt_voids"."exchange_rate" IS NOT NULL));--> statement-breakpoint
ALTER TABLE "receipt_voids" ADD CONSTRAINT "receipt_voids_exchange_rate_id_tendered" CHECK ("receipt_voids"."exchange_rate_id" IS NULL OR "receipt_voids"."tendered_currency" IS NOT NULL);--> statement-breakpoint
ALTER TABLE "receipt_voids" ADD CONSTRAINT "receipt_voids_tendered_currency_distinct" CHECK ("receipt_voids"."tendered_currency" IS NULL OR "receipt_voids"."tendered_currency" <> "receipt_voids"."currency");--> statement-breakpoint
ALTER TABLE "receipt_voids" ADD CONSTRAINT "receipt_voids_tendered_currency_format" CHECK ("receipt_voids"."tendered_currency" IS NULL OR "receipt_voids"."tendered_currency" ~ '^[A-Z]{3}$');--> statement-breakpoint
ALTER TABLE "receipt_voids" ADD CONSTRAINT "receipt_voids_tendered_amount_positive" CHECK ("receipt_voids"."tendered_amount" IS NULL OR "receipt_voids"."tendered_amount" > 0);--> statement-breakpoint
ALTER TABLE "receipt_voids" ADD CONSTRAINT "receipt_voids_exchange_rate_minimum" CHECK ("receipt_voids"."exchange_rate" IS NULL OR "receipt_voids"."exchange_rate" >= 1);--> statement-breakpoint
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_tendered_together" CHECK (("receipts"."tendered_currency" IS NULL AND "receipts"."tendered_amount" IS NULL AND "receipts"."exchange_rate" IS NULL)
        OR ("receipts"."tendered_currency" IS NOT NULL AND "receipts"."tendered_amount" IS NOT NULL AND "receipts"."exchange_rate" IS NOT NULL));--> statement-breakpoint
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_exchange_rate_id_tendered" CHECK ("receipts"."exchange_rate_id" IS NULL OR "receipts"."tendered_currency" IS NOT NULL);--> statement-breakpoint
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_tendered_currency_distinct" CHECK ("receipts"."tendered_currency" IS NULL OR "receipts"."tendered_currency" <> "receipts"."currency");--> statement-breakpoint
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_tendered_currency_format" CHECK ("receipts"."tendered_currency" IS NULL OR "receipts"."tendered_currency" ~ '^[A-Z]{3}$');--> statement-breakpoint
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_tendered_amount_positive" CHECK ("receipts"."tendered_amount" IS NULL OR "receipts"."tendered_amount" > 0);--> statement-breakpoint
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_exchange_rate_minimum" CHECK ("receipts"."exchange_rate" IS NULL OR "receipts"."exchange_rate" >= 1);--> statement-breakpoint
ALTER TABLE "organizations" ADD CONSTRAINT "organizations_main_currency_format" CHECK ("organizations"."main_currency" IS NULL OR "organizations"."main_currency" ~ '^[A-Z]{3}$');--> statement-breakpoint
-- Permisos de crm_app (brief-29.4, D-3): la configuración de la cotización no se edita ni se borra
-- en esta subfase (la 29.4.2 suma el UPDATE para la fuente y el ajuste); las cotizaciones son de
-- solo inserción. organizations ya tiene UPDATE desde la 0003.
GRANT SELECT, INSERT ON TABLE exchange_rate_settings TO crm_app;--> statement-breakpoint
GRANT SELECT, INSERT ON TABLE exchange_rates TO crm_app;--> statement-breakpoint
-- Las cotizaciones son de solo inserción también para el dueño (ADR 0013): una corrección es otra
-- fila (ADR 0025, punto 3).
CREATE FUNCTION fx_reject_change() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION '% es de solo inserción: % rechazado', TG_TABLE_NAME, TG_OP;
END
$$;--> statement-breakpoint
CREATE TRIGGER exchange_rates_insert_only
BEFORE UPDATE OR DELETE ON exchange_rates
FOR EACH ROW EXECUTE FUNCTION fx_reject_change();--> statement-breakpoint
CREATE TRIGGER exchange_rate_settings_insert_only
BEFORE UPDATE OR DELETE ON exchange_rate_settings
FOR EACH ROW EXECUTE FUNCTION fx_reject_change();--> statement-breakpoint
-- La anulación de un cobro copia también lo recibido (ADR 0025, punto 5; brief-29.4, D-6, H-1): la
-- caja devuelve lo que entró, así que el trigger de la 0045 compara además las cuatro columnas
-- nuevas. El resto de la función no cambia.
CREATE OR REPLACE FUNCTION receipt_voids_check_copy() RETURNS trigger
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
  FROM receipts
  WHERE organization_id = NEW.organization_id AND id = NEW.receipt_id;
  IF NOT FOUND THEN
    RETURN NEW;
  END IF;
  IF NEW.currency IS DISTINCT FROM source_currency
     OR NEW.amount IS DISTINCT FROM source_amount THEN
    RAISE EXCEPTION 'la anulación % no copia la moneda y el monto de su cobro', NEW.number;
  END IF;
  IF NEW.tendered_currency IS DISTINCT FROM source_tendered_currency
     OR NEW.tendered_amount IS DISTINCT FROM source_tendered_amount
     OR NEW.exchange_rate IS DISTINCT FROM source_exchange_rate
     OR NEW.exchange_rate_id IS DISTINCT FROM source_exchange_rate_id THEN
    RAISE EXCEPTION 'la anulación % no copia lo recibido por su cobro', NEW.number;
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
$$;

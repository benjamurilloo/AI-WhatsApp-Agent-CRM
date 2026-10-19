ALTER TABLE "refund_voids" ADD COLUMN "tendered_currency" text;--> statement-breakpoint
ALTER TABLE "refund_voids" ADD COLUMN "tendered_amount" numeric(14, 2);--> statement-breakpoint
ALTER TABLE "refund_voids" ADD COLUMN "exchange_rate" numeric(18, 6);--> statement-breakpoint
ALTER TABLE "refund_voids" ADD COLUMN "exchange_rate_id" uuid;--> statement-breakpoint
ALTER TABLE "refunds" ADD COLUMN "tendered_currency" text;--> statement-breakpoint
ALTER TABLE "refunds" ADD COLUMN "tendered_amount" numeric(14, 2);--> statement-breakpoint
ALTER TABLE "refunds" ADD COLUMN "exchange_rate" numeric(18, 6);--> statement-breakpoint
ALTER TABLE "refunds" ADD COLUMN "exchange_rate_id" uuid;--> statement-breakpoint
ALTER TABLE "supplier_payment_voids" ADD COLUMN "tendered_currency" text;--> statement-breakpoint
ALTER TABLE "supplier_payment_voids" ADD COLUMN "tendered_amount" numeric(14, 2);--> statement-breakpoint
ALTER TABLE "supplier_payment_voids" ADD COLUMN "exchange_rate" numeric(18, 6);--> statement-breakpoint
ALTER TABLE "supplier_payment_voids" ADD COLUMN "exchange_rate_id" uuid;--> statement-breakpoint
ALTER TABLE "supplier_payments" ADD COLUMN "tendered_currency" text;--> statement-breakpoint
ALTER TABLE "supplier_payments" ADD COLUMN "tendered_amount" numeric(14, 2);--> statement-breakpoint
ALTER TABLE "supplier_payments" ADD COLUMN "exchange_rate" numeric(18, 6);--> statement-breakpoint
ALTER TABLE "supplier_payments" ADD COLUMN "exchange_rate_id" uuid;--> statement-breakpoint
ALTER TABLE "refund_voids" ADD CONSTRAINT "refund_voids_exchange_rate_fk" FOREIGN KEY ("organization_id","exchange_rate_id") REFERENCES "public"."exchange_rates"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_exchange_rate_fk" FOREIGN KEY ("organization_id","exchange_rate_id") REFERENCES "public"."exchange_rates"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_payment_voids" ADD CONSTRAINT "supplier_payment_voids_exchange_rate_fk" FOREIGN KEY ("organization_id","exchange_rate_id") REFERENCES "public"."exchange_rates"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_payments" ADD CONSTRAINT "supplier_payments_exchange_rate_fk" FOREIGN KEY ("organization_id","exchange_rate_id") REFERENCES "public"."exchange_rates"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refund_voids" ADD CONSTRAINT "refund_voids_tendered_together" CHECK (("refund_voids"."tendered_currency" IS NULL AND "refund_voids"."tendered_amount" IS NULL AND "refund_voids"."exchange_rate" IS NULL)
        OR ("refund_voids"."tendered_currency" IS NOT NULL AND "refund_voids"."tendered_amount" IS NOT NULL AND "refund_voids"."exchange_rate" IS NOT NULL));--> statement-breakpoint
ALTER TABLE "refund_voids" ADD CONSTRAINT "refund_voids_exchange_rate_id_tendered" CHECK ("refund_voids"."exchange_rate_id" IS NULL OR "refund_voids"."tendered_currency" IS NOT NULL);--> statement-breakpoint
ALTER TABLE "refund_voids" ADD CONSTRAINT "refund_voids_tendered_currency_distinct" CHECK ("refund_voids"."tendered_currency" IS NULL OR "refund_voids"."tendered_currency" <> "refund_voids"."currency");--> statement-breakpoint
ALTER TABLE "refund_voids" ADD CONSTRAINT "refund_voids_tendered_currency_format" CHECK ("refund_voids"."tendered_currency" IS NULL OR "refund_voids"."tendered_currency" ~ '^[A-Z]{3}$');--> statement-breakpoint
ALTER TABLE "refund_voids" ADD CONSTRAINT "refund_voids_tendered_amount_positive" CHECK ("refund_voids"."tendered_amount" IS NULL OR "refund_voids"."tendered_amount" > 0);--> statement-breakpoint
ALTER TABLE "refund_voids" ADD CONSTRAINT "refund_voids_exchange_rate_minimum" CHECK ("refund_voids"."exchange_rate" IS NULL OR "refund_voids"."exchange_rate" >= 1);--> statement-breakpoint
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_tendered_together" CHECK (("refunds"."tendered_currency" IS NULL AND "refunds"."tendered_amount" IS NULL AND "refunds"."exchange_rate" IS NULL)
        OR ("refunds"."tendered_currency" IS NOT NULL AND "refunds"."tendered_amount" IS NOT NULL AND "refunds"."exchange_rate" IS NOT NULL));--> statement-breakpoint
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_exchange_rate_id_tendered" CHECK ("refunds"."exchange_rate_id" IS NULL OR "refunds"."tendered_currency" IS NOT NULL);--> statement-breakpoint
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_tendered_currency_distinct" CHECK ("refunds"."tendered_currency" IS NULL OR "refunds"."tendered_currency" <> "refunds"."currency");--> statement-breakpoint
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_tendered_currency_format" CHECK ("refunds"."tendered_currency" IS NULL OR "refunds"."tendered_currency" ~ '^[A-Z]{3}$');--> statement-breakpoint
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_tendered_amount_positive" CHECK ("refunds"."tendered_amount" IS NULL OR "refunds"."tendered_amount" > 0);--> statement-breakpoint
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_exchange_rate_minimum" CHECK ("refunds"."exchange_rate" IS NULL OR "refunds"."exchange_rate" >= 1);--> statement-breakpoint
ALTER TABLE "supplier_payment_voids" ADD CONSTRAINT "supplier_payment_voids_tendered_together" CHECK (("supplier_payment_voids"."tendered_currency" IS NULL AND "supplier_payment_voids"."tendered_amount" IS NULL AND "supplier_payment_voids"."exchange_rate" IS NULL)
        OR ("supplier_payment_voids"."tendered_currency" IS NOT NULL AND "supplier_payment_voids"."tendered_amount" IS NOT NULL AND "supplier_payment_voids"."exchange_rate" IS NOT NULL));--> statement-breakpoint
ALTER TABLE "supplier_payment_voids" ADD CONSTRAINT "supplier_payment_voids_exchange_rate_id_tendered" CHECK ("supplier_payment_voids"."exchange_rate_id" IS NULL OR "supplier_payment_voids"."tendered_currency" IS NOT NULL);--> statement-breakpoint
ALTER TABLE "supplier_payment_voids" ADD CONSTRAINT "supplier_payment_voids_tendered_currency_distinct" CHECK ("supplier_payment_voids"."tendered_currency" IS NULL OR "supplier_payment_voids"."tendered_currency" <> "supplier_payment_voids"."currency");--> statement-breakpoint
ALTER TABLE "supplier_payment_voids" ADD CONSTRAINT "supplier_payment_voids_tendered_currency_format" CHECK ("supplier_payment_voids"."tendered_currency" IS NULL OR "supplier_payment_voids"."tendered_currency" ~ '^[A-Z]{3}$');--> statement-breakpoint
ALTER TABLE "supplier_payment_voids" ADD CONSTRAINT "supplier_payment_voids_tendered_amount_positive" CHECK ("supplier_payment_voids"."tendered_amount" IS NULL OR "supplier_payment_voids"."tendered_amount" > 0);--> statement-breakpoint
ALTER TABLE "supplier_payment_voids" ADD CONSTRAINT "supplier_payment_voids_exchange_rate_minimum" CHECK ("supplier_payment_voids"."exchange_rate" IS NULL OR "supplier_payment_voids"."exchange_rate" >= 1);--> statement-breakpoint
ALTER TABLE "supplier_payments" ADD CONSTRAINT "supplier_payments_tendered_together" CHECK (("supplier_payments"."tendered_currency" IS NULL AND "supplier_payments"."tendered_amount" IS NULL AND "supplier_payments"."exchange_rate" IS NULL)
        OR ("supplier_payments"."tendered_currency" IS NOT NULL AND "supplier_payments"."tendered_amount" IS NOT NULL AND "supplier_payments"."exchange_rate" IS NOT NULL));--> statement-breakpoint
ALTER TABLE "supplier_payments" ADD CONSTRAINT "supplier_payments_exchange_rate_id_tendered" CHECK ("supplier_payments"."exchange_rate_id" IS NULL OR "supplier_payments"."tendered_currency" IS NOT NULL);--> statement-breakpoint
ALTER TABLE "supplier_payments" ADD CONSTRAINT "supplier_payments_tendered_currency_distinct" CHECK ("supplier_payments"."tendered_currency" IS NULL OR "supplier_payments"."tendered_currency" <> "supplier_payments"."currency");--> statement-breakpoint
ALTER TABLE "supplier_payments" ADD CONSTRAINT "supplier_payments_tendered_currency_format" CHECK ("supplier_payments"."tendered_currency" IS NULL OR "supplier_payments"."tendered_currency" ~ '^[A-Z]{3}$');--> statement-breakpoint
ALTER TABLE "supplier_payments" ADD CONSTRAINT "supplier_payments_tendered_amount_positive" CHECK ("supplier_payments"."tendered_amount" IS NULL OR "supplier_payments"."tendered_amount" > 0);--> statement-breakpoint
ALTER TABLE "supplier_payments" ADD CONSTRAINT "supplier_payments_exchange_rate_minimum" CHECK ("supplier_payments"."exchange_rate" IS NULL OR "supplier_payments"."exchange_rate" >= 1);--> statement-breakpoint
-- La anulación de una devolución y la de un pago copian también lo que salió (ADR 0025, punto 5;
-- brief-29.4.3, D-2): la caja recibe de vuelta lo que salió, así que los triggers de la 0045 y la
-- 0051 comparan además las cuatro columnas nuevas, como la 0053 con los cobros. El resto de cada
-- función no cambia. Sin GRANT: el SELECT y el INSERT de crm_app son de la tabla.
CREATE OR REPLACE FUNCTION refund_voids_check_copy() RETURNS trigger
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
  FROM refunds
  WHERE organization_id = NEW.organization_id AND id = NEW.refund_id;
  IF NOT FOUND THEN
    RETURN NEW;
  END IF;
  IF NEW.currency IS DISTINCT FROM source_currency
     OR NEW.amount IS DISTINCT FROM source_amount THEN
    RAISE EXCEPTION 'la anulación % no copia la moneda y el monto de su devolución', NEW.number;
  END IF;
  IF NEW.tendered_currency IS DISTINCT FROM source_tendered_currency
     OR NEW.tendered_amount IS DISTINCT FROM source_tendered_amount
     OR NEW.exchange_rate IS DISTINCT FROM source_exchange_rate
     OR NEW.exchange_rate_id IS DISTINCT FROM source_exchange_rate_id THEN
    RAISE EXCEPTION 'la anulación % no copia lo que salió en su devolución', NEW.number;
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
CREATE OR REPLACE FUNCTION supplier_payment_voids_check_copy() RETURNS trigger
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
  FROM supplier_payments
  WHERE organization_id = NEW.organization_id AND id = NEW.supplier_payment_id;
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
$$;

CREATE TYPE "public"."supplier_payment_target" AS ENUM('goods_receipt', 'account');--> statement-breakpoint
CREATE TYPE "public"."supplier_payment_void_reason" AS ENUM('not_paid', 'wrong_method', 'wrong_amount', 'wrong_target', 'other');--> statement-breakpoint
ALTER TYPE "public"."audit_entity_type" ADD VALUE 'supplier_payment';--> statement-breakpoint
ALTER TYPE "public"."document_kind" ADD VALUE 'supplier_payment';--> statement-breakpoint
ALTER TYPE "public"."document_kind" ADD VALUE 'supplier_payment_void';--> statement-breakpoint
CREATE TABLE "supplier_payment_voids" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"number" bigint NOT NULL,
	"supplier_payment_id" uuid NOT NULL,
	"currency" text NOT NULL,
	"amount" numeric(14, 2) NOT NULL,
	"reason" "supplier_payment_void_reason" NOT NULL,
	"session_id" uuid,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
	CONSTRAINT "supplier_payment_voids_organization_number_unique" UNIQUE("organization_id","number"),
	CONSTRAINT "supplier_payment_voids_supplier_payment_unique" UNIQUE("supplier_payment_id"),
	CONSTRAINT "supplier_payment_voids_number_positive" CHECK ("supplier_payment_voids"."number" > 0),
	CONSTRAINT "supplier_payment_voids_amount_positive" CHECK ("supplier_payment_voids"."amount" > 0),
	CONSTRAINT "supplier_payment_voids_currency_format" CHECK ("supplier_payment_voids"."currency" ~ '^[A-Z]{3}$')
);
--> statement-breakpoint
CREATE TABLE "supplier_payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"number" bigint NOT NULL,
	"target" "supplier_payment_target" NOT NULL,
	"goods_receipt_id" uuid,
	"supplier_id" uuid NOT NULL,
	"payment_method_id" uuid NOT NULL,
	"session_id" uuid,
	"currency" text NOT NULL,
	"amount" numeric(14, 2) NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
	CONSTRAINT "supplier_payments_organization_number_unique" UNIQUE("organization_id","number"),
	CONSTRAINT "supplier_payments_organization_id_id_unique" UNIQUE("organization_id","id"),
	CONSTRAINT "supplier_payments_target_check" CHECK (("supplier_payments"."target" = 'goods_receipt' AND "supplier_payments"."goods_receipt_id" IS NOT NULL)
        OR ("supplier_payments"."target" = 'account' AND "supplier_payments"."goods_receipt_id" IS NULL)),
	CONSTRAINT "supplier_payments_number_positive" CHECK ("supplier_payments"."number" > 0),
	CONSTRAINT "supplier_payments_amount_positive" CHECK ("supplier_payments"."amount" > 0),
	CONSTRAINT "supplier_payments_currency_format" CHECK ("supplier_payments"."currency" ~ '^[A-Z]{3}$')
);
--> statement-breakpoint
ALTER TABLE "supplier_payment_voids" ADD CONSTRAINT "supplier_payment_voids_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_payment_voids" ADD CONSTRAINT "supplier_payment_voids_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_payment_voids" ADD CONSTRAINT "supplier_payment_voids_supplier_payment_fk" FOREIGN KEY ("organization_id","supplier_payment_id") REFERENCES "public"."supplier_payments"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_payment_voids" ADD CONSTRAINT "supplier_payment_voids_session_fk" FOREIGN KEY ("organization_id","session_id") REFERENCES "public"."cash_sessions"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_payments" ADD CONSTRAINT "supplier_payments_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_payments" ADD CONSTRAINT "supplier_payments_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_payments" ADD CONSTRAINT "supplier_payments_goods_receipt_fk" FOREIGN KEY ("organization_id","goods_receipt_id") REFERENCES "public"."goods_receipts"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_payments" ADD CONSTRAINT "supplier_payments_supplier_fk" FOREIGN KEY ("organization_id","supplier_id") REFERENCES "public"."suppliers"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_payments" ADD CONSTRAINT "supplier_payments_payment_method_fk" FOREIGN KEY ("organization_id","payment_method_id") REFERENCES "public"."payment_methods"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_payments" ADD CONSTRAINT "supplier_payments_session_fk" FOREIGN KEY ("organization_id","session_id") REFERENCES "public"."cash_sessions"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "supplier_payment_voids_session_idx" ON "supplier_payment_voids" USING btree ("organization_id","session_id");--> statement-breakpoint
CREATE INDEX "supplier_payments_supplier_idx" ON "supplier_payments" USING btree ("organization_id","supplier_id");--> statement-breakpoint
CREATE INDEX "supplier_payments_goods_receipt_idx" ON "supplier_payments" USING btree ("organization_id","goods_receipt_id");--> statement-breakpoint
CREATE INDEX "supplier_payments_session_idx" ON "supplier_payments" USING btree ("organization_id","session_id");--> statement-breakpoint
-- Escrito a mano (brief-22.6, D-2 y D-3; ADR 0023, punto 8; ADR 0013). Ningún CHECK ni trigger de
-- esta migración usa los valores nuevos de document_kind ni de audit_entity_type: un valor agregado
-- con ALTER TYPE no se puede usar en la misma transacción (H-8). supplier_payment_target y
-- supplier_payment_void_reason se crean enteros en ella.
--
-- Los dos mueven dinero: son de solo inserción para crm_app, y cash_reject_change() de la 0042
-- rechaza UPDATE y DELETE para cualquier rol, también el dueño.
GRANT SELECT, INSERT ON TABLE supplier_payments TO crm_app;--> statement-breakpoint
GRANT SELECT, INSERT ON TABLE supplier_payment_voids TO crm_app;--> statement-breakpoint
CREATE TRIGGER supplier_payments_insert_only
BEFORE UPDATE OR DELETE ON supplier_payments
FOR EACH ROW EXECUTE FUNCTION cash_reject_change();--> statement-breakpoint
CREATE TRIGGER supplier_payment_voids_insert_only
BEFORE UPDATE OR DELETE ON supplier_payment_voids
FOR EACH ROW EXECUTE FUNCTION cash_reject_change();--> statement-breakpoint
-- Nada entra en una sesión con cierre: la función de la 0042 lee NEW.session_id, y con la sesión nula
-- no encuentra nada.
CREATE TRIGGER supplier_payments_open_session
BEFORE INSERT ON supplier_payments
FOR EACH ROW EXECUTE FUNCTION cash_reject_closed_session();--> statement-breakpoint
CREATE TRIGGER supplier_payment_voids_open_session
BEFORE INSERT ON supplier_payment_voids
FOR EACH ROW EXECUTE FUNCTION cash_reject_closed_session();--> statement-breakpoint
-- El pago en efectivo va en una sesión, y el que no es en efectivo, en ninguna. La función de la 0043
-- lee NEW.payment_method_id y NEW.session_id, que supplier_payments también tiene, como refunds.
CREATE TRIGGER supplier_payments_cash_session
BEFORE INSERT ON supplier_payments
FOR EACH ROW EXECUTE FUNCTION receipts_check_cash_session();--> statement-breakpoint
-- La anulación de un pago copia su moneda y su monto, y la sesión en la que impacta (D-3): la del pago
-- si esa sesión no tiene cierre, y ninguna si lo tiene o si el pago no fue en efectivo, como
-- receipt_voids_check_copy() de la 0045. Si el pago no existe en la organización, lo rechaza después
-- la clave compuesta.
CREATE FUNCTION supplier_payment_voids_check_copy() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  source_currency text;
  source_amount numeric(14, 2);
  source_session uuid;
BEGIN
  SELECT currency, amount, session_id
  INTO source_currency, source_amount, source_session
  FROM supplier_payments
  WHERE organization_id = NEW.organization_id AND id = NEW.supplier_payment_id;
  IF NOT FOUND THEN
    RETURN NEW;
  END IF;
  IF NEW.currency IS DISTINCT FROM source_currency
     OR NEW.amount IS DISTINCT FROM source_amount THEN
    RAISE EXCEPTION 'la anulación % no copia la moneda y el monto de su pago', NEW.number;
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
CREATE TRIGGER supplier_payment_voids_copy_payment
BEFORE INSERT ON supplier_payment_voids
FOR EACH ROW EXECUTE FUNCTION supplier_payment_voids_check_copy();
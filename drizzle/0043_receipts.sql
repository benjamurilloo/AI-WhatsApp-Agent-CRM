CREATE TYPE "public"."receipt_target" AS ENUM('sale');--> statement-breakpoint
ALTER TYPE "public"."audit_entity_type" ADD VALUE 'receipt';--> statement-breakpoint
ALTER TYPE "public"."document_kind" ADD VALUE 'receipt';--> statement-breakpoint
CREATE TABLE "receipts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"number" bigint NOT NULL,
	"target" "receipt_target" NOT NULL,
	"sale_id" uuid,
	"client_id" uuid,
	"payment_method_id" uuid NOT NULL,
	"session_id" uuid,
	"currency" text NOT NULL,
	"amount" numeric(14, 2) NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
	CONSTRAINT "receipts_organization_number_unique" UNIQUE("organization_id","number"),
	CONSTRAINT "receipts_organization_id_id_unique" UNIQUE("organization_id","id"),
	CONSTRAINT "receipts_target_check" CHECK ("receipts"."target" = 'sale' AND "receipts"."sale_id" IS NOT NULL),
	CONSTRAINT "receipts_number_positive" CHECK ("receipts"."number" > 0),
	CONSTRAINT "receipts_amount_positive" CHECK ("receipts"."amount" > 0),
	CONSTRAINT "receipts_currency_format" CHECK ("receipts"."currency" ~ '^[A-Z]{3}$')
);
--> statement-breakpoint
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_sale_fk" FOREIGN KEY ("organization_id","sale_id") REFERENCES "public"."sales"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_client_fk" FOREIGN KEY ("organization_id","client_id") REFERENCES "public"."clients"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_payment_method_fk" FOREIGN KEY ("organization_id","payment_method_id") REFERENCES "public"."payment_methods"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_session_fk" FOREIGN KEY ("organization_id","session_id") REFERENCES "public"."cash_sessions"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "receipts_sale_idx" ON "receipts" USING btree ("organization_id","sale_id");--> statement-breakpoint
CREATE INDEX "receipts_client_idx" ON "receipts" USING btree ("organization_id","client_id");--> statement-breakpoint
CREATE INDEX "receipts_session_idx" ON "receipts" USING btree ("organization_id","session_id");--> statement-breakpoint
-- Escrito a mano (brief-21.3, D-1; ADR 0022, puntos 2 y 8; ADR 0013).
--
-- El cobro mueve dinero: es de solo inserción para crm_app, y el trigger de la 0042 rechaza UPDATE
-- y DELETE para cualquier rol, también el dueño.
GRANT SELECT, INSERT ON TABLE receipts TO crm_app;--> statement-breakpoint
CREATE TRIGGER receipts_insert_only
BEFORE UPDATE OR DELETE ON receipts
FOR EACH ROW EXECUTE FUNCTION cash_reject_change();--> statement-breakpoint
-- Un cobro en efectivo no entra en una sesión con cierre (brief-21.3, H-3). La función de la 0042
-- lee NEW.session_id: con la sesión nula, la de un cobro que no es en efectivo, no encuentra nada.
CREATE TRIGGER receipts_open_session
BEFORE INSERT ON receipts
FOR EACH ROW EXECUTE FUNCTION cash_reject_closed_session();--> statement-breakpoint
-- El efectivo y su sesión (ADR 0022, punto 8; brief-21.3, H-4): un cobro en efectivo está en una
-- sesión, y uno que no es en efectivo, en ninguna. «Es efectivo» vive en payment_methods, del mismo
-- módulo, y no se edita (trigger payment_methods_fixed de la 0042). Un medio que no existe en la
-- organización lo rechaza después la clave compuesta. Que la sesión sea la abierta lo asegura el
-- servicio con el bloqueo de cobros, y cash_reject_closed_session() lo confirmado.
CREATE FUNCTION receipts_check_cash_session() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  method_is_cash boolean;
BEGIN
  SELECT is_cash INTO method_is_cash FROM payment_methods
  WHERE organization_id = NEW.organization_id AND id = NEW.payment_method_id;
  IF method_is_cash IS NULL THEN
    RETURN NEW;
  END IF;
  IF method_is_cash AND NEW.session_id IS NULL THEN
    RAISE EXCEPTION 'un cobro en efectivo necesita una sesión de caja';
  END IF;
  IF NOT method_is_cash AND NEW.session_id IS NOT NULL THEN
    RAISE EXCEPTION 'un cobro que no es en efectivo no va en una sesión de caja';
  END IF;
  RETURN NEW;
END
$$;--> statement-breakpoint
CREATE TRIGGER receipts_cash_session
BEFORE INSERT ON receipts
FOR EACH ROW EXECUTE FUNCTION receipts_check_cash_session();
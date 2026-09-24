ALTER TYPE "public"."audit_action" ADD VALUE 'price_change';--> statement-breakpoint
CREATE TABLE "product_prices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"amount" numeric(14, 2) NOT NULL,
	"currency" text NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
	CONSTRAINT "product_prices_amount_positive" CHECK ("product_prices"."amount" > 0),
	CONSTRAINT "product_prices_currency_format" CHECK ("product_prices"."currency" ~ '^[A-Z]{3}$')
);
--> statement-breakpoint
ALTER TABLE "product_prices" ADD CONSTRAINT "product_prices_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_prices" ADD CONSTRAINT "product_prices_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_prices" ADD CONSTRAINT "product_prices_product_fk" FOREIGN KEY ("organization_id","product_id") REFERENCES "public"."products"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "product_prices_product_history_idx" ON "product_prices" USING btree ("organization_id","product_id","created_at" DESC NULLS LAST);--> statement-breakpoint
-- Escrito a mano (brief-11.1, D-5; ADR 0013): product_prices es de solo inserción, como
-- inventory_movements en la 0005. crm_app solo lee e inserta.
GRANT SELECT, INSERT ON TABLE product_prices TO crm_app;--> statement-breakpoint
-- Segunda defensa, efectiva para cualquier rol mientras la aplicación se conecte con el dueño.
-- Usa el SQLSTATE P0001, distinto de 42501, para distinguirla del rechazo por permisos.
CREATE FUNCTION product_prices_reject_change() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'product_prices es de solo inserción: % rechazado', TG_OP;
END
$$;--> statement-breakpoint
CREATE TRIGGER product_prices_insert_only
BEFORE UPDATE OR DELETE ON product_prices
FOR EACH ROW EXECUTE FUNCTION product_prices_reject_change();

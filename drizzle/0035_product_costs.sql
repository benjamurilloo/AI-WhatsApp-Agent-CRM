ALTER TYPE "public"."audit_action" ADD VALUE 'cost_change';--> statement-breakpoint
CREATE TABLE "product_costs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"amount" numeric(14, 2) NOT NULL,
	"currency" text NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
	CONSTRAINT "product_costs_amount_positive" CHECK ("product_costs"."amount" > 0),
	CONSTRAINT "product_costs_currency_format" CHECK ("product_costs"."currency" ~ '^[A-Z]{3}$')
);
--> statement-breakpoint
ALTER TABLE "product_costs" ADD CONSTRAINT "product_costs_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_costs" ADD CONSTRAINT "product_costs_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_costs" ADD CONSTRAINT "product_costs_product_fk" FOREIGN KEY ("organization_id","product_id") REFERENCES "public"."products"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "product_costs_product_history_idx" ON "product_costs" USING btree ("organization_id","product_id","created_at" DESC NULLS LAST);--> statement-breakpoint
-- Escrito a mano (brief-18.2; ADR 0013): product_costs es de solo inserción, como
-- product_prices en la 0017. crm_app solo lee e inserta.
GRANT SELECT, INSERT ON TABLE product_costs TO crm_app;--> statement-breakpoint
-- Segunda defensa, efectiva para cualquier rol. SQLSTATE P0001, distinto de 42501.
CREATE FUNCTION product_costs_reject_change() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'product_costs es de solo inserción: % rechazado', TG_OP;
END
$$;--> statement-breakpoint
CREATE TRIGGER product_costs_insert_only
BEFORE UPDATE OR DELETE ON product_costs
FOR EACH ROW EXECUTE FUNCTION product_costs_reject_change();

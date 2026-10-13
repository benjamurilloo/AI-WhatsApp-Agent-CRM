ALTER TYPE "public"."audit_entity_type" ADD VALUE 'sale';--> statement-breakpoint
ALTER TYPE "public"."document_kind" ADD VALUE 'sale';--> statement-breakpoint
CREATE TABLE "sale_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"sale_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"position" smallint NOT NULL,
	"quantity" numeric(14, 3) NOT NULL,
	"unit_price" numeric(14, 2) NOT NULL,
	"currency" text NOT NULL,
	"line_total" numeric(14, 2) NOT NULL,
	CONSTRAINT "sale_lines_sale_product_unique" UNIQUE("sale_id","product_id"),
	CONSTRAINT "sale_lines_sale_position_unique" UNIQUE("sale_id","position"),
	CONSTRAINT "sale_lines_position_positive" CHECK ("sale_lines"."position" > 0),
	CONSTRAINT "sale_lines_quantity_positive" CHECK ("sale_lines"."quantity" > 0),
	CONSTRAINT "sale_lines_unit_price_positive" CHECK ("sale_lines"."unit_price" > 0),
	CONSTRAINT "sale_lines_line_total_positive" CHECK ("sale_lines"."line_total" > 0),
	CONSTRAINT "sale_lines_currency_format" CHECK ("sale_lines"."currency" ~ '^[A-Z]{3}$')
);
--> statement-breakpoint
CREATE TABLE "sales" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"number" bigint NOT NULL,
	"order_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"currency" text NOT NULL,
	"total" numeric(14, 2) NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
	CONSTRAINT "sales_organization_number_unique" UNIQUE("organization_id","number"),
	CONSTRAINT "sales_organization_id_id_unique" UNIQUE("organization_id","id"),
	CONSTRAINT "sales_number_positive" CHECK ("sales"."number" > 0),
	CONSTRAINT "sales_total_positive" CHECK ("sales"."total" > 0),
	CONSTRAINT "sales_currency_format" CHECK ("sales"."currency" ~ '^[A-Z]{3}$')
);
--> statement-breakpoint
ALTER TABLE "sale_lines" ADD CONSTRAINT "sale_lines_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sale_lines" ADD CONSTRAINT "sale_lines_sale_fk" FOREIGN KEY ("organization_id","sale_id") REFERENCES "public"."sales"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sale_lines" ADD CONSTRAINT "sale_lines_product_fk" FOREIGN KEY ("organization_id","product_id") REFERENCES "public"."products"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales" ADD CONSTRAINT "sales_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales" ADD CONSTRAINT "sales_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales" ADD CONSTRAINT "sales_order_fk" FOREIGN KEY ("organization_id","order_id") REFERENCES "public"."orders"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales" ADD CONSTRAINT "sales_client_fk" FOREIGN KEY ("organization_id","client_id") REFERENCES "public"."clients"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "sales_organization_order_unique" ON "sales" USING btree ("organization_id","order_id");--> statement-breakpoint
CREATE INDEX "sales_list_idx" ON "sales" USING btree ("organization_id","created_at" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "sales_client_idx" ON "sales" USING btree ("organization_id","client_id","created_at" DESC NULLS LAST);--> statement-breakpoint
-- Escrito a mano (brief-20.2; ADR 0021, puntos 2 y 7; ADR 0013).
--
-- La venta es un comprobante emitido: sales y sale_lines son de solo inserción para crm_app.
GRANT SELECT, INSERT ON TABLE sales TO crm_app;--> statement-breakpoint
GRANT SELECT, INSERT ON TABLE sale_lines TO crm_app;--> statement-breakpoint
-- Segunda defensa, para cualquier rol, como order_lines en la 0036. SQLSTATE P0001, distinto de
-- 42501. Una venta se anula con otro comprobante (20.4), nunca cambiándola.
CREATE FUNCTION sales_reject_change() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION '% es de solo inserción: % rechazado', TG_TABLE_NAME, TG_OP;
END
$$;--> statement-breakpoint
CREATE TRIGGER sales_insert_only
BEFORE UPDATE OR DELETE ON sales
FOR EACH ROW EXECUTE FUNCTION sales_reject_change();--> statement-breakpoint
CREATE TRIGGER sale_lines_insert_only
BEFORE UPDATE OR DELETE ON sale_lines
FOR EACH ROW EXECUTE FUNCTION sales_reject_change();

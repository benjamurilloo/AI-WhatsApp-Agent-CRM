ALTER TYPE "public"."audit_entity_type" ADD VALUE 'trade_in_settings';--> statement-breakpoint
ALTER TYPE "public"."audit_entity_type" ADD VALUE 'trade_in_margin';--> statement-breakpoint
CREATE TABLE "trade_in_margins" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"model_id" uuid NOT NULL,
	"amount" numeric(14, 2) NOT NULL,
	"currency" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "trade_in_margins_organization_model_unique" UNIQUE("organization_id","model_id"),
	CONSTRAINT "trade_in_margins_amount_not_negative" CHECK ("trade_in_margins"."amount" >= 0),
	CONSTRAINT "trade_in_margins_currency_format" CHECK ("trade_in_margins"."currency" ~ '^[A-Z]{3}$')
);
--> statement-breakpoint
CREATE TABLE "trade_in_settings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"battery_threshold" smallint NOT NULL,
	"range_percent" numeric(4, 2) NOT NULL,
	"rounding_step" numeric(14, 2) NOT NULL,
	"rounding_currency" text NOT NULL,
	"battery_repair_type_id" uuid,
	"is_example" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "trade_in_settings_organization_unique" UNIQUE("organization_id"),
	CONSTRAINT "trade_in_settings_battery_threshold_range" CHECK ("trade_in_settings"."battery_threshold" between 1 and 100),
	CONSTRAINT "trade_in_settings_range_percent_range" CHECK ("trade_in_settings"."range_percent" between 0 and 50),
	CONSTRAINT "trade_in_settings_rounding_step_positive" CHECK ("trade_in_settings"."rounding_step" > 0),
	CONSTRAINT "trade_in_settings_rounding_currency_format" CHECK ("trade_in_settings"."rounding_currency" ~ '^[A-Z]{3}$')
);
--> statement-breakpoint
ALTER TABLE "trade_in_checklist_items" ADD COLUMN "repair_type_id" uuid;--> statement-breakpoint
ALTER TABLE "trade_in_margins" ADD CONSTRAINT "trade_in_margins_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trade_in_margins" ADD CONSTRAINT "trade_in_margins_model_fk" FOREIGN KEY ("organization_id","model_id") REFERENCES "public"."product_models"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trade_in_settings" ADD CONSTRAINT "trade_in_settings_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trade_in_settings" ADD CONSTRAINT "trade_in_settings_battery_repair_type_fk" FOREIGN KEY ("organization_id","battery_repair_type_id") REFERENCES "public"."repair_types"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trade_in_checklist_items" ADD CONSTRAINT "trade_in_checklist_items_repair_type_fk" FOREIGN KEY ("organization_id","repair_type_id") REFERENCES "public"."repair_types"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
-- La cotización de un usado (brief-29.7.3, D-1 a D-3 y D-6). Ningún CHECK, trigger ni dato de esta
-- migración nombra los valores que agrega arriba con ALTER TYPE (trade_in_settings, trade_in_margin):
-- scripts/migrar.ts aplica las pendientes en una transacción. Sin datos: los valores sueltos y el tipo
-- de reparación de cada punto los escribe org:capability (U-4).
--
-- Permisos de crm_app: los valores sueltos y los márgenes se editan, nunca se borran. El tipo de
-- reparación de un punto es una columna de una tabla que ya se editaba.
GRANT SELECT, INSERT, UPDATE ON TABLE trade_in_settings TO crm_app;--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON TABLE trade_in_margins TO crm_app;

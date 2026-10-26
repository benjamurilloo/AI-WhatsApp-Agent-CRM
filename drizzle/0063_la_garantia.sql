ALTER TYPE "public"."audit_entity_type" ADD VALUE 'unit_settings';--> statement-breakpoint
ALTER TYPE "public"."audit_entity_type" ADD VALUE 'service_settings';--> statement-breakpoint
CREATE TABLE "unit_settings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"warranty_days" smallint NOT NULL,
	"is_example" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "unit_settings_organization_unique" UNIQUE("organization_id"),
	CONSTRAINT "unit_settings_warranty_days_range" CHECK ("unit_settings"."warranty_days" between 0 and 3650)
);
--> statement-breakpoint
CREATE TABLE "service_settings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"warranty_days" smallint NOT NULL,
	"is_example" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "service_settings_organization_unique" UNIQUE("organization_id"),
	CONSTRAINT "service_settings_warranty_days_range" CHECK ("service_settings"."warranty_days" between 0 and 3650)
);
--> statement-breakpoint
ALTER TABLE "stock_units" ADD COLUMN "warranty_days" smallint;--> statement-breakpoint
ALTER TABLE "unit_settings" ADD CONSTRAINT "unit_settings_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_settings" ADD CONSTRAINT "service_settings_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_units" ADD CONSTRAINT "stock_units_warranty_days_range" CHECK ("stock_units"."warranty_days" between 0 and 3650);--> statement-breakpoint
-- La garantía (brief-29.9, D-1 y D-5). Ningún CHECK, trigger ni dato de esta migración nombra los
-- valores que agrega arriba con ALTER TYPE (unit_settings, service_settings): scripts/migrar.ts aplica
-- las pendientes en una transacción. Sin datos: las filas las crea org:capability con los días del
-- perfil, y una unidad sin días toma los de su organización. La garantía se deriva y no se guarda.
--
-- stock_units.warranty_days queda editable para crm_app: el trigger stock_units_guard_change (0060)
-- enumera lo que no cambia, y una unidad dada de baja sigue sin cambiar nada.
--
-- Permisos de crm_app: los valores sueltos se editan, nunca se borran, como trade_in_settings (0062).
GRANT SELECT, INSERT, UPDATE ON TABLE unit_settings TO crm_app;--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON TABLE service_settings TO crm_app;

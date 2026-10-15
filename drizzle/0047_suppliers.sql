ALTER TYPE "public"."audit_entity_type" ADD VALUE 'supplier';--> statement-breakpoint
CREATE TABLE "suppliers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"name" text NOT NULL,
	"phone_e164" text,
	"email" text,
	"cuit" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "suppliers_organization_id_id_unique" UNIQUE("organization_id","id"),
	CONSTRAINT "suppliers_name_length" CHECK (char_length("suppliers"."name") between 1 and 120),
	CONSTRAINT "suppliers_name_trimmed" CHECK ("suppliers"."name" = btrim("suppliers"."name")),
	CONSTRAINT "suppliers_phone_e164_format" CHECK ("suppliers"."phone_e164" ~ '^\+[1-9][0-9]{1,14}$'),
	CONSTRAINT "suppliers_email_format" CHECK ("suppliers"."email" = lower("suppliers"."email") and char_length("suppliers"."email") <= 254 and position('@' in "suppliers"."email") > 1),
	CONSTRAINT "suppliers_cuit_format" CHECK ("suppliers"."cuit" ~ '^[0-9]{11}$')
);
--> statement-breakpoint
ALTER TABLE "suppliers" ADD CONSTRAINT "suppliers_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "suppliers_organization_name_lower_unique" ON "suppliers" USING btree ("organization_id",lower("name"));--> statement-breakpoint
CREATE UNIQUE INDEX "suppliers_organization_cuit_unique" ON "suppliers" USING btree ("organization_id","cuit") WHERE "suppliers"."cuit" IS NOT NULL;--> statement-breakpoint
-- El proveedor es editable y se desactiva, no se borra (regla 8; ADR 0023, punto 2; brief-22.2, D-1).
GRANT SELECT, INSERT, UPDATE ON TABLE suppliers TO crm_app;

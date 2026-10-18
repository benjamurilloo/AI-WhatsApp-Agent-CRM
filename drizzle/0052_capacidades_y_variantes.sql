CREATE TYPE "public"."attribute_entity" AS ENUM('product');--> statement-breakpoint
CREATE TYPE "public"."attribute_type" AS ENUM('text', 'number', 'boolean', 'option');--> statement-breakpoint
CREATE TYPE "public"."capability" AS ENUM('variants');--> statement-breakpoint
ALTER TYPE "public"."audit_entity_type" ADD VALUE 'organization_capability';--> statement-breakpoint
ALTER TYPE "public"."audit_entity_type" ADD VALUE 'product_model';--> statement-breakpoint
ALTER TYPE "public"."audit_entity_type" ADD VALUE 'attribute_definition';--> statement-breakpoint
CREATE TABLE "attribute_definitions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"entity" "attribute_entity" NOT NULL,
	"key" text NOT NULL,
	"name" text NOT NULL,
	"type" "attribute_type" NOT NULL,
	"is_required" boolean DEFAULT false NOT NULL,
	"is_variant" boolean DEFAULT false NOT NULL,
	"position" smallint DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "attribute_definitions_organization_entity_key_unique" UNIQUE("organization_id","entity","key"),
	CONSTRAINT "attribute_definitions_organization_id_id_unique" UNIQUE("organization_id","id"),
	CONSTRAINT "attribute_definitions_key_format" CHECK ("attribute_definitions"."key" ~ '^[a-z][a-z0-9_]{0,39}$'),
	CONSTRAINT "attribute_definitions_name_length" CHECK (char_length("attribute_definitions"."name") between 1 and 60),
	CONSTRAINT "attribute_definitions_variant_rule" CHECK (not "attribute_definitions"."is_variant" or ("attribute_definitions"."type" = 'option' and "attribute_definitions"."is_required" and "attribute_definitions"."entity" = 'product')),
	CONSTRAINT "attribute_definitions_position_range" CHECK ("attribute_definitions"."position" >= 0)
);
--> statement-breakpoint
CREATE TABLE "attribute_options" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"definition_id" uuid NOT NULL,
	"label" text NOT NULL,
	"position" smallint DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "attribute_options_organization_definition_id_unique" UNIQUE("organization_id","definition_id","id"),
	CONSTRAINT "attribute_options_label_length" CHECK (char_length("attribute_options"."label") between 1 and 60),
	CONSTRAINT "attribute_options_position_range" CHECK ("attribute_options"."position" >= 0)
);
--> statement-breakpoint
CREATE TABLE "attribute_values" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"definition_id" uuid NOT NULL,
	"text_value" text,
	"number_value" numeric(14, 3),
	"boolean_value" boolean,
	"option_id" uuid,
	CONSTRAINT "attribute_values_product_definition_unique" UNIQUE("organization_id","product_id","definition_id"),
	CONSTRAINT "attribute_values_exactly_one" CHECK (num_nonnulls("attribute_values"."text_value", "attribute_values"."number_value", "attribute_values"."boolean_value", "attribute_values"."option_id") = 1),
	CONSTRAINT "attribute_values_text_length" CHECK (char_length("attribute_values"."text_value") between 1 and 200)
);
--> statement-breakpoint
CREATE TABLE "product_models" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"name" text NOT NULL,
	"brand" text,
	"position" smallint DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "product_models_organization_id_id_unique" UNIQUE("organization_id","id"),
	CONSTRAINT "product_models_name_length" CHECK (char_length("product_models"."name") between 1 and 120),
	CONSTRAINT "product_models_brand_length" CHECK (char_length("product_models"."brand") between 1 and 100),
	CONSTRAINT "product_models_position_range" CHECK ("product_models"."position" >= 0)
);
--> statement-breakpoint
CREATE TABLE "organization_capabilities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"capability" "capability" NOT NULL,
	"activated_by" uuid NOT NULL,
	"activated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "organization_capabilities_organization_capability_unique" UNIQUE("organization_id","capability")
);
--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "model_id" uuid;--> statement-breakpoint
ALTER TABLE "attribute_definitions" ADD CONSTRAINT "attribute_definitions_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attribute_options" ADD CONSTRAINT "attribute_options_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attribute_options" ADD CONSTRAINT "attribute_options_definition_fk" FOREIGN KEY ("organization_id","definition_id") REFERENCES "public"."attribute_definitions"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attribute_values" ADD CONSTRAINT "attribute_values_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attribute_values" ADD CONSTRAINT "attribute_values_product_fk" FOREIGN KEY ("organization_id","product_id") REFERENCES "public"."products"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attribute_values" ADD CONSTRAINT "attribute_values_definition_fk" FOREIGN KEY ("organization_id","definition_id") REFERENCES "public"."attribute_definitions"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attribute_values" ADD CONSTRAINT "attribute_values_option_fk" FOREIGN KEY ("organization_id","definition_id","option_id") REFERENCES "public"."attribute_options"("organization_id","definition_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_models" ADD CONSTRAINT "product_models_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_capabilities" ADD CONSTRAINT "organization_capabilities_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_capabilities" ADD CONSTRAINT "organization_capabilities_activated_by_users_id_fk" FOREIGN KEY ("activated_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "attribute_options_definition_label_lower_unique" ON "attribute_options" USING btree ("organization_id","definition_id",lower("label"));--> statement-breakpoint
CREATE INDEX "attribute_values_definition_idx" ON "attribute_values" USING btree ("organization_id","definition_id");--> statement-breakpoint
CREATE UNIQUE INDEX "product_models_organization_name_lower_unique" ON "product_models" USING btree ("organization_id",lower("name"));--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_model_fk" FOREIGN KEY ("organization_id","model_id") REFERENCES "public"."product_models"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "products_model_idx" ON "products" USING btree ("organization_id","model_id") WHERE "products"."model_id" is not null;--> statement-breakpoint
-- Permisos de crm_app (brief-29.2): las capacidades no se editan ni se borran (no se desactivan sin
-- ADR); modelos, definiciones y opciones se editan y se desactivan, nunca se borran; un valor de
-- atributo se cambia o se quita con su producto.
GRANT SELECT, INSERT ON TABLE organization_capabilities TO crm_app;--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON TABLE product_models TO crm_app;--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON TABLE attribute_definitions TO crm_app;--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON TABLE attribute_options TO crm_app;--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE attribute_values TO crm_app;

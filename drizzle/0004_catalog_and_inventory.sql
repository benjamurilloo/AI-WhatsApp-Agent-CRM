CREATE TYPE "public"."inventory_movement_type" AS ENUM('adjustment_positive', 'adjustment_negative');--> statement-breakpoint
CREATE TABLE "products" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"sku" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"unit" text DEFAULT 'unidad' NOT NULL,
	"reorder_point" numeric(14, 3) DEFAULT '0' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "products_organization_id_id_unique" UNIQUE("organization_id","id"),
	CONSTRAINT "products_reorder_point_non_negative" CHECK ("products"."reorder_point" >= 0)
);
--> statement-breakpoint
CREATE TABLE "inventories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"quantity_on_hand" numeric(14, 3) DEFAULT '0' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "inventories_product_id_unique" UNIQUE("product_id"),
	CONSTRAINT "inventories_quantity_on_hand_non_negative" CHECK ("inventories"."quantity_on_hand" >= 0)
);
--> statement-breakpoint
CREATE TABLE "inventory_movements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"type" "inventory_movement_type" NOT NULL,
	"quantity" numeric(14, 3) NOT NULL,
	"balance_after" numeric(14, 3) NOT NULL,
	"reason" text NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "inventory_movements_quantity_positive" CHECK ("inventory_movements"."quantity" > 0),
	CONSTRAINT "inventory_movements_balance_after_non_negative" CHECK ("inventory_movements"."balance_after" >= 0),
	CONSTRAINT "inventory_movements_reason_not_blank" CHECK (btrim("inventory_movements"."reason") <> '')
);
--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventories" ADD CONSTRAINT "inventories_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventories" ADD CONSTRAINT "inventories_product_fk" FOREIGN KEY ("organization_id","product_id") REFERENCES "public"."products"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_product_fk" FOREIGN KEY ("organization_id","product_id") REFERENCES "public"."products"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "products_organization_sku_lower_unique" ON "products" USING btree ("organization_id",lower("sku"));--> statement-breakpoint
CREATE INDEX "products_organization_name_idx" ON "products" USING btree ("organization_id","name" text_pattern_ops);--> statement-breakpoint
CREATE INDEX "inventory_movements_product_history_idx" ON "inventory_movements" USING btree ("organization_id","product_id","created_at" DESC NULLS LAST);
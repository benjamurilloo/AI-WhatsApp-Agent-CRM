CREATE TABLE "product_images" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"position" smallint DEFAULT 0 NOT NULL,
	"image" "bytea" NOT NULL,
	"thumbnail" "bytea" NOT NULL,
	"sha256" text NOT NULL,
	"width" smallint NOT NULL,
	"height" smallint NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "product_images_single_position" CHECK ("product_images"."position" = 0),
	CONSTRAINT "product_images_image_size" CHECK (octet_length("product_images"."image") between 1 and 2097152),
	CONSTRAINT "product_images_thumbnail_size" CHECK (octet_length("product_images"."thumbnail") between 1 and 204800),
	CONSTRAINT "product_images_sha256_format" CHECK ("product_images"."sha256" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "product_images_dimensions" CHECK ("product_images"."width" between 1 and 1600 and "product_images"."height" between 1 and 1600)
);
--> statement-breakpoint
ALTER TABLE "product_images" ADD CONSTRAINT "product_images_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_images" ADD CONSTRAINT "product_images_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_images" ADD CONSTRAINT "product_images_product_fk" FOREIGN KEY ("organization_id","product_id") REFERENCES "public"."products"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "product_images_product_position_unique" ON "product_images" USING btree ("organization_id","product_id","position");--> statement-breakpoint
-- Privilegios de las imágenes de producto (brief-17.5, D-3; ADR 0013). Una imagen se sube y se
-- quita, nunca se edita: reemplazarla es borrar e insertar en una transacción. Sin UPDATE.
GRANT SELECT, INSERT, DELETE ON TABLE product_images TO crm_app;

CREATE TYPE "public"."goods_receipt_void_reason" AS ENUM('data_entry_error', 'duplicate', 'returned_to_supplier', 'other');--> statement-breakpoint
ALTER TYPE "public"."inventory_movement_type" ADD VALUE 'goods_receipt_void';--> statement-breakpoint
ALTER TYPE "public"."document_kind" ADD VALUE 'goods_receipt_void';--> statement-breakpoint
CREATE TABLE "goods_receipt_voids" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"number" bigint NOT NULL,
	"goods_receipt_id" uuid NOT NULL,
	"currency" text NOT NULL,
	"total" numeric(14, 2) NOT NULL,
	"reason" "goods_receipt_void_reason" NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
	CONSTRAINT "goods_receipt_voids_organization_number_unique" UNIQUE("organization_id","number"),
	CONSTRAINT "goods_receipt_voids_goods_receipt_unique" UNIQUE("goods_receipt_id"),
	CONSTRAINT "goods_receipt_voids_number_positive" CHECK ("goods_receipt_voids"."number" > 0),
	CONSTRAINT "goods_receipt_voids_total_positive" CHECK ("goods_receipt_voids"."total" > 0),
	CONSTRAINT "goods_receipt_voids_currency_format" CHECK ("goods_receipt_voids"."currency" ~ '^[A-Z]{3}$')
);
--> statement-breakpoint
ALTER TABLE "goods_receipt_voids" ADD CONSTRAINT "goods_receipt_voids_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goods_receipt_voids" ADD CONSTRAINT "goods_receipt_voids_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goods_receipt_voids" ADD CONSTRAINT "goods_receipt_voids_receipt_fk" FOREIGN KEY ("organization_id","goods_receipt_id") REFERENCES "public"."goods_receipts"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
-- Escrito a mano (brief-22.5, D-1; ADR 0023, punto 6; ADR 0013). Ningún CHECK ni trigger de esta
-- migración usa los valores nuevos de inventory_movement_type ni de document_kind: un valor agregado
-- con ALTER TYPE no se puede usar en la misma transacción (H-5). goods_receipt_void_reason se crea
-- entero en ella.
--
-- La anulación es un comprobante emitido: crm_app la lee y la inserta, nunca la cambia ni la borra.
GRANT SELECT, INSERT ON TABLE goods_receipt_voids TO crm_app;--> statement-breakpoint
-- Para cualquier rol: rechaza UPDATE y DELETE, y en el INSERT exige que la moneda y el total sean los
-- de su recepción, como sale_voids_copy_sale (0041). Si la recepción no existe en la organización, la
-- clave foránea lo rechaza después.
CREATE FUNCTION goods_receipt_voids_check() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  receipt_currency text;
  receipt_total numeric(14, 2);
BEGIN
  IF TG_OP <> 'INSERT' THEN
    RAISE EXCEPTION 'goods_receipt_voids es de solo inserción: % rechazado', TG_OP;
  END IF;
  SELECT currency, total INTO receipt_currency, receipt_total
  FROM goods_receipts
  WHERE organization_id = NEW.organization_id AND id = NEW.goods_receipt_id;
  IF FOUND AND (NEW.currency IS DISTINCT FROM receipt_currency
                OR NEW.total IS DISTINCT FROM receipt_total) THEN
    RAISE EXCEPTION 'la anulación % no copia la moneda y el total de su recepción', NEW.number;
  END IF;
  RETURN NEW;
END
$$;--> statement-breakpoint
CREATE TRIGGER goods_receipt_voids_guard
BEFORE INSERT OR UPDATE OR DELETE ON goods_receipt_voids
FOR EACH ROW EXECUTE FUNCTION goods_receipt_voids_check();

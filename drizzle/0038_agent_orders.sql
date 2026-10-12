-- brief-19.4, D-4: el pedido del agente lleva la credencial como actor y el evento que lo creó.
-- El UNIQUE de ingestion_events va primero: es el destino de la clave foránea compuesta.
ALTER TABLE "ingestion_events" ADD CONSTRAINT "ingestion_events_organization_id_id_unique" UNIQUE("organization_id","id");--> statement-breakpoint
ALTER TABLE "orders" ALTER COLUMN "created_by" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "created_by_credential_id" uuid;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "ingestion_event_id" uuid;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_created_by_credential_fk" FOREIGN KEY ("organization_id","created_by_credential_id") REFERENCES "public"."ingestion_credentials"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_ingestion_event_fk" FOREIGN KEY ("organization_id","ingestion_event_id") REFERENCES "public"."ingestion_events"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_ingestion_event_unique" UNIQUE("ingestion_event_id");--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_one_creator" CHECK (num_nonnulls("orders"."created_by", "orders"."created_by_credential_id") = 1);--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_event_iff_credential" CHECK (("orders"."ingestion_event_id" is null) = ("orders"."created_by_credential_id" is null));
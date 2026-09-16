import { sql } from "drizzle-orm";
import {
  check,
  index,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { organizations } from "@/modules/organizations/schema";

// docs/architecture/DataModel.md, tabla ingestion_events (brief-6.1).
// Registro de idempotencia del contrato de ingestión: su lógica llega en la 6.5.2.
// crm_app no puede borrar, y un trigger rechaza el borrado y los cambios de identidad (D-3).

export const ingestionEventStatus = pgEnum("ingestion_event_status", [
  "received",
  "processed",
  "failed",
]);

export const ingestionEvents = pgTable(
  "ingestion_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "restrict" }),
    source: text("source").notNull(),
    // Id del evento en el origen: nunca se arma con teléfono ni contenido del mensaje.
    externalRef: text("external_ref").notNull(),
    eventType: text("event_type").notNull(),
    // Detecta reenvíos con otro contenido; el algoritmo lo fija el contrato (6.5.1).
    payloadHash: text("payload_hash").notNull(),
    status: ingestionEventStatus("status").notNull().default("received"),
    // Código normalizado de la taxonomía; nunca payload, headers ni credenciales.
    errorCode: text("error_code"),
    receivedAt: timestamp("received_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    processedAt: timestamp("processed_at", { withTimezone: true }),
  },
  (table) => [
    // Reserva atómica: INSERT ... ON CONFLICT ON CONSTRAINT (6.5.2).
    unique("ingestion_events_organization_source_external_ref_unique").on(
      table.organizationId,
      table.source,
      table.externalRef,
    ),
    // Métrica 12.
    index("ingestion_events_organization_received_idx").on(
      table.organizationId,
      table.receivedAt,
    ),
    // Identidad del evento no vacía y estado coherente con sus columnas (D-2).
    check(
      "ingestion_events_identity_not_blank",
      sql`btrim(${table.source}) <> '' AND btrim(${table.externalRef}) <> '' AND btrim(${table.eventType}) <> '' AND btrim(${table.payloadHash}) <> ''`,
    ),
    check(
      "ingestion_events_processed_at_matches_status",
      sql`(${table.status} = 'received') = (${table.processedAt} IS NULL)`,
    ),
    check(
      "ingestion_events_error_code_matches_status",
      sql`(${table.status} = 'failed') = (${table.errorCode} IS NOT NULL)`,
    ),
  ],
);

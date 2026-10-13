import { sql } from "drizzle-orm";
import {
  bigint,
  check,
  pgEnum,
  pgTable,
  primaryKey,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { organizations } from "@/modules/organizations/schema";

// docs/architecture/DataModel.md, tabla document_counters (ADR 0019, punto 2; ADR 0020, punto 2;
// brief-19.2). Un contador por organización y tipo de documento numerado, sin huecos: la fila se
// crea en el primer número y se incrementa en la misma transacción que crea el documento.

// Tipos numerados: el pedido y, desde la 20.2, la venta (ADR 0021, punto 7), con ALTER TYPE
// aditivos; desde la 20.4, la anulación (sale_void, brief-20.4).
export const documentKind = pgEnum("document_kind", [
  "order",
  "sale",
  "sale_void",
]);

export const documentCounters = pgTable(
  "document_counters",
  {
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "restrict" }),
    kind: documentKind("kind").notNull(),
    // El último número entregado. Nace en 0 y solo sube de a uno: lo exige el trigger de la 0036
    // (brief-19.2, D-2).
    lastNumber: bigint("last_number", { mode: "number" }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    primaryKey({
      name: "document_counters_pkey",
      columns: [table.organizationId, table.kind],
    }),
    check(
      "document_counters_last_number_non_negative",
      sql`${table.lastNumber} >= 0`,
    ),
  ],
);

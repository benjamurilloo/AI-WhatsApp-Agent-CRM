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
import { users } from "@/modules/auth/schema";

// docs/architecture/DataModel.md, tablas organizations y organization_members (brief-3.1).
export const organizations = pgTable(
  "organizations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    timezone: text("timezone")
      .notNull()
      .default("America/Argentina/Buenos_Aires"),
    // La moneda principal (ADR 0025, punto 2; brief-29.4, D-2): opcional, y sin ella el CRM se
    // comporta como siempre. La fija quien opera el CRM con org:currency, una sola vez; que sea de
    // las monedas aceptadas lo valida el servicio, como en los precios.
    mainCurrency: text("main_currency"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    check(
      "organizations_main_currency_format",
      sql`${table.mainCurrency} IS NULL OR ${table.mainCurrency} ~ '^[A-Z]{3}$'`,
    ),
  ],
);

// ENUM de PostgreSQL (brief-3.1, D-2).
export const memberRole = pgEnum("member_role", ["admin", "viewer"]);

export const organizationMembers = pgTable(
  "organization_members",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    // Un usuario pertenece a una sola organización en el MVP (ADR 0010).
    userId: uuid("user_id")
      .notNull()
      .unique()
      .references(() => users.id, { onDelete: "cascade" }),
    role: memberRole("role").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index("organization_members_organization_id_idx").on(table.organizationId),
  ],
);

// Capacidades activables por organización (ADR 0024, punto 3; brief-29.2, D-2). Cada valor del
// enum entra con la subfase que lo usa, con ALTER TYPE … ADD VALUE: la 29.2 lo crea solo con
// variants. Una fila por capacidad activada; no se desactiva (hace falta un ADR). La lee una sola
// función del repositorio, que vigila tests/guards/capability-reads.test.ts. serialized_units, desde
// la 29.5: los productos por unidad, con IMEI (ADR 0024, punto 6; brief-29.5, D-2). repairs, desde la
// 29.6: la lista de reparaciones, los técnicos y las órdenes de servicio (ADR 0024, punto 10;
// brief-29.6, D-1).
export const capability = pgEnum("capability", [
  "variants",
  "serialized_units",
  "repairs",
]);

export const organizationCapabilities = pgTable(
  "organization_capabilities",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "restrict" }),
    capability: capability("capability").notNull(),
    // El admin de la organización que el script nombró como autor (ADR 0024, R-20).
    activatedBy: uuid("activated_by")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    activatedAt: timestamp("activated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique("organization_capabilities_organization_capability_unique").on(
      table.organizationId,
      table.capability,
    ),
  ],
);

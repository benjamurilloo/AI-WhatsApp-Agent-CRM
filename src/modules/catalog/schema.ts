import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  numeric,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { organizations } from "@/modules/organizations/schema";

// docs/architecture/DataModel.md, tabla products (brief-4.1).
export const products = pgTable(
  "products",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "restrict" }),
    // Se guarda como lo escribió el usuario; la unicidad no distingue mayúsculas (D-6).
    sku: text("sku").notNull(),
    name: text("name").notNull(),
    description: text("description"),
    unit: text("unit").notNull().default("unidad"),
    // Escala fija: comparaciones exactas y sin decimales infinitos (D-4). Drizzle lo devuelve como string.
    reorderPoint: numeric("reorder_point", { precision: 14, scale: 3 })
      .notNull()
      .default("0"),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex("products_organization_sku_lower_unique").on(
      table.organizationId,
      sql`lower(${table.sku})`,
    ),
    // Destino de las claves foráneas compuestas de inventory: un saldo o movimiento no puede
    // apuntar al producto de otra organización (D-3).
    unique("products_organization_id_id_unique").on(
      table.organizationId,
      table.id,
    ),
    // Prefijo de nombre sin distinguir mayúsculas: lower(name) LIKE 'caf%' (brief-4.2, D-3).
    index("products_organization_name_lower_idx").on(
      table.organizationId,
      sql`lower(${table.name}) text_pattern_ops`,
    ),
    check(
      "products_reorder_point_non_negative",
      sql`${table.reorderPoint} >= 0`,
    ),
  ],
);

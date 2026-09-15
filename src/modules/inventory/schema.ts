import { sql } from "drizzle-orm";
import {
  check,
  foreignKey,
  index,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { users } from "@/modules/auth/schema";
import { products } from "@/modules/catalog/schema";
import { organizations } from "@/modules/organizations/schema";

// docs/architecture/DataModel.md, tablas inventories e inventory_movements (brief-4.1).
// Cantidades numeric(14, 3) (D-4). El producto se referencia junto con su organización (D-3).

// A lo sumo una fila por producto: la crea el primer ajuste; sin fila, el saldo es 0 (D-7).
export const inventories = pgTable(
  "inventories",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "restrict" }),
    productId: uuid("product_id").notNull().unique(),
    quantityOnHand: numeric("quantity_on_hand", { precision: 14, scale: 3 })
      .notNull()
      .default("0"),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    foreignKey({
      name: "inventories_product_fk",
      columns: [table.organizationId, table.productId],
      foreignColumns: [products.organizationId, products.id],
    }).onDelete("restrict"),
    // Última defensa del ADR 0008.
    check(
      "inventories_quantity_on_hand_non_negative",
      sql`${table.quantityOnHand} >= 0`,
    ),
  ],
);

// Solo los tipos con productor en el MVP (subfase 1.2, D-11).
export const inventoryMovementType = pgEnum("inventory_movement_type", [
  "adjustment_positive",
  "adjustment_negative",
]);

// Solo inserción: el rol crm_app no tiene UPDATE ni DELETE y un trigger rechaza ambos (ADR 0013).
export const inventoryMovements = pgTable(
  "inventory_movements",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "restrict" }),
    productId: uuid("product_id").notNull(),
    type: inventoryMovementType("type").notNull(),
    quantity: numeric("quantity", { precision: 14, scale: 3 }).notNull(),
    balanceAfter: numeric("balance_after", {
      precision: 14,
      scale: 3,
    }).notNull(),
    reason: text("reason").notNull(),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    foreignKey({
      name: "inventory_movements_product_fk",
      columns: [table.organizationId, table.productId],
      foreignColumns: [products.organizationId, products.id],
    }).onDelete("restrict"),
    index("inventory_movements_product_history_idx").on(
      table.organizationId,
      table.productId,
      table.createdAt.desc(),
    ),
    check("inventory_movements_quantity_positive", sql`${table.quantity} > 0`),
    check(
      "inventory_movements_balance_after_non_negative",
      sql`${table.balanceAfter} >= 0`,
    ),
    // Un motivo vacío no se puede corregir en una tabla de solo inserción (D-5).
    check(
      "inventory_movements_reason_not_blank",
      sql`btrim(${table.reason}) <> ''`,
    ),
  ],
);

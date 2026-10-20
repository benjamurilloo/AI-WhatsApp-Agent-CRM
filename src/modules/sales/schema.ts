import { sql } from "drizzle-orm";
import {
  bigint,
  check,
  foreignKey,
  index,
  numeric,
  pgEnum,
  pgTable,
  smallint,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { users } from "@/modules/auth/schema";
import { products } from "@/modules/catalog/schema";
import { clients } from "@/modules/crm/schema";
import { stockUnits } from "@/modules/inventory/schema";
import { orders } from "@/modules/orders/schema";
import { organizations } from "@/modules/organizations/schema";

// docs/architecture/DataModel.md, tablas sales y sale_lines (ADR 0021; brief-20.2).
//
// La venta es un comprobante emitido (ADR 0019; ADR 0021, punto 2): las dos tablas son de solo
// inserción (ADR 0013, regla 10 de DataModel), con SELECT e INSERT para crm_app y un trigger de la
// 0039 que rechaza UPDATE y DELETE. No tiene estados. La venta de un pedido entregado copia de él
// el cliente, la moneda, las líneas y el total (brief-20.2, D-1). Desde la 20.3, la venta sin
// pedido (order_id nulo) se arma con líneas y puede no tener cliente (brief-20.3, D-2). Desde la
// 20.4, la anulación (sale_voids) y la cadena de reemplazos de las ventas de un pedido (brief-20.4,
// D-1 y D-3).

export const sales = pgTable(
  "sales",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "restrict" }),
    // Del contador de numbering, por organización; se muestra como V-000123 (ADR 0021, punto 7).
    number: bigint("number", { mode: "number" }).notNull(),
    // El pedido entregado del que sale (ADR 0021, punto 3); nulo en una venta sin pedido.
    orderId: uuid("order_id"),
    // El cliente del pedido, copiado al emitir, o el que eligió quien vende; nulo en una venta sin
    // pedido y sin cliente («Consumidor final»).
    clientId: uuid("client_id"),
    currency: text("currency").notNull(),
    // El total del pedido, copiado al emitir: la venta no vuelve a cotizar.
    total: numeric("total", { precision: 14, scale: 2 }).notNull(),
    // La venta anulada del mismo pedido a la que reemplaza (ADR 0021, punto 3; brief-20.4, D-3).
    // Nula en la primera venta de un pedido y en toda venta sin pedido.
    replacesSaleId: uuid("replaces_sale_id"),
    // Siempre un usuario: el agente no emite (ADR 0021, punto 10).
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    // Hora del INSERT, como en orders: el orden de la lista es el de emisión.
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .default(sql`clock_timestamp()`),
  },
  (table) => [
    unique("sales_organization_number_unique").on(
      table.organizationId,
      table.number,
    ),
    // Destino de la clave compuesta de sale_lines.
    unique("sales_organization_id_id_unique").on(
      table.organizationId,
      table.id,
    ),
    // Un pedido tiene a lo sumo una venta vigente (ADR 0021, punto 3). Desde la 20.4 es una cadena:
    // una sola primera venta por pedido (el índice parcial, que reemplaza al de la 0039), cada venta
    // reemplazada una sola vez, y el trigger de la 0041 exige que la reemplazada esté anulada y sea
    // del mismo pedido (brief-20.4, D-3). Los nulos no chocan, así que no alcanza a las ventas sin
    // pedido.
    uniqueIndex("sales_organization_order_first_unique")
      .on(table.organizationId, table.orderId)
      .where(sql`${table.replacesSaleId} IS NULL`),
    unique("sales_replaces_sale_unique").on(table.replacesSaleId),
    // Las ventas de un pedido, con o sin reemplazo: el índice parcial no cubre la búsqueda de la
    // última de la cadena (revisión independiente de la 20.4, R-6).
    index("sales_order_idx").on(table.organizationId, table.orderId),
    foreignKey({
      name: "sales_replaces_sale_fk",
      columns: [table.organizationId, table.replacesSaleId],
      foreignColumns: [table.organizationId, table.id],
    }).onDelete("restrict"),
    // Una venta no puede apuntar al pedido ni al cliente de otra organización, y ninguno de los
    // dos se borra mientras tenga ventas (ADR 0021, puntos 3 y 12).
    foreignKey({
      name: "sales_order_fk",
      columns: [table.organizationId, table.orderId],
      foreignColumns: [orders.organizationId, orders.id],
    }).onDelete("restrict"),
    foreignKey({
      name: "sales_client_fk",
      columns: [table.organizationId, table.clientId],
      foreignColumns: [clients.organizationId, clients.id],
    }).onDelete("restrict"),
    // La lista, de la más reciente a la más vieja, y las ventas de un cliente (brief-20.2, D-6).
    index("sales_list_idx").on(
      table.organizationId,
      table.createdAt.desc(),
      table.id.desc(),
    ),
    index("sales_client_idx").on(
      table.organizationId,
      table.clientId,
      table.createdAt.desc(),
    ),
    check("sales_number_positive", sql`${table.number} > 0`),
    // Toda venta de un pedido tiene cliente (brief-20.3, D-2, H-5).
    check(
      "sales_order_has_client",
      sql`${table.orderId} IS NULL OR ${table.clientId} IS NOT NULL`,
    ),
    // Solo una venta de pedido reemplaza a otra (ADR 0021, punto 7).
    check(
      "sales_replaces_needs_order",
      sql`${table.replacesSaleId} IS NULL OR ${table.orderId} IS NOT NULL`,
    ),
    check("sales_total_positive", sql`${table.total} > 0`),
    check("sales_currency_format", sql`${table.currency} ~ '^[A-Z]{3}$'`),
  ],
);

export const saleLines = pgTable(
  "sale_lines",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "restrict" }),
    saleId: uuid("sale_id").notNull(),
    productId: uuid("product_id").notNull(),
    // La posición de la línea del pedido, de 1 en adelante.
    position: smallint("position").notNull(),
    quantity: numeric("quantity", { precision: 14, scale: 3 }).notNull(),
    // Copiados de la línea del pedido (ADR 0021, punto 3).
    unitPrice: numeric("unit_price", { precision: 14, scale: 2 }).notNull(),
    currency: text("currency").notNull(),
    lineTotal: numeric("line_total", { precision: 14, scale: 2 }).notNull(),
  },
  (table) => [
    foreignKey({
      name: "sale_lines_sale_fk",
      columns: [table.organizationId, table.saleId],
      foreignColumns: [sales.organizationId, sales.id],
    }).onDelete("restrict"),
    foreignKey({
      name: "sale_lines_product_fk",
      columns: [table.organizationId, table.productId],
      foreignColumns: [products.organizationId, products.id],
    }).onDelete("restrict"),
    unique("sale_lines_sale_product_unique").on(table.saleId, table.productId),
    unique("sale_lines_sale_position_unique").on(table.saleId, table.position),
    // Destino de la clave compuesta de sale_line_units (brief-29.5.2, D-4).
    unique("sale_lines_organization_id_product_unique").on(
      table.organizationId,
      table.id,
      table.productId,
    ),
    check("sale_lines_position_positive", sql`${table.position} > 0`),
    check("sale_lines_quantity_positive", sql`${table.quantity} > 0`),
    check("sale_lines_unit_price_positive", sql`${table.unitPrice} > 0`),
    check("sale_lines_line_total_positive", sql`${table.lineTotal} > 0`),
    check("sale_lines_currency_format", sql`${table.currency} ~ '^[A-Z]{3}$'`),
  ],
);

// Las unidades de cada línea de una venta de un producto por unidad (ADR 0024, punto 6; brief-29.5.2,
// D-3 y D-4): en una venta sin pedido, las que vendió; en la de un pedido, copiadas de
// order_line_units. De solo inserción, como sale_lines. Sin UNIQUE (unit_id): la venta anulada de un
// pedido y la que la reemplaza nombran las mismas unidades, y una unidad que vuelve con la anulación de
// una venta sin pedido se puede vender otra vez.
export const saleLineUnits = pgTable(
  "sale_line_units",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "restrict" }),
    saleLineId: uuid("sale_line_id").notNull(),
    productId: uuid("product_id").notNull(),
    unitId: uuid("unit_id").notNull(),
    // El precio de la unidad en la moneda de la línea, como en order_line_units.
    unitPrice: numeric("unit_price", { precision: 14, scale: 2 }).notNull(),
  },
  (table) => [
    foreignKey({
      name: "sale_line_units_line_fk",
      columns: [table.organizationId, table.saleLineId, table.productId],
      foreignColumns: [
        saleLines.organizationId,
        saleLines.id,
        saleLines.productId,
      ],
    }).onDelete("restrict"),
    foreignKey({
      name: "sale_line_units_unit_fk",
      columns: [table.organizationId, table.productId, table.unitId],
      foreignColumns: [
        stockUnits.organizationId,
        stockUnits.productId,
        stockUnits.id,
      ],
    }).onDelete("restrict"),
    unique("sale_line_units_line_unit_unique").on(
      table.saleLineId,
      table.unitId,
    ),
    index("sale_line_units_unit_idx").on(table.organizationId, table.unitId),
    check("sale_line_units_unit_price_positive", sql`${table.unitPrice} > 0`),
  ],
);

// El motivo de una anulación, de una lista cerrada y sin texto libre (ADR 0021, punto 6; brief-20.4,
// D-2): una lista no guarda nada de la persona, así que el vaciado no tiene que alcanzarla. Un valor
// nuevo se suma con un ALTER TYPE aditivo.
export const saleVoidReason = pgEnum("sale_void_reason", [
  "data_entry_error",
  "not_completed",
  "wrong_client",
  "other",
]);

// La anulación (ADR 0021, puntos 6 y 7; brief-20.4, D-1): otro comprobante, de solo inserción como
// la venta, con su propia serie (A-000045). Anula la venta entera: copia su moneda y su total, en
// positivo, y no tiene líneas propias. El cliente y el pedido los lee de su venta. El trigger de la
// 0041 exige que la moneda y el total sean los de la venta.
export const saleVoids = pgTable(
  "sale_voids",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "restrict" }),
    // Del contador de numbering con el tipo sale_void; se muestra como A-000045.
    number: bigint("number", { mode: "number" }).notNull(),
    saleId: uuid("sale_id").notNull(),
    currency: text("currency").notNull(),
    total: numeric("total", { precision: 14, scale: 2 }).notNull(),
    reason: saleVoidReason("reason").notNull(),
    // Siempre un usuario: el agente no anula (ADR 0021, punto 10).
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .default(sql`clock_timestamp()`),
  },
  (table) => [
    unique("sale_voids_organization_number_unique").on(
      table.organizationId,
      table.number,
    ),
    // Una venta se anula a lo sumo una vez (ADR 0021, punto 6).
    unique("sale_voids_sale_unique").on(table.saleId),
    foreignKey({
      name: "sale_voids_sale_fk",
      columns: [table.organizationId, table.saleId],
      foreignColumns: [sales.organizationId, sales.id],
    }).onDelete("restrict"),
    check("sale_voids_number_positive", sql`${table.number} > 0`),
    check("sale_voids_total_positive", sql`${table.total} > 0`),
    check("sale_voids_currency_format", sql`${table.currency} ~ '^[A-Z]{3}$'`),
  ],
);

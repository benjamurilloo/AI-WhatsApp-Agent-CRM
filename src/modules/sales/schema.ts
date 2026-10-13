import { sql } from "drizzle-orm";
import {
  bigint,
  check,
  foreignKey,
  index,
  numeric,
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
import { orders } from "@/modules/orders/schema";
import { organizations } from "@/modules/organizations/schema";

// docs/architecture/DataModel.md, tablas sales y sale_lines (ADR 0021; brief-20.2).
//
// La venta es un comprobante emitido (ADR 0019; ADR 0021, punto 2): las dos tablas son de solo
// inserción (ADR 0013, regla 10 de DataModel), con SELECT e INSERT para crm_app y un trigger de la
// 0039 que rechaza UPDATE y DELETE. No tiene estados. La venta de un pedido entregado copia de él
// el cliente, la moneda, las líneas y el total (brief-20.2, D-1). Desde la 20.3, la venta sin
// pedido (order_id nulo) se arma con líneas y puede no tener cliente (brief-20.3, D-2). La 20.4
// suma la anulación.

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
    // Un pedido tiene a lo sumo una venta (ADR 0021, punto 3). Los nulos no chocan, así que no
    // alcanza a las ventas sin pedido. La 20.4 lo reemplaza por el índice parcial WHERE
    // replaces_sale_id IS NULL, con la cadena de reemplazos.
    uniqueIndex("sales_organization_order_unique").on(
      table.organizationId,
      table.orderId,
    ),
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
    check("sale_lines_position_positive", sql`${table.position} > 0`),
    check("sale_lines_quantity_positive", sql`${table.quantity} > 0`),
    check("sale_lines_unit_price_positive", sql`${table.unitPrice} > 0`),
    check("sale_lines_line_total_positive", sql`${table.lineTotal} > 0`),
    check("sale_lines_currency_format", sql`${table.currency} ~ '^[A-Z]{3}$'`),
  ],
);

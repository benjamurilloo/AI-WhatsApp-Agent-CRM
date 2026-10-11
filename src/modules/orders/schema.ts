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
  uuid,
} from "drizzle-orm/pg-core";
import { users } from "@/modules/auth/schema";
import { products } from "@/modules/catalog/schema";
import { clients } from "@/modules/crm/schema";
import { organizations } from "@/modules/organizations/schema";

// docs/architecture/DataModel.md, tablas orders y order_lines (ADR 0020; brief-19.2).
//
// El pedido es un compromiso con estado, no un comprobante emitido (ADR 0020, punto 3):
// - orders admite UPDATE pero no DELETE, y su trigger (0036) solo deja cambiar el estado y sus
//   fechas, por las transiciones del punto 4;
// - order_lines es de solo inserción (ADR 0013, regla 10 de DataModel).

// Los cuatro estados del ADR 0020, punto 4, desde la 19.2 (brief-19.2, D-1): la 19.2 produce
// pending y cancelled; confirmed y delivered, la 19.3.
export const orderStatus = pgEnum("order_status", [
  "pending",
  "confirmed",
  "delivered",
  "cancelled",
]);

// Líneas por pedido como máximo (brief-19.2, D-6). La base lo exige con el CHECK de position.
export const MAX_ORDER_LINES = 50;

export const orders = pgTable(
  "orders",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "restrict" }),
    // Del contador de numbering, por organización; se muestra como P-000123 (ADR 0020, punto 2).
    number: bigint("number", { mode: "number" }).notNull(),
    clientId: uuid("client_id").notNull(),
    // La moneda de la primera línea (ADR 0019, punto 3).
    currency: text("currency").notNull(),
    // La suma de los totales de las líneas, copiada al crear (ADR 0020, punto 3).
    total: numeric("total", { precision: 14, scale: 2 }).notNull(),
    status: orderStatus("status").notNull().default("pending"),
    confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
    deliveredAt: timestamp("delivered_at", { withTimezone: true }),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    // Hora del INSERT: el orden de la lista es el orden en que se crearon, como en
    // product_prices.
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .default(sql`clock_timestamp()`),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique("orders_organization_number_unique").on(
      table.organizationId,
      table.number,
    ),
    // Destino de la clave compuesta de order_lines: una línea no puede apuntar al pedido de otra
    // organización.
    unique("orders_organization_id_id_unique").on(
      table.organizationId,
      table.id,
    ),
    // Un pedido no puede apuntar al cliente de otra organización, y un cliente con pedidos no se
    // borra: se vacía (ADR 0020, punto 10).
    foreignKey({
      name: "orders_client_fk",
      columns: [table.organizationId, table.clientId],
      foreignColumns: [clients.organizationId, clients.id],
    }).onDelete("restrict"),
    // La lista, de la más reciente a la más vieja (brief-19.2, D-10).
    index("orders_list_idx").on(
      table.organizationId,
      table.createdAt.desc(),
      table.id.desc(),
    ),
    // Los pedidos de un cliente: la tarjeta de su ficha y el filtro de la lista.
    index("orders_client_idx").on(
      table.organizationId,
      table.clientId,
      table.createdAt.desc(),
    ),
    check("orders_number_positive", sql`${table.number} > 0`),
    check("orders_total_positive", sql`${table.total} > 0`),
    check("orders_currency_format", sql`${table.currency} ~ '^[A-Z]{3}$'`),
    // Cada fecha está puesta si y solo si el pedido pasó por ese estado (ADR 0020, punto 3). Un
    // cancelado pudo pasar o no por confirmed, así que su confirmed_at puede faltar.
    check(
      "orders_status_dates",
      sql`(${table.deliveredAt} is not null) = (${table.status} = 'delivered')
        and (${table.cancelledAt} is not null) = (${table.status} = 'cancelled')
        and (${table.status} not in ('confirmed', 'delivered') or ${table.confirmedAt} is not null)
        and (${table.status} <> 'pending' or ${table.confirmedAt} is null)`,
    ),
  ],
);

export const orderLines = pgTable(
  "order_lines",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "restrict" }),
    orderId: uuid("order_id").notNull(),
    productId: uuid("product_id").notNull(),
    // El orden en que se cargaron, de 1 en adelante.
    position: smallint("position").notNull(),
    quantity: numeric("quantity", { precision: 14, scale: 3 }).notNull(),
    // El precio vigente del producto al crear el pedido, y nunca se recalcula (ADR 0020, punto 3).
    unitPrice: numeric("unit_price", { precision: 14, scale: 2 }).notNull(),
    currency: text("currency").notNull(),
    // Precio unitario por cantidad, redondeado a los decimales de la moneda con el medio hacia
    // afuera del cero (ADR 0019, punto 4).
    lineTotal: numeric("line_total", { precision: 14, scale: 2 }).notNull(),
  },
  (table) => [
    foreignKey({
      name: "order_lines_order_fk",
      columns: [table.organizationId, table.orderId],
      foreignColumns: [orders.organizationId, orders.id],
    }).onDelete("restrict"),
    foreignKey({
      name: "order_lines_product_fk",
      columns: [table.organizationId, table.productId],
      foreignColumns: [products.organizationId, products.id],
    }).onDelete("restrict"),
    // Un producto va en una sola línea del pedido (ADR 0020, punto 3). Sirve también la lectura
    // de las líneas de un pedido.
    unique("order_lines_order_product_unique").on(
      table.orderId,
      table.productId,
    ),
    unique("order_lines_order_position_unique").on(
      table.orderId,
      table.position,
    ),
    check(
      "order_lines_position_range",
      sql`${table.position} between 1 and ${sql.raw(String(MAX_ORDER_LINES))}`,
    ),
    check("order_lines_quantity_positive", sql`${table.quantity} > 0`),
    check("order_lines_unit_price_positive", sql`${table.unitPrice} > 0`),
    check("order_lines_line_total_positive", sql`${table.lineTotal} > 0`),
    check("order_lines_currency_format", sql`${table.currency} ~ '^[A-Z]{3}$'`),
  ],
);

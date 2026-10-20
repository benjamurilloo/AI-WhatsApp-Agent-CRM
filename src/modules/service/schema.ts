import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
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
import { productModels } from "@/modules/catalog/schema";
import { clients } from "@/modules/crm/schema";
import { organizations } from "@/modules/organizations/schema";
import { suppliers } from "@/modules/purchasing/schema";
import { sales } from "@/modules/sales/schema";

// docs/architecture/DataModel.md, tablas repair_types, repair_prices, service_orders y
// service_order_lines (ADR 0024, puntos 7 y 10; brief-29.6, D-2 y D-4). Todo detrás de la capacidad
// repairs. En la 29.6 la orden es solo la del equipo de un cliente (customer_device); la de una unidad
// propia (own_unit) entra con la 29.6.2 (R-19).

// Límites de la lista y de la orden. Los mismos valores van en los CHECK.
export const REPAIR_TYPE_NAME_MAX_LENGTH = 60;
export const REPORTED_ISSUE_MAX_LENGTH = 1000;
// Tipos de reparación por presupuesto como máximo: más que esto no es una orden de mostrador.
export const MAX_SERVICE_ORDER_LINES = 20;
// El IMEI o número de serie del equipo del cliente, con la forma de stock_units (brief-29.5, D-2): de
// 1 a 32 caracteres. No es una unidad del stock y no se compara con stock_units (D-4).
export const DEVICE_SERIAL_PATTERN = "^[A-Za-z0-9][A-Za-z0-9-]{0,31}$";

// Los tipos de reparación de la organización (D-2): «Cambio de batería», «Cambio de pantalla». Se
// editan y se desactivan, nunca se borran: un tipo en uso conserva su nombre en las órdenes.
export const repairTypes = pgTable(
  "repair_types",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "restrict" }),
    name: text("name").notNull(),
    position: smallint("position").notNull().default(0),
    isActive: boolean("is_active").notNull().default(true),
    // Copiado de un perfil de rubro: un ejemplo que el negocio ajusta (ADR 0024, punto 13).
    isExample: boolean("is_example").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex("repair_types_organization_name_lower_unique").on(
      table.organizationId,
      sql`lower(${table.name})`,
    ),
    unique("repair_types_organization_id_id_unique").on(
      table.organizationId,
      table.id,
    ),
    check(
      "repair_types_name_length",
      sql`char_length(${table.name}) between 1 and ${sql.raw(String(REPAIR_TYPE_NAME_MAX_LENGTH))} and ${table.name} = btrim(${table.name})`,
    ),
    check("repair_types_position_range", sql`${table.position} >= 0`),
  ],
);

// El precio de un tipo de reparación para un modelo (D-2): lo que paga el cliente y lo que se estima
// que cobra el técnico, cada uno en su moneda. Se edita; no se borra. Un viewer ve el precio, no el
// costo (ADR 0024, punto 14).
export const repairPrices = pgTable(
  "repair_prices",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "restrict" }),
    repairTypeId: uuid("repair_type_id").notNull(),
    modelId: uuid("model_id").notNull(),
    price: numeric("price", { precision: 14, scale: 2 }).notNull(),
    priceCurrency: text("price_currency").notNull(),
    cost: numeric("cost", { precision: 14, scale: 2 }).notNull(),
    costCurrency: text("cost_currency").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    unique("repair_prices_organization_type_model_unique").on(
      table.organizationId,
      table.repairTypeId,
      table.modelId,
    ),
    foreignKey({
      name: "repair_prices_type_fk",
      columns: [table.organizationId, table.repairTypeId],
      foreignColumns: [repairTypes.organizationId, repairTypes.id],
    }).onDelete("restrict"),
    foreignKey({
      name: "repair_prices_model_fk",
      columns: [table.organizationId, table.modelId],
      foreignColumns: [productModels.organizationId, productModels.id],
    }).onDelete("restrict"),
    // La grilla de un modelo: el presupuesto la lee por modelo.
    index("repair_prices_model_idx").on(table.organizationId, table.modelId),
    check("repair_prices_price_positive", sql`${table.price} > 0`),
    check("repair_prices_cost_positive", sql`${table.cost} > 0`),
    check(
      "repair_prices_price_currency_format",
      sql`${table.priceCurrency} ~ '^[A-Z]{3}$'`,
    ),
    check(
      "repair_prices_cost_currency_format",
      sql`${table.costCurrency} ~ '^[A-Z]{3}$'`,
    ),
  ],
);

// El tipo de orden (ADR 0024, punto 10). Cada valor entra con la subfase que lo usa (R-19): la 29.6
// crea customer_device; own_unit, la 29.6.2.
export const serviceOrderKind = pgEnum("service_order_kind", [
  "customer_device",
]);

// Los estados de la orden (D-4). El trigger de la 0058 fija las transiciones:
// received → sent → quoted → approved o rejected; approved → repaired → delivered; rejected →
// delivered, sin venta; y cancelled desde received, sent, quoted o approved.
export const serviceOrderStatus = pgEnum("service_order_status", [
  "received",
  "sent",
  "quoted",
  "approved",
  "rejected",
  "repaired",
  "delivered",
  "cancelled",
]);

// El motivo de una cancelación, de una lista cerrada (D-4), como el de la anulación de una venta.
export const serviceOrderCancelReason = pgEnum("service_order_cancel_reason", [
  "customer_withdrew",
  "not_repairable",
  "entered_by_mistake",
  "other",
]);

// La orden de servicio (D-4), numerada OS-000123. Un compromiso con estado, como el pedido: admite
// UPDATE y no DELETE, y su trigger (0058) solo deja cambiar el estado, sus fechas y lo que cada
// transición fija (el técnico, el presupuesto, el motivo y la venta), una sola vez. No copia datos del
// cliente: lo nombra por su clave (ADR 0024, punto 14).
export const serviceOrders = pgTable(
  "service_orders",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "restrict" }),
    // Del contador de numbering, por organización.
    number: bigint("number", { mode: "number" }).notNull(),
    kind: serviceOrderKind("kind").notNull().default("customer_device"),
    clientId: uuid("client_id").notNull(),
    // El modelo del equipo: da los precios de la lista.
    modelId: uuid("model_id").notNull(),
    // El IMEI del equipo del cliente, opcional, y lo que reporta el cliente, obligatorio al crearla.
    // Son datos personales (D-11): el vaciado de datos de un cliente los deja en null, y es el único
    // UPDATE que los toca (trigger de la 0058). Por eso reported_issue admite null en la base.
    deviceSerial: text("device_serial"),
    reportedIssue: text("reported_issue"),
    // Desde que se manda.
    technicianId: uuid("technician_id"),
    status: serviceOrderStatus("status").notNull().default("received"),
    // El presupuesto, desde quoted: una moneda para lo que paga el cliente y una para lo que cobra el
    // técnico, y la suma de las líneas de cada lado.
    customerCurrency: text("customer_currency"),
    customerTotal: numeric("customer_total", { precision: 14, scale: 2 }),
    technicianCurrency: text("technician_currency"),
    technicianTotal: numeric("technician_total", { precision: 14, scale: 2 }),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    quotedAt: timestamp("quoted_at", { withTimezone: true }),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    rejectedAt: timestamp("rejected_at", { withTimezone: true }),
    repairedAt: timestamp("repaired_at", { withTimezone: true }),
    deliveredAt: timestamp("delivered_at", { withTimezone: true }),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    cancelReason: serviceOrderCancelReason("cancel_reason"),
    // La venta de la entrega de una orden reparada (D-6). sales no conoce service: la orden apunta a la
    // venta.
    saleId: uuid("sale_id"),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    // Hora del INSERT: el orden de la lista es el orden en que se crearon, como en orders.
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .default(sql`clock_timestamp()`),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique("service_orders_organization_number_unique").on(
      table.organizationId,
      table.number,
    ),
    unique("service_orders_organization_id_id_unique").on(
      table.organizationId,
      table.id,
    ),
    // Una venta es de una sola orden.
    unique("service_orders_sale_unique").on(table.saleId),
    // El cliente no se borra mientras tenga órdenes (ADR 0024, punto 14).
    foreignKey({
      name: "service_orders_client_fk",
      columns: [table.organizationId, table.clientId],
      foreignColumns: [clients.organizationId, clients.id],
    }).onDelete("restrict"),
    foreignKey({
      name: "service_orders_model_fk",
      columns: [table.organizationId, table.modelId],
      foreignColumns: [productModels.organizationId, productModels.id],
    }).onDelete("restrict"),
    foreignKey({
      name: "service_orders_technician_fk",
      columns: [table.organizationId, table.technicianId],
      foreignColumns: [suppliers.organizationId, suppliers.id],
    }).onDelete("restrict"),
    foreignKey({
      name: "service_orders_sale_fk",
      columns: [table.organizationId, table.saleId],
      foreignColumns: [sales.organizationId, sales.id],
    }).onDelete("restrict"),
    // La lista, de la más reciente a la más vieja, y por estado.
    index("service_orders_list_idx").on(
      table.organizationId,
      table.createdAt.desc(),
      table.id.desc(),
    ),
    index("service_orders_status_idx").on(
      table.organizationId,
      table.status,
      table.createdAt.desc(),
    ),
    // Las órdenes de un cliente: la sección de su ficha.
    index("service_orders_client_idx").on(
      table.organizationId,
      table.clientId,
      table.createdAt.desc(),
    ),
    // Las deudas de un técnico: su cuenta (D-7).
    index("service_orders_technician_idx")
      .on(table.organizationId, table.technicianId)
      .where(sql`${table.technicianId} is not null`),
    check("service_orders_number_positive", sql`${table.number} > 0`),
    check(
      "service_orders_device_serial_format",
      sql`${table.deviceSerial} ~ ${sql.raw(`'${DEVICE_SERIAL_PATTERN}'`)}`,
    ),
    check(
      "service_orders_reported_issue_length",
      sql`char_length(${table.reportedIssue}) between 1 and ${sql.raw(String(REPORTED_ISSUE_MAX_LENGTH))} and ${table.reportedIssue} = btrim(${table.reportedIssue})`,
    ),
    check(
      "service_orders_customer_currency_format",
      sql`${table.customerCurrency} ~ '^[A-Z]{3}$'`,
    ),
    check(
      "service_orders_technician_currency_format",
      sql`${table.technicianCurrency} ~ '^[A-Z]{3}$'`,
    ),
    check(
      "service_orders_customer_total_positive",
      sql`${table.customerTotal} > 0`,
    ),
    check(
      "service_orders_technician_total_positive",
      sql`${table.technicianTotal} > 0`,
    ),
    // El técnico está desde que se mandó, y el presupuesto, desde que se presupuestó.
    check(
      "service_orders_technician_sent",
      sql`(${table.technicianId} is not null) = (${table.sentAt} is not null)`,
    ),
    check(
      "service_orders_quote_together",
      sql`(${table.quotedAt} is not null) = (${table.customerCurrency} is not null)
        and (${table.quotedAt} is not null) = (${table.customerTotal} is not null)
        and (${table.quotedAt} is not null) = (${table.technicianCurrency} is not null)
        and (${table.quotedAt} is not null) = (${table.technicianTotal} is not null)`,
    ),
    // Cada fecha supone la anterior del camino, y aprobada y rechazada se excluyen.
    check(
      "service_orders_dates_chain",
      sql`(${table.quotedAt} is null or ${table.sentAt} is not null)
        and (${table.approvedAt} is null or ${table.quotedAt} is not null)
        and (${table.rejectedAt} is null or ${table.quotedAt} is not null)
        and (${table.approvedAt} is null or ${table.rejectedAt} is null)
        and (${table.repairedAt} is null or ${table.approvedAt} is not null)`,
    ),
    // Las fechas de cada estado (D-4). Entregada: reparada o rechazada, una de las dos.
    check(
      "service_orders_status_dates",
      sql`(${table.deliveredAt} is not null) = (${table.status} = 'delivered')
        and (${table.cancelledAt} is not null) = (${table.status} = 'cancelled')
        and (${table.cancelReason} is not null) = (${table.status} = 'cancelled')
        and case ${table.status}
          when 'received' then ${table.sentAt} is null
          when 'sent' then ${table.sentAt} is not null and ${table.quotedAt} is null
          when 'quoted' then ${table.quotedAt} is not null and ${table.approvedAt} is null and ${table.rejectedAt} is null
          when 'approved' then ${table.approvedAt} is not null and ${table.repairedAt} is null
          when 'rejected' then ${table.rejectedAt} is not null
          when 'repaired' then ${table.repairedAt} is not null
          when 'delivered' then (${table.repairedAt} is not null) <> (${table.rejectedAt} is not null)
          when 'cancelled' then ${table.repairedAt} is null and ${table.rejectedAt} is null
        end`,
    ),
    // Una orden entregada que se reparó tiene su venta, y ninguna otra la tiene (invariante del brief).
    check(
      "service_orders_sale_delivered",
      sql`(${table.saleId} is not null) = (${table.status} = 'delivered' and ${table.repairedAt} is not null)`,
    ),
  ],
);

// Las líneas del presupuesto, de solo inserción (D-4): una por tipo de reparación, con el precio al
// cliente y el costo del técnico copiados de la lista y editables antes de guardar. Las monedas van en
// la cabecera. Se insertan al presupuestar y no cambian: un presupuesto distinto es otra orden.
export const serviceOrderLines = pgTable(
  "service_order_lines",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "restrict" }),
    serviceOrderId: uuid("service_order_id").notNull(),
    repairTypeId: uuid("repair_type_id").notNull(),
    position: smallint("position").notNull(),
    price: numeric("price", { precision: 14, scale: 2 }).notNull(),
    cost: numeric("cost", { precision: 14, scale: 2 }).notNull(),
  },
  (table) => [
    unique("service_order_lines_order_type_unique").on(
      table.serviceOrderId,
      table.repairTypeId,
    ),
    unique("service_order_lines_order_position_unique").on(
      table.serviceOrderId,
      table.position,
    ),
    foreignKey({
      name: "service_order_lines_order_fk",
      columns: [table.organizationId, table.serviceOrderId],
      foreignColumns: [serviceOrders.organizationId, serviceOrders.id],
    }).onDelete("restrict"),
    foreignKey({
      name: "service_order_lines_type_fk",
      columns: [table.organizationId, table.repairTypeId],
      foreignColumns: [repairTypes.organizationId, repairTypes.id],
    }).onDelete("restrict"),
    check(
      "service_order_lines_position_range",
      sql`${table.position} between 1 and ${sql.raw(String(MAX_SERVICE_ORDER_LINES))}`,
    ),
    check("service_order_lines_price_positive", sql`${table.price} > 0`),
    check("service_order_lines_cost_positive", sql`${table.cost} > 0`),
  ],
);

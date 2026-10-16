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
import { products } from "@/modules/catalog/schema";
import { organizations } from "@/modules/organizations/schema";

// docs/architecture/DataModel.md, tabla suppliers (ADR 0023, punto 2; brief-22.2, D-1) y, desde la
// 22.3, purchase_orders y purchase_order_lines (ADR 0023, punto 3; brief-22.3, D-1).

// Límites de la ficha (D-1 y D-4). Los mismos valores van en los CHECK de la tabla.
export const SUPPLIER_FIELD_LIMITS = {
  name: 120,
  email: 254,
} as const;

// El CUIT guardado: once dígitos, sin separadores. El dígito verificador lo comprueba el servicio
// (D-2), porque la base no lo calcula.
export const CUIT_PATTERN = "^[0-9]{11}$";

// El proveedor de una organización, separado de clients: un proveedor no es un cliente aunque
// comparta el teléfono, y no lo lee el agente (ADR 0023, punto 2). Editable y con borrado lógico
// (regla 8): crm_app tiene SELECT, INSERT y UPDATE, sin DELETE. Guarda lo mínimo (punto 14): sin
// notas ni texto libre.
export const suppliers = pgTable(
  "suppliers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "restrict" }),
    name: text("name").notNull(),
    // E.164, como el del cliente, normalizado por src/shared/phone (D-3). No es único.
    phone: text("phone_e164"),
    // En minúsculas, como el del cliente (D-4). No es único.
    email: text("email"),
    cuit: text("cuit"),
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
    // Un nombre por organización, sin distinguir mayúsculas, también frente a los inactivos, como
    // payment_methods (D-4). Sirve también el orden de la lista (D-10).
    uniqueIndex("suppliers_organization_name_lower_unique").on(
      table.organizationId,
      sql`lower(${table.name})`,
    ),
    // Un CUIT por organización, también frente a los inactivos: dos fichas con el mismo CUIT
    // partirían la cuenta del proveedor en la 22.6 (D-2).
    uniqueIndex("suppliers_organization_cuit_unique")
      .on(table.organizationId, table.cuit)
      .where(sql`${table.cuit} IS NOT NULL`),
    // Destino de las claves compuestas de la 22.3 en adelante.
    unique("suppliers_organization_id_id_unique").on(
      table.organizationId,
      table.id,
    ),
    check(
      "suppliers_name_length",
      sql`char_length(${table.name}) between 1 and ${sql.raw(String(SUPPLIER_FIELD_LIMITS.name))}`,
    ),
    check("suppliers_name_trimmed", sql`${table.name} = btrim(${table.name})`),
    check(
      "suppliers_phone_e164_format",
      sql`${table.phone} ~ '^\\+[1-9][0-9]{1,14}$'`,
    ),
    check(
      "suppliers_email_format",
      sql`${table.email} = lower(${table.email}) and char_length(${table.email}) <= ${sql.raw(String(SUPPLIER_FIELD_LIMITS.email))} and position('@' in ${table.email}) > 1`,
    ),
    check(
      "suppliers_cuit_format",
      sql`${table.cuit} ~ ${sql.raw(`'${CUIT_PATTERN}'`)}`,
    ),
  ],
);

// Los estados de la orden (ADR 0023, punto 3): abierta, cerrada (con la recepción, desde la 22.4) o
// cancelada. El trigger de la 0048 fija las transiciones (brief-22.3, D-2).
export const purchaseOrderStatus = pgEnum("purchase_order_status", [
  "open",
  "closed",
  "cancelled",
]);

// Líneas por orden como máximo (brief-22.3, D-4), como MAX_ORDER_LINES. La base lo exige con el
// CHECK de position.
export const MAX_PURCHASE_ORDER_LINES = 50;

// La orden de compra: un compromiso con estado, como el pedido, no un comprobante emitido (ADR 0023,
// punto 3). Admite UPDATE pero no DELETE, y su trigger (0048) solo deja cambiar el estado y sus
// fechas. No copia datos del proveedor: lo nombra por su clave (punto 14).
export const purchaseOrders = pgTable(
  "purchase_orders",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "restrict" }),
    // Del contador de numbering, por organización; se muestra como OC-000123 (punto 3).
    number: bigint("number", { mode: "number" }).notNull(),
    supplierId: uuid("supplier_id").notNull(),
    // La que eligió quien la creó; todas las líneas van en ella (punto 3; D-5).
    currency: text("currency").notNull(),
    // La suma de los totales de las líneas, redondeados uno por uno.
    total: numeric("total", { precision: 14, scale: 2 }).notNull(),
    status: purchaseOrderStatus("status").notNull().default("open"),
    closedAt: timestamp("closed_at", { withTimezone: true }),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
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
    unique("purchase_orders_organization_number_unique").on(
      table.organizationId,
      table.number,
    ),
    // Destino de la clave compuesta de las líneas y, desde la 22.4, de la recepción.
    unique("purchase_orders_organization_id_id_unique").on(
      table.organizationId,
      table.id,
    ),
    // Una orden no puede apuntar al proveedor de otra organización, y un proveedor con órdenes no
    // se borra.
    foreignKey({
      name: "purchase_orders_supplier_fk",
      columns: [table.organizationId, table.supplierId],
      foreignColumns: [suppliers.organizationId, suppliers.id],
    }).onDelete("restrict"),
    // La lista, de la más reciente a la más vieja (D-11).
    index("purchase_orders_list_idx").on(
      table.organizationId,
      table.createdAt.desc(),
      table.id.desc(),
    ),
    // Las órdenes de un proveedor: la sección de su ficha y el filtro de la lista.
    index("purchase_orders_supplier_idx").on(
      table.organizationId,
      table.supplierId,
      table.createdAt.desc(),
    ),
    check("purchase_orders_number_positive", sql`${table.number} > 0`),
    check("purchase_orders_total_positive", sql`${table.total} > 0`),
    check(
      "purchase_orders_currency_format",
      sql`${table.currency} ~ '^[A-Z]{3}$'`,
    ),
    // Cada fecha está puesta si y solo si la orden está en ese estado (D-1).
    check(
      "purchase_orders_status_dates",
      sql`(${table.closedAt} is not null) = (${table.status} = 'closed')
        and (${table.cancelledAt} is not null) = (${table.status} = 'cancelled')`,
    ),
  ],
);

// Las líneas de la orden, de solo inserción (ADR 0013; regla 10 de DataModel). Sin moneda: va en la
// cabecera, y todas las líneas la comparten (D-1).
export const purchaseOrderLines = pgTable(
  "purchase_order_lines",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "restrict" }),
    purchaseOrderId: uuid("purchase_order_id").notNull(),
    productId: uuid("product_id").notNull(),
    // El orden en que se cargaron, de 1 en adelante.
    position: smallint("position").notNull(),
    quantity: numeric("quantity", { precision: 14, scale: 3 }).notNull(),
    // El costo unitario esperado, con el IVA incluido, que escribió quien la creó (punto 3; D-6).
    unitCost: numeric("unit_cost", { precision: 14, scale: 2 }).notNull(),
    // Costo unitario por cantidad, redondeado a los decimales de la moneda con el medio hacia
    // afuera del cero (ADR 0019, punto 4).
    lineTotal: numeric("line_total", { precision: 14, scale: 2 }).notNull(),
  },
  (table) => [
    foreignKey({
      name: "purchase_order_lines_order_fk",
      columns: [table.organizationId, table.purchaseOrderId],
      foreignColumns: [purchaseOrders.organizationId, purchaseOrders.id],
    }).onDelete("restrict"),
    foreignKey({
      name: "purchase_order_lines_product_fk",
      columns: [table.organizationId, table.productId],
      foreignColumns: [products.organizationId, products.id],
    }).onDelete("restrict"),
    // Un producto va en una sola línea de la orden (punto 3). Sirve también la lectura de las
    // líneas de una orden.
    unique("purchase_order_lines_order_product_unique").on(
      table.purchaseOrderId,
      table.productId,
    ),
    unique("purchase_order_lines_order_position_unique").on(
      table.purchaseOrderId,
      table.position,
    ),
    check(
      "purchase_order_lines_position_range",
      sql`${table.position} between 1 and ${sql.raw(String(MAX_PURCHASE_ORDER_LINES))}`,
    ),
    check("purchase_order_lines_quantity_positive", sql`${table.quantity} > 0`),
    check(
      "purchase_order_lines_unit_cost_positive",
      sql`${table.unitCost} > 0`,
    ),
    check(
      "purchase_order_lines_line_total_positive",
      sql`${table.lineTotal} > 0`,
    ),
  ],
);

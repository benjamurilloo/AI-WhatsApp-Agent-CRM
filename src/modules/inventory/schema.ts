import { sql } from "drizzle-orm";
import {
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
    // Lo comprometido por pedidos confirmados (ADR 0020, punto 4; brief-19.3). Se escribe sin
    // movimiento: su traza es la auditoría del pedido. Lo disponible es on_hand − reserved.
    quantityReserved: numeric("quantity_reserved", { precision: 14, scale: 3 })
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
    // Lo reservado nunca es negativo ni supera al saldo físico (ADR 0020, punto 4).
    check(
      "inventories_quantity_reserved_within_on_hand",
      sql`${table.quantityReserved} >= 0 AND ${table.quantityReserved} <= ${table.quantityOnHand}`,
    ),
  ],
);

// Solo los tipos con productor (subfase 1.2, D-11). order_delivery, desde la 19.3: la salida
// física de un pedido entregado (ADR 0020, punto 4). sale, desde la 20.3: la salida de una venta
// sin pedido (ADR 0021, punto 5). sale_void, desde la 20.4: la reposición de la anulación de una
// venta sin pedido (ADR 0021, punto 6). goods_receipt, desde la 22.4: la entrada de una recepción
// de mercadería (ADR 0023, punto 4; brief-22.4, D-3). goods_receipt_void, desde la 22.5: la salida de
// la anulación de una recepción (ADR 0023, punto 6; brief-22.5, D-3). unit_to_repair y unit_released,
// desde la 29.6.2: la salida de una unidad disponible que va a reparar y la entrada de una unidad que
// se libera a la venta (ADR 0024, punto 6; brief-29.6.2, D-1). unit_written_off, desde la 29.7: la baja
// de la unidad disponible de un usado anulado (ADR 0024, punto 8; brief-29.7, D-2).
export const inventoryMovementType = pgEnum("inventory_movement_type", [
  "adjustment_positive",
  "adjustment_negative",
  "order_delivery",
  "sale",
  "sale_void",
  "goods_receipt",
  "goods_receipt_void",
  "unit_to_repair",
  "unit_released",
  "unit_written_off",
]);

// Los días de garantía, como máximo (brief-29.9, D-1): diez años.
export const MAX_WARRANTY_DAYS = 3650;

// Los valores sueltos de serialized_units (ADR 0024, punto 13; brief-29.9, U-2 y D-1): una fila por
// organización, que crea org:capability con los días del perfil. Se edita, no se borra. is_example
// queda hasta que un admin la guarda.
export const unitSettings = pgTable(
  "unit_settings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "restrict" }),
    // Los días de garantía de una unidad vendida que no tiene los suyos.
    warrantyDays: smallint("warranty_days").notNull(),
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
    unique("unit_settings_organization_unique").on(table.organizationId),
    check(
      "unit_settings_warranty_days_range",
      sql`${table.warrantyDays} between 0 and ${sql.raw(String(MAX_WARRANTY_DAYS))}`,
    ),
  ],
);

// Los grados de las unidades (ADR 0024, punto 13; brief-29.5, D-5): una lista por organización, que
// copia el perfil de rubro y edita un admin. Un grado en uso no se borra: se desactiva.
export const UNIT_GRADE_NAME_MAX_LENGTH = 40;
export const UNIT_GRADE_DESCRIPTION_MAX_LENGTH = 120;

export const unitGrades = pgTable(
  "unit_grades",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "restrict" }),
    name: text("name").notNull(),
    description: text("description"),
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
    uniqueIndex("unit_grades_organization_name_lower_unique").on(
      table.organizationId,
      sql`lower(${table.name})`,
    ),
    unique("unit_grades_organization_id_id_unique").on(
      table.organizationId,
      table.id,
    ),
    check(
      "unit_grades_name_length",
      sql`char_length(${table.name}) between 1 and ${sql.raw(String(UNIT_GRADE_NAME_MAX_LENGTH))} and ${table.name} = btrim(${table.name})`,
    ),
    check(
      "unit_grades_description_length",
      sql`char_length(${table.description}) between 1 and ${sql.raw(String(UNIT_GRADE_DESCRIPTION_MAX_LENGTH))}`,
    ),
    check("unit_grades_position_range", sql`${table.position} >= 0`),
  ],
);

// El estado de una unidad (ADR 0024, punto 6). Cada valor entra con la subfase que lo usa (R-19): la
// 29.5 crea available y written_off; reserved y sold, la 29.5.2 (brief-29.5.2, D-3 y D-4); in_repair e
// in_review, la 29.6.2 (brief-29.6.2, D-1). Las transiciones las fija el trigger stock_units_guard.
export const stockUnitStatus = pgEnum("stock_unit_status", [
  "available",
  "written_off",
  "reserved",
  "sold",
  "in_repair",
  "in_review",
]);

// De dónde vino la unidad. trade_in, desde la 29.7: el usado recibido de un cliente, que nace en
// revisión (ADR 0024, punto 6; brief-29.7, D-2).
export const stockUnitOrigin = pgEnum("stock_unit_origin", [
  "goods_receipt",
  "manual",
  "trade_in",
]);

// El número de serie o IMEI: de 1 a 32 letras, dígitos o guiones, sin espacios (brief-29.5, D-2).
export const UNIT_SERIAL_MAX_LENGTH = 32;
export const UNIT_SERIAL_PATTERN = "^[A-Za-z0-9][A-Za-z0-9-]{0,31}$";

// Las unidades de un producto por unidad (ADR 0024, punto 6; brief-29.5, D-2). El saldo de un
// producto unit es igual a sus unidades available y, desde la 29.5.2, reserved; las que están en
// reparación o en revisión (29.6.2) quedan fuera. crm_app no tiene DELETE: una unidad se da de baja.
export const stockUnits = pgTable(
  "stock_units",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "restrict" }),
    productId: uuid("product_id").notNull(),
    // Se guarda como se escribió; la unicidad no distingue mayúsculas. No se edita (trigger).
    serial: text("serial").notNull(),
    status: stockUnitStatus("status").notNull().default("available"),
    gradeId: uuid("grade_id"),
    // La salud de la batería, en porcentaje.
    batteryHealth: smallint("battery_health"),
    cost: numeric("cost", { precision: 14, scale: 2 }).notNull(),
    costCurrency: text("cost_currency").notNull(),
    // El precio propio de la unidad (ADR 0024, punto 6; brief-29.5.2, D-2): opcional, y sin él vale el
    // precio vigente del producto. Lo fija el alta manual y lo corrige un admin; la recepción no.
    price: numeric("price", { precision: 14, scale: 2 }),
    priceCurrency: text("price_currency"),
    // Los días de garantía propios de la unidad (ADR 0024, punto 6; brief-29.9, D-1): nulo, los del
    // perfil (unit_settings); cero, sin garantía. Los edita un admin en cualquier estado, también vendida.
    warrantyDays: smallint("warranty_days"),
    originType: stockUnitOrigin("origin_type").notNull(),
    // Clave plana, sin clave foránea (ADR 0024, R-16): inventory no importa los esquemas de quien la
    // crea. En una recepción, la recepción; en el alta manual, null; en un usado, su comprobante PU.
    originId: uuid("origin_id"),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    foreignKey({
      name: "stock_units_product_fk",
      columns: [table.organizationId, table.productId],
      foreignColumns: [products.organizationId, products.id],
    }).onDelete("restrict"),
    foreignKey({
      name: "stock_units_grade_fk",
      columns: [table.organizationId, table.gradeId],
      foreignColumns: [unitGrades.organizationId, unitGrades.id],
    }).onDelete("restrict"),
    // Un IMEI no se repite entre las unidades que están en el local: una dada de baja lo libera, para
    // volver a recibir lo que se anuló o corregir un IMEI mal cargado (brief-29.5, D-2), y desde la
    // 29.7 también una vendida, para recibir como usado un equipo que el local vendió (brief-29.7, U-2).
    uniqueIndex("stock_units_organization_serial_lower_unique")
      .on(table.organizationId, sql`lower(${table.serial})`)
      .where(sql`${table.status} not in ('written_off', 'sold')`),
    // Destino de las claves foráneas de los movimientos y de las líneas.
    unique("stock_units_organization_id_id_unique").on(
      table.organizationId,
      table.id,
    ),
    unique("stock_units_organization_product_id_unique").on(
      table.organizationId,
      table.productId,
      table.id,
    ),
    index("stock_units_product_status_idx").on(
      table.organizationId,
      table.productId,
      table.status,
    ),
    check(
      "stock_units_serial_format",
      sql`${table.serial} ~ ${sql.raw(`'${UNIT_SERIAL_PATTERN}'`)}`,
    ),
    check(
      "stock_units_warranty_days_range",
      sql`${table.warrantyDays} between 0 and ${sql.raw(String(MAX_WARRANTY_DAYS))}`,
    ),
    check(
      "stock_units_battery_health_range",
      sql`${table.batteryHealth} between 0 and 100`,
    ),
    check("stock_units_cost_positive", sql`${table.cost} > 0`),
    check(
      "stock_units_cost_currency_format",
      sql`${table.costCurrency} ~ '^[A-Z]{3}$'`,
    ),
    // El precio y su moneda, los dos o ninguno.
    check(
      "stock_units_price_pair",
      sql`(${table.price} is null) = (${table.priceCurrency} is null)`,
    ),
    check("stock_units_price_positive", sql`${table.price} > 0`),
    check(
      "stock_units_price_currency_format",
      sql`${table.priceCurrency} ~ '^[A-Z]{3}$'`,
    ),
  ],
);

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
    // La unidad que entró o salió, en un producto por unidad (brief-29.5, D-2 y D-4): un movimiento
    // por unidad. Que sea obligatoria en un producto unit lo asegura inventory y lo prueba el
    // invariante: un CHECK no ve el seguimiento, que está en products.
    unitId: uuid("unit_id"),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    // Hora del INSERT, no del inicio de la transacción: el movimiento se inserta con el saldo
    // bloqueado, así que el orden por created_at sigue la cadena de saldos (brief-4.3.3, D-1).
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .default(sql`clock_timestamp()`),
  },
  (table) => [
    foreignKey({
      name: "inventory_movements_product_fk",
      columns: [table.organizationId, table.productId],
      foreignColumns: [products.organizationId, products.id],
    }).onDelete("restrict"),
    // La unidad es del mismo producto y de la misma organización.
    foreignKey({
      name: "inventory_movements_unit_fk",
      columns: [table.organizationId, table.productId, table.unitId],
      foreignColumns: [
        stockUnits.organizationId,
        stockUnits.productId,
        stockUnits.id,
      ],
    }).onDelete("restrict"),
    index("inventory_movements_unit_idx")
      .on(table.organizationId, table.unitId)
      .where(sql`${table.unitId} is not null`),
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

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
import { productModels, products } from "@/modules/catalog/schema";
import { clients } from "@/modules/crm/schema";
import { stockUnits, unitGrades } from "@/modules/inventory/schema";
import { organizations } from "@/modules/organizations/schema";
import { repairTypes } from "@/modules/service/schema";

// docs/architecture/DataModel.md, tablas trade_in_checklist_items, trade_ins,
// trade_in_checklist_results y trade_in_voids (ADR 0024, punto 8; brief-29.7, D-3 a D-5). Todo detrás
// de la capacidad trade_ins. La 29.7 recibe el usado; lo que hace cada destino con la plata (la
// permuta y la compra) lo hace cash desde la 29.7.2. Desde la 29.7.3, trade_in_settings y
// trade_in_margins, y el tipo de reparación de cada punto, para la cotización (brief-29.7.3, D-1 a D-3).

// Límites. Los mismos valores van en los CHECK.
export const CHECKLIST_ITEM_NAME_MAX_LENGTH = 80;
// Puntos del checklist por organización como máximo: más que esto no es un checklist de mostrador.
export const MAX_CHECKLIST_ITEMS = 40;
// El IMEI, con la forma de stock_units (brief-29.5, D-2).
export const TRADE_IN_SERIAL_PATTERN = "^[A-Za-z0-9][A-Za-z0-9-]{0,31}$";

// Los puntos del checklist de la organización (D-3): «Cámara trasera», «iCloud desvinculado». Se
// editan y se desactivan, nunca se borran: el resultado de una recepción guarda la copia del nombre.
export const tradeInChecklistItems = pgTable(
  "trade_in_checklist_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "restrict" }),
    name: text("name").notNull(),
    // Obligatorio para aceptar el equipo: si no pasa, la recepción se rechaza.
    isMandatory: boolean("is_mandatory").notNull().default(false),
    position: smallint("position").notNull().default(0),
    isActive: boolean("is_active").notNull().default(true),
    // Copiado de un perfil de rubro: un ejemplo que el negocio ajusta (ADR 0024, punto 13).
    isExample: boolean("is_example").notNull().default(false),
    // Desde la 29.7.3 (D-3): la reparación que necesita el equipo si el punto no pasa. Nulo: no descuenta
    // nada en la cotización.
    repairTypeId: uuid("repair_type_id"),
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
      name: "trade_in_checklist_items_repair_type_fk",
      columns: [table.organizationId, table.repairTypeId],
      foreignColumns: [repairTypes.organizationId, repairTypes.id],
    }).onDelete("restrict"),
    uniqueIndex("trade_in_checklist_items_organization_name_lower_unique").on(
      table.organizationId,
      sql`lower(${table.name})`,
    ),
    unique("trade_in_checklist_items_organization_id_id_unique").on(
      table.organizationId,
      table.id,
    ),
    check(
      "trade_in_checklist_items_name_length",
      sql`char_length(${table.name}) between 1 and ${sql.raw(String(CHECKLIST_ITEM_NAME_MAX_LENGTH))} and ${table.name} = btrim(${table.name})`,
    ),
    check(
      "trade_in_checklist_items_position_range",
      sql`${table.position} >= 0`,
    ),
  ],
);

// El destino del valor reconocido (D-4): la permuta, como crédito en una venta, o la compra del
// equipo. Se elige al emitir y no cambia; lo que hace cada uno con la plata lo hace cash desde la
// 29.7.2 (el cobro con «Permuta» y trade_in_payments).
export const tradeInDestination = pgEnum("trade_in_destination", [
  "sale_credit",
  "purchase",
]);

// La recepción de un usado, el comprobante PU (D-4), de solo inserción. Sin texto libre: no tiene
// datos personales (ADR 0015), y el vaciado de un cliente no la toca. La unidad que crea nace en
// revisión, con el valor como costo; el trigger trade_ins_check_unit lo comprueba.
export const tradeIns = pgTable(
  "trade_ins",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "restrict" }),
    number: bigint("number", { mode: "number" }).notNull(),
    clientId: uuid("client_id").notNull(),
    // El producto de destino: usado y llevado por unidad.
    productId: uuid("product_id").notNull(),
    unitId: uuid("unit_id").notNull(),
    serial: text("serial").notNull(),
    batteryHealth: smallint("battery_health").notNull(),
    // El grado propuesto. El de la unidad se puede corregir después; este no.
    gradeId: uuid("grade_id").notNull(),
    value: numeric("value", { precision: 14, scale: 2 }).notNull(),
    currency: text("currency").notNull(),
    destination: tradeInDestination("destination").notNull(),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .default(sql`clock_timestamp()`),
  },
  (table) => [
    unique("trade_ins_organization_number_unique").on(
      table.organizationId,
      table.number,
    ),
    unique("trade_ins_organization_id_id_unique").on(
      table.organizationId,
      table.id,
    ),
    // Una recepción tiene exactamente una unidad, y una unidad viene de a lo sumo una recepción.
    unique("trade_ins_unit_unique").on(table.unitId),
    foreignKey({
      name: "trade_ins_client_fk",
      columns: [table.organizationId, table.clientId],
      foreignColumns: [clients.organizationId, clients.id],
    }).onDelete("restrict"),
    foreignKey({
      name: "trade_ins_product_fk",
      columns: [table.organizationId, table.productId],
      foreignColumns: [products.organizationId, products.id],
    }).onDelete("restrict"),
    foreignKey({
      name: "trade_ins_unit_fk",
      columns: [table.organizationId, table.unitId],
      foreignColumns: [stockUnits.organizationId, stockUnits.id],
    }).onDelete("restrict"),
    foreignKey({
      name: "trade_ins_grade_fk",
      columns: [table.organizationId, table.gradeId],
      foreignColumns: [unitGrades.organizationId, unitGrades.id],
    }).onDelete("restrict"),
    index("trade_ins_list_idx").on(
      table.organizationId,
      table.createdAt.desc(),
      table.id.desc(),
    ),
    index("trade_ins_client_idx").on(
      table.organizationId,
      table.clientId,
      table.createdAt.desc(),
    ),
    index("trade_ins_serial_idx").on(
      table.organizationId,
      sql`lower(${table.serial})`,
    ),
    check("trade_ins_number_positive", sql`${table.number} > 0`),
    check(
      "trade_ins_serial_format",
      sql`${table.serial} ~ ${sql.raw(`'${TRADE_IN_SERIAL_PATTERN}'`)}`,
    ),
    check(
      "trade_ins_battery_health_range",
      sql`${table.batteryHealth} between 0 and 100`,
    ),
    check("trade_ins_value_positive", sql`${table.value} > 0`),
    check("trade_ins_currency_format", sql`${table.currency} ~ '^[A-Z]{3}$'`),
  ],
);

// El resultado del checklist de una recepción (D-4), de solo inserción: una fila por punto activo al
// emitirla, con una copia del nombre y de si era obligatorio, porque el punto se puede renombrar o
// cambiar después. Un punto obligatorio que no pasó no entra: la recepción se rechaza.
export const tradeInChecklistResults = pgTable(
  "trade_in_checklist_results",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "restrict" }),
    tradeInId: uuid("trade_in_id").notNull(),
    checklistItemId: uuid("checklist_item_id").notNull(),
    position: smallint("position").notNull(),
    itemName: text("item_name").notNull(),
    wasMandatory: boolean("was_mandatory").notNull(),
    passed: boolean("passed").notNull(),
  },
  (table) => [
    unique("trade_in_checklist_results_trade_in_item_unique").on(
      table.tradeInId,
      table.checklistItemId,
    ),
    unique("trade_in_checklist_results_trade_in_position_unique").on(
      table.tradeInId,
      table.position,
    ),
    foreignKey({
      name: "trade_in_checklist_results_trade_in_fk",
      columns: [table.organizationId, table.tradeInId],
      foreignColumns: [tradeIns.organizationId, tradeIns.id],
    }).onDelete("restrict"),
    foreignKey({
      name: "trade_in_checklist_results_item_fk",
      columns: [table.organizationId, table.checklistItemId],
      foreignColumns: [
        tradeInChecklistItems.organizationId,
        tradeInChecklistItems.id,
      ],
    }).onDelete("restrict"),
    check(
      "trade_in_checklist_results_position_range",
      sql`${table.position} between 1 and ${sql.raw(String(MAX_CHECKLIST_ITEMS))}`,
    ),
    check(
      "trade_in_checklist_results_item_name_length",
      sql`char_length(${table.itemName}) between 1 and ${sql.raw(String(CHECKLIST_ITEM_NAME_MAX_LENGTH))}`,
    ),
    check(
      "trade_in_checklist_results_mandatory_passed",
      sql`not ${table.wasMandatory} or ${table.passed}`,
    ),
  ],
);

// El motivo de la anulación (D-5), de una lista cerrada.
export const tradeInVoidReason = pgEnum("trade_in_void_reason", [
  "entered_by_mistake",
  "customer_withdrew",
  "other",
]);

// La anulación de una recepción, el comprobante APU (D-5), de solo inserción y a lo sumo una por
// recepción. La orquesta cash, bajo su bloqueo (U-4).
export const tradeInVoids = pgTable(
  "trade_in_voids",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "restrict" }),
    number: bigint("number", { mode: "number" }).notNull(),
    tradeInId: uuid("trade_in_id").notNull(),
    reason: tradeInVoidReason("reason").notNull(),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .default(sql`clock_timestamp()`),
  },
  (table) => [
    unique("trade_in_voids_organization_number_unique").on(
      table.organizationId,
      table.number,
    ),
    unique("trade_in_voids_trade_in_unique").on(table.tradeInId),
    foreignKey({
      name: "trade_in_voids_trade_in_fk",
      columns: [table.organizationId, table.tradeInId],
      foreignColumns: [tradeIns.organizationId, tradeIns.id],
    }).onDelete("restrict"),
    check("trade_in_voids_number_positive", sql`${table.number} > 0`),
  ],
);

// El porcentaje del rango, como máximo (D-1): más que esto ya no es un rango sino otra cotización.
export const MAX_RANGE_PERCENT = 50;

// Los valores sueltos de la cotización (ADR 0024, punto 13; brief-29.7.3, D-1): una fila por
// organización con trade_ins, que crea org:capability con los valores del perfil (U-4). Se edita, no se
// borra. is_example queda hasta que un admin cambia un valor.
export const tradeInSettings = pgTable(
  "trade_in_settings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "restrict" }),
    // Una batería por debajo de este porcentaje suma la reparación de la batería.
    batteryThreshold: smallint("battery_threshold").notNull(),
    // El piso del rango es el valor menos este porcentaje.
    rangePercent: numeric("range_percent", {
      precision: 4,
      scale: 2,
    }).notNull(),
    // Los dos extremos se redondean hacia abajo a un múltiplo de este monto, en su moneda (R-21).
    roundingStep: numeric("rounding_step", {
      precision: 14,
      scale: 2,
    }).notNull(),
    roundingCurrency: text("rounding_currency").notNull(),
    // La reparación de la batería (U-2): nula, una batería baja no se puede cotizar.
    batteryRepairTypeId: uuid("battery_repair_type_id"),
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
    unique("trade_in_settings_organization_unique").on(table.organizationId),
    foreignKey({
      name: "trade_in_settings_battery_repair_type_fk",
      columns: [table.organizationId, table.batteryRepairTypeId],
      foreignColumns: [repairTypes.organizationId, repairTypes.id],
    }).onDelete("restrict"),
    check(
      "trade_in_settings_battery_threshold_range",
      sql`${table.batteryThreshold} between 1 and 100`,
    ),
    check(
      "trade_in_settings_range_percent_range",
      sql`${table.rangePercent} between 0 and ${sql.raw(String(MAX_RANGE_PERCENT))}`,
    ),
    check(
      "trade_in_settings_rounding_step_positive",
      sql`${table.roundingStep} > 0`,
    ),
    check(
      "trade_in_settings_rounding_currency_format",
      sql`${table.roundingCurrency} ~ '^[A-Z]{3}$'`,
    ),
  ],
);

// El margen de cada modelo (ADR 0024, puntos 9 y 13; brief-29.7.3, D-2): lo que el negocio se guarda de
// ganancia al comprar un usado de ese modelo. Sin ejemplos (U-3): un modelo sin margen no se cotiza. Se
// edita, no se borra; cero es un margen.
export const tradeInMargins = pgTable(
  "trade_in_margins",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "restrict" }),
    modelId: uuid("model_id").notNull(),
    amount: numeric("amount", { precision: 14, scale: 2 }).notNull(),
    currency: text("currency").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    unique("trade_in_margins_organization_model_unique").on(
      table.organizationId,
      table.modelId,
    ),
    foreignKey({
      name: "trade_in_margins_model_fk",
      columns: [table.organizationId, table.modelId],
      foreignColumns: [productModels.organizationId, productModels.id],
    }).onDelete("restrict"),
    check("trade_in_margins_amount_not_negative", sql`${table.amount} >= 0`),
    check(
      "trade_in_margins_currency_format",
      sql`${table.currency} ~ '^[A-Z]{3}$'`,
    ),
  ],
);

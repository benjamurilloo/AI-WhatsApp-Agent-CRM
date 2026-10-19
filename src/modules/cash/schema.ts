import { sql } from "drizzle-orm";
import {
  type AnyPgColumn,
  bigint,
  boolean,
  check,
  foreignKey,
  index,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { users } from "@/modules/auth/schema";
import { clients } from "@/modules/crm/schema";
import { exchangeRates } from "@/modules/fx/schema";
import { orders } from "@/modules/orders/schema";
import { organizations } from "@/modules/organizations/schema";
import { goodsReceipts, suppliers } from "@/modules/purchasing/schema";
import { sales } from "@/modules/sales/schema";

// docs/architecture/DataModel.md, tablas payment_methods, cash_sessions,
// cash_session_opening_amounts, cash_session_closings, cash_session_closing_amounts y
// cash_movements (ADR 0022, puntos 8, 10 y 11; brief-21.2, D-1, D-2 y D-6).
//
// La caja del efectivo se opera por sesiones. La apertura, el cierre y los movimientos mueven
// dinero: las cinco tablas de la caja son de solo inserción (ADR 0013, regla 10 de DataModel), con
// SELECT e INSERT para crm_app y el trigger cash_reject_change() de la 0042, propio de cash para no
// depender de sales en la base (brief-21.2, H-3). Abierta o cerrada se deriva de que exista el
// cierre. El inicial, lo contado y lo esperado van por moneda, en dos tablas hijas (D-1).

// La lista de con qué se registra un cobro, por organización (ADR 0022, punto 10; brief-21.2, D-6).
// Se edita con borrado lógico: crm_app tiene SELECT, INSERT y UPDATE, sin DELETE. «Es efectivo» se
// fija al crearlo: el trigger de la 0042 rechaza cambiarlo, para que un cobro viejo no cambie de
// caja.
export const paymentMethods = pgTable(
  "payment_methods",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "restrict" }),
    name: text("name").notNull(),
    isCash: boolean("is_cash").notNull(),
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
    // Un nombre por organización, sin distinguir mayúsculas, también frente a los inactivos (D-6).
    uniqueIndex("payment_methods_organization_name_lower_unique").on(
      table.organizationId,
      sql`lower(${table.name})`,
    ),
    // Destino de la clave compuesta de los cobros, desde la 21.3.
    unique("payment_methods_organization_id_id_unique").on(
      table.organizationId,
      table.id,
    ),
    check(
      "payment_methods_name_length",
      sql`char_length(${table.name}) between 1 and 40`,
    ),
    check(
      "payment_methods_name_trimmed",
      sql`${table.name} = btrim(${table.name})`,
    ),
  ],
);

// La sesión de caja (ADR 0022, punto 8; brief-21.2, D-1). Cada una apunta a la anterior, y la base
// impide dos abiertas: cada sesión tiene a lo sumo una siguiente (cash_sessions_previous_unique),
// hay una sola primera por organización (el índice parcial; UNIQUE admite varios nulos) y el
// trigger de la 0042 rechaza abrir si la anterior no tiene cierre.
export const cashSessions = pgTable(
  "cash_sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "restrict" }),
    // Del contador de numbering con el tipo cash_session; se muestra como C-000045.
    number: bigint("number", { mode: "number" }).notNull(),
    // Nula solo en la primera sesión de la organización.
    previousSessionId: uuid("previous_session_id"),
    // Siempre un usuario: el agente no opera la caja (ADR 0022, punto 12).
    openedBy: uuid("opened_by")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    openedAt: timestamp("opened_at", { withTimezone: true })
      .notNull()
      .default(sql`clock_timestamp()`),
  },
  (table) => [
    unique("cash_sessions_organization_number_unique").on(
      table.organizationId,
      table.number,
    ),
    // Destino de las claves compuestas de las tablas hijas y de la anterior.
    unique("cash_sessions_organization_id_id_unique").on(
      table.organizationId,
      table.id,
    ),
    unique("cash_sessions_previous_unique").on(table.previousSessionId),
    uniqueIndex("cash_sessions_first_unique")
      .on(table.organizationId)
      .where(sql`${table.previousSessionId} IS NULL`),
    foreignKey({
      name: "cash_sessions_previous_fk",
      columns: [table.organizationId, table.previousSessionId],
      foreignColumns: [table.organizationId, table.id],
    }).onDelete("restrict"),
    check("cash_sessions_number_positive", sql`${table.number} > 0`),
  ],
);

// El efectivo contado al abrir, una fila por moneda (ADR 0022, punto 8; brief-21.2, D-1). Puede ser
// cero. Lo escribe solo la apertura: lo aseguran el servicio y la guarda cash-writes.
export const cashSessionOpeningAmounts = pgTable(
  "cash_session_opening_amounts",
  {
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "restrict" }),
    sessionId: uuid("session_id").notNull(),
    currency: text("currency").notNull(),
    amount: numeric("amount", { precision: 14, scale: 2 }).notNull(),
  },
  (table) => [
    primaryKey({
      name: "cash_session_opening_amounts_pkey",
      columns: [table.sessionId, table.currency],
    }),
    foreignKey({
      name: "cash_session_opening_amounts_session_fk",
      columns: [table.organizationId, table.sessionId],
      foreignColumns: [cashSessions.organizationId, cashSessions.id],
    }).onDelete("restrict"),
    check(
      "cash_session_opening_amounts_amount_non_negative",
      sql`${table.amount} >= 0`,
    ),
    check(
      "cash_session_opening_amounts_currency_format",
      sql`${table.currency} ~ '^[A-Z]{3}$'`,
    ),
  ],
);

// El cierre de una sesión, a lo sumo uno (ADR 0022, punto 8). Se escribe después de sus filas por
// moneda, en la misma transacción: desde que existe, el trigger de la sesión cerrada rechaza
// cualquier fila nueva (brief-21.2, D-1).
export const cashSessionClosings = pgTable(
  "cash_session_closings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "restrict" }),
    sessionId: uuid("session_id").notNull(),
    closedBy: uuid("closed_by")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    closedAt: timestamp("closed_at", { withTimezone: true })
      .notNull()
      .default(sql`clock_timestamp()`),
  },
  (table) => [
    unique("cash_session_closings_session_unique").on(table.sessionId),
    foreignKey({
      name: "cash_session_closings_session_fk",
      columns: [table.organizationId, table.sessionId],
      foreignColumns: [cashSessions.organizationId, cashSessions.id],
    }).onDelete("restrict"),
  ],
);

// Lo contado y lo esperado al cerrar, una fila por moneda (ADR 0022, punto 8; brief-21.2, D-1 y
// D-4). La diferencia es contado − esperado y no se guarda. Lo esperado lo calcula el servicio con
// el bloqueo de cobros tomado, y nunca es negativo.
export const cashSessionClosingAmounts = pgTable(
  "cash_session_closing_amounts",
  {
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "restrict" }),
    sessionId: uuid("session_id").notNull(),
    currency: text("currency").notNull(),
    counted: numeric("counted", { precision: 14, scale: 2 }).notNull(),
    expected: numeric("expected", { precision: 14, scale: 2 }).notNull(),
  },
  (table) => [
    primaryKey({
      name: "cash_session_closing_amounts_pkey",
      columns: [table.sessionId, table.currency],
    }),
    foreignKey({
      name: "cash_session_closing_amounts_session_fk",
      columns: [table.organizationId, table.sessionId],
      foreignColumns: [cashSessions.organizationId, cashSessions.id],
    }).onDelete("restrict"),
    check(
      "cash_session_closing_amounts_counted_non_negative",
      sql`${table.counted} >= 0`,
    ),
    check(
      "cash_session_closing_amounts_expected_non_negative",
      sql`${table.expected} >= 0`,
    ),
    check(
      "cash_session_closing_amounts_currency_format",
      sql`${table.currency} ~ '^[A-Z]{3}$'`,
    ),
  ],
);

// Un aporte o un retiro de efectivo (ADR 0022, punto 8; brief-21.2, D-2).
export const cashMovementKind = pgEnum("cash_movement_kind", [
  "contribution",
  "withdrawal",
]);

// El motivo, de una lista cerrada y sin texto libre (brief-21.2, D-2). Un gasto no es un
// movimiento de caja: los pagos son de la Fase 22. Un valor nuevo se suma con un ALTER TYPE
// aditivo, y el CHECK de cash_movements dice a qué tipo corresponde.
export const cashMovementReason = pgEnum("cash_movement_reason", [
  "change_fund",
  "owner_contribution",
  "bank_deposit",
  "owner_withdrawal",
  "correction",
  "other",
]);

// Los movimientos manuales de la sesión abierta, sin número: se nombran dentro de su sesión (ADR
// 0022, punto 11). Monto positivo; el tipo dice si suma o resta.
export const cashMovements = pgTable(
  "cash_movements",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "restrict" }),
    sessionId: uuid("session_id").notNull(),
    kind: cashMovementKind("kind").notNull(),
    currency: text("currency").notNull(),
    amount: numeric("amount", { precision: 14, scale: 2 }).notNull(),
    reason: cashMovementReason("reason").notNull(),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .default(sql`clock_timestamp()`),
  },
  (table) => [
    foreignKey({
      name: "cash_movements_session_fk",
      columns: [table.organizationId, table.sessionId],
      foreignColumns: [cashSessions.organizationId, cashSessions.id],
    }).onDelete("restrict"),
    index("cash_movements_session_idx").on(
      table.organizationId,
      table.sessionId,
      table.createdAt,
    ),
    check("cash_movements_amount_positive", sql`${table.amount} > 0`),
    check(
      "cash_movements_currency_format",
      sql`${table.currency} ~ '^[A-Z]{3}$'`,
    ),
    // El motivo corresponde al tipo (D-2): «Corrección de caja» y «Otro» valen para los dos.
    check(
      "cash_movements_reason_fits_kind",
      sql`(${table.kind} = 'contribution' AND ${table.reason} IN ('change_fund', 'owner_contribution', 'correction', 'other'))
        OR (${table.kind} = 'withdrawal' AND ${table.reason} IN ('bank_deposit', 'owner_withdrawal', 'correction', 'other'))`,
    ),
  ],
);

// El destino de un cobro (ADR 0022, punto 2; brief-21.3, D-1). Nace con la venta; la 21.4 le suma
// el pedido, la seña (brief-21.4, D-1), y la 21.6, la cuenta, el cobro a cuenta (brief-21.6, D-1), con
// ALTER TYPE aditivos, y reescriben receipts_target_check.
export const receiptTarget = pgEnum("receipt_target", [
  "sale",
  "order",
  "account",
]);

// El cobro, como recibo (ADR 0022, puntos 2 a 4; brief-21.3, D-1). Es un comprobante emitido, de
// solo inserción como la caja: SELECT e INSERT para crm_app y cash_reject_change() de la 0042. No
// tiene estados ni texto libre. Copia el cliente y la moneda de su destino: lo asegura el servicio,
// que lee la venta por la interfaz de sales con el bloqueo de cobros tomado, no un trigger, que
// cruzaría módulos en la base (punto 2). Si el medio es efectivo, queda en la sesión de caja abierta:
// lo exige el trigger receipts_cash_session de la 0043, y cash_reject_closed_session() rechaza una
// sesión con cierre (brief-21.3, H-3 y H-4).
export const receipts = pgTable(
  "receipts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "restrict" }),
    // Del contador de numbering con el tipo receipt; se muestra como R-000123.
    number: bigint("number", { mode: "number" }).notNull(),
    target: receiptTarget("target").notNull(),
    saleId: uuid("sale_id"),
    // El pedido de una seña (brief-21.4, D-1).
    orderId: uuid("order_id"),
    // El cliente de la venta o del pedido, copiado, o el de la cuenta en un cobro a cuenta; nulo solo
    // en el cobro de una venta sin cliente.
    clientId: uuid("client_id"),
    paymentMethodId: uuid("payment_method_id").notNull(),
    // La sesión de caja, solo si el medio es efectivo.
    sessionId: uuid("session_id"),
    // La de la venta o la del pedido, copiada, o la que se elige en un cobro a cuenta (punto 2).
    currency: text("currency").notNull(),
    amount: numeric("amount", { precision: 14, scale: 2 }).notNull(),
    // Lo recibido, si entró en otra moneda que el destino (ADR 0025, punto 5; brief-29.4, D-6):
    // la moneda y el monto que entraron, la cotización usada, copiada, y su fila si fue la vigente. Las
    // tres primeras van juntas o ninguna; currency y amount siguen siendo lo aplicado.
    tenderedCurrency: text("tendered_currency"),
    tenderedAmount: numeric("tendered_amount", { precision: 14, scale: 2 }),
    exchangeRate: numeric("exchange_rate", { precision: 18, scale: 6 }),
    exchangeRateId: uuid("exchange_rate_id"),
    // Siempre un usuario: el agente no cobra (ADR 0022, punto 12).
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .default(sql`clock_timestamp()`),
  },
  (table) => [
    unique("receipts_organization_number_unique").on(
      table.organizationId,
      table.number,
    ),
    // Destino de las claves compuestas de las anulaciones de la 21.5.
    unique("receipts_organization_id_id_unique").on(
      table.organizationId,
      table.id,
    ),
    // Ninguna fila apunta a otra organización, y nada de lo que apunta se borra mientras tenga
    // cobros: la de clients es la que impide borrar un cliente con cobros (punto 14).
    foreignKey({
      name: "receipts_sale_fk",
      columns: [table.organizationId, table.saleId],
      foreignColumns: [sales.organizationId, sales.id],
    }).onDelete("restrict"),
    foreignKey({
      name: "receipts_order_fk",
      columns: [table.organizationId, table.orderId],
      foreignColumns: [orders.organizationId, orders.id],
    }).onDelete("restrict"),
    foreignKey({
      name: "receipts_client_fk",
      columns: [table.organizationId, table.clientId],
      foreignColumns: [clients.organizationId, clients.id],
    }).onDelete("restrict"),
    foreignKey({
      name: "receipts_payment_method_fk",
      columns: [table.organizationId, table.paymentMethodId],
      foreignColumns: [paymentMethods.organizationId, paymentMethods.id],
    }).onDelete("restrict"),
    foreignKey({
      name: "receipts_session_fk",
      columns: [table.organizationId, table.sessionId],
      foreignColumns: [cashSessions.organizationId, cashSessions.id],
    }).onDelete("restrict"),
    // Los cobros de una venta, las señas de un pedido, los de un cliente para la imputación y los
    // de una sesión.
    index("receipts_sale_idx").on(table.organizationId, table.saleId),
    index("receipts_order_idx").on(table.organizationId, table.orderId),
    index("receipts_client_idx").on(table.organizationId, table.clientId),
    index("receipts_session_idx").on(table.organizationId, table.sessionId),
    // Un solo destino, con su clave y sin la de los otros (punto 2); el cobro a cuenta, con el cliente
    // y sin venta ni pedido (brief-21.6, D-1). Compara target::text: el migrador aplica todas las
    // migraciones pendientes en una transacción, y PostgreSQL no deja usar en ella el valor que la
    // 0044 y la 0046 suman al enum (brief-21.4, H-2).
    check(
      "receipts_target_check",
      sql`(${table.target}::text = 'sale' AND ${table.saleId} IS NOT NULL AND ${table.orderId} IS NULL)
        OR (${table.target}::text = 'order' AND ${table.orderId} IS NOT NULL AND ${table.saleId} IS NULL)
        OR (${table.target}::text = 'account' AND ${table.clientId} IS NOT NULL AND ${table.saleId} IS NULL AND ${table.orderId} IS NULL)`,
    ),
    check("receipts_number_positive", sql`${table.number} > 0`),
    check("receipts_amount_positive", sql`${table.amount} > 0`),
    check("receipts_currency_format", sql`${table.currency} ~ '^[A-Z]{3}$'`),
    foreignKey({
      name: "receipts_exchange_rate_fk",
      columns: [table.organizationId, table.exchangeRateId],
      foreignColumns: [exchangeRates.organizationId, exchangeRates.id],
    }).onDelete("restrict"),
    // Lo recibido: las tres juntas o ninguna, la fila de la cotización solo con ellas, otra moneda
    // que la aplicada, un monto positivo y una cotización de al menos 1 (ADR 0025, punto 5, R-M1).
    check(
      "receipts_tendered_together",
      sql`(${table.tenderedCurrency} IS NULL AND ${table.tenderedAmount} IS NULL AND ${table.exchangeRate} IS NULL)
        OR (${table.tenderedCurrency} IS NOT NULL AND ${table.tenderedAmount} IS NOT NULL AND ${table.exchangeRate} IS NOT NULL)`,
    ),
    check(
      "receipts_exchange_rate_id_tendered",
      sql`${table.exchangeRateId} IS NULL OR ${table.tenderedCurrency} IS NOT NULL`,
    ),
    check(
      "receipts_tendered_currency_distinct",
      sql`${table.tenderedCurrency} IS NULL OR ${table.tenderedCurrency} <> ${table.currency}`,
    ),
    check(
      "receipts_tendered_currency_format",
      sql`${table.tenderedCurrency} IS NULL OR ${table.tenderedCurrency} ~ '^[A-Z]{3}$'`,
    ),
    check(
      "receipts_tendered_amount_positive",
      sql`${table.tenderedAmount} IS NULL OR ${table.tenderedAmount} > 0`,
    ),
    check(
      "receipts_exchange_rate_minimum",
      sql`${table.exchangeRate} IS NULL OR ${table.exchangeRate} >= 1`,
    ),
  ],
);

// El motivo de la anulación de un cobro, de una lista cerrada y sin texto libre (ADR 0022, punto 7;
// brief-21.5, D-3).
export const receiptVoidReason = pgEnum("receipt_void_reason", [
  "not_received",
  "wrong_method",
  "wrong_amount",
  "wrong_target",
  "other",
]);

// La anulación de un cobro (ADR 0022, punto 7; brief-21.5, D-1): un comprobante emitido, de solo
// inserción, a lo sumo uno por cobro. Copia la moneda y el monto del cobro, y la sesión en la que
// impacta: la del cobro si esa sesión no tiene cierre, y ninguna si lo tiene o si el cobro no fue en
// efectivo (H-5). Lo defiende receipt_voids_check_copy() de la 0045. Sin cliente: llega a él por su
// cobro, como sale_voids llega por su venta.
export const receiptVoids = pgTable(
  "receipt_voids",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "restrict" }),
    // Del contador de numbering con el tipo receipt_void; se muestra como AR-000012.
    number: bigint("number", { mode: "number" }).notNull(),
    receiptId: uuid("receipt_id").notNull(),
    currency: text("currency").notNull(),
    amount: numeric("amount", { precision: 14, scale: 2 }).notNull(),
    // Lo recibido por el cobro, copiado (ADR 0025, punto 5; brief-29.4, D-6): lo que la caja
    // devuelve. Lo compara receipt_voids_check_copy() de la 0053, como la moneda y el monto.
    tenderedCurrency: text("tendered_currency"),
    tenderedAmount: numeric("tendered_amount", { precision: 14, scale: 2 }),
    exchangeRate: numeric("exchange_rate", { precision: 18, scale: 6 }),
    exchangeRateId: uuid("exchange_rate_id"),
    reason: receiptVoidReason("reason").notNull(),
    // La sesión abierta del cobro en efectivo anulado: lo esperado de esa sesión deja de contarlo.
    sessionId: uuid("session_id"),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .default(sql`clock_timestamp()`),
  },
  (table) => [
    unique("receipt_voids_organization_number_unique").on(
      table.organizationId,
      table.number,
    ),
    unique("receipt_voids_receipt_unique").on(table.receiptId),
    foreignKey({
      name: "receipt_voids_receipt_fk",
      columns: [table.organizationId, table.receiptId],
      foreignColumns: [receipts.organizationId, receipts.id],
    }).onDelete("restrict"),
    foreignKey({
      name: "receipt_voids_session_fk",
      columns: [table.organizationId, table.sessionId],
      foreignColumns: [cashSessions.organizationId, cashSessions.id],
    }).onDelete("restrict"),
    index("receipt_voids_session_idx").on(
      table.organizationId,
      table.sessionId,
    ),
    check("receipt_voids_number_positive", sql`${table.number} > 0`),
    check("receipt_voids_amount_positive", sql`${table.amount} > 0`),
    check(
      "receipt_voids_currency_format",
      sql`${table.currency} ~ '^[A-Z]{3}$'`,
    ),
    foreignKey({
      name: "receipt_voids_exchange_rate_fk",
      columns: [table.organizationId, table.exchangeRateId],
      foreignColumns: [exchangeRates.organizationId, exchangeRates.id],
    }).onDelete("restrict"),
    // Lo recibido: las tres juntas o ninguna, la fila de la cotización solo con ellas, otra moneda
    // que la aplicada, un monto positivo y una cotización de al menos 1 (ADR 0025, punto 5, R-M1).
    check(
      "receipt_voids_tendered_together",
      sql`(${table.tenderedCurrency} IS NULL AND ${table.tenderedAmount} IS NULL AND ${table.exchangeRate} IS NULL)
        OR (${table.tenderedCurrency} IS NOT NULL AND ${table.tenderedAmount} IS NOT NULL AND ${table.exchangeRate} IS NOT NULL)`,
    ),
    check(
      "receipt_voids_exchange_rate_id_tendered",
      sql`${table.exchangeRateId} IS NULL OR ${table.tenderedCurrency} IS NOT NULL`,
    ),
    check(
      "receipt_voids_tendered_currency_distinct",
      sql`${table.tenderedCurrency} IS NULL OR ${table.tenderedCurrency} <> ${table.currency}`,
    ),
    check(
      "receipt_voids_tendered_currency_format",
      sql`${table.tenderedCurrency} IS NULL OR ${table.tenderedCurrency} ~ '^[A-Z]{3}$'`,
    ),
    check(
      "receipt_voids_tendered_amount_positive",
      sql`${table.tenderedAmount} IS NULL OR ${table.tenderedAmount} > 0`,
    ),
    check(
      "receipt_voids_exchange_rate_minimum",
      sql`${table.exchangeRate} IS NULL OR ${table.exchangeRate} >= 1`,
    ),
  ],
);

// De dónde sale una devolución (ADR 0022, punto 7; brief-21.5, D-2): el saldo a favor de la cuenta
// de un cliente, o lo que queda a devolver de una venta sin cliente anulada.
// Lo que entró o salió en otra moneda que el destino (ADR 0025, punto 5): la moneda y el monto, la
// cotización usada, copiada, y su fila si fue la vigente. Lo usan, desde la 29.4.3, la devolución, el
// pago a un proveedor y sus anulaciones (brief-29.4.3, D-2); los cobros lo declaran en línea desde la
// 29.4, con los mismos nombres.
function tenderedColumns() {
  return {
    tenderedCurrency: text("tendered_currency"),
    tenderedAmount: numeric("tendered_amount", { precision: 14, scale: 2 }),
    exchangeRate: numeric("exchange_rate", { precision: 18, scale: 6 }),
    exchangeRateId: uuid("exchange_rate_id"),
  };
}

// Sus restricciones, las del cobro (ADR 0025, punto 5, R-M1): las tres juntas o ninguna, la fila de
// la cotización solo con ellas, otra moneda que la aplicada, un monto positivo y una cotización de al
// menos 1, y la clave compuesta contra la cotización de la misma organización.
function tenderedConstraints(
  prefix: string,
  table: {
    organizationId: AnyPgColumn;
    currency: AnyPgColumn;
    tenderedCurrency: AnyPgColumn;
    tenderedAmount: AnyPgColumn;
    exchangeRate: AnyPgColumn;
    exchangeRateId: AnyPgColumn;
  },
) {
  return [
    foreignKey({
      name: `${prefix}_exchange_rate_fk`,
      columns: [table.organizationId, table.exchangeRateId],
      foreignColumns: [exchangeRates.organizationId, exchangeRates.id],
    }).onDelete("restrict"),
    check(
      `${prefix}_tendered_together`,
      sql`(${table.tenderedCurrency} IS NULL AND ${table.tenderedAmount} IS NULL AND ${table.exchangeRate} IS NULL)
        OR (${table.tenderedCurrency} IS NOT NULL AND ${table.tenderedAmount} IS NOT NULL AND ${table.exchangeRate} IS NOT NULL)`,
    ),
    check(
      `${prefix}_exchange_rate_id_tendered`,
      sql`${table.exchangeRateId} IS NULL OR ${table.tenderedCurrency} IS NOT NULL`,
    ),
    check(
      `${prefix}_tendered_currency_distinct`,
      sql`${table.tenderedCurrency} IS NULL OR ${table.tenderedCurrency} <> ${table.currency}`,
    ),
    check(
      `${prefix}_tendered_currency_format`,
      sql`${table.tenderedCurrency} IS NULL OR ${table.tenderedCurrency} ~ '^[A-Z]{3}$'`,
    ),
    check(
      `${prefix}_tendered_amount_positive`,
      sql`${table.tenderedAmount} IS NULL OR ${table.tenderedAmount} > 0`,
    ),
    check(
      `${prefix}_exchange_rate_minimum`,
      sql`${table.exchangeRate} IS NULL OR ${table.exchangeRate} >= 1`,
    ),
  ];
}

export const refundTarget = pgEnum("refund_target", ["account", "sale"]);

// La devolución (ADR 0022, punto 7; brief-21.5, D-2): la plata que salió hacia el cliente. De solo
// inserción, sin motivo ni texto libre. Si es en efectivo, sale de la sesión de caja abierta: lo
// exigen receipts_check_cash_session() y cash_reject_closed_session(), reutilizados (H-6). Que el
// monto no supere lo disponible lo asegura el servicio con el bloqueo de cobros tomado.
export const refunds = pgTable(
  "refunds",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "restrict" }),
    // Del contador de numbering con el tipo refund; se muestra como D-000007.
    number: bigint("number", { mode: "number" }).notNull(),
    target: refundTarget("target").notNull(),
    // El cliente de la cuenta; nulo en la devolución de una venta, que no tiene cliente.
    clientId: uuid("client_id"),
    saleId: uuid("sale_id"),
    paymentMethodId: uuid("payment_method_id").notNull(),
    sessionId: uuid("session_id"),
    currency: text("currency").notNull(),
    amount: numeric("amount", { precision: 14, scale: 2 }).notNull(),
    // Lo que salió o volvió en otra moneda (brief-29.4.3, D-2).
    ...tenderedColumns(),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .default(sql`clock_timestamp()`),
  },
  (table) => [
    unique("refunds_organization_number_unique").on(
      table.organizationId,
      table.number,
    ),
    // Destino de la clave compuesta de su anulación.
    unique("refunds_organization_id_id_unique").on(
      table.organizationId,
      table.id,
    ),
    // La de clients impide borrar un cliente con devoluciones (punto 14; D-10).
    foreignKey({
      name: "refunds_client_fk",
      columns: [table.organizationId, table.clientId],
      foreignColumns: [clients.organizationId, clients.id],
    }).onDelete("restrict"),
    foreignKey({
      name: "refunds_sale_fk",
      columns: [table.organizationId, table.saleId],
      foreignColumns: [sales.organizationId, sales.id],
    }).onDelete("restrict"),
    foreignKey({
      name: "refunds_payment_method_fk",
      columns: [table.organizationId, table.paymentMethodId],
      foreignColumns: [paymentMethods.organizationId, paymentMethods.id],
    }).onDelete("restrict"),
    foreignKey({
      name: "refunds_session_fk",
      columns: [table.organizationId, table.sessionId],
      foreignColumns: [cashSessions.organizationId, cashSessions.id],
    }).onDelete("restrict"),
    index("refunds_client_idx").on(table.organizationId, table.clientId),
    index("refunds_sale_idx").on(table.organizationId, table.saleId),
    index("refunds_session_idx").on(table.organizationId, table.sessionId),
    // Con la cuenta, el cliente y ninguna venta; con la venta, ningún cliente (D-2). El enum es
    // nuevo en la 0045, así que el CHECK puede usar sus literales (H-7).
    check(
      "refunds_target_check",
      sql`(${table.target} = 'account' AND ${table.clientId} IS NOT NULL AND ${table.saleId} IS NULL)
        OR (${table.target} = 'sale' AND ${table.saleId} IS NOT NULL AND ${table.clientId} IS NULL)`,
    ),
    check("refunds_number_positive", sql`${table.number} > 0`),
    check("refunds_amount_positive", sql`${table.amount} > 0`),
    ...tenderedConstraints("refunds", table),
    check("refunds_currency_format", sql`${table.currency} ~ '^[A-Z]{3}$'`),
  ],
);

// El motivo de la anulación de una devolución (brief-21.5, D-3).
export const refundVoidReason = pgEnum("refund_void_reason", [
  "not_paid",
  "wrong_method",
  "wrong_amount",
  "wrong_client",
  "other",
]);

// La anulación de una devolución (ADR 0022, punto 7; brief-21.5, D-3), con las reglas de la del
// cobro: entera, a lo sumo una vez, los montos y la sesión copiados (refund_voids_check_copy()).
export const refundVoids = pgTable(
  "refund_voids",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "restrict" }),
    // Del contador de numbering con el tipo refund_void; se muestra como AD-000002.
    number: bigint("number", { mode: "number" }).notNull(),
    refundId: uuid("refund_id").notNull(),
    currency: text("currency").notNull(),
    amount: numeric("amount", { precision: 14, scale: 2 }).notNull(),
    // Lo que salió o volvió en otra moneda (brief-29.4.3, D-2).
    ...tenderedColumns(),
    reason: refundVoidReason("reason").notNull(),
    sessionId: uuid("session_id"),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .default(sql`clock_timestamp()`),
  },
  (table) => [
    unique("refund_voids_organization_number_unique").on(
      table.organizationId,
      table.number,
    ),
    unique("refund_voids_refund_unique").on(table.refundId),
    foreignKey({
      name: "refund_voids_refund_fk",
      columns: [table.organizationId, table.refundId],
      foreignColumns: [refunds.organizationId, refunds.id],
    }).onDelete("restrict"),
    foreignKey({
      name: "refund_voids_session_fk",
      columns: [table.organizationId, table.sessionId],
      foreignColumns: [cashSessions.organizationId, cashSessions.id],
    }).onDelete("restrict"),
    index("refund_voids_session_idx").on(table.organizationId, table.sessionId),
    ...tenderedConstraints("refund_voids", table),
    check("refund_voids_number_positive", sql`${table.number} > 0`),
    check("refund_voids_amount_positive", sql`${table.amount} > 0`),
    check(
      "refund_voids_currency_format",
      sql`${table.currency} ~ '^[A-Z]{3}$'`,
    ),
  ],
);

// El destino de un pago a un proveedor (ADR 0023, punto 8; brief-22.6, D-2): una recepción, o la
// cuenta del proveedor, el pago a cuenta. Nace entero en la 0051, así que el CHECK usa sus literales.
export const supplierPaymentTarget = pgEnum("supplier_payment_target", [
  "goods_receipt",
  "account",
]);

// El pago a un proveedor (ADR 0023, punto 8; brief-22.6, D-2), con la forma del cobro: un comprobante
// emitido, de solo inserción (SELECT e INSERT para crm_app y cash_reject_change() de la 0042), sin
// estados ni texto libre. Copia el proveedor de la recepción; que la copia sea la del destino lo
// asegura el servicio, que lee la recepción por la interfaz de purchasing con el bloqueo de cobros
// tomado (H-4). Si el medio es efectivo, sale de la sesión abierta: lo exigen
// receipts_check_cash_session() y cash_reject_closed_session(), reutilizados.
export const supplierPayments = pgTable(
  "supplier_payments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "restrict" }),
    // Del contador de numbering con el tipo supplier_payment; se muestra como PP-000123.
    number: bigint("number", { mode: "number" }).notNull(),
    target: supplierPaymentTarget("target").notNull(),
    // Nulo en un pago a cuenta.
    goodsReceiptId: uuid("goods_receipt_id"),
    // El de la recepción, copiado, o el de la cuenta: siempre presente.
    supplierId: uuid("supplier_id").notNull(),
    paymentMethodId: uuid("payment_method_id").notNull(),
    // La sesión de caja, solo si el medio es efectivo.
    sessionId: uuid("session_id"),
    // La de la recepción, copiada, o la que se elige en un pago a cuenta.
    currency: text("currency").notNull(),
    amount: numeric("amount", { precision: 14, scale: 2 }).notNull(),
    // Lo que salió o volvió en otra moneda (brief-29.4.3, D-2).
    ...tenderedColumns(),
    // Siempre un usuario: el agente no paga (ADR 0016, punto 5).
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .default(sql`clock_timestamp()`),
  },
  (table) => [
    unique("supplier_payments_organization_number_unique").on(
      table.organizationId,
      table.number,
    ),
    // Destino de la clave compuesta de la anulación.
    unique("supplier_payments_organization_id_id_unique").on(
      table.organizationId,
      table.id,
    ),
    foreignKey({
      name: "supplier_payments_goods_receipt_fk",
      columns: [table.organizationId, table.goodsReceiptId],
      foreignColumns: [goodsReceipts.organizationId, goodsReceipts.id],
    }).onDelete("restrict"),
    // La que impide borrar un proveedor con pagos (ADR 0023, punto 14).
    foreignKey({
      name: "supplier_payments_supplier_fk",
      columns: [table.organizationId, table.supplierId],
      foreignColumns: [suppliers.organizationId, suppliers.id],
    }).onDelete("restrict"),
    foreignKey({
      name: "supplier_payments_payment_method_fk",
      columns: [table.organizationId, table.paymentMethodId],
      foreignColumns: [paymentMethods.organizationId, paymentMethods.id],
    }).onDelete("restrict"),
    foreignKey({
      name: "supplier_payments_session_fk",
      columns: [table.organizationId, table.sessionId],
      foreignColumns: [cashSessions.organizationId, cashSessions.id],
    }).onDelete("restrict"),
    // La cuenta del proveedor, los pagos de una recepción y los de una sesión.
    index("supplier_payments_supplier_idx").on(
      table.organizationId,
      table.supplierId,
    ),
    index("supplier_payments_goods_receipt_idx").on(
      table.organizationId,
      table.goodsReceiptId,
    ),
    index("supplier_payments_session_idx").on(
      table.organizationId,
      table.sessionId,
    ),
    // Un solo destino, con su clave (punto 8).
    check(
      "supplier_payments_target_check",
      sql`(${table.target} = 'goods_receipt' AND ${table.goodsReceiptId} IS NOT NULL)
        OR (${table.target} = 'account' AND ${table.goodsReceiptId} IS NULL)`,
    ),
    ...tenderedConstraints("supplier_payments", table),
    check("supplier_payments_number_positive", sql`${table.number} > 0`),
    check("supplier_payments_amount_positive", sql`${table.amount} > 0`),
    check(
      "supplier_payments_currency_format",
      sql`${table.currency} ~ '^[A-Z]{3}$'`,
    ),
  ],
);

// El motivo de la anulación de un pago, de una lista cerrada y sin texto libre (brief-22.6, D-4).
export const supplierPaymentVoidReason = pgEnum(
  "supplier_payment_void_reason",
  ["not_paid", "wrong_method", "wrong_amount", "wrong_target", "other"],
);

// La anulación de un pago (ADR 0023, punto 8; brief-22.6, D-3), con las reglas de la del cobro:
// entera, a lo sumo una vez, la moneda, el monto y la sesión copiados. Lo defiende
// supplier_payment_voids_check_copy() de la 0051. Sin proveedor: llega a él por su pago.
export const supplierPaymentVoids = pgTable(
  "supplier_payment_voids",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "restrict" }),
    // Del contador de numbering con el tipo supplier_payment_void; se muestra como APP-000001.
    number: bigint("number", { mode: "number" }).notNull(),
    supplierPaymentId: uuid("supplier_payment_id").notNull(),
    currency: text("currency").notNull(),
    amount: numeric("amount", { precision: 14, scale: 2 }).notNull(),
    // Lo que salió o volvió en otra moneda (brief-29.4.3, D-2).
    ...tenderedColumns(),
    reason: supplierPaymentVoidReason("reason").notNull(),
    // La sesión abierta del pago en efectivo anulado: lo esperado de esa sesión deja de restarlo.
    sessionId: uuid("session_id"),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .default(sql`clock_timestamp()`),
  },
  (table) => [
    unique("supplier_payment_voids_organization_number_unique").on(
      table.organizationId,
      table.number,
    ),
    unique("supplier_payment_voids_supplier_payment_unique").on(
      table.supplierPaymentId,
    ),
    foreignKey({
      name: "supplier_payment_voids_supplier_payment_fk",
      columns: [table.organizationId, table.supplierPaymentId],
      foreignColumns: [supplierPayments.organizationId, supplierPayments.id],
    }).onDelete("restrict"),
    foreignKey({
      name: "supplier_payment_voids_session_fk",
      columns: [table.organizationId, table.sessionId],
      foreignColumns: [cashSessions.organizationId, cashSessions.id],
    }).onDelete("restrict"),
    index("supplier_payment_voids_session_idx").on(
      table.organizationId,
      table.sessionId,
    ),
    ...tenderedConstraints("supplier_payment_voids", table),
    check("supplier_payment_voids_number_positive", sql`${table.number} > 0`),
    check("supplier_payment_voids_amount_positive", sql`${table.amount} > 0`),
    check(
      "supplier_payment_voids_currency_format",
      sql`${table.currency} ~ '^[A-Z]{3}$'`,
    ),
  ],
);

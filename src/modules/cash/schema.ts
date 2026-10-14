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
  primaryKey,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { users } from "@/modules/auth/schema";
import { organizations } from "@/modules/organizations/schema";

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

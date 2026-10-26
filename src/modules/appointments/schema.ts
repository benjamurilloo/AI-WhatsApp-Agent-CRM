import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  foreignKey,
  index,
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
import { organizations } from "@/modules/organizations/schema";

// docs/architecture/DataModel.md, tablas appointment_settings, appointment_reasons y appointments
// (ADR 0024, punto 12; brief-29.10, D-2). Todo detrás de la capacidad appointments. Las franjas no se
// guardan: salen del horario del local (knowledge), de la duración y del cupo (D-3).

// Límites. Los mismos valores van en los CHECK.
// Las duraciones de una franja, en minutos (U-2).
export const SLOT_MINUTES = [15, 20, 30, 45, 60, 90, 120] as const;
export const MAX_APPOINTMENT_CAPACITY = 20;
export const REASON_NAME_MAX_LENGTH = 60;
// Motivos por organización como máximo: más que esto no es una lista de mostrador.
export const MAX_APPOINTMENT_REASONS = 20;
export const APPOINTMENT_NOTE_MAX_LENGTH = 500;
// Hasta cuántos días adelante se da un turno (U-6).
export const BOOKING_HORIZON_DAYS = 90;

// Los valores sueltos de appointments (ADR 0024, punto 13): una fila por organización, que crea
// org:capability con los del perfil. Se edita, no se borra. is_example queda hasta que un admin la
// guarda.
export const appointmentSettings = pgTable(
  "appointment_settings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "restrict" }),
    slotMinutes: smallint("slot_minutes").notNull(),
    // Cuántos turnos caben a la vez en una franja.
    capacity: smallint("capacity").notNull(),
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
    unique("appointment_settings_organization_unique").on(table.organizationId),
    check(
      "appointment_settings_slot_minutes_allowed",
      sql`${table.slotMinutes} in (${sql.raw(SLOT_MINUTES.join(", "))})`,
    ),
    check(
      "appointment_settings_capacity_range",
      sql`${table.capacity} between 1 and ${sql.raw(String(MAX_APPOINTMENT_CAPACITY))}`,
    ),
  ],
);

// Los motivos de un turno (D-2): «Ver o comprar un equipo», «Retirar un equipo». Se editan y se
// desactivan, nunca se borran: un turno conserva su motivo.
export const appointmentReasons = pgTable(
  "appointment_reasons",
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
    uniqueIndex("appointment_reasons_organization_name_lower_unique").on(
      table.organizationId,
      sql`lower(${table.name})`,
    ),
    unique("appointment_reasons_organization_id_id_unique").on(
      table.organizationId,
      table.id,
    ),
    check(
      "appointment_reasons_name_length",
      sql`char_length(${table.name}) between 1 and ${sql.raw(String(REASON_NAME_MAX_LENGTH))} and ${table.name} = btrim(${table.name})`,
    ),
    check("appointment_reasons_position_range", sql`${table.position} >= 0`),
  ],
);

// requested: lo pidió el agente (desde la 29.10.2) y espera que una persona lo confirme; ocupa su
// franja igual. confirmed: el que carga una persona nace así. attended y no_show son finales.
export const appointmentStatus = pgEnum("appointment_status", [
  "requested",
  "confirmed",
  "cancelled",
  "attended",
  "no_show",
]);

// El turno (D-2). Guarda su inicio y su fin, no un número de franja: la grilla cambia con el horario y
// la duración, y la ocupación se calcula por superposición (H-7). El trigger appointments_guard_change
// (0065) fija las transiciones y lo que cambia cada una.
export const appointments = pgTable(
  "appointments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "restrict" }),
    clientId: uuid("client_id").notNull(),
    reasonId: uuid("reason_id").notNull(),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
    // La referencia opcional: un producto o una unidad, nunca las dos.
    productId: uuid("product_id"),
    unitId: uuid("unit_id"),
    // Texto libre: el vaciado de datos de un cliente lo deja en nulo (D-6).
    note: text("note"),
    status: appointmentStatus("status").notNull(),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .default(sql`clock_timestamp()`),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
    confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    attendedAt: timestamp("attended_at", { withTimezone: true }),
    noShowAt: timestamp("no_show_at", { withTimezone: true }),
  },
  (table) => [
    unique("appointments_organization_id_id_unique").on(
      table.organizationId,
      table.id,
    ),
    foreignKey({
      name: "appointments_client_fk",
      columns: [table.organizationId, table.clientId],
      foreignColumns: [clients.organizationId, clients.id],
    }).onDelete("restrict"),
    foreignKey({
      name: "appointments_reason_fk",
      columns: [table.organizationId, table.reasonId],
      foreignColumns: [
        appointmentReasons.organizationId,
        appointmentReasons.id,
      ],
    }).onDelete("restrict"),
    foreignKey({
      name: "appointments_product_fk",
      columns: [table.organizationId, table.productId],
      foreignColumns: [products.organizationId, products.id],
    }).onDelete("restrict"),
    foreignKey({
      name: "appointments_unit_fk",
      columns: [table.organizationId, table.unitId],
      foreignColumns: [stockUnits.organizationId, stockUnits.id],
    }).onDelete("restrict"),
    index("appointments_starts_idx").on(table.organizationId, table.startsAt),
    index("appointments_client_idx").on(
      table.organizationId,
      table.clientId,
      table.startsAt.desc(),
    ),
    check(
      "appointments_ends_after_start",
      sql`${table.endsAt} > ${table.startsAt} and ${table.endsAt} <= ${table.startsAt} + interval '${sql.raw(String(Math.max(...SLOT_MINUTES)))} minutes'`,
    ),
    check(
      "appointments_single_reference",
      sql`num_nonnulls(${table.productId}, ${table.unitId}) <= 1`,
    ),
    check(
      "appointments_note_length",
      sql`char_length(${table.note}) between 1 and ${sql.raw(String(APPOINTMENT_NOTE_MAX_LENGTH))}`,
    ),
    // Cada estado con sus fechas, y ninguna de más. Un cancelado puede venir de pedido o de confirmado.
    check(
      "appointments_status_dates",
      sql`case ${table.status}
        when 'requested' then ${table.confirmedAt} is null and ${table.cancelledAt} is null
          and ${table.attendedAt} is null and ${table.noShowAt} is null
        when 'confirmed' then ${table.confirmedAt} is not null and ${table.cancelledAt} is null
          and ${table.attendedAt} is null and ${table.noShowAt} is null
        when 'cancelled' then ${table.cancelledAt} is not null
          and ${table.attendedAt} is null and ${table.noShowAt} is null
        when 'attended' then ${table.confirmedAt} is not null and ${table.attendedAt} is not null
          and ${table.cancelledAt} is null and ${table.noShowAt} is null
        when 'no_show' then ${table.confirmedAt} is not null and ${table.noShowAt} is not null
          and ${table.cancelledAt} is null and ${table.attendedAt} is null
      end`,
    ),
  ],
);

import { sql } from "drizzle-orm";
import {
  check,
  index,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { users } from "@/modules/auth/schema";
import { organizations } from "@/modules/organizations/schema";

// docs/architecture/DataModel.md, tablas exchange_rate_settings y exchange_rates (ADR 0025, punto 3).
// La 29.4 las creó solo con lo manual (brief-29.4, D-3); la 29.4.2 suma la fuente dolarapi_blue, el
// ajuste, las fechas de la lectura y las columnas de una cotización automática (brief-29.4.2, D-2).
//
// Ningún CHECK nombra 'dolarapi_blue': la migración que agrega el valor al enum corre en la misma
// transacción, y PostgreSQL no deja usarlo ahí (brief-29.4.2, H-1). Se escriben contra 'manual'.

// De dónde sale una cotización: la carga de un admin o la lectura de DolarAPI, blue, venta, más el
// ajuste de la organización (ADR 0025, punto 4).
export const exchangeRateSource = pgEnum("exchange_rate_source", [
  "manual",
  "dolarapi_blue",
]);

// La cotización de una organización: contra qué moneda, de qué fuente y con qué ajuste. Una fila por
// organización con moneda principal, creada por org:currency junto con ella. El admin cambia la
// fuente y el ajuste; el lector, last_confirmed_at. La organización y la otra moneda no cambian, y
// la fila no se borra: lo asegura un trigger (0054).
export const exchangeRateSettings = pgTable(
  "exchange_rate_settings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "restrict" }),
    // La otra moneda (ARS), distinta de la principal: lo valida el servicio, que lee la principal
    // por la interfaz de organizations.
    quoteCurrency: text("quote_currency").notNull(),
    source: exchangeRateSource("source").notNull().default("manual"),
    // Lo que se suma a la fuente automática, en la otra moneda. Puede ser cero o negativo, así que
    // no es dinero de src/shared/money/ (ADR 0025, punto 3, R-M7).
    adjustment: numeric("adjustment", { precision: 14, scale: 2 })
      .notNull()
      .default("0"),
    // La última vez que la lectura automática guardó o confirmó un valor: la antigüedad de una
    // cotización automática se mide desde acá (ADR 0025, punto 4, R-B3).
    lastConfirmedAt: timestamp("last_confirmed_at", { withTimezone: true }),
    // Cuándo cambió la fuente por última vez. La primera lectura después de volver a la automática
    // guarda siempre una fila (brief-29.4.2, D-5). Lo mantiene el trigger, no el servicio.
    sourceChangedAt: timestamp("source_changed_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique("exchange_rate_settings_organization_unique").on(
      table.organizationId,
    ),
    check(
      "exchange_rate_settings_quote_currency_format",
      sql`${table.quoteCurrency} ~ '^[A-Z]{3}$'`,
    ),
  ],
);

// Las cotizaciones, de solo inserción: la vigente es la última guardada del par, y una corrección
// es otra fila (ADR 0025, punto 3). Cada cobro en otra moneda copia el valor y, si usó la vigente,
// apunta a su fila.
export const exchangeRates = pgTable(
  "exchange_rates",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "restrict" }),
    // La moneda principal y la otra, copiadas: la fila se lee sola.
    baseCurrency: text("base_currency").notNull(),
    quoteCurrency: text("quote_currency").notNull(),
    // Cuántas unidades de la otra moneda vale una de la principal: 1 USD = 1565.000000 ARS.
    rate: numeric("rate", { precision: 18, scale: 6 }).notNull(),
    source: exchangeRateSource("source").notNull(),
    // El admin que la cargó. Una automática no tiene autor (brief-29.4.2, H-5).
    recordedBy: uuid("recorded_by").references(() => users.id, {
      onDelete: "restrict",
    }),
    // Solo en una automática: lo que dio la fuente, el ajuste que se le sumó y la fecha que da la
    // fuente (ADR 0025, punto 3).
    sourceRate: numeric("source_rate", { precision: 18, scale: 6 }),
    adjustment: numeric("adjustment", { precision: 14, scale: 2 }),
    sourceObservedAt: timestamp("source_observed_at", { withTimezone: true }),
    recordedAt: timestamp("recorded_at", { withTimezone: true })
      .notNull()
      .default(sql`clock_timestamp()`),
  },
  (table) => [
    // Destino de las claves compuestas de los cobros.
    unique("exchange_rates_organization_id_id_unique").on(
      table.organizationId,
      table.id,
    ),
    // La vigente y el historial de un par.
    index("exchange_rates_pair_idx").on(
      table.organizationId,
      table.baseCurrency,
      table.quoteCurrency,
      table.recordedAt,
    ),
    // El par va en la dirección en la que la principal vale más (ADR 0025, punto 3, R-M5).
    check("exchange_rates_rate_minimum", sql`${table.rate} >= 1`),
    check(
      "exchange_rates_currencies_distinct",
      sql`${table.baseCurrency} <> ${table.quoteCurrency}`,
    ),
    check(
      "exchange_rates_base_currency_format",
      sql`${table.baseCurrency} ~ '^[A-Z]{3}$'`,
    ),
    check(
      "exchange_rates_quote_currency_format",
      sql`${table.quoteCurrency} ~ '^[A-Z]{3}$'`,
    ),
    // Una manual tiene autor; una automática, no.
    check(
      "exchange_rates_author_by_source",
      sql`(${table.source} = 'manual') = (${table.recordedBy} IS NOT NULL)`,
    ),
    // Una automática tiene las tres columnas de la fuente; una manual, ninguna.
    check(
      "exchange_rates_reading_by_source",
      sql`(${table.source} = 'manual' AND ${table.sourceRate} IS NULL AND ${table.adjustment} IS NULL AND ${table.sourceObservedAt} IS NULL)
        OR (${table.source} <> 'manual' AND ${table.sourceRate} IS NOT NULL AND ${table.adjustment} IS NOT NULL AND ${table.sourceObservedAt} IS NOT NULL)`,
    ),
    check(
      "exchange_rates_source_rate_positive",
      sql`${table.sourceRate} IS NULL OR ${table.sourceRate} > 0`,
    ),
    // La cotización automática es lo que dio la fuente más el ajuste (ADR 0025, punto 3).
    check(
      "exchange_rates_reading_sum",
      sql`${table.sourceRate} IS NULL OR ${table.rate} = ${table.sourceRate} + ${table.adjustment}`,
    ),
  ],
);

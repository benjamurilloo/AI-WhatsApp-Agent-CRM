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

// docs/architecture/DataModel.md, tablas exchange_rate_settings y exchange_rates (ADR 0025, punto 3;
// brief-29.4, D-3). Solo lo manual: la fuente dolarapi_blue, el ajuste, last_confirmed_at y las
// columnas de una lectura automática los suma la 29.4.2 con una migración aditiva, para que no
// quede una fuente que se puede elegir y no hace nada.

// De dónde sale una cotización. Nace solo con la carga manual.
export const exchangeRateSource = pgEnum("exchange_rate_source", ["manual"]);

// La cotización de una organización: contra qué moneda y de qué fuente. Una fila por organización
// con moneda principal, creada por org:currency junto con ella.
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
    // El admin que la cargó. La 29.4.2 lo vuelve opcional para la lectura automática.
    recordedBy: uuid("recorded_by")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
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
  ],
);

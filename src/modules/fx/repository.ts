import { and, count, desc, eq } from "drizzle-orm";
import { getDb, type Db, type DbTransaction } from "@/shared/db";
import {
  exchangeRates,
  exchangeRateSettings,
  exchangeRateSource,
} from "./schema";

// Acceso a las tablas propias de fx (ADR 0025, punto 13; brief-29.4, D-10). Un recurso de una
// organización siempre se busca filtrando por organization_id en SQL (brief-3.4).

type Executor = Db | DbTransaction;

export type ExchangeRateSourceName =
  (typeof exchangeRateSource.enumValues)[number];

export type SettingsRow = {
  id: string;
  quoteCurrency: string;
  source: ExchangeRateSourceName;
  adjustment: string;
  lastConfirmedAt: Date | null;
  sourceChangedAt: Date;
};

export type RateRow = {
  id: string;
  baseCurrency: string;
  quoteCurrency: string;
  rate: string;
  source: ExchangeRateSourceName;
  // Vacío en una automática (brief-29.4.2, H-5).
  recordedBy: string | null;
  recordedAt: Date;
  // Solo en una automática: lo que dio la fuente, el ajuste y la fecha de la fuente.
  sourceRate: string | null;
  adjustment: string | null;
  sourceObservedAt: Date | null;
};

export function withTransaction<T>(
  work: (tx: DbTransaction) => Promise<T>,
): Promise<T> {
  return getDb().transaction(work);
}

const settingsColumns = {
  id: exchangeRateSettings.id,
  quoteCurrency: exchangeRateSettings.quoteCurrency,
  source: exchangeRateSettings.source,
  adjustment: exchangeRateSettings.adjustment,
  lastConfirmedAt: exchangeRateSettings.lastConfirmedAt,
  sourceChangedAt: exchangeRateSettings.sourceChangedAt,
};

export async function findSettings(
  organizationId: string,
  executor: Executor = getDb(),
): Promise<SettingsRow | null> {
  const rows = await executor
    .select(settingsColumns)
    .from(exchangeRateSettings)
    .where(eq(exchangeRateSettings.organizationId, organizationId))
    .limit(1);
  return rows[0] ?? null;
}

// La configuración bloqueada para cambiarla: un cambio del admin no corre contra otro ni contra una
// lectura del lector, que bloquea la misma fila (0054, fx_record_reading).
export async function findSettingsForUpdate(
  tx: DbTransaction,
  organizationId: string,
): Promise<SettingsRow | null> {
  const rows = await tx
    .select(settingsColumns)
    .from(exchangeRateSettings)
    .where(eq(exchangeRateSettings.organizationId, organizationId))
    .for("update")
    .limit(1);
  return rows[0] ?? null;
}

// La fuente y el ajuste. source_changed_at lo mantiene el trigger de la 0054.
export async function updateSettings(
  tx: DbTransaction,
  id: string,
  values: { source: ExchangeRateSourceName; adjustment: string },
): Promise<SettingsRow> {
  const rows = await tx
    .update(exchangeRateSettings)
    .set(values)
    .where(eq(exchangeRateSettings.id, id))
    .returning(settingsColumns);
  return rows[0]!;
}

// ON CONFLICT DO NOTHING: una organización tiene una sola configuración, y crearla otra vez no
// escribe nada y devuelve undefined.
export async function insertSettings(
  tx: DbTransaction,
  row: { organizationId: string; quoteCurrency: string },
): Promise<string | undefined> {
  const rows = await tx
    .insert(exchangeRateSettings)
    .values({ ...row, source: "manual" })
    .onConflictDoNothing({ target: [exchangeRateSettings.organizationId] })
    .returning({ id: exchangeRateSettings.id });
  return rows[0]?.id;
}

const rateColumns = {
  id: exchangeRates.id,
  baseCurrency: exchangeRates.baseCurrency,
  quoteCurrency: exchangeRates.quoteCurrency,
  rate: exchangeRates.rate,
  source: exchangeRates.source,
  recordedBy: exchangeRates.recordedBy,
  recordedAt: exchangeRates.recordedAt,
  sourceRate: exchangeRates.sourceRate,
  adjustment: exchangeRates.adjustment,
  sourceObservedAt: exchangeRates.sourceObservedAt,
};

function pairOf(
  organizationId: string,
  baseCurrency: string,
  quoteCurrency: string,
) {
  return and(
    eq(exchangeRates.organizationId, organizationId),
    eq(exchangeRates.baseCurrency, baseCurrency),
    eq(exchangeRates.quoteCurrency, quoteCurrency),
  );
}

// La vigente es la última guardada del par (ADR 0025, punto 3), de cualquier fuente. El id desempata dos filas del mismo
// instante, para que la vigente sea siempre la misma.
export async function findCurrentRate(
  organizationId: string,
  baseCurrency: string,
  quoteCurrency: string,
  executor: Executor = getDb(),
): Promise<RateRow | null> {
  const rows = await executor
    .select(rateColumns)
    .from(exchangeRates)
    .where(pairOf(organizationId, baseCurrency, quoteCurrency))
    .orderBy(desc(exchangeRates.recordedAt), desc(exchangeRates.id))
    .limit(1);
  return rows[0] ?? null;
}

export async function listRates(
  organizationId: string,
  baseCurrency: string,
  quoteCurrency: string,
  page: { limit: number; offset: number },
): Promise<{ rows: RateRow[]; total: number }> {
  const where = pairOf(organizationId, baseCurrency, quoteCurrency);
  const [rows, totals] = await Promise.all([
    getDb()
      .select(rateColumns)
      .from(exchangeRates)
      .where(where)
      .orderBy(desc(exchangeRates.recordedAt), desc(exchangeRates.id))
      .limit(page.limit)
      .offset(page.offset),
    getDb().select({ total: count() }).from(exchangeRates).where(where),
  ]);
  return { rows, total: totals[0]?.total ?? 0 };
}

// Solo la carga manual: la automática la inserta fx_record_reading, en la base (brief-29.4.2, D-3).
export async function insertRate(
  tx: DbTransaction,
  row: {
    organizationId: string;
    baseCurrency: string;
    quoteCurrency: string;
    rate: string;
    recordedBy: string;
  },
): Promise<RateRow> {
  const rows = await tx
    .insert(exchangeRates)
    .values({ ...row, source: "manual" })
    .returning(rateColumns);
  return rows[0]!;
}

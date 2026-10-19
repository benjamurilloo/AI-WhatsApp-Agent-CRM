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
};

export type RateRow = {
  id: string;
  baseCurrency: string;
  quoteCurrency: string;
  rate: string;
  source: ExchangeRateSourceName;
  recordedBy: string;
  recordedAt: Date;
};

export function withTransaction<T>(
  work: (tx: DbTransaction) => Promise<T>,
): Promise<T> {
  return getDb().transaction(work);
}

export async function findSettings(
  organizationId: string,
  executor: Executor = getDb(),
): Promise<SettingsRow | null> {
  const rows = await executor
    .select({
      id: exchangeRateSettings.id,
      quoteCurrency: exchangeRateSettings.quoteCurrency,
      source: exchangeRateSettings.source,
    })
    .from(exchangeRateSettings)
    .where(eq(exchangeRateSettings.organizationId, organizationId))
    .limit(1);
  return rows[0] ?? null;
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

// La vigente es la última guardada del par (ADR 0025, punto 3). El id desempata dos filas del mismo
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

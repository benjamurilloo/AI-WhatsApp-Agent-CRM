import { z } from "zod";
import { recordAudit } from "@/modules/audit";
import {
  authorize,
  getMainCurrency,
  getMemberSummaries,
  getOrganizationTimezoneForService,
  type AuthContext,
} from "@/modules/organizations";
import type { DbTransaction } from "@/shared/db";
import { failure, type Failure } from "@/shared/errors";
import {
  acceptedCurrencies,
  convertMoney,
  currencyDecimals,
  exchangeRateFromDatabase,
  exchangeRateToDatabase,
  formatExchangeRate,
  parseExchangeRateInput,
  type ExchangeRate,
  type ExchangeRateRejection,
  type Money,
} from "@/shared/money";
import {
  adjustmentFromDatabase,
  adjustmentToDatabase,
  parseAdjustmentInput,
  type Adjustment,
  type AdjustmentRejection,
} from "./adjustment";
import * as repository from "./repository";
import { isStale } from "./staleness";

// El tipo de cambio (ADR 0025; brief-29.4 y brief-29.4.2). fx es dueño de la configuración de la
// cotización y de las cotizaciones; la moneda principal es de organizations, y fx la lee por su
// interfaz. Sin moneda principal o sin configuración, no hay cotización: getExchangeSetup devuelve
// null y el CRM se comporta como siempre.
//
// La cotización es manual o automática. La automática la guarda el lector, crm-fx-reader, por las
// funciones de la base de la 0054: este servicio no la escribe nunca (brief-29.4.2, D-3).

export type ExchangeRateSource = repository.ExchangeRateSourceName;

// Lo que guarda una cotización automática: lo que dio DolarAPI, el ajuste que se le sumó y la
// fecha que da la fuente (ADR 0025, punto 3).
export type RateReading = {
  sourceRate: ExchangeRate;
  adjustment: Adjustment;
  observedAt: Date;
};

export type CurrentRate = {
  id: string;
  baseCurrency: string;
  quoteCurrency: string;
  rate: ExchangeRate;
  source: ExchangeRateSource;
  // Vacío en una automática.
  recordedBy: string | null;
  recordedAt: Date;
  // Desde cuándo se mide la antigüedad: la última confirmación del lector en una automática, la
  // carga en una manual (ADR 0025, punto 4, R-B3; brief-29.4.2, H-6).
  asOf: Date;
  reading: RateReading | null;
  // Más de 24 horas hábiles desde asOf.
  stale: boolean;
};

export type ExchangeSetup = {
  mainCurrency: string;
  quoteCurrency: string;
  source: ExchangeRateSource;
  adjustment: Adjustment;
  current: CurrentRate | null;
};

function readingOf(row: repository.RateRow): RateReading | null {
  if (row.sourceRate === null || row.adjustment === null) return null;
  if (row.sourceObservedAt === null) return null;
  return {
    sourceRate: exchangeRateFromDatabase(row.sourceRate),
    adjustment: adjustmentFromDatabase(row.adjustment),
    observedAt: row.sourceObservedAt,
  };
}

// La vigente es la última fila del par, así que una automática vigente es también la última
// automática: last_confirmed_at es su última confirmación. Nunca antes de que se guardó.
function asOfFor(
  row: repository.RateRow,
  settings: repository.SettingsRow,
): Date {
  if (row.source === "manual" || settings.lastConfirmedAt === null) {
    return row.recordedAt;
  }
  return settings.lastConfirmedAt > row.recordedAt
    ? settings.lastConfirmedAt
    : row.recordedAt;
}

function toCurrentRate(
  row: repository.RateRow,
  settings: repository.SettingsRow,
  now: Date,
  timezone: string,
): CurrentRate {
  const asOf = asOfFor(row, settings);
  return {
    id: row.id,
    baseCurrency: row.baseCurrency,
    quoteCurrency: row.quoteCurrency,
    rate: exchangeRateFromDatabase(row.rate),
    source: row.source,
    recordedBy: row.recordedBy,
    recordedAt: row.recordedAt,
    asOf,
    reading: readingOf(row),
    stale: isStale(asOf, now, timezone),
  };
}

// La fuente automática es DolarAPI, blue, venta: pesos por dólar. Solo se ofrece con USD como
// principal y ARS como la otra, las mismas condiciones de fx_reader_targets (0054).
function automaticSourceAvailable(mainCurrency: string, quoteCurrency: string) {
  return mainCurrency === "USD" && quoteCurrency === "ARS";
}

// La moneda principal, la otra y la cotización vigente de una organización, o null si no tiene
// moneda principal o configuración. La usa cash, que ya autorizó al usuario, dentro de su
// transacción cuando registra un cobro.
export async function getExchangeSetup(
  organizationId: string,
  tx?: DbTransaction,
  now: Date = new Date(),
): Promise<ExchangeSetup | null> {
  const mainCurrency = await getMainCurrency(organizationId, tx);
  if (!mainCurrency) return null;
  const settings = await repository.findSettings(organizationId, tx);
  if (!settings) return null;
  const row = await repository.findCurrentRate(
    organizationId,
    mainCurrency,
    settings.quoteCurrency,
    tx,
  );
  const current = row
    ? toCurrentRate(
        row,
        settings,
        now,
        await getOrganizationTimezoneForService(organizationId),
      )
    : null;
  return {
    mainCurrency,
    quoteCurrency: settings.quoteCurrency,
    source: settings.source,
    adjustment: adjustmentFromDatabase(settings.adjustment),
    current,
  };
}

export function decimalsOf(currency: string): number {
  const found = currencyDecimals(currency);
  if (!found.ok) throw new Error(`moneda sin decimales conocidos: ${currency}`);
  return found.decimals;
}

// El total de referencia (ADR 0025, puntos 6 y 7; brief-29.4, D-7 y D-8): montos de varias monedas
// sumados en la principal con la cotización vigente, para mostrar. No se guarda. Las monedas que no
// son la principal ni la otra no se convierten: se informan aparte. Devuelve null sin cotización
// vigente, o si todo ya está en la principal y no hay nada que convertir.
export type ReferenceTotal = {
  currency: string;
  total: Money;
  rate: CurrentRate;
  unconverted: string[];
};

export function referenceTotal(
  setup: ExchangeSetup | null,
  amounts: { currency: string; amount: Money }[],
): ReferenceTotal | null {
  if (!setup?.current) return null;
  const rate = setup.current;
  const unconverted = new Set<string>();
  let total = 0n;
  let converted = false;
  for (const { currency, amount } of amounts) {
    if (amount < 0n)
      throw new Error("monto negativo en un total de referencia");
    if (amount === 0n) continue;
    if (currency === setup.mainCurrency) {
      total += amount;
    } else if (currency === setup.quoteCurrency) {
      const result = convertMoney({
        amount,
        rate: rate.rate,
        direction: "to_base",
        targetDecimals: decimalsOf(setup.mainCurrency),
      });
      if (result.ok) total += result.amount;
      else if (result.reason === "too_large") unconverted.add(currency);
      converted = true;
    } else {
      unconverted.add(currency);
    }
  }
  if (!converted && unconverted.size === 0) return null;
  return {
    currency: setup.mainCurrency,
    total,
    rate,
    unconverted: [...unconverted].sort(),
  };
}

// --- La pantalla de la cotización (brief-29.4, D-4) ---

export const EXCHANGE_RATE_PAGE_SIZE = 20;

export type ExchangeRateHistoryRow = {
  id: string;
  rate: ExchangeRate;
  source: ExchangeRateSource;
  recordedAt: Date;
  // Vacío en una automática.
  recordedByName: string;
  reading: RateReading | null;
};

export type ExchangeRatePage = {
  mainCurrency: string;
  quoteCurrency: string;
  source: ExchangeRateSource;
  adjustment: Adjustment;
  // Si la organización puede elegir la fuente automática (USD y ARS).
  automaticAvailable: boolean;
  current: (CurrentRate & { recordedByName: string }) | null;
  history: ExchangeRateHistoryRow[];
  total: number;
  page: number;
  pageSize: number;
};

const pageSchema = z.coerce.number().int().min(1).catch(1);

// La vigente y el historial, para admin y viewer (ADR 0025, punto 11). Sin moneda principal, la
// sección no existe: NOT_FOUND, como una capacidad ausente.
export async function getExchangeRatePage(
  context: AuthContext,
  page: unknown = 1,
): Promise<
  { ok: true; value: ExchangeRatePage } | Failure<"FORBIDDEN" | "NOT_FOUND">
> {
  const signedIn = authorize(context, {});
  if (!signedIn.ok) return signedIn;
  const setup = await getExchangeSetup(context.organizationId);
  if (!setup) return failure("NOT_FOUND");
  const pageNumber = pageSchema.parse(page);
  const { rows, total } = await repository.listRates(
    context.organizationId,
    setup.mainCurrency,
    setup.quoteCurrency,
    {
      limit: EXCHANGE_RATE_PAGE_SIZE,
      offset: (pageNumber - 1) * EXCHANGE_RATE_PAGE_SIZE,
    },
  );
  const authorIds = [
    ...new Set(
      [...rows.map((row) => row.recordedBy), setup.current?.recordedBy].filter(
        (id): id is string => typeof id === "string",
      ),
    ),
  ];
  const authors = await getMemberSummaries(context.organizationId, authorIds);
  const nameOf = (userId: string | null) =>
    authors.find((author) => author.id === userId)?.name ?? "";
  return {
    ok: true,
    value: {
      mainCurrency: setup.mainCurrency,
      quoteCurrency: setup.quoteCurrency,
      source: setup.source,
      adjustment: setup.adjustment,
      automaticAvailable: automaticSourceAvailable(
        setup.mainCurrency,
        setup.quoteCurrency,
      ),
      current: setup.current
        ? { ...setup.current, recordedByName: nameOf(setup.current.recordedBy) }
        : null,
      history: rows.map((row) => ({
        id: row.id,
        rate: exchangeRateFromDatabase(row.rate),
        source: row.source,
        recordedAt: row.recordedAt,
        recordedByName: nameOf(row.recordedBy),
        reading: readingOf(row),
      })),
      total,
      page: pageNumber,
      pageSize: EXCHANGE_RATE_PAGE_SIZE,
    },
  };
}

// Cuánto se puede mover una carga contra la vigente sin pedir una confirmación: un 10 %, el mismo
// límite que frena a la lectura automática, también contra la vigente (ADR 0025, punto 4;
// brief-29.4.2, D-4). Para la carga manual no bloquea: es ella la que corrige (brief-29.4, D-4), y
// después de un salto real es la que destraba al lector.
const LARGE_CHANGE_PERCENT = 10n;

export function isLargeChange(previous: ExchangeRate, next: ExchangeRate) {
  const difference = next > previous ? next - previous : previous - next;
  return difference * 100n > previous * LARGE_CHANGE_PERCENT;
}

export type RecordExchangeRateResult =
  | { ok: true; id: string }
  | Failure<"FORBIDDEN" | "NOT_FOUND">
  | Failure<"VALIDATION_ERROR", { reason: ExchangeRateRejection }>
  | Failure<
      "BUSINESS_RULE_VIOLATION",
      { rule: "large_change"; current: string }
    >;

const recordInputSchema = z.object({
  rate: z.string().max(40),
  confirmLargeChange: z.boolean().default(false),
});

// La carga manual de un admin (ADR 0025, punto 4): pasa a ser la vigente, con auditoría.
export async function recordExchangeRate(
  context: AuthContext,
  input: unknown,
): Promise<RecordExchangeRateResult> {
  const signedIn = authorize(context, {});
  if (!signedIn.ok) return signedIn;
  const setup = await getExchangeSetup(context.organizationId);
  if (!setup) return failure("NOT_FOUND");
  const allowed = authorize(context, { role: "admin" });
  if (!allowed.ok) return allowed;

  const parsed = recordInputSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, code: "VALIDATION_ERROR", reason: "invalid" };
  }
  const rate = parseExchangeRateInput(parsed.data.rate);
  if (!rate.ok) {
    return { ok: false, code: "VALIDATION_ERROR", reason: rate.reason };
  }

  return repository.withTransaction(async (tx) => {
    const current = await repository.findCurrentRate(
      context.organizationId,
      setup.mainCurrency,
      setup.quoteCurrency,
      tx,
    );
    if (
      current &&
      !parsed.data.confirmLargeChange &&
      isLargeChange(exchangeRateFromDatabase(current.rate), rate.rate)
    ) {
      return {
        ok: false as const,
        code: "BUSINESS_RULE_VIOLATION" as const,
        rule: "large_change" as const,
        current: formatExchangeRate(exchangeRateFromDatabase(current.rate)),
      };
    }
    const row = await repository.insertRate(tx, {
      organizationId: context.organizationId,
      baseCurrency: setup.mainCurrency,
      quoteCurrency: setup.quoteCurrency,
      rate: exchangeRateToDatabase(rate.rate),
      recordedBy: context.userId,
    });
    await recordAudit(tx, {
      organizationId: context.organizationId,
      actorUserId: context.userId,
      entityType: "exchange_rate",
      entityId: row.id,
      action: "create",
      diff: {
        before: null,
        after: {
          base_currency: row.baseCurrency,
          quote_currency: row.quoteCurrency,
          rate: row.rate,
          source: row.source,
        },
      },
    });
    return { ok: true as const, id: row.id };
  });
}

// --- La fuente y el ajuste (ADR 0025, punto 4; brief-29.4.2, D-9) ---

const exchangeRateSourceNames: readonly ExchangeRateSource[] = [
  "manual",
  "dolarapi_blue",
];

export type ExchangeSettingsField = "source" | "adjustment";

export type UpdateExchangeSettingsResult =
  // toAutomatic: pasó de manual a automática, así que la próxima lectura reemplaza a la vigente (D-5).
  | { ok: true; changed: boolean; toAutomatic: boolean }
  | Failure<"FORBIDDEN" | "NOT_FOUND">
  | Failure<
      "VALIDATION_ERROR",
      { field: ExchangeSettingsField; reason: AdjustmentRejection }
    >
  | Failure<"BUSINESS_RULE_VIOLATION", { rule: "automatic_unavailable" }>;

const settingsInputSchema = z.object({
  source: z.string().max(40),
  adjustment: z.string().max(40),
});

// Un admin cambia la fuente y el ajuste, con auditoría del antes y el después. Un cambio de ajuste
// se aplica en la próxima lectura, no ahora: la cotización automática la guarda solo el lector.
// Volver a la automática hace que la próxima lectura reemplace a la vigente (D-5), por el trigger
// de la 0054.
export async function updateExchangeSettings(
  context: AuthContext,
  input: unknown,
): Promise<UpdateExchangeSettingsResult> {
  const signedIn = authorize(context, {});
  if (!signedIn.ok) return signedIn;
  const setup = await getExchangeSetup(context.organizationId);
  if (!setup) return failure("NOT_FOUND");
  const allowed = authorize(context, { role: "admin" });
  if (!allowed.ok) return allowed;

  const parsed = settingsInputSchema.safeParse(input);
  const source = exchangeRateSourceNames.find(
    (name) => parsed.success && name === parsed.data.source,
  );
  if (!parsed.success || !source) {
    return {
      ok: false,
      code: "VALIDATION_ERROR",
      field: "source",
      reason: "invalid",
    };
  }
  const adjustment = parseAdjustmentInput(parsed.data.adjustment);
  if (!adjustment.ok) {
    return {
      ok: false,
      code: "VALIDATION_ERROR",
      field: "adjustment",
      reason: adjustment.reason,
    };
  }
  if (
    source === "dolarapi_blue" &&
    !automaticSourceAvailable(setup.mainCurrency, setup.quoteCurrency)
  ) {
    return {
      ok: false,
      code: "BUSINESS_RULE_VIOLATION",
      rule: "automatic_unavailable",
    };
  }

  return repository.withTransaction(async (tx) => {
    const before = await repository.findSettingsForUpdate(
      tx,
      context.organizationId,
    );
    if (!before) return failure("NOT_FOUND");
    const nextAdjustment = adjustmentToDatabase(adjustment.adjustment);
    if (before.source === source && before.adjustment === nextAdjustment) {
      return { ok: true as const, changed: false, toAutomatic: false };
    }
    const after = await repository.updateSettings(tx, before.id, {
      source,
      adjustment: nextAdjustment,
    });
    await recordAudit(tx, {
      organizationId: context.organizationId,
      actorUserId: context.userId,
      entityType: "exchange_rate_setting",
      entityId: before.id,
      action: "update",
      diff: {
        before: { source: before.source, adjustment: before.adjustment },
        after: { source: after.source, adjustment: after.adjustment },
      },
    });
    return {
      ok: true as const,
      changed: true,
      toAutomatic: before.source === "manual" && after.source !== "manual",
    };
  });
}

// --- El script de la moneda principal (brief-29.4, D-2) ---

export type CreateExchangeSettingsResult =
  | { ok: true; status: "created" | "already_created" }
  | Failure<"VALIDATION_ERROR">
  | Failure<"BUSINESS_RULE_VIOLATION", { rule: "no_main_currency" }>
  | Failure<"CONFLICT", { current: string }>;

// La configuración de la cotización: la llama solo scripts/fijar-moneda.ts, en la transacción que
// fija la moneda principal, con el admin que el script ya validó como autor. La otra moneda es una
// de las aceptadas y distinta de la principal; la fuente, manual.
export async function createExchangeSettings(
  tx: DbTransaction,
  input: { organizationId: string; quoteCurrency: string; actorUserId: string },
): Promise<CreateExchangeSettingsResult> {
  const mainCurrency = await getMainCurrency(input.organizationId, tx);
  if (!mainCurrency) {
    return {
      ok: false,
      code: "BUSINESS_RULE_VIOLATION",
      rule: "no_main_currency",
    };
  }
  if (
    !acceptedCurrencies().includes(input.quoteCurrency) ||
    input.quoteCurrency === mainCurrency
  ) {
    return failure("VALIDATION_ERROR");
  }
  const existing = await repository.findSettings(input.organizationId, tx);
  if (existing) {
    if (existing.quoteCurrency === input.quoteCurrency) {
      return { ok: true, status: "already_created" };
    }
    return { ok: false, code: "CONFLICT", current: existing.quoteCurrency };
  }
  const id = await repository.insertSettings(tx, {
    organizationId: input.organizationId,
    quoteCurrency: input.quoteCurrency,
  });
  if (!id) throw new Error("configuración de la cotización creada a la vez");
  await recordAudit(tx, {
    organizationId: input.organizationId,
    actorUserId: input.actorUserId,
    entityType: "exchange_rate_setting",
    entityId: id,
    action: "create",
    diff: {
      before: null,
      after: {
        quote_currency: input.quoteCurrency,
        source: "manual",
        origen: "script",
      },
    },
  });
  return { ok: true, status: "created" };
}

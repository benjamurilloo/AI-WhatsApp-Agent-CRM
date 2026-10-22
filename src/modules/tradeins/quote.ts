import { z } from "zod";
import { recordAudit } from "@/modules/audit";
import {
  getCurrentPrices,
  getModel,
  getProductsByIds,
  listModels,
  searchProducts,
} from "@/modules/catalog";
import { getMainCurrency, type AuthContext } from "@/modules/organizations";
import { getRepairCostsForQuote, listRepairTypes } from "@/modules/service";
import type { DbTransaction } from "@/shared/db";
import { failure, type Failure } from "@/shared/errors";
import {
  acceptedCurrencies,
  currencyDecimals,
  moneyFromDatabase,
  moneyToDatabase,
  parseMoneyInput,
  type AmountRejection,
} from "@/shared/money";
import { requireTradeIns } from "./checklist";
import {
  computeTradeInQuote,
  type QuoteRepair,
  type QuoteUnavailableReason,
} from "./quote-rule";
import * as repository from "./repository";
import { MAX_RANGE_PERCENT } from "./schema";

// La cotización orientativa de un usado (ADR 0024, punto 9; brief-29.7.3, D-1 a D-5): los valores
// sueltos de la organización, el margen de cada modelo y la regla, que lee el precio de catalog y los
// costos de service. Todo es de un admin: la cotización deja ver costos y márgenes (D-7). La cotización
// no escribe nada; los valores y los márgenes se auditan como trade_in_settings y trade_in_margin.

export { MAX_RANGE_PERCENT };

const idSchema = z.uuid();

// --- Los valores sueltos (D-1) ---

export type QuoteSettings = repository.QuoteSettingsRow;

export type QuoteSettingsForm = {
  settings: QuoteSettings | null;
  // Los tipos de reparación para elegir la de la batería; vacío sin repairs.
  repairTypes: { id: string; name: string; isActive: boolean }[];
  currencies: string[];
  mainCurrency: string | null;
};

async function readRepairTypes(
  context: AuthContext,
): Promise<{ id: string; name: string; isActive: boolean }[]> {
  const types = await listRepairTypes(context);
  return types.ok
    ? types.types.map((type) => ({
        id: type.id,
        name: type.name,
        isActive: type.isActive,
      }))
    : [];
}

export async function getQuoteSettingsForm(
  context: AuthContext,
): Promise<
  { ok: true; form: QuoteSettingsForm } | Failure<"FORBIDDEN" | "NOT_FOUND">
> {
  const allowed = await requireTradeIns(context, "admin");
  if (!allowed.ok) return allowed;
  const [settings, repairTypes, mainCurrency] = await Promise.all([
    repository.findQuoteSettings(context.organizationId),
    readRepairTypes(context),
    getMainCurrency(context.organizationId),
  ]);
  return {
    ok: true,
    form: {
      settings: settings ?? null,
      repairTypes,
      currencies: acceptedCurrencies(),
      mainCurrency,
    },
  };
}

export type QuoteSettingsInput = {
  batteryThreshold: string;
  rangePercent: string;
  roundingStep: string;
  roundingCurrency: string;
  batteryRepairTypeId: string;
};

export type QuoteSettingsField =
  | "batteryThreshold"
  | "rangePercent"
  | "roundingStep"
  | "roundingCurrency"
  | "batteryRepairTypeId";

export type QuoteSettingsResult =
  | { ok: true; changed: boolean }
  | Failure<"FORBIDDEN" | "NOT_FOUND">
  | Failure<
      "VALIDATION_ERROR",
      { fields: QuoteSettingsField[]; amount?: AmountRejection }
    >;

// Un entero de 1 a 100.
function parseThreshold(text: string): number | null {
  const trimmed = text.trim();
  if (!/^\d{1,3}$/.test(trimmed)) return null;
  const value = Number(trimmed);
  return value >= 1 && value <= 100 ? value : null;
}

// De 0 a MAX_RANGE_PERCENT, con hasta dos decimales y coma o punto: «10», «7,5». Devuelve el texto con
// la escala de la base («7.50»).
function parsePercent(text: string): string | null {
  const match = /^(\d{1,2})(?:[.,](\d{1,2}))?$/.exec(text.trim());
  if (!match) return null;
  const hundredths =
    Number(match[1]) * 100 + Number((match[2] ?? "").padEnd(2, "0"));
  if (hundredths > MAX_RANGE_PERCENT * 100) return null;
  return `${Math.floor(hundredths / 100)}.${String(hundredths % 100).padStart(2, "0")}`;
}

function percentHundredths(value: string): bigint {
  const [whole, fraction = ""] = value.split(".");
  return BigInt(whole!) * 100n + BigInt(fraction.padEnd(2, "0").slice(0, 2));
}

export async function updateQuoteSettings(
  context: AuthContext,
  input: QuoteSettingsInput,
): Promise<QuoteSettingsResult> {
  const allowed = await requireTradeIns(context, "admin");
  if (!allowed.ok) return allowed;
  const fields: QuoteSettingsField[] = [];
  const batteryThreshold = parseThreshold(input.batteryThreshold);
  if (batteryThreshold === null) fields.push("batteryThreshold");
  const rangePercent = parsePercent(input.rangePercent);
  if (rangePercent === null) fields.push("rangePercent");
  const roundingCurrency = input.roundingCurrency.trim().toUpperCase();
  const decimals = currencyDecimals(roundingCurrency);
  let roundingStep: string | null = null;
  let amount: AmountRejection | undefined;
  if (!decimals.ok) fields.push("roundingCurrency");
  else {
    const parsed = parseMoneyInput(input.roundingStep, decimals.decimals);
    if (parsed.ok) roundingStep = moneyToDatabase(parsed.amount);
    else {
      fields.push("roundingStep");
      amount = parsed.reason;
    }
  }
  const typeText = input.batteryRepairTypeId.trim().toLowerCase();
  let batteryRepairTypeId: string | null = null;
  if (typeText !== "") {
    const types = await readRepairTypes(context);
    if (types.some((type) => type.id === typeText)) {
      batteryRepairTypeId = typeText;
    } else fields.push("batteryRepairTypeId");
  }
  if (fields.length > 0) {
    return {
      ok: false,
      code: "VALIDATION_ERROR",
      fields,
      ...(amount ? { amount } : {}),
    };
  }
  const values: repository.QuoteSettingsValues = {
    batteryThreshold: batteryThreshold!,
    rangePercent: rangePercent!,
    roundingStep: roundingStep!,
    roundingCurrency,
    batteryRepairTypeId,
    isExample: false,
  };
  const { organizationId, userId } = context;
  const write = (tx: DbTransaction) =>
    writeSettings(tx, organizationId, userId, values);
  const first = await repository.withTransaction(write);
  // Otro las creó a la vez: ahora existen, y se editan.
  return first === "taken"
    ? (repository.withTransaction(write) as Promise<QuoteSettingsResult>)
    : first;
}

async function writeSettings(
  tx: DbTransaction,
  organizationId: string,
  userId: string,
  values: repository.QuoteSettingsValues,
): Promise<QuoteSettingsResult | "taken"> {
  const current = await repository.findQuoteSettings(organizationId, tx, {
    forUpdate: true,
  });
  if (!current) {
    const id = await repository.insertQuoteSettings(tx, organizationId, values);
    if (id === "taken") return "taken";
    await recordAudit(tx, {
      organizationId,
      actorUserId: userId,
      entityType: "trade_in_settings",
      entityId: id,
      action: "create",
      diff: { before: null, after: values },
    });
    return { ok: true, changed: true };
  }
  const before: Record<string, string | number | boolean | null> = {};
  const after: Record<string, string | number | boolean | null> = {};
  for (const key of Object.keys(values) as (keyof typeof values)[]) {
    if (current[key] !== values[key]) {
      before[key] = current[key];
      after[key] = values[key];
    }
  }
  if (Object.keys(after).length === 0) return { ok: true, changed: false };
  await repository.updateQuoteSettings(tx, organizationId, values);
  await recordAudit(tx, {
    organizationId,
    actorUserId: userId,
    entityType: "trade_in_settings",
    entityId: current.id,
    action: "update",
    diff: { before, after },
  });
  return { ok: true, changed: true };
}

// --- Los márgenes (D-2) ---

export type ModelMargin = {
  modelId: string;
  modelName: string;
  isActive: boolean;
  margin: { amount: string; currency: string } | null;
};

export async function listTradeInMargins(
  context: AuthContext,
): Promise<
  { ok: true; margins: ModelMargin[] } | Failure<"FORBIDDEN" | "NOT_FOUND">
> {
  const allowed = await requireTradeIns(context, "admin");
  if (!allowed.ok) return allowed;
  const [models, margins] = await Promise.all([
    listModels(context),
    repository.findMargins(context.organizationId),
  ]);
  const byModel = new Map(margins.map((row) => [row.modelId, row]));
  return {
    ok: true,
    margins: models.ok
      ? models.models.map((model) => {
          const row = byModel.get(model.id);
          return {
            modelId: model.id,
            modelName: model.name,
            isActive: model.isActive,
            margin: row ? { amount: row.amount, currency: row.currency } : null,
          };
        })
      : [],
  };
}

export type MarginInput = { modelId: string; amount: string; currency: string };
export type MarginField = "amount" | "currency";

export type SetMarginResult =
  | { ok: true; changed: boolean }
  | Failure<"FORBIDDEN" | "NOT_FOUND" | "VALIDATION_ERROR">
  | Failure<
      "VALIDATION_ERROR",
      { fields: MarginField[]; amount?: AmountRejection }
    >;

// El margen admite cero: «no me guardo nada en este modelo» es un margen (D-2).
function parseMargin(
  text: string,
  decimals: number,
): { ok: true; amount: string } | { ok: false; reason: AmountRejection } {
  if (/^0+(?:[.,]0+)?$/.test(text.trim())) return { ok: true, amount: "0.00" };
  const parsed = parseMoneyInput(text, decimals);
  return parsed.ok
    ? { ok: true, amount: moneyToDatabase(parsed.amount) }
    : parsed;
}

export async function setTradeInMargin(
  context: AuthContext,
  input: MarginInput,
): Promise<SetMarginResult> {
  const allowed = await requireTradeIns(context, "admin");
  if (!allowed.ok) return allowed;
  const modelId = input.modelId.trim().toLowerCase();
  if (!idSchema.safeParse(modelId).success) return failure("VALIDATION_ERROR");
  const currency = input.currency.trim().toUpperCase();
  const decimals = currencyDecimals(currency);
  if (!decimals.ok) {
    return { ok: false, code: "VALIDATION_ERROR", fields: ["currency"] };
  }
  const parsed = parseMargin(input.amount, decimals.decimals);
  if (!parsed.ok) {
    return {
      ok: false,
      code: "VALIDATION_ERROR",
      fields: ["amount"],
      amount: parsed.reason,
    };
  }
  const model = await getModel(context, modelId);
  if (!model.ok) return failure("NOT_FOUND");
  const values = { amount: parsed.amount, currency };
  const { organizationId, userId } = context;
  const write = async (
    tx: DbTransaction,
  ): Promise<SetMarginResult | "taken"> => {
    const current = await repository.findMargin(organizationId, modelId, tx, {
      forUpdate: true,
    });
    if (!current) {
      const id = await repository.insertMargin(tx, organizationId, {
        modelId,
        ...values,
      });
      if (id === "taken") return "taken";
      await recordAudit(tx, {
        organizationId,
        actorUserId: userId,
        entityType: "trade_in_margin",
        entityId: id,
        action: "create",
        diff: { before: null, after: { model_id: modelId, ...values } },
      });
      return { ok: true, changed: true };
    }
    if (
      current.amount === values.amount &&
      current.currency === values.currency
    ) {
      return { ok: true, changed: false };
    }
    await repository.updateMargin(tx, organizationId, current.id, values);
    await recordAudit(tx, {
      organizationId,
      actorUserId: userId,
      entityType: "trade_in_margin",
      entityId: current.id,
      action: "update",
      diff: {
        before: { amount: current.amount, currency: current.currency },
        after: values,
      },
    });
    return { ok: true, changed: true };
  };
  const first = await repository.withTransaction(write);
  return first === "taken"
    ? ((await repository.withTransaction(write)) as SetMarginResult)
    : first;
}

// --- La cotización (D-4) ---

export type QuoteFormProduct = { id: string; name: string; sku: string };

export type TradeInQuoteForm = {
  products: QuoteFormProduct[];
  checklist: { id: string; name: string; isMandatory: boolean }[];
  hasSettings: boolean;
};

// Los productos que se pueden cotizar: usados, por unidad y con modelo; y el checklist activo.
export async function getTradeInQuoteForm(
  context: AuthContext,
): Promise<
  { ok: true; form: TradeInQuoteForm } | Failure<"FORBIDDEN" | "NOT_FOUND">
> {
  const allowed = await requireTradeIns(context, "admin");
  if (!allowed.ok) return allowed;
  const [products, items, settings] = await Promise.all([
    searchProducts(context, { text: "", activity: "active" }),
    repository.findChecklistItems(context.organizationId),
    repository.findQuoteSettings(context.organizationId),
  ]);
  return {
    ok: true,
    form: {
      products: products.ok
        ? products.products
            .filter(
              (product) =>
                product.condition === "used" &&
                product.tracking === "unit" &&
                !product.isService &&
                product.modelId !== null,
            )
            .map((product) => ({
              id: product.id,
              name: product.name,
              sku: product.sku,
            }))
            .sort((a, b) => a.name.localeCompare(b.name, "es"))
        : [],
      checklist: items
        .filter((item) => item.isActive)
        .map((item) => ({
          id: item.id,
          name: item.name,
          isMandatory: item.isMandatory,
        })),
      hasSettings: settings !== undefined,
    },
  };
}

export type TradeInQuoteInput = {
  productId: string;
  batteryHealth: string;
  // Los puntos que pasaron, por id; los que faltan, no pasaron.
  passed: string[];
};

export type TradeInQuoteField = "product" | "batteryHealth";

export type TradeInQuoteRepair = {
  name: string;
  cost: string;
  // Por qué la necesita: los puntos que no pasaron, o la batería.
  because: string[];
  battery: boolean;
};

export type TradeInQuote = {
  product: { id: string; name: string };
  currency: string;
  reference: { amount: string; since: Date };
  repairs: TradeInQuoteRepair[];
  margin: string;
  value: string;
  low: string;
  high: string;
  rangePercent: string;
  roundingStep: string;
  // Algún valor suelto que usó es de ejemplo (D-5).
  usesExample: boolean;
};

export type TradeInQuoteUnavailable =
  QuoteUnavailableReason | "no_settings" | "product_not_quotable";

export type QuoteTradeInResult =
  | { ok: true; quote: TradeInQuote }
  | Failure<"FORBIDDEN" | "NOT_FOUND">
  | Failure<"VALIDATION_ERROR", { fields: TradeInQuoteField[] }>
  | Failure<
      "BUSINESS_RULE_VIOLATION",
      { rule: "mandatory_failed"; items: string[] }
    >
  | Failure<
      "BUSINESS_RULE_VIOLATION",
      { rule: TradeInQuoteUnavailable; repairs?: string[] }
    >;

function unavailable(
  rule: TradeInQuoteUnavailable,
  repairs?: string[],
): QuoteTradeInResult {
  return {
    ok: false,
    code: "BUSINESS_RULE_VIOLATION",
    rule,
    ...(repairs ? { repairs } : {}),
  };
}

// No escribe nada (D-4, AC-4): ni filas, ni auditoría, ni contadores. Lee sin bloquear: es orientativa,
// y la recepción vuelve a mirar el equipo.
export async function quoteTradeIn(
  context: AuthContext,
  input: TradeInQuoteInput,
): Promise<QuoteTradeInResult> {
  const allowed = await requireTradeIns(context, "admin");
  if (!allowed.ok) return allowed;
  const fields: TradeInQuoteField[] = [];
  const productId = input.productId.trim().toLowerCase();
  if (!idSchema.safeParse(productId).success) fields.push("product");
  const batteryText = input.batteryHealth.trim();
  const batteryHealth = /^\d{1,3}$/.test(batteryText)
    ? Number(batteryText)
    : NaN;
  if (!(batteryHealth >= 0 && batteryHealth <= 100)) {
    fields.push("batteryHealth");
  }
  if (fields.length > 0) return { ok: false, code: "VALIDATION_ERROR", fields };
  const passed = new Set(input.passed.map((id) => id.trim().toLowerCase()));
  const { organizationId } = context;

  const products = await getProductsByIds(context, [productId]);
  const product = products.ok ? products.products[0] : undefined;
  if (!product) return failure("NOT_FOUND");
  if (
    product.condition !== "used" ||
    product.tracking !== "unit" ||
    product.isService ||
    product.modelId === null
  ) {
    return unavailable("product_not_quotable");
  }
  const modelId = product.modelId;

  const [settings, items] = await Promise.all([
    repository.findQuoteSettings(organizationId),
    repository.findChecklistItems(organizationId),
  ]);
  if (!settings) return unavailable("no_settings");
  const active = items.filter((item) => item.isActive);
  const mandatoryFailed = active.filter(
    (item) => item.isMandatory && !passed.has(item.id),
  );
  if (mandatoryFailed.length > 0) {
    return {
      ok: false,
      code: "BUSINESS_RULE_VIOLATION",
      rule: "mandatory_failed",
      items: mandatoryFailed.map((item) => item.name),
    };
  }

  // Las reparaciones que necesita, cada tipo una vez, con los puntos que la piden.
  const needed = new Map<string, { because: string[]; battery: boolean }>();
  for (const item of active) {
    if (passed.has(item.id) || item.repairTypeId === null) continue;
    const entry = needed.get(item.repairTypeId) ?? {
      because: [],
      battery: false,
    };
    entry.because.push(item.name);
    needed.set(item.repairTypeId, entry);
  }
  const batteryLow = batteryHealth < settings.batteryThreshold;
  if (batteryLow && settings.batteryRepairTypeId !== null) {
    const entry = needed.get(settings.batteryRepairTypeId) ?? {
      because: [],
      battery: false,
    };
    entry.battery = true;
    needed.set(settings.batteryRepairTypeId, entry);
  }

  const [costs, prices, margin] = await Promise.all([
    needed.size > 0
      ? getRepairCostsForQuote(context, modelId)
      : Promise.resolve({ ok: true as const, types: new Map() }),
    getCurrentPrices(context, [product.id]),
    repository.findMargin(organizationId, modelId),
  ]);
  const types = costs.ok ? costs.types : new Map();
  const repairs: QuoteRepair[] = [...needed.keys()].map((repairTypeId) => {
    const type = types.get(repairTypeId);
    return {
      repairTypeId,
      // Sin repairs no hay nombres: la reparación se nombra por los puntos que la piden, o «Batería».
      name:
        type?.name ??
        (needed.get(repairTypeId)!.because.join(", ") || "Batería"),
      cost:
        type?.cost && type.costCurrency
          ? {
              amount: moneyFromDatabase(type.cost),
              currency: type.costCurrency,
            }
          : null,
    };
  });
  const price = prices.ok ? prices.prices.get(product.id) : undefined;
  const result = computeTradeInQuote({
    reference: price
      ? { amount: moneyFromDatabase(price.amount), currency: price.currency }
      : null,
    margin: margin
      ? { amount: moneyFromDatabase(margin.amount), currency: margin.currency }
      : null,
    repairs,
    batteryRepairMissing: batteryLow && settings.batteryRepairTypeId === null,
    rangePercent: percentHundredths(settings.rangePercent),
    roundingStep: {
      amount: moneyFromDatabase(settings.roundingStep),
      currency: settings.roundingCurrency,
    },
  });
  if (!result.ok) return unavailable(result.reason, result.repairs);
  return {
    ok: true,
    quote: {
      product: { id: product.id, name: product.name },
      currency: result.currency,
      reference: { amount: price!.amount, since: price!.createdAt },
      repairs: repairs.map((repair) => ({
        name: repair.name,
        cost: moneyToDatabase(repair.cost!.amount),
        because: needed.get(repair.repairTypeId)!.because,
        battery: needed.get(repair.repairTypeId)!.battery,
      })),
      margin: margin!.amount,
      value: moneyToDatabase(result.value),
      low: moneyToDatabase(result.low),
      high: moneyToDatabase(result.high),
      rangePercent: settings.rangePercent,
      roundingStep: settings.roundingStep,
      usesExample: settings.isExample,
    },
  };
}

// --- La copia del perfil (U-4) ---

// Los valores sueltos de un perfil y el tipo de reparación de cada punto, que el script de capacidades
// copia al activar trade_ins y al volver a correr con la capacidad activa. No autoriza nada: la llama
// solo el script, dentro de su transacción (tests/guards/capability-reads.test.ts). No pisa lo que la
// organización ya tiene: crea los valores si faltan, y pone un tipo solo en un punto que no tiene.
export type QuoteTemplate = {
  batteryThreshold: number;
  rangePercent: string;
  roundingStep: string;
  roundingCurrency: string;
  batteryRepairTypeId: string | null;
  // Por nombre del punto en minúsculas, el tipo de reparación ya resuelto en la organización.
  itemRepairTypes: Map<string, string>;
};

export async function applyQuoteTemplate(
  tx: DbTransaction,
  input: {
    organizationId: string;
    actorUserId: string;
    template: QuoteTemplate;
  },
): Promise<{ settingsCreated: boolean; itemsLinked: string[] }> {
  const { organizationId, actorUserId, template } = input;
  let settingsCreated = false;
  const current = await repository.findQuoteSettings(organizationId, tx, {
    forUpdate: true,
  });
  if (!current) {
    const values: repository.QuoteSettingsValues = {
      batteryThreshold: template.batteryThreshold,
      rangePercent: template.rangePercent,
      roundingStep: template.roundingStep,
      roundingCurrency: template.roundingCurrency,
      batteryRepairTypeId: template.batteryRepairTypeId,
      isExample: true,
    };
    const id = await repository.insertQuoteSettings(tx, organizationId, values);
    if (id === "taken") {
      throw new Error("Los valores de la cotización se crearon a la vez.");
    }
    await recordAudit(tx, {
      organizationId,
      actorUserId,
      entityType: "trade_in_settings",
      entityId: id,
      action: "create",
      diff: { before: null, after: { ...values, origen: "perfil" } },
    });
    settingsCreated = true;
  }
  const itemsLinked: string[] = [];
  // Los puntos se vinculan solo en la corrida que crea los valores (revisión independiente, B-2): después,
  // un punto sin reparación puede ser uno al que un admin se la sacó, y eso no se pisa (U-4).
  if (!settingsCreated) return { settingsCreated, itemsLinked };
  const items = await repository.findChecklistItems(organizationId, tx, {
    lock: "update",
  });
  for (const item of items) {
    const repairTypeId = template.itemRepairTypes.get(item.name.toLowerCase());
    if (item.repairTypeId !== null || repairTypeId === undefined) continue;
    await repository.updateChecklistItem(tx, organizationId, item.id, {
      repairTypeId,
    });
    await recordAudit(tx, {
      organizationId,
      actorUserId,
      entityType: "trade_in_checklist_item",
      entityId: item.id,
      action: "update",
      // before y after llevan los mismos campos: el origen no entra (la auditoría lo exige).
      diff: { before: { repairTypeId: null }, after: { repairTypeId } },
    });
    itemsLinked.push(item.name);
  }
  return { settingsCreated, itemsLinked };
}

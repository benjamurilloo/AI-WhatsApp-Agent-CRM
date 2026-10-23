import { z } from "zod";
import { recordAudit } from "@/modules/audit";
import { getModel, listModels, type ProductModel } from "@/modules/catalog";
import {
  authorize,
  hasCapability,
  type AuthContext,
} from "@/modules/organizations";
import type { DbTransaction } from "@/shared/db";
import { failure, type Failure } from "@/shared/errors";
import {
  acceptedCurrencies,
  currencyDecimals,
  moneyToDatabase,
  parseMoneyInput,
  type AmountRejection,
} from "@/shared/money";
import * as repository from "./repository";
import { REPAIR_TYPE_NAME_MAX_LENGTH } from "./schema";

// La lista de reparaciones (ADR 0024, punto 7; brief-29.6, D-2): los tipos de reparación de la
// organización y, por cada tipo y modelo, lo que paga el cliente y lo que se estima que cobra el
// técnico. De la capacidad repairs: sin ella, nada de esto existe para nadie, y un viewer recibe
// NOT_FOUND como un admin. Un admin la edita; un viewer la lee sin el costo (ADR 0024, punto 14).
// Cada escritura se audita: los tipos como repair_type, y los precios como repair_price, con
// price_change y cost_change.

export { REPAIR_TYPE_NAME_MAX_LENGTH };

const idSchema = z.uuid();

export async function repairsAllowed(context: AuthContext): Promise<boolean> {
  return hasCapability(context.organizationId, "repairs");
}

async function requireRepairs(
  context: AuthContext,
  role?: "admin",
): Promise<{ ok: true } | Failure<"FORBIDDEN" | "NOT_FOUND">> {
  const signedIn = authorize(context, {});
  if (!signedIn.ok) return signedIn;
  if (!(await repairsAllowed(context))) return failure("NOT_FOUND");
  return role ? authorize(context, { role }) : { ok: true };
}

export type RepairType = repository.RepairTypeRow;

// Los tipos de la organización, activos e inactivos, en su orden. Los dos roles.
export async function listRepairTypes(
  context: AuthContext,
): Promise<
  { ok: true; types: RepairType[] } | Failure<"FORBIDDEN" | "NOT_FOUND">
> {
  const allowed = await requireRepairs(context);
  if (!allowed.ok) return allowed;
  return {
    ok: true,
    types: await repository.findRepairTypes(context.organizationId),
  };
}

export type RepairTypeInput = { name: string };
export type RepairTypeField = "name";

const nameSchema = z.string().trim().min(1).max(REPAIR_TYPE_NAME_MAX_LENGTH);

export type RepairTypeWriteResult =
  | { ok: true; repairTypeId: string; changed: boolean }
  | Failure<"FORBIDDEN" | "NOT_FOUND" | "VALIDATION_ERROR">
  | Failure<"VALIDATION_ERROR", { fields: RepairTypeField[] }>
  | Failure<"CONFLICT", { field: "name" }>;

const nameTaken: RepairTypeWriteResult = {
  ok: false,
  code: "CONFLICT",
  field: "name",
};

const invalidName: RepairTypeWriteResult = {
  ok: false,
  code: "VALIDATION_ERROR",
  fields: ["name"],
};

// Un tipo nuevo va al final de la lista.
export async function createRepairType(
  context: AuthContext,
  input: RepairTypeInput,
): Promise<RepairTypeWriteResult> {
  const allowed = await requireRepairs(context, "admin");
  if (!allowed.ok) return allowed;
  const name = nameSchema.safeParse(input.name);
  if (!name.success) return invalidName;
  const { organizationId, userId } = context;
  return repository.withTransaction(
    async (tx): Promise<RepairTypeWriteResult> => {
      // La lista FOR UPDATE: dos altas a la vez no toman la misma posición.
      const existing = await repository.findRepairTypes(organizationId, tx, {
        forUpdate: true,
      });
      const values = {
        name: name.data,
        position:
          existing.reduce((max, type) => Math.max(max, type.position), -1) + 1,
        isActive: true,
      };
      const repairTypeId = await repository.insertRepairType(
        tx,
        organizationId,
        { ...values, isExample: false },
      );
      if (repairTypeId === "name_taken") return nameTaken;
      await recordAudit(tx, {
        organizationId,
        actorUserId: userId,
        entityType: "repair_type",
        entityId: repairTypeId,
        action: "create",
        diff: { before: null, after: values },
      });
      return { ok: true, repairTypeId, changed: true };
    },
  );
}

export async function renameRepairType(
  context: AuthContext,
  repairTypeId: string,
  input: RepairTypeInput,
): Promise<RepairTypeWriteResult> {
  const allowed = await requireRepairs(context, "admin");
  if (!allowed.ok) return allowed;
  if (!idSchema.safeParse(repairTypeId).success) {
    return failure("VALIDATION_ERROR");
  }
  const name = nameSchema.safeParse(input.name);
  if (!name.success) return invalidName;
  const { organizationId, userId } = context;
  return repository.withTransaction(
    async (tx): Promise<RepairTypeWriteResult> => {
      const current = await repository.findRepairType(
        organizationId,
        repairTypeId.toLowerCase(),
        tx,
        { forUpdate: true },
      );
      if (!current) return failure("NOT_FOUND");
      if (current.name === name.data) {
        return { ok: true, repairTypeId: current.id, changed: false };
      }
      const written = await repository.updateRepairType(
        tx,
        organizationId,
        current.id,
        { name: name.data },
      );
      if (written === "name_taken") return nameTaken;
      await recordAudit(tx, {
        organizationId,
        actorUserId: userId,
        entityType: "repair_type",
        entityId: current.id,
        action: "update",
        diff: { before: { name: current.name }, after: { name: name.data } },
      });
      return { ok: true, repairTypeId: current.id, changed: true };
    },
  );
}

// Desactivar un tipo lo saca del presupuesto; las órdenes que lo tienen lo conservan.
export async function setRepairTypeActive(
  context: AuthContext,
  repairTypeId: string,
  isActive: boolean,
): Promise<RepairTypeWriteResult> {
  const allowed = await requireRepairs(context, "admin");
  if (!allowed.ok) return allowed;
  if (!idSchema.safeParse(repairTypeId).success) {
    return failure("VALIDATION_ERROR");
  }
  const { organizationId, userId } = context;
  return repository.withTransaction(
    async (tx): Promise<RepairTypeWriteResult> => {
      const current = await repository.findRepairType(
        organizationId,
        repairTypeId.toLowerCase(),
        tx,
        { forUpdate: true },
      );
      if (!current) return failure("NOT_FOUND");
      if (current.isActive === isActive) {
        return { ok: true, repairTypeId: current.id, changed: false };
      }
      await repository.updateRepairType(tx, organizationId, current.id, {
        isActive,
      });
      await recordAudit(tx, {
        organizationId,
        actorUserId: userId,
        entityType: "repair_type",
        entityId: current.id,
        action: isActive ? "reactivate" : "deactivate",
        diff: { before: { isActive: current.isActive }, after: { isActive } },
      });
      return { ok: true, repairTypeId: current.id, changed: true };
    },
  );
}

export type MoveDirection = "up" | "down";

// Sube o baja un tipo un lugar, con el molde de los grados (brief-29.5, D-5): la lista se renumera
// de 0 en adelante, y cada tipo cuya posición guardada cambia queda auditado.
export async function moveRepairType(
  context: AuthContext,
  repairTypeId: string,
  direction: MoveDirection,
): Promise<RepairTypeWriteResult> {
  const allowed = await requireRepairs(context, "admin");
  if (!allowed.ok) return allowed;
  if (
    !idSchema.safeParse(repairTypeId).success ||
    (direction !== "up" && direction !== "down")
  ) {
    return failure("VALIDATION_ERROR");
  }
  const { organizationId, userId } = context;
  const id = repairTypeId.toLowerCase();
  return repository.withTransaction(
    async (tx): Promise<RepairTypeWriteResult> => {
      const types = await repository.findRepairTypes(organizationId, tx, {
        forUpdate: true,
      });
      const index = types.findIndex((type) => type.id === id);
      if (index < 0) return failure("NOT_FOUND");
      const target = direction === "up" ? index - 1 : index + 1;
      if (target < 0 || target >= types.length) {
        return { ok: true, repairTypeId: id, changed: false };
      }
      const order = types.map((type) => type.id);
      [order[index], order[target]] = [order[target]!, order[index]!];
      for (const [position, otherId] of order.entries()) {
        const type = types.find((candidate) => candidate.id === otherId)!;
        if (type.position !== position) {
          await repository.updateRepairType(tx, organizationId, otherId, {
            position,
          });
          await recordAudit(tx, {
            organizationId,
            actorUserId: userId,
            entityType: "repair_type",
            entityId: otherId,
            action: "update",
            diff: { before: { position: type.position }, after: { position } },
          });
        }
      }
      return { ok: true, repairTypeId: id, changed: true };
    },
  );
}

// La copia de los tipos de un perfil de rubro (ADR 0024, punto 13; brief-29.6, D-1). La llama solo el
// script de capacidades, con el admin que nombró, dentro de la transacción que activa repairs: no
// autoriza nada. Un tipo que la organización ya tiene, por nombre, se saltea.
// tests/guards/capability-reads.test.ts fija que nada de src/ fuera de service la nombra.
export type RepairTypeTemplate = { name: string };

export async function applyRepairTypeTemplate(
  tx: DbTransaction,
  input: {
    organizationId: string;
    actorUserId: string;
    repairTypes: readonly RepairTypeTemplate[];
  },
): Promise<{ created: string[]; skipped: string[] }> {
  const { organizationId, actorUserId } = input;
  const existing = await repository.findRepairTypes(organizationId, tx, {
    forUpdate: true,
  });
  const names = new Set(existing.map((type) => type.name.toLowerCase()));
  let position =
    existing.reduce((max, type) => Math.max(max, type.position), -1) + 1;
  const created: string[] = [];
  const skipped: string[] = [];
  for (const template of input.repairTypes) {
    if (names.has(template.name.toLowerCase())) {
      skipped.push(template.name);
      continue;
    }
    const values = {
      name: template.name,
      position: position++,
      isActive: true,
      isExample: true,
    };
    const repairTypeId = await repository.insertRepairType(
      tx,
      organizationId,
      values,
    );
    if (repairTypeId === "name_taken") {
      throw new Error(
        `tipo de reparación repetido en la plantilla: ${template.name}`,
      );
    }
    await recordAudit(tx, {
      organizationId,
      actorUserId,
      entityType: "repair_type",
      entityId: repairTypeId,
      action: "create",
      diff: { before: null, after: { ...values, origen: "perfil" } },
    });
    names.add(template.name.toLowerCase());
    created.push(template.name);
  }
  return { created, skipped };
}

// Los precios (D-2). El costo es del admin: un viewer recibe el precio al cliente y nada más.

export type RepairPrice = {
  id: string;
  price: string;
  priceCurrency: string;
  // Null para un viewer.
  cost: string | null;
  costCurrency: string | null;
};

export type ModelRepairRow = {
  type: RepairType;
  // Null si el tipo no tiene precio para el modelo.
  price: RepairPrice | null;
};

export type ModelRepairPrices = {
  model: ProductModel;
  rows: ModelRepairRow[];
};

function priceForRole(
  context: AuthContext,
  row: repository.RepairPriceRow,
): RepairPrice {
  const admin = context.role === "admin";
  return {
    id: row.id,
    price: row.price,
    priceCurrency: row.priceCurrency,
    cost: admin ? row.cost : null,
    costCurrency: admin ? row.costCurrency : null,
  };
}

// Los modelos de la organización con cuántos precios tiene cargados cada uno, para elegir cuál editar.
export async function listRepairModels(
  context: AuthContext,
): Promise<
  | { ok: true; models: (ProductModel & { priceCount: number })[] }
  | Failure<"FORBIDDEN" | "NOT_FOUND">
> {
  const allowed = await requireRepairs(context);
  if (!allowed.ok) return allowed;
  const models = await listModels(context);
  if (!models.ok) return models;
  const counts = await repository.countPricesByModel(context.organizationId);
  return {
    ok: true,
    models: models.models.map((model) => ({
      ...model,
      priceCount: counts.get(model.id) ?? 0,
    })),
  };
}

// La grilla de un modelo: cada tipo de la organización, activo o no, con su precio para el modelo.
export async function getModelRepairPrices(
  context: AuthContext,
  modelId: string,
): Promise<
  | { ok: true; prices: ModelRepairPrices }
  | Failure<"FORBIDDEN" | "NOT_FOUND" | "VALIDATION_ERROR">
> {
  const allowed = await requireRepairs(context);
  if (!allowed.ok) return allowed;
  const model = await getModel(context, modelId);
  if (!model.ok) return model;
  const [types, prices] = await Promise.all([
    repository.findRepairTypes(context.organizationId),
    repository.findModelRepairPrices(context.organizationId, model.model.id),
  ]);
  const byType = new Map(prices.map((row) => [row.repairTypeId, row]));
  return {
    ok: true,
    prices: {
      model: model.model,
      rows: types.map((type) => {
        const row = byType.get(type.id);
        return { type, price: row ? priceForRole(context, row) : null };
      }),
    },
  };
}

// El precio de un tipo para un modelo: lo que paga el cliente y lo que cobra el técnico, cada uno en su
// moneda, los dos mayores que cero. Todo llega como texto desde el formulario.
export type RepairPriceInput = {
  repairTypeId: string;
  modelId: string;
  price: string;
  priceCurrency: string;
  cost: string;
  costCurrency: string;
};

export type RepairPriceField =
  "price" | "priceCurrency" | "cost" | "costCurrency";

export type RepairPriceValidationFailure = Failure<
  "VALIDATION_ERROR",
  {
    fields: RepairPriceField[];
    priceReason?: AmountRejection;
    costReason?: AmountRejection;
  }
>;

export type SetRepairPriceResult =
  | { ok: true; changed: boolean }
  | Failure<"FORBIDDEN" | "NOT_FOUND" | "VALIDATION_ERROR">
  | RepairPriceValidationFailure;

type ParsedAmount =
  | { ok: true; amount: string }
  | { ok: false; field: "currency" }
  | { ok: false; field: "amount"; reason: AmountRejection };

function parseAmount(value: string, currency: string): ParsedAmount {
  const decimals = currencyDecimals(currency);
  if (!decimals.ok) return { ok: false, field: "currency" };
  const parsed = parseMoneyInput(value, decimals.decimals);
  if (!parsed.ok) return { ok: false, field: "amount", reason: parsed.reason };
  return { ok: true, amount: moneyToDatabase(parsed.amount) };
}

export function validateRepairPriceInput(
  input: Pick<
    RepairPriceInput,
    "price" | "priceCurrency" | "cost" | "costCurrency"
  >,
):
  | { ok: true; values: repository.RepairPriceValues }
  | RepairPriceValidationFailure {
  const priceCurrency = input.priceCurrency.trim();
  const costCurrency = input.costCurrency.trim();
  const price = parseAmount(input.price, priceCurrency);
  const cost = parseAmount(input.cost, costCurrency);
  if (price.ok && cost.ok) {
    return {
      ok: true,
      values: {
        price: price.amount,
        priceCurrency,
        cost: cost.amount,
        costCurrency,
      },
    };
  }
  const fields: RepairPriceField[] = [];
  if (!price.ok)
    fields.push(price.field === "currency" ? "priceCurrency" : "price");
  if (!cost.ok)
    fields.push(cost.field === "currency" ? "costCurrency" : "cost");
  return {
    ok: false,
    code: "VALIDATION_ERROR",
    fields,
    ...(!price.ok && price.field === "amount"
      ? { priceReason: price.reason }
      : {}),
    ...(!cost.ok && cost.field === "amount" ? { costReason: cost.reason } : {}),
  };
}

export async function setRepairPrice(
  context: AuthContext,
  input: RepairPriceInput,
): Promise<SetRepairPriceResult> {
  const allowed = await requireRepairs(context, "admin");
  if (!allowed.ok) return allowed;
  const repairTypeId = input.repairTypeId.trim().toLowerCase();
  const modelId = input.modelId.trim().toLowerCase();
  if (
    !idSchema.safeParse(repairTypeId).success ||
    !idSchema.safeParse(modelId).success
  ) {
    return failure("VALIDATION_ERROR");
  }
  const validated = validateRepairPriceInput(input);
  if (!validated.ok) return validated;
  const { values } = validated;
  const model = await getModel(context, modelId);
  if (!model.ok) return failure("NOT_FOUND");
  const { organizationId, userId } = context;

  const write = (tx: DbTransaction) =>
    writeRepairPrice(tx, {
      organizationId,
      userId,
      repairTypeId,
      modelId,
      values,
    });
  const first = await repository.withTransaction(write);
  // Otro creó el mismo precio a la vez: ahora existe, y se edita.
  return first === "taken"
    ? ((await repository.withTransaction(write)) as SetRepairPriceResult)
    : first;
}

async function writeRepairPrice(
  tx: DbTransaction,
  input: {
    organizationId: string;
    userId: string;
    repairTypeId: string;
    modelId: string;
    values: repository.RepairPriceValues;
  },
): Promise<SetRepairPriceResult | "taken"> {
  const { organizationId, userId, repairTypeId, modelId, values } = input;
  const type = await repository.findRepairType(
    organizationId,
    repairTypeId,
    tx,
  );
  if (!type) return failure("NOT_FOUND");
  const current = await repository.findRepairPrice(
    tx,
    organizationId,
    repairTypeId,
    modelId,
  );
  if (!current) {
    const priceId = await repository.insertRepairPrice(
      tx,
      organizationId,
      { repairTypeId, modelId },
      values,
    );
    if (priceId === "taken") return "taken";
    await recordAudit(tx, {
      organizationId,
      actorUserId: userId,
      entityType: "repair_price",
      entityId: priceId,
      action: "create",
      diff: {
        before: null,
        after: { repair_type_id: repairTypeId, model_id: modelId, ...values },
      },
    });
    return { ok: true, changed: true };
  }
  const priceChanged =
    current.price !== values.price ||
    current.priceCurrency !== values.priceCurrency;
  const costChanged =
    current.cost !== values.cost ||
    current.costCurrency !== values.costCurrency;
  if (!priceChanged && !costChanged) return { ok: true, changed: false };
  await repository.updateRepairPrice(tx, organizationId, current.id, values);
  // El precio y el costo se auditan por separado, como en el producto (brief-11.1 y brief-18.2): el
  // historial del costo es del admin.
  if (priceChanged) {
    await recordAudit(tx, {
      organizationId,
      actorUserId: userId,
      entityType: "repair_price",
      entityId: current.id,
      action: "price_change",
      diff: {
        before: { price: current.price, priceCurrency: current.priceCurrency },
        after: { price: values.price, priceCurrency: values.priceCurrency },
      },
    });
  }
  if (costChanged) {
    await recordAudit(tx, {
      organizationId,
      actorUserId: userId,
      entityType: "repair_price",
      entityId: current.id,
      action: "cost_change",
      diff: {
        before: { cost: current.cost, costCurrency: current.costCurrency },
        after: { cost: values.cost, costCurrency: values.costCurrency },
      },
    });
  }
  return { ok: true, changed: true };
}

// La cotización de un usado (brief-29.7.3, D-4): cada tipo de la organización, activo o no, con el costo
// estimado para un modelo, o null si no lo tiene. La lee tradeins, la única otra lectura de service
// (ADR 0024, punto 16). Solo admin: el costo es suyo. Sin repairs no hay tipos, y una cotización que
// necesita una reparación no se puede hacer.
export type RepairCostForQuote = {
  name: string;
  cost: string | null;
  costCurrency: string | null;
};

export async function getRepairCostsForQuote(
  context: AuthContext,
  modelId: string,
): Promise<
  | { ok: true; types: Map<string, RepairCostForQuote> }
  | Failure<"FORBIDDEN" | "VALIDATION_ERROR">
> {
  const admin = authorize(context, { role: "admin" });
  if (!admin.ok) return admin;
  return readRepairCostsForQuote(context.organizationId, modelId);
}

// La misma lectura para la cotización del agente (brief-29.8.3, D-6), con la organización de la
// credencial y sin authorize, como las demás …ForService. El costo no sale de tradeins: la cotización
// del agente devuelve solo el rango redondeado (H-3).
export async function getRepairCostsForQuoteForService(
  organizationId: string,
  modelId: string,
): Promise<
  | { ok: true; types: Map<string, RepairCostForQuote> }
  | Failure<"VALIDATION_ERROR">
> {
  return readRepairCostsForQuote(organizationId, modelId);
}

async function readRepairCostsForQuote(
  organizationId: string,
  modelId: string,
): Promise<
  | { ok: true; types: Map<string, RepairCostForQuote> }
  | Failure<"VALIDATION_ERROR">
> {
  if (!idSchema.safeParse(modelId).success) return failure("VALIDATION_ERROR");
  if (!(await hasCapability(organizationId, "repairs"))) {
    return { ok: true, types: new Map() };
  }
  const [types, prices] = await Promise.all([
    repository.findRepairTypes(organizationId),
    repository.findModelRepairPrices(organizationId, modelId.toLowerCase()),
  ]);
  const byType = new Map(prices.map((row) => [row.repairTypeId, row]));
  return {
    ok: true,
    types: new Map(
      types.map((type) => {
        const price = byType.get(type.id);
        return [
          type.id,
          {
            name: type.name,
            cost: price?.cost ?? null,
            costCurrency: price?.costCurrency ?? null,
          },
        ];
      }),
    ),
  };
}

// Los tipos de la organización por nombre en minúsculas, para que el script de capacidades le pase a
// tradeins los de su plantilla (brief-29.7.3, U-4). No autoriza nada: la llama solo el script, dentro
// de su transacción (tests/guards/capability-reads.test.ts).
export async function repairTypeIdsByName(
  tx: DbTransaction,
  organizationId: string,
): Promise<Map<string, string>> {
  const types = await repository.findRepairTypes(organizationId, tx);
  return new Map(types.map((type) => [type.name.toLowerCase(), type.id]));
}

// Las monedas que se pueden elegir, para los formularios.
export function repairCurrencies(): string[] {
  return acceptedCurrencies();
}

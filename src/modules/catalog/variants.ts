import { z } from "zod";
import { recordAudit } from "@/modules/audit";
import {
  authorize,
  hasCapability,
  type AuthContext,
} from "@/modules/organizations";
import type { DbTransaction } from "@/shared/db";
import { failure, type Failure } from "@/shared/errors";
import {
  ATTRIBUTE_LIMITS,
  MODEL_BRAND_MAX_LENGTH,
  MODEL_NAME_MAX_LENGTH,
} from "./schema";
import { withTransaction, type ProductCondition } from "./repository";
import * as repository from "./variants-repository";

// La capacidad variants (ADR 0024, puntos 4 y 5; brief-29.2): los modelos, los atributos definidos
// por la organización y sus valores en un producto. Todo exige la capacidad: sin ella, una lectura o
// una escritura de acá responde NOT_FOUND, como una sección que no existe (D-3). Las lecturas son de
// admin y viewer; las escrituras, de admin (D-10).

export type ProductModel = repository.ModelRow;
export type AttributeType = repository.AttributeType;
export type AttributeDefinition = repository.DefinitionRow & {
  options: repository.OptionRow[];
};
export type AttributeOption = repository.OptionRow;

const idSchema = z.uuid();

async function requireVariants(
  context: AuthContext,
  role?: "admin",
): Promise<{ ok: true } | Failure<"FORBIDDEN" | "NOT_FOUND">> {
  // La capacidad antes que el rol (D-3): sin ella, la sección no existe para nadie, y un viewer
  // recibe NOT_FOUND como un admin.
  const signedIn = authorize(context, {});
  if (!signedIn.ok) return signedIn;
  if (!(await hasCapability(context.organizationId, "variants"))) {
    return failure("NOT_FOUND");
  }
  return role ? authorize(context, { role }) : { ok: true };
}

// Para las páginas: si la organización tiene la capacidad. No autoriza nada por sí misma.
export async function hasVariants(context: AuthContext): Promise<boolean> {
  return hasCapability(context.organizationId, "variants");
}

// Modelos (D-4).

export type ModelSummary = ProductModel & { productCount: number };

export async function listModels(
  context: AuthContext,
): Promise<
  { ok: true; models: ModelSummary[] } | Failure<"FORBIDDEN" | "NOT_FOUND">
> {
  const allowed = await requireVariants(context);
  if (!allowed.ok) return allowed;
  const [models, counts] = await Promise.all([
    repository.findModels(context.organizationId),
    repository.countProductsByModel(context.organizationId),
  ]);
  return {
    ok: true,
    models: models.map((model) => ({
      ...model,
      productCount: counts.get(model.id) ?? 0,
    })),
  };
}

export async function getModel(
  context: AuthContext,
  modelId: string,
): Promise<
  | { ok: true; model: ProductModel }
  | Failure<"FORBIDDEN" | "NOT_FOUND" | "VALIDATION_ERROR">
> {
  const allowed = await requireVariants(context);
  if (!allowed.ok) return allowed;
  if (!idSchema.safeParse(modelId).success) return failure("VALIDATION_ERROR");
  const model = await repository.findModel(context.organizationId, modelId);
  if (!model) return failure("NOT_FOUND");
  return { ok: true, model };
}

export type ModelField = "name" | "brand";
export type ModelInput = { name: string; brand: string | null };

const modelInputSchema = z.object({
  name: z.string().trim().min(1).max(MODEL_NAME_MAX_LENGTH),
  brand: z
    .string()
    .trim()
    .max(MODEL_BRAND_MAX_LENGTH)
    .nullish()
    .transform((value) => (value ? value : null)),
});

function validateModelInput(
  input: ModelInput,
):
  | { ok: true; values: { name: string; brand: string | null } }
  | Failure<"VALIDATION_ERROR", { fields: ModelField[] }> {
  const parsed = modelInputSchema.safeParse(input);
  if (parsed.success) return { ok: true, values: parsed.data };
  const fields = new Set<ModelField>();
  for (const issue of parsed.error.issues) {
    const field = issue.path[0];
    if (field === "name" || field === "brand") fields.add(field);
  }
  return { ok: false, code: "VALIDATION_ERROR", fields: [...fields] };
}

export type ModelWriteResult =
  | { ok: true; modelId: string; changed: boolean }
  | Failure<"FORBIDDEN" | "NOT_FOUND" | "VALIDATION_ERROR">
  | Failure<"VALIDATION_ERROR", { fields: ModelField[] }>
  | Failure<"CONFLICT", { field: "name" }>;

export async function createModel(
  context: AuthContext,
  input: ModelInput,
): Promise<ModelWriteResult> {
  const allowed = await requireVariants(context, "admin");
  if (!allowed.ok) return allowed;
  const validated = validateModelInput(input);
  if (!validated.ok) return validated;
  const organizationId = context.organizationId;
  const actorUserId = context.userId;
  const values = validated.values;
  return withTransaction(async (tx): Promise<ModelWriteResult> => {
    const position = await repository.nextPosition(tx, organizationId, {
      kind: "model",
    });
    const modelId = await repository.insertModel(tx, organizationId, {
      ...values,
      position,
    });
    if (modelId === "name_taken") {
      return { ok: false, code: "CONFLICT", field: "name" };
    }
    if (typeof modelId !== "string" || modelId.length !== 36) {
      throw new Error("insertModel: violación inesperada");
    }
    await recordAudit(tx, {
      organizationId,
      actorUserId,
      entityType: "product_model",
      entityId: modelId,
      action: "create",
      diff: { before: null, after: { ...values, isActive: true } },
    });
    return { ok: true, modelId, changed: true };
  });
}

export async function updateModel(
  context: AuthContext,
  modelId: string,
  input: ModelInput,
): Promise<ModelWriteResult> {
  const allowed = await requireVariants(context, "admin");
  if (!allowed.ok) return allowed;
  if (!idSchema.safeParse(modelId).success) return failure("VALIDATION_ERROR");
  const validated = validateModelInput(input);
  if (!validated.ok) return validated;
  const { values } = validated;

  return withTransaction(async (tx): Promise<ModelWriteResult> => {
    const current = await repository.findModel(
      context.organizationId,
      modelId,
      tx,
      { forUpdate: true },
    );
    if (!current) return failure("NOT_FOUND");
    const changed = (["name", "brand"] as const).filter(
      (field) => current[field] !== values[field],
    );
    if (changed.length === 0) return { ok: true, modelId, changed: false };
    const after = Object.fromEntries(
      changed.map((field) => [field, values[field]]),
    );
    const updated = await repository.updateModel(
      tx,
      context.organizationId,
      modelId,
      after,
    );
    if (updated === "name_taken") {
      return { ok: false, code: "CONFLICT", field: "name" };
    }
    await recordAudit(tx, {
      organizationId: context.organizationId,
      actorUserId: context.userId,
      entityType: "product_model",
      entityId: modelId,
      action: "update",
      diff: {
        before: Object.fromEntries(
          changed.map((field) => [field, current[field]]),
        ),
        after,
      },
    });
    return { ok: true, modelId, changed: true };
  });
}

export type ActiveChangeResult =
  | { ok: true; changed: boolean }
  | Failure<"FORBIDDEN" | "NOT_FOUND" | "VALIDATION_ERROR">;

// Un modelo desactivado no se ofrece en el formulario; sus productos siguen como están.
export async function setModelActive(
  context: AuthContext,
  modelId: string,
  isActive: boolean,
): Promise<ActiveChangeResult> {
  const allowed = await requireVariants(context, "admin");
  if (!allowed.ok) return allowed;
  if (!idSchema.safeParse(modelId).success) return failure("VALIDATION_ERROR");
  return withTransaction(async (tx): Promise<ActiveChangeResult> => {
    const current = await repository.findModel(
      context.organizationId,
      modelId,
      tx,
      { forUpdate: true },
    );
    if (!current) return failure("NOT_FOUND");
    if (current.isActive === isActive) return { ok: true, changed: false };
    await repository.updateModel(tx, context.organizationId, modelId, {
      isActive,
    });
    await recordAudit(tx, {
      organizationId: context.organizationId,
      actorUserId: context.userId,
      entityType: "product_model",
      entityId: modelId,
      action: isActive ? "reactivate" : "deactivate",
      diff: { before: { isActive: current.isActive }, after: { isActive } },
    });
    return { ok: true, changed: true };
  });
}

// Atributos (D-5).

async function loadDefinitions(
  organizationId: string,
  executor?: DbTransaction,
): Promise<AttributeDefinition[]> {
  const definitions = await repository.findDefinitions(
    organizationId,
    executor,
  );
  const options = await repository.findOptions(
    organizationId,
    definitions.map((definition) => definition.id),
    executor,
  );
  return definitions.map((definition) => ({
    ...definition,
    options: options.filter((option) => option.definitionId === definition.id),
  }));
}

export async function listAttributes(
  context: AuthContext,
): Promise<
  | { ok: true; definitions: AttributeDefinition[] }
  | Failure<"FORBIDDEN" | "NOT_FOUND">
> {
  const allowed = await requireVariants(context);
  if (!allowed.ok) return allowed;
  return {
    ok: true,
    definitions: await loadDefinitions(context.organizationId),
  };
}

export const ATTRIBUTE_TYPES = ["text", "number", "boolean", "option"] as const;

export type AttributeField = "name" | "type" | "isVariant" | "options";

export type AttributeInput = {
  name: string;
  type: string;
  isRequired: boolean;
  isVariant: boolean;
  // Solo para option: una opción por línea.
  options: string[];
};

// La clave sale del nombre: minúsculas sin acentos, con guiones bajos («Trae caja» → trae_caja).
export function attributeKeyFromName(name: string): string {
  const key = name
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/^[0-9_]+/, "")
    .slice(0, ATTRIBUTE_LIMITS.key);
  return key.replace(/_+$/, "");
}

const optionLabelSchema = z
  .string()
  .trim()
  .min(1)
  .max(ATTRIBUTE_LIMITS.optionLabel);

type ValidatedAttribute = {
  key: string;
  name: string;
  type: AttributeType;
  isRequired: boolean;
  isVariant: boolean;
  options: string[];
};

export function validateAttributeInput(
  input: AttributeInput,
):
  | { ok: true; values: ValidatedAttribute }
  | Failure<"VALIDATION_ERROR", { fields: AttributeField[] }> {
  const fields: AttributeField[] = [];
  const name = z
    .string()
    .trim()
    .min(1)
    .max(ATTRIBUTE_LIMITS.name)
    .safeParse(input.name);
  const key = name.success ? attributeKeyFromName(name.data) : "";
  if (!name.success || key === "") fields.push("name");
  const type = z.enum(ATTRIBUTE_TYPES).safeParse(input.type);
  if (!type.success) fields.push("type");
  // De variante: obligatorio y de opciones (ADR 0024, punto 5; el CHECK de la base).
  if (input.isVariant && type.success && type.data !== "option") {
    fields.push("isVariant");
  }
  const labels = input.options.map((label) => label.trim()).filter(Boolean);
  const unique = new Set(labels.map((label) => label.toLowerCase()));
  if (
    type.success &&
    type.data === "option" &&
    (labels.length === 0 ||
      unique.size !== labels.length ||
      !labels.every((label) => optionLabelSchema.safeParse(label).success))
  ) {
    fields.push("options");
  }
  if (fields.length > 0 || !name.success || !type.success) {
    return { ok: false, code: "VALIDATION_ERROR", fields };
  }
  return {
    ok: true,
    values: {
      key,
      name: name.data,
      type: type.data,
      isRequired: input.isVariant || input.isRequired,
      isVariant: input.isVariant,
      options: type.data === "option" ? labels : [],
    },
  };
}

export type AttributeWriteResult =
  | { ok: true; definitionId: string; changed: boolean }
  | Failure<"FORBIDDEN" | "NOT_FOUND" | "VALIDATION_ERROR">
  | Failure<"VALIDATION_ERROR", { fields: AttributeField[] }>
  | Failure<"CONFLICT", { field: "name" | "option" }>;

async function insertAttribute(
  tx: DbTransaction,
  organizationId: string,
  actorUserId: string,
  values: ValidatedAttribute,
): Promise<AttributeWriteResult> {
  const position = await repository.nextPosition(tx, organizationId, {
    kind: "definition",
  });
  const definitionId = await repository.insertDefinition(tx, organizationId, {
    key: values.key,
    name: values.name,
    type: values.type,
    isRequired: values.isRequired,
    isVariant: values.isVariant,
    position,
  });
  if (definitionId === "key_taken") {
    return { ok: false, code: "CONFLICT", field: "name" };
  }
  if (typeof definitionId !== "string" || definitionId.length !== 36) {
    throw new Error("insertDefinition: violación inesperada");
  }
  for (const [index, label] of values.options.entries()) {
    const optionId = await repository.insertOption(tx, organizationId, {
      definitionId,
      label,
      position: index,
    });
    // Las etiquetas ya se validaron únicas; una repetida acá es un defecto.
    if (optionId === "label_taken") throw new Error("opción repetida");
  }
  await recordAudit(tx, {
    organizationId,
    actorUserId,
    entityType: "attribute_definition",
    entityId: definitionId,
    action: "create",
    diff: {
      before: null,
      after: {
        key: values.key,
        name: values.name,
        type: values.type,
        isRequired: values.isRequired,
        isVariant: values.isVariant,
        opciones: values.options.join(" | ") || null,
        isActive: true,
      },
    },
  });
  return { ok: true, definitionId, changed: true };
}

export async function createAttribute(
  context: AuthContext,
  input: AttributeInput,
): Promise<AttributeWriteResult> {
  const allowed = await requireVariants(context, "admin");
  if (!allowed.ok) return allowed;
  const validated = validateAttributeInput(input);
  if (!validated.ok) return validated;
  return withTransaction((tx) =>
    insertAttribute(
      tx,
      context.organizationId,
      context.userId,
      validated.values,
    ),
  );
}

// El nombre y si es obligatorio; ni el tipo ni la clave cambian (ADR 0024, punto 4). Un atributo de
// variante sigue obligatorio.
export async function updateAttribute(
  context: AuthContext,
  definitionId: string,
  input: { name: string; isRequired: boolean },
): Promise<AttributeWriteResult> {
  const allowed = await requireVariants(context, "admin");
  if (!allowed.ok) return allowed;
  if (!idSchema.safeParse(definitionId).success)
    return failure("VALIDATION_ERROR");
  const name = z
    .string()
    .trim()
    .min(1)
    .max(ATTRIBUTE_LIMITS.name)
    .safeParse(input.name);
  if (!name.success)
    return { ok: false, code: "VALIDATION_ERROR", fields: ["name"] };

  return withTransaction(async (tx): Promise<AttributeWriteResult> => {
    const current = await repository.findDefinition(
      context.organizationId,
      definitionId,
      tx,
      { forUpdate: true },
    );
    if (!current) return failure("NOT_FOUND");
    const next = {
      name: name.data,
      isRequired: current.isVariant || input.isRequired,
    };
    const changed = (["name", "isRequired"] as const).filter(
      (field) => current[field] !== next[field],
    );
    if (changed.length === 0) return { ok: true, definitionId, changed: false };
    const after = Object.fromEntries(
      changed.map((field) => [field, next[field]]),
    );
    await repository.updateDefinition(
      tx,
      context.organizationId,
      definitionId,
      after,
    );
    await recordAudit(tx, {
      organizationId: context.organizationId,
      actorUserId: context.userId,
      entityType: "attribute_definition",
      entityId: definitionId,
      action: "update",
      diff: {
        before: Object.fromEntries(
          changed.map((field) => [field, current[field]]),
        ),
        after,
      },
    });
    return { ok: true, definitionId, changed: true };
  });
}

export async function setAttributeActive(
  context: AuthContext,
  definitionId: string,
  isActive: boolean,
): Promise<ActiveChangeResult> {
  const allowed = await requireVariants(context, "admin");
  if (!allowed.ok) return allowed;
  if (!idSchema.safeParse(definitionId).success)
    return failure("VALIDATION_ERROR");
  return withTransaction(async (tx): Promise<ActiveChangeResult> => {
    const current = await repository.findDefinition(
      context.organizationId,
      definitionId,
      tx,
      { forUpdate: true },
    );
    if (!current) return failure("NOT_FOUND");
    if (current.isActive === isActive) return { ok: true, changed: false };
    await repository.updateDefinition(
      tx,
      context.organizationId,
      definitionId,
      {
        isActive,
      },
    );
    await recordAudit(tx, {
      organizationId: context.organizationId,
      actorUserId: context.userId,
      entityType: "attribute_definition",
      entityId: definitionId,
      action: isActive ? "reactivate" : "deactivate",
      diff: { before: { isActive: current.isActive }, after: { isActive } },
    });
    return { ok: true, changed: true };
  });
}

// Opciones: se agregan, se renombran y se desactivan; nunca se borran, porque un producto puede
// usarlas. Se auditan sobre la definición, con la clave opcion.<id>.

export async function addOption(
  context: AuthContext,
  definitionId: string,
  label: string,
): Promise<AttributeWriteResult> {
  const allowed = await requireVariants(context, "admin");
  if (!allowed.ok) return allowed;
  if (!idSchema.safeParse(definitionId).success)
    return failure("VALIDATION_ERROR");
  const parsed = optionLabelSchema.safeParse(label);
  if (!parsed.success) {
    return { ok: false, code: "VALIDATION_ERROR", fields: ["options"] };
  }
  return withTransaction(async (tx): Promise<AttributeWriteResult> => {
    const definition = await repository.findDefinition(
      context.organizationId,
      definitionId,
      tx,
      { forUpdate: true },
    );
    if (!definition || definition.type !== "option")
      return failure("NOT_FOUND");
    const position = await repository.nextPosition(tx, context.organizationId, {
      kind: "option",
      definitionId,
    });
    const optionId = await repository.insertOption(tx, context.organizationId, {
      definitionId,
      label: parsed.data,
      position,
    });
    if (optionId === "label_taken") {
      return { ok: false, code: "CONFLICT", field: "option" };
    }
    await recordAudit(tx, {
      organizationId: context.organizationId,
      actorUserId: context.userId,
      entityType: "attribute_definition",
      entityId: definitionId,
      action: "update",
      diff: {
        before: { [`opcion.${optionId}`]: null },
        after: { [`opcion.${optionId}`]: parsed.data },
      },
    });
    return { ok: true, definitionId, changed: true };
  });
}

export async function updateOption(
  context: AuthContext,
  optionId: string,
  change: { label?: string; isActive?: boolean },
): Promise<AttributeWriteResult> {
  const allowed = await requireVariants(context, "admin");
  if (!allowed.ok) return allowed;
  if (!idSchema.safeParse(optionId).success) return failure("VALIDATION_ERROR");
  let label: string | undefined;
  if (change.label !== undefined) {
    const parsed = optionLabelSchema.safeParse(change.label);
    if (!parsed.success) {
      return { ok: false, code: "VALIDATION_ERROR", fields: ["options"] };
    }
    label = parsed.data;
  }
  return withTransaction(async (tx): Promise<AttributeWriteResult> => {
    const found = await repository.findOption(
      context.organizationId,
      optionId,
      tx,
    );
    if (!found) return failure("NOT_FOUND");
    // La definición se bloquea: serializa los cambios de sus opciones. La opción se vuelve a leer
    // después del bloqueo, para auditar como antes lo que dejó el cambio anterior.
    const definition = await repository.findDefinition(
      context.organizationId,
      found.definitionId,
      tx,
      { forUpdate: true },
    );
    if (!definition) return failure("NOT_FOUND");
    const option = await repository.findOption(
      context.organizationId,
      optionId,
      tx,
    );
    if (!option) return failure("NOT_FOUND");
    const next = {
      label: label ?? option.label,
      isActive: change.isActive ?? option.isActive,
    };
    const changed = (["label", "isActive"] as const).filter(
      (field) => option[field] !== next[field],
    );
    if (changed.length === 0) {
      return { ok: true, definitionId: definition.id, changed: false };
    }
    const updated = await repository.updateOption(
      tx,
      context.organizationId,
      optionId,
      Object.fromEntries(changed.map((field) => [field, next[field]])),
    );
    if (updated === "label_taken") {
      return { ok: false, code: "CONFLICT", field: "option" };
    }
    const auditKey = (field: "label" | "isActive") =>
      field === "label" ? `opcion.${optionId}` : `opcion.${optionId}.activa`;
    await recordAudit(tx, {
      organizationId: context.organizationId,
      actorUserId: context.userId,
      entityType: "attribute_definition",
      entityId: definition.id,
      action: "update",
      diff: {
        before: Object.fromEntries(
          changed.map((field) => [auditKey(field), option[field]]),
        ),
        after: Object.fromEntries(
          changed.map((field) => [auditKey(field), next[field]]),
        ),
      },
    });
    return { ok: true, definitionId: definition.id, changed: true };
  });
}

// El orden de modelos, atributos y opciones (D-4 y D-5; revisión independiente, H-2): un admin
// sube o baja una fila un lugar. Se bloquea toda la lista, se intercambia la fila con su vecina y se
// renumera de 0 en adelante, así que posiciones repetidas de antes quedan resueltas. Se audita el
// lugar de la fila movida, contado desde 0 en el orden en que se muestra; la vecina no se audita.
// En el primer o el último lugar no hace nada.
export type MoveDirection = "up" | "down";
const directionSchema = z.enum(["up", "down"]);

async function moveInList(
  tx: DbTransaction,
  organizationId: string,
  list: repository.PositionList,
  id: string,
  direction: MoveDirection,
): Promise<
  "missing" | { moved: false } | { moved: true; from: number; to: number }
> {
  const rows = await repository.lockPositions(tx, organizationId, list);
  const from = rows.findIndex((row) => row.id === id);
  if (from < 0) return "missing";
  const to = direction === "up" ? from - 1 : from + 1;
  if (to < 0 || to >= rows.length) return { moved: false };
  const order = rows.map((row) => row.id);
  order[from] = rows[to]!.id;
  order[to] = rows[from]!.id;
  const stored = new Map(rows.map((row) => [row.id, row.position]));
  for (const [position, rowId] of order.entries()) {
    if (stored.get(rowId) !== position) {
      await repository.setPosition(tx, organizationId, list, rowId, position);
    }
  }
  return { moved: true, from, to };
}

export async function moveModel(
  context: AuthContext,
  modelId: string,
  direction: string,
): Promise<ActiveChangeResult> {
  const allowed = await requireVariants(context, "admin");
  if (!allowed.ok) return allowed;
  const parsed = directionSchema.safeParse(direction);
  if (!idSchema.safeParse(modelId).success || !parsed.success) {
    return failure("VALIDATION_ERROR");
  }
  return withTransaction(async (tx): Promise<ActiveChangeResult> => {
    const moved = await moveInList(
      tx,
      context.organizationId,
      { kind: "model" },
      modelId,
      parsed.data,
    );
    if (moved === "missing") return failure("NOT_FOUND");
    if (!moved.moved) return { ok: true, changed: false };
    await recordAudit(tx, {
      organizationId: context.organizationId,
      actorUserId: context.userId,
      entityType: "product_model",
      entityId: modelId,
      action: "update",
      diff: { before: { position: moved.from }, after: { position: moved.to } },
    });
    return { ok: true, changed: true };
  });
}

export async function moveAttribute(
  context: AuthContext,
  definitionId: string,
  direction: string,
): Promise<ActiveChangeResult> {
  const allowed = await requireVariants(context, "admin");
  if (!allowed.ok) return allowed;
  const parsed = directionSchema.safeParse(direction);
  if (!idSchema.safeParse(definitionId).success || !parsed.success) {
    return failure("VALIDATION_ERROR");
  }
  return withTransaction(async (tx): Promise<ActiveChangeResult> => {
    const moved = await moveInList(
      tx,
      context.organizationId,
      { kind: "definition" },
      definitionId,
      parsed.data,
    );
    if (moved === "missing") return failure("NOT_FOUND");
    if (!moved.moved) return { ok: true, changed: false };
    await recordAudit(tx, {
      organizationId: context.organizationId,
      actorUserId: context.userId,
      entityType: "attribute_definition",
      entityId: definitionId,
      action: "update",
      diff: { before: { position: moved.from }, after: { position: moved.to } },
    });
    return { ok: true, changed: true };
  });
}

// La opción se audita sobre su definición, como sus otros cambios: opcion.<id>.posicion.
export type OptionMoveResult =
  | { ok: true; definitionId: string; changed: boolean }
  | Failure<"FORBIDDEN" | "NOT_FOUND" | "VALIDATION_ERROR">;

export async function moveOption(
  context: AuthContext,
  optionId: string,
  direction: string,
): Promise<OptionMoveResult> {
  const allowed = await requireVariants(context, "admin");
  if (!allowed.ok) return allowed;
  const parsed = directionSchema.safeParse(direction);
  if (!idSchema.safeParse(optionId).success || !parsed.success) {
    return failure("VALIDATION_ERROR");
  }
  return withTransaction(async (tx): Promise<OptionMoveResult> => {
    const option = await repository.findOption(
      context.organizationId,
      optionId,
      tx,
    );
    if (!option) return failure("NOT_FOUND");
    // La definición se bloquea, como al editar una opción.
    const definition = await repository.findDefinition(
      context.organizationId,
      option.definitionId,
      tx,
      { forUpdate: true },
    );
    if (!definition) return failure("NOT_FOUND");
    const moved = await moveInList(
      tx,
      context.organizationId,
      { kind: "option", definitionId: definition.id },
      optionId,
      parsed.data,
    );
    if (moved === "missing") return failure("NOT_FOUND");
    if (!moved.moved) {
      return { ok: true, definitionId: definition.id, changed: false };
    }
    const key = `opcion.${optionId}.posicion`;
    await recordAudit(tx, {
      organizationId: context.organizationId,
      actorUserId: context.userId,
      entityType: "attribute_definition",
      entityId: definition.id,
      action: "update",
      diff: { before: { [key]: moved.from }, after: { [key]: moved.to } },
    });
    return { ok: true, definitionId: definition.id, changed: true };
  });
}

// La plantilla de un perfil de rubro (ADR 0024, punto 13; brief-29.2, D-8). La llama solo el script
// de capacidades, dentro de su transacción, con el admin que el script nombró como autor. Una clave
// que ya existe se saltea: la copia no pisa lo que la organización ajustó.
export type AttributeTemplate = {
  key: string;
  name: string;
  type: AttributeType;
  isRequired: boolean;
  isVariant: boolean;
  options: string[];
};

export async function applyAttributeTemplate(
  tx: DbTransaction,
  input: {
    organizationId: string;
    actorUserId: string;
    attributes: readonly AttributeTemplate[];
  },
): Promise<{ created: string[]; skipped: string[] }> {
  const existing = await repository.findDefinitionKeys(
    tx,
    input.organizationId,
  );
  const created: string[] = [];
  const skipped: string[] = [];
  for (const attribute of input.attributes) {
    if (existing.has(attribute.key)) {
      skipped.push(attribute.key);
      continue;
    }
    const validated = validateAttributeInput(attribute);
    if (!validated.ok || validated.values.key !== attribute.key) {
      throw new Error(`plantilla inválida: ${attribute.key}`);
    }
    const result = await insertAttribute(
      tx,
      input.organizationId,
      input.actorUserId,
      validated.values,
    );
    if (!result.ok)
      throw new Error(`plantilla: ${attribute.key} ${result.code}`);
    created.push(attribute.key);
  }
  return { created, skipped };
}

// Los valores de un producto (D-5 y D-6). El formulario manda el modelo y, por cada definición, un
// texto: el id de la opción, «si» o «no», un número o un texto. Vacío es sin valor.

export type VariantInput = {
  modelId: string;
  attributes: Record<string, string>;
};

// El campo con error: el modelo, o el atributo con ese id de definición.
export type VariantField = "modelId" | `atributo:${string}`;

type DisplayMap = Record<string, string | null>;

const NUMBER_PATTERN = /^(-?\d{1,11})(?:[.,](\d{1,3}))?$/;

// Pura: valida contra las definiciones y opciones de la organización. Los atributos obligatorios se
// exigen solo a un producto con modelo: un accesorio no tiene capacidad ni color (precisión de la
// 29.2 al ADR 0024, punto 4). Una opción desactivada se acepta solo si el producto ya la tenía.
export function validateVariantValues(
  definitions: AttributeDefinition[],
  input: VariantInput,
  existing: repository.StoredValue[],
  hasModel: boolean,
):
  | { ok: true; values: repository.StoredValue[] }
  | { ok: false; fields: VariantField[] } {
  const fields: VariantField[] = [];
  const values: repository.StoredValue[] = [];
  const existingByDefinition = new Map(
    existing.map((value) => [value.definitionId, value]),
  );
  for (const definition of definitions) {
    if (!definition.isActive) {
      // Lo de una definición desactivada se conserva tal cual.
      const kept = existingByDefinition.get(definition.id);
      if (kept) values.push(kept);
      continue;
    }
    const field: VariantField = `atributo:${definition.id}`;
    const raw = (input.attributes[definition.id] ?? "").trim();
    if (raw === "") {
      if (definition.isRequired && hasModel) fields.push(field);
      continue;
    }
    const empty = {
      definitionId: definition.id,
      textValue: null,
      numberValue: null,
      booleanValue: null,
      optionId: null,
    };
    if (definition.type === "option") {
      const option = definition.options.find(
        (candidate) => candidate.id === raw,
      );
      const keeps = existingByDefinition.get(definition.id)?.optionId === raw;
      if (!option || (!option.isActive && !keeps)) {
        fields.push(field);
        continue;
      }
      values.push({ ...empty, optionId: option.id });
    } else if (definition.type === "boolean") {
      if (raw !== "si" && raw !== "no") {
        fields.push(field);
        continue;
      }
      values.push({ ...empty, booleanValue: raw === "si" });
    } else if (definition.type === "number") {
      const match = NUMBER_PATTERN.exec(raw);
      if (!match) {
        fields.push(field);
        continue;
      }
      const fraction = (match[2] ?? "").padEnd(3, "0");
      const negative = match[1]!.startsWith("-");
      const integer = BigInt(match[1]!.replace("-", ""));
      const isZero = integer === 0n && /^0+$/.test(fraction);
      values.push({
        ...empty,
        numberValue: `${negative && !isZero ? "-" : ""}${integer}.${fraction}`,
      });
    } else {
      if (raw.length > ATTRIBUTE_LIMITS.textValue) {
        fields.push(field);
        continue;
      }
      values.push({ ...empty, textValue: raw });
    }
  }
  return fields.length > 0 ? { ok: false, fields } : { ok: true, values };
}

function displayValue(
  definition: AttributeDefinition,
  value: repository.StoredValue | undefined,
): string | null {
  if (!value) return null;
  if (value.optionId) {
    return (
      definition.options.find((option) => option.id === value.optionId)
        ?.label ?? null
    );
  }
  if (value.booleanValue !== null) return value.booleanValue ? "Sí" : "No";
  if (value.numberValue !== null) {
    return value.numberValue.replace(/\.?0+$/, "").replace(".", ",");
  }
  return value.textValue;
}

// Lo que se audita del producto: el modelo y cada atributo, como valores planos (H-2).
function displayMap(
  definitions: AttributeDefinition[],
  modelName: string | null,
  values: repository.StoredValue[],
): DisplayMap {
  const byDefinition = new Map(
    values.map((value) => [value.definitionId, value]),
  );
  const map: DisplayMap = { modelo: modelName };
  for (const definition of definitions) {
    map[`atributo.${definition.key}`] = displayValue(
      definition,
      byDefinition.get(definition.id),
    );
  }
  return map;
}

export type VariantRejection =
  | { kind: "validation"; fields: VariantField[] }
  | { kind: "duplicate"; product: { id: string; name: string } };

// El duplicado (ADR 0024, punto 5; D-6): otro producto activo del mismo modelo, con la misma
// condición y la misma opción en todos los atributos de variante activos. El llamador bloqueó el
// modelo FOR UPDATE, así que dos altas simultáneas del mismo modelo se serializan y la segunda ve
// a la primera.
async function findDuplicate(
  tx: DbTransaction,
  organizationId: string,
  definitions: AttributeDefinition[],
  target: {
    productId: string | null;
    modelId: string;
    condition: ProductCondition;
    values: repository.StoredValue[];
  },
): Promise<{ id: string; name: string } | null> {
  const variantDefinitions = definitions.filter(
    (definition) => definition.isVariant && definition.isActive,
  );
  if (variantDefinitions.length === 0) return null;
  const siblings = await repository.findVariantSiblings(
    tx,
    organizationId,
    target.modelId,
    target.condition,
    target.productId,
  );
  if (siblings.length === 0) return null;
  const optionOf = (
    values: { definitionId: string; optionId: string | null }[],
  ) => new Map(values.map((value) => [value.definitionId, value.optionId]));
  const mine = optionOf(target.values);
  const theirs = await repository.findValues(
    organizationId,
    siblings.map((sibling) => sibling.id),
    tx,
  );
  for (const sibling of siblings) {
    const options = optionOf(
      theirs.filter((value) => value.productId === sibling.id),
    );
    const same = variantDefinitions.every((definition) => {
      const own = mine.get(definition.id);
      return (
        own !== undefined && own !== null && options.get(definition.id) === own
      );
    });
    if (same) return sibling;
  }
  return null;
}

export type VariantWrite = { before: DisplayMap; after: DisplayMap };

function optionFor(
  values: repository.StoredValue[],
  definitionId: string,
): string | null {
  return (
    values.find((value) => value.definitionId === definitionId)?.optionId ??
    null
  );
}

// Si dos listas de valores son iguales, sin importar el orden: guardar sin cambios no reescribe.
function sameValues(
  a: repository.StoredValue[],
  b: repository.StoredValue[],
): boolean {
  const key = (value: repository.StoredValue) =>
    JSON.stringify([
      value.definitionId,
      value.textValue,
      value.numberValue,
      value.booleanValue,
      value.optionId,
    ]);
  const left = a.map(key).sort();
  const right = b.map(key).sort();
  return (
    left.length === right.length &&
    left.every((item, index) => item === right[index])
  );
}

// Escribe el modelo y los atributos de un producto, dentro de la transacción del producto (D-5).
// Para un alta, productId es null hasta que el llamador inserte el producto: primero se bloquea el
// modelo y se busca el duplicado, y después el llamador inserta y llama a commit. Para una edición o
// una reactivación, el llamador ya bloqueó el producto. input undefined: el producto conserva su
// modelo y sus valores, y solo se vuelve a comprobar el duplicado.
//
// Una edición que no cambia la identidad de la variante (el modelo, la condición, las opciones de
// variante y que esté activo) no vuelve a comprobar el duplicado: desactivar un atributo de variante
// puede hacer que dos productos que ya existían choquen, y eso no debe impedir corregir el nombre de
// uno de ellos. El alta, la reactivación y todo cambio de identidad sí lo comprueban.
export async function prepareVariantWrite(
  tx: DbTransaction,
  organizationId: string,
  target: {
    productId: string | null;
    currentModelId: string | null;
    currentCondition: ProductCondition | null;
    wasActive: boolean;
    condition: ProductCondition;
    isActive: boolean;
    input: VariantInput | undefined;
  },
): Promise<
  | {
      ok: true;
      commit: (productId: string) => Promise<VariantWrite>;
    }
  | { ok: false; rejection: VariantRejection }
> {
  const definitions = await loadDefinitions(organizationId, tx);
  const existing = target.productId
    ? await repository.findValues(organizationId, [target.productId], tx)
    : [];
  const rawModelId = target.input
    ? target.input.modelId.trim()
    : (target.currentModelId ?? "");
  const modelId = rawModelId === "" ? null : rawModelId;

  let modelName: string | null = null;
  if (modelId) {
    const model = idSchema.safeParse(modelId).success
      ? await repository.findModel(organizationId, modelId, tx, {
          forUpdate: true,
        })
      : undefined;
    // Un modelo desactivado se conserva en el producto que ya lo tenía, pero no se asigna.
    if (!model || (!model.isActive && model.id !== target.currentModelId)) {
      return {
        ok: false,
        rejection: { kind: "validation", fields: ["modelId"] },
      };
    }
    modelName = model.name;
  }

  let values: repository.StoredValue[] = existing;
  if (target.input) {
    const validated = validateVariantValues(
      definitions,
      target.input,
      existing,
      modelId !== null,
    );
    if (!validated.ok) {
      return {
        ok: false,
        rejection: { kind: "validation", fields: validated.fields },
      };
    }
    values = validated.values;
  }

  const sameIdentity =
    target.productId !== null &&
    target.wasActive &&
    modelId === target.currentModelId &&
    target.condition === target.currentCondition &&
    definitions
      .filter((definition) => definition.isVariant)
      .every(
        (definition) =>
          optionFor(existing, definition.id) ===
          optionFor(values, definition.id),
      );
  if (modelId && target.isActive && !sameIdentity) {
    const duplicate = await findDuplicate(tx, organizationId, definitions, {
      productId: target.productId,
      modelId,
      condition: target.condition,
      values,
    });
    if (duplicate) {
      return {
        ok: false,
        rejection: { kind: "duplicate", product: duplicate },
      };
    }
  }

  const previousModelName = target.currentModelId
    ? ((await repository.findModel(organizationId, target.currentModelId, tx))
        ?.name ?? null)
    : null;
  const before = target.productId
    ? displayMap(definitions, previousModelName, existing)
    : {};
  const after = displayMap(definitions, modelName, values);

  return {
    ok: true,
    commit: async (productId) => {
      if (target.input) {
        if (modelId !== target.currentModelId) {
          await repository.setProductModel(
            tx,
            organizationId,
            productId,
            modelId,
          );
        }
        if (!sameValues(existing, values)) {
          await repository.replaceValues(tx, organizationId, productId, values);
        }
      }
      return { before, after };
    },
  };
}

// Lo que la ficha muestra del producto: su modelo y sus atributos con valor. null sin la capacidad.
export type ProductVariantView = {
  model: { id: string; name: string; isActive: boolean } | null;
  attributes: {
    definitionId: string;
    name: string;
    value: string;
    isVariant: boolean;
  }[];
  // Para el formulario de edición: el texto de cada definición, como lo manda el formulario.
  raw: Record<string, string>;
};

function rawValue(value: repository.StoredValue): string {
  if (value.optionId) return value.optionId;
  if (value.booleanValue !== null) return value.booleanValue ? "si" : "no";
  if (value.numberValue !== null) {
    return value.numberValue.replace(/\.?0+$/, "").replace(".", ",");
  }
  return value.textValue ?? "";
}

export async function getProductVariants(
  context: AuthContext,
  products: { id: string; modelId: string | null }[],
): Promise<Map<string, ProductVariantView> | null> {
  const authorized = authorize(context);
  if (!authorized.ok) return null;
  if (!(await hasVariants(context))) return null;
  const [definitions, models, values] = await Promise.all([
    loadDefinitions(context.organizationId),
    repository.findModels(context.organizationId),
    repository.findValues(
      context.organizationId,
      products.map((product) => product.id),
    ),
  ]);
  const modelsById = new Map(models.map((model) => [model.id, model]));
  const views = new Map<string, ProductVariantView>();
  for (const product of products) {
    const own = values.filter((value) => value.productId === product.id);
    const model = product.modelId ? modelsById.get(product.modelId) : undefined;
    const byDefinition = new Map(
      own.map((value) => [value.definitionId, value]),
    );
    views.set(product.id, {
      model: model
        ? { id: model.id, name: model.name, isActive: model.isActive }
        : null,
      attributes: definitions.flatMap((definition) => {
        const value = displayValue(definition, byDefinition.get(definition.id));
        return value === null
          ? []
          : [
              {
                definitionId: definition.id,
                name: definition.name,
                value,
                isVariant: definition.isVariant,
              },
            ];
      }),
      raw: Object.fromEntries(
        own.map((value) => [value.definitionId, rawValue(value)]),
      ),
    });
  }
  return views;
}

// Lo que el formulario de producto ofrece: modelos y definiciones activos, más el modelo y las
// opciones que el producto ya tiene aunque estén desactivados. null sin la capacidad.
export type VariantFormOptions = {
  models: { id: string; name: string }[];
  definitions: {
    id: string;
    name: string;
    type: AttributeType;
    isRequired: boolean;
    isVariant: boolean;
    options: { id: string; label: string }[];
  }[];
};

export async function getVariantFormOptions(
  context: AuthContext,
  current?: ProductVariantView,
): Promise<VariantFormOptions | null> {
  const authorized = authorize(context, { role: "admin" });
  if (!authorized.ok) return null;
  if (!(await hasVariants(context))) return null;
  const [definitions, models] = await Promise.all([
    loadDefinitions(context.organizationId),
    repository.findModels(context.organizationId),
  ]);
  const kept = new Set(Object.values(current?.raw ?? {}));
  return {
    models: models
      .filter((model) => model.isActive || model.id === current?.model?.id)
      .map((model) => ({ id: model.id, name: model.name })),
    definitions: definitions
      .filter((definition) => definition.isActive)
      .map((definition) => ({
        id: definition.id,
        name: definition.name,
        type: definition.type,
        isRequired: definition.isRequired,
        isVariant: definition.isVariant,
        options: definition.options
          .filter((option) => option.isActive || kept.has(option.id))
          .map((option) => ({ id: option.id, label: option.label })),
      })),
  };
}

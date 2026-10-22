import { and, asc, count, eq, inArray, isNotNull, ne, sql } from "drizzle-orm";
import { getDb, type Db, type DbTransaction } from "@/shared/db";
import { searchQuery, searchVector } from "@/shared/search";
import {
  attributeDefinitions,
  attributeOptions,
  attributeValues,
  productModels,
  products,
  type productCondition,
} from "./schema";

// Acceso a los modelos y a los atributos de la capacidad variants (ADR 0024, puntos 4 y 5;
// brief-29.2). Toda consulta filtra por organization_id en SQL, y las claves compuestas lo exigen
// también en la base.

type Executor = Db | DbTransaction;

export type ModelRow = {
  id: string;
  name: string;
  brand: string | null;
  position: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
};

const modelColumns = {
  id: productModels.id,
  name: productModels.name,
  brand: productModels.brand,
  position: productModels.position,
  isActive: productModels.isActive,
  createdAt: productModels.createdAt,
  updatedAt: productModels.updatedAt,
};

export type AttributeType = "text" | "number" | "boolean" | "option";

export type DefinitionRow = {
  id: string;
  key: string;
  name: string;
  type: AttributeType;
  isRequired: boolean;
  isVariant: boolean;
  position: number;
  isActive: boolean;
};

const definitionColumns = {
  id: attributeDefinitions.id,
  key: attributeDefinitions.key,
  name: attributeDefinitions.name,
  type: attributeDefinitions.type,
  isRequired: attributeDefinitions.isRequired,
  isVariant: attributeDefinitions.isVariant,
  position: attributeDefinitions.position,
  isActive: attributeDefinitions.isActive,
};

export type OptionRow = {
  id: string;
  definitionId: string;
  label: string;
  position: number;
  isActive: boolean;
};

const optionColumns = {
  id: attributeOptions.id,
  definitionId: attributeOptions.definitionId,
  label: attributeOptions.label,
  position: attributeOptions.position,
  isActive: attributeOptions.isActive,
};

// Un valor, en la columna de su tipo. numberValue con la escala de la base ("128.000").
export type StoredValue = {
  definitionId: string;
  textValue: string | null;
  numberValue: string | null;
  booleanValue: boolean | null;
  optionId: string | null;
};

export type ValueRow = StoredValue & { productId: string };

// Un nombre de modelo, una clave de atributo o una etiqueta de opción repetidos.
export type VariantUniqueViolation = "name_taken" | "key_taken" | "label_taken";

const UNIQUE_CONSTRAINTS: Record<string, VariantUniqueViolation> = {
  product_models_organization_name_lower_unique: "name_taken",
  attribute_definitions_organization_entity_key_unique: "key_taken",
  attribute_options_definition_label_lower_unique: "label_taken",
};

function uniqueViolation(error: unknown): VariantUniqueViolation | null {
  const e = error as {
    code?: string;
    constraint?: string;
    cause?: { code?: string; constraint?: string };
  } | null;
  const source = e?.cause ?? e;
  if (source?.code !== "23505" || !source.constraint) return null;
  return Object.hasOwn(UNIQUE_CONSTRAINTS, source.constraint)
    ? UNIQUE_CONSTRAINTS[source.constraint]!
    : null;
}

// En un savepoint, como los productos: un nombre repetido deshace solo esta escritura.
async function inSavepoint<T>(
  tx: DbTransaction,
  work: (savepoint: DbTransaction) => Promise<T>,
): Promise<T | VariantUniqueViolation> {
  try {
    return await tx.transaction(work);
  } catch (error) {
    const violation = uniqueViolation(error);
    if (violation) return violation;
    throw error;
  }
}

function assertUpdatedOne(rows: unknown[], what: string): void {
  if (rows.length === 0) {
    throw new Error(`${what}: la fila no existe en esta organización`);
  }
}

// Modelos.

export function findModels(
  organizationId: string,
  executor: Executor = getDb(),
): Promise<ModelRow[]> {
  return executor
    .select(modelColumns)
    .from(productModels)
    .where(eq(productModels.organizationId, organizationId))
    .orderBy(asc(productModels.position), asc(productModels.name));
}

// Los modelos activos que coinciden con el texto, por prefijo de cada palabra en el nombre y la
// marca, o el de ese id (brief-29.8.2, D-2). El vector se calcula en la consulta, sin índice: los
// modelos de una organización son pocos y se filtran antes por organization_id. Por nombre.
export function findActiveModelsMatching(
  organizationId: string,
  filter: { text: string } | { modelId: string },
): Promise<ModelRow[]> {
  const match =
    "text" in filter
      ? sql`${searchVector(sql`${productModels.name} || ' ' || coalesce(${productModels.brand}, '')`)} @@ ${searchQuery(filter.text)}`
      : eq(productModels.id, filter.modelId);
  return getDb()
    .select(modelColumns)
    .from(productModels)
    .where(
      and(
        eq(productModels.organizationId, organizationId),
        eq(productModels.isActive, true),
        match,
      ),
    )
    .orderBy(sql`lower(${productModels.name})`, asc(productModels.id));
}

// Unos modelos por id, activos o no: el nombre del modelo de una orden de servicio.
export function findModelsByIds(
  organizationId: string,
  modelIds: string[],
): Promise<ModelRow[]> {
  if (modelIds.length === 0) return Promise.resolve([]);
  return getDb()
    .select(modelColumns)
    .from(productModels)
    .where(
      and(
        eq(productModels.organizationId, organizationId),
        inArray(productModels.id, modelIds),
      ),
    );
}

export async function findModel(
  organizationId: string,
  modelId: string,
  executor: Executor = getDb(),
  { forUpdate = false } = {},
): Promise<ModelRow | undefined> {
  const query = executor
    .select(modelColumns)
    .from(productModels)
    .where(
      and(
        eq(productModels.organizationId, organizationId),
        eq(productModels.id, modelId),
      ),
    )
    .limit(1);
  const rows = forUpdate ? await query.for("update") : await query;
  return rows[0];
}

// Cuántos productos, activos o no, tiene cada modelo.
export async function countProductsByModel(
  organizationId: string,
): Promise<Map<string, number>> {
  const rows = await getDb()
    .select({ modelId: products.modelId, total: count() })
    .from(products)
    .where(
      and(
        eq(products.organizationId, organizationId),
        isNotNull(products.modelId),
      ),
    )
    .groupBy(products.modelId);
  return new Map(rows.map((row) => [row.modelId!, row.total]));
}

export type ModelValues = {
  name: string;
  brand: string | null;
  position: number;
};

export function insertModel(
  tx: DbTransaction,
  organizationId: string,
  values: ModelValues,
): Promise<string | VariantUniqueViolation> {
  return inSavepoint(tx, async (savepoint) => {
    const rows = await savepoint
      .insert(productModels)
      .values({ organizationId, ...values })
      .returning({ id: productModels.id });
    return rows[0]!.id;
  });
}

export function updateModel(
  tx: DbTransaction,
  organizationId: string,
  modelId: string,
  values: Partial<ModelValues & { isActive: boolean }>,
): Promise<void | VariantUniqueViolation> {
  return inSavepoint(tx, async (savepoint) => {
    const rows = await savepoint
      .update(productModels)
      .set(values)
      .where(
        and(
          eq(productModels.organizationId, organizationId),
          eq(productModels.id, modelId),
        ),
      )
      .returning({ id: productModels.id });
    assertUpdatedOne(rows, "updateModel");
  });
}

// Definiciones y opciones. La entidad es siempre product en la 29.2.

export function findDefinitions(
  organizationId: string,
  executor: Executor = getDb(),
): Promise<DefinitionRow[]> {
  return executor
    .select(definitionColumns)
    .from(attributeDefinitions)
    .where(
      and(
        eq(attributeDefinitions.organizationId, organizationId),
        eq(attributeDefinitions.entity, "product"),
      ),
    )
    .orderBy(
      asc(attributeDefinitions.position),
      asc(attributeDefinitions.name),
    );
}

export async function findDefinition(
  organizationId: string,
  definitionId: string,
  executor: Executor = getDb(),
  { forUpdate = false } = {},
): Promise<DefinitionRow | undefined> {
  const query = executor
    .select(definitionColumns)
    .from(attributeDefinitions)
    .where(
      and(
        eq(attributeDefinitions.organizationId, organizationId),
        eq(attributeDefinitions.id, definitionId),
      ),
    )
    .limit(1);
  const rows = forUpdate ? await query.for("update") : await query;
  return rows[0];
}

export type DefinitionValues = {
  key: string;
  name: string;
  type: AttributeType;
  isRequired: boolean;
  isVariant: boolean;
  position: number;
};

export function insertDefinition(
  tx: DbTransaction,
  organizationId: string,
  values: DefinitionValues,
): Promise<string | VariantUniqueViolation> {
  return inSavepoint(tx, async (savepoint) => {
    const rows = await savepoint
      .insert(attributeDefinitions)
      .values({ organizationId, entity: "product", ...values })
      .returning({ id: attributeDefinitions.id });
    return rows[0]!.id;
  });
}

export async function updateDefinition(
  tx: DbTransaction,
  organizationId: string,
  definitionId: string,
  values: Partial<{
    name: string;
    isRequired: boolean;
    position: number;
    isActive: boolean;
  }>,
): Promise<void> {
  const rows = await tx
    .update(attributeDefinitions)
    .set(values)
    .where(
      and(
        eq(attributeDefinitions.organizationId, organizationId),
        eq(attributeDefinitions.id, definitionId),
      ),
    )
    .returning({ id: attributeDefinitions.id });
  assertUpdatedOne(rows, "updateDefinition");
}

export function findOptions(
  organizationId: string,
  definitionIds: string[],
  executor: Executor = getDb(),
): Promise<OptionRow[]> {
  if (definitionIds.length === 0) return Promise.resolve([]);
  return executor
    .select(optionColumns)
    .from(attributeOptions)
    .where(
      and(
        eq(attributeOptions.organizationId, organizationId),
        inArray(attributeOptions.definitionId, definitionIds),
      ),
    )
    .orderBy(asc(attributeOptions.position), asc(attributeOptions.label));
}

export async function findOption(
  organizationId: string,
  optionId: string,
  executor: Executor = getDb(),
): Promise<OptionRow | undefined> {
  const rows = await executor
    .select(optionColumns)
    .from(attributeOptions)
    .where(
      and(
        eq(attributeOptions.organizationId, organizationId),
        eq(attributeOptions.id, optionId),
      ),
    )
    .limit(1);
  return rows[0];
}

export function insertOption(
  tx: DbTransaction,
  organizationId: string,
  values: { definitionId: string; label: string; position: number },
): Promise<string | VariantUniqueViolation> {
  return inSavepoint(tx, async (savepoint) => {
    const rows = await savepoint
      .insert(attributeOptions)
      .values({ organizationId, ...values })
      .returning({ id: attributeOptions.id });
    return rows[0]!.id;
  });
}

export function updateOption(
  tx: DbTransaction,
  organizationId: string,
  optionId: string,
  values: Partial<{ label: string; isActive: boolean }>,
): Promise<void | VariantUniqueViolation> {
  return inSavepoint(tx, async (savepoint) => {
    const rows = await savepoint
      .update(attributeOptions)
      .set(values)
      .where(
        and(
          eq(attributeOptions.organizationId, organizationId),
          eq(attributeOptions.id, optionId),
        ),
      )
      .returning({ id: attributeOptions.id });
    assertUpdatedOne(rows, "updateOption");
  });
}

// Valores de atributos.

export function findValues(
  organizationId: string,
  productIds: string[],
  executor: Executor = getDb(),
): Promise<ValueRow[]> {
  if (productIds.length === 0) return Promise.resolve([]);
  return executor
    .select({
      productId: attributeValues.productId,
      definitionId: attributeValues.definitionId,
      textValue: attributeValues.textValue,
      numberValue: attributeValues.numberValue,
      booleanValue: attributeValues.booleanValue,
      optionId: attributeValues.optionId,
    })
    .from(attributeValues)
    .where(
      and(
        eq(attributeValues.organizationId, organizationId),
        inArray(attributeValues.productId, productIds),
      ),
    );
}

// Reemplaza todos los valores de un producto: el llamador ya lo bloqueó (o lo acaba de insertar) en
// esta transacción.
export async function replaceValues(
  tx: DbTransaction,
  organizationId: string,
  productId: string,
  values: StoredValue[],
): Promise<void> {
  await tx
    .delete(attributeValues)
    .where(
      and(
        eq(attributeValues.organizationId, organizationId),
        eq(attributeValues.productId, productId),
      ),
    );
  if (values.length === 0) return;
  await tx
    .insert(attributeValues)
    .values(values.map((value) => ({ organizationId, productId, ...value })));
}

export async function setProductModel(
  tx: DbTransaction,
  organizationId: string,
  productId: string,
  modelId: string | null,
): Promise<void> {
  const rows = await tx
    .update(products)
    .set({ modelId })
    .where(
      and(
        eq(products.organizationId, organizationId),
        eq(products.id, productId),
      ),
    )
    .returning({ id: products.id });
  assertUpdatedOne(rows, "setProductModel");
}

// Los demás productos activos del mismo modelo y la misma condición: los candidatos a duplicado
// (ADR 0024, punto 5). El llamador ya bloqueó el modelo.
export function findVariantSiblings(
  tx: DbTransaction,
  organizationId: string,
  modelId: string,
  condition: (typeof productCondition.enumValues)[number],
  excludeProductId: string | null,
): Promise<{ id: string; name: string }[]> {
  const conditions = [
    eq(products.organizationId, organizationId),
    eq(products.modelId, modelId),
    eq(products.condition, condition),
    eq(products.isActive, true),
  ];
  if (excludeProductId) conditions.push(ne(products.id, excludeProductId));
  return tx
    .select({ id: products.id, name: products.name })
    .from(products)
    .where(and(...conditions))
    .orderBy(products.name, products.id);
}

// Para la plantilla del perfil: las claves que ya existen, para no repetirlas.
export async function findDefinitionKeys(
  tx: DbTransaction,
  organizationId: string,
): Promise<Set<string>> {
  const rows = await tx
    .select({ key: attributeDefinitions.key })
    .from(attributeDefinitions)
    .where(eq(attributeDefinitions.organizationId, organizationId));
  return new Set(rows.map((row) => row.key));
}

// La próxima posición libre de una lista: al final.
export async function nextPosition(
  tx: DbTransaction,
  organizationId: string,
  list:
    | { kind: "model" }
    | { kind: "definition" }
    | { kind: "option"; definitionId: string },
): Promise<number> {
  const [row] =
    list.kind === "model"
      ? await tx
          .select({
            value: sql<number>`coalesce(max(${productModels.position}) + 1, 0)`,
          })
          .from(productModels)
          .where(eq(productModels.organizationId, organizationId))
      : list.kind === "definition"
        ? await tx
            .select({
              value: sql<number>`coalesce(max(${attributeDefinitions.position}) + 1, 0)`,
            })
            .from(attributeDefinitions)
            .where(eq(attributeDefinitions.organizationId, organizationId))
        : await tx
            .select({
              value: sql<number>`coalesce(max(${attributeOptions.position}) + 1, 0)`,
            })
            .from(attributeOptions)
            .where(
              and(
                eq(attributeOptions.organizationId, organizationId),
                eq(attributeOptions.definitionId, list.definitionId),
              ),
            );
  return Number(row?.value ?? 0);
}

// El orden de una lista (brief-29.2, D-4 y D-5; revisión independiente, H-2): los modelos de la
// organización, sus definiciones o las opciones de una definición. lockPositions bloquea toda la
// lista FOR UPDATE, en el orden en que se muestra, para que dos movimientos simultáneos se
// serialicen; setPosition cambia el lugar de una fila de esa lista.
export type PositionList =
  | { kind: "model" }
  | { kind: "definition" }
  | { kind: "option"; definitionId: string };

export async function lockPositions(
  tx: DbTransaction,
  organizationId: string,
  list: PositionList,
): Promise<{ id: string; position: number }[]> {
  if (list.kind === "model") {
    return tx
      .select({ id: productModels.id, position: productModels.position })
      .from(productModels)
      .where(eq(productModels.organizationId, organizationId))
      .orderBy(asc(productModels.position), asc(productModels.name))
      .for("update");
  }
  if (list.kind === "definition") {
    return tx
      .select({
        id: attributeDefinitions.id,
        position: attributeDefinitions.position,
      })
      .from(attributeDefinitions)
      .where(
        and(
          eq(attributeDefinitions.organizationId, organizationId),
          eq(attributeDefinitions.entity, "product"),
        ),
      )
      .orderBy(
        asc(attributeDefinitions.position),
        asc(attributeDefinitions.name),
      )
      .for("update");
  }
  return tx
    .select({ id: attributeOptions.id, position: attributeOptions.position })
    .from(attributeOptions)
    .where(
      and(
        eq(attributeOptions.organizationId, organizationId),
        eq(attributeOptions.definitionId, list.definitionId),
      ),
    )
    .orderBy(asc(attributeOptions.position), asc(attributeOptions.label))
    .for("update");
}

export async function setPosition(
  tx: DbTransaction,
  organizationId: string,
  list: PositionList,
  id: string,
  position: number,
): Promise<void> {
  const table =
    list.kind === "model"
      ? productModels
      : list.kind === "definition"
        ? attributeDefinitions
        : attributeOptions;
  const rows = await tx
    .update(table)
    .set({ position })
    .where(and(eq(table.organizationId, organizationId), eq(table.id, id)))
    .returning({ id: table.id });
  assertUpdatedOne(rows, "setPosition");
}

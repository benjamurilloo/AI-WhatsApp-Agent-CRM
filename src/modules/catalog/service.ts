import { z } from "zod";
import { recordAudit } from "@/modules/audit";
import { authorize, type AuthContext } from "@/modules/organizations";
import type { DbTransaction } from "@/shared/db";
import { failure, type Failure } from "@/shared/errors";
import {
  parseQuantityInput,
  quantityToDatabase,
  type Quantity,
} from "@/shared/quantity";
import * as repository from "./repository";

// Casos de uso de productos (brief-4.2): FR-PROD-01 a 03, con auditoría en la misma
// transacción (FR-AUD-01), y el estado de stock de FR-PROD-05.

export type Product = repository.ProductRow;
export type ProductActivityFilter = repository.ActivityFilter;

export type StockStatus = "disponible" | "bajo_stock" | "sin_stock";

// Único umbral: reorder_point (subfase 1.2, D-10). Comparación exacta en milésimas (D-2).
export function deriveStockStatus(
  quantityOnHand: Quantity,
  reorderPoint: Quantity,
): StockStatus {
  if (quantityOnHand <= 0n) return "sin_stock";
  if (quantityOnHand <= reorderPoint) return "bajo_stock";
  return "disponible";
}

export type ProductField = keyof repository.ProductValues;

export type ProductInput = {
  sku: string;
  name: string;
  description?: string | null;
  unit: string;
  reorderPoint: string;
};

// Límites de brief-4.2, D-4. Los textos se recortan antes de validar.
const productInputSchema = z.object({
  sku: z.string().trim().min(1).max(64).regex(/^\S+$/),
  name: z.string().trim().min(1).max(200),
  description: z
    .string()
    .trim()
    .max(2000)
    .nullish()
    .transform((value) => (value ? value : null)),
  unit: z.string().trim().min(1).max(32),
  reorderPoint: z.string().transform((value, ctx) => {
    const quantity = parseQuantityInput(value);
    if (quantity === null) {
      ctx.addIssue({ code: "custom", message: "cantidad inválida" });
      return z.NEVER;
    }
    return quantityToDatabase(quantity);
  }),
});

const PRODUCT_FIELDS: ProductField[] = [
  "sku",
  "name",
  "description",
  "unit",
  "reorderPoint",
];

export function validateProductInput(
  input: ProductInput,
):
  | { ok: true; values: repository.ProductValues }
  | Failure<"VALIDATION_ERROR", { fields: ProductField[] }> {
  const parsed = productInputSchema.safeParse(input);
  if (parsed.success) return { ok: true, values: parsed.data };
  const fields = new Set<ProductField>();
  for (const issue of parsed.error.issues) {
    const field = issue.path[0];
    if (PRODUCT_FIELDS.includes(field as ProductField)) {
      fields.add(field as ProductField);
    }
  }
  return {
    ok: false,
    code: "VALIDATION_ERROR",
    fields: PRODUCT_FIELDS.filter((field) => fields.has(field)),
  };
}

const productIdSchema = z.uuid();

// Lecturas: admin y viewer. Un producto de otra organización da NOT_FOUND (brief-3.4, D-3).

export async function getProduct(
  context: AuthContext,
  productId: string,
): Promise<
  | { ok: true; product: Product }
  | Failure<"FORBIDDEN" | "NOT_FOUND" | "VALIDATION_ERROR">
> {
  const authorized = authorize(context);
  if (!authorized.ok) return authorized;
  if (!productIdSchema.safeParse(productId).success) {
    return failure("VALIDATION_ERROR");
  }
  const product = await repository.findProduct(
    context.organizationId,
    productId,
  );
  if (!product) return failure("NOT_FOUND");
  return { ok: true, product };
}

// Productos que cumplen texto y actividad, sin orden ni página: los compone inventory (D-1).
export async function searchProducts(
  context: AuthContext,
  filters: { text: string; activity: ProductActivityFilter },
): Promise<{ ok: true; products: Product[] } | Failure<"FORBIDDEN">> {
  const authorized = authorize(context);
  if (!authorized.ok) return authorized;
  const products = await repository.findProducts(context.organizationId, {
    text: filters.text.trim(),
    activity: filters.activity,
  });
  return { ok: true, products };
}

// Para el ajuste de stock de inventory (brief-4.3.1, D-1): verifica y bloquea el producto dentro
// de la transacción de quien ajusta, que ya autorizó. Exige la transacción, como recordAudit.
export async function lockProductForStockChange(
  tx: DbTransaction,
  organizationId: string,
  productId: string,
): Promise<"active" | "inactive" | "not_found"> {
  const product = await repository.lockProductShared(
    tx,
    organizationId,
    productId,
  );
  if (!product) return "not_found";
  return product.isActive ? "active" : "inactive";
}

// Escrituras: solo admin.

export type CreateProductResult =
  | { ok: true; productId: string }
  | Failure<"FORBIDDEN" | "CONFLICT">
  | Failure<"VALIDATION_ERROR", { fields: ProductField[] }>;

export async function createProduct(
  context: AuthContext,
  input: ProductInput,
): Promise<CreateProductResult> {
  const authorized = authorize(context, { role: "admin" });
  if (!authorized.ok) return authorized;
  const validated = validateProductInput(input);
  if (!validated.ok) return validated;
  const { values } = validated;

  return repository.withTransaction(
    async (tx): Promise<CreateProductResult> => {
      const productId = await repository.insertProduct(
        tx,
        context.organizationId,
        values,
      );
      if (productId === "sku_taken") return failure("CONFLICT");
      await recordAudit(tx, {
        organizationId: context.organizationId,
        actorUserId: context.userId,
        entityType: "product",
        entityId: productId,
        action: "create",
        diff: { before: null, after: { ...values, isActive: true } },
      });
      return { ok: true, productId };
    },
  );
}

// changed en false: el producto ya estaba así; no se escribe ni se audita.
export type UpdateProductResult =
  | { ok: true; changed: boolean }
  | Failure<"FORBIDDEN" | "NOT_FOUND" | "CONFLICT">
  | Failure<"VALIDATION_ERROR", { fields: ProductField[] }>;

export async function updateProduct(
  context: AuthContext,
  productId: string,
  input: ProductInput,
): Promise<UpdateProductResult> {
  const authorized = authorize(context, { role: "admin" });
  if (!authorized.ok) return authorized;
  if (!productIdSchema.safeParse(productId).success) {
    return { ok: false, code: "VALIDATION_ERROR", fields: [] };
  }
  const validated = validateProductInput(input);
  if (!validated.ok) return validated;
  const { values } = validated;

  return repository.withTransaction(
    async (tx): Promise<UpdateProductResult> => {
      const current = await repository.findProduct(
        context.organizationId,
        productId,
        tx,
        { forUpdate: true },
      );
      if (!current) return failure("NOT_FOUND");

      const changedFields = PRODUCT_FIELDS.filter(
        (field) => current[field] !== values[field],
      );
      if (changedFields.length === 0) return { ok: true, changed: false };

      const before = Object.fromEntries(
        changedFields.map((field) => [field, current[field]]),
      );
      const after = Object.fromEntries(
        changedFields.map((field) => [field, values[field]]),
      );
      const updated = await repository.updateProductValues(
        tx,
        productId,
        after,
      );
      if (updated === "sku_taken") return failure("CONFLICT");
      await recordAudit(tx, {
        organizationId: context.organizationId,
        actorUserId: context.userId,
        entityType: "product",
        entityId: productId,
        action: "update",
        diff: { before, after },
      });
      return { ok: true, changed: true };
    },
  );
}

export type ProductActiveResult =
  | { ok: true; changed: boolean }
  | Failure<"FORBIDDEN" | "NOT_FOUND" | "VALIDATION_ERROR">;

async function setProductActive(
  context: AuthContext,
  productId: string,
  isActive: boolean,
): Promise<ProductActiveResult> {
  const authorized = authorize(context, { role: "admin" });
  if (!authorized.ok) return authorized;
  if (!productIdSchema.safeParse(productId).success) {
    return failure("VALIDATION_ERROR");
  }

  return repository.withTransaction(
    async (tx): Promise<ProductActiveResult> => {
      const current = await repository.findProduct(
        context.organizationId,
        productId,
        tx,
        { forUpdate: true },
      );
      if (!current) return failure("NOT_FOUND");
      if (current.isActive === isActive) return { ok: true, changed: false };

      await repository.updateProductActive(tx, productId, isActive);
      await recordAudit(tx, {
        organizationId: context.organizationId,
        actorUserId: context.userId,
        entityType: "product",
        entityId: productId,
        action: isActive ? "reactivate" : "deactivate",
        diff: {
          before: { isActive: current.isActive },
          after: { isActive },
        },
      });
      return { ok: true, changed: true };
    },
  );
}

export function deactivateProduct(
  context: AuthContext,
  productId: string,
): Promise<ProductActiveResult> {
  return setProductActive(context, productId, false);
}

export function reactivateProduct(
  context: AuthContext,
  productId: string,
): Promise<ProductActiveResult> {
  return setProductActive(context, productId, true);
}

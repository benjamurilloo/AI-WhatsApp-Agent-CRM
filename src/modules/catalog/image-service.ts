import { z } from "zod";
import { countRecentUserChanges, recordAudit } from "@/modules/audit";
import { authorize, type AuthContext } from "@/modules/organizations";
import { failure, type Failure } from "@/shared/errors";
import {
  IMAGE_SLOT_WAIT_MS,
  processProductImage,
  withImageSlot,
  type ImageRejection,
} from "./image-processing";
import * as images from "./image-repository";
import * as repository from "./repository";
import { PRODUCT_IMAGE_LIMITS } from "./schema";

// Imagen principal de producto (FR-PROD-16 a 18; ADR 0018; brief-17.5). Un admin la sube, la
// reemplaza y la quita; admin y viewer la ven. Cada cambio se audita como update del producto, con
// el campo image y un resumen del hash y el tamaño, nunca los bytes (D-8).

const productIdSchema = z.uuid();

// D-5: subidas por usuario en la ventana, contadas sobre la auditoría.
export const IMAGE_UPLOAD_RATE = { uploads: 20, windowSeconds: 600 } as const;

export const IMAGE_UPLOAD_MAX_BYTES = PRODUCT_IMAGE_LIMITS.uploadBytes;

export type ProductImageVersion = {
  sha256: string;
  sizeKb: number;
  width: number;
  height: number;
};

function toVersion(row: images.ImageVersionRow): ProductImageVersion {
  return {
    sha256: row.sha256,
    sizeKb: Math.ceil(row.bytes / 1024),
    width: row.width,
    height: row.height,
  };
}

// «a1b2c3d4, 182 KB»: identifica la imagen en el historial sin guardar nada de su contenido.
function auditLabel(row: images.ImageVersionRow | undefined): string | null {
  if (!row) return null;
  return `${row.sha256.slice(0, 8)}, ${Math.ceil(row.bytes / 1024)} KB`;
}

export type ImageUploadRejection = ImageRejection | "too_large" | "empty";

// Demasiadas subidas del usuario (user_limit, 429) o el procesamiento ocupado (busy, 503).
export type ImageUploadThrottled = Failure<
  "RATE_LIMITED",
  { cause: "user_limit" | "busy"; retryAfterSeconds: number }
>;

export type ImageUploadCheck =
  | { ok: true }
  | Failure<"FORBIDDEN" | "NOT_FOUND" | "VALIDATION_ERROR">
  | ImageUploadThrottled;

// Lo que se comprueba antes de leer el cuerpo de la subida (invariante 2): el rol, el producto de
// la organización y el límite de tasa. La sesión y el Origin los comprueba la ruta antes.
export async function checkProductImageUpload(
  context: AuthContext,
  productId: string,
): Promise<ImageUploadCheck> {
  const authorized = authorize(context, { role: "admin" });
  if (!authorized.ok) return authorized;
  if (!productIdSchema.safeParse(productId).success) {
    return failure("NOT_FOUND");
  }
  const product = await repository.findProduct(
    context.organizationId,
    productId,
  );
  if (!product) return failure("NOT_FOUND");

  const recent = await countRecentUserChanges({
    organizationId: context.organizationId,
    actorUserId: context.userId,
    entityType: "product",
    field: "image",
    windowSeconds: IMAGE_UPLOAD_RATE.windowSeconds,
  });
  if (recent.total >= IMAGE_UPLOAD_RATE.uploads) {
    return {
      ok: false,
      code: "RATE_LIMITED",
      cause: "user_limit",
      retryAfterSeconds: recent.oldestLeavesInSeconds,
    };
  }
  return { ok: true };
}

export type UploadProductImageResult =
  | { ok: true; version: ProductImageVersion }
  | Exclude<ImageUploadCheck, { ok: true }>
  | Failure<"VALIDATION_ERROR", { reason: ImageUploadRejection }>;

export async function uploadProductImage(
  context: AuthContext,
  productId: string,
  input: Buffer,
): Promise<UploadProductImageResult> {
  // Se repite aunque la ruta ya lo haya comprobado: el servicio no confía en quien lo llama.
  const checked = await checkProductImageUpload(context, productId);
  if (!checked.ok) return checked;
  if (input.length === 0) {
    return { ok: false, code: "VALIDATION_ERROR", reason: "empty" };
  }
  if (input.length > IMAGE_UPLOAD_MAX_BYTES) {
    return { ok: false, code: "VALIDATION_ERROR", reason: "too_large" };
  }

  const slot = await withImageSlot(() => processProductImage(input));
  if (!slot.ok) {
    return {
      ok: false,
      code: "RATE_LIMITED",
      cause: "busy",
      retryAfterSeconds: Math.ceil(IMAGE_SLOT_WAIT_MS / 1000),
    };
  }
  const processed = slot.value;
  if (!processed.ok) {
    return { ok: false, code: "VALIDATION_ERROR", reason: processed.reason };
  }

  return repository.withTransaction(
    async (tx): Promise<UploadProductImageResult> => {
      // FOR UPDATE: dos reemplazos del mismo producto no se pisan, y el producto sigue siendo de
      // la organización al escribir.
      const product = await repository.findProduct(
        context.organizationId,
        productId,
        tx,
        { forUpdate: true },
      );
      if (!product) return failure("NOT_FOUND");
      const previous = await images.deleteMainImage(
        tx,
        context.organizationId,
        productId,
      );
      await images.insertMainImage(
        tx,
        context.organizationId,
        productId,
        processed.processed,
        context.userId,
      );
      const current: images.ImageVersionRow = {
        productId,
        sha256: processed.processed.sha256,
        bytes: processed.processed.image.length,
        width: processed.processed.width,
        height: processed.processed.height,
      };
      await recordAudit(tx, {
        organizationId: context.organizationId,
        actorUserId: context.userId,
        entityType: "product",
        entityId: productId,
        action: "update",
        diff: {
          before: { image: auditLabel(previous) },
          after: { image: auditLabel(current) },
        },
      });
      return { ok: true, version: toVersion(current) };
    },
  );
}

export type RemoveProductImageResult =
  | { ok: true; changed: boolean }
  | Failure<"FORBIDDEN" | "NOT_FOUND" | "VALIDATION_ERROR">;

export async function removeProductImage(
  context: AuthContext,
  productId: string,
): Promise<RemoveProductImageResult> {
  const authorized = authorize(context, { role: "admin" });
  if (!authorized.ok) return authorized;
  if (!productIdSchema.safeParse(productId).success) {
    return failure("VALIDATION_ERROR");
  }
  return repository.withTransaction(
    async (tx): Promise<RemoveProductImageResult> => {
      const product = await repository.findProduct(
        context.organizationId,
        productId,
        tx,
        { forUpdate: true },
      );
      if (!product) return failure("NOT_FOUND");
      const previous = await images.deleteMainImage(
        tx,
        context.organizationId,
        productId,
      );
      if (!previous) return { ok: true, changed: false };
      await recordAudit(tx, {
        organizationId: context.organizationId,
        actorUserId: context.userId,
        entityType: "product",
        entityId: productId,
        action: "update",
        diff: {
          before: { image: auditLabel(previous) },
          after: { image: null },
        },
      });
      return { ok: true, changed: true };
    },
  );
}

// Versiones de las imágenes de varios productos, para la lista y la ficha: sin bytes. Un id que
// no es de la organización simplemente no aparece.
export async function getProductImageVersions(
  context: AuthContext,
  productIds: string[],
): Promise<
  | { ok: true; versions: Map<string, ProductImageVersion> }
  | Failure<"FORBIDDEN">
> {
  const authorized = authorize(context);
  if (!authorized.ok) return authorized;
  const valid = productIds.filter(
    (id) => productIdSchema.safeParse(id).success,
  );
  const rows = await images.findImageVersions(context.organizationId, valid);
  return {
    ok: true,
    versions: new Map(rows.map((row) => [row.productId, toVersion(row)])),
  };
}

export type ProductImageVariant = images.ImageVariant;

// Los bytes de la imagen o de su miniatura (D-6). Sin imagen, de otra organización, inexistente o
// con un id inválido: el mismo NOT_FOUND.
export async function getProductImageFile(
  context: AuthContext,
  productId: string,
  variant: ProductImageVariant,
): Promise<
  | { ok: true; bytes: Buffer; sha256: string }
  | Failure<"FORBIDDEN" | "NOT_FOUND">
> {
  const authorized = authorize(context);
  if (!authorized.ok) return authorized;
  if (!productIdSchema.safeParse(productId).success) {
    return failure("NOT_FOUND");
  }
  const file = await images.findImageBytes(
    context.organizationId,
    productId,
    variant,
  );
  if (!file) return failure("NOT_FOUND");
  return { ok: true, ...file };
}

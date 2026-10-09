import { and, eq, inArray, sql } from "drizzle-orm";
import { getDb, type Db, type DbTransaction } from "@/shared/db";
import type { ProcessedImage } from "./image-processing";
import { productImages } from "./schema";

// Acceso a product_images (brief-17.5, D-3). Toda consulta filtra por organization_id en SQL. Las
// lecturas de la versión no traen los bytes: solo la ruta que sirve la imagen los lee.

type Executor = Db | DbTransaction;

// La imagen principal. La galería, si llega, suma posiciones (ADR 0018, punto 2).
const MAIN_POSITION = 0;

export type ImageVersionRow = {
  productId: string;
  sha256: string;
  bytes: number;
  width: number;
  height: number;
};

const versionColumns = {
  productId: productImages.productId,
  sha256: productImages.sha256,
  bytes: sql<number>`octet_length(${productImages.image})`.mapWith(Number),
  width: productImages.width,
  height: productImages.height,
};

export async function findImageVersions(
  organizationId: string,
  productIds: string[],
  executor: Executor = getDb(),
): Promise<ImageVersionRow[]> {
  if (productIds.length === 0) return [];
  return executor
    .select(versionColumns)
    .from(productImages)
    .where(
      and(
        eq(productImages.organizationId, organizationId),
        inArray(productImages.productId, productIds),
        eq(productImages.position, MAIN_POSITION),
      ),
    );
}

export type ImageVariant = "image" | "thumbnail";

export async function findImageBytes(
  organizationId: string,
  productId: string,
  variant: ImageVariant,
): Promise<{ bytes: Buffer; sha256: string } | undefined> {
  const rows = await getDb()
    .select({
      bytes:
        variant === "image" ? productImages.image : productImages.thumbnail,
      sha256: productImages.sha256,
    })
    .from(productImages)
    .where(
      and(
        eq(productImages.organizationId, organizationId),
        eq(productImages.productId, productId),
        eq(productImages.position, MAIN_POSITION),
      ),
    )
    .limit(1);
  return rows[0];
}

// Quitar es borrar la fila; devuelve la que había, para la auditoría.
export async function deleteMainImage(
  tx: DbTransaction,
  organizationId: string,
  productId: string,
): Promise<ImageVersionRow | undefined> {
  const rows = await tx
    .delete(productImages)
    .where(
      and(
        eq(productImages.organizationId, organizationId),
        eq(productImages.productId, productId),
        eq(productImages.position, MAIN_POSITION),
      ),
    )
    .returning(versionColumns);
  return rows[0];
}

export async function insertMainImage(
  tx: DbTransaction,
  organizationId: string,
  productId: string,
  image: ProcessedImage,
  createdBy: string,
): Promise<void> {
  await tx.insert(productImages).values({
    organizationId,
    productId,
    position: MAIN_POSITION,
    image: image.image,
    thumbnail: image.thumbnail,
    sha256: image.sha256,
    width: image.width,
    height: image.height,
    createdBy,
  });
}

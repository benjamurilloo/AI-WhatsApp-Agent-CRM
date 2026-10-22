import { getProductVariantsForService } from "@/modules/catalog";
import { getExchangeSetup } from "@/modules/fx";
import {
  getCatalogProductAvailableForService,
  searchCatalogAvailableForService,
  type ServiceCatalogProduct,
} from "@/modules/inventory";
import { hasCapability } from "@/modules/organizations";
import {
  parseLimit,
  parseQuery,
  PRODUCTS_DEFAULT_LIMIT,
  PRODUCTS_MAX_LIMIT,
  type ReadField,
} from "../../v1/contract";
import { serveRead } from "../../v1/serve";
import {
  PRODUCT_CONDITIONS_V3,
  READ_CONTRACT_VERSION_V3,
  toContractProductV3,
  type ContractProductV3,
} from "../contract";

// Productos de la API de lectura v3 (brief-29.8, D-2): los parámetros, errores y borde de v2, más los
// usados y los filtros model_id y condition. Los productos de servicio siguen fuera. Fuera de route.ts
// para que los tests de integración le pasen la hora. Las rutas del log son fijas: nunca llevan el id
// ni la búsqueda.

export const PRODUCTS_ROUTE_V3 = "/api/read/v3/products";
export const PRODUCT_ROUTE_V3 = "/api/read/v3/products/{product_id}";

export const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type ProductCondition = (typeof PRODUCT_CONDITIONS_V3)[number];

type Parsed<T> = { ok: true; value: T } | { ok: false; field: ReadField };

function parseModelId(raw: string | null): Parsed<string | null> {
  if (raw === null) return { ok: true, value: null };
  return UUID.test(raw)
    ? { ok: true, value: raw.toLowerCase() }
    : { ok: false, field: "model_id" };
}

function parseCondition(raw: string | null): Parsed<ProductCondition | null> {
  if (raw === null) return { ok: true, value: null };
  return (PRODUCT_CONDITIONS_V3 as readonly string[]).includes(raw)
    ? { ok: true, value: raw as ProductCondition }
    : { ok: false, field: "condition" };
}

// El producto del contrato, con su variante y el precio convertido. Una lectura de la cotización por
// respuesta: todos los precios de una respuesta usan la misma.
export async function toContractProductsV3(
  organizationId: string,
  products: ServiceCatalogProduct[],
  now: Date,
): Promise<ContractProductV3[]> {
  if (products.length === 0) return [];
  const [variants, setup] = await Promise.all([
    getProductVariantsForService(organizationId, products),
    getExchangeSetup(organizationId, undefined, now),
  ]);
  return products.map((product) =>
    toContractProductV3(product, variants?.get(product.id) ?? null, setup),
  );
}

// GET /api/read/v3/products?q=…&limit=…&model_id=…&condition=…: q obligatorio, como en v2.
export function handleProductSearchV3(
  request: Request,
  now: Date = new Date(),
): Promise<Response> {
  return serveRead(
    request,
    PRODUCTS_ROUTE_V3,
    "read",
    now,
    async (caller, url) => {
      const query = parseQuery(url.searchParams.get("q"), { required: true });
      const limit = parseLimit(url.searchParams.get("limit"), {
        defaultLimit: PRODUCTS_DEFAULT_LIMIT,
        maxLimit: PRODUCTS_MAX_LIMIT,
      });
      const modelId = parseModelId(url.searchParams.get("model_id"));
      const condition = parseCondition(url.searchParams.get("condition"));
      const fields = [query, limit, modelId, condition].flatMap((parsed) =>
        parsed.ok ? [] : [parsed.field],
      );
      if (
        !query.ok ||
        !limit.ok ||
        !modelId.ok ||
        !condition.ok ||
        query.value === null
      ) {
        return { ok: false, code: "VALIDATION_ERROR", fields };
      }
      // Sin la capacidad variants no hay modelos: filtrar por uno no encuentra nada (invariante del
      // brief: sin una capacidad, su parte no aparece).
      const noModels =
        modelId.value !== null &&
        !(await hasCapability(caller.organizationId, "variants"));
      const products = noModels
        ? []
        : await searchCatalogAvailableForService(
            caller.organizationId,
            { text: query.value, limit: limit.value },
            {
              includeUsed: true,
              modelId: modelId.value ?? undefined,
              condition: condition.value ?? undefined,
            },
          );
      return {
        ok: true,
        status: 200,
        body: {
          contract_version: READ_CONTRACT_VERSION_V3,
          items: await toContractProductsV3(
            caller.organizationId,
            products,
            now,
          ),
        },
      };
    },
  );
}

// GET /api/read/v3/products/{product_id}: inactivo, de servicio, de otra organización o inexistente
// dan el mismo 404, como en v2. El usado se encuentra.
export function handleProductDetailV3(
  request: Request,
  productId: string,
  now: Date = new Date(),
): Promise<Response> {
  return serveRead(request, PRODUCT_ROUTE_V3, "read", now, async (caller) => {
    if (!UUID.test(productId)) {
      return { ok: false, code: "VALIDATION_ERROR", fields: ["product_id"] };
    }
    const product = await getCatalogProductAvailableForService(
      caller.organizationId,
      productId,
      { includeUsed: true },
    );
    if (!product) return { ok: false, code: "NOT_FOUND" };
    const [contract] = await toContractProductsV3(
      caller.organizationId,
      [product],
      now,
    );
    return {
      ok: true,
      status: 200,
      body: { contract_version: READ_CONTRACT_VERSION_V3, product: contract! },
    };
  });
}

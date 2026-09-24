import {
  getCatalogProductForService,
  searchCatalogForService,
} from "@/modules/inventory";
import {
  parseLimit,
  parseQuery,
  PRODUCTS_DEFAULT_LIMIT,
  PRODUCTS_MAX_LIMIT,
  READ_CONTRACT_VERSION,
  toContractProduct,
} from "../contract";
import { serveRead } from "../serve";

// Productos de la API de lectura v1 (brief-11.3, D-4; FR-API-01). Fuera de route.ts para que los
// tests de integración le pasen la hora. Las rutas del log son fijas: nunca llevan el id ni la
// búsqueda.

export const PRODUCTS_ROUTE = "/api/read/v1/products";
export const PRODUCT_ROUTE = "/api/read/v1/products/{product_id}";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// GET /api/read/v1/products?q=…&limit=…: productos activos por palabras o SKU exacto, por
// relevancia.
export function handleProductSearch(
  request: Request,
  now: Date = new Date(),
): Promise<Response> {
  return serveRead(request, PRODUCTS_ROUTE, now, async (caller, url) => {
    const query = parseQuery(url.searchParams.get("q"), { required: true });
    const limit = parseLimit(url.searchParams.get("limit"), {
      defaultLimit: PRODUCTS_DEFAULT_LIMIT,
      maxLimit: PRODUCTS_MAX_LIMIT,
    });
    const fields = [query, limit].flatMap((parsed) =>
      parsed.ok ? [] : [parsed.field],
    );
    if (!query.ok || !limit.ok || query.value === null) {
      return { ok: false, code: "VALIDATION_ERROR", fields };
    }
    const products = await searchCatalogForService(caller.organizationId, {
      text: query.value,
      limit: limit.value,
    });
    return {
      ok: true,
      status: 200,
      body: {
        contract_version: READ_CONTRACT_VERSION,
        items: products.map(toContractProduct),
      },
    };
  });
}

// GET /api/read/v1/products/{product_id}: un producto activo. Inactivo, de otra organización o
// inexistente dan el mismo 404.
export function handleProductDetail(
  request: Request,
  productId: string,
  now: Date = new Date(),
): Promise<Response> {
  return serveRead(request, PRODUCT_ROUTE, now, async (caller) => {
    if (!UUID.test(productId)) {
      return { ok: false, code: "VALIDATION_ERROR", fields: ["product_id"] };
    }
    const product = await getCatalogProductForService(
      caller.organizationId,
      productId,
    );
    if (!product) return { ok: false, code: "NOT_FOUND" };
    return {
      ok: true,
      status: 200,
      body: {
        contract_version: READ_CONTRACT_VERSION,
        product: toContractProduct(product),
      },
    };
  });
}

import {
  getCatalogProductAvailableForService,
  searchCatalogAvailableForService,
} from "@/modules/inventory";
import {
  parseLimit,
  parseQuery,
  PRODUCTS_DEFAULT_LIMIT,
  PRODUCTS_MAX_LIMIT,
  toContractProduct,
} from "../../v1/contract";
import { serveRead } from "../../v1/serve";
import { READ_CONTRACT_VERSION_V2 } from "../contract";

// Productos de la API de lectura v2 (brief-19.4, D-12): los mismos parámetros, errores y borde que
// v1, con el estado de stock de lo disponible. Fuera de route.ts para que los tests de integración
// le pasen la hora. Las rutas del log son fijas: nunca llevan el id ni la búsqueda.

export const PRODUCTS_ROUTE_V2 = "/api/read/v2/products";
export const PRODUCT_ROUTE_V2 = "/api/read/v2/products/{product_id}";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// GET /api/read/v2/products?q=…&limit=…: como en v1.
export function handleProductSearchV2(
  request: Request,
  now: Date = new Date(),
): Promise<Response> {
  return serveRead(
    request,
    PRODUCTS_ROUTE_V2,
    "read",
    now,
    async (caller, url) => {
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
      const products = await searchCatalogAvailableForService(
        caller.organizationId,
        { text: query.value, limit: limit.value },
      );
      return {
        ok: true,
        status: 200,
        body: {
          contract_version: READ_CONTRACT_VERSION_V2,
          items: products.map(toContractProduct),
        },
      };
    },
  );
}

// GET /api/read/v2/products/{product_id}: como en v1. Inactivo, de otra organización o
// inexistente dan el mismo 404.
export function handleProductDetailV2(
  request: Request,
  productId: string,
  now: Date = new Date(),
): Promise<Response> {
  return serveRead(request, PRODUCT_ROUTE_V2, "read", now, async (caller) => {
    if (!UUID.test(productId)) {
      return { ok: false, code: "VALIDATION_ERROR", fields: ["product_id"] };
    }
    const product = await getCatalogProductAvailableForService(
      caller.organizationId,
      productId,
    );
    if (!product) return { ok: false, code: "NOT_FOUND" };
    return {
      ok: true,
      status: 200,
      body: {
        contract_version: READ_CONTRACT_VERSION_V2,
        product: toContractProduct(product),
      },
    };
  });
}

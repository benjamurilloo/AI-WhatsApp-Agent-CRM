import { getProductStockForService } from "@/modules/inventory";
import { toContractProductStock } from "../../../contract";
import { serveRead } from "../../../serve";

// Cantidad disponible de un producto, de la API de lectura v1 (brief-16.6, D-2 a D-5;
// FR-API-09). Una ruta nueva, compatible dentro de v1: las de productos no cambian y siguen sin
// la cantidad. Alcance `read`, el mismo de los productos. Fuera de route.ts para que los tests de
// integración le pasen la hora. La ruta del log es fija: nunca lleva el id.

export const PRODUCT_STOCK_ROUTE = "/api/read/v1/products/{product_id}/stock";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// GET /api/read/v1/products/{product_id}/stock: la cantidad de un producto activo. Inactivo, de
// otra organización o inexistente dan el mismo 404, como el detalle.
export function handleProductStock(
  request: Request,
  productId: string,
  now: Date = new Date(),
): Promise<Response> {
  return serveRead(
    request,
    PRODUCT_STOCK_ROUTE,
    "read",
    now,
    async (caller) => {
      if (!UUID.test(productId)) {
        return { ok: false, code: "VALIDATION_ERROR", fields: ["product_id"] };
      }
      const stock = await getProductStockForService(
        caller.organizationId,
        productId,
      );
      if (!stock) return { ok: false, code: "NOT_FOUND" };
      return { ok: true, status: 200, body: toContractProductStock(stock) };
    },
  );
}

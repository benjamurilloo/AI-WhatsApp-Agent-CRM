import { getProductBalanceForService } from "@/modules/inventory";
import { serveRead } from "../../../../v1/serve";
import { toContractProductStockV2 } from "../../../contract";

// El stock de un producto, de la API de lectura v2 (brief-19.4, D-12): el saldo físico, lo
// reservado y lo disponible, con el estado de lo disponible. Alcance `read`, como en v1. Fuera de
// route.ts para que los tests de integración le pasen la hora. La ruta del log es fija.

export const PRODUCT_STOCK_ROUTE_V2 =
  "/api/read/v2/products/{product_id}/stock";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// GET /api/read/v2/products/{product_id}/stock: inactivo, de otra organización o inexistente dan
// el mismo 404, como en v1.
export function handleProductStockV2(
  request: Request,
  productId: string,
  now: Date = new Date(),
): Promise<Response> {
  return serveRead(
    request,
    PRODUCT_STOCK_ROUTE_V2,
    "read",
    now,
    async (caller) => {
      if (!UUID.test(productId)) {
        return { ok: false, code: "VALIDATION_ERROR", fields: ["product_id"] };
      }
      const stock = await getProductBalanceForService(
        caller.organizationId,
        productId,
      );
      if (!stock) return { ok: false, code: "NOT_FOUND" };
      return { ok: true, status: 200, body: toContractProductStockV2(stock) };
    },
  );
}

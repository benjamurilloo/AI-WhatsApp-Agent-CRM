import { getProductBalanceForService } from "@/modules/inventory";
import { serveRead } from "../../../../v1/serve";
import { toContractProductStockV3 } from "../../../contract";
import { UUID } from "../../handler";

// El stock de un producto, de la API de lectura v3 (brief-29.8, D-2): el de v2, con los usados. Para un
// producto por unidad, lo disponible son sus unidades available (invariante de la 29.5). Fuera de
// route.ts para que los tests de integración le pasen la hora. La ruta del log es fija.

export const PRODUCT_STOCK_ROUTE_V3 =
  "/api/read/v3/products/{product_id}/stock";

export function handleProductStockV3(
  request: Request,
  productId: string,
  now: Date = new Date(),
): Promise<Response> {
  return serveRead(
    request,
    PRODUCT_STOCK_ROUTE_V3,
    "read",
    now,
    async (caller) => {
      if (!UUID.test(productId)) {
        return { ok: false, code: "VALIDATION_ERROR", fields: ["product_id"] };
      }
      const stock = await getProductBalanceForService(
        caller.organizationId,
        productId,
        { includeUsed: true },
      );
      if (!stock) return { ok: false, code: "NOT_FOUND" };
      return { ok: true, status: 200, body: toContractProductStockV3(stock) };
    },
  );
}

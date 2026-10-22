import { getActiveProductForService } from "@/modules/catalog";
import { getExchangeSetup } from "@/modules/fx";
import { listAvailableUnitsForService } from "@/modules/inventory";
import { serveRead } from "../../../../v1/serve";
import {
  READ_CONTRACT_VERSION_V3,
  sortUnitsByPrice,
  toContractUnitV3,
} from "../../../contract";
import { UUID } from "../../handler";

// Las unidades disponibles de un producto, de la API de lectura v3 (brief-29.8, D-3): grado, batería y
// precio (el propio o el del producto), con el convertido, de menor a mayor precio. Nunca el IMEI, el
// costo, el origen ni una unidad en otro estado. Un producto por cantidad da la lista vacía; uno
// inexistente, inactivo, de servicio o de otra organización, el 404 del detalle. Fuera de route.ts para
// que los tests de integración le pasen la hora. La ruta del log es fija.

export const PRODUCT_UNITS_ROUTE_V3 =
  "/api/read/v3/products/{product_id}/units";

export function handleProductUnitsV3(
  request: Request,
  productId: string,
  now: Date = new Date(),
): Promise<Response> {
  return serveRead(
    request,
    PRODUCT_UNITS_ROUTE_V3,
    "read",
    now,
    async (caller) => {
      if (!UUID.test(productId)) {
        return { ok: false, code: "VALIDATION_ERROR", fields: ["product_id"] };
      }
      const product = await getActiveProductForService(
        caller.organizationId,
        productId,
        { includeUsed: true },
      );
      if (!product) return { ok: false, code: "NOT_FOUND" };
      const units =
        product.tracking === "unit"
          ? await listAvailableUnitsForService(
              caller.organizationId,
              product.id,
            )
          : [];
      const setup =
        units.length > 0
          ? await getExchangeSetup(caller.organizationId, undefined, now)
          : null;
      const items = units.map((unit) =>
        toContractUnitV3(unit, product.price, setup),
      );
      return {
        ok: true,
        status: 200,
        body: {
          contract_version: READ_CONTRACT_VERSION_V3,
          product_id: product.id,
          items: sortUnitsByPrice(items, product.price?.currency ?? null),
        },
      };
    },
  );
}

import { getExchangeSetup } from "@/modules/fx";
import { listRepairPricesForService } from "@/modules/service";
import { parseQuery } from "../../v1/contract";
import { serveRead } from "../../v1/serve";
import { toContractRepairListV3 } from "../contract";
import { UUID } from "../products/handler";

// Las reparaciones de un modelo, de la API de lectura v3 (brief-29.8.2, D-2 y U-4): los modelos activos
// que coinciden con q, o el de model_id, con los tipos activos que tienen precio para cada uno y su
// precio al cliente, nunca el costo. q o model_id, uno de los dos: ninguno o los dos son un 400 con los
// dos campos. Sin la capacidad repairs, lista vacía. Fuera de route.ts para que los tests de
// integración le pasen la hora. La ruta del log es fija: nunca lleva la búsqueda ni el id.

export const REPAIRS_ROUTE_V3 = "/api/read/v3/repairs";

// GET /api/read/v3/repairs?q=… o ?model_id=…
export function handleRepairsV3(
  request: Request,
  now: Date = new Date(),
): Promise<Response> {
  return serveRead(
    request,
    REPAIRS_ROUTE_V3,
    "read",
    now,
    async (caller, url) => {
      const rawModelId = url.searchParams.get("model_id");
      const query = parseQuery(url.searchParams.get("q"), { required: false });
      if (!query.ok) {
        return { ok: false, code: "VALIDATION_ERROR", fields: ["q"] };
      }
      if ((query.value === null) === (rawModelId === null)) {
        return {
          ok: false,
          code: "VALIDATION_ERROR",
          fields: ["q", "model_id"],
        };
      }
      if (rawModelId !== null && !UUID.test(rawModelId)) {
        return { ok: false, code: "VALIDATION_ERROR", fields: ["model_id"] };
      }
      const models = await listRepairPricesForService(
        caller.organizationId,
        query.value !== null
          ? { text: query.value }
          : { modelId: rawModelId!.toLowerCase() },
      );
      // Una lectura de la cotización por respuesta, solo si hay precios que convertir.
      const setup =
        models.length > 0
          ? await getExchangeSetup(caller.organizationId, undefined, now)
          : null;
      return {
        ok: true,
        status: 200,
        body: toContractRepairListV3(models, setup),
      };
    },
  );
}

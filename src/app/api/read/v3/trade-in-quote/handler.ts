import { getExchangeSetup } from "@/modules/fx";
import { quoteTradeInForService } from "@/modules/tradeins";
import type { ReadField } from "../../v1/contract";
import { serveRead } from "../../v1/serve";
import { toContractTradeInQuoteV3 } from "../contract";
import { UUID } from "../products/handler";

// La cotización orientativa de un usado, de la API de lectura v3 (brief-29.8.3, D-3, U-2 y U-4). El
// agente manda el producto usado, la salud de la batería y cada punto activo del checklist en passed o
// en failed; el CRM calcula con la regla de la pantalla del admin y devuelve solo el rango redondeado,
// o uno de tres motivos. No escribe nada. Alcance read: no lleva cliente. Un producto inexistente,
// inactivo, de servicio o de otra organización da el 404 del detalle de producto. Fuera de route.ts para
// que los tests de integración le pasen la hora. La ruta del log es fija: nunca lleva los parámetros.

export const TRADE_IN_QUOTE_ROUTE_V3 = "/api/read/v3/trade-in-quote";

// Un tope por lista, holgado sobre los 40 puntos que admite una organización (MAX_CHECKLIST_ITEMS),
// para que una consulta no cargue miles de ids.
export const TRADE_IN_ANSWERS_MAX = 100;

const BATTERY = /^(0|[1-9][0-9]?|100)$/;

type Parsed<T> = { ok: true; value: T } | { ok: false; field: ReadField };

// Los ids de una lista, separados por coma. Ausente o vacía es una lista vacía; un id sin forma de uuid,
// un hueco entre comas o más del tope son un 400. Se repite el parámetro: cuentan todas sus apariciones.
export function parseAnswerIds(
  values: string[],
  field: "passed" | "failed",
): Parsed<string[]> {
  const ids = values
    .filter((value) => value !== "")
    .flatMap((value) => value.split(","));
  if (ids.length > TRADE_IN_ANSWERS_MAX || !ids.every((id) => UUID.test(id))) {
    return { ok: false, field };
  }
  return { ok: true, value: [...new Set(ids.map((id) => id.toLowerCase()))] };
}

export function parseBatteryHealth(raw: string | null): Parsed<number> {
  return raw !== null && BATTERY.test(raw)
    ? { ok: true, value: Number(raw) }
    : { ok: false, field: "battery_health" };
}

// GET /api/read/v3/trade-in-quote?product_id=…&battery_health=…&passed=…&failed=…
export function handleTradeInQuoteV3(
  request: Request,
  now: Date = new Date(),
): Promise<Response> {
  return serveRead(
    request,
    TRADE_IN_QUOTE_ROUTE_V3,
    "read",
    now,
    async (caller, url) => {
      const rawProductId = url.searchParams.get("product_id");
      const productId: Parsed<string> =
        rawProductId !== null && UUID.test(rawProductId)
          ? { ok: true, value: rawProductId.toLowerCase() }
          : { ok: false, field: "product_id" };
      const battery = parseBatteryHealth(
        url.searchParams.get("battery_health"),
      );
      const passed = parseAnswerIds(
        url.searchParams.getAll("passed"),
        "passed",
      );
      const failed = parseAnswerIds(
        url.searchParams.getAll("failed"),
        "failed",
      );
      if (!productId.ok || !battery.ok || !passed.ok || !failed.ok) {
        return {
          ok: false,
          code: "VALIDATION_ERROR",
          fields: [productId, battery, passed, failed].flatMap((parsed) =>
            parsed.ok ? [] : [parsed.field],
          ),
        };
      }
      // Un punto no puede haber pasado y fallado a la vez (U-2).
      const failedSet = new Set(failed.value);
      if (passed.value.some((id) => failedSet.has(id))) {
        return {
          ok: false,
          code: "VALIDATION_ERROR",
          fields: ["passed", "failed"],
        };
      }
      const result = await quoteTradeInForService(caller.organizationId, {
        productId: productId.value,
        batteryHealth: battery.value,
        passed: passed.value,
        failed: failed.value,
      });
      if (!result.ok && result.code === "NOT_FOUND") {
        return { ok: false, code: "NOT_FOUND" };
      }
      // Una lectura de la cotización por respuesta, solo si hay un rango que convertir.
      const setup = result.ok
        ? await getExchangeSetup(caller.organizationId, undefined, now)
        : null;
      return {
        ok: true,
        status: 200,
        body: toContractTradeInQuoteV3(result, setup),
      };
    },
  );
}

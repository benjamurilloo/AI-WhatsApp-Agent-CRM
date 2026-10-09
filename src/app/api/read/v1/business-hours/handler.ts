import { getBusinessHoursForService } from "@/modules/knowledge";
import { toContractBusinessHours } from "../contract";
import { serveRead } from "../serve";

// Horario de atención de la API de lectura v1 (brief-17.4, D-6; FR-API-10). Fuera de route.ts
// para que los tests de integración le pasen la hora. Acepta credenciales de alcance `read`, como
// la información del negocio. Sin parámetros: los que lleguen se ignoran, como en client-tags.

export const BUSINESS_HOURS_ROUTE = "/api/read/v1/business-hours";

// GET /api/read/v1/business-hours: si el negocio está abierto ahora, el próximo cambio, los
// próximos 7 días con el día especial aplicado, el horario semanal y los días especiales de los
// próximos 30 días. now es el reloj del límite de tasa; at, solo para los tests, el instante del
// cálculo, que en producción es now() de PostgreSQL (invariante 2).
export function handleBusinessHours(
  request: Request,
  now: Date = new Date(),
  at: Date | null = null,
): Promise<Response> {
  return serveRead(
    request,
    BUSINESS_HOURS_ROUTE,
    "read",
    now,
    async (caller) => {
      const hours = await getBusinessHoursForService(caller.organizationId, at);
      return { ok: true, status: 200, body: toContractBusinessHours(hours) };
    },
  );
}

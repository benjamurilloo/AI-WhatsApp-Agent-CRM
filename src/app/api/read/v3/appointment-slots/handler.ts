import {
  AGENT_SLOT_DAYS_MAX,
  listFreeSlotsForService,
} from "@/modules/appointments";
import type { ReadField } from "../../v1/contract";
import { serveRead } from "../../v1/serve";
import { toContractAppointmentSlotsV3 } from "../contract";

// Las franjas libres para el agente, de la API de lectura v3 (brief-29.10.2, D-2 y A-1): la fecha de hoy
// del negocio, la duración, los motivos activos y las franjas que puede pedir, desde from y por days días.
// Alcance read: no lleva clientes ni turnos. Sin la capacidad appointments, ninguna franja. Fuera de
// route.ts para que los tests de integración le pasen la hora. La ruta del log es fija: nunca lleva los
// parámetros.

export const APPOINTMENT_SLOTS_ROUTE_V3 = "/api/read/v3/appointment-slots";

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const DAYS = /^[1-9]\d?$/;

// GET /api/read/v3/appointment-slots?from=AAAA-MM-DD&days=N
export function handleAppointmentSlotsV3(
  request: Request,
  now: Date = new Date(),
): Promise<Response> {
  return serveRead(
    request,
    APPOINTMENT_SLOTS_ROUTE_V3,
    "read",
    now,
    async (caller, url) => {
      const rawFrom = url.searchParams.get("from");
      const rawDays = url.searchParams.get("days");
      const fields: ReadField[] = [];
      if (rawFrom !== null && !DATE.test(rawFrom)) fields.push("from");
      const days = rawDays === null ? AGENT_SLOT_DAYS_MAX : Number(rawDays);
      if (
        rawDays !== null &&
        (!DAYS.test(rawDays) || days > AGENT_SLOT_DAYS_MAX)
      ) {
        fields.push("days");
      }
      if (fields.length > 0) {
        return { ok: false, code: "VALIDATION_ERROR", fields };
      }
      // La fecha de calendario y que no sea anterior a hoy los decide el módulo, que conoce la zona.
      const result = await listFreeSlotsForService(caller.organizationId, {
        from: rawFrom,
        days,
      });
      if (!result.ok) {
        return { ok: false, code: "VALIDATION_ERROR", fields: [result.field] };
      }
      return {
        ok: true,
        status: 200,
        body: toContractAppointmentSlotsV3(result.slots),
      };
    },
  );
}

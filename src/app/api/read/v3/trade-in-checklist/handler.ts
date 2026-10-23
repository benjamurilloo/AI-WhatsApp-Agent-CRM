import { listTradeInChecklistForService } from "@/modules/tradeins";
import { serveRead } from "../../v1/serve";
import { toContractTradeInChecklistV3 } from "../contract";

// El checklist de un usado, de la API de lectura v3 (brief-29.8.3, D-2 y U-1): los puntos activos de la
// organización, en su orden, que el agente le pregunta al cliente antes de cotizar. Alcance read: es
// configuración del negocio. Sin la capacidad trade_ins, lista vacía. Fuera de route.ts para que los
// tests de integración le pasen la hora. La ruta del log es fija.

export const TRADE_IN_CHECKLIST_ROUTE_V3 = "/api/read/v3/trade-in-checklist";

// GET /api/read/v3/trade-in-checklist
export function handleTradeInChecklistV3(
  request: Request,
  now: Date = new Date(),
): Promise<Response> {
  return serveRead(
    request,
    TRADE_IN_CHECKLIST_ROUTE_V3,
    "read",
    now,
    async (caller) => ({
      ok: true,
      status: 200,
      body: toContractTradeInChecklistV3(
        await listTradeInChecklistForService(caller.organizationId),
      ),
    }),
  );
}

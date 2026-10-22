import { listCapabilitiesForService } from "@/modules/organizations";
import { serveRead } from "../../v1/serve";
import { toContractCapabilities } from "../contract";

// Las capacidades activas de la organización, de la API de lectura v3 (brief-29.8, D-5). Fuera de
// route.ts para que los tests de integración le pasen la hora. La ruta del log es fija.

export const CAPABILITIES_ROUTE_V3 = "/api/read/v3/capabilities";

export function handleCapabilitiesV3(
  request: Request,
  now: Date = new Date(),
): Promise<Response> {
  return serveRead(
    request,
    CAPABILITIES_ROUTE_V3,
    "read",
    now,
    async (caller) => ({
      ok: true,
      status: 200,
      body: toContractCapabilities(
        await listCapabilitiesForService(caller.organizationId),
      ),
    }),
  );
}

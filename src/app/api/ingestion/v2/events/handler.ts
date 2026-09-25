import {
  INGESTION_CONTRACT_VERSION_V2,
  recordIngestionEventV2,
} from "@/modules/ingestion";
import { serveIngestion, type IngestionEdge } from "../../v1/events/handler";

// Endpoint del contrato de ingestión v2 (brief-12.3, D-1). El borde es el de v1: modo de prueba,
// credencial, allowlist y límite de tasa compartido por credencial. Agrega la correlación, validada
// antes del límite (D-6), y el motivo del CONFLICT (D-7). Orden: modo de prueba, credencial,
// allowlist, correlación, límite de tasa, cuerpo y caso de uso.

export const INGESTION_ROUTE_V2 = "/api/ingestion/v2/events";

const V2: IngestionEdge = {
  route: INGESTION_ROUTE_V2,
  contractVersion: INGESTION_CONTRACT_VERSION_V2,
  record: recordIngestionEventV2,
  correlation: true,
  conflictReason: true,
};

export function handleIngestionEventV2(
  request: Request,
  now: Date = new Date(),
): Promise<Response> {
  return serveIngestion(V2, request, now);
}

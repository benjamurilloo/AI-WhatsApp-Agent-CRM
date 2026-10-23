import { handleTradeInChecklistV3 } from "./handler";

// GET /api/read/v3/trade-in-checklist (contrato de lectura v3, brief-29.8.3).
export function GET(request: Request): Promise<Response> {
  return handleTradeInChecklistV3(request);
}

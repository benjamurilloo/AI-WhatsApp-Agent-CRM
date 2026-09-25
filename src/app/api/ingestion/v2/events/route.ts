import { handleIngestionEventV2 } from "./handler";

// POST /api/ingestion/v2/events (contrato de ingestión v2, brief-12.3).
export function POST(request: Request): Promise<Response> {
  return handleIngestionEventV2(request);
}

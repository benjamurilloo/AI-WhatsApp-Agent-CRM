import { handleIngestionEvent } from "./handler";

// POST /api/ingestion/v1/events (contrato de ingestión v1, brief-6.5.3).
export function POST(request: Request): Promise<Response> {
  return handleIngestionEvent(request);
}

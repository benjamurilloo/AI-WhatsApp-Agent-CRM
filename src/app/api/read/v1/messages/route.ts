import { handleMessageHistory } from "./handler";

// GET /api/read/v1/messages (contrato de lectura v1, brief-12.4).
export function GET(request: Request): Promise<Response> {
  return handleMessageHistory(request);
}

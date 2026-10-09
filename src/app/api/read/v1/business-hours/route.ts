import { handleBusinessHours } from "./handler";

// GET /api/read/v1/business-hours (contrato de lectura v1, brief-17.4).
export function GET(request: Request): Promise<Response> {
  return handleBusinessHours(request);
}

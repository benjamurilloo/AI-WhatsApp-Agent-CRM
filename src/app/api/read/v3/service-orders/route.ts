import { handleServiceOrdersV3 } from "./handler";

// GET /api/read/v3/service-orders (contrato de lectura v3, brief-29.8.2).
export function GET(request: Request): Promise<Response> {
  return handleServiceOrdersV3(request);
}

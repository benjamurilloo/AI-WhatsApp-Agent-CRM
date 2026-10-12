import { handleProductSearchV2 } from "./handler";

// GET /api/read/v2/products (contrato de lectura v2, brief-19.4).
export function GET(request: Request): Promise<Response> {
  return handleProductSearchV2(request);
}

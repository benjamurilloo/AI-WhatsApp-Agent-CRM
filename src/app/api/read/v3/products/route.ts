import { handleProductSearchV3 } from "./handler";

// GET /api/read/v3/products (contrato de lectura v3, brief-29.8).
export function GET(request: Request): Promise<Response> {
  return handleProductSearchV3(request);
}

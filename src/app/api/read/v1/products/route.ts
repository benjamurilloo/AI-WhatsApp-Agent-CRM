import { handleProductSearch } from "./handler";

// GET /api/read/v1/products (contrato de lectura v1, brief-11.3).
export function GET(request: Request): Promise<Response> {
  return handleProductSearch(request);
}

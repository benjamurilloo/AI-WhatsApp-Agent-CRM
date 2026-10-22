import { handleRepairsV3 } from "./handler";

// GET /api/read/v3/repairs (contrato de lectura v3, brief-29.8.2).
export function GET(request: Request): Promise<Response> {
  return handleRepairsV3(request);
}

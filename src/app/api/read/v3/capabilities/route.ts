import { handleCapabilitiesV3 } from "./handler";

// GET /api/read/v3/capabilities (contrato de lectura v3, brief-29.8).
export function GET(request: Request): Promise<Response> {
  return handleCapabilitiesV3(request);
}

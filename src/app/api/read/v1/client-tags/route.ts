import { handleClientTagList } from "./handler";

// GET /api/read/v1/client-tags (contrato de lectura v1, brief-16.2).
export function GET(request: Request): Promise<Response> {
  return handleClientTagList(request);
}

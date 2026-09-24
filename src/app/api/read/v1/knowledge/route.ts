import { handleKnowledgeList } from "./handler";

// GET /api/read/v1/knowledge (contrato de lectura v1, brief-11.3).
export function GET(request: Request): Promise<Response> {
  return handleKnowledgeList(request);
}

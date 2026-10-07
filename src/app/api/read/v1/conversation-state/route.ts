import { handleConversationState } from "./handler";

// GET /api/read/v1/conversation-state (contrato de lectura v1, brief-16.3).
export function GET(request: Request): Promise<Response> {
  return handleConversationState(request);
}

import { listRecentMessagesForService } from "@/modules/conversations";
import {
  MESSAGES_DEFAULT_LIMIT,
  MESSAGES_MAX_LIMIT,
  parseConversationRef,
  parseLimit,
  READ_CONTRACT_VERSION,
  toContractHistoryMessage,
} from "../contract";
import { serveRead } from "../serve";

// Historial de la API de lectura v1 (brief-12.4, D-3 a D-8; FR-API-08). Fuera de route.ts para
// que los tests de integración le pasen la hora. Es la única ruta de la API que devuelve lo que
// escribió un cliente, así que acepta solo credenciales de alcance `context` (D-6), y la ruta del
// log es fija: nunca lleva la referencia de la conversación, que la genera el emisor (D-8).

export const MESSAGES_ROUTE = "/api/read/v1/messages";

// GET /api/read/v1/messages?conversation_ref=…&limit=…: los últimos mensajes de la conversación,
// del más viejo al más nuevo. Ajena o inexistente dan el mismo 404.
export function handleMessageHistory(
  request: Request,
  now: Date = new Date(),
): Promise<Response> {
  return serveRead(
    request,
    MESSAGES_ROUTE,
    "context",
    now,
    async (caller, url) => {
      const conversationRef = parseConversationRef(
        url.searchParams.get("conversation_ref"),
      );
      const limit = parseLimit(url.searchParams.get("limit"), {
        defaultLimit: MESSAGES_DEFAULT_LIMIT,
        maxLimit: MESSAGES_MAX_LIMIT,
      });
      if (!conversationRef.ok || !limit.ok) {
        const fields = [conversationRef, limit].flatMap((parsed) =>
          parsed.ok ? [] : [parsed.field],
        );
        return { ok: false, code: "VALIDATION_ERROR", fields };
      }
      const history = await listRecentMessagesForService(
        caller.organizationId,
        {
          channel: "whatsapp",
          conversationRef: conversationRef.value,
          limit: limit.value,
        },
      );
      if (!history.ok) return { ok: false, code: history.code };
      return {
        ok: true,
        status: 200,
        body: {
          contract_version: READ_CONTRACT_VERSION,
          items: history.messages.map(toContractHistoryMessage),
        },
      };
    },
  );
}

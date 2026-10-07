import { getAgentPauseForService } from "@/modules/conversations";
import { parseConversationRef, toContractConversationState } from "../contract";
import { serveRead } from "../serve";

// Marca de pausa de la API de lectura v1 (brief-16.3, D-3; FR-CONV-06). Fuera de route.ts para
// que los tests de integración le pasen la hora. Acepta solo credenciales de alcance `context`,
// las mismas que el historial: el agente la lee en cada turno, antes de responder. La ruta del
// log es fija y nunca lleva la referencia de la conversación, como el historial.

export const CONVERSATION_STATE_ROUTE = "/api/read/v1/conversation-state";

// GET /api/read/v1/conversation-state?conversation_ref=…: si un admin pausó al agente en esa
// conversación. Ajena o inexistente dan el mismo 404.
export function handleConversationState(
  request: Request,
  now: Date = new Date(),
): Promise<Response> {
  return serveRead(
    request,
    CONVERSATION_STATE_ROUTE,
    "context",
    now,
    async (caller, url) => {
      const conversationRef = parseConversationRef(
        url.searchParams.get("conversation_ref"),
      );
      if (!conversationRef.ok) {
        return {
          ok: false,
          code: "VALIDATION_ERROR",
          fields: [conversationRef.field],
        };
      }
      const state = await getAgentPauseForService(caller.organizationId, {
        channel: "whatsapp",
        conversationRef: conversationRef.value,
      });
      if (!state.ok) return { ok: false, code: state.code };
      return {
        ok: true,
        status: 200,
        body: toContractConversationState(state),
      };
    },
  );
}

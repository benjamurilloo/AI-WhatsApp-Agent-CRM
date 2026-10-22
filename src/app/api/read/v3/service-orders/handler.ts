import { getConversationClientForService } from "@/modules/conversations";
import {
  formatServiceOrderNumber,
  listClientServiceOrdersForService,
} from "@/modules/service";
import { parseConversationRef } from "../../v1/contract";
import { serveRead } from "../../v1/serve";
import {
  READ_CONTRACT_VERSION_V3,
  toContractServiceOrderListV3,
} from "../contract";

// Las órdenes de servicio del cliente de una conversación, de la API de lectura v3 (brief-29.8.2, D-3,
// D-4 y U-1). El agente nombra la conversación con la referencia que mandó en conversation.resolved, y
// el CRM toma su cliente: el teléfono nunca viaja en una lectura. Alcance context, como el historial y
// la pausa. Una conversación ajena o inexistente da el mismo 404; una sin cliente, la lista vacía. Fuera
// de route.ts para que los tests de integración le pasen la hora. La ruta del log es fija y nunca lleva
// la referencia.

export const SERVICE_ORDERS_ROUTE_V3 = "/api/read/v3/service-orders";

// GET /api/read/v3/service-orders?conversation_ref=…
export function handleServiceOrdersV3(
  request: Request,
  now: Date = new Date(),
): Promise<Response> {
  return serveRead(
    request,
    SERVICE_ORDERS_ROUTE_V3,
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
      const conversation = await getConversationClientForService(
        caller.organizationId,
        { channel: "whatsapp", conversationRef: conversationRef.value },
      );
      if (!conversation.ok) return { ok: false, code: conversation.code };
      if (conversation.clientId === null) {
        return {
          ok: true,
          status: 200,
          body: { contract_version: READ_CONTRACT_VERSION_V3, items: [] },
        };
      }
      const orders = await listClientServiceOrdersForService(
        caller.organizationId,
        conversation.clientId,
        now,
      );
      return {
        ok: true,
        status: 200,
        body: toContractServiceOrderListV3(orders, formatServiceOrderNumber),
      };
    },
  );
}

import { listCurrentEntriesForService } from "@/modules/knowledge";
import {
  KNOWLEDGE_DEFAULT_LIMIT,
  KNOWLEDGE_MAX_LIMIT,
  parseLimit,
  parseQuery,
  READ_CONTRACT_VERSION,
  toContractKnowledgeEntry,
} from "../contract";
import { serveRead } from "../serve";

// Información del negocio de la API de lectura v1 (brief-11.3, D-4; FR-API-02). Fuera de
// route.ts para que los tests de integración le pasen la hora. La ruta del log es fija: nunca
// lleva la búsqueda.

export const KNOWLEDGE_ROUTE = "/api/read/v1/knowledge";

// GET /api/read/v1/knowledge?q=…&limit=…: solo las entradas vigentes hoy en la zona de la
// organización. Con texto, por relevancia; sin texto, por categoría y título.
export function handleKnowledgeList(
  request: Request,
  now: Date = new Date(),
): Promise<Response> {
  return serveRead(
    request,
    KNOWLEDGE_ROUTE,
    "read",
    now,
    async (caller, url) => {
      const query = parseQuery(url.searchParams.get("q"), { required: false });
      const limit = parseLimit(url.searchParams.get("limit"), {
        defaultLimit: KNOWLEDGE_DEFAULT_LIMIT,
        maxLimit: KNOWLEDGE_MAX_LIMIT,
      });
      if (!query.ok || !limit.ok) {
        const fields = [query, limit].flatMap((parsed) =>
          parsed.ok ? [] : [parsed.field],
        );
        return { ok: false, code: "VALIDATION_ERROR", fields };
      }
      const entries = await listCurrentEntriesForService(
        caller.organizationId,
        {
          text: query.value,
          limit: limit.value,
        },
      );
      return {
        ok: true,
        status: 200,
        body: {
          contract_version: READ_CONTRACT_VERSION,
          items: entries.map(toContractKnowledgeEntry),
        },
      };
    },
  );
}

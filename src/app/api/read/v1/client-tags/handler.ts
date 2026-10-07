import { listActiveTagsForService } from "@/modules/crm";
import { READ_CONTRACT_VERSION, type ContractClientTag } from "../contract";
import { serveRead } from "../serve";

// Catálogo de etiquetas de la API de lectura v1 (brief-16.2, D-7; FR-CLI-11). Fuera de route.ts
// para que los tests de integración le pasen la hora. Con alcance read: es configuración de la
// organización, no datos de una persona.

export const CLIENT_TAGS_ROUTE = "/api/read/v1/client-tags";

// GET /api/read/v1/client-tags: las etiquetas activas, por nombre, sin paginación (son 50 como
// mucho, D-11 de la 16.1). Sin parámetros.
export function handleClientTagList(
  request: Request,
  now: Date = new Date(),
): Promise<Response> {
  return serveRead(request, CLIENT_TAGS_ROUTE, "read", now, async (caller) => {
    const tags = await listActiveTagsForService(caller.organizationId);
    const items: ContractClientTag[] = tags.map((tag) => ({
      tag_id: tag.id,
      name: tag.name,
    }));
    return {
      ok: true,
      status: 200,
      body: { contract_version: READ_CONTRACT_VERSION, items },
    };
  });
}

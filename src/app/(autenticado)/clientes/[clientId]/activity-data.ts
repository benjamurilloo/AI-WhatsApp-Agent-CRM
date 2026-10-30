import { getClientStatement } from "@/modules/cash";
import { listClientConversationEvents } from "@/modules/conversations";
import type { AuthContext } from "@/modules/organizations";
import { buildActivityEvents, type ActivityEvent } from "./activity-events";
import { readClientOperations, readOrNull } from "./operations-data";
import { OPERATION_PLURAL } from "./operations-rows";

// Las lecturas de la cronología (brief-24.4.3, D-5): lo que da cada módulo, sin JOIN. Vive aparte de la
// tarjeta para que scripts/medir-caminos.ts mida este mismo camino (R-1). failed dice qué fuente no se
// pudo leer, en palabras: lo que falla no se oculta.

export type ClientActivityData = {
  events: ActivityEvent[];
  failed: string[];
};

export async function readClientActivityEvents(
  context: AuthContext,
  clientId: string,
): Promise<ClientActivityData> {
  const [operations, conversations, statement] = await Promise.all([
    readClientOperations(context, clientId),
    readOrNull(context, () => listClientConversationEvents(context, clientId)),
    readOrNull(context, () => getClientStatement(context, clientId)),
  ]);
  return {
    events: buildActivityEvents({
      operations: operations.sources,
      conversations,
      documents: statement ? statement.statement.documents : null,
    }),
    failed: [
      ...operations.failed.map((type) => OPERATION_PLURAL[type].toLowerCase()),
      ...(conversations ? [] : ["conversaciones"]),
      ...(statement ? [] : ["cuenta corriente"]),
    ],
  };
}

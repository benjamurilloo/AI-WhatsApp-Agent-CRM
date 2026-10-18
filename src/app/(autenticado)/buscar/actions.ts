"use server";

import { requireSession } from "@/app/_auth/session";
import type { RemoteSuggestion } from "@/app/_components/suggest-filter";
import { logEvent, newRequestId } from "@/shared/log";
import { toSuggestions } from "./groups";
import { normalizeSearchText, searchEverything } from "./search";

// La lista que se abre al escribir en la barra (brief-23.3, D-1 y D-4): hasta tres por tipo, con
// las lecturas y los permisos de cada módulo. El log lleva actor, organización, código y duración,
// nunca el texto buscado (H-2). Una lectura que falla deja su grupo afuera y las demás se muestran.
export async function searchEverythingAction(
  text: string,
): Promise<RemoteSuggestion[]> {
  const requestId = newRequestId();
  const started = performance.now();
  const context = await requireSession();
  try {
    const query = normalizeSearchText(text);
    if (query === "") return [];
    const result = await searchEverything(context, query, "suggest");
    if (result.failed.length > 0) {
      logEvent({
        level: "error",
        requestId,
        route: "buscar.sugerencias",
        code: "INTERNAL",
        userId: context.userId,
        organizationId: context.organizationId,
        durationMs: performance.now() - started,
        error: result.error,
      });
    }
    return toSuggestions(result.groups);
  } catch (error) {
    logEvent({
      level: "error",
      requestId,
      route: "buscar.sugerencias",
      code: "INTERNAL",
      userId: context.userId,
      organizationId: context.organizationId,
      durationMs: performance.now() - started,
      error,
    });
    return [];
  }
}

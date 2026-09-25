import type { NamedAuditActor } from "@/modules/audit";
import { getCredentialSources } from "@/modules/ingestion";

// Autor de una fila de auditoría en pantalla (brief-12.1, D-4). El nombre de un usuario lo compone
// el módulo dueño de la entidad; el emisor de una credencial de servicio lo compone la página,
// porque ningún módulo de dominio puede leer ingestion sin un JOIN o un ciclo entre módulos.

export const SERVICE_ACTOR_LABEL = "Servicio";

export function auditActorLabel(
  actor: NamedAuditActor,
  sources: ReadonlyMap<string, string>,
): string {
  if (actor.kind === "user") return actor.name;
  const source = sources.get(actor.credentialId);
  return source ? `${SERVICE_ACTOR_LABEL} · ${source}` : SERVICE_ACTOR_LABEL;
}

export async function auditActorLabels(
  organizationId: string,
  entries: { actor: NamedAuditActor }[],
): Promise<(actor: NamedAuditActor) => string> {
  const credentialIds = entries.flatMap(({ actor }) =>
    actor.kind === "service" ? [actor.credentialId] : [],
  );
  const sources =
    credentialIds.length === 0
      ? new Map<string, string>()
      : await getCredentialSources(organizationId, credentialIds);
  return (actor) => auditActorLabel(actor, sources);
}

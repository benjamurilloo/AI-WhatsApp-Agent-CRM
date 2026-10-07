import { existsSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { sql } from "drizzle-orm";
import { getDb, type Db } from "@/shared/db";

/*
 * Exporta todos los datos de un cliente a pedido (brief-8.2, D-2 y D-4).
 *
 *   npx tsx scripts/client-data-export.ts --org <organization_id> --client <client_id> --out <archivo.json>
 *
 * Cinco orígenes, que son todos los que guardan datos de la persona:
 * su ficha, sus conversaciones, sus mensajes con el cuerpo, las entradas de auditoría sobre
 * ella, que incluyen valores anteriores de teléfono y notas, y desde la 16.1 sus etiquetas
 * actuales, con la fecha en que se pusieron (brief-16.1, D-10). Su historial sale con la auditoría.
 *
 * `ingestion_events` queda fuera a propósito: guarda `source`, una referencia opaca del emisor,
 * el hash del payload y fechas. No tiene datos personales (brief-8.2, hallazgo 9). Se dice acá
 * para que nadie tenga que deducirlo.
 *
 * El archivo que produce contiene datos personales: no va al repositorio ni a un directorio
 * versionado, y se entrega por un canal acordado con quien lo pidió.
 */

export type ClientExport = {
  exported_at: string;
  organization_id: string;
  client_id: string;
  // Lo que el export no incluye y por qué, dentro del propio archivo.
  excluded: { ingestion_events: string };
  client: Record<string, unknown> | null;
  conversations: Record<string, unknown>[];
  messages: Record<string, unknown>[];
  audit_logs: Record<string, unknown>[];
  client_tags: Record<string, unknown>[];
};

export async function exportClientData(
  db: Db,
  organizationId: string,
  clientId: string,
  now = new Date(),
): Promise<ClientExport> {
  const client = await db.execute<Record<string, unknown>>(
    sql`select * from clients
        where organization_id = ${organizationId} and id = ${clientId}`,
  );

  const conversations = await db.execute<Record<string, unknown>>(
    sql`select * from conversations
        where organization_id = ${organizationId} and client_id = ${clientId}
        order by started_at, id`,
  );

  // Los mensajes se piden por la conversación, que es lo que los vincula con la persona.
  const messages = await db.execute<Record<string, unknown>>(
    sql`select m.* from messages m
        join conversations c
          on c.organization_id = m.organization_id and c.id = m.conversation_id
        where m.organization_id = ${organizationId} and c.client_id = ${clientId}
        order by m.sent_at, m.id`,
  );

  const auditLogs = await db.execute<Record<string, unknown>>(
    sql`select * from audit_logs
        where organization_id = ${organizationId}
          and entity_type = 'client' and entity_id = ${clientId}
        order by created_at, id`,
  );

  const tags = await db.execute<Record<string, unknown>>(
    sql`select t.name, t.color, t.is_active, a.created_at as assigned_at
        from client_tag_assignments a
        join client_tags t on t.organization_id = a.organization_id and t.id = a.tag_id
        where a.organization_id = ${organizationId} and a.client_id = ${clientId}
        order by lower(t.name), t.id`,
  );

  return {
    exported_at: now.toISOString(),
    organization_id: organizationId,
    client_id: clientId,
    excluded: {
      ingestion_events:
        "No se exporta: source, referencia del emisor, hash del payload y fechas. La referencia no debería llevar datos personales (guía del emisor de ingestion-v2), pero el CRM no lo valida.",
    },
    client: client.rows[0] ?? null,
    conversations: conversations.rows,
    messages: messages.rows,
    audit_logs: auditLogs.rows,
    client_tags: tags.rows,
  };
}

const usage =
  "Uso: npx tsx scripts/client-data-export.ts --org <organization_id> --client <client_id> --out <archivo.json>";

function option(args: string[], name: string): string | undefined {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

async function main() {
  if (existsSync(".env")) process.loadEnvFile(".env");
  const args = process.argv.slice(2);
  const organizationId = option(args, "--org");
  const clientId = option(args, "--client");
  const out = option(args, "--out");
  if (!organizationId || !clientId || !out) throw new Error(usage);

  const data = await exportClientData(getDb(), organizationId, clientId);
  if (data.client === null) {
    throw new Error("No existe ese cliente en esa organización.");
  }
  await writeFile(out, JSON.stringify(data, null, 2), "utf8");
  // Nunca se imprime el contenido: solo el recuento y el destino.
  console.log(
    `Export escrito en ${out}: ${data.conversations.length} conversaciones, ` +
      `${data.messages.length} mensajes, ${data.audit_logs.length} entradas de auditoría, ` +
      `${data.client_tags.length} etiquetas.`,
  );
  console.log(
    "Contiene datos personales: no lo versiones ni lo compartas por un canal abierto.",
  );
}

// Solo corre al ejecutarse; importarlo desde los tests no hace nada.
if (
  process.argv[1]
    ?.replaceAll("\\", "/")
    .endsWith("scripts/client-data-export.ts")
) {
  main()
    .catch((error: unknown) => {
      console.error(error instanceof Error ? error.message : error);
      process.exitCode = 1;
    })
    .finally(async () => {
      if (process.env.DATABASE_URL) await getDb().$client.end();
    });
}

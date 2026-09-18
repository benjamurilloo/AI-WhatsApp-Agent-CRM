import { existsSync } from "node:fs";
import { sql } from "drizzle-orm";
import { getDb, type Db } from "@/shared/db";

/*
 * Atiende un pedido de eliminación de los datos de un cliente (brief-8.2, D-3).
 *
 *   npx tsx scripts/client-data-delete.ts --org <id> --client <id>              (informe, no escribe)
 *   npx tsx scripts/client-data-delete.ts --org <id> --client <id> --minimizar  (borra los datos personales)
 *   npx tsx scripts/client-data-delete.ts --org <id> --client <id> --borrar     (borra la ficha, si se puede)
 *
 * **Esto es una minimización, no una eliminación, y conviene no confundirlas.** Un cliente con
 * conversaciones no se puede borrar hoy, con ningún rol: `messages` tiene un trigger que rechaza
 * DELETE y UPDATE, y las claves foráneas hacia `conversations` y `clients` son ON DELETE RESTRICT.
 * La cadena está cerrada (ADR 0013; brief-8.2, hallazgo 6).
 *
 * Lo que sí se puede es vaciar los campos personales de la ficha, que es lo que vincula los
 * registros con la persona. Lo que queda retenido está en el informe y en el runbook
 * docs/runbooks/datos-de-un-cliente.md.
 *
 * No escribe en audit_logs, por dos razones: el procedimiento lo corre un operador y no hay
 * usuario actor, y sobre todo **auditar el cambio volvería a escribir el teléfono y las notas
 * en el diff**, deshaciendo lo que se acaba de hacer. La ejecución se registra fuera de la base,
 * como indica el runbook.
 */

export type ClientDataReport = {
  exists: boolean;
  conversations: number;
  messages: number;
  auditEntries: number;
  // Un cliente sin conversaciones sí se puede borrar del todo (brief-8.2, hallazgo 7).
  deletable: boolean;
};

export async function reportClientData(
  db: Db,
  organizationId: string,
  clientId: string,
): Promise<ClientDataReport> {
  const counts = await db.execute<{
    exists: boolean;
    conversations: number;
    messages: number;
    audit_entries: number;
  }>(
    sql`select
          exists (select 1 from clients
                  where organization_id = ${organizationId} and id = ${clientId}) as exists,
          (select count(*)::int from conversations
           where organization_id = ${organizationId} and client_id = ${clientId}) as conversations,
          (select count(*)::int from messages m
             join conversations c
               on c.organization_id = m.organization_id and c.id = m.conversation_id
           where m.organization_id = ${organizationId} and c.client_id = ${clientId}) as messages,
          (select count(*)::int from audit_logs
           where organization_id = ${organizationId}
             and entity_type = 'client' and entity_id = ${clientId}) as audit_entries`,
  );
  const row = counts.rows[0]!;
  return {
    exists: row.exists,
    conversations: row.conversations,
    messages: row.messages,
    auditEntries: row.audit_entries,
    deletable: row.exists && row.conversations === 0,
  };
}

// Marcador visible: quien vea la ficha después tiene que entender que no es un dato perdido.
export function minimizedName(clientId: string): string {
  return `Cliente eliminado ${clientId.slice(0, 8)}`;
}

/** Vacía los datos personales de la ficha. No toca conversaciones, mensajes ni auditoría. */
export async function minimizeClientData(
  db: Db,
  organizationId: string,
  clientId: string,
): Promise<boolean> {
  const updated = await db.execute(
    sql`update clients
        set display_name = ${minimizedName(clientId)},
            phone_e164 = null,
            notes = null,
            updated_at = now()
        where organization_id = ${organizationId} and id = ${clientId}`,
  );
  return (updated.rowCount ?? 0) > 0;
}

/** Borra la ficha. Solo funciona sin conversaciones: si no, PostgreSQL la rechaza (RESTRICT). */
export async function deleteClientRow(
  db: Db,
  organizationId: string,
  clientId: string,
): Promise<boolean> {
  const deleted = await db.execute(
    sql`delete from clients
        where organization_id = ${organizationId} and id = ${clientId}`,
  );
  return (deleted.rowCount ?? 0) > 0;
}

export function describeRetained(report: ClientDataReport): string[] {
  const retained: string[] = [];
  if (report.messages > 0) {
    retained.push(
      `${report.messages} mensajes en 'messages' (body_text incluido): tabla de solo inserción, no se puede borrar ni modificar.`,
    );
  }
  if (report.conversations > 0) {
    retained.push(
      `${report.conversations} conversaciones en 'conversations': no se pueden borrar mientras tengan mensajes.`,
    );
  }
  if (report.auditEntries > 0) {
    retained.push(
      `${report.auditEntries} entradas en 'audit_logs' con el teléfono y las notas anteriores en su diff: tabla de solo inserción.`,
    );
  }
  return retained;
}

const usage =
  "Uso: npx tsx scripts/client-data-delete.ts --org <organization_id> --client <client_id> [--minimizar|--borrar]";

function option(args: string[], name: string): string | undefined {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

async function main() {
  if (existsSync(".env")) process.loadEnvFile(".env");
  const args = process.argv.slice(2);
  const organizationId = option(args, "--org");
  const clientId = option(args, "--client");
  if (!organizationId || !clientId) throw new Error(usage);

  const db = getDb();
  const report = await reportClientData(db, organizationId, clientId);
  if (!report.exists)
    throw new Error("No existe ese cliente en esa organización.");

  console.log(
    `Cliente ${clientId}: ${report.conversations} conversaciones, ${report.messages} mensajes, ` +
      `${report.auditEntries} entradas de auditoría.`,
  );

  const minimizar = args.includes("--minimizar");
  const borrar = args.includes("--borrar");

  if (!minimizar && !borrar) {
    // Sin una opción explícita no escribe nada: primero se ve qué va a pasar.
    console.log(
      report.deletable
        ? "Sin conversaciones: se puede borrar la ficha con --borrar."
        : "Con conversaciones: la ficha no se puede borrar. Con --minimizar se vacían sus datos personales.",
    );
    for (const line of describeRetained(report))
      console.log(`Queda retenido: ${line}`);
    console.log("Informe solamente: no se escribió nada.");
    return;
  }

  if (borrar) {
    if (!report.deletable) {
      throw new Error(
        "Este cliente tiene conversaciones: la ficha no se puede borrar (ADR 0013). Usá --minimizar.",
      );
    }
    await deleteClientRow(db, organizationId, clientId);
    console.log("Ficha borrada. No quedan datos de esta persona en la base.");
    return;
  }

  await minimizeClientData(db, organizationId, clientId);
  console.log(
    "Datos personales de la ficha vaciados: nombre, teléfono y notas.",
  );
  const retained = describeRetained(report);
  if (retained.length === 0) {
    console.log("No queda nada retenido.");
    return;
  }
  console.log("Esto NO es una eliminación completa. Queda retenido:");
  for (const line of retained) console.log(`  - ${line}`);
  console.log(
    "Registrá la ejecución fuera de la base, como indica docs/runbooks/datos-de-un-cliente.md.",
  );
}

if (
  process.argv[1]
    ?.replaceAll("\\", "/")
    .endsWith("scripts/client-data-delete.ts")
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

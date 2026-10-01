import { existsSync } from "node:fs";
import { sql } from "drizzle-orm";
import { getDb, type Db } from "@/shared/db";

/*
 * Atiende un pedido de borrado de los datos de un cliente (brief-8.2, D-3; brief-13.4, D-2).
 *
 *   npx tsx scripts/client-data-delete.ts --org <id> --client <id>            (informe, no escribe)
 *   npx tsx scripts/client-data-delete.ts --org <id> --client <id> --vaciar   (vacía su contenido)
 *   npx tsx scripts/client-data-delete.ts --org <id> --client <id> --borrar   (sin conversaciones)
 *
 * **Borrar es vaciar el contenido y conservar la forma** (brief-13.4, D-2). Con --vaciar, en una
 * sola transacción:
 *   - la ficha pierde nombre, teléfono y notas;
 *   - sus conversaciones pierden la referencia externa;
 *   - sus mensajes pierden el texto y la referencia externa;
 *   - sus entradas de auditoría pierden los valores.
 * Quedan fechas, direcciones, tipos y estados, que es lo que cuentan las métricas: las de los
 * períodos pasados no cambian (brief-13.4, H-3).
 *
 * `messages` y `audit_logs` son de solo inserción. Su trigger deja pasar un único UPDATE, que es
 * este vaciado, y `crm_app` no tiene UPDATE sobre ellas (ADR 0015). **Se corre con el rol dueño**.
 * Con el de la aplicación, la base lo rechaza y no se escribe nada.
 *
 * No escribe en audit_logs: lo corre un operador, sin usuario actor, y sobre todo auditar el cambio
 * volvería a escribir lo que se borra. La ejecución se registra fuera de la base, como indica
 * docs/runbooks/datos-de-un-cliente.md.
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

// El único diff que el trigger de audit_logs acepta en un UPDATE (drizzle/0025). Conserva before
// y after porque la ficha del cliente los lee.
export const ERASED_DIFF = { before: null, after: null, vaciado: true };
const erasedDiff = sql.raw(`'${JSON.stringify(ERASED_DIFF)}'::jsonb`);

export type ErasureResult = {
  client: boolean;
  conversations: number;
  messages: number;
  auditEntries: number;
};

// Lo que una transacción y la base tienen en común.
type Executor = Pick<Db, "execute">;

async function eraseAuditEntries(
  tx: Executor,
  organizationId: string,
  clientId: string,
): Promise<number> {
  const audit = await tx.execute(
    sql`update audit_logs set diff = ${erasedDiff}
        where organization_id = ${organizationId}
          and entity_type = 'client' and entity_id = ${clientId}
          and diff <> ${erasedDiff}`,
  );
  return audit.rowCount ?? 0;
}

/** Vacía el contenido del cliente y de todo lo suyo, en una transacción. Necesita el rol dueño. */
export async function eraseClientData(
  db: Db,
  organizationId: string,
  clientId: string,
): Promise<ErasureResult> {
  return db.transaction(async (tx) => {
    // Primero la ficha y después sus conversaciones, en el orden en que las bloquea la ingestión
    // (resolveIngestedConversation). Sin esto, un mensaje que la ingestión confirma mientras corre
    // el vaciado quedaba fuera de la foto del UPDATE de messages, con su texto, y el script
    // informaba éxito (revisión independiente de la 13.4, R-2).
    await tx.execute(
      sql`select id from clients
          where organization_id = ${organizationId} and id = ${clientId}
          for update`,
    );
    await tx.execute(
      sql`select id from conversations
          where organization_id = ${organizationId} and client_id = ${clientId}
          order by id
          for update`,
    );
    const messages = await tx.execute(
      sql`update messages m set body_text = null, external_ref = null
          from conversations c
          where c.organization_id = m.organization_id and c.id = m.conversation_id
            and m.organization_id = ${organizationId} and c.client_id = ${clientId}
            and (m.body_text is not null or m.external_ref is not null)`,
    );
    const conversations = await tx.execute(
      sql`update conversations set external_ref = null, updated_at = now()
          where organization_id = ${organizationId} and client_id = ${clientId}
            and external_ref is not null`,
    );
    const auditEntries = await eraseAuditEntries(tx, organizationId, clientId);
    const client = await tx.execute(
      sql`update clients
          set display_name = ${minimizedName(clientId)},
              phone_e164 = null,
              notes = null,
              updated_at = now()
          where organization_id = ${organizationId} and id = ${clientId}`,
    );
    return {
      client: (client.rowCount ?? 0) > 0,
      conversations: conversations.rowCount ?? 0,
      messages: messages.rowCount ?? 0,
      auditEntries,
    };
  });
}

/**
 * Borra la ficha y vacía su auditoría, en una transacción. Solo funciona sin conversaciones: si
 * no, PostgreSQL rechaza el borrado (RESTRICT). Con auditoría, necesita el rol dueño.
 */
export async function deleteClientRow(
  db: Db,
  organizationId: string,
  clientId: string,
): Promise<boolean> {
  return db.transaction(async (tx) => {
    await eraseAuditEntries(tx, organizationId, clientId);
    const deleted = await tx.execute(
      sql`delete from clients
          where organization_id = ${organizationId} and id = ${clientId}`,
    );
    return (deleted.rowCount ?? 0) > 0;
  });
}

/** Lo que queda en la base después del vaciado. */
export function describeRetained(report: ClientDataReport): string[] {
  const retained: string[] = [];
  if (report.messages > 0) {
    retained.push(
      `${report.messages} mensajes en 'messages', sin texto ni referencia externa: quedan la fecha, la dirección, el tipo y el autor, que cuentan las métricas.`,
    );
  }
  if (report.conversations > 0) {
    retained.push(
      `${report.conversations} conversaciones en 'conversations', sin referencia externa: quedan sus fechas y su estado.`,
    );
  }
  if (report.auditEntries > 0) {
    retained.push(
      `${report.auditEntries} entradas en 'audit_logs', sin valores: queda que hubo un cambio, de qué tipo y cuándo.`,
    );
  }
  return retained;
}

// Fuera de la base, siempre: el script no lo puede borrar (brief-13.4, H-5 y H-8).
export const RETAINED_OUTSIDE = [
  "Las copias de seguridad: unos 30 días en la copia externa y unos 7 en el servidor, mientras el backup diario funcione. Si se restaura una copia anterior a hoy, este vaciado se vuelve a aplicar (docs/runbooks/restaurar-la-base.md).",
  "Los logs del servidor: identificadores internos, sin el teléfono ni el texto. El journal, hasta 31 días; /var/log/syslog, hasta unos 35.",
  "La copia del agente de WhatsApp y de su n8n: el CRM no la alcanza. Hay que avisarle al agente.",
];

// En la base, pero fuera del alcance del vaciado (revisión independiente de la 13.4, R-1).
export const NOT_REACHED = [
  "Las conversaciones sin cliente: las crea la ingestión v1, o un mensaje de un teléfono que todavía no era cliente, y nada las enlaza después. Sus mensajes conservan el texto. El CRM no guarda el teléfono de una conversación sin cliente, así que no puede atribuirla a esta persona.",
];

const usage =
  "Uso: npx tsx scripts/client-data-delete.ts --org <organization_id> --client <client_id> [--vaciar|--borrar]";

function option(args: string[], name: string): string | undefined {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

// 42501: el rol de la aplicación no tiene UPDATE sobre messages ni audit_logs (ADR 0015).
function explainRole(error: unknown): never {
  const code =
    (error as { cause?: { code?: string }; code?: string }).cause?.code ??
    (error as { code?: string }).code;
  if (code === "42501") {
    throw new Error(
      "La base rechazó el cambio por permisos: este procedimiento se corre con el rol dueño, no con el de la aplicación. No se escribió nada.",
    );
  }
  throw error;
}

function printRetained(report: ClientDataReport) {
  for (const line of describeRetained(report))
    console.log(`  - En la base: ${line}`);
  for (const line of NOT_REACHED)
    console.log(`  - En la base, sin alcanzar: ${line}`);
  for (const line of RETAINED_OUTSIDE)
    console.log(`  - Fuera de la base: ${line}`);
}

async function main() {
  if (existsSync(".env")) process.loadEnvFile(".env");
  const args = process.argv.slice(2);
  const organizationId = option(args, "--org");
  const clientId = option(args, "--client");
  if (!organizationId || !clientId) throw new Error(usage);
  if (args.includes("--minimizar")) {
    throw new Error(
      "--minimizar ya no existe: borrar es vaciar (brief-13.4, D-2). Usá --vaciar.",
    );
  }

  const db = getDb();
  const report = await reportClientData(db, organizationId, clientId);
  if (!report.exists)
    throw new Error("No existe ese cliente en esa organización.");

  console.log(
    `Cliente ${clientId}: ${report.conversations} conversaciones, ${report.messages} mensajes, ` +
      `${report.auditEntries} entradas de auditoría.`,
  );

  const vaciar = args.includes("--vaciar");
  const borrar = args.includes("--borrar");
  if (vaciar && borrar) throw new Error("Elegí una sola: --vaciar o --borrar.");

  if (!vaciar && !borrar) {
    // Sin una opción explícita no escribe nada: primero se ve qué va a pasar.
    console.log(
      report.deletable
        ? "Sin conversaciones: con --borrar se borra la ficha y se vacía su auditoría."
        : "Con conversaciones: la ficha no se puede borrar. Con --vaciar se vacía su contenido y el de todo lo suyo.",
    );
    console.log("Después del vaciado quedaría:");
    printRetained(report);
    console.log("Informe solamente: no se escribió nada.");
    return;
  }

  if (borrar) {
    if (!report.deletable) {
      throw new Error(
        "Este cliente tiene conversaciones: la ficha no se puede borrar. Usá --vaciar.",
      );
    }
    await deleteClientRow(db, organizationId, clientId).catch(explainRole);
    console.log("Ficha borrada y su auditoría vaciada. Queda:");
    printRetained(report);
    return;
  }

  const result = await eraseClientData(db, organizationId, clientId).catch(
    explainRole,
  );
  console.log(
    `Vaciado: la ficha, ${result.conversations} conversaciones, ${result.messages} mensajes y ` +
      `${result.auditEntries} entradas de auditoría.`,
  );
  console.log("Queda, sin nada que identifique a la persona:");
  printRetained(report);
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

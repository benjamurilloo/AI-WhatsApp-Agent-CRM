import { existsSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { sql } from "drizzle-orm";
import { getDb, type Db } from "@/shared/db";

/*
 * Exporta todos los datos de un cliente a pedido (brief-8.2, D-2 y D-4).
 *
 *   npx tsx scripts/client-data-export.ts --org <organization_id> --client <client_id> --out <archivo.json>
 *
 * Seis orígenes, que son todos los que guardan datos de la persona:
 * su ficha, sus conversaciones, sus mensajes con el cuerpo, las entradas de auditoría sobre
 * ella, que incluyen valores anteriores de teléfono y notas, desde la 16.1 sus etiquetas
 * actuales, con la fecha en que se pusieron (brief-16.1, D-10), y desde la 16.4 las notas de sus
 * conversaciones, que son texto libre (brief-16.4, D-5). Su historial sale con la auditoría.
 * Desde la 19.2, también sus pedidos, con sus líneas (ADR 0020, punto 10): número, estado, fechas,
 * productos, cantidades, precios y totales. Los pedidos no guardan texto de la persona, pero son
 * suyos. El nombre del producto va con la línea, el de hoy, para que el archivo se entienda solo.
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
  conversation_notes: Record<string, unknown>[];
  audit_logs: Record<string, unknown>[];
  client_tags: Record<string, unknown>[];
  orders: Record<string, unknown>[];
  order_lines: Record<string, unknown>[];
  // Desde la 20.2 (ADR 0021, punto 12).
  sales: Record<string, unknown>[];
  sale_lines: Record<string, unknown>[];
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

  // Las notas, como los mensajes, se piden por la conversación. Del autor sale solo su id.
  const notes = await db.execute<Record<string, unknown>>(
    sql`select n.* from conversation_notes n
        join conversations c
          on c.organization_id = n.organization_id and c.id = n.conversation_id
        where n.organization_id = ${organizationId} and c.client_id = ${clientId}
        order by n.created_at, n.id`,
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

  const orders = await db.execute<Record<string, unknown>>(
    sql`select id, number, 'P-' || lpad(number::text, greatest(6, length(number::text)), '0') as display_number, status, currency,
               total, created_at, confirmed_at, delivered_at, cancelled_at
        from orders
        where organization_id = ${organizationId} and client_id = ${clientId}
        order by number`,
  );

  // Las líneas, por el pedido, con el nombre y el SKU de hoy del producto.
  const orderLines = await db.execute<Record<string, unknown>>(
    sql`select l.order_id, o.number as order_number, l.position, l.product_id, p.sku, p.name,
               l.quantity, l.unit_price, l.currency, l.line_total
        from order_lines l
        join orders o on o.organization_id = l.organization_id and o.id = l.order_id
        join products p on p.organization_id = l.organization_id and p.id = l.product_id
        where l.organization_id = ${organizationId} and o.client_id = ${clientId}
        order by o.number, l.position`,
  );

  // Las ventas del cliente (ADR 0021, punto 12): número, fecha, pedido, moneda y total. Si está
  // anulada se suma con la 20.4, que crea la anulación. El JOIN con orders es interno porque en la
  // 20.2 toda venta tiene pedido: la 20.3, que vuelve nulable order_id, tiene que pasarlo a LEFT
  // JOIN para no perder las ventas sin pedido (revisión independiente de la 20.2, R-8).
  const sales = await db.execute<Record<string, unknown>>(
    sql`select s.id, s.number, 'V-' || lpad(s.number::text, greatest(6, length(s.number::text)), '0') as display_number,
               s.created_at, s.order_id,
               'P-' || lpad(o.number::text, greatest(6, length(o.number::text)), '0') as order_display_number,
               s.currency, s.total
        from sales s
        join orders o on o.organization_id = s.organization_id and o.id = s.order_id
        where s.organization_id = ${organizationId} and s.client_id = ${clientId}
        order by s.number`,
  );

  // Las líneas, por la venta, con el nombre y el SKU de hoy del producto.
  const saleLines = await db.execute<Record<string, unknown>>(
    sql`select l.sale_id, s.number as sale_number, l.position, l.product_id, p.sku, p.name,
               l.quantity, l.unit_price, l.currency, l.line_total
        from sale_lines l
        join sales s on s.organization_id = l.organization_id and s.id = l.sale_id
        join products p on p.organization_id = l.organization_id and p.id = l.product_id
        where l.organization_id = ${organizationId} and s.client_id = ${clientId}
        order by s.number, l.position`,
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
    conversation_notes: notes.rows,
    audit_logs: auditLogs.rows,
    client_tags: tags.rows,
    orders: orders.rows,
    order_lines: orderLines.rows,
    sales: sales.rows,
    sale_lines: saleLines.rows,
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
      `${data.messages.length} mensajes, ${data.conversation_notes.length} notas, ` +
      `${data.audit_logs.length} entradas de auditoría, ` +
      `${data.client_tags.length} etiquetas, ${data.orders.length} pedidos, ` +
      `${data.sales.length} ventas.`,
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

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
 * Desde la 21.3, sus cobros (ADR 0022, punto 14; brief-21.3, D-9): los comprobantes, no el saldo,
 * que se deriva de ellos con la regla de cash y calcularlo acá sería una segunda implementación.
 * Desde la 21.4, las señas entre los cobros, con su pedido (brief-21.4, D-9).
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
  // Desde la 20.4 (ADR 0021, punto 12; brief-20.4, D-10).
  sale_voids: Record<string, unknown>[];
  // Desde la 21.3 (ADR 0022, punto 14; brief-21.3, D-9).
  receipts: Record<string, unknown>[];
  // Desde la 21.5 (ADR 0022, punto 14; brief-21.5, D-10): los comprobantes, no el saldo.
  receipt_voids: Record<string, unknown>[];
  refunds: Record<string, unknown>[];
  refund_voids: Record<string, unknown>[];
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

  // Las ventas del cliente (ADR 0021, punto 12): número, fecha, pedido, moneda, total y, desde la
  // 20.4, si está anulada y por cuál anulación (brief-20.4, D-10). LEFT JOIN con orders desde la
  // 20.3, que vuelve nulable order_id: una venta sin pedido del cliente sale con el pedido en null
  // (revisión independiente de la 20.2, R-8; brief-20.3, H-9).
  const sales = await db.execute<Record<string, unknown>>(
    sql`select s.id, s.number, 'V-' || lpad(s.number::text, greatest(6, length(s.number::text)), '0') as display_number,
               s.created_at, s.order_id,
               'P-' || lpad(o.number::text, greatest(6, length(o.number::text)), '0') as order_display_number,
               s.currency, s.total,
               v.id is not null as voided,
               'A-' || lpad(v.number::text, greatest(6, length(v.number::text)), '0') as void_display_number
        from sales s
        left join orders o on o.organization_id = s.organization_id and o.id = s.order_id
        left join sale_voids v on v.organization_id = s.organization_id and v.sale_id = s.id
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

  // Las anulaciones de sus ventas (ADR 0021, punto 12; brief-20.4, D-10): número, fecha, venta,
  // moneda, total y el motivo de la lista. No guardan texto de la persona.
  const saleVoids = await db.execute<Record<string, unknown>>(
    sql`select v.id, v.number, 'A-' || lpad(v.number::text, greatest(6, length(v.number::text)), '0') as display_number,
               v.created_at, v.sale_id, s.number as sale_number,
               v.currency, v.total, v.reason
        from sale_voids v
        join sales s on s.organization_id = v.organization_id and s.id = v.sale_id
        where v.organization_id = ${organizationId} and s.client_id = ${clientId}
        order by v.number`,
  );

  // Sus cobros (ADR 0022, punto 14; brief-21.3, D-9): número, fecha, venta, medio, moneda y monto.
  // Llegan al cliente por el client_id que copian de la venta, y no guardan texto de la persona.
  // Desde la 21.4, las señas, con el número de su pedido en lugar de la venta (brief-21.4, D-9).
  const receipts = await db.execute<Record<string, unknown>>(
    sql`select r.id, r.number, 'R-' || lpad(r.number::text, greatest(6, length(r.number::text)), '0') as display_number,
               r.created_at, r.target, r.sale_id, s.number as sale_number,
               r.order_id, o.number as order_number,
               m.name as payment_method, r.currency, r.amount
        from receipts r
        left join sales s on s.organization_id = r.organization_id and s.id = r.sale_id
        left join orders o on o.organization_id = r.organization_id and o.id = r.order_id
        join payment_methods m on m.organization_id = r.organization_id and m.id = r.payment_method_id
        where r.organization_id = ${organizationId} and r.client_id = ${clientId}
        order by r.number`,
  );

  // Desde la 21.5 (ADR 0022, punto 14; brief-21.5, D-10): las anulaciones de sus cobros, sus
  // devoluciones y las anulaciones de sus devoluciones. Los comprobantes, no el saldo: calcularlo
  // acá sería una segunda implementación de la regla de imputación (R-14 de la 21.1). Las
  // anulaciones llegan al cliente por su cobro o su devolución; la devolución, por el client_id de la
  // cuenta. Ninguna guarda texto de la persona: el motivo es de una lista.
  const receiptVoids = await db.execute<Record<string, unknown>>(
    sql`select v.id, v.number, 'AR-' || lpad(v.number::text, greatest(6, length(v.number::text)), '0') as display_number,
               v.created_at, v.receipt_id, r.number as receipt_number,
               v.currency, v.amount, v.reason
        from receipt_voids v
        join receipts r on r.organization_id = v.organization_id and r.id = v.receipt_id
        where v.organization_id = ${organizationId} and r.client_id = ${clientId}
        order by v.number`,
  );
  const refunds = await db.execute<Record<string, unknown>>(
    sql`select d.id, d.number, 'D-' || lpad(d.number::text, greatest(6, length(d.number::text)), '0') as display_number,
               d.created_at, d.target, m.name as payment_method, d.currency, d.amount
        from refunds d
        join payment_methods m on m.organization_id = d.organization_id and m.id = d.payment_method_id
        where d.organization_id = ${organizationId} and d.client_id = ${clientId}
        order by d.number`,
  );
  const refundVoids = await db.execute<Record<string, unknown>>(
    sql`select v.id, v.number, 'AD-' || lpad(v.number::text, greatest(6, length(v.number::text)), '0') as display_number,
               v.created_at, v.refund_id, d.number as refund_number,
               v.currency, v.amount, v.reason
        from refund_voids v
        join refunds d on d.organization_id = v.organization_id and d.id = v.refund_id
        where v.organization_id = ${organizationId} and d.client_id = ${clientId}
        order by v.number`,
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
    sale_voids: saleVoids.rows,
    receipts: receipts.rows,
    receipt_voids: receiptVoids.rows,
    refunds: refunds.rows,
    refund_voids: refundVoids.rows,
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
      `${data.sales.length} ventas, ${data.sale_voids.length} anulaciones, ` +
      `${data.receipts.length} cobros, ${data.receipt_voids.length} anulaciones de cobros, ` +
      `${data.refunds.length} devoluciones, ${data.refund_voids.length} anulaciones de devoluciones.`,
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

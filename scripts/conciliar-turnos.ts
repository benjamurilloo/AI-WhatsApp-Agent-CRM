import { existsSync, readFileSync } from "node:fs";
import { sql } from "drizzle-orm";
import { getDb, type Db } from "@/shared/db";

/*
 * Concilia una corrida de turnos del emisor contra lo que quedó en la base (brief-12.5, D-7).
 *
 *   npx tsx scripts/conciliar-turnos.ts --org <organization_id> --source <source> \
 *     --desde <ISO UTC> --hasta <ISO UTC> [--esperados <archivo.json>]
 *
 * En staging se corre con la conexión de `app.env`, que solo lee lo que la aplicación lee:
 *
 *   sudo bash -c ". /etc/crm-staging/app.env && export DATABASE_URL && cd /srv/crm-staging && \
 *     exec runuser -u benja -- npx tsx scripts/conciliar-turnos.ts …"
 *
 * Con runuser y no con `sudo -u … --preserve-env`: sudo escribe en su log el valor de las
 * variables que se le pasan, y DATABASE_URL lleva la contraseña (revisión de la 13.5.1).
 *
 * `--esperados` es la lista de los mensajes que el emisor dice haber procesado, sin textos:
 *
 *   [{ "message_ref": "…", "direction": "inbound" | "outbound", "conversation_ref": "…" }]
 *
 * Lo que devuelve, y por qué así:
 * - **solo conteos y referencias opacas**: nunca teléfonos, nombres ni textos. La salida se pega
 *   en el chat con el asistente y en la evidencia, así que no puede llevar datos personales;
 * - los eventos de ingestión del `source` en la ventana, por tipo, estado y código;
 * - el conteo a mano de la métrica 12 para la organización en la ventana, con las exclusiones de
 *   MetricsCatalog §12. Es SQL escrito acá a propósito: se compara con el dashboard, que corre el
 *   servicio, y dos caminos distintos que dan lo mismo son la comprobación;
 * - los mensajes que se **insertaron** en la ventana (`created_at`), por conversación y dirección;
 * - con `--esperados`, la conciliación: cada mensaje esperado está una sola vez, en su conversación
 *   y con su dirección, y ningún mensaje insertado en la ventana queda sin esperar.
 *
 * No escribe nada.
 */

export type ExpectedMessage = {
  message_ref: string;
  direction: "inbound" | "outbound";
  conversation_ref: string;
};

type FoundMessage = {
  message_ref: string | null;
  direction: string;
  conversation_ref: string | null;
};

export type Reconciliation = {
  expected: number;
  found: number;
  missing: string[];
  duplicated: string[];
  wrong_conversation: string[];
  wrong_direction: string[];
  unexpected: string[];
  repeated_expected: string[];
  ok: boolean;
};

export type TurnReport = {
  organization_id: string;
  source: string;
  from: string;
  to: string;
  events: {
    event_type: string;
    status: string;
    error_code: string | null;
    count: number;
  }[];
  metric_12_by_hand: { total: number; failed: number };
  conversations: {
    conversation_ref: string | null;
    status: string;
    inbound: number;
    outbound: number;
  }[];
  reconciliation: Reconciliation | null;
};

// MetricsCatalog §12: `client.resolved` (desde la 12.1) y `conversation.escalated` (desde la 12.2)
// no son mensajes y no cuentan.
const METRIC_12_EXCLUDED = ["client.resolved", "conversation.escalated"];

export function reconcile(
  expected: ExpectedMessage[],
  found: FoundMessage[],
): Reconciliation {
  const byRef = new Map<string, FoundMessage[]>();
  for (const message of found) {
    const key = message.message_ref ?? "";
    byRef.set(key, [...(byRef.get(key) ?? []), message]);
  }
  const expectedRefs = new Set(expected.map((item) => item.message_ref));
  // Una referencia repetida en la lista del emisor taparía un faltante: con [A, A] y un solo A
  // guardado no hay faltante ni duplicado (revisión independiente de la 12.5, R-4).
  const repeatedExpected = [
    ...new Set(
      expected
        .map((item) => item.message_ref)
        .filter((ref, index, refs) => refs.indexOf(ref) !== index),
    ),
  ];
  const missing: string[] = [];
  const duplicated: string[] = [];
  const wrongConversation: string[] = [];
  const wrongDirection: string[] = [];
  for (const item of expected) {
    const matches = byRef.get(item.message_ref) ?? [];
    if (matches.length === 0) missing.push(item.message_ref);
    if (matches.length > 1) duplicated.push(item.message_ref);
    if (matches.some((m) => m.conversation_ref !== item.conversation_ref)) {
      wrongConversation.push(item.message_ref);
    }
    if (matches.some((m) => m.direction !== item.direction)) {
      wrongDirection.push(item.message_ref);
    }
  }
  const unexpected = found
    .filter((m) => m.message_ref === null || !expectedRefs.has(m.message_ref))
    .map((m) => m.message_ref ?? "(sin referencia)");
  return {
    expected: expected.length,
    found: found.length,
    missing,
    duplicated,
    wrong_conversation: wrongConversation,
    wrong_direction: wrongDirection,
    unexpected,
    repeated_expected: repeatedExpected,
    ok:
      expected.length === found.length &&
      repeatedExpected.length === 0 &&
      missing.length === 0 &&
      duplicated.length === 0 &&
      wrongConversation.length === 0 &&
      wrongDirection.length === 0 &&
      unexpected.length === 0,
  };
}

export async function collectTurnReport(
  db: Db,
  params: {
    organizationId: string;
    source: string;
    from: Date;
    to: Date;
    expected?: ExpectedMessage[];
  },
): Promise<TurnReport> {
  const { organizationId, source } = params;
  const from = params.from.toISOString();
  const to = params.to.toISOString();

  const events = await db.execute<{
    event_type: string;
    status: string;
    error_code: string | null;
    count: number;
  }>(
    sql`select event_type, status::text as status, error_code, count(*)::int as count
        from ingestion_events
        where organization_id = ${organizationId} and source = ${source}
          and received_at >= ${from} and received_at < ${to}
        group by 1, 2, 3
        order by 1, 2, 3`,
  );

  const metric = await db.execute<{ total: number; failed: number }>(
    sql`select count(*)::int as total,
               (count(*) filter (where status = 'failed'))::int as failed
        from ingestion_events
        where organization_id = ${organizationId}
          and received_at >= ${from} and received_at < ${to}
          and event_type not in (${sql.join(
            METRIC_12_EXCLUDED.map((type) => sql`${type}`),
            sql`, `,
          )})`,
  );

  // Los mensajes que se insertaron durante la corrida, sin el cuerpo.
  const found = await db.execute<FoundMessage & { status: string }>(
    sql`select m.external_ref as message_ref, m.direction::text as direction,
               c.external_ref as conversation_ref, c.status::text as status
        from messages m
        join conversations c
          on c.organization_id = m.organization_id and c.id = m.conversation_id
        where m.organization_id = ${organizationId}
          and m.created_at >= ${from} and m.created_at < ${to}
        order by m.sent_at, m.id`,
  );

  const conversations = new Map<string, TurnReport["conversations"][number]>();
  for (const row of found.rows) {
    const key = row.conversation_ref ?? "";
    const entry = conversations.get(key) ?? {
      conversation_ref: row.conversation_ref,
      status: row.status,
      inbound: 0,
      outbound: 0,
    };
    if (row.direction === "inbound") entry.inbound += 1;
    else entry.outbound += 1;
    conversations.set(key, entry);
  }

  return {
    organization_id: organizationId,
    source,
    from,
    to,
    events: events.rows,
    metric_12_by_hand: metric.rows[0] ?? { total: 0, failed: 0 },
    conversations: [...conversations.values()],
    reconciliation: params.expected
      ? reconcile(
          params.expected,
          found.rows.map(({ message_ref, direction, conversation_ref }) => ({
            message_ref,
            direction,
            conversation_ref,
          })),
        )
      : null,
  };
}

const usage =
  "Uso: npx tsx scripts/conciliar-turnos.ts --org <organization_id> --source <source> " +
  "--desde <ISO UTC> --hasta <ISO UTC> [--esperados <archivo.json>]";

function option(args: string[], name: string): string | undefined {
  const index = args.indexOf(name);
  return index === -1 ? undefined : args[index + 1];
}

function parseDate(value: string | undefined): Date {
  const date = new Date(value ?? "");
  if (value === undefined || Number.isNaN(date.getTime()))
    throw new Error(usage);
  return date;
}

async function main() {
  if (existsSync(".env")) process.loadEnvFile(".env");
  const args = process.argv.slice(2);
  const organizationId = option(args, "--org");
  const source = option(args, "--source");
  if (!organizationId || !source) throw new Error(usage);
  const expectedPath = option(args, "--esperados");
  const report = await collectTurnReport(getDb(), {
    organizationId,
    source,
    from: parseDate(option(args, "--desde")),
    to: parseDate(option(args, "--hasta")),
    expected: expectedPath
      ? (JSON.parse(readFileSync(expectedPath, "utf8")) as ExpectedMessage[])
      : undefined,
  });
  console.log(JSON.stringify(report, null, 2));
  if (report.reconciliation && !report.reconciliation.ok) process.exitCode = 2;
}

// Solo corre al ejecutarse; importarlo desde los tests no hace nada.
if (
  process.argv[1]?.replaceAll("\\", "/").endsWith("scripts/conciliar-turnos.ts")
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

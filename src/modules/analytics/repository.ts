import { and, count, countDistinct, eq, sql, type SQL } from "drizzle-orm";
import {
  conversations,
  messageKind,
  messages,
} from "@/modules/conversations/schema";

type MessageKind = (typeof messageKind.enumValues)[number];
import { ingestionEvents } from "@/modules/ingestion/schema";
import { getDb } from "@/shared/db";

// Lecturas de las métricas (brief-7.1). analytics lee los esquemas de conversations sin pasar por su
// repositorio (Overview: única excepción de la frontera). Solo lectura, y toda tabla que se lee se
// filtra por organization_id.

// Período ya resuelto: días YYYY-MM-DD de la zona de la organización, con el fin incluido.
export type MetricsQuery = {
  organizationId: string;
  from: string;
  to: string;
  timezone: string;
};

// Hoy en la zona de la organización, con el reloj de la base (brief-7.1, D-2).
export async function currentDate(timezone: string): Promise<string> {
  const result = await getDb().execute<{ today: string }>(
    sql`select to_char((now() at time zone ${timezone})::date, 'YYYY-MM-DD') as today`,
  );
  return result.rows[0]!.today;
}

// Intervalo [from 00:00, to + 1 día 00:00) convertido por PostgreSQL con la zona IANA, que resuelve
// los días de 23 o 25 horas (MetricsCatalog, convenciones).
const periodStart = (query: MetricsQuery) =>
  sql`(${query.from}::date::timestamp at time zone ${query.timezone})`;
const periodEnd = (query: MetricsQuery) =>
  sql`((${query.to}::date + 1)::timestamp at time zone ${query.timezone})`;

function messagesInPeriod(query: MetricsQuery): SQL | undefined {
  return and(
    eq(messages.organizationId, query.organizationId),
    sql`${messages.sentAt} >= ${periodStart(query)}`,
    sql`${messages.sentAt} < ${periodEnd(query)}`,
  );
}

// Métrica 1.
export async function countConversationsStarted(
  query: MetricsQuery,
): Promise<number> {
  const rows = await getDb()
    .select({ total: count() })
    .from(conversations)
    .where(
      and(
        eq(conversations.organizationId, query.organizationId),
        sql`${conversations.startedAt} >= ${periodStart(query)}`,
        sql`${conversations.startedAt} < ${periodEnd(query)}`,
      ),
    );
  return rows[0]!.total;
}

// Métrica 2: |A|.
export async function countActiveConversations(
  query: MetricsQuery,
): Promise<number> {
  const rows = await getDb()
    .select({ total: countDistinct(messages.conversationId) })
    .from(messages)
    .where(messagesInPeriod(query));
  return rows[0]!.total;
}

// Métrica 3: clientes distintos de A y conversaciones de A sin cliente.
export async function countUniqueClients(
  query: MetricsQuery,
): Promise<{ clients: number; withoutClient: number }> {
  const active = getDb()
    .selectDistinct({ id: messages.conversationId })
    .from(messages)
    .where(messagesInPeriod(query));
  const rows = await getDb()
    .select({
      clients: countDistinct(conversations.clientId),
      withoutClient:
        sql<number>`count(*) filter (where ${conversations.clientId} is null)`.mapWith(
          Number,
        ),
    })
    .from(conversations)
    .where(
      and(
        eq(conversations.organizationId, query.organizationId),
        sql`${conversations.id} in ${active}`,
      ),
    );
  return rows[0]!;
}

// Métricas 4 y 5.
export async function countMessagesByDirection(
  query: MetricsQuery,
): Promise<{ inbound: number; outbound: number }> {
  const rows = await getDb()
    .select({
      inbound:
        sql<number>`count(*) filter (where ${messages.direction} = 'inbound')`.mapWith(
          Number,
        ),
      outbound:
        sql<number>`count(*) filter (where ${messages.direction} = 'outbound')`.mapWith(
          Number,
        ),
    })
    .from(messages)
    .where(messagesInPeriod(query));
  return rows[0]!;
}

// Métrica 13 (brief-15.3, D-4): los entrantes de I por su tipo original. Los seis tipos del enum en
// el orden del dominio, con 0 explícito, y al final los que no tienen dato (kind nulo: v1 y seeds).
// La suma es la métrica 4.
export type MessageKindCount = { kind: MessageKind | null; count: number };

export async function inboundMessagesByKind(
  query: MetricsQuery,
): Promise<MessageKindCount[]> {
  const rows = await getDb()
    .select({
      kind: messages.kind,
      count: sql<number>`count(*)`.mapWith(Number),
    })
    .from(messages)
    .where(and(messagesInPeriod(query), eq(messages.direction, "inbound")))
    .groupBy(messages.kind);
  const countOf = (kind: MessageKind | null) =>
    rows.find((row) => row.kind === kind)?.count ?? 0;
  return [...messageKind.enumValues, null].map((kind) => ({
    kind,
    count: countOf(kind),
  }));
}

// Métrica 6: mensajes de I por conversación de A. La mediana es percentile_cont (brief-7.1, D-3):
// con una cantidad par, el promedio de los dos valores centrales. Nula si A está vacía.
export async function messagesPerConversation(query: MetricsQuery): Promise<{
  conversations: number;
  messages: number;
  median: number | null;
}> {
  const result = await getDb().execute<{
    conversations: string;
    messages: string;
    median: number | null;
  }>(sql`
    with per_conversation as (
      select count(*) as n
      from ${messages}
      where ${messagesInPeriod(query)}
      group by ${messages.conversationId}
    )
    select count(*) as conversations,
           coalesce(sum(n), 0) as messages,
           percentile_cont(0.5) within group (order by n) as median
    from per_conversation
  `);
  const row = result.rows[0]!;
  return {
    conversations: Number(row.conversations),
    messages: Number(row.messages),
    median: row.median === null ? null : Number(row.median),
  };
}

// Conversaciones de A con un entrante y un saliente estrictamente posterior, los dos en I
// (métrica 7). Existe ese par si el primer entrante de I es anterior al último saliente de I, así
// que no hace falta comparar los mensajes de a pares. Un empate de timestamps no cuenta.
export async function countRespondedConversations(
  query: MetricsQuery,
): Promise<number> {
  const result = await getDb().execute<{ responded: string }>(sql`
    with per_conversation as (
      select min(${messages.sentAt}) filter (where ${messages.direction} = 'inbound') as first_inbound,
             max(${messages.sentAt}) filter (where ${messages.direction} = 'outbound') as last_outbound
      from ${messages}
      where ${messagesInPeriod(query)}
      group by ${messages.conversationId}
    )
    select count(*) as responded
    from per_conversation
    where first_inbound is not null
      and last_outbound is not null
      and last_outbound > first_inbound
  `);
  return Number(result.rows[0]!.responded);
}

// Métrica 8: la métrica 7 sobre |A_in|, en la misma consulta (brief-7.2, D-1).
export async function responseCoverage(
  query: MetricsQuery,
): Promise<{ responded: number; withInbound: number }> {
  const result = await getDb().execute<{
    responded: string;
    with_inbound: string;
  }>(sql`
    with per_conversation as (
      select min(${messages.sentAt}) filter (where ${messages.direction} = 'inbound') as first_inbound,
             max(${messages.sentAt}) filter (where ${messages.direction} = 'outbound') as last_outbound
      from ${messages}
      where ${messagesInPeriod(query)}
      group by ${messages.conversationId}
    )
    select count(*) filter (
             where last_outbound is not null and last_outbound > first_inbound
           ) as responded,
           count(*) as with_inbound
    from per_conversation
    where first_inbound is not null
  `);
  const row = result.rows[0]!;
  return {
    responded: Number(row.responded),
    withInbound: Number(row.with_inbound),
  };
}

// Métrica 9: mediana del tiempo a la primera respuesta, en minutos sin redondear.
//
// La población es la conversación cuyo primer entrante de TODA la conversación cae en I, y su
// respuesta puede ser posterior al fin de I (MetricsCatalog). Las dos lecturas salen del período,
// así que los candidatos se acotan primero con las conversaciones que tienen mensajes en I —toda
// conversación con su primer entrante en I tiene un mensaje en I— y después cada candidata se
// resuelve con el índice (conversation_id, sent_at) (brief-7.2, D-2).
//
// La métrica 14 usa la misma población y el mismo delta (brief-15.3, D-5): los dos salen de
// firstResponseDeltas, así la suma de sus rangos es por construcción «con respuesta» de la 9.
function firstResponseDeltas(query: MetricsQuery): SQL {
  return sql`
    with candidates as (
      select distinct ${messages.conversationId} as conversation_id
      from ${messages}
      where ${messagesInPeriod(query)}
    ),
    -- materialized: sin esto, PostgreSQL inlinea el CTE y repite la subconsulta del primer
    -- entrante una vez por cada condición que la filtra, duplicando las búsquedas por índice
    -- (brief-7.2, medición).
    first_inbound as materialized (
      select candidates.conversation_id,
             (select min(m.sent_at)
              from ${messages} m
              where m.conversation_id = candidates.conversation_id
                and m.organization_id = ${query.organizationId}
                and m.direction = 'inbound') as sent_at
      from candidates
    ),
    population as (
      select conversation_id, sent_at
      from first_inbound
      where sent_at >= ${periodStart(query)}
        and sent_at < ${periodEnd(query)}
    ),
    deltas as (
      select population.conversation_id,
             (select min(m.sent_at)
              from ${messages} m
              where m.conversation_id = population.conversation_id
                and m.organization_id = ${query.organizationId}
                and m.direction = 'outbound'
                and m.sent_at > population.sent_at) - population.sent_at as delta
      from population
    )
  `;
}

export async function firstResponseTime(query: MetricsQuery): Promise<{
  population: number;
  withResponse: number;
  medianMinutes: number | null;
}> {
  const result = await getDb().execute<{
    population: string;
    with_response: string;
    median_minutes: string | null;
  }>(sql`
    ${firstResponseDeltas(query)}
    select count(*) as population,
           count(delta) as with_response,
           percentile_cont(0.5) within group (
             order by extract(epoch from delta) / 60
           ) filter (where delta is not null) as median_minutes
    from deltas
  `);
  const row = result.rows[0]!;
  return {
    population: Number(row.population),
    withResponse: Number(row.with_response),
    medianMinutes:
      row.median_minutes === null ? null : Number(row.median_minutes),
  };
}

// Métrica 14 (brief-15.3, D-5): las conversaciones con primera respuesta de la población de la 9,
// por rango de minutos. Los rangos son semiabiertos [desde, hasta): un delta de exactamente 5 min
// cae en «5 a 30». El delta es tiempo transcurrido (timestamptz), así que un día de 23 o 25 horas
// no lo corre.
export const FIRST_RESPONSE_BUCKETS = [
  { fromMinutes: 0, toMinutes: 1 },
  { fromMinutes: 1, toMinutes: 5 },
  { fromMinutes: 5, toMinutes: 30 },
  { fromMinutes: 30, toMinutes: 60 },
  { fromMinutes: 60, toMinutes: null },
] as const;

export async function firstResponseDistribution(query: MetricsQuery): Promise<{
  population: number;
  withResponse: number;
  counts: number[];
}> {
  const bucketCounts = FIRST_RESPONSE_BUCKETS.map(
    ({ fromMinutes, toMinutes }, index) =>
      sql`count(*) filter (where delta >= make_interval(mins => ${fromMinutes})${
        toMinutes === null
          ? sql``
          : sql` and delta < make_interval(mins => ${toMinutes})`
      }) as ${sql.raw(`bucket_${index}`)}`,
  );
  // measured, materializado: sin él, PostgreSQL inlinea deltas y repite la subconsulta de la
  // respuesta una vez por cada filtro de rango (siete búsquedas por índice por conversación, medido
  // en la 15.3.1). Así se resuelve una sola vez.
  const result = await getDb().execute<Record<string, string>>(sql`
    ${firstResponseDeltas(query)},
    measured as materialized (
      select delta from deltas
    )
    select count(*) as population,
           count(delta) as with_response,
           ${sql.join(bucketCounts, sql`, `)}
    from measured
  `);
  const row = result.rows[0]!;
  return {
    population: Number(row.population),
    withResponse: Number(row.with_response),
    counts: FIRST_RESPONSE_BUCKETS.map((_, index) =>
      Number(row[`bucket_${index}`]),
    ),
  };
}

// Métrica 11: conversaciones de A por su estado actual. Devuelve los tres estados del enum, con 0
// en los que no tienen conversaciones (brief-7.2, D-4).
export async function statusDistribution(
  query: MetricsQuery,
): Promise<Record<"open" | "pending" | "closed", number>> {
  const active = getDb()
    .selectDistinct({ id: messages.conversationId })
    .from(messages)
    .where(messagesInPeriod(query));
  const rows = await getDb()
    .select({
      open: sql<number>`count(*) filter (where ${conversations.status} = 'open')`.mapWith(
        Number,
      ),
      pending:
        sql<number>`count(*) filter (where ${conversations.status} = 'pending')`.mapWith(
          Number,
        ),
      closed:
        sql<number>`count(*) filter (where ${conversations.status} = 'closed')`.mapWith(
          Number,
        ),
    })
    .from(conversations)
    .where(
      and(
        eq(conversations.organizationId, query.organizationId),
        sql`${conversations.id} in ${active}`,
      ),
    );
  return rows[0]!;
}

export type DailyRow = {
  day: string;
  started: number;
  active: number;
  inbound: number;
  outbound: number;
};

// Métrica 10: un punto por día de I, con 0 en los días sin actividad. Cada fila se agrupa por su día
// en la zona de la organización (MetricsCatalog, agrupación diaria).
export async function dailyActivity(query: MetricsQuery): Promise<DailyRow[]> {
  const result = await getDb().execute<{
    day: string;
    started: string;
    active: string;
    inbound: string;
    outbound: string;
  }>(sql`
    with days as (
      select d::date as day
      from generate_series(${query.from}::date, ${query.to}::date, interval '1 day') as d
    ),
    started as (
      select (${conversations.startedAt} at time zone ${query.timezone})::date as day,
             count(*) as started
      from ${conversations}
      where ${conversations.organizationId} = ${query.organizationId}
        and ${conversations.startedAt} >= ${periodStart(query)}
        and ${conversations.startedAt} < ${periodEnd(query)}
      group by 1
    ),
    sent as (
      select (${messages.sentAt} at time zone ${query.timezone})::date as day,
             count(distinct ${messages.conversationId}) as active,
             count(*) filter (where ${messages.direction} = 'inbound') as inbound,
             count(*) filter (where ${messages.direction} = 'outbound') as outbound
      from ${messages}
      where ${messagesInPeriod(query)}
      group by 1
    )
    select to_char(days.day, 'YYYY-MM-DD') as day,
           coalesce(started.started, 0) as started,
           coalesce(sent.active, 0) as active,
           coalesce(sent.inbound, 0) as inbound,
           coalesce(sent.outbound, 0) as outbound
    from days
    left join started on started.day = days.day
    left join sent on sent.day = days.day
    order by days.day
  `);
  return result.rows.map((row) => ({
    day: row.day,
    started: Number(row.started),
    active: Number(row.active),
    inbound: Number(row.inbound),
    outbound: Number(row.outbound),
  }));
}

// Métrica 12 (brief-7.3): eventos de ingestión del período, sus fallidos y los grupos por origen y
// código de error. Una sola consulta, para que la tasa y los grupos salgan de la misma lectura.
// Solo se leen columnas normalizadas: nunca el payload, el hash ni la referencia externa.
export type IngestionErrorGroup = {
  source: string;
  errorCode: string;
  count: number;
};

export async function ingestionErrors(query: MetricsQuery): Promise<{
  total: number;
  failed: number;
  // Orden fijado por el brief-7.3, D-3: conteo descendente y, a igual conteo, alfabético.
  groups: IngestionErrorGroup[];
}> {
  // La resolución de un cliente (client.resolved, brief-12.1) no es un mensaje ingerido: no entra
  // ni al numerador ni al denominador (revisión independiente de la 12.1, R-2), y tampoco la
  // derivación de una conversación (conversation.escalated, brief-12.2, D-9). conversation.resolved
  // sí cuenta: registra un mensaje, y su fallo es un mensaje perdido. Poner y quitar una etiqueta
  // (client.tag_added y client.tag_removed, brief-16.2, D-9) tampoco: no son mensajes.
  const inPeriod = and(
    eq(ingestionEvents.organizationId, query.organizationId),
    sql`${ingestionEvents.receivedAt} >= ${periodStart(query)}`,
    sql`${ingestionEvents.receivedAt} < ${periodEnd(query)}`,
    sql`${ingestionEvents.eventType} not in ('client.resolved', 'conversation.escalated', 'client.tag_added', 'client.tag_removed')`,
  );
  // El CHECK de la tabla garantiza error_code no nulo si y solo si el estado es failed, así que
  // agrupar por el código no necesita tratar nulos dentro de los fallidos (brief-6.1, D-2).
  const result = await getDb().execute<{
    total: number;
    failed: number;
    groups: IngestionErrorGroup[];
  }>(sql`
    with events as (
      select ${ingestionEvents.status} as status,
             ${ingestionEvents.source} as source,
             ${ingestionEvents.errorCode} as error_code
      from ${ingestionEvents}
      where ${inPeriod}
    ),
    groups as (
      select source, error_code, count(*)::int as failures
      from events
      where status = 'failed'
      group by source, error_code
    )
    select (select count(*)::int from events) as total,
           (select count(*)::int from events where status = 'failed') as failed,
           coalesce(
             (select json_agg(
                json_build_object('source', source, 'errorCode', error_code, 'count', failures)
                order by failures desc, source, error_code)
              from groups),
             '[]'::json
           ) as groups
  `);
  const row = result.rows[0]!;
  return {
    total: Number(row.total),
    failed: Number(row.failed),
    groups: row.groups,
  };
}

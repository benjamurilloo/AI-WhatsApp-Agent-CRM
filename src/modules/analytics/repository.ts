import { and, count, countDistinct, eq, sql, type SQL } from "drizzle-orm";
import { conversations, messages } from "@/modules/conversations/schema";
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

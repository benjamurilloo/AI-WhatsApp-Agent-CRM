import {
  and,
  count,
  eq,
  inArray,
  isNotNull,
  max,
  sql,
  type SQL,
} from "drizzle-orm";
import { getDb, type Db, type DbTransaction } from "@/shared/db";
import {
  conversationChannel,
  conversationStatus,
  conversations,
  messageDirection,
  messageKind,
  messages,
  messageSender,
} from "./schema";

// Acceso a conversations y messages (brief-6.3). Toda consulta filtra por organization_id en SQL.
// Solo lectura, salvo el estado de la conversación y las inserciones de la ingestión (brief-6.5.2):
// messages es de solo inserción (brief-6.1, D-3).

type Executor = Db | DbTransaction;

export type ConversationStatus = (typeof conversationStatus.enumValues)[number];
export type ConversationChannel =
  (typeof conversationChannel.enumValues)[number];
export type MessageDirection = (typeof messageDirection.enumValues)[number];
export type MessageKind = (typeof messageKind.enumValues)[number];
export type MessageSender = (typeof messageSender.enumValues)[number];

export function withTransaction<T>(
  work: (tx: DbTransaction) => Promise<T>,
): Promise<T> {
  return getDb().transaction(work);
}

export type ConversationRow = {
  id: string;
  clientId: string | null;
  channel: ConversationChannel;
  status: ConversationStatus;
  startedAt: Date;
  lastMessageAt: Date | null;
};

const conversationColumns = {
  id: conversations.id,
  clientId: conversations.clientId,
  channel: conversations.channel,
  status: conversations.status,
  startedAt: conversations.startedAt,
  lastMessageAt: conversations.lastMessageAt,
};

// Filtros ya validados; fechas YYYY-MM-DD sobre last_message_at.
export type ConversationQuery = {
  organizationId: string;
  status: ConversationStatus | null;
  channel: ConversationChannel | null;
  clientId: string | null;
  from: string | null;
  to: string | null;
  timezone: string;
};

// Período [from 00:00, to + 1 día 00:00) en la zona de la organización, como el historial de
// movimientos (brief-4.3.3, D-3). Una conversación sin mensajes no entra en un período.
function conversationConditions(query: ConversationQuery): SQL | undefined {
  const conditions: (SQL | undefined)[] = [
    eq(conversations.organizationId, query.organizationId),
  ];
  if (query.status) conditions.push(eq(conversations.status, query.status));
  if (query.channel) conditions.push(eq(conversations.channel, query.channel));
  if (query.clientId) {
    conditions.push(eq(conversations.clientId, query.clientId));
  }
  if (query.from) {
    conditions.push(
      sql`${conversations.lastMessageAt} >= (${query.from}::date::timestamp at time zone ${query.timezone})`,
    );
  }
  if (query.to) {
    conditions.push(
      sql`${conversations.lastMessageAt} < ((${query.to}::date + 1)::timestamp at time zone ${query.timezone})`,
    );
  }
  return and(...conditions);
}

export async function countConversations(
  query: ConversationQuery,
): Promise<number> {
  const rows = await getDb()
    .select({ total: count() })
    .from(conversations)
    .where(conversationConditions(query));
  return rows[0]!.total;
}

// Último mensaje más reciente primero, con el mismo NULLS LAST que los índices (brief-6.1), y
// desempate estable por id. Nunca trae el cuerpo de un mensaje (FR-CONV-01).
export function findConversations(
  query: ConversationQuery,
  limit: number,
  offset: number,
): Promise<ConversationRow[]> {
  return getDb()
    .select(conversationColumns)
    .from(conversations)
    .where(conversationConditions(query))
    .orderBy(
      sql`${conversations.lastMessageAt} desc nulls last`,
      sql`${conversations.id} desc`,
    )
    .limit(limit)
    .offset(offset);
}

export async function hasConversations(
  organizationId: string,
  clientId: string | null = null,
): Promise<boolean> {
  const rows = await getDb()
    .select({ id: conversations.id })
    .from(conversations)
    .where(
      and(
        eq(conversations.organizationId, organizationId),
        clientId === null ? undefined : eq(conversations.clientId, clientId),
      ),
    )
    .limit(1);
  return rows.length > 0;
}

// Cantidad de mensajes solo de las conversaciones de una página (brief-1.2, D-3).
export async function countMessagesByConversation(
  organizationId: string,
  conversationIds: string[],
): Promise<Map<string, number>> {
  if (conversationIds.length === 0) return new Map();
  const rows = await getDb()
    .select({ conversationId: messages.conversationId, total: count() })
    .from(messages)
    .where(
      and(
        eq(messages.organizationId, organizationId),
        inArray(messages.conversationId, conversationIds),
      ),
    )
    .groupBy(messages.conversationId);
  return new Map(rows.map((row) => [row.conversationId, row.total]));
}

// forUpdate: el cambio de estado bloquea la fila y calcula el diff sobre lo leído (D-3).
export async function findConversation(
  organizationId: string,
  conversationId: string,
  executor: Executor = getDb(),
  { forUpdate = false } = {},
): Promise<ConversationRow | undefined> {
  const query = executor
    .select(conversationColumns)
    .from(conversations)
    .where(
      and(
        eq(conversations.organizationId, organizationId),
        eq(conversations.id, conversationId),
      ),
    )
    .limit(1);
  const rows = forUpdate ? await query.for("update") : await query;
  return rows[0];
}

// El llamador ya leyó la fila filtrada por organización y con FOR UPDATE en esta misma
// transacción, así que cero filas actualizadas no es una carrera: es un defecto de
// programación. Se lanza dentro de la transacción, que revierte (9.0.1, D-1).
function assertUpdatedOne(rows: unknown[], what: string): void {
  if (rows.length === 0) {
    throw new Error(`${what}: la fila no existe en esta organización`);
  }
}

export async function updateConversationStatus(
  tx: DbTransaction,
  organizationId: string,
  conversationId: string,
  status: ConversationStatus,
): Promise<void> {
  const rows = await tx
    .update(conversations)
    .set({ status })
    .where(
      and(
        eq(conversations.organizationId, organizationId),
        eq(conversations.id, conversationId),
      ),
    )
    .returning({ id: conversations.id });
  assertUpdatedOne(rows, "updateConversationStatus");
}

export type MessageRow = {
  id: string;
  direction: MessageDirection;
  sentAt: Date;
  // sent_at con microsegundos, en UTC: Date solo tiene milisegundos y el cursor no puede perderlos.
  sentAtExact: string;
  body: string | null;
  // null: sin dato, en los mensajes de v1 y de los seeds (brief-12.3, D-2 y D-3).
  kind: MessageKind | null;
  sentBy: MessageSender | null;
};

export type MessageCursor = { sentAt: string; id: string };

// Mensajes anteriores al cursor (sent_at, id), del más reciente al más antiguo (D-2).
export function findMessagesBefore(
  organizationId: string,
  conversationId: string,
  before: MessageCursor | null,
  limit: number,
): Promise<MessageRow[]> {
  return getDb()
    .select({
      id: messages.id,
      direction: messages.direction,
      sentAt: messages.sentAt,
      sentAtExact: sql<string>`to_char(${messages.sentAt} at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`,
      body: messages.bodyText,
      kind: messages.kind,
      sentBy: messages.sentBy,
    })
    .from(messages)
    .where(
      and(
        eq(messages.organizationId, organizationId),
        eq(messages.conversationId, conversationId),
        before === null
          ? undefined
          : sql`(${messages.sentAt}, ${messages.id}) < (${before.sentAt}::timestamptz, ${before.id}::uuid)`,
      ),
    )
    .orderBy(sql`${messages.sentAt} desc`, sql`${messages.id} desc`)
    .limit(limit);
}

// Id de la conversación de la organización con esa referencia del emisor, sin bloquear: la
// lectura del historial no escribe (brief-12.4, D-3).
export async function findConversationIdByExternalRef(values: {
  organizationId: string;
  channel: ConversationChannel;
  externalRef: string;
}): Promise<string | undefined> {
  const rows = await getDb()
    .select({ id: conversations.id })
    .from(conversations)
    .where(
      and(
        eq(conversations.organizationId, values.organizationId),
        eq(conversations.channel, values.channel),
        eq(conversations.externalRef, values.externalRef),
      ),
    )
    .limit(1);
  return rows[0]?.id;
}

export type RecentMessageRow = {
  externalRef: string | null;
  direction: MessageDirection;
  sentAt: Date;
  body: string | null;
  kind: MessageKind | null;
  sentBy: MessageSender | null;
};

// Los últimos `limit` mensajes de la conversación, del más reciente al más antiguo, por la hora
// del mensaje y con desempate por id (brief-12.4, D-5). El LIMIT va en SQL, sobre
// messages_conversation_sent_idx: nunca lee la conversación entera.
export function findLatestMessages(
  organizationId: string,
  conversationId: string,
  limit: number,
): Promise<RecentMessageRow[]> {
  return getDb()
    .select({
      externalRef: messages.externalRef,
      direction: messages.direction,
      sentAt: messages.sentAt,
      body: messages.bodyText,
      kind: messages.kind,
      sentBy: messages.sentBy,
    })
    .from(messages)
    .where(
      and(
        eq(messages.organizationId, organizationId),
        eq(messages.conversationId, conversationId),
      ),
    )
    .orderBy(sql`${messages.sentAt} desc`, sql`${messages.id} desc`)
    .limit(limit);
}

// Última interacción de cada cliente con conversaciones (brief-1.2, D-2), para componer el orden
// de la lista de clientes (brief-6.3, D-1).
export async function findLastInteractionByClient(
  organizationId: string,
): Promise<Map<string, Date>> {
  const rows = await getDb()
    .select({
      clientId: conversations.clientId,
      lastMessageAt: max(conversations.lastMessageAt),
    })
    .from(conversations)
    .where(
      and(
        eq(conversations.organizationId, organizationId),
        isNotNull(conversations.clientId),
        isNotNull(conversations.lastMessageAt),
      ),
    )
    .groupBy(conversations.clientId);
  return new Map(
    rows.flatMap((row) =>
      row.clientId && row.lastMessageAt
        ? [[row.clientId, row.lastMessageAt] as const]
        : [],
    ),
  );
}

export async function findClientLastInteraction(
  organizationId: string,
  clientId: string,
): Promise<{ at: Date; channel: ConversationChannel } | undefined> {
  const rows = await getDb()
    .select({
      at: conversations.lastMessageAt,
      channel: conversations.channel,
    })
    .from(conversations)
    .where(
      and(
        eq(conversations.organizationId, organizationId),
        eq(conversations.clientId, clientId),
        isNotNull(conversations.lastMessageAt),
      ),
    )
    .orderBy(sql`${conversations.lastMessageAt} desc nulls last`)
    .limit(1);
  const row = rows[0];
  return row?.at ? { at: row.at, channel: row.channel } : undefined;
}

// Escrituras de la ingestión (brief-6.5.2). Las unicidades parciales se usan con su predicado.

// Crea la conversación si no existe. Devuelve su id solo si la creó.
export async function insertConversationIfAbsent(
  tx: DbTransaction,
  values: {
    organizationId: string;
    channel: ConversationChannel;
    externalRef: string;
    clientId: string | null;
    sentAt: Date;
  },
): Promise<string | undefined> {
  const result = await tx.execute<{ id: string }>(sql`
    insert into conversations
      (organization_id, client_id, channel, external_ref, status, started_at, last_message_at)
    values (${values.organizationId}, ${values.clientId}, ${values.channel},
      ${values.externalRef}, 'open', ${values.sentAt}, ${values.sentAt})
    on conflict (organization_id, channel, external_ref) where external_ref is not null
    do nothing
    returning id`);
  return result.rows[0]?.id;
}

// Bloquea la conversación hasta el final de la transacción (D-3).
export async function lockConversationByExternalRef(
  tx: DbTransaction,
  organizationId: string,
  channel: ConversationChannel,
  externalRef: string,
): Promise<string | undefined> {
  const rows = await tx
    .select({ id: conversations.id })
    .from(conversations)
    .where(
      and(
        eq(conversations.organizationId, organizationId),
        eq(conversations.channel, channel),
        eq(conversations.externalRef, externalRef),
      ),
    )
    .for("update");
  return rows[0]?.id;
}

// Inserta el mensaje si su external_ref no existe en la conversación. Devuelve si lo insertó.
export async function insertMessageIfAbsent(
  tx: DbTransaction,
  values: {
    organizationId: string;
    conversationId: string;
    direction: MessageDirection;
    externalRef: string;
    sentAt: Date;
    bodyText: string | null;
    // Desde la 12.3: null en los mensajes de v1 (D-2 y D-3).
    kind: MessageKind | null;
    sentBy: MessageSender | null;
  },
): Promise<boolean> {
  const result = await tx.execute<{ id: string }>(sql`
    insert into messages
      (organization_id, conversation_id, direction, external_ref, sent_at, body_text, kind, sent_by)
    values (${values.organizationId}, ${values.conversationId}, ${values.direction},
      ${values.externalRef}, ${values.sentAt}, ${values.bodyText}, ${values.kind}, ${values.sentBy})
    on conflict (organization_id, conversation_id, external_ref) where external_ref is not null
    do nothing
    returning id`);
  return result.rows.length > 0;
}

export type AddressableConversation = {
  id: string;
  externalRef: string;
  status: ConversationStatus;
};

// Conversación vigente de un cliente en un canal (brief-12.2, D-3, ventana simétrica desde la
// revisión independiente, R-2): abierta o pendiente, con external_ref (el emisor la sigue usando
// por esa referencia) y cuyo tramo [started_at, last_message_at] queda a menos de la ventana del
// mensaje: last_message_at >= since y started_at <= until. Entre varias, la más cercana al mensaje
// y, a igual distancia, la de último mensaje más reciente. La bloquea hasta el final de la
// transacción.
// Filtra y ordena por las columnas de conversations_organization_client_last_message_idx; el plan
// no se midió con EXPLAIN.
export async function lockCurrentConversation(
  tx: DbTransaction,
  values: {
    organizationId: string;
    clientId: string;
    channel: ConversationChannel;
    sentAt: Date;
    since: Date;
    until: Date;
  },
): Promise<AddressableConversation | undefined> {
  const sentAt = sql`${values.sentAt}::timestamptz`;
  const result = await tx.execute<{
    id: string;
    external_ref: string;
    status: ConversationStatus;
  }>(sql`
    select id, external_ref, status
    from conversations
    where organization_id = ${values.organizationId}
      and client_id = ${values.clientId}
      and channel = ${values.channel}
      and status in ('open', 'pending')
      and external_ref is not null
      and last_message_at >= ${values.since}
      and started_at <= ${values.until}
    order by greatest(started_at - ${sentAt}, ${sentAt} - last_message_at, interval '0'),
      last_message_at desc, id desc
    limit 1
    for update`);
  const row = result.rows[0];
  return (
    row && { id: row.id, externalRef: row.external_ref, status: row.status }
  );
}

// Conversación de la organización con esa referencia del emisor, con su estado. forUpdate la
// bloquea hasta el final de la transacción: la derivación calcula el diff sobre lo leído
// (brief-12.2, D-6).
export async function findConversationByExternalRef(
  tx: DbTransaction,
  values: {
    organizationId: string;
    channel: ConversationChannel;
    externalRef: string;
  },
  { forUpdate = false } = {},
): Promise<AddressableConversation | undefined> {
  const query = tx
    .select({
      id: conversations.id,
      externalRef: conversations.externalRef,
      status: conversations.status,
    })
    .from(conversations)
    .where(
      and(
        eq(conversations.organizationId, values.organizationId),
        eq(conversations.channel, values.channel),
        eq(conversations.externalRef, values.externalRef),
      ),
    );
  const rows = forUpdate ? await query.for("update") : await query;
  const row = rows[0];
  return (
    row && { id: row.id, externalRef: values.externalRef, status: row.status }
  );
}

// Conversación del cliente que contiene el mensaje con esa referencia, para responder un reenvío
// de conversation.resolved sin escribir (brief-12.2, D-5). Si hubiera más de una, la del mensaje
// más reciente. Mismo módulo: el JOIN no cruza módulos.
export async function findConversationByMessageRef(
  tx: DbTransaction,
  values: {
    organizationId: string;
    clientId: string;
    channel: ConversationChannel;
    messageExternalRef: string;
  },
): Promise<AddressableConversation | undefined> {
  const result = await tx.execute<{
    id: string;
    external_ref: string;
    status: ConversationStatus;
  }>(sql`
    select c.id, c.external_ref, c.status
    from conversations c
    join messages m
      on m.organization_id = c.organization_id and m.conversation_id = c.id
    where c.organization_id = ${values.organizationId}
      and c.client_id = ${values.clientId}
      and c.channel = ${values.channel}
      and c.external_ref is not null
      and m.external_ref = ${values.messageExternalRef}
    order by m.sent_at desc, m.id desc
    limit 1`);
  const row = result.rows[0];
  return (
    row && { id: row.id, externalRef: row.external_ref, status: row.status }
  );
}

// started_at y last_message_at siguen al menor y al mayor sent_at (contrato v1).
export async function widenConversationDates(
  tx: DbTransaction,
  organizationId: string,
  conversationId: string,
  sentAt: Date,
): Promise<void> {
  const rows = await tx
    .update(conversations)
    .set({
      startedAt: sql`least(${conversations.startedAt}, ${sentAt})`,
      lastMessageAt: sql`greatest(${conversations.lastMessageAt}, ${sentAt})`,
    })
    .where(
      and(
        eq(conversations.organizationId, organizationId),
        eq(conversations.id, conversationId),
      ),
    )
    .returning({ id: conversations.id });
  assertUpdatedOne(rows, "widenConversationDates");
}

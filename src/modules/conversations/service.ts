import { z } from "zod";
import { recordAudit } from "@/modules/audit";
import {
  CLIENTS_PAGE_SIZE,
  findClientIdByPhone,
  getClient,
  getClientsByIds,
  listClientOrderKeys,
  lockClientByPhone,
  type Client,
  type ClientListFilters,
} from "@/modules/crm";
import {
  authorize,
  getOrganizationTimezone,
  type AuthContext,
} from "@/modules/organizations";
import { optionalCalendarDate } from "@/shared/calendar";
import type { DbTransaction } from "@/shared/db";
import { failure, type Failure } from "@/shared/errors";
import * as repository from "./repository";
import { conversationChannel, conversationStatus } from "./schema";

// Consulta y estado de conversaciones (brief-6.3): FR-CONV-01 a 03 y FR-CLI-04. Los datos de los
// clientes llegan por la interfaz de crm y se componen en memoria, sin JOIN entre módulos.

export type ConversationStatus = repository.ConversationStatus;
export type ConversationChannel = repository.ConversationChannel;
export type MessageDirection = repository.MessageDirection;

export const CONVERSATION_STATUSES = conversationStatus.enumValues;
export const CONVERSATION_CHANNELS = conversationChannel.enumValues;
export const CONVERSATIONS_PAGE_SIZE = 25;
export const MESSAGES_PAGE_SIZE = 50;

const idSchema = z.uuid();

// Solo lo necesario para nombrar al cliente: nunca el teléfono (wireframes 08 y 09).
export type ConversationClient = {
  id: string;
  name: string;
  isActive: boolean;
};

export type ConversationSummary = {
  id: string;
  client: ConversationClient | null;
  channel: ConversationChannel;
  status: ConversationStatus;
  startedAt: Date;
  lastMessageAt: Date | null;
  messageCount: number;
};

async function clientsById(
  context: AuthContext,
  clientIds: (string | null)[],
): Promise<Map<string, ConversationClient>> {
  const ids = [...new Set(clientIds.filter((id): id is string => id !== null))];
  if (ids.length === 0) return new Map();
  const found = await getClientsByIds(context, ids);
  // Los ids salen de claves foráneas de la misma organización y ya se autorizó.
  if (!found.ok) throw new Error(`crm rechazó los clientes: ${found.code}`);
  return new Map(
    found.clients.map((client) => [
      client.id,
      { id: client.id, name: client.displayName, isActive: client.isActive },
    ]),
  );
}

async function summarize(
  context: AuthContext,
  rows: repository.ConversationRow[],
): Promise<ConversationSummary[]> {
  const [clients, counts] = await Promise.all([
    clientsById(
      context,
      rows.map((row) => row.clientId),
    ),
    repository.countMessagesByConversation(
      context.organizationId,
      rows.map((row) => row.id),
    ),
  ]);
  return rows.map(({ clientId, ...row }) => ({
    ...row,
    client: clientId === null ? null : (clients.get(clientId) ?? null),
    messageCount: counts.get(row.id) ?? 0,
  }));
}

// Una página fuera de rango se lleva a la última; una no numérica o menor que 1, a la primera.
export function conversationPageBounds(total: number, requestedPage: number) {
  const pageCount = Math.max(1, Math.ceil(total / CONVERSATIONS_PAGE_SIZE));
  const page = Math.min(Math.max(1, Math.trunc(requestedPage) || 1), pageCount);
  return { page, pageCount, offset: (page - 1) * CONVERSATIONS_PAGE_SIZE };
}

// Filtros de la URL, como texto. status y channel son "all" o un valor; vacíos no limitan.
export type ConversationListFilters = {
  from: string;
  to: string;
  status: string;
  channel: string;
  clientId: string;
  page: number;
};

export type ConversationListField =
  "from" | "to" | "status" | "channel" | "clientId";

const CONVERSATION_LIST_FIELDS: ConversationListField[] = [
  "from",
  "to",
  "status",
  "channel",
  "clientId",
];

export type ConversationListValues = {
  from: string | null;
  to: string | null;
  status: ConversationStatus | null;
  channel: ConversationChannel | null;
  clientId: string | null;
};

const allOr = <T extends readonly [string, ...string[]]>(values: T) =>
  z
    .union([z.literal("all"), z.enum(values)])
    .transform((value) => (value === "all" ? null : (value as T[number])));

const conversationListSchema = z
  .object({
    from: optionalCalendarDate,
    to: optionalCalendarDate,
    status: allOr(CONVERSATION_STATUSES),
    channel: allOr(CONVERSATION_CHANNELS),
    clientId: z
      .string()
      .trim()
      .refine((value) => value === "" || idSchema.safeParse(value).success)
      .transform((value) => (value === "" ? null : value)),
  })
  .superRefine((values, ctx) => {
    // Las fechas YYYY-MM-DD se comparan como texto.
    if (values.from && values.to && values.from > values.to) {
      ctx.addIssue({ code: "custom", path: ["from"], message: "invertido" });
      ctx.addIssue({ code: "custom", path: ["to"], message: "invertido" });
    }
  });

export function validateConversationListFilters(
  filters: Omit<ConversationListFilters, "page">,
):
  | { ok: true; values: ConversationListValues }
  | Failure<"VALIDATION_ERROR", { fields: ConversationListField[] }> {
  const parsed = conversationListSchema.safeParse(filters);
  if (parsed.success) return { ok: true, values: parsed.data };
  const fields = new Set(parsed.error.issues.map((issue) => issue.path[0]));
  return {
    ok: false,
    code: "VALIDATION_ERROR",
    fields: CONVERSATION_LIST_FIELDS.filter((field) => fields.has(field)),
  };
}

export type ConversationPage = {
  conversations: ConversationSummary[];
  total: number;
  page: number;
  pageCount: number;
  // Zona IANA en la que se interpretó el período y en la que se muestran las fechas.
  timezone: string;
};

export type ConversationListResult =
  | ({ ok: true; organizationHasConversations: boolean } & ConversationPage)
  | Failure<"FORBIDDEN">
  | Failure<"VALIDATION_ERROR", { fields: ConversationListField[] }>;

async function conversationPage(
  context: AuthContext,
  query: repository.ConversationQuery,
  requestedPage: number,
): Promise<ConversationPage> {
  const total = await repository.countConversations(query);
  const { page, pageCount, offset } = conversationPageBounds(
    total,
    requestedPage,
  );
  const rows =
    total === 0
      ? []
      : await repository.findConversations(
          query,
          CONVERSATIONS_PAGE_SIZE,
          offset,
        );
  return {
    conversations: await summarize(context, rows),
    total,
    page,
    pageCount,
    timezone: query.timezone,
  };
}

// Lista para admin y viewer (FR-CONV-01). No trae el contenido de ningún mensaje.
export async function listConversations(
  context: AuthContext,
  filters: ConversationListFilters,
): Promise<ConversationListResult> {
  const authorized = authorize(context);
  if (!authorized.ok) return authorized;
  const validated = validateConversationListFilters(filters);
  if (!validated.ok) return validated;
  const query: repository.ConversationQuery = {
    organizationId: context.organizationId,
    ...validated.values,
    timezone: await getOrganizationTimezone(context),
  };
  const found = await conversationPage(context, query, filters.page);
  // Con filtros y sin filas: distingue "sin resultados" de "no hay conversaciones".
  const organizationHasConversations =
    found.total > 0 ||
    (await repository.hasConversations(context.organizationId));
  return { ok: true, ...found, organizationHasConversations };
}

export type ConversationDetail = Omit<ConversationSummary, "messageCount">;

export type ConversationDetailResult =
  | { ok: true; conversation: ConversationDetail; timezone: string }
  | Failure<"FORBIDDEN" | "NOT_FOUND" | "VALIDATION_ERROR">;

async function findReadable(
  context: AuthContext,
  conversationId: string,
): Promise<
  | { ok: true; row: repository.ConversationRow }
  | Failure<"FORBIDDEN" | "NOT_FOUND" | "VALIDATION_ERROR">
> {
  const authorized = authorize(context);
  if (!authorized.ok) return authorized;
  if (!idSchema.safeParse(conversationId).success) {
    return failure("VALIDATION_ERROR");
  }
  const row = await repository.findConversation(
    context.organizationId,
    conversationId,
  );
  if (!row) return failure("NOT_FOUND");
  return { ok: true, row };
}

// Cabecera de la pantalla 9, para admin y viewer.
export async function getConversation(
  context: AuthContext,
  conversationId: string,
): Promise<ConversationDetailResult> {
  const found = await findReadable(context, conversationId);
  if (!found.ok) return found;
  const { clientId, ...row } = found.row;
  const clients = await clientsById(context, [clientId]);
  return {
    ok: true,
    conversation: {
      ...row,
      client: clientId === null ? null : (clients.get(clientId) ?? null),
    },
    timezone: await getOrganizationTimezone(context),
  };
}

// Cursor opaco del timeline (D-2): sent_at exacto e id, en base64url.
export function encodeMessageCursor(cursor: repository.MessageCursor): string {
  return Buffer.from(JSON.stringify([cursor.sentAt, cursor.id])).toString(
    "base64url",
  );
}

const cursorSchema = z.tuple([
  z
    .string()
    .regex(/^[1-9]\d{3}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/)
    .refine((value) => !Number.isNaN(Date.parse(value))),
  idSchema,
]);

export function decodeMessageCursor(
  text: string,
): repository.MessageCursor | null {
  if (!/^[A-Za-z0-9_-]{1,200}$/.test(text)) return null;
  try {
    const parsed = cursorSchema.safeParse(
      JSON.parse(Buffer.from(text, "base64url").toString("utf8")),
    );
    return parsed.success
      ? { sentAt: parsed.data[0], id: parsed.data[1] }
      : null;
  } catch {
    return null;
  }
}

export type ConversationMessage = {
  id: string;
  direction: MessageDirection;
  sentAt: Date;
  // Tal cual se guardó: el escape es de la presentación (6.4).
  body: string | null;
};

export type ConversationMessagesResult =
  | {
      ok: true;
      // Del más antiguo al más reciente.
      messages: ConversationMessage[];
      // Cursor para cargar los anteriores, o null si no hay más.
      before: string | null;
      timezone: string;
    }
  | Failure<"FORBIDDEN" | "NOT_FOUND" | "VALIDATION_ERROR">;

// Timeline de a 50, empezando por los más recientes (pantalla 9), para admin y viewer.
export async function listConversationMessages(
  context: AuthContext,
  conversationId: string,
  options: { before: string },
): Promise<ConversationMessagesResult> {
  const found = await findReadable(context, conversationId);
  if (!found.ok) return found;
  const text = options.before.trim();
  const before = text === "" ? null : decodeMessageCursor(text);
  if (text !== "" && before === null) return failure("VALIDATION_ERROR");
  const rows = await repository.findMessagesBefore(
    context.organizationId,
    found.row.id,
    before,
    MESSAGES_PAGE_SIZE + 1,
  );
  const page = rows.slice(0, MESSAGES_PAGE_SIZE);
  const oldest = page.at(-1);
  return {
    ok: true,
    messages: page.reverse().map(({ id, direction, sentAt, body }) => ({
      id,
      direction,
      sentAt,
      body,
    })),
    before:
      rows.length > MESSAGES_PAGE_SIZE && oldest
        ? encodeMessageCursor({ sentAt: oldest.sentAtExact, id: oldest.id })
        : null,
    timezone: await getOrganizationTimezone(context),
  };
}

export type ChangeStatusResult =
  | { ok: true; changed: boolean }
  // VALIDATION_ERROR sin fields: id inválido (brief-4.4, D-6). Con fields: el estado.
  | Failure<"FORBIDDEN" | "NOT_FOUND" | "VALIDATION_ERROR">
  | Failure<"VALIDATION_ERROR", { fields: ["status"] }>;

const statusSchema = z.enum(CONVERSATION_STATUSES);

// Solo admin (FR-CONV-03), auditado en la misma transacción (FR-AUD-01). Última escritura gana:
// el diff sale del estado leído bajo el bloqueo (D-3).
export async function changeConversationStatus(
  context: AuthContext,
  input: { conversationId: string; status: string },
): Promise<ChangeStatusResult> {
  const authorized = authorize(context, { role: "admin" });
  if (!authorized.ok) return authorized;
  if (!idSchema.safeParse(input.conversationId).success) {
    return failure("VALIDATION_ERROR");
  }
  const status = statusSchema.safeParse(input.status);
  if (!status.success) {
    return { ok: false, code: "VALIDATION_ERROR", fields: ["status"] };
  }

  return repository.withTransaction(async (tx): Promise<ChangeStatusResult> => {
    const current = await repository.findConversation(
      context.organizationId,
      input.conversationId,
      tx,
      { forUpdate: true },
    );
    if (!current) return failure("NOT_FOUND");
    if (current.status === status.data) return { ok: true, changed: false };

    await repository.updateConversationStatus(
      tx,
      context.organizationId,
      current.id,
      status.data,
    );
    await recordAudit(tx, {
      organizationId: context.organizationId,
      actorUserId: context.userId,
      entityType: "conversation",
      entityId: current.id,
      action: "status_change",
      diff: {
        before: { status: current.status },
        after: { status: status.data },
      },
    });
    return { ok: true, changed: true };
  });
}

export type ClientActivityResult =
  | ({
      ok: true;
      // Mensaje más reciente en cualquier conversación del cliente, sin contenido (FR-CLI-04).
      lastInteraction: { at: Date; channel: ConversationChannel } | null;
      clientHasConversations: boolean;
    } & ConversationPage)
  | Failure<"FORBIDDEN" | "NOT_FOUND" | "VALIDATION_ERROR">
  | Failure<"VALIDATION_ERROR", { fields: ["status"] }>;

const statusFilterSchema = allOr(CONVERSATION_STATUSES);

// Actividad del cliente para la pantalla 7, para admin y viewer. crm resuelve el cliente, su
// organización y el id; la última interacción no depende del filtro de estado.
export async function getClientActivity(
  context: AuthContext,
  clientId: string,
  filters: { status: string; page: number },
): Promise<ClientActivityResult> {
  const client = await getClient(context, clientId);
  if (!client.ok) return client;
  const status = statusFilterSchema.safeParse(filters.status);
  if (!status.success) {
    return { ok: false, code: "VALIDATION_ERROR", fields: ["status"] };
  }
  const query: repository.ConversationQuery = {
    organizationId: context.organizationId,
    status: status.data,
    channel: null,
    clientId: client.client.id,
    from: null,
    to: null,
    timezone: await getOrganizationTimezone(context),
  };
  const [found, lastInteraction] = await Promise.all([
    conversationPage(context, query, filters.page),
    repository.findClientLastInteraction(
      context.organizationId,
      client.client.id,
    ),
  ]);
  return {
    ok: true,
    ...found,
    lastInteraction: lastInteraction ?? null,
    clientHasConversations:
      found.total > 0 ||
      (await repository.hasConversations(
        context.organizationId,
        client.client.id,
      )),
  };
}

export type ClientWithInteraction = Client & { lastInteractionAt: Date | null };

export type ClientInteractionPage =
  | {
      ok: true;
      clients: ClientWithInteraction[];
      total: number;
      page: number;
      pageCount: number;
      timezone: string;
    }
  | Failure<"FORBIDDEN">;

// Orden por última interacción, compuesto en memoria (brief-6.3, D-1): crm da los ids en orden de
// nombre y el teléfono según el rol; los clientes sin interacciones quedan al final en ese orden.
export async function searchClientsByLastInteraction(
  context: AuthContext,
  filters: ClientListFilters,
): Promise<ClientInteractionPage> {
  const keys = await listClientOrderKeys(context, filters);
  if (!keys.ok) return keys;
  const lastInteraction = await repository.findLastInteractionByClient(
    context.organizationId,
  );
  // sort es estable: a igual fecha, o sin fecha, se conserva el orden de nombre de crm.
  const ordered = [...keys.clientIds].sort((a, b) => {
    const left = lastInteraction.get(a)?.getTime() ?? -Infinity;
    const right = lastInteraction.get(b)?.getTime() ?? -Infinity;
    return left === right ? 0 : right > left ? 1 : -1;
  });

  const total = ordered.length;
  const pageCount = Math.max(1, Math.ceil(total / CLIENTS_PAGE_SIZE));
  const page = Math.min(Math.max(1, Math.trunc(filters.page) || 1), pageCount);
  const pageIds = ordered.slice(
    (page - 1) * CLIENTS_PAGE_SIZE,
    page * CLIENTS_PAGE_SIZE,
  );
  const found = await getClientsByIds(context, pageIds);
  if (!found.ok) throw new Error(`crm rechazó los clientes: ${found.code}`);
  return {
    ok: true,
    clients: found.clients.map((client) => ({
      ...client,
      lastInteractionAt: lastInteraction.get(client.id) ?? null,
    })),
    total,
    page,
    pageCount,
    timezone: await getOrganizationTimezone(context),
  };
}

export type IngestedMessage = {
  organizationId: string;
  conversation: {
    externalRef: string;
    channel: ConversationChannel;
    clientPhone: string | null;
  };
  message: {
    externalRef: string;
    direction: MessageDirection;
    sentAt: Date;
    bodyText: string | null;
  };
};

export type RecordIngestedMessageResult =
  { ok: true; conversationCreated: boolean } | Failure<"CONFLICT">;

// Proyección de un evento de ingestión (brief-6.5.2, D-2). La transacción la abre ingestion, que
// ya validó el evento. El cliente se resuelve solo al crear la conversación y nunca se crea; el
// estado no cambia. Si el mensaje ya existe en la conversación, no se toca nada: CONFLICT.
export async function recordIngestedMessage(
  tx: DbTransaction,
  input: IngestedMessage,
): Promise<RecordIngestedMessageResult> {
  const { organizationId, conversation, message } = input;
  const clientId =
    conversation.clientPhone === null
      ? null
      : await findClientIdByPhone(tx, organizationId, conversation.clientPhone);
  const createdId = await repository.insertConversationIfAbsent(tx, {
    organizationId,
    channel: conversation.channel,
    externalRef: conversation.externalRef,
    clientId,
    sentAt: message.sentAt,
  });
  const conversationId =
    createdId ??
    (await repository.lockConversationByExternalRef(
      tx,
      organizationId,
      conversation.channel,
      conversation.externalRef,
    ));
  if (!conversationId) {
    throw new Error("la conversación no existe después de reservarla");
  }

  const inserted = await repository.insertMessageIfAbsent(tx, {
    organizationId,
    conversationId,
    direction: message.direction,
    externalRef: message.externalRef,
    sentAt: message.sentAt,
    bodyText: message.bodyText,
  });
  if (!inserted) {
    if (createdId)
      throw new Error("mensaje existente en una conversación nueva");
    return failure("CONFLICT");
  }
  if (!createdId) {
    await repository.widenConversationDates(
      tx,
      organizationId,
      conversationId,
      message.sentAt,
    );
  }
  return { ok: true, conversationCreated: createdId !== undefined };
}

// Ventana de vigencia (brief-12.2, D-3): 24 horas a cada lado del sent_at del mensaje nuevo, no de
// la recepción. Hacia atrás, desde el último mensaje de la conversación; hacia adelante, hasta su
// inicio, para que un mensaje tardío no caiga en una conversación posterior (revisión
// independiente, R-2, decisión del usuario). Una closed nunca es vigente.
export const CURRENT_CONVERSATION_WINDOW_MS = 24 * 60 * 60 * 1000;

export type IngestedInboundMessage = {
  organizationId: string;
  clientPhone: string;
  channel: ConversationChannel;
  // Referencia propuesta por el emisor: solo se usa si hay que crear la conversación (D-2).
  proposedExternalRef: string;
  message: { externalRef: string; sentAt: Date; bodyText: string | null };
};

export type ResolvedConversation = {
  externalRef: string;
  status: ConversationStatus;
};

export type ResolveIngestedConversationResult =
  | { ok: true; conversation: ResolvedConversation; created: boolean }
  | Failure<"CONFLICT">
  | Failure<"BUSINESS_RULE_VIOLATION", { rule: "client_not_found" }>;

// Proyección de conversation.resolved (brief-12.2, D-1): el mensaje entrante va a la conversación
// vigente del cliente o a una nueva, que nace con él. La transacción la abre ingestion. El
// cliente se bloquea antes de buscar la vigente, así que dos mensajes simultáneos del mismo
// cliente no abren dos conversaciones (D-8). No autoriza ni audita: nada de esto cambia un estado.
export async function resolveIngestedConversation(
  tx: DbTransaction,
  input: IngestedInboundMessage,
): Promise<ResolveIngestedConversationResult> {
  const { organizationId, channel, message } = input;
  const clientId = await lockClientByPhone(
    tx,
    organizationId,
    input.clientPhone,
  );
  if (clientId === null) {
    return {
      ok: false,
      code: "BUSINESS_RULE_VIOLATION",
      rule: "client_not_found",
    };
  }

  const current = await repository.lockCurrentConversation(tx, {
    organizationId,
    clientId,
    channel,
    sentAt: message.sentAt,
    since: new Date(message.sentAt.getTime() - CURRENT_CONVERSATION_WINDOW_MS),
    until: new Date(message.sentAt.getTime() + CURRENT_CONVERSATION_WINDOW_MS),
  });
  const conversationId =
    current?.id ??
    (await repository.insertConversationIfAbsent(tx, {
      organizationId,
      channel,
      externalRef: input.proposedExternalRef,
      clientId,
      sentAt: message.sentAt,
    }));
  // La referencia propuesta ya es de otra conversación (vencida, cerrada o de otro cliente): el
  // emisor tiene que proponer una nueva.
  if (!conversationId) return failure("CONFLICT");

  const inserted = await repository.insertMessageIfAbsent(tx, {
    organizationId,
    conversationId,
    direction: "inbound",
    externalRef: message.externalRef,
    sentAt: message.sentAt,
    bodyText: message.bodyText,
  });
  if (!inserted) {
    if (!current)
      throw new Error("mensaje existente en una conversación nueva");
    return failure("CONFLICT");
  }
  if (current) {
    await repository.widenConversationDates(
      tx,
      organizationId,
      conversationId,
      message.sentAt,
    );
  }
  return {
    ok: true,
    conversation: current
      ? { externalRef: current.externalRef, status: current.status }
      : { externalRef: input.proposedExternalRef, status: "open" },
    created: !current,
  };
}

export type EscalateIngestedConversationResult =
  | { ok: true; conversation: ResolvedConversation }
  | Failure<
      "BUSINESS_RULE_VIOLATION",
      { rule: "conversation_not_found" | "conversation_closed" }
    >;

// Proyección de conversation.escalated (brief-12.2, D-4 y D-6): derivar a una persona es pasar a
// pending, auditado con la credencial como actor (FR-AUD-03). Ya pending no escribe ni audita;
// una closed no se reabre por servicio. La transacción la abre ingestion.
export async function escalateIngestedConversation(
  tx: DbTransaction,
  input: {
    organizationId: string;
    credentialId: string;
    channel: ConversationChannel;
    externalRef: string;
  },
): Promise<EscalateIngestedConversationResult> {
  const current = await repository.findConversationByExternalRef(
    tx,
    {
      organizationId: input.organizationId,
      channel: input.channel,
      externalRef: input.externalRef,
    },
    { forUpdate: true },
  );
  if (!current) {
    return {
      ok: false,
      code: "BUSINESS_RULE_VIOLATION",
      rule: "conversation_not_found",
    };
  }
  if (current.status === "closed") {
    return {
      ok: false,
      code: "BUSINESS_RULE_VIOLATION",
      rule: "conversation_closed",
    };
  }
  if (current.status === "open") {
    await repository.updateConversationStatus(
      tx,
      input.organizationId,
      current.id,
      "pending",
    );
    await recordAudit(tx, {
      organizationId: input.organizationId,
      actorCredentialId: input.credentialId,
      entityType: "conversation",
      entityId: current.id,
      action: "status_change",
      diff: { before: { status: "open" }, after: { status: "pending" } },
    });
  }
  return {
    ok: true,
    conversation: { externalRef: current.externalRef, status: "pending" },
  };
}

// Reenvío de conversation.escalated: el estado actual de la conversación, sin escribir. null si ya
// no existe con esa referencia.
export async function findEscalatedConversation(
  tx: DbTransaction,
  input: {
    organizationId: string;
    channel: ConversationChannel;
    externalRef: string;
  },
): Promise<ResolvedConversation | null> {
  const found = await repository.findConversationByExternalRef(tx, input);
  return found
    ? { externalRef: found.externalRef, status: found.status }
    : null;
}

// Reenvío de conversation.resolved (D-5): la conversación del cliente que contiene el mensaje,
// sin escribir. null si el teléfono ya no es de ningún cliente o el mensaje no está.
export async function findIngestedConversation(
  tx: DbTransaction,
  input: {
    organizationId: string;
    clientPhone: string;
    channel: ConversationChannel;
    messageExternalRef: string;
  },
): Promise<ResolvedConversation | null> {
  const clientId = await findClientIdByPhone(
    tx,
    input.organizationId,
    input.clientPhone,
  );
  if (clientId === null) return null;
  const found = await repository.findConversationByMessageRef(tx, {
    organizationId: input.organizationId,
    clientId,
    channel: input.channel,
    messageExternalRef: input.messageExternalRef,
  });
  return found
    ? { externalRef: found.externalRef, status: found.status }
    : null;
}

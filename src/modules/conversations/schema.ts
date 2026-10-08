import { sql } from "drizzle-orm";
import {
  check,
  foreignKey,
  index,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { users } from "@/modules/auth/schema";
import { clients } from "@/modules/crm/schema";
import { organizations } from "@/modules/organizations/schema";

// docs/architecture/DataModel.md, tablas conversations y messages (brief-6.1).
// Las referencias a clientes y conversaciones llevan su organización (brief-4.1, D-3).

// Extensible a futuro: el MVP solo usa whatsapp (regla de diseño 13).
export const conversationChannel = pgEnum("conversation_channel", ["whatsapp"]);

export const conversationStatus = pgEnum("conversation_status", [
  "open",
  "pending",
  "closed",
]);

export const messageDirection = pgEnum("message_direction", [
  "inbound",
  "outbound",
]);

// Tipo original del mensaje y autor de una salida (brief-12.3, D-2 y D-3). Los dos son nulables:
// null es «sin dato», el de los mensajes de v1 y de los seeds, que no se rellenan.
export const messageKind = pgEnum("message_kind", [
  "text",
  "audio",
  "image",
  "video",
  "document",
  "other",
]);

export const messageSender = pgEnum("message_sender", ["agent", "person"]);

export const conversations = pgTable(
  "conversations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "restrict" }),
    // Puede no resolverse a un cliente conocido; nulo, la clave compuesta no se verifica.
    clientId: uuid("client_id"),
    channel: conversationChannel("channel").notNull(),
    // Referencia del sistema origen: segunda defensa de la idempotencia de ingestión.
    externalRef: text("external_ref"),
    status: conversationStatus("status").notNull().default("open"),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
    lastMessageAt: timestamp("last_message_at", { withTimezone: true }),
    // Desde cuándo un admin pausó al agente en esta conversación; nula, el agente está activo
    // (brief-16.3, D-1 y D-2). Independiente de status: la derivación no la toca.
    agentPausedAt: timestamp("agent_paused_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    foreignKey({
      name: "conversations_client_fk",
      columns: [table.organizationId, table.clientId],
      foreignColumns: [clients.organizationId, clients.id],
    }).onDelete("restrict"),
    // Destino de la clave foránea compuesta de messages.
    unique("conversations_organization_id_id_unique").on(
      table.organizationId,
      table.id,
    ),
    uniqueIndex("conversations_organization_channel_external_ref_unique")
      .on(table.organizationId, table.channel, table.externalRef)
      .where(sql`${table.externalRef} IS NOT NULL`),
    // Pantalla 8 (brief-1.2, D-4).
    index("conversations_organization_last_message_idx").on(
      table.organizationId,
      table.lastMessageAt.desc(),
    ),
    // Última interacción del cliente y sus conversaciones: pantallas 6 y 7 (brief-1.2, D-2).
    index("conversations_organization_client_last_message_idx").on(
      table.organizationId,
      table.clientId,
      table.lastMessageAt.desc(),
    ),
    // Métricas 1 y 10.
    index("conversations_organization_started_idx").on(
      table.organizationId,
      table.startedAt,
    ),
    // Una referencia vacía no identifica nada (brief-6.1, D-2).
    check(
      "conversations_external_ref_not_blank",
      sql`btrim(${table.externalRef}) <> ''`,
    ),
    check(
      "conversations_last_message_after_start",
      sql`${table.lastMessageAt} IS NULL OR ${table.lastMessageAt} >= ${table.startedAt}`,
    ),
  ],
);

// Solo inserción: crm_app no tiene UPDATE ni DELETE y un trigger rechaza ambos (brief-6.1, D-3).
export const messages = pgTable(
  "messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "restrict" }),
    conversationId: uuid("conversation_id").notNull(),
    direction: messageDirection("direction").notNull(),
    externalRef: text("external_ref"),
    sentAt: timestamp("sent_at", { withTimezone: true }).notNull(),
    // Solo texto: los adjuntos quedan fuera del MVP.
    bodyText: text("body_text"),
    kind: messageKind("kind"),
    sentBy: messageSender("sent_by"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    foreignKey({
      name: "messages_conversation_fk",
      columns: [table.organizationId, table.conversationId],
      foreignColumns: [conversations.organizationId, conversations.id],
    }).onDelete("restrict"),
    uniqueIndex("messages_organization_conversation_external_ref_unique")
      .on(table.organizationId, table.conversationId, table.externalRef)
      .where(sql`${table.externalRef} IS NOT NULL`),
    // Timeline, conteo por conversación y primer mensaje (pantallas 7 a 9, métrica 9).
    index("messages_conversation_sent_idx").on(
      table.conversationId,
      table.sentAt,
    ),
    // Métricas 2 a 10.
    index("messages_organization_sent_idx").on(
      table.organizationId,
      table.sentAt,
    ),
    check(
      "messages_external_ref_not_blank",
      sql`btrim(${table.externalRef}) <> ''`,
    ),
    // El autor de una entrada siempre es el cliente (brief-12.3, D-3).
    check(
      "messages_sent_by_only_outbound",
      sql`${table.direction} = 'outbound' OR ${table.sentBy} IS NULL`,
    ),
  ],
);

// Notas internas de una conversación (brief-16.4, D-1). Solo inserción, como messages: crm_app no
// tiene UPDATE ni DELETE y un trigger rechaza ambos, salvo el vaciado del texto (ADR 0015). El
// texto vive solo acá: la auditoría guarda el id de la nota, nunca el texto (D-4).
export const conversationNotes = pgTable(
  "conversation_notes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "restrict" }),
    conversationId: uuid("conversation_id").notNull(),
    actorUserId: uuid("actor_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    // Nulo solo después del vaciado de los datos del cliente (D-5).
    bodyText: text("body_text"),
    // Hora del INSERT, no del inicio de la transacción, como inventory_movements.
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .default(sql`clock_timestamp()`),
  },
  (table) => [
    foreignKey({
      name: "conversation_notes_conversation_fk",
      columns: [table.organizationId, table.conversationId],
      foreignColumns: [conversations.organizationId, conversations.id],
    }).onDelete("restrict"),
    // Pantalla 9: de la más reciente a la más vieja (D-3).
    index("conversation_notes_conversation_created_idx").on(
      table.organizationId,
      table.conversationId,
      table.createdAt.desc(),
    ),
    // Una nota no se corrige: el texto llega recortado y entre 1 y 1000 caracteres (D-3).
    check(
      "conversation_notes_body_text_valid",
      sql`${table.bodyText} IS NULL OR (${table.bodyText} = btrim(${table.bodyText}) AND char_length(${table.bodyText}) BETWEEN 1 AND 1000)`,
    ),
  ],
);

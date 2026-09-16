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
  ],
);

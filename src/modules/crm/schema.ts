import { sql, type AnyColumn, type SQL } from "drizzle-orm";
import {
  boolean,
  check,
  foreignKey,
  index,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { organizations } from "@/modules/organizations/schema";
import { DEFAULT_TAG_COLOR, TAG_COLORS } from "./tag-colors";

// Normalización de texto para buscar por prefijo sin distinguir mayúsculas ni acentos
// (brief-9.0.2, D-1 y D-2). `immutable_unaccent` la define la migración 0015.
//
// Una sola definición por módulo, usada por **el índice y la consulta**: si las dos expresiones se
// separan, el índice deja de usarse y la búsqueda recorre la tabla sin que ningún test falle.
// Está duplicada respecto de `catalog` a propósito, igual que `likePrefix`: un módulo no importa
// internos de otro, y compartirla exigiría un módulo común que hoy no se justifica.
export function searchNormalized(column: AnyColumn): SQL {
  return sql`immutable_unaccent(lower(${column}))`;
}

// docs/architecture/DataModel.md, tabla clients (brief-5.1).
export const clients = pgTable(
  "clients",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "restrict" }),
    displayName: text("display_name").notNull(),
    // Único identificador de negocio del cliente (ADR 0007); opcional.
    phoneE164: text("phone_e164"),
    notes: text("notes"),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    // Alcanza también a los inactivos: un número pertenece a un solo cliente (D-3).
    uniqueIndex("clients_organization_phone_unique")
      .on(table.organizationId, table.phoneE164)
      .where(sql`${table.phoneE164} IS NOT NULL`),
    // Destino de la clave foránea compuesta de conversations: una conversación no puede
    // apuntar al cliente de otra organización (brief-5.1, D-4; brief-6.1).
    unique("clients_organization_id_id_unique").on(
      table.organizationId,
      table.id,
    ),
    // Prefijo de nombre sin distinguir mayúsculas ni acentos, como productos (D-2; brief-9.0.2).
    // La expresión tiene que ser IDÉNTICA a la de `searchConditions`. El ORDEN de la lista sigue
    // usando `lower(display_name)` a secas y no se toca: unir "Avila" con "Ávila" en el orden es
    // otra decisión de producto (brief-9.0.2, hallazgo 5).
    index("clients_organization_display_name_unaccent_idx").on(
      table.organizationId,
      sql`${searchNormalized(table.displayName)} text_pattern_ops`,
    ),
    // Solo E.164 canónico: sin forma única, la unicidad no detecta el mismo número (D-1).
    check(
      "clients_phone_e164_format",
      sql`${table.phoneE164} ~ '^\\+[1-9][0-9]{1,14}$'`,
    ),
  ],
);

// docs/architecture/DataModel.md, tabla client_tags (brief-16.1, D-2). El catálogo de etiquetas de
// clientes de una organización. Editable con auditoría y sin borrado: crm_app no tiene DELETE, se
// desactiva (D-8).
export const clientTags = pgTable(
  "client_tags",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "restrict" }),
    name: text("name").notNull(),
    color: text("color").notNull().default(DEFAULT_TAG_COLOR),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    // Un nombre por organización, sin distinguir mayúsculas, también frente a las inactivas (D-2).
    uniqueIndex("client_tags_organization_name_lower_unique").on(
      table.organizationId,
      sql`lower(${table.name})`,
    ),
    // Destino de la clave compuesta de client_tag_assignments: una asignación no puede usar la
    // etiqueta de otra organización (invariante 1).
    unique("client_tags_organization_id_id_unique").on(
      table.organizationId,
      table.id,
    ),
    check(
      "client_tags_name_length",
      sql`char_length(${table.name}) between 1 and 40`,
    ),
    check(
      "client_tags_color",
      sql.raw(`color in (${TAG_COLORS.map((c) => `'${c}'`).join(", ")})`),
    ),
  ],
);

// docs/architecture/DataModel.md, tabla client_tag_assignments (brief-16.1, D-2 y D-6). Qué cliente
// tiene qué etiqueta. Una relación, no una entidad: quitar una etiqueta borra la fila, y el
// historial está en la auditoría del cliente. crm_app tiene SELECT, INSERT y DELETE, sin UPDATE.
export const clientTagAssignments = pgTable(
  "client_tag_assignments",
  {
    organizationId: uuid("organization_id").notNull(),
    clientId: uuid("client_id").notNull(),
    tagId: uuid("tag_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    primaryKey({
      name: "client_tag_assignments_pkey",
      columns: [table.clientId, table.tagId],
    }),
    // Compuestas: el cliente y la etiqueta son de la misma organización que la fila (invariante 1).
    // La asignación depende del cliente y se va con él (regla 5); una etiqueta no se borra nunca.
    foreignKey({
      name: "client_tag_assignments_client_fk",
      columns: [table.organizationId, table.clientId],
      foreignColumns: [clients.organizationId, clients.id],
    }).onDelete("cascade"),
    foreignKey({
      name: "client_tag_assignments_tag_fk",
      columns: [table.organizationId, table.tagId],
      foreignColumns: [clientTags.organizationId, clientTags.id],
    }).onDelete("restrict"),
    // El filtro de la lista de clientes por etiqueta (FR-CLI-10).
    index("client_tag_assignments_organization_tag_idx").on(
      table.organizationId,
      table.tagId,
    ),
  ],
);

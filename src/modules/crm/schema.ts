import { sql, type AnyColumn, type SQL } from "drizzle-orm";
import {
  boolean,
  check,
  foreignKey,
  index,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { organizations } from "@/modules/organizations/schema";
import { PROVINCE_CODES } from "./provinces";
import { DEFAULT_TAG_COLOR, TAG_COLORS } from "./tag-colors";

// Tipo de cliente (brief-17.1, D-3). «Consumidor final» no es un tipo sino una condición frente al
// IVA, que llega con el comprobante de la Fase 20 en su propio campo. Nulo es «sin dato».
export const CLIENT_KINDS = ["person", "company"] as const;
export type ClientKind = (typeof CLIENT_KINDS)[number];
export const clientKind = pgEnum("client_kind", CLIENT_KINDS);

// Límites de los campos de la 17.1 (D-6). Los mismos valores van en los CHECK de la tabla.
export const CLIENT_FIELD_LIMITS = {
  email: 254,
  companyName: 120,
  jobTitle: 120,
  addressLine: 200,
  city: 120,
  postalCode: 10,
  segment: 60,
} as const;

// Código postal argentino, viejo o CPA (1425, C1425ABC): letras y números en mayúsculas, con
// espacios internos, recortado. El servicio lo lleva a esta forma antes de guardar.
export const POSTAL_CODE_PATTERN = "^[A-Z0-9][A-Z0-9 ]{0,9}$";

// El DNI, de 7 u 8 dígitos sin puntos, y el usuario de Instagram sin @ (brief-29.7, D-6). Los mismos
// patrones van en los CHECK de la tabla.
export const DOCUMENT_NUMBER_PATTERN = "^[0-9]{7,8}$";
export const INSTAGRAM_PATTERN = "^[A-Za-z0-9._]{1,30}$";

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
    // Desde la 17.1 (brief-17.1, D-2): todos opcionales, cargados solo por un admin. Ninguno es
    // identificador ni único: el único identificador sigue siendo el teléfono (ADR 0007). Email,
    // calle y código postal no llegan a un viewer (D-8). El vaciado de un cliente los lleva a nulo
    // (D-12), y un test exige que toda columna nulable de esta tabla quede nula al vaciar.
    email: text("email"),
    kind: clientKind("kind"),
    companyName: text("company_name"),
    jobTitle: text("job_title"),
    addressLine: text("address_line"),
    city: text("city"),
    province: text("province"),
    postalCode: text("postal_code"),
    segment: text("segment"),
    // Desde la 29.7 (ADR 0024, punto 14; brief-29.7, D-6): opcionales y sin unicidad. El DNI nunca
    // identifica al cliente (ADR 0007, nota del 2026-10-18). Como el email, no llegan a un viewer ni
    // al agente, y el vaciado los lleva a nulo.
    documentNumber: text("document_number"),
    instagram: text("instagram"),
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
    // Forma y largo de los campos de la 17.1 (D-6), también contra SQL escrito a mano. Sin unicidad.
    check(
      "clients_email_format",
      sql`${table.email} = lower(${table.email}) and char_length(${table.email}) <= ${sql.raw(String(CLIENT_FIELD_LIMITS.email))} and position('@' in ${table.email}) > 1`,
    ),
    check(
      "clients_company_name_length",
      sql`char_length(${table.companyName}) between 1 and ${sql.raw(String(CLIENT_FIELD_LIMITS.companyName))}`,
    ),
    check(
      "clients_job_title_length",
      sql`char_length(${table.jobTitle}) between 1 and ${sql.raw(String(CLIENT_FIELD_LIMITS.jobTitle))}`,
    ),
    check(
      "clients_address_line_length",
      sql`char_length(${table.addressLine}) between 1 and ${sql.raw(String(CLIENT_FIELD_LIMITS.addressLine))}`,
    ),
    check(
      "clients_city_length",
      sql`char_length(${table.city}) between 1 and ${sql.raw(String(CLIENT_FIELD_LIMITS.city))}`,
    ),
    check(
      "clients_province",
      sql.raw(
        `province in (${PROVINCE_CODES.map((code) => `'${code}'`).join(", ")})`,
      ),
    ),
    check(
      "clients_postal_code_format",
      sql`${table.postalCode} ~ ${sql.raw(`'${POSTAL_CODE_PATTERN}'`)}`,
    ),
    check(
      "clients_segment_length",
      sql`char_length(${table.segment}) between 1 and ${sql.raw(String(CLIENT_FIELD_LIMITS.segment))}`,
    ),
    check(
      "clients_document_number_format",
      sql`${table.documentNumber} ~ ${sql.raw(`'${DOCUMENT_NUMBER_PATTERN}'`)}`,
    ),
    check(
      "clients_instagram_format",
      sql`${table.instagram} ~ ${sql.raw(`'${INSTAGRAM_PATTERN}'`)}`,
    ),
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

import { sql, type SQL } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  index,
  pgTable,
  smallint,
  text,
  time,
  timestamp,
  uniqueIndex,
  uuid,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";
import { organizations } from "@/modules/organizations/schema";
import { searchQuery, searchVector, tsvector } from "@/shared/search";

// docs/architecture/DataModel.md, tabla knowledge_entries (brief-11.2, D-2 y D-3). Información del
// negocio: horarios, ubicación, medios de pago, envíos. Editable con auditoría y sin borrado: el
// rol crm_app no tiene DELETE (D-4).
export const knowledgeEntries = pgTable(
  "knowledge_entries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "restrict" }),
    title: text("title").notNull(),
    // Texto libre con sugerencias, un solo nivel (D-2).
    category: text("category").notNull(),
    // Texto plano: la pantalla lo muestra escapado, con sus saltos de línea.
    content: text("content").notNull(),
    isActive: boolean("is_active").notNull().default(true),
    // Fechas de calendario inclusivas y opcionales, leídas en la zona de la organización (D-3).
    validFrom: date("valid_from", { mode: "string" }),
    validUntil: date("valid_until", { mode: "string" }),
    // La escribe PostgreSQL. El título pesa más que la categoría, y la categoría más que el
    // contenido, para ordenar por relevancia (D-6).
    search: tsvector("search")
      .notNull()
      .generatedAlwaysAs(
        (): SQL =>
          sql`setweight(${searchVector(sql`${knowledgeEntries.title}`)}, 'A') || setweight(${searchVector(sql`${knowledgeEntries.category}`)}, 'B') || setweight(${searchVector(sql`${knowledgeEntries.content}`)}, 'C')`,
      ),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    // Un título por organización, sin distinguir mayúsculas, también frente a las inactivas (D-5).
    uniqueIndex("knowledge_entries_organization_title_lower_unique").on(
      table.organizationId,
      sql`lower(${table.title})`,
    ),
    // Como en products: el GIN no combina organization_id sin btree_gin, así que la organización
    // se filtra después del índice.
    index("knowledge_entries_search_idx").using("gin", table.search),
    check(
      "knowledge_entries_title_length",
      sql`char_length(${table.title}) between 1 and 200`,
    ),
    check(
      "knowledge_entries_category_length",
      sql`char_length(${table.category}) between 1 and 100`,
    ),
    check(
      "knowledge_entries_content_length",
      sql`char_length(${table.content}) between 1 and 4000`,
    ),
    check(
      "knowledge_entries_validity_order",
      sql`${table.validUntil} >= ${table.validFrom}`,
    ),
  ],
);

// Los dos tramos de un día del horario (brief-17.4, D-2), comunes al semanal y a las excepciones.
// Sin el primero, el día está cerrado. La base exige cada tramo completo y en orden, el segundo
// después del primero sin tocarlo, y minutos enteros. Ningún tramo cruza la medianoche: el
// servicio acepta de 00:00 a 23:59.
function slotColumns() {
  return {
    opens1: time("opens_1"),
    closes1: time("closes_1"),
    opens2: time("opens_2"),
    closes2: time("closes_2"),
  };
}

type SlotTable = {
  opens1: AnyPgColumn;
  closes1: AnyPgColumn;
  opens2: AnyPgColumn;
  closes2: AnyPgColumn;
};

function slotChecks(name: string, table: SlotTable) {
  const { opens1, closes1, opens2, closes2 } = table;
  return [
    check(
      `${name}_slot_1_complete`,
      sql`(${opens1} is null) = (${closes1} is null)`,
    ),
    check(
      `${name}_slot_2_complete`,
      sql`(${opens2} is null) = (${closes2} is null)`,
    ),
    check(
      `${name}_slot_2_after_1`,
      sql`${opens2} is null or (${opens1} is not null and ${opens2} > ${closes1})`,
    ),
    check(`${name}_slot_1_order`, sql`${opens1} < ${closes1}`),
    check(`${name}_slot_2_order`, sql`${opens2} < ${closes2}`),
    check(
      `${name}_whole_minutes`,
      sql`extract(second from ${opens1}) = 0 and extract(second from ${closes1}) = 0 and extract(second from ${opens2}) = 0 and extract(second from ${closes2}) = 0`,
    ),
  ];
}

// docs/architecture/DataModel.md, tabla business_hours (brief-17.4, D-2 y D-3). El horario semanal:
// una fila por día de la semana, del 1 (lunes) al 7 (domingo), ISO 8601. Se guarda la semana entera
// de una vez, así que las filas se escriben y se actualizan, nunca se borran.
export const businessHours = pgTable(
  "business_hours",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "restrict" }),
    weekday: smallint("weekday").notNull(),
    ...slotColumns(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex("business_hours_organization_weekday_unique").on(
      table.organizationId,
      table.weekday,
    ),
    check(
      "business_hours_weekday_range",
      sql`${table.weekday} between 1 and 7`,
    ),
    ...slotChecks("business_hours", table),
  ],
);

// Las excepciones por fecha (D-2): un día cerrado o con sus propios tramos, que reemplaza al
// semanal en esa fecha de la zona de la organización. Se crean y se quitan; no se editan.
export const businessHourExceptions = pgTable(
  "business_hour_exceptions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "restrict" }),
    date: date("date", { mode: "string" }).notNull(),
    ...slotColumns(),
    reason: text("reason"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("business_hour_exceptions_organization_date_unique").on(
      table.organizationId,
      table.date,
    ),
    check(
      "business_hour_exceptions_reason_length",
      sql`char_length(${table.reason}) between 1 and 100`,
    ),
    ...slotChecks("business_hour_exceptions", table),
  ],
);

// La condición de la búsqueda por palabras, contra la columna generada que tiene el índice GIN.
// La usan el repositorio y el test con EXPLAIN (brief-11.2, AC-4).
export function knowledgeSearchCondition(text: string): SQL {
  return sql`${knowledgeEntries.search} @@ ${searchQuery(text)}`;
}

// Relevancia de una entrada para un texto buscado, con los pesos de la columna.
export function knowledgeSearchRank(text: string): SQL<number> {
  return sql<number>`ts_rank(${knowledgeEntries.search}, ${searchQuery(text)})`;
}

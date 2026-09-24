import { sql, type SQL } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  index,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
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

// La condición de la búsqueda por palabras, contra la columna generada que tiene el índice GIN.
// La usan el repositorio y el test con EXPLAIN (brief-11.2, AC-4).
export function knowledgeSearchCondition(text: string): SQL {
  return sql`${knowledgeEntries.search} @@ ${searchQuery(text)}`;
}

// Relevancia de una entrada para un texto buscado, con los pesos de la columna.
export function knowledgeSearchRank(text: string): SQL<number> {
  return sql<number>`ts_rank(${knowledgeEntries.search}, ${searchQuery(text)})`;
}

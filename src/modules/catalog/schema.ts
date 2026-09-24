import { sql, type SQL } from "drizzle-orm";
import {
  boolean,
  check,
  customType,
  index,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { organizations } from "@/modules/organizations/schema";

// Búsqueda por palabras sueltas sobre nombre, marca y categoría (brief-11.1, D-4), sin distinguir
// mayúsculas ni acentos. `immutable_unaccent` la define la migración 0015.
//
// El documento y la consulta pasan por **la misma normalización y el mismo parser** (`simple`):
// vive acá, en una sola función, y la usan la columna generada y la consulta. Si se separaran,
// una palabra se partiría distinto en cada lado y la búsqueda dejaría de encontrar sin que falle
// nada. Por el mismo motivo la consulta no parte el texto en TypeScript: «1.5» es una sola palabra
// para el parser y serían dos para un `split`.
function searchVector(text: SQL): SQL {
  return sql`to_tsvector('simple', immutable_unaccent(lower(${text})))`;
}

const tsvector = customType<{ data: string }>({
  dataType: () => "tsvector",
});

// La consulta: cada palabra que el parser saca del texto buscado, como prefijo, unidas con Y. Las
// palabras se arman como `tsquery` desde el vector, nunca con el texto crudo, así que `&`, `|`,
// `!`, `:` o una comilla que escriba el usuario no son sintaxis. Sin palabras da NULL, y
// `search @@ NULL` no encuentra nada.
export function productSearchQuery(text: string): SQL {
  return sql`(select string_agg('''' || replace(replace(l.lexeme, '\\', '\\\\'), '''', '''''') || ''':*', ' & ')::tsquery
    from unnest(${searchVector(sql`${text}`)}) l)`;
}

// Condición comercial (brief-11.1, D-3). Agregar un valor es un ALTER TYPE aditivo.
export const productCondition = pgEnum("product_condition", [
  "new",
  "refurbished",
]);

// docs/architecture/DataModel.md, tabla products (brief-4.1; marca, categoría, condición y
// búsqueda, brief-11.1).
export const products = pgTable(
  "products",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "restrict" }),
    // Se guarda como lo escribió el usuario; la unicidad no distingue mayúsculas (D-6).
    sku: text("sku").notNull(),
    name: text("name").notNull(),
    description: text("description"),
    unit: text("unit").notNull().default("unidad"),
    // Escala fija: comparaciones exactas y sin decimales infinitos (D-4). Drizzle lo devuelve como string.
    reorderPoint: numeric("reorder_point", { precision: 14, scale: 3 })
      .notNull()
      .default("0"),
    // Texto libre y opcional (brief-11.1, D-2): la búsqueda por palabras los cubre sin tablas propias.
    brand: text("brand"),
    category: text("category"),
    condition: productCondition("condition").notNull().default("new"),
    // La escribe PostgreSQL; ningún insert ni update la envía.
    search: tsvector("search")
      .notNull()
      .generatedAlwaysAs((): SQL =>
        searchVector(
          sql`${products.name} || ' ' || coalesce(${products.brand}, '') || ' ' || coalesce(${products.category}, '')`,
        ),
      ),
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
    uniqueIndex("products_organization_sku_lower_unique").on(
      table.organizationId,
      sql`lower(${table.sku})`,
    ),
    // Destino de las claves foráneas compuestas de inventory: un saldo o movimiento no puede
    // apuntar al producto de otra organización (D-3).
    unique("products_organization_id_id_unique").on(
      table.organizationId,
      table.id,
    ),
    // Búsqueda por palabras (brief-11.1, D-4). Reemplaza al índice de prefijo de nombre de la
    // 9.0.2. No lleva organization_id: un GIN no lo combina sin la extensión btree_gin, así que la
    // organización se filtra después del índice.
    index("products_search_idx").using("gin", table.search),
    check(
      "products_reorder_point_non_negative",
      sql`${table.reorderPoint} >= 0`,
    ),
  ],
);

// La condición completa de la búsqueda por palabras, contra la columna generada que tiene el
// índice GIN. La usan el repositorio y el test con EXPLAIN (brief-11.1, AC-4): si alguien la
// cambiara para recalcular el vector en lugar de leer la columna, el índice dejaría de usarse
// sin que la búsqueda devuelva nada distinto, y el test lo ve.
export function productSearchCondition(text: string): SQL {
  return sql`${products.search} @@ ${productSearchQuery(text)}`;
}

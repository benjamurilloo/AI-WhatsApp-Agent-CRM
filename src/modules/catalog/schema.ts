import { sql, type SQL } from "drizzle-orm";
import {
  boolean,
  check,
  foreignKey,
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
import { users } from "@/modules/auth/schema";
import { organizations } from "@/modules/organizations/schema";
import { searchQuery, searchVector, tsvector } from "@/shared/search";

// Búsqueda por palabras sueltas sobre nombre, marca y categoría (brief-11.1, D-4). La
// normalización y el armado de la consulta viven en src/shared/search, compartidos con
// knowledge (brief-11.2, D-6).

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
  return sql`${products.search} @@ ${searchQuery(text)}`;
}

// docs/architecture/DataModel.md, tabla product_prices (brief-11.1, D-5). Solo inserción: el rol
// crm_app no tiene UPDATE ni DELETE y un trigger rechaza ambos (ADR 0013). El precio vigente de
// un producto es su última fila; un producto sin filas no tiene precio.
export const productPrices = pgTable(
  "product_prices",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "restrict" }),
    productId: uuid("product_id").notNull(),
    // Dos decimales como máximo: las monedas con tres se rechazan (D-5). Drizzle lo devuelve
    // como string, y la aplicación lo lee en centésimas con src/shared/money.
    amount: numeric("amount", { precision: 14, scale: 2 }).notNull(),
    // ISO 4217, validada contra Intl al fijar el precio; la base solo exige la forma.
    currency: text("currency").notNull(),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    // Hora del INSERT, con el producto bloqueado: el orden por created_at es el orden en que se
    // fijaron los precios, como en inventory_movements (brief-4.3.3, D-1).
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .default(sql`clock_timestamp()`),
  },
  (table) => [
    // Un precio no puede apuntar al producto de otra organización, como el inventario.
    foreignKey({
      name: "product_prices_product_fk",
      columns: [table.organizationId, table.productId],
      foreignColumns: [products.organizationId, products.id],
    }).onDelete("restrict"),
    index("product_prices_product_history_idx").on(
      table.organizationId,
      table.productId,
      table.createdAt.desc(),
    ),
    check("product_prices_amount_positive", sql`${table.amount} > 0`),
    check(
      "product_prices_currency_format",
      sql`${table.currency} ~ '^[A-Z]{3}$'`,
    ),
  ],
);

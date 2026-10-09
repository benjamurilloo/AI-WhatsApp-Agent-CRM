import { sql, type SQL } from "drizzle-orm";
import {
  boolean,
  check,
  customType,
  foreignKey,
  index,
  numeric,
  pgEnum,
  pgTable,
  smallint,
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

// Campos de operación (brief-17.2, D-3, D-5 y D-6): los largos de los textos y las escalas de los
// números. La base los exige con CHECK; el servicio, con los mismos valores.
export const PRODUCT_FIELD_LIMITS = {
  barcode: 64,
  location: 60,
  shelf: 30,
} as const;

// numeric(10, 3) para el peso en kg y numeric(8, 1) para las dimensiones en cm: dígitos enteros
// y decimales que admite cada uno.
export const WEIGHT_SCALE = { integerDigits: 7, decimals: 3 } as const;
export const DIMENSION_SCALE = { integerDigits: 7, decimals: 1 } as const;

// docs/architecture/DataModel.md, tabla products (brief-4.1; marca, categoría, condición y
// búsqueda, brief-11.1; campos de operación, brief-17.2).
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
    // Campos de operación (brief-17.2), todos opcionales. El código de barras se guarda como se
    // escribió y es único por organización sin distinguir mayúsculas, como el SKU (D-3). Peso en
    // kg y dimensiones en cm, con unidad fija (D-5); las tres dimensiones van juntas o ninguna.
    barcode: text("barcode"),
    weightKg: numeric("weight_kg", { precision: 10, scale: 3 }),
    lengthCm: numeric("length_cm", { precision: 8, scale: 1 }),
    widthCm: numeric("width_cm", { precision: 8, scale: 1 }),
    heightCm: numeric("height_cm", { precision: 8, scale: 1 }),
    // Con un solo depósito, la ubicación es del producto; con varios, sería del saldo de cada
    // depósito y estas columnas se migran (D-6).
    location: text("location"),
    shelf: text("shelf"),
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
    // Único por organización sin distinguir mayúsculas, solo entre los que tienen código
    // (brief-17.2, D-3). Sirve también la búsqueda exacta de la lista (D-4, D-12).
    uniqueIndex("products_organization_barcode_lower_unique")
      .on(table.organizationId, sql`lower(${table.barcode})`)
      .where(sql`${table.barcode} is not null`),
    check(
      "products_barcode_format",
      sql`${table.barcode} ~ ${sql.raw(`'^\\S{1,${PRODUCT_FIELD_LIMITS.barcode}}$'`)}`,
    ),
    check("products_weight_kg_positive", sql`${table.weightKg} > 0`),
    check("products_length_cm_positive", sql`${table.lengthCm} > 0`),
    check("products_width_cm_positive", sql`${table.widthCm} > 0`),
    check("products_height_cm_positive", sql`${table.heightCm} > 0`),
    check(
      "products_dimensions_together",
      sql`(${table.lengthCm} is null and ${table.widthCm} is null and ${table.heightCm} is null) or (${table.lengthCm} is not null and ${table.widthCm} is not null and ${table.heightCm} is not null)`,
    ),
    check(
      "products_location_length",
      sql`char_length(${table.location}) between 1 and ${sql.raw(String(PRODUCT_FIELD_LIMITS.location))}`,
    ),
    check(
      "products_shelf_length",
      sql`char_length(${table.shelf}) between 1 and ${sql.raw(String(PRODUCT_FIELD_LIMITS.shelf))}`,
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

// Imagen de producto (ADR 0018; brief-17.5, D-1, D-3 y D-4). Solo se guarda la versión procesada,
// en JPEG, y su miniatura. Los límites de la base están por encima de lo que produce el
// procesamiento: son una red, no la validación.
export const PRODUCT_IMAGE_LIMITS = {
  uploadBytes: 5 * 1024 * 1024,
  inputPixels: 40_000_000,
  imageSide: 1600,
  thumbnailSide: 400,
  storedImageBytes: 2 * 1024 * 1024,
  storedThumbnailBytes: 200 * 1024,
} as const;

const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType() {
    return "bytea";
  },
});

// docs/architecture/DataModel.md, tabla product_images (brief-17.5, D-3). Una fila por imagen,
// con su orden; mientras haya una sola imagen por producto, position es 0 y la galería cambia el
// CHECK, no los datos. crm_app no tiene UPDATE: reemplazar es borrar e insertar. Listar o buscar
// productos no lee esta tabla.
export const productImages = pgTable(
  "product_images",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "restrict" }),
    productId: uuid("product_id").notNull(),
    position: smallint("position").notNull().default(0),
    image: bytea("image").notNull(),
    thumbnail: bytea("thumbnail").notNull(),
    // SHA-256 del JPEG guardado, en hexadecimal: la versión en la dirección de la imagen y la
    // comprobación del ejercicio de restauración (D-10).
    sha256: text("sha256").notNull(),
    width: smallint("width").notNull(),
    height: smallint("height").notNull(),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    // Una imagen no puede apuntar al producto de otra organización, como los precios.
    foreignKey({
      name: "product_images_product_fk",
      columns: [table.organizationId, table.productId],
      foreignColumns: [products.organizationId, products.id],
    }).onDelete("restrict"),
    uniqueIndex("product_images_product_position_unique").on(
      table.organizationId,
      table.productId,
      table.position,
    ),
    check("product_images_single_position", sql`${table.position} = 0`),
    check(
      "product_images_image_size",
      sql`octet_length(${table.image}) between 1 and ${sql.raw(String(PRODUCT_IMAGE_LIMITS.storedImageBytes))}`,
    ),
    check(
      "product_images_thumbnail_size",
      sql`octet_length(${table.thumbnail}) between 1 and ${sql.raw(String(PRODUCT_IMAGE_LIMITS.storedThumbnailBytes))}`,
    ),
    check(
      "product_images_sha256_format",
      sql`${table.sha256} ~ '^[0-9a-f]{64}$'`,
    ),
    check(
      "product_images_dimensions",
      sql`${table.width} between 1 and ${sql.raw(String(PRODUCT_IMAGE_LIMITS.imageSide))} and ${table.height} between 1 and ${sql.raw(String(PRODUCT_IMAGE_LIMITS.imageSide))}`,
    ),
  ],
);

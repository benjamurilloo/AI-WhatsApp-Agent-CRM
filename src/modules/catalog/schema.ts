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

// Condición comercial (brief-11.1, D-3). Agregar un valor es un ALTER TYPE aditivo. used, desde la
// 29.5 (ADR 0024, punto 6; brief-29.5, D-2): solo con la capacidad serialized_units. El agente lo ve
// solo por read-v3, desde la 29.8; read-v1 y read-v2 siguen sin él (brief-29.8, D-2).
export const productCondition = pgEnum("product_condition", [
  "new",
  "refurbished",
  "used",
]);

// Cómo se lleva el stock del producto (ADR 0024, punto 6; brief-29.5, D-2 y D-3): por cantidad o por
// unidad, cada una con su IMEI. Lo cambia solo inventory, mientras el producto no tenga movimientos.
export const stockTracking = pgEnum("stock_tracking", ["quantity", "unit"]);

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

// Modelos de producto, de la capacidad variants (ADR 0024, punto 5; brief-29.2, D-4): agrupan las
// combinaciones de un mismo equipo («iPhone 13»), cada una un producto. Nombre único por
// organización sin distinguir mayúsculas.
export const MODEL_NAME_MAX_LENGTH = 120;
export const MODEL_BRAND_MAX_LENGTH = 100;

export const productModels = pgTable(
  "product_models",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "restrict" }),
    name: text("name").notNull(),
    brand: text("brand"),
    position: smallint("position").notNull().default(0),
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
    uniqueIndex("product_models_organization_name_lower_unique").on(
      table.organizationId,
      sql`lower(${table.name})`,
    ),
    // Destino de la clave compuesta de products.model_id.
    unique("product_models_organization_id_id_unique").on(
      table.organizationId,
      table.id,
    ),
    check(
      "product_models_name_length",
      sql`char_length(${table.name}) between 1 and ${sql.raw(String(MODEL_NAME_MAX_LENGTH))}`,
    ),
    check(
      "product_models_brand_length",
      sql`char_length(${table.brand}) between 1 and ${sql.raw(String(MODEL_BRAND_MAX_LENGTH))}`,
    ),
    check("product_models_position_range", sql`${table.position} >= 0`),
  ],
);

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
    // Desde la 29.5 (D-3). No es un campo del formulario: lo escribe writeProductTracking.
    tracking: stockTracking("tracking").notNull().default("quantity"),
    // El producto de servicio de las reparaciones (ADR 0024, punto 10; brief-29.6, D-5): uno por
    // organización, lo crea org:capability y nunca tiene stock. Se vende solo por su orden de
    // servicio. Lo fija el alta y no cambia (trigger de la 0058).
    isService: boolean("is_service").notNull().default(false),
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
    // Modelo, opcional (brief-29.2, D-4): solo con la capacidad variants, y un accesorio no lo
    // tiene. La clave compuesta impide apuntar al modelo de otra organización.
    modelId: uuid("model_id"),
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
    foreignKey({
      name: "products_model_fk",
      columns: [table.organizationId, table.modelId],
      foreignColumns: [productModels.organizationId, productModels.id],
    }).onDelete("restrict"),
    index("products_model_idx")
      .on(table.organizationId, table.modelId)
      .where(sql`${table.modelId} is not null`),
    // El producto de servicio se lleva por cantidad (brief-29.6, D-5): nunca tiene unidades.
    check(
      "products_service_quantity",
      sql`not ${table.isService} or ${table.tracking} = 'quantity'`,
    ),
    // Uno por organización (D-5).
    uniqueIndex("products_organization_service_unique")
      .on(table.organizationId)
      .where(sql`${table.isService}`),
  ],
);

// Atributos definidos por la organización (ADR 0024, punto 4; brief-29.2, D-5). La entidad nace
// solo con product; unit entra con la 29.5. Una definición con valores no cambia de tipo ni de
// entidad: se desactiva y se crea otra. Sin jsonb: cada valor va en la columna de su tipo.
export const attributeEntity = pgEnum("attribute_entity", ["product"]);
export const attributeType = pgEnum("attribute_type", [
  "text",
  "number",
  "boolean",
  "option",
]);

export const ATTRIBUTE_LIMITS = {
  key: 40,
  name: 60,
  optionLabel: 60,
  textValue: 200,
} as const;

export const attributeDefinitions = pgTable(
  "attribute_definitions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "restrict" }),
    entity: attributeEntity("entity").notNull(),
    key: text("key").notNull(),
    name: text("name").notNull(),
    type: attributeType("type").notNull(),
    isRequired: boolean("is_required").notNull().default(false),
    // De variante: distingue las combinaciones de un modelo. Es obligatorio y de opciones, para
    // que el duplicado se pueda comparar (D-5).
    isVariant: boolean("is_variant").notNull().default(false),
    position: smallint("position").notNull().default(0),
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
    unique("attribute_definitions_organization_entity_key_unique").on(
      table.organizationId,
      table.entity,
      table.key,
    ),
    unique("attribute_definitions_organization_id_id_unique").on(
      table.organizationId,
      table.id,
    ),
    check(
      "attribute_definitions_key_format",
      sql`${table.key} ~ ${sql.raw(`'^[a-z][a-z0-9_]{0,${ATTRIBUTE_LIMITS.key - 1}}$'`)}`,
    ),
    check(
      "attribute_definitions_name_length",
      sql`char_length(${table.name}) between 1 and ${sql.raw(String(ATTRIBUTE_LIMITS.name))}`,
    ),
    check(
      "attribute_definitions_variant_rule",
      sql`not ${table.isVariant} or (${table.type} = 'option' and ${table.isRequired} and ${table.entity} = 'product')`,
    ),
    check("attribute_definitions_position_range", sql`${table.position} >= 0`),
  ],
);

export const attributeOptions = pgTable(
  "attribute_options",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "restrict" }),
    definitionId: uuid("definition_id").notNull(),
    label: text("label").notNull(),
    position: smallint("position").notNull().default(0),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    foreignKey({
      name: "attribute_options_definition_fk",
      columns: [table.organizationId, table.definitionId],
      foreignColumns: [
        attributeDefinitions.organizationId,
        attributeDefinitions.id,
      ],
    }).onDelete("restrict"),
    uniqueIndex("attribute_options_definition_label_lower_unique").on(
      table.organizationId,
      table.definitionId,
      sql`lower(${table.label})`,
    ),
    // Destino de la clave de attribute_values: la opción tiene que ser de esa definición.
    unique("attribute_options_organization_definition_id_unique").on(
      table.organizationId,
      table.definitionId,
      table.id,
    ),
    check(
      "attribute_options_label_length",
      sql`char_length(${table.label}) between 1 and ${sql.raw(String(ATTRIBUTE_LIMITS.optionLabel))}`,
    ),
    check("attribute_options_position_range", sql`${table.position} >= 0`),
  ],
);

// Un valor por producto y definición, en la columna de su tipo (ADR 0024, punto 4). Que la columna
// sea la del tipo de la definición lo exige el servicio; la base exige que haya exactamente una.
export const attributeValues = pgTable(
  "attribute_values",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "restrict" }),
    productId: uuid("product_id").notNull(),
    definitionId: uuid("definition_id").notNull(),
    textValue: text("text_value"),
    numberValue: numeric("number_value", { precision: 14, scale: 3 }),
    booleanValue: boolean("boolean_value"),
    optionId: uuid("option_id"),
  },
  (table) => [
    foreignKey({
      name: "attribute_values_product_fk",
      columns: [table.organizationId, table.productId],
      foreignColumns: [products.organizationId, products.id],
    }).onDelete("restrict"),
    foreignKey({
      name: "attribute_values_definition_fk",
      columns: [table.organizationId, table.definitionId],
      foreignColumns: [
        attributeDefinitions.organizationId,
        attributeDefinitions.id,
      ],
    }).onDelete("restrict"),
    // MATCH SIMPLE: sin opción, no se comprueba; con opción, tiene que ser de esta definición.
    foreignKey({
      name: "attribute_values_option_fk",
      columns: [table.organizationId, table.definitionId, table.optionId],
      foreignColumns: [
        attributeOptions.organizationId,
        attributeOptions.definitionId,
        attributeOptions.id,
      ],
    }).onDelete("restrict"),
    unique("attribute_values_product_definition_unique").on(
      table.organizationId,
      table.productId,
      table.definitionId,
    ),
    index("attribute_values_definition_idx").on(
      table.organizationId,
      table.definitionId,
    ),
    check(
      "attribute_values_exactly_one",
      sql`num_nonnulls(${table.textValue}, ${table.numberValue}, ${table.booleanValue}, ${table.optionId}) = 1`,
    ),
    check(
      "attribute_values_text_length",
      sql`char_length(${table.textValue}) between 1 and ${sql.raw(String(ATTRIBUTE_LIMITS.textValue))}`,
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

// Costo de un producto, con historial (ADR 0019, punto 5; brief-18.2). La forma de product_prices:
// de solo inserción, el vigente es la última fila. El monto es lo que el negocio paga por una
// unidad, con el IVA incluido, lo recupere o no. Solo lo leen los admin; el agente no.
export const productCosts = pgTable(
  "product_costs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "restrict" }),
    productId: uuid("product_id").notNull(),
    amount: numeric("amount", { precision: 14, scale: 2 }).notNull(),
    // Libre respecto de la del precio: con monedas distintas no hay margen (D-5).
    currency: text("currency").notNull(),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .default(sql`clock_timestamp()`),
  },
  (table) => [
    foreignKey({
      name: "product_costs_product_fk",
      columns: [table.organizationId, table.productId],
      foreignColumns: [products.organizationId, products.id],
    }).onDelete("restrict"),
    index("product_costs_product_history_idx").on(
      table.organizationId,
      table.productId,
      table.createdAt.desc(),
    ),
    check("product_costs_amount_positive", sql`${table.amount} > 0`),
    check(
      "product_costs_currency_format",
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

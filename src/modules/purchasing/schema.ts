import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { organizations } from "@/modules/organizations/schema";

// docs/architecture/DataModel.md, tabla suppliers (ADR 0023, punto 2; brief-22.2, D-1).

// Límites de la ficha (D-1 y D-4). Los mismos valores van en los CHECK de la tabla.
export const SUPPLIER_FIELD_LIMITS = {
  name: 120,
  email: 254,
} as const;

// El CUIT guardado: once dígitos, sin separadores. El dígito verificador lo comprueba el servicio
// (D-2), porque la base no lo calcula.
export const CUIT_PATTERN = "^[0-9]{11}$";

// El proveedor de una organización, separado de clients: un proveedor no es un cliente aunque
// comparta el teléfono, y no lo lee el agente (ADR 0023, punto 2). Editable y con borrado lógico
// (regla 8): crm_app tiene SELECT, INSERT y UPDATE, sin DELETE. Guarda lo mínimo (punto 14): sin
// notas ni texto libre.
export const suppliers = pgTable(
  "suppliers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "restrict" }),
    name: text("name").notNull(),
    // E.164, como el del cliente, normalizado por src/shared/phone (D-3). No es único.
    phone: text("phone_e164"),
    // En minúsculas, como el del cliente (D-4). No es único.
    email: text("email"),
    cuit: text("cuit"),
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
    // Un nombre por organización, sin distinguir mayúsculas, también frente a los inactivos, como
    // payment_methods (D-4). Sirve también el orden de la lista (D-10).
    uniqueIndex("suppliers_organization_name_lower_unique").on(
      table.organizationId,
      sql`lower(${table.name})`,
    ),
    // Un CUIT por organización, también frente a los inactivos: dos fichas con el mismo CUIT
    // partirían la cuenta del proveedor en la 22.6 (D-2).
    uniqueIndex("suppliers_organization_cuit_unique")
      .on(table.organizationId, table.cuit)
      .where(sql`${table.cuit} IS NOT NULL`),
    // Destino de las claves compuestas de la 22.3 en adelante.
    unique("suppliers_organization_id_id_unique").on(
      table.organizationId,
      table.id,
    ),
    check(
      "suppliers_name_length",
      sql`char_length(${table.name}) between 1 and ${sql.raw(String(SUPPLIER_FIELD_LIMITS.name))}`,
    ),
    check("suppliers_name_trimmed", sql`${table.name} = btrim(${table.name})`),
    check(
      "suppliers_phone_e164_format",
      sql`${table.phone} ~ '^\\+[1-9][0-9]{1,14}$'`,
    ),
    check(
      "suppliers_email_format",
      sql`${table.email} = lower(${table.email}) and char_length(${table.email}) <= ${sql.raw(String(SUPPLIER_FIELD_LIMITS.email))} and position('@' in ${table.email}) > 1`,
    ),
    check(
      "suppliers_cuit_format",
      sql`${table.cuit} ~ ${sql.raw(`'${CUIT_PATTERN}'`)}`,
    ),
  ],
);

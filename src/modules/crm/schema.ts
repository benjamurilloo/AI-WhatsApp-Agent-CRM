import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { organizations } from "@/modules/organizations/schema";

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
    // Prefijo de nombre sin distinguir mayúsculas, como productos (D-2).
    index("clients_organization_display_name_lower_idx").on(
      table.organizationId,
      sql`lower(${table.displayName}) text_pattern_ops`,
    ),
    // Solo E.164 canónico: sin forma única, la unicidad no detecta el mismo número (D-1).
    check(
      "clients_phone_e164_format",
      sql`${table.phoneE164} ~ '^\\+[1-9][0-9]{1,14}$'`,
    ),
  ],
);

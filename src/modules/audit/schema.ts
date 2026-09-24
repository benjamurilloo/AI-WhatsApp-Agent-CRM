import {
  index,
  jsonb,
  pgEnum,
  pgTable,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { users } from "@/modules/auth/schema";
import { organizations } from "@/modules/organizations/schema";

// docs/architecture/DataModel.md, tabla audit_logs (brief-3.6).
// Solo inserción: el rol crm_app no tiene UPDATE ni DELETE y un trigger rechaza ambos (D-2, ADR 0013).

// Valores completos de DataModel: todos tienen productor en el MVP (D-1).
export const auditEntityType = pgEnum("audit_entity_type", [
  "product",
  "client",
  "inventory",
  "conversation",
  "organization_member",
  // Entrada de información del negocio (brief-11.2).
  "knowledge_entry",
]);

export const auditAction = pgEnum("audit_action", [
  "create",
  "update",
  "deactivate",
  "reactivate",
  "stock_adjustment",
  "status_change",
  "role_change",
  // Cambio del precio de un producto (brief-11.1, D-7).
  "price_change",
]);

export const auditLogs = pgTable(
  "audit_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // Claves foráneas hacia auth y organizations: la única dependencia de audit (D-5).
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "restrict" }),
    actorUserId: uuid("actor_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    entityType: auditEntityType("entity_type").notNull(),
    entityId: uuid("entity_id").notNull(),
    action: auditAction("action").notNull(),
    diff: jsonb("diff").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("audit_logs_entity_history_idx").on(
      table.organizationId,
      table.entityType,
      table.entityId,
      table.createdAt.desc(),
    ),
  ],
);

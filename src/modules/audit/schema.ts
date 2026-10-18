import { sql } from "drizzle-orm";
import {
  check,
  foreignKey,
  index,
  jsonb,
  pgEnum,
  pgTable,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { users } from "@/modules/auth/schema";
import { ingestionCredentials } from "@/modules/ingestion/schema";
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
  // Etiqueta del catálogo de clientes (brief-16.1, D-7).
  "client_tag",
  // Horario de atención de la organización; el id es el de la organización (brief-17.4, D-4).
  "business_hours",
  // Pedido de un cliente (brief-19.2; ADR 0020, punto 3).
  "order",
  // Venta de un pedido entregado (brief-20.2; ADR 0021, punto 2).
  "sale",
  // Sesión de caja y medio de pago (brief-21.2, D-9; ADR 0022, punto 11).
  "cash_session",
  "payment_method",
  // El cobro, como recibo (brief-21.3, D-7; ADR 0022, punto 2).
  "receipt",
  // La devolución y su anulación (brief-21.5, D-13; ADR 0022, punto 7). La anulación de un cobro es
  // receipt con la acción void, como la de la venta.
  "refund",
  // El proveedor (brief-22.2, D-8; ADR 0023, punto 2): alta, edición, desactivación y reactivación.
  "supplier",
  // La orden de compra (brief-22.3, D-9; ADR 0023, punto 3): el alta y la cancelación; el cierre,
  // desde la 22.4.
  "purchase_order",
  // La recepción (brief-22.4, D-6; ADR 0023, punto 4): el alta.
  "goods_receipt",
  // El pago a un proveedor (brief-22.6, D-11; ADR 0023, punto 8): create al emitirlo y void al anularlo.
  "supplier_payment",
  // Capacidades y variantes (brief-29.2, D-2, D-4 y D-5): la activación de una capacidad (el id es el
  // de la fila de organization_capabilities), el modelo, y la definición de un atributo con sus
  // opciones, que se auditan sobre la definición.
  "organization_capability",
  "product_model",
  "attribute_definition",
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
  // Etiqueta puesta o quitada en un cliente, en su historial (brief-16.1, D-7).
  "tag_change",
  // Agente pausado o reanudado en una conversación (brief-16.3, D-6).
  "agent_pause_change",
  // Nota agregada en una conversación, sin el texto (brief-16.4, D-4).
  "note_added",
  // Cambio del costo de un producto (brief-18.2).
  "cost_change",
  // Anulación de una venta, sobre la venta, con el número y el motivo (brief-20.4, D-9).
  "void",
  // Cierre de una sesión de caja, con lo contado y lo esperado por moneda (brief-21.2, D-9).
  "close",
]);

export const auditLogs = pgTable(
  "audit_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // Claves foráneas hacia auth, organizations e ingestion: desde la 12.1 (D-3), audit depende
    // también del esquema de ingestion, por el actor de servicio.
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "restrict" }),
    // Exactamente uno de los dos actores: un usuario o una credencial de servicio (brief-12.1, D-3).
    actorUserId: uuid("actor_user_id").references(() => users.id, {
      onDelete: "restrict",
    }),
    actorCredentialId: uuid("actor_credential_id"),
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
    // Compuesta: la credencial es de la misma organización que la fila (convención de la 4.1, D-3).
    // Con actor_credential_id nulo, MATCH SIMPLE no la comprueba.
    foreignKey({
      name: "audit_logs_actor_credential_fk",
      columns: [table.organizationId, table.actorCredentialId],
      foreignColumns: [
        ingestionCredentials.organizationId,
        ingestionCredentials.id,
      ],
    }).onDelete("restrict"),
    check(
      "audit_logs_exactly_one_actor",
      sql`num_nonnulls(${table.actorUserId}, ${table.actorCredentialId}) = 1`,
    ),
  ],
);

import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import {
  InvalidAuditEntryError,
  listEntityAuditLogs,
  recordAudit,
  type AuditEntry,
} from "@/modules/audit";
import { getCredentialSources } from "@/modules/ingestion";
import { getDb, type Db, type DbTransaction } from "@/shared/db";
import { resetDatabase } from "./reset-database";

// audit_logs contra PostgreSQL real (brief-3.6): esquema, solo inserción por permisos y por trigger,
// privilegios de crm_app en todas las tablas y atomicidad con el cambio auditado.

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

// drizzle-orm envuelve el error de pg; el código de PostgreSQL queda en la causa.
async function pgError(
  query: Promise<unknown>,
): Promise<{ code: string; message: string }> {
  try {
    await query;
  } catch (error) {
    const e = error as {
      code?: string;
      message?: string;
      cause?: { code?: string; message?: string };
    };
    return {
      code: e.cause?.code ?? e.code ?? "sin código",
      message: e.cause?.message ?? e.message ?? "",
    };
  }
  throw new Error("La consulta debía ser rechazada y no lo fue.");
}

type Seed = { organizationId: string; actorUserId: string; memberId: string };

// Una organización con un admin que actúa y otro miembro admin cuyo rol se cambia.
async function seed(): Promise<Seed> {
  const db = getDb();
  const organization = await db.execute<{ id: string }>(
    sql`insert into organizations (name) values ('Negocio A') returning id`,
  );
  const organizationId = organization.rows[0]!.id;
  const users = await db.execute<{ id: string }>(
    sql`insert into users (email, password_hash, name)
        values ('actor@example.com', 'hash-sintetico', 'Actor'),
               ('miembro@example.com', 'hash-sintetico', 'Miembro')
        returning id`,
  );
  const [actorUserId, memberUserId] = users.rows.map((row) => row.id);
  const members = await db.execute<{ id: string }>(
    sql`insert into organization_members (organization_id, user_id, role)
        values (${organizationId}, ${actorUserId}, 'admin'),
               (${organizationId}, ${memberUserId}, 'admin')
        returning id`,
  );
  return {
    organizationId,
    actorUserId: actorUserId!,
    memberId: members.rows[1]!.id,
  };
}

function roleChange(s: Seed, overrides: Partial<AuditEntry> = {}): AuditEntry {
  return {
    organizationId: s.organizationId,
    actorUserId: s.actorUserId,
    entityType: "organization_member",
    entityId: s.memberId,
    action: "role_change",
    diff: { before: { role: "admin" }, after: { role: "viewer" } },
    ...overrides,
  };
}

async function insertAuditRow(executor: Db | DbTransaction, s: Seed) {
  const diff = JSON.stringify({
    before: { role: "admin" },
    after: { role: "viewer" },
  });
  const result = await executor.execute<{ id: string }>(
    sql`insert into audit_logs (organization_id, actor_user_id, entity_type, entity_id, action, diff)
        values (${s.organizationId}, ${s.actorUserId}, 'organization_member', ${s.memberId}, 'role_change', ${diff}::jsonb)
        returning id`,
  );
  return result.rows[0]!.id;
}

async function auditCount() {
  const result = await getDb().execute<{ count: number }>(
    sql`select count(*)::int as count from audit_logs`,
  );
  return result.rows[0]!.count;
}

async function roleOf(memberId: string) {
  const result = await getDb().execute<{ role: string }>(
    sql`select role from organization_members where id = ${memberId}`,
  );
  return result.rows[0]!.role;
}

function setRole(tx: DbTransaction, memberId: string, role: string) {
  return tx.execute(
    sql`update organization_members set role = ${role} where id = ${memberId}`,
  );
}

// Ejecuta como crm_app, el rol restringido que la aplicación usará al conectarse con él (D-2).
function asAppRole<T>(fn: (tx: DbTransaction) => Promise<T>): Promise<T> {
  return getDb().transaction(async (tx) => {
    await tx.execute(sql`set local role crm_app`);
    return fn(tx);
  });
}

// Tablas de public cuyos privilegios para crm_app no son los esperados (ADR 0013).
// El resto de las tablas es escribible: SELECT, INSERT, UPDATE y DELETE.
const INSERT_ONLY_TABLES = [
  "audit_logs",
  // La caja del efectivo: sus sesiones, sus filas por moneda, sus cierres y sus movimientos
  // (brief-21.2, D-1; ADR 0022, punto 8).
  "cash_movements",
  "cash_session_closing_amounts",
  "cash_session_closings",
  "cash_session_opening_amounts",
  "cash_sessions",
  // La activación de una capacidad (brief-29.2, D-1; ADR 0024, punto 2).
  "organization_capabilities",
  // La cotización: su configuración y las cotizaciones (brief-29.4, D-3; ADR 0025, punto 3). Desde la
  // 29.4.2 la configuración tiene UPDATE solo en dos columnas, la fuente y el ajuste, así que a nivel
  // de tabla sigue sin UPDATE; las columnas las prueba fx-reader.test.ts.
  "exchange_rate_settings",
  "exchange_rates",
  // Notas de una conversación (brief-16.4, D-1).
  "conversation_notes",
  // La recepción y sus líneas (brief-22.4, D-2; ADR 0023, punto 4), y su anulación (brief-22.5, D-1;
  // punto 6).
  "goods_receipt_lines",
  "goods_receipt_voids",
  "goods_receipts",
  // Los IMEI de una línea de recepción (brief-29.5, D-2 y D-4).
  "goods_receipt_line_units",
  "inventory_movements",
  "messages",
  // Líneas de un pedido (brief-19.2).
  "order_lines",
  // Las unidades de una línea de pedido y de venta (brief-29.5.2, D-1).
  "order_line_units",
  // Costo de un producto (brief-18.2).
  "product_costs",
  "product_prices",
  // Las líneas de la orden de compra (brief-22.3, D-2; ADR 0023, punto 3).
  "purchase_order_lines",
  // El cobro (brief-21.3, D-1; ADR 0022, punto 2), su anulación, la devolución y la anulación de la
  // devolución (brief-21.5, D-1 a D-3; ADR 0022, punto 7).
  "receipt_voids",
  "receipts",
  "refund_voids",
  "refunds",
  // La venta y sus líneas (brief-20.2; ADR 0021, punto 2).
  "sale_lines",
  "sale_line_units",
  // La anulación de una venta (brief-20.4; ADR 0021, punto 6).
  "sale_voids",
  "sales",
  // El pago a un proveedor y su anulación (brief-22.6, D-2 y D-3; ADR 0023, punto 8).
  "supplier_payment_voids",
  "supplier_payments",
  // Las líneas del presupuesto de una orden de servicio (brief-29.6, D-4).
  "service_order_lines",
  // El usado recibido, su checklist y su anulación (brief-29.7, D-2 y D-6).
  "trade_in_checklist_results",
  "trade_in_voids",
  "trade_ins",
];
// Se actualizan pero no se borran (brief-6.1, D-3; credenciales, brief-6.5.3, D-1; información
// del negocio, brief-11.2, D-4; el horario semanal, brief-17.4, P-1).
const NO_DELETE_TABLES = [
  "business_hours",
  "client_tags",
  // El contador de numeración y la cabecera del pedido (brief-19.2, D-2; ADR 0020, punto 3).
  "document_counters",
  "ingestion_credentials",
  "ingestion_events",
  "knowledge_entries",
  "orders",
  // Los medios de pago, con borrado lógico (brief-21.2, D-6; ADR 0022, punto 10).
  "payment_methods",
  // Los modelos, los atributos y sus opciones, con borrado lógico (brief-29.2, D-2 y D-3).
  "attribute_definitions",
  "attribute_options",
  "product_models",
  // La cabecera de la orden de compra, que cambia de estado (brief-22.3, D-2; ADR 0023, punto 3).
  "purchase_orders",
  // Los proveedores, con borrado lógico (brief-22.2, D-1; ADR 0023, punto 2).
  "suppliers",
  // Las unidades, que se dan de baja y no se borran, y los grados, que se desactivan (brief-29.5,
  // D-2 y D-5).
  "stock_units",
  "unit_grades",
  // La lista de reparaciones, cuyos tipos se desactivan, y la orden de servicio, que cambia de estado y
  // se cancela (brief-29.6, D-2 y D-4).
  "repair_prices",
  "repair_types",
  "service_orders",
  // Los ítems del checklist de recepción, que se editan y se desactivan (brief-29.7, D-3).
  "trade_in_checklist_items",
];
// Se insertan y se borran, pero no se actualizan: una asignación se pone y se quita (brief-16.1,
// D-6), un día especial se agrega y se quita (brief-17.4, P-2), y una imagen de producto se sube y
// se quita, y reemplazarla es borrar e insertar (brief-17.5, D-3).
const NO_UPDATE_TABLES = [
  "business_hour_exceptions",
  "client_tag_assignments",
  "product_images",
];

async function tablesWithWrongPrivileges(executor: Db | DbTransaction) {
  const result = await executor.execute<{
    tablename: string;
    can_select: boolean;
    can_insert: boolean;
    can_update: boolean;
    can_delete: boolean;
  }>(
    sql`select tablename,
          has_table_privilege('crm_app', format('public.%I', tablename), 'SELECT') as can_select,
          has_table_privilege('crm_app', format('public.%I', tablename), 'INSERT') as can_insert,
          has_table_privilege('crm_app', format('public.%I', tablename), 'UPDATE') as can_update,
          has_table_privilege('crm_app', format('public.%I', tablename), 'DELETE') as can_delete
        from pg_tables where schemaname = 'public' order by tablename`,
  );
  return result.rows
    .filter((row) => {
      const insertOnly = INSERT_ONLY_TABLES.includes(row.tablename);
      const noDelete = NO_DELETE_TABLES.includes(row.tablename);
      const noUpdate = NO_UPDATE_TABLES.includes(row.tablename);
      return !(
        row.can_select &&
        row.can_insert &&
        row.can_update === !(insertOnly || noUpdate) &&
        row.can_delete === !(insertOnly || noDelete)
      );
    })
    .map((row) => row.tablename);
}

// Un error propio para revertir una transacción a propósito y reconocerlo afuera.
class IntentionalRollback extends Error {}

beforeEach(async () => {
  await resetDatabase(getDb());
});

afterAll(async () => {
  await getDb().$client.end();
});

describe("audit_logs: esquema", () => {
  it("aplica los defaults", async () => {
    const s = await seed();
    const result = await getDb().execute<{ id: string; created_now: boolean }>(
      sql`insert into audit_logs (organization_id, actor_user_id, entity_type, entity_id, action, diff)
          values (${s.organizationId}, ${s.actorUserId}, 'organization_member', ${s.memberId}, 'create', '{}'::jsonb)
          returning id, created_at = now() as created_now`,
    );
    expect(result.rows[0]?.id).toMatch(uuidPattern);
    expect(result.rows[0]?.created_now).toBe(true);
  });

  it("rechaza columnas obligatorias en NULL", async () => {
    const s = await seed();
    for (const query of [
      sql`insert into audit_logs (organization_id, actor_user_id, entity_type, entity_id, action, diff)
          values (null, ${s.actorUserId}, 'organization_member', ${s.memberId}, 'create', '{}')`,
      sql`insert into audit_logs (organization_id, actor_user_id, entity_type, entity_id, action, diff)
          values (${s.organizationId}, ${s.actorUserId}, 'organization_member', null, 'create', '{}')`,
      sql`insert into audit_logs (organization_id, actor_user_id, entity_type, entity_id, action, diff)
          values (${s.organizationId}, ${s.actorUserId}, 'organization_member', ${s.memberId}, 'create', null)`,
    ]) {
      expect((await pgError(getDb().execute(query))).code).toBe("23502");
    }
  });

  it("rechaza tipo de entidad y acción fuera de los enums", async () => {
    const s = await seed();
    expect(
      (
        await pgError(
          getDb().execute(
            sql`insert into audit_logs (organization_id, actor_user_id, entity_type, entity_id, action, diff)
                values (${s.organizationId}, ${s.actorUserId}, 'user', ${s.memberId}, 'create', '{}')`,
          ),
        )
      ).code,
    ).toBe("22P02");
    expect(
      (
        await pgError(
          getDb().execute(
            sql`insert into audit_logs (organization_id, actor_user_id, entity_type, entity_id, action, diff)
                values (${s.organizationId}, ${s.actorUserId}, 'organization_member', ${s.memberId}, 'delete', '{}')`,
          ),
        )
      ).code,
    ).toBe("22P02");
  });

  it("rechaza organización o actor inexistentes", async () => {
    const s = await seed();
    expect(
      (
        await pgError(
          insertAuditRow(getDb(), { ...s, organizationId: randomUUID() }),
        )
      ).code,
    ).toBe("23503");
    expect(
      (
        await pgError(
          insertAuditRow(getDb(), { ...s, actorUserId: randomUUID() }),
        )
      ).code,
    ).toBe("23503");
  });

  // ON DELETE RESTRICT informa 23001 (restrict_violation); 23503 es el de NO ACTION.
  it("no deja borrar la organización ni el actor de un registro", async () => {
    const s = await seed();
    await insertAuditRow(getDb(), s);
    expect(
      (
        await pgError(
          getDb().execute(
            sql`delete from organizations where id = ${s.organizationId}`,
          ),
        )
      ).code,
    ).toBe("23001");
    expect(
      (
        await pgError(
          getDb().execute(sql`delete from users where id = ${s.actorUserId}`),
        )
      ).code,
    ).toBe("23001");
    expect(await auditCount()).toBe(1);
  });
});

// Actor de servicio (brief-12.1, D-3): exactamente un actor por fila, y la credencial de la misma
// organización que la fila, por la clave foránea compuesta.
async function insertCredential(organizationId: string, source: string) {
  const result = await getDb().execute<{ id: string }>(
    sql`insert into ingestion_credentials (organization_id, source, scope, token_hash)
        values (${organizationId}, ${source}, 'ingest', ${randomUUID()})
        returning id`,
  );
  return result.rows[0]!.id;
}

function insertWithActors(
  s: Seed,
  actors: { userId: string | null; credentialId: string | null },
) {
  return getDb().execute<{ id: string }>(
    sql`insert into audit_logs
          (organization_id, actor_user_id, actor_credential_id, entity_type, entity_id, action, diff)
        values (${s.organizationId}, ${actors.userId}, ${actors.credentialId},
          'client', ${s.memberId}, 'create', '{}'::jsonb)
        returning id`,
  );
}

describe("audit_logs: actor de servicio (brief-12.1)", () => {
  it("FR-AUD-03: acepta una credencial como único actor", async () => {
    const s = await seed();
    const credentialId = await insertCredential(s.organizationId, "emisor-a");
    const result = await insertWithActors(s, { userId: null, credentialId });
    expect(result.rows[0]?.id).toMatch(uuidPattern);
  });

  it("FR-AUD-03: sin actor o con los dos: 23514", async () => {
    const s = await seed();
    const credentialId = await insertCredential(s.organizationId, "emisor-a");
    for (const actors of [
      { userId: null, credentialId: null },
      { userId: s.actorUserId, credentialId },
    ]) {
      const error = await pgError(insertWithActors(s, actors));
      expect(error.code).toBe("23514");
      expect(error.message).toContain("audit_logs_exactly_one_actor");
    }
  });

  it("FR-AUD-03: una credencial inexistente o de otra organización: 23503", async () => {
    const s = await seed();
    const other = await getDb().execute<{ id: string }>(
      sql`insert into organizations (name) values ('Negocio B') returning id`,
    );
    const foreign = await insertCredential(other.rows[0]!.id, "emisor-b");
    for (const credentialId of [randomUUID(), foreign]) {
      const error = await pgError(
        insertWithActors(s, { userId: null, credentialId }),
      );
      expect(error.code).toBe("23503");
    }
    expect(await auditCount()).toBe(0);
  });

  it("FR-AUD-03: no deja borrar la credencial de un registro, y la fila sigue siendo de solo inserción", async () => {
    const s = await seed();
    const credentialId = await insertCredential(s.organizationId, "emisor-a");
    const id = (await insertWithActors(s, { userId: null, credentialId }))
      .rows[0]!.id;
    expect(
      (
        await pgError(
          getDb().execute(
            sql`delete from ingestion_credentials where id = ${credentialId}`,
          ),
        )
      ).code,
    ).toBe("23001");
    expect(
      (
        await pgError(
          getDb().execute(
            sql`update audit_logs set actor_credential_id = null, actor_user_id = ${s.actorUserId} where id = ${id}`,
          ),
        )
      ).code,
    ).toBe("P0001");
  });

  it("FR-AUD-03: recordAudit registra una credencial y la lectura la devuelve como servicio", async () => {
    const s = await seed();
    const credentialId = await insertCredential(s.organizationId, "emisor-a");
    await getDb().transaction((tx) =>
      recordAudit(tx, {
        organizationId: s.organizationId,
        actorCredentialId: credentialId,
        entityType: "client",
        entityId: s.memberId,
        action: "create",
        diff: { before: null, after: { displayName: "Sin nombre" } },
      }),
    );
    await getDb().transaction((tx) =>
      recordAudit(tx, roleChange(s, { entityType: "client" })),
    );

    const page = await listEntityAuditLogs({
      organizationId: s.organizationId,
      entityTypes: ["client"],
      entityId: s.memberId,
      page: 1,
    });
    expect(page.entries.map((entry) => entry.actor)).toEqual(
      expect.arrayContaining([
        { kind: "service", credentialId },
        { kind: "user", userId: s.actorUserId },
      ]),
    );
    expect(page.entries).toHaveLength(2);
  });

  it("FR-AUD-03: getCredentialSources devuelve solo las credenciales de la organización", async () => {
    const s = await seed();
    const own = await insertCredential(s.organizationId, "emisor-a");
    const other = await getDb().execute<{ id: string }>(
      sql`insert into organizations (name) values ('Negocio B') returning id`,
    );
    const foreign = await insertCredential(other.rows[0]!.id, "emisor-b");
    const sources = await getCredentialSources(s.organizationId, [
      own,
      foreign,
      "no-es-uuid",
    ]);
    expect([...sources]).toEqual([[own, "emisor-a"]]);
  });
});

describe("audit_logs: solo inserción por permisos (crm_app)", () => {
  it("crm_app no puede iniciar sesión ni es superusuario", async () => {
    const result = await getDb().execute<{
      rolcanlogin: boolean;
      rolsuper: boolean;
    }>(
      sql`select rolcanlogin, rolsuper from pg_roles where rolname = 'crm_app'`,
    );
    expect(result.rows).toEqual([{ rolcanlogin: false, rolsuper: false }]);
  });

  it("crm_app inserta y lee", async () => {
    const s = await seed();
    await asAppRole((tx) => insertAuditRow(tx, s));
    const count = await asAppRole(async (tx) => {
      const result = await tx.execute<{ count: number }>(
        sql`select count(*)::int as count from audit_logs`,
      );
      return result.rows[0]!.count;
    });
    expect(count).toBe(1);
  });

  it("crm_app no puede actualizar ni borrar: 42501", async () => {
    const s = await seed();
    const id = await insertAuditRow(getDb(), s);
    expect(
      (
        await pgError(
          asAppRole((tx) =>
            tx.execute(sql`update audit_logs set diff = '{}' where id = ${id}`),
          ),
        )
      ).code,
    ).toBe("42501");
    expect(
      (
        await pgError(
          asAppRole((tx) =>
            tx.execute(sql`delete from audit_logs where id = ${id}`),
          ),
        )
      ).code,
    ).toBe("42501");
    expect(await auditCount()).toBe(1);
  });
});

describe("audit_logs: solo inserción por trigger (rol dueño)", () => {
  it("el dueño no puede actualizar ni borrar y la fila no cambia", async () => {
    const s = await seed();
    const id = await insertAuditRow(getDb(), s);

    const update = await pgError(
      getDb().execute(sql`update audit_logs set diff = '{}' where id = ${id}`),
    );
    expect(update.code).toBe("P0001");
    expect(update.message).toContain("solo inserción: UPDATE");

    const remove = await pgError(
      getDb().execute(sql`delete from audit_logs where id = ${id}`),
    );
    expect(remove.code).toBe("P0001");
    expect(remove.message).toContain("solo inserción: DELETE");

    const row = await getDb().execute<{ diff: unknown }>(
      sql`select diff from audit_logs where id = ${id}`,
    );
    expect(row.rows).toEqual([
      { diff: { before: { role: "admin" }, after: { role: "viewer" } } },
    ]);
  });

  it("limitación documentada: el dueño todavía puede vaciar la tabla con TRUNCATE", async () => {
    const s = await seed();
    await insertAuditRow(getDb(), s);
    await getDb().execute(sql`truncate table audit_logs`);
    expect(await auditCount()).toBe(0);
  });
});

describe("privilegios de crm_app en todas las tablas", () => {
  it("cada tabla de public tiene los privilegios esperados", async () => {
    expect(await tablesWithWrongPrivileges(getDb())).toEqual([]);
  });

  it("la verificación detecta una tabla sin privilegios", async () => {
    await expect(
      getDb().transaction(async (tx) => {
        await tx.execute(sql`create table public.privileges_probe (id int)`);
        expect(await tablesWithWrongPrivileges(tx)).toEqual([
          "privileges_probe",
        ]);
        throw new IntentionalRollback();
      }),
    ).rejects.toBeInstanceOf(IntentionalRollback);
  });

  it("la verificación detecta UPDATE otorgado sobre una tabla de solo inserción", async () => {
    await expect(
      getDb().transaction(async (tx) => {
        await tx.execute(sql`grant update on audit_logs to crm_app`);
        expect(await tablesWithWrongPrivileges(tx)).toEqual(["audit_logs"]);
        throw new IntentionalRollback();
      }),
    ).rejects.toBeInstanceOf(IntentionalRollback);
    expect(await tablesWithWrongPrivileges(getDb())).toEqual([]);
  });

  it("la verificación detecta DELETE otorgado sobre una tabla sin borrado", async () => {
    await expect(
      getDb().transaction(async (tx) => {
        await tx.execute(sql`grant delete on ingestion_events to crm_app`);
        expect(await tablesWithWrongPrivileges(tx)).toEqual([
          "ingestion_events",
        ]);
        throw new IntentionalRollback();
      }),
    ).rejects.toBeInstanceOf(IntentionalRollback);
    expect(await tablesWithWrongPrivileges(getDb())).toEqual([]);
  });
});

describe("recordAudit: atomicidad con el cambio", () => {
  it("confirmada la transacción, persisten el cambio y el registro", async () => {
    const s = await seed();
    await getDb().transaction(async (tx) => {
      await setRole(tx, s.memberId, "viewer");
      await recordAudit(tx, roleChange(s));
    });

    expect(await roleOf(s.memberId)).toBe("viewer");
    const rows = await getDb().execute(
      sql`select organization_id, actor_user_id, entity_type, entity_id, action, diff from audit_logs`,
    );
    expect(rows.rows).toEqual([
      {
        organization_id: s.organizationId,
        actor_user_id: s.actorUserId,
        entity_type: "organization_member",
        entity_id: s.memberId,
        action: "role_change",
        diff: { before: { role: "admin" }, after: { role: "viewer" } },
      },
    ]);
  });

  it("si la transacción aborta después de registrar, no persiste ninguno", async () => {
    const s = await seed();
    await expect(
      getDb().transaction(async (tx) => {
        await setRole(tx, s.memberId, "viewer");
        await recordAudit(tx, roleChange(s));
        throw new IntentionalRollback();
      }),
    ).rejects.toBeInstanceOf(IntentionalRollback);

    expect(await roleOf(s.memberId)).toBe("admin");
    expect(await auditCount()).toBe(0);
  });

  it("si falla la inserción de auditoría, el cambio se revierte", async () => {
    const s = await seed();
    const failure = await pgError(
      getDb().transaction(async (tx) => {
        await setRole(tx, s.memberId, "viewer");
        await recordAudit(tx, roleChange(s, { actorUserId: randomUUID() }));
      }),
    );

    expect(failure.code).toBe("23503");
    expect(await roleOf(s.memberId)).toBe("admin");
    expect(await auditCount()).toBe(0);
  });

  it("una entrada inválida lanza, no inserta y revierte el cambio", async () => {
    const s = await seed();
    await expect(
      getDb().transaction(async (tx) => {
        await setRole(tx, s.memberId, "viewer");
        await recordAudit(
          tx,
          roleChange(s, {
            action: "update",
            diff: {
              before: { passwordHash: "viejo" },
              after: { passwordHash: "nuevo" },
            },
          }),
        );
      }),
    ).rejects.toBeInstanceOf(InvalidAuditEntryError);

    expect(await roleOf(s.memberId)).toBe("admin");
    expect(await auditCount()).toBe(0);
  });

  it("no acepta la conexión general en lugar de una transacción", () => {
    // Lo verifica typecheck: si la conexión general fuera asignable, la directiva quedaría sin uso y fallaría.
    // @ts-expect-error: recordAudit exige una transacción (D-3).
    const general: Parameters<typeof recordAudit>[0] = getDb();
    expect(general).toBeDefined();
  });
});

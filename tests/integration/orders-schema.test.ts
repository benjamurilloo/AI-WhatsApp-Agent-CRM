import { sql, type SQL } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { getDb, type DbTransaction } from "@/shared/db";
import { resetDatabase } from "./reset-database";

// Esquema de los pedidos contra PostgreSQL real (brief-19.2, AC-1): claves, CHECK, privilegios de
// crm_app y los triggers de orders, order_lines y document_counters, probados con SQL directo y con
// el rol dueño, que es el que no frenan los privilegios.

async function createOrganization(name: string) {
  const result = await getDb().execute<{ id: string }>(
    sql`insert into organizations (name) values (${name}) returning id`,
  );
  return result.rows[0]!.id;
}

async function insertUser(email: string) {
  const result = await getDb().execute<{ id: string }>(
    sql`insert into users (email, password_hash, name)
        values (${email}, 'hash', 'Ana') returning id`,
  );
  return result.rows[0]!.id;
}

async function insertClient(organizationId: string) {
  const result = await getDb().execute<{ id: string }>(
    sql`insert into clients (organization_id, display_name)
        values (${organizationId}, 'Lucía') returning id`,
  );
  return result.rows[0]!.id;
}

async function insertProduct(organizationId: string, sku: string) {
  const result = await getDb().execute<{ id: string }>(
    sql`insert into products (organization_id, sku, name)
        values (${organizationId}, ${sku}, 'Café') returning id`,
  );
  return result.rows[0]!.id;
}

type Executor = { execute: (query: SQL) => Promise<unknown> };

function insertOrderRow(
  executor: Executor,
  values: {
    organizationId: string;
    clientId: string;
    createdBy: string;
    number?: number;
    total?: string;
    currency?: string;
    status?: string;
  },
) {
  return executor.execute(
    sql`insert into orders (organization_id, number, client_id, currency, total, created_by, status)
        values (${values.organizationId}, ${values.number ?? 1}, ${values.clientId},
                ${values.currency ?? "ARS"}, ${values.total ?? "100"}, ${values.createdBy},
                ${values.status ?? "pending"}::order_status)`,
  );
}

function insertLineRow(
  executor: Executor,
  values: {
    organizationId: string;
    orderId: string;
    productId: string;
    position?: number;
    quantity?: string;
    unitPrice?: string;
    lineTotal?: string;
    currency?: string;
  },
) {
  return executor.execute(
    sql`insert into order_lines (organization_id, order_id, product_id, position, quantity,
                                 unit_price, currency, line_total)
        values (${values.organizationId}, ${values.orderId}, ${values.productId},
                ${values.position ?? 1}, ${values.quantity ?? "1"}, ${values.unitPrice ?? "100"},
                ${values.currency ?? "ARS"}, ${values.lineTotal ?? "100"})`,
  );
}

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

function asAppRole<T>(fn: (tx: DbTransaction) => Promise<T>): Promise<T> {
  return getDb().transaction(async (tx) => {
    await tx.execute(sql`set local role crm_app`);
    return fn(tx);
  });
}

async function privileges(table: string) {
  const result = await getDb().execute<{ privilege: string }>(
    sql`select privilege_type as privilege from information_schema.role_table_grants
        where grantee = 'crm_app' and table_name = ${table}
        order by privilege_type`,
  );
  return result.rows.map((row) => row.privilege);
}

async function seed() {
  const orgA = await createOrganization("Negocio A");
  const orgB = await createOrganization("Negocio B");
  const userId = await insertUser("ana@example.com");
  const clientA = await insertClient(orgA);
  const clientB = await insertClient(orgB);
  const productA = await insertProduct(orgA, "CAF-1");
  const productA2 = await insertProduct(orgA, "CAF-2");
  const productB = await insertProduct(orgB, "CAF-1");
  await insertOrderRow(getDb(), {
    organizationId: orgA,
    clientId: clientA,
    createdBy: userId,
  });
  const order = await getDb().execute<{ id: string }>(
    sql`select id from orders where organization_id = ${orgA} and number = 1`,
  );
  const orderA = order.rows[0]!.id;
  await insertLineRow(getDb(), {
    organizationId: orgA,
    orderId: orderA,
    productId: productA,
  });
  return {
    orgA,
    orgB,
    userId,
    clientA,
    clientB,
    productA,
    productA2,
    productB,
    orderA,
  };
}

const update = (orderId: string, set: SQL) =>
  getDb().execute(sql`update orders set ${set} where id = ${orderId}`);

beforeEach(async () => {
  await resetDatabase(getDb());
});

afterAll(async () => {
  await getDb().$client.end();
});

describe("orders y order_lines: claves y CHECK (AC-1)", () => {
  it("un pedido nace pendiente, sin fechas de estado y con clock_timestamp", async () => {
    const s = await seed();
    const result = await getDb().execute<{
      status: string;
      dates: boolean;
      total: string;
    }>(
      sql`select status, total,
                 confirmed_at is null and delivered_at is null and cancelled_at is null as dates
          from orders where id = ${s.orderA}`,
    );
    expect(result.rows[0]).toEqual({
      status: "pending",
      total: "100.00",
      dates: true,
    });
  });

  it("el número es único por organización y positivo", async () => {
    const s = await seed();
    const repeated = await pgError(
      insertOrderRow(getDb(), {
        organizationId: s.orgA,
        clientId: s.clientA,
        createdBy: s.userId,
      }),
    );
    expect(repeated.code).toBe("23505");
    expect(repeated.message).toContain("orders_organization_number_unique");
    // Otra organización puede tener su pedido 1.
    await insertOrderRow(getDb(), {
      organizationId: s.orgB,
      clientId: s.clientB,
      createdBy: s.userId,
    });
    const zero = await pgError(
      insertOrderRow(getDb(), {
        organizationId: s.orgA,
        clientId: s.clientA,
        createdBy: s.userId,
        number: 0,
      }),
    );
    expect(zero.code).toBe("23514");
  });

  it("un pedido no puede apuntar al cliente de otra organización, y el cliente con pedidos no se borra", async () => {
    const s = await seed();
    const foreign = await pgError(
      insertOrderRow(getDb(), {
        organizationId: s.orgA,
        clientId: s.clientB,
        createdBy: s.userId,
        number: 2,
      }),
    );
    expect(foreign.code).toBe("23503");
    expect(foreign.message).toContain("orders_client_fk");
    const deletion = await pgError(
      getDb().execute(sql`delete from clients where id = ${s.clientA}`),
    );
    // ON DELETE RESTRICT: restrict_violation, no foreign_key_violation.
    expect(deletion.code).toBe("23001");
    expect(deletion.message).toContain("orders_client_fk");
  });

  it("rechaza un total que no es positivo y una moneda mal escrita", async () => {
    const s = await seed();
    const insert = (total: string, currency: string, number: number) =>
      pgError(
        insertOrderRow(getDb(), {
          organizationId: s.orgA,
          clientId: s.clientA,
          createdBy: s.userId,
          total,
          currency,
          number,
        }),
      );
    expect((await insert("0", "ARS", 2)).code).toBe("23514");
    expect((await insert("100", "ars", 3)).code).toBe("23514");
  });

  it("una línea no puede apuntar al pedido ni al producto de otra organización", async () => {
    const s = await seed();
    const product = await pgError(
      insertLineRow(getDb(), {
        organizationId: s.orgA,
        orderId: s.orderA,
        productId: s.productB,
        position: 2,
      }),
    );
    expect(product.code).toBe("23503");
    expect(product.message).toContain("order_lines_product_fk");
    const order = await pgError(
      insertLineRow(getDb(), {
        organizationId: s.orgB,
        orderId: s.orderA,
        productId: s.productB,
        position: 2,
      }),
    );
    expect(order.code).toBe("23503");
    expect(order.message).toContain("order_lines_order_fk");
  });

  it("un producto va una sola vez por pedido, y la posición es única y de 1 a 50", async () => {
    const s = await seed();
    const repeated = await pgError(
      insertLineRow(getDb(), {
        organizationId: s.orgA,
        orderId: s.orderA,
        productId: s.productA,
        position: 2,
      }),
    );
    expect(repeated.code).toBe("23505");
    expect(repeated.message).toContain("order_lines_order_product_unique");
    const samePosition = await pgError(
      insertLineRow(getDb(), {
        organizationId: s.orgA,
        orderId: s.orderA,
        productId: s.productA2,
        position: 1,
      }),
    );
    expect(samePosition.code).toBe("23505");
    for (const position of [0, 51]) {
      const error = await pgError(
        insertLineRow(getDb(), {
          organizationId: s.orgA,
          orderId: s.orderA,
          productId: s.productA2,
          position,
        }),
      );
      expect(error.code, String(position)).toBe("23514");
    }
  });

  it("rechaza una cantidad, un precio o un total de línea que no son positivos", async () => {
    const s = await seed();
    const insert = (values: {
      quantity?: string;
      unitPrice?: string;
      lineTotal?: string;
    }) =>
      pgError(
        insertLineRow(getDb(), {
          organizationId: s.orgA,
          orderId: s.orderA,
          productId: s.productA2,
          position: 2,
          ...values,
        }),
      );
    expect((await insert({ quantity: "0" })).code).toBe("23514");
    expect((await insert({ unitPrice: "0" })).code).toBe("23514");
    expect((await insert({ lineTotal: "0" })).code).toBe("23514");
  });

  it("los índices de la lista existen con su orden", async () => {
    const result = await getDb().execute<{
      indexname: string;
      indexdef: string;
    }>(
      sql`select indexname, indexdef from pg_indexes
          where tablename = 'orders' and indexname in ('orders_list_idx', 'orders_client_idx')
          order by indexname`,
    );
    expect(result.rows.map((row) => row.indexdef)).toEqual([
      expect.stringContaining(
        "(organization_id, client_id, created_at DESC NULLS LAST)",
      ),
      expect.stringContaining(
        "(organization_id, created_at DESC NULLS LAST, id DESC NULLS LAST)",
      ),
    ]);
  });

  it("order es un valor del enum de auditoría", async () => {
    const result = await getDb().execute<{ ok: boolean }>(
      sql`select 'order' = any(enum_range(null::audit_entity_type)::text[]) as ok`,
    );
    expect(result.rows[0]!.ok).toBe(true);
  });
});

describe("privilegios de crm_app (AC-1)", () => {
  it("orders y document_counters sin DELETE; order_lines solo SELECT e INSERT", async () => {
    expect(await privileges("orders")).toEqual(["INSERT", "SELECT", "UPDATE"]);
    expect(await privileges("document_counters")).toEqual([
      "INSERT",
      "SELECT",
      "UPDATE",
    ]);
    expect(await privileges("order_lines")).toEqual(["INSERT", "SELECT"]);
  });

  it("crm_app no puede borrar un pedido ni cambiar o borrar una línea: 42501", async () => {
    await seed();
    for (const statement of [
      sql`delete from orders`,
      sql`update order_lines set quantity = 2`,
      sql`delete from order_lines`,
      sql`delete from document_counters`,
    ]) {
      expect(
        (await pgError(asAppRole((tx) => tx.execute(statement)))).code,
      ).toBe("42501");
    }
  });
});

describe("el trigger de orders (ADR 0020, puntos 3 y 4; AC-1)", () => {
  it("rechaza borrar un pedido para cualquier rol: P0001", async () => {
    const s = await seed();
    const error = await pgError(
      getDb().execute(sql`delete from orders where id = ${s.orderA}`),
    );
    expect(error.code).toBe("P0001");
  });

  it("rechaza crear un pedido que no está pendiente o que ya trae fechas de estado", async () => {
    const s = await seed();
    const status = await pgError(
      insertOrderRow(getDb(), {
        organizationId: s.orgA,
        clientId: s.clientA,
        createdBy: s.userId,
        number: 2,
        status: "cancelled",
      }),
    );
    expect(status.code).toBe("P0001");
    const dated = await pgError(
      getDb().execute(
        sql`insert into orders (organization_id, number, client_id, currency, total, created_by,
                                confirmed_at)
            values (${s.orgA}, 3, ${s.clientA}, 'ARS', 1, ${s.userId}, now())`,
      ),
    );
    expect(dated.code).toBe("P0001");
  });

  it("rechaza cambiar cualquier columna fuera de la lista permitida", async () => {
    const s = await seed();
    for (const set of [
      sql`number = 99`,
      sql`client_id = ${s.clientA}::uuid, total = 5`,
      sql`total = 5`,
      sql`currency = 'USD'`,
      sql`created_by = ${s.userId}::uuid, created_at = now() - interval '1 day'`,
      sql`organization_id = ${s.orgB}::uuid`,
      sql`id = gen_random_uuid()`,
    ]) {
      expect((await pgError(update(s.orderA, set))).code).toBe("P0001");
    }
  });

  it("deja pasar las transiciones de la tabla del punto 4, con su fecha", async () => {
    const s = await seed();
    await update(s.orderA, sql`status = 'confirmed', confirmed_at = now()`);
    await update(s.orderA, sql`status = 'delivered', delivered_at = now()`);
    const second = await getDb().execute<{ id: string }>(
      sql`insert into orders (organization_id, number, client_id, currency, total, created_by)
          values (${s.orgA}, 2, ${s.clientA}, 'ARS', 1, ${s.userId}) returning id`,
    );
    await update(
      second.rows[0]!.id,
      sql`status = 'cancelled', cancelled_at = now()`,
    );
    const third = await getDb().execute<{ id: string }>(
      sql`insert into orders (organization_id, number, client_id, currency, total, created_by)
          values (${s.orgA}, 3, ${s.clientA}, 'ARS', 1, ${s.userId}) returning id`,
    );
    await update(
      third.rows[0]!.id,
      sql`status = 'confirmed', confirmed_at = now()`,
    );
    await update(
      third.rows[0]!.id,
      sql`status = 'cancelled', cancelled_at = now()`,
    );
    const result = await getDb().execute<{ status: string }>(
      sql`select status::text from orders order by number`,
    );
    expect(result.rows.map((row) => row.status)).toEqual([
      "delivered",
      "cancelled",
      "cancelled",
    ]);
  });

  it("rechaza toda transición fuera de la tabla: nada sale de delivered ni de cancelled", async () => {
    const s = await seed();
    // pending → delivered salta confirmed.
    expect(
      (
        await pgError(
          update(
            s.orderA,
            sql`status = 'delivered', confirmed_at = now(), delivered_at = now()`,
          ),
        )
      ).code,
    ).toBe("P0001");
    await update(s.orderA, sql`status = 'cancelled', cancelled_at = now()`);
    for (const set of [
      sql`status = 'pending', cancelled_at = null`,
      sql`status = 'confirmed', cancelled_at = null, confirmed_at = now()`,
    ]) {
      expect((await pgError(update(s.orderA, set))).code).toBe("P0001");
    }
  });

  it("una fecha de estado puesta no cambia", async () => {
    const s = await seed();
    await update(s.orderA, sql`status = 'confirmed', confirmed_at = now()`);
    expect(
      (
        await pgError(
          update(s.orderA, sql`confirmed_at = now() + interval '1 hour'`),
        )
      ).code,
    ).toBe("P0001");
  });

  // Revisión independiente de la 19.2, R-1: el CHECK no puede atar confirmed_at, porque un cancelado
  // pudo pasar o no por confirmed; lo ata el trigger.
  it("confirmed_at solo se pone al confirmar", async () => {
    const s = await seed();
    expect(
      (
        await pgError(
          update(
            s.orderA,
            sql`status = 'cancelled', cancelled_at = now(), confirmed_at = now()`,
          ),
        )
      ).code,
    ).toBe("P0001");
    await update(s.orderA, sql`status = 'cancelled', cancelled_at = now()`);
    expect(
      (await pgError(update(s.orderA, sql`confirmed_at = now()`))).code,
    ).toBe("P0001");
  });

  it("el CHECK ata cada fecha a su estado", async () => {
    const s = await seed();
    // Cancelar sin fecha, o confirmar sin la suya, viola orders_status_dates.
    const undated = await pgError(update(s.orderA, sql`status = 'cancelled'`));
    expect(undated.code).toBe("23514");
    expect(undated.message).toContain("orders_status_dates");
    expect(
      (await pgError(update(s.orderA, sql`status = 'confirmed'`))).code,
    ).toBe("23514");
    // Una fecha de otro estado en un pendiente.
    expect(
      (await pgError(update(s.orderA, sql`delivered_at = now()`))).code,
    ).toBe("23514");
  });
});

describe("el trigger de order_lines: solo inserción (AC-1)", () => {
  it("rechaza cambiar o borrar una línea para cualquier rol: P0001", async () => {
    await seed();
    for (const statement of [
      sql`update order_lines set quantity = 2`,
      sql`delete from order_lines`,
    ]) {
      expect((await pgError(getDb().execute(statement))).code).toBe("P0001");
    }
  });
});

describe("el trigger de document_counters (brief-19.2, D-2; AC-1)", () => {
  async function counter(organizationId: string) {
    await getDb().execute(
      sql`insert into document_counters (organization_id, kind, last_number)
          values (${organizationId}, 'order', 0)`,
    );
  }

  it("nace en 0 y solo suma 1", async () => {
    const s = await seed();
    expect(
      (
        await pgError(
          getDb().execute(
            sql`insert into document_counters (organization_id, kind, last_number)
                values (${s.orgA}, 'order', 5)`,
          ),
        )
      ).code,
    ).toBe("P0001");
    await counter(s.orgA);
    await getDb().execute(
      sql`update document_counters set last_number = last_number + 1`,
    );
    for (const set of [
      sql`last_number = last_number + 2`,
      sql`last_number = last_number - 1`,
      sql`last_number = 0`,
      sql`organization_id = ${s.orgB}::uuid, last_number = last_number + 1`,
    ]) {
      expect(
        (
          await pgError(
            getDb().execute(sql`update document_counters set ${set}`),
          )
        ).code,
      ).toBe("P0001");
    }
    const result = await getDb().execute<{ last_number: string }>(
      sql`select last_number from document_counters`,
    );
    expect(result.rows[0]!.last_number).toBe("1");
  });

  it("no se borra, para cualquier rol: P0001", async () => {
    const s = await seed();
    await counter(s.orgA);
    expect(
      (await pgError(getDb().execute(sql`delete from document_counters`))).code,
    ).toBe("P0001");
  });
});

// El pedido del agente (brief-19.4, D-4; migración 0038): exactamente un autor, la credencial con
// el evento que lo creó, un pedido por evento, todo en la misma organización y fijo después.
describe("el autor de servicio y el evento de ingestión (brief-19.4, AC-1)", () => {
  async function serviceOf(organizationId: string, ref: string) {
    const credential = await getDb().execute<{ id: string }>(
      sql`insert into ingestion_credentials (organization_id, source, scope, token_hash)
          values (${organizationId}, 'agente', 'ingest', gen_random_uuid()::text) returning id`,
    );
    const event = await getDb().execute<{ id: string }>(
      sql`insert into ingestion_events (organization_id, source, external_ref, event_type, payload_hash)
          values (${organizationId}, 'agente', ${ref}, 'order.placed', 'hash') returning id`,
    );
    return { credentialId: credential.rows[0]!.id, eventId: event.rows[0]!.id };
  }

  function insertCreated(
    executor: Executor,
    values: {
      organizationId: string;
      clientId: string;
      number: number;
      createdBy: string | null;
      credentialId: string | null;
      eventId: string | null;
    },
  ) {
    return executor.execute(
      sql`insert into orders (organization_id, number, client_id, currency, total, created_by,
                              created_by_credential_id, ingestion_event_id)
          values (${values.organizationId}, ${values.number}, ${values.clientId}, 'ARS', 100,
                  ${values.createdBy}, ${values.credentialId}, ${values.eventId})`,
    );
  }

  it("un pedido del agente lleva la credencial y su evento, sin usuario, también como crm_app", async () => {
    const s = await seed();
    const a = await serviceOf(s.orgA, "evt-1");
    const b = await serviceOf(s.orgA, "evt-2");
    await insertCreated(getDb(), {
      organizationId: s.orgA,
      clientId: s.clientA,
      number: 2,
      createdBy: null,
      credentialId: a.credentialId,
      eventId: a.eventId,
    });
    await asAppRole((tx) =>
      insertCreated(tx, {
        organizationId: s.orgA,
        clientId: s.clientA,
        number: 3,
        createdBy: null,
        credentialId: b.credentialId,
        eventId: b.eventId,
      }),
    );
    const rows = await getDb().execute<{ count: number }>(
      sql`select count(*)::int as count from orders where created_by is null`,
    );
    expect(rows.rows[0]!.count).toBe(2);
  });

  it("CHECK: exactamente un autor, y el evento si y solo si el autor es la credencial", async () => {
    const s = await seed();
    const a = await serviceOf(s.orgA, "evt-1");
    const cases = [
      // Los dos autores.
      { createdBy: s.userId, credentialId: a.credentialId, eventId: a.eventId },
      // Ninguno.
      { createdBy: null, credentialId: null, eventId: null },
      // La credencial sin su evento.
      { createdBy: null, credentialId: a.credentialId, eventId: null },
      // Un usuario con un evento.
      { createdBy: s.userId, credentialId: null, eventId: a.eventId },
    ];
    for (const [index, values] of cases.entries()) {
      for (const executor of ["owner", "app"] as const) {
        const insert = (tx: Executor) =>
          insertCreated(tx, {
            organizationId: s.orgA,
            clientId: s.clientA,
            number: 10 + index,
            ...values,
          });
        const error = await pgError(
          executor === "owner" ? insert(getDb()) : asAppRole(insert),
        );
        expect(error.code).toBe("23514");
      }
    }
  });

  it("un evento crea a lo sumo un pedido, y la credencial y el evento son de la misma organización", async () => {
    const s = await seed();
    const a = await serviceOf(s.orgA, "evt-1");
    const b = await serviceOf(s.orgB, "evt-1");
    const base = {
      organizationId: s.orgA,
      clientId: s.clientA,
      createdBy: null,
    };
    await insertCreated(getDb(), {
      ...base,
      number: 2,
      credentialId: a.credentialId,
      eventId: a.eventId,
    });
    expect(
      (
        await pgError(
          insertCreated(getDb(), {
            ...base,
            number: 3,
            credentialId: a.credentialId,
            eventId: a.eventId,
          }),
        )
      ).code,
    ).toBe("23505");
    expect(
      (
        await pgError(
          insertCreated(getDb(), {
            ...base,
            number: 4,
            credentialId: b.credentialId,
            eventId: (await serviceOf(s.orgA, "evt-libre")).eventId,
          }),
        )
      ).code,
    ).toBe("23503");
    // Revisión independiente, R-3: el UNIQUE y la clave compuesta, también con crm_app.
    expect(
      (
        await pgError(
          asAppRole((tx) =>
            insertCreated(tx, {
              ...base,
              number: 6,
              credentialId: a.credentialId,
              eventId: a.eventId,
            }),
          ),
        )
      ).code,
    ).toBe("23505");
    const appForeign = await serviceOf(s.orgA, "evt-app");
    expect(
      (
        await pgError(
          asAppRole((tx) =>
            insertCreated(tx, {
              ...base,
              number: 7,
              credentialId: b.credentialId,
              eventId: appForeign.eventId,
            }),
          ),
        )
      ).code,
    ).toBe("23503");
    const otherEvent = await serviceOf(s.orgA, "evt-2");
    expect(
      (
        await pgError(
          insertCreated(getDb(), {
            ...base,
            number: 5,
            credentialId: otherEvent.credentialId,
            eventId: b.eventId,
          }),
        )
      ).code,
    ).toBe("23503");
  });

  it("el trigger no deja cambiar el autor ni el evento: P0001", async () => {
    const s = await seed();
    const a = await serviceOf(s.orgA, "evt-1");
    const other = await serviceOf(s.orgA, "evt-2");
    await insertCreated(getDb(), {
      organizationId: s.orgA,
      clientId: s.clientA,
      number: 2,
      createdBy: null,
      credentialId: a.credentialId,
      eventId: a.eventId,
    });
    const agentOrder = await getDb().execute<{ id: string }>(
      sql`select id from orders where organization_id = ${s.orgA} and number = 2`,
    );
    const orderId = agentOrder.rows[0]!.id;
    for (const set of [
      sql`created_by_credential_id = ${other.credentialId}::uuid`,
      sql`ingestion_event_id = ${other.eventId}::uuid`,
      sql`created_by_credential_id = ${other.credentialId}::uuid, ingestion_event_id = ${other.eventId}::uuid`,
    ]) {
      expect((await pgError(update(orderId, set))).code).toBe("P0001");
      // Revisión independiente, R-3: también con crm_app.
      expect(
        (
          await pgError(
            asAppRole((tx) =>
              tx.execute(sql`update orders set ${set} where id = ${orderId}`),
            ),
          )
        ).code,
      ).toBe("P0001");
    }
    // Y un pedido de la app no pasa a ser del agente.
    expect(
      (
        await pgError(
          update(
            s.orderA,
            sql`created_by = null, created_by_credential_id = ${other.credentialId}::uuid, ingestion_event_id = ${other.eventId}::uuid`,
          ),
        )
      ).code,
    ).toBe("P0001");
  });
});

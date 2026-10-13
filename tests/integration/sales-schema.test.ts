import { sql, type SQL } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { getDb, type DbTransaction } from "@/shared/db";
import { resetDatabase } from "./reset-database";

// Esquema de las ventas contra PostgreSQL real (brief-20.2, AC-1): claves compuestas, CHECK, el
// índice único de un pedido por venta, los privilegios de crm_app y el trigger de solo inserción,
// probados con SQL directo y con el rol dueño, que es el que no frenan los privilegios. Que el
// pedido esté entregado lo comprueba el servicio (brief-20.2, D-2), no la base. Desde la 20.3
// (brief-20.3, AC-1): la venta sin pedido, con order_id y client_id nulables y el CHECK que exige
// cliente a la venta de un pedido. Desde la 20.4 (brief-20.4, AC-1): sale_voids, con su copia de la
// venta y su trigger de solo inserción, y la cadena de reemplazos de las ventas de un pedido.

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

async function insertOrder(
  organizationId: string,
  clientId: string,
  createdBy: string,
  number: number,
) {
  const result = await getDb().execute<{ id: string }>(
    sql`insert into orders (organization_id, number, client_id, currency, total, created_by)
        values (${organizationId}, ${number}, ${clientId}, 'ARS', 100, ${createdBy})
        returning id`,
  );
  return result.rows[0]!.id;
}

type Executor = { execute: (query: SQL) => Promise<unknown> };

function insertSaleRow(
  executor: Executor,
  values: {
    organizationId: string;
    orderId: string | null;
    clientId: string | null;
    createdBy: string;
    number?: number;
    total?: string;
    currency?: string;
    replacesSaleId?: string | null;
  },
) {
  return executor.execute(
    sql`insert into sales (organization_id, number, order_id, client_id, currency, total, created_by,
                           replaces_sale_id)
        values (${values.organizationId}, ${values.number ?? 1}, ${values.orderId},
                ${values.clientId}, ${values.currency ?? "ARS"}, ${values.total ?? "100"},
                ${values.createdBy}, ${values.replacesSaleId ?? null})`,
  );
}

function insertVoidRow(
  executor: Executor,
  values: {
    organizationId: string;
    saleId: string;
    createdBy: string;
    number?: number;
    total?: string;
    currency?: string;
    reason?: string;
  },
) {
  return executor.execute(
    sql`insert into sale_voids (organization_id, number, sale_id, currency, total, reason,
                                created_by)
        values (${values.organizationId}, ${values.number ?? 1}, ${values.saleId},
                ${values.currency ?? "ARS"}, ${values.total ?? "100"},
                ${values.reason ?? "data_entry_error"}, ${values.createdBy})`,
  );
}

function insertSaleLineRow(
  executor: Executor,
  values: {
    organizationId: string;
    saleId: string;
    productId: string;
    position?: number;
    quantity?: string;
    unitPrice?: string;
    lineTotal?: string;
    currency?: string;
  },
) {
  return executor.execute(
    sql`insert into sale_lines (organization_id, sale_id, product_id, position, quantity,
                                unit_price, currency, line_total)
        values (${values.organizationId}, ${values.saleId}, ${values.productId},
                ${values.position ?? 1}, ${values.quantity ?? "1"}, ${values.unitPrice ?? "100"},
                ${values.currency ?? "ARS"}, ${values.lineTotal ?? "100"})`,
  );
}

// drizzle-orm envuelve el error de pg; el código de PostgreSQL queda en la causa.
async function pgError(
  query: Promise<unknown>,
): Promise<{ code: string; constraint: string | undefined }> {
  try {
    await query;
  } catch (error) {
    const e = error as {
      code?: string;
      constraint?: string;
      cause?: { code?: string; constraint?: string };
    };
    return {
      code: e.cause?.code ?? e.code ?? "sin código",
      constraint: e.cause?.constraint ?? e.constraint,
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

// A con un pedido, su venta y una línea; B con su cliente, su producto y su pedido.
async function seed() {
  const orgA = await createOrganization("Negocio A");
  const orgB = await createOrganization("Negocio B");
  const userId = await insertUser("ana@example.com");
  const clientA = await insertClient(orgA);
  const clientB = await insertClient(orgB);
  const productA = await insertProduct(orgA, "CAF-1");
  const productA2 = await insertProduct(orgA, "CAF-2");
  const productB = await insertProduct(orgB, "CAF-1");
  const orderA = await insertOrder(orgA, clientA, userId, 1);
  const orderA2 = await insertOrder(orgA, clientA, userId, 2);
  const orderB = await insertOrder(orgB, clientB, userId, 1);
  await insertSaleRow(getDb(), {
    organizationId: orgA,
    orderId: orderA,
    clientId: clientA,
    createdBy: userId,
  });
  const sale = await getDb().execute<{ id: string }>(
    sql`select id from sales where organization_id = ${orgA} and number = 1`,
  );
  const saleA = sale.rows[0]!.id;
  await insertSaleLineRow(getDb(), {
    organizationId: orgA,
    saleId: saleA,
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
    orderA2,
    orderB,
    saleA,
  };
}

beforeEach(async () => {
  await resetDatabase(getDb());
});

afterAll(async () => {
  await getDb().$client.end();
});

describe("sales y sale_lines: claves, CHECK e índices (AC-1)", () => {
  it("una venta guarda la hora del INSERT con clock_timestamp", async () => {
    const result = await getDb().execute<{ column_default: string }>(
      sql`select column_default from information_schema.columns
          where table_name = 'sales' and column_name = 'created_at'`,
    );
    expect(result.rows[0]!.column_default).toBe("clock_timestamp()");
  });

  it("el número es único por organización y positivo", async () => {
    const s = await seed();
    expect(
      await pgError(
        insertSaleRow(getDb(), {
          organizationId: s.orgA,
          orderId: s.orderA2,
          clientId: s.clientA,
          createdBy: s.userId,
          number: 1,
        }),
      ),
    ).toMatchObject({
      code: "23505",
      constraint: "sales_organization_number_unique",
    });
    expect(
      (
        await pgError(
          insertSaleRow(getDb(), {
            organizationId: s.orgA,
            orderId: s.orderA2,
            clientId: s.clientA,
            createdBy: s.userId,
            number: 0,
          }),
        )
      ).constraint,
    ).toBe("sales_number_positive");
    // El mismo número en otra organización es otra serie.
    await insertSaleRow(getDb(), {
      organizationId: s.orgB,
      orderId: s.orderB,
      clientId: s.clientB,
      createdBy: s.userId,
      number: 1,
    });
  });

  it("un pedido tiene una sola primera venta: el índice parcial (brief-20.4, D-3)", async () => {
    const s = await seed();
    expect(
      await pgError(
        insertSaleRow(getDb(), {
          organizationId: s.orgA,
          orderId: s.orderA,
          clientId: s.clientA,
          createdBy: s.userId,
          number: 2,
        }),
      ),
    ).toMatchObject({
      code: "23505",
      constraint: "sales_organization_order_first_unique",
    });
  });

  it("una venta no puede apuntar al pedido ni al cliente de otra organización", async () => {
    const s = await seed();
    expect(
      await pgError(
        insertSaleRow(getDb(), {
          organizationId: s.orgA,
          orderId: s.orderB,
          clientId: s.clientA,
          createdBy: s.userId,
          number: 2,
        }),
      ),
    ).toMatchObject({ code: "23503", constraint: "sales_order_fk" });
    expect(
      await pgError(
        insertSaleRow(getDb(), {
          organizationId: s.orgA,
          orderId: s.orderA2,
          clientId: s.clientB,
          createdBy: s.userId,
          number: 2,
        }),
      ),
    ).toMatchObject({ code: "23503", constraint: "sales_client_fk" });
  });

  it("desde la 20.3, order_id y client_id son nulables; created_by sigue obligatorio", async () => {
    const result = await getDb().execute<{
      column_name: string;
      is_nullable: string;
    }>(
      sql`select column_name, is_nullable from information_schema.columns
          where table_name = 'sales' and column_name in ('order_id', 'client_id', 'created_by')
          order by column_name`,
    );
    expect(result.rows).toEqual([
      { column_name: "client_id", is_nullable: "YES" },
      { column_name: "created_by", is_nullable: "NO" },
      { column_name: "order_id", is_nullable: "YES" },
    ]);
  });

  it("una venta de un pedido tiene cliente; una sin pedido puede no tenerlo (brief-20.3, D-2)", async () => {
    const s = await seed();
    expect(
      await pgError(
        insertSaleRow(getDb(), {
          organizationId: s.orgA,
          orderId: s.orderA2,
          clientId: null,
          createdBy: s.userId,
          number: 2,
        }),
      ),
    ).toMatchObject({ code: "23514", constraint: "sales_order_has_client" });
    // Sin pedido y sin cliente, y sin pedido con cliente.
    await insertSaleRow(getDb(), {
      organizationId: s.orgA,
      orderId: null,
      clientId: null,
      createdBy: s.userId,
      number: 2,
    });
    await insertSaleRow(getDb(), {
      organizationId: s.orgA,
      orderId: null,
      clientId: s.clientA,
      createdBy: s.userId,
      number: 3,
    });
    // Dos ventas sin pedido no chocan en el índice único del pedido: los nulos no son iguales.
    const counted = await getDb().execute<{ total: number }>(
      sql`select count(*)::int as total from sales
          where organization_id = ${s.orgA} and order_id is null`,
    );
    expect(counted.rows[0]!.total).toBe(2);
    // La clave compuesta del cliente sigue rechazando otra organización sin pedido.
    expect(
      await pgError(
        insertSaleRow(getDb(), {
          organizationId: s.orgA,
          orderId: null,
          clientId: s.clientB,
          createdBy: s.userId,
          number: 4,
        }),
      ),
    ).toMatchObject({ code: "23503", constraint: "sales_client_fk" });
  });

  it("un pedido, un cliente o un producto con ventas no se borran: RESTRICT", async () => {
    const s = await seed();
    // RESTRICT responde 23001 (restrict_violation), como en orders.
    expect(
      (
        await pgError(
          getDb().execute(sql`delete from clients where id = ${s.clientA}`),
        )
      ).code,
    ).toBe("23001");
    expect(
      (
        await pgError(
          getDb().execute(sql`delete from products where id = ${s.productA}`),
        )
      ).code,
    ).toBe("23001");
  });

  it("rechaza un total que no es positivo y una moneda mal escrita", async () => {
    const s = await seed();
    for (const [values, constraint] of [
      [{ total: "0" }, "sales_total_positive"],
      [{ currency: "ars" }, "sales_currency_format"],
    ] as const) {
      expect(
        (
          await pgError(
            insertSaleRow(getDb(), {
              organizationId: s.orgA,
              orderId: s.orderA2,
              clientId: s.clientA,
              createdBy: s.userId,
              number: 2,
              ...values,
            }),
          )
        ).constraint,
      ).toBe(constraint);
    }
  });

  it("una línea no puede apuntar a la venta ni al producto de otra organización", async () => {
    const s = await seed();
    expect(
      await pgError(
        insertSaleLineRow(getDb(), {
          organizationId: s.orgB,
          saleId: s.saleA,
          productId: s.productB,
          position: 5,
        }),
      ),
    ).toMatchObject({ code: "23503", constraint: "sale_lines_sale_fk" });
    expect(
      await pgError(
        insertSaleLineRow(getDb(), {
          organizationId: s.orgA,
          saleId: s.saleA,
          productId: s.productB,
          position: 2,
        }),
      ),
    ).toMatchObject({ code: "23503", constraint: "sale_lines_product_fk" });
  });

  it("un producto va una sola vez por venta, y la posición es única y positiva", async () => {
    const s = await seed();
    expect(
      (
        await pgError(
          insertSaleLineRow(getDb(), {
            organizationId: s.orgA,
            saleId: s.saleA,
            productId: s.productA,
            position: 2,
          }),
        )
      ).constraint,
    ).toBe("sale_lines_sale_product_unique");
    expect(
      (
        await pgError(
          insertSaleLineRow(getDb(), {
            organizationId: s.orgA,
            saleId: s.saleA,
            productId: s.productA2,
            position: 1,
          }),
        )
      ).constraint,
    ).toBe("sale_lines_sale_position_unique");
    expect(
      (
        await pgError(
          insertSaleLineRow(getDb(), {
            organizationId: s.orgA,
            saleId: s.saleA,
            productId: s.productA2,
            position: 0,
          }),
        )
      ).constraint,
    ).toBe("sale_lines_position_positive");
  });

  it("rechaza una cantidad, un precio o un total de línea que no son positivos", async () => {
    const s = await seed();
    for (const [values, constraint] of [
      [{ quantity: "0" }, "sale_lines_quantity_positive"],
      [{ unitPrice: "0" }, "sale_lines_unit_price_positive"],
      [{ lineTotal: "0" }, "sale_lines_line_total_positive"],
      [{ currency: "AR" }, "sale_lines_currency_format"],
    ] as const) {
      expect(
        (
          await pgError(
            insertSaleLineRow(getDb(), {
              organizationId: s.orgA,
              saleId: s.saleA,
              productId: s.productA2,
              position: 2,
              ...values,
            }),
          )
        ).constraint,
      ).toBe(constraint);
    }
  });

  it("los índices existen con su forma", async () => {
    const result = await getDb().execute<{
      indexname: string;
      indexdef: string;
    }>(
      sql`select indexname, indexdef from pg_indexes
          where tablename = 'sales'
            and indexname in ('sales_list_idx', 'sales_client_idx',
                              'sales_organization_order_first_unique', 'sales_order_idx')
          order by indexname collate "C"`,
    );
    expect(result.rows.map((row) => row.indexdef)).toEqual([
      expect.stringContaining(
        "(organization_id, client_id, created_at DESC NULLS LAST)",
      ),
      expect.stringContaining(
        "(organization_id, created_at DESC NULLS LAST, id DESC NULLS LAST)",
      ),
      // La búsqueda de la última venta de un pedido (revisión independiente de la 20.4, R-6).
      expect.stringMatching(/^CREATE INDEX .*\(organization_id, order_id\)$/),
      expect.stringMatching(
        /UNIQUE INDEX .*\(organization_id, order_id\) WHERE \(replaces_sale_id IS NULL\)$/,
      ),
    ]);
  });

  it("sale es un valor del enum de auditoría y del tipo de documento", async () => {
    const result = await getDb().execute<{ audit: boolean; kind: boolean }>(
      sql`select 'sale' = any(enum_range(null::audit_entity_type)::text[]) as audit,
                 'sale' = any(enum_range(null::document_kind)::text[]) as kind`,
    );
    expect(result.rows[0]).toEqual({ audit: true, kind: true });
  });

  it("desde la 20.4: sale_void, void y la lista cerrada del motivo (brief-20.4, D-2)", async () => {
    const result = await getDb().execute<{
      kind: boolean;
      movement: boolean;
      action: boolean;
      reasons: string;
    }>(
      sql`select 'sale_void' = any(enum_range(null::document_kind)::text[]) as kind,
                 'sale_void' = any(enum_range(null::inventory_movement_type)::text[]) as movement,
                 'void' = any(enum_range(null::audit_action)::text[]) as action,
                 array_to_string(enum_range(null::sale_void_reason)::text[], ',') as reasons`,
    );
    expect(result.rows[0]).toEqual({
      kind: true,
      movement: true,
      action: true,
      reasons: "data_entry_error,not_completed,wrong_client,other",
    });
  });
});

describe("sale_voids: claves, CHECK y la copia de la venta (brief-20.4, AC-1)", () => {
  it("una venta se anula una sola vez, y el número es único por organización y positivo", async () => {
    const s = await seed();
    await insertVoidRow(getDb(), {
      organizationId: s.orgA,
      saleId: s.saleA,
      createdBy: s.userId,
    });
    expect(
      await pgError(
        insertVoidRow(getDb(), {
          organizationId: s.orgA,
          saleId: s.saleA,
          createdBy: s.userId,
          number: 2,
        }),
      ),
    ).toMatchObject({ code: "23505", constraint: "sale_voids_sale_unique" });
    await insertSaleRow(getDb(), {
      organizationId: s.orgA,
      orderId: null,
      clientId: null,
      createdBy: s.userId,
      number: 2,
    });
    const other = await getDb().execute<{ id: string }>(
      sql`select id from sales where organization_id = ${s.orgA} and number = 2`,
    );
    expect(
      await pgError(
        insertVoidRow(getDb(), {
          organizationId: s.orgA,
          saleId: other.rows[0]!.id,
          createdBy: s.userId,
          number: 1,
        }),
      ),
    ).toMatchObject({
      code: "23505",
      constraint: "sale_voids_organization_number_unique",
    });
    expect(
      (
        await pgError(
          insertVoidRow(getDb(), {
            organizationId: s.orgA,
            saleId: other.rows[0]!.id,
            createdBy: s.userId,
            number: 0,
          }),
        )
      ).constraint,
    ).toBe("sale_voids_number_positive");
  });

  it("la anulación copia la moneda y el total de su venta: el trigger rechaza otros (D-1)", async () => {
    const s = await seed();
    for (const values of [{ total: "99" }, { currency: "USD" }]) {
      expect(
        (
          await pgError(
            insertVoidRow(getDb(), {
              organizationId: s.orgA,
              saleId: s.saleA,
              createdBy: s.userId,
              ...values,
            }),
          )
        ).code,
      ).toBe("P0001");
    }
  });

  it("una anulación no apunta a la venta de otra organización, y el motivo es de la lista", async () => {
    const s = await seed();
    expect(
      await pgError(
        insertVoidRow(getDb(), {
          organizationId: s.orgB,
          saleId: s.saleA,
          createdBy: s.userId,
        }),
      ),
    ).toMatchObject({ code: "23503", constraint: "sale_voids_sale_fk" });
    expect(
      (
        await pgError(
          insertVoidRow(getDb(), {
            organizationId: s.orgA,
            saleId: s.saleA,
            createdBy: s.userId,
            reason: "me arrepentí",
          }),
        )
      ).code,
    ).toBe("22P02");
  });
});

describe("la cadena de reemplazos (ADR 0021, punto 3; brief-20.4, D-3)", () => {
  async function replacement(
    s: Awaited<ReturnType<typeof seed>>,
    values: { orderId: string | null; replacesSaleId: string; number: number },
  ) {
    return insertSaleRow(getDb(), {
      organizationId: s.orgA,
      orderId: values.orderId,
      clientId: s.clientA,
      createdBy: s.userId,
      number: values.number,
      replacesSaleId: values.replacesSaleId,
    });
  }

  it("una venta vigente no se reemplaza: P0001", async () => {
    const s = await seed();
    expect(
      (
        await pgError(
          replacement(s, {
            orderId: s.orderA,
            replacesSaleId: s.saleA,
            number: 2,
          }),
        )
      ).code,
    ).toBe("P0001");
  });

  it("anulada, se reemplaza una sola vez y solo desde el mismo pedido", async () => {
    const s = await seed();
    await insertVoidRow(getDb(), {
      organizationId: s.orgA,
      saleId: s.saleA,
      createdBy: s.userId,
    });
    // Otro pedido: lo rechaza el trigger.
    expect(
      (
        await pgError(
          replacement(s, {
            orderId: s.orderA2,
            replacesSaleId: s.saleA,
            number: 2,
          }),
        )
      ).code,
    ).toBe("P0001");
    // Sin pedido: el trigger lo rechaza con IS DISTINCT FROM.
    expect(
      (
        await pgError(
          replacement(s, { orderId: null, replacesSaleId: s.saleA, number: 2 }),
        )
      ).code,
    ).toBe("P0001");
    await replacement(s, {
      orderId: s.orderA,
      replacesSaleId: s.saleA,
      number: 2,
    });
    expect(
      await pgError(
        replacement(s, {
          orderId: s.orderA,
          replacesSaleId: s.saleA,
          number: 3,
        }),
      ),
    ).toMatchObject({
      code: "23505",
      constraint: "sales_replaces_sale_unique",
    });
  });

  it("la venta reemplazada tiene que existir en la organización", async () => {
    const s = await seed();
    await insertSaleRow(getDb(), {
      organizationId: s.orgB,
      orderId: s.orderB,
      clientId: s.clientB,
      createdBy: s.userId,
    });
    const saleB = await getDb().execute<{ id: string }>(
      sql`select id from sales where organization_id = ${s.orgB}`,
    );
    expect(
      (
        await pgError(
          replacement(s, {
            orderId: s.orderA,
            replacesSaleId: saleB.rows[0]!.id,
            number: 2,
          }),
        )
      ).code,
    ).toBe("P0001");
  });

  it("sin el trigger, la base sigue exigiendo un pedido para reemplazar: el CHECK", async () => {
    const s = await seed();
    const error = await pgError(
      getDb().transaction(async (tx) => {
        await tx.execute(sql`set local session_replication_role = replica`);
        await insertSaleRow(tx, {
          organizationId: s.orgA,
          orderId: null,
          clientId: s.clientA,
          createdBy: s.userId,
          number: 2,
          replacesSaleId: s.saleA,
        });
      }),
    );
    expect(error).toMatchObject({
      code: "23514",
      constraint: "sales_replaces_needs_order",
    });
  });
});

describe("privilegios de crm_app (AC-1)", () => {
  it("sales, sale_lines y sale_voids solo SELECT e INSERT", async () => {
    expect(await privileges("sales")).toEqual(["INSERT", "SELECT"]);
    expect(await privileges("sale_lines")).toEqual(["INSERT", "SELECT"]);
    expect(await privileges("sale_voids")).toEqual(["INSERT", "SELECT"]);
  });

  it("crm_app no puede cambiar ni borrar una venta, una línea ni una anulación: 42501", async () => {
    const s = await seed();
    await insertVoidRow(getDb(), {
      organizationId: s.orgA,
      saleId: s.saleA,
      createdBy: s.userId,
    });
    for (const statement of [
      sql`update sales set total = 1`,
      sql`delete from sales`,
      sql`update sale_lines set quantity = 2`,
      sql`delete from sale_lines`,
      sql`update sale_voids set reason = 'other'`,
      sql`delete from sale_voids`,
    ]) {
      expect(
        (await pgError(asAppRole((tx) => tx.execute(statement)))).code,
      ).toBe("42501");
    }
  });

  it("crm_app inserta una venta y su línea", async () => {
    const s = await seed();
    await asAppRole(async (tx) => {
      await insertSaleRow(tx, {
        organizationId: s.orgA,
        orderId: s.orderA2,
        clientId: s.clientA,
        createdBy: s.userId,
        number: 2,
      });
    });
    const result = await getDb().execute<{ count: number }>(
      sql`select count(*)::int as count from sales`,
    );
    expect(result.rows[0]!.count).toBe(2);
  });
});

describe("el trigger de solo inserción (ADR 0021, punto 2; AC-1)", () => {
  it("rechaza cambiar o borrar una venta, una línea o una anulación para cualquier rol: P0001", async () => {
    const s = await seed();
    await insertVoidRow(getDb(), {
      organizationId: s.orgA,
      saleId: s.saleA,
      createdBy: s.userId,
    });
    for (const statement of [
      sql`update sales set total = 1`,
      sql`update sales set order_id = order_id`,
      sql`delete from sales`,
      sql`update sale_lines set quantity = 2`,
      sql`delete from sale_lines`,
      sql`update sale_voids set reason = 'other'`,
      sql`delete from sale_voids`,
    ]) {
      expect((await pgError(getDb().execute(statement))).code).toBe("P0001");
    }
  });
});

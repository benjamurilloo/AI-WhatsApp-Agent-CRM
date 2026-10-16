import { sql, type SQL } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { getDb, type DbTransaction } from "@/shared/db";
import { resetDatabase } from "./reset-database";

// El esquema de la orden de compra contra PostgreSQL real (brief-22.3, AC-1): los privilegios, los
// CHECK, los índices únicos y los triggers de purchase_orders y purchase_order_lines, probados con
// SQL directo y con el rol dueño, que es el que no frenan los privilegios. Las mutaciones del trigger
// (una transición de más, una columna de más) se prueban acá contra la base.

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

async function insertSupplier(organizationId: string, name = "Norte") {
  const result = await getDb().execute<{ id: string }>(
    sql`insert into suppliers (organization_id, name)
        values (${organizationId}, ${name}) returning id`,
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

type OrderValues = {
  organizationId: string;
  supplierId: string;
  createdBy: string;
  number?: number;
  total?: string;
  currency?: string;
  status?: string;
  closedAt?: string | null;
  cancelledAt?: string | null;
};

function insertOrderRow(executor: Executor, values: OrderValues) {
  return executor.execute(
    sql`insert into purchase_orders (organization_id, number, supplier_id, currency, total,
                                     created_by, status, closed_at, cancelled_at)
        values (${values.organizationId}, ${values.number ?? 1}, ${values.supplierId},
                ${values.currency ?? "ARS"}, ${values.total ?? "100"}, ${values.createdBy},
                ${values.status ?? "open"}::purchase_order_status,
                ${values.closedAt ?? null}::timestamptz, ${values.cancelledAt ?? null}::timestamptz)`,
  );
}

type LineValues = {
  organizationId: string;
  orderId: string;
  productId: string;
  position?: number;
  quantity?: string;
  unitCost?: string;
  lineTotal?: string;
};

function insertLineRow(executor: Executor, values: LineValues) {
  return executor.execute(
    sql`insert into purchase_order_lines (organization_id, purchase_order_id, product_id,
                                          position, quantity, unit_cost, line_total)
        values (${values.organizationId}, ${values.orderId}, ${values.productId},
                ${values.position ?? 1}, ${values.quantity ?? "1"}, ${values.unitCost ?? "100"},
                ${values.lineTotal ?? "100"})`,
  );
}

// drizzle-orm envuelve el error de pg; el código de PostgreSQL queda en la causa.
async function pgError(
  query: Promise<unknown>,
): Promise<{ code: string; constraint: string | undefined; message: string }> {
  try {
    await query;
  } catch (error) {
    const e = error as {
      code?: string;
      constraint?: string;
      message?: string;
      cause?: { code?: string; constraint?: string; message?: string };
    };
    return {
      code: e.cause?.code ?? e.code ?? "sin código",
      constraint: e.cause?.constraint ?? e.constraint,
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
  const supplierA = await insertSupplier(orgA);
  const supplierB = await insertSupplier(orgB);
  const productA = await insertProduct(orgA, "CAF-1");
  const productA2 = await insertProduct(orgA, "CAF-2");
  const productB = await insertProduct(orgB, "CAF-1");
  await insertOrderRow(getDb(), {
    organizationId: orgA,
    supplierId: supplierA,
    createdBy: userId,
  });
  const order = await getDb().execute<{ id: string }>(
    sql`select id from purchase_orders where organization_id = ${orgA} and number = 1`,
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
    supplierA,
    supplierB,
    productA,
    productA2,
    productB,
    orderA,
  };
}

async function statusOf(orderId: string) {
  const result = await getDb().execute<{ status: string }>(
    sql`select status from purchase_orders where id = ${orderId}`,
  );
  return result.rows[0]!.status;
}

beforeEach(async () => {
  await resetDatabase(getDb());
});

afterAll(async () => {
  await getDb().$client.end();
});

describe("los privilegios (AC-1; D-2)", () => {
  it("purchase_orders: SELECT, INSERT y UPDATE; purchase_order_lines: SELECT e INSERT", async () => {
    expect(await privileges("purchase_orders")).toEqual([
      "INSERT",
      "SELECT",
      "UPDATE",
    ]);
    expect(await privileges("purchase_order_lines")).toEqual([
      "INSERT",
      "SELECT",
    ]);
  });

  it("crm_app no borra ninguna de las dos ni actualiza las líneas: 42501", async () => {
    const s = await seed();
    for (const statement of [
      sql`delete from purchase_orders where id = ${s.orderA}`,
      sql`delete from purchase_order_lines where purchase_order_id = ${s.orderA}`,
      sql`update purchase_order_lines set quantity = 2 where purchase_order_id = ${s.orderA}`,
    ]) {
      expect(
        (await pgError(asAppRole((tx) => tx.execute(statement)))).code,
      ).toBe("42501");
    }
  });

  it("purchase_order es un valor de document_kind y de audit_entity_type", async () => {
    const result = await getDb().execute<{ kind: boolean; entity: boolean }>(
      sql`select 'purchase_order' = any(enum_range(null::document_kind)::text[]) as kind,
                 'purchase_order' = any(enum_range(null::audit_entity_type)::text[]) as entity`,
    );
    expect(result.rows[0]).toEqual({ kind: true, entity: true });
  });
});

describe("los CHECK (AC-1; D-1)", () => {
  it.each([
    ["el número en cero", { number: 0 }, "purchase_orders_number_positive"],
    ["el total en cero", { total: "0" }, "purchase_orders_total_positive"],
    [
      "la moneda en minúsculas",
      { currency: "ars" },
      "purchase_orders_currency_format",
    ],
    [
      "la moneda de cuatro letras",
      { currency: "ARSS" },
      "purchase_orders_currency_format",
    ],
  ] as const)("la orden rechaza %s", async (_label, values, constraint) => {
    const s = await seed();
    expect(
      await pgError(
        insertOrderRow(getDb(), {
          organizationId: s.orgA,
          supplierId: s.supplierA,
          createdBy: s.userId,
          number: 2,
          ...values,
        }),
      ),
    ).toMatchObject({ code: "23514", constraint });
  });

  // El trigger exige nacer abierta, así que las fechas atadas al estado se prueban con el trigger
  // desactivado para esta transacción, como el CHECK de orders_status_dates en la 19.2.
  it.each([
    ["cerrada sin closed_at", { status: "closed" }],
    ["cancelada sin cancelled_at", { status: "cancelled" }],
    ["abierta con closed_at", { closedAt: "2026-10-15T12:00:00Z" }],
    ["abierta con cancelled_at", { cancelledAt: "2026-10-15T12:00:00Z" }],
    [
      "cerrada con cancelled_at",
      {
        status: "closed",
        closedAt: "2026-10-15T12:00:00Z",
        cancelledAt: "2026-10-15T12:00:00Z",
      },
    ],
  ] as const)(
    "las fechas atadas al estado: rechaza %s",
    async (_label, values) => {
      const s = await seed();
      const error = await pgError(
        getDb().transaction(async (tx) => {
          await tx.execute(
            sql`alter table purchase_orders disable trigger purchase_orders_guard`,
          );
          await insertOrderRow(tx, {
            organizationId: s.orgA,
            supplierId: s.supplierA,
            createdBy: s.userId,
            number: 2,
            ...values,
          });
        }),
      );
      expect(error).toMatchObject({
        code: "23514",
        constraint: "purchase_orders_status_dates",
      });
    },
  );

  it.each([
    [
      "la posición en cero",
      { position: 0 },
      "purchase_order_lines_position_range",
    ],
    ["la posición 51", { position: 51 }, "purchase_order_lines_position_range"],
    [
      "la cantidad en cero",
      { quantity: "0" },
      "purchase_order_lines_quantity_positive",
    ],
    [
      "el costo en cero",
      { unitCost: "0" },
      "purchase_order_lines_unit_cost_positive",
    ],
    [
      "el total en cero",
      { lineTotal: "0" },
      "purchase_order_lines_line_total_positive",
    ],
  ] as const)("la línea rechaza %s", async (_label, values, constraint) => {
    const s = await seed();
    expect(
      await pgError(
        insertLineRow(getDb(), {
          organizationId: s.orgA,
          orderId: s.orderA,
          productId: s.productA2,
          position: 2,
          ...values,
        }),
      ),
    ).toMatchObject({ code: "23514", constraint });
  });
});

describe("las claves (AC-1; D-1)", () => {
  it("el número es único por organización, y otra organización lo repite", async () => {
    const s = await seed();
    expect(
      await pgError(
        insertOrderRow(getDb(), {
          organizationId: s.orgA,
          supplierId: s.supplierA,
          createdBy: s.userId,
        }),
      ),
    ).toMatchObject({
      code: "23505",
      constraint: "purchase_orders_organization_number_unique",
    });
    await insertOrderRow(getDb(), {
      organizationId: s.orgB,
      supplierId: s.supplierB,
      createdBy: s.userId,
    });
  });

  it("un producto y una posición por orden", async () => {
    const s = await seed();
    expect(
      await pgError(
        insertLineRow(getDb(), {
          organizationId: s.orgA,
          orderId: s.orderA,
          productId: s.productA,
          position: 2,
        }),
      ),
    ).toMatchObject({
      code: "23505",
      constraint: "purchase_order_lines_order_product_unique",
    });
    expect(
      await pgError(
        insertLineRow(getDb(), {
          organizationId: s.orgA,
          orderId: s.orderA,
          productId: s.productA2,
          position: 1,
        }),
      ),
    ).toMatchObject({
      code: "23505",
      constraint: "purchase_order_lines_order_position_unique",
    });
  });

  it("ni el proveedor, ni la orden, ni el producto de otra organización: 23503", async () => {
    const s = await seed();
    expect(
      await pgError(
        insertOrderRow(getDb(), {
          organizationId: s.orgA,
          supplierId: s.supplierB,
          createdBy: s.userId,
          number: 2,
        }),
      ),
    ).toMatchObject({
      code: "23503",
      constraint: "purchase_orders_supplier_fk",
    });
    expect(
      await pgError(
        insertLineRow(getDb(), {
          organizationId: s.orgB,
          orderId: s.orderA,
          productId: s.productB,
          position: 2,
        }),
      ),
    ).toMatchObject({
      code: "23503",
      constraint: "purchase_order_lines_order_fk",
    });
    expect(
      await pgError(
        insertLineRow(getDb(), {
          organizationId: s.orgA,
          orderId: s.orderA,
          productId: s.productB,
          position: 2,
        }),
      ),
    ).toMatchObject({
      code: "23503",
      constraint: "purchase_order_lines_product_fk",
    });
  });

  // brief-22.4, D-1 y H-7: los destinos de las claves compuestas de la recepción.
  it("los únicos que usa la recepción: la orden con su proveedor y su moneda, y la línea con su producto", async () => {
    const result = await getDb().execute<{ name: string; columns: string }>(
      sql`select c.conname as name,
                 string_agg(a.attname, ',' order by k.ordinality) as columns
          from pg_constraint c
          cross join lateral unnest(c.conkey) with ordinality as k(attnum, ordinality)
          join pg_attribute a on a.attrelid = c.conrelid and a.attnum = k.attnum
          where c.contype = 'u'
            and c.conname in ('purchase_orders_organization_id_supplier_currency_unique',
                              'purchase_order_lines_organization_id_product_unique')
          group by c.conname
          order by c.conname`,
    );
    expect(result.rows).toEqual([
      {
        name: "purchase_order_lines_organization_id_product_unique",
        columns: "organization_id,id,product_id",
      },
      {
        name: "purchase_orders_organization_id_supplier_currency_unique",
        columns: "organization_id,id,supplier_id,currency",
      },
    ]);
  });

  // ON DELETE RESTRICT responde restrict_violation, 23001.
  it("un proveedor con órdenes no se borra", async () => {
    const s = await seed();
    expect(
      await pgError(
        getDb().execute(sql`delete from suppliers where id = ${s.supplierA}`),
      ),
    ).toMatchObject({
      code: "23001",
      constraint: "purchase_orders_supplier_fk",
    });
  });
});

describe("el trigger de purchase_orders (AC-1; D-2)", () => {
  it("nace abierta y sin fechas de estado, para cualquier rol: P0001", async () => {
    const s = await seed();
    for (const values of [
      { status: "closed", closedAt: "2026-10-15T12:00:00Z" },
      { status: "cancelled", cancelledAt: "2026-10-15T12:00:00Z" },
    ]) {
      expect(
        await pgError(
          insertOrderRow(getDb(), {
            organizationId: s.orgA,
            supplierId: s.supplierA,
            createdBy: s.userId,
            number: 2,
            ...values,
          }),
        ),
      ).toMatchObject({
        code: "P0001",
        message: "una orden de compra nace abierta",
      });
    }
  });

  it("no se borra, tampoco con el rol dueño: P0001", async () => {
    const s = await seed();
    // El trigger corre antes que la clave foránea de las líneas: el rechazo es el suyo.
    expect(
      await pgError(
        getDb().execute(
          sql`delete from purchase_orders where id = ${s.orderA}`,
        ),
      ),
    ).toMatchObject({ code: "P0001", message: "purchase_orders no se borra" });
  });

  it("un UPDATE solo cambia el estado y sus fechas", async () => {
    const s = await seed();
    for (const statement of [
      sql`update purchase_orders set total = 200 where id = ${s.orderA}`,
      sql`update purchase_orders set currency = 'USD' where id = ${s.orderA}`,
      sql`update purchase_orders set supplier_id = ${s.supplierA}, number = 9 where id = ${s.orderA}`,
      sql`update purchase_orders set created_at = now() - interval '1 day' where id = ${s.orderA}`,
    ]) {
      expect(await pgError(getDb().execute(statement))).toMatchObject({
        code: "P0001",
        message: "purchase_orders: solo cambian el estado y sus fechas",
      });
    }
  });

  it("admite open → cancelled y open → closed", async () => {
    const s = await seed();
    await getDb().execute(
      sql`update purchase_orders set status = 'cancelled', cancelled_at = now()
          where id = ${s.orderA}`,
    );
    expect(await statusOf(s.orderA)).toBe("cancelled");

    await insertOrderRow(getDb(), {
      organizationId: s.orgA,
      supplierId: s.supplierA,
      createdBy: s.userId,
      number: 2,
    });
    await getDb().execute(
      sql`update purchase_orders set status = 'closed', closed_at = now()
          where organization_id = ${s.orgA} and number = 2`,
    );
    const closed = await getDb().execute<{ status: string }>(
      sql`select status from purchase_orders where organization_id = ${s.orgA} and number = 2`,
    );
    expect(closed.rows[0]!.status).toBe("closed");
  });

  it("nada sale de un estado final, y una fecha puesta no cambia", async () => {
    const s = await seed();
    await getDb().execute(
      sql`update purchase_orders set status = 'cancelled', cancelled_at = now()
          where id = ${s.orderA}`,
    );
    await insertOrderRow(getDb(), {
      organizationId: s.orgA,
      supplierId: s.supplierA,
      createdBy: s.userId,
      number: 2,
    });
    await getDb().execute(
      sql`update purchase_orders set status = 'closed', closed_at = now()
          where organization_id = ${s.orgA} and number = 2`,
    );
    for (const statement of [
      sql`update purchase_orders set status = 'open', cancelled_at = null where id = ${s.orderA}`,
      sql`update purchase_orders set status = 'closed', closed_at = now(), cancelled_at = null
          where id = ${s.orderA}`,
      sql`update purchase_orders set status = 'open', closed_at = null
          where organization_id = ${s.orgA} and number = 2`,
      sql`update purchase_orders set status = 'cancelled', cancelled_at = now(), closed_at = null
          where organization_id = ${s.orgA} and number = 2`,
    ]) {
      expect(await pgError(getDb().execute(statement))).toMatchObject({
        code: "P0001",
      });
      expect((await pgError(getDb().execute(statement))).message).toMatch(
        /transición .* no permitida/,
      );
    }
    expect(
      await pgError(
        getDb().execute(
          sql`update purchase_orders set cancelled_at = now() - interval '1 day'
              where id = ${s.orderA}`,
        ),
      ),
    ).toMatchObject({
      code: "P0001",
      message: "purchase_orders: una fecha de estado no cambia",
    });
  });
});

describe("el trigger de purchase_order_lines (AC-1; D-2)", () => {
  it("rechaza UPDATE y DELETE para cualquier rol: P0001", async () => {
    const s = await seed();
    for (const statement of [
      sql`update purchase_order_lines set quantity = 2 where purchase_order_id = ${s.orderA}`,
      sql`delete from purchase_order_lines where purchase_order_id = ${s.orderA}`,
    ]) {
      const error = await pgError(getDb().execute(statement));
      expect(error.code).toBe("P0001");
      expect(error.message).toMatch(
        /purchase_order_lines es de solo inserción/,
      );
    }
  });
});

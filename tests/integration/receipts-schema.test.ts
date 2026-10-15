import { sql, type SQL } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { getDb, type DbTransaction } from "@/shared/db";
import { resetDatabase } from "./reset-database";

// Esquema de los cobros contra PostgreSQL real (brief-21.3, AC-1): privilegios, solo inserción, el
// destino, el efectivo y su sesión, la sesión cerrada, las claves compuestas, los CHECK y el cliente
// con cobros, probados con SQL directo y con el rol dueño, que es el que no frenan los privilegios.
// Que el cliente, la moneda y el tope sean los de la venta lo asegura el servicio (H-4), y lo prueba
// receipts.test.ts. Desde la 21.4, el destino pedido, la seña (brief-21.4, AC-1): su CHECK, su clave
// compuesta, el pedido con señas y los triggers de la 0043 sobre una seña; el servicio, en
// order-receipts.test.ts.

type Executor = { execute: (query: SQL) => Promise<unknown> };

async function returningId(executor: Executor, query: SQL): Promise<string> {
  const result = (await executor.execute(query)) as { rows: { id: string }[] };
  return result.rows[0]!.id;
}

const createOrganization = (name: string) =>
  returningId(
    getDb(),
    sql`insert into organizations (name) values (${name}) returning id`,
  );

const insertUser = (email: string) =>
  returningId(
    getDb(),
    sql`insert into users (email, password_hash, name)
        values (${email}, 'hash', 'Ana') returning id`,
  );

const insertClient = (organizationId: string) =>
  returningId(
    getDb(),
    sql`insert into clients (organization_id, display_name)
        values (${organizationId}, 'Lucía') returning id`,
  );

const insertSale = (
  organizationId: string,
  userId: string,
  number: number,
  clientId: string | null,
) =>
  returningId(
    getDb(),
    sql`insert into sales (organization_id, number, client_id, currency, total, created_by)
        values (${organizationId}, ${number}, ${clientId}, 'ARS', '1000', ${userId})
        returning id`,
  );

const insertOrder = (
  organizationId: string,
  userId: string,
  number: number,
  clientId: string,
) =>
  returningId(
    getDb(),
    sql`insert into orders (organization_id, number, client_id, currency, total, created_by)
        values (${organizationId}, ${number}, ${clientId}, 'ARS', '1000', ${userId})
        returning id`,
  );

const insertMethod = (organizationId: string, name: string, isCash: boolean) =>
  returningId(
    getDb(),
    sql`insert into payment_methods (organization_id, name, is_cash)
        values (${organizationId}, ${name}, ${isCash}) returning id`,
  );

const insertSession = (
  organizationId: string,
  userId: string,
  number: number,
  previousSessionId: string | null = null,
) =>
  returningId(
    getDb(),
    sql`insert into cash_sessions (organization_id, number, previous_session_id, opened_by)
        values (${organizationId}, ${number}, ${previousSessionId}, ${userId})
        returning id`,
  );

type ReceiptValues = {
  organizationId: string;
  number: number;
  saleId: string | null;
  orderId?: string | null;
  clientId: string | null;
  paymentMethodId: string;
  sessionId: string | null;
  userId: string;
  target?: string;
  currency?: string;
  amount?: string;
};

function insertReceipt(executor: Executor, values: ReceiptValues) {
  return executor.execute(
    sql`insert into receipts (organization_id, number, target, sale_id, order_id, client_id,
                              payment_method_id, session_id, currency, amount, created_by)
        values (${values.organizationId}, ${values.number}, ${values.target ?? "sale"},
                ${values.saleId}, ${values.orderId ?? null}, ${values.clientId}, ${values.paymentMethodId},
                ${values.sessionId}, ${values.currency ?? "ARS"}, ${values.amount ?? "100"},
                ${values.userId})
        returning id`,
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

// A con un cliente, una venta con cliente y otra sin, un pedido, efectivo y transferencia, una sesión
// cerrada y la siguiente abierta; B con lo mismo, para las claves compuestas.
async function seed() {
  const orgA = await createOrganization("Negocio A");
  const orgB = await createOrganization("Negocio B");
  const userId = await insertUser("ana@example.com");
  const clientA = await insertClient(orgA);
  const clientB = await insertClient(orgB);
  const saleA = await insertSale(orgA, userId, 1, clientA);
  const counterSaleA = await insertSale(orgA, userId, 2, null);
  const saleB = await insertSale(orgB, userId, 1, clientB);
  const orderA = await insertOrder(orgA, userId, 1, clientA);
  const orderB = await insertOrder(orgB, userId, 1, clientB);
  const cashA = await insertMethod(orgA, "Efectivo", true);
  const transferA = await insertMethod(orgA, "Transferencia", false);
  const cashB = await insertMethod(orgB, "Efectivo", true);
  const closed = await insertSession(orgA, userId, 1);
  await getDb().execute(
    sql`insert into cash_session_closings (organization_id, session_id, closed_by)
        values (${orgA}, ${closed}, ${userId})`,
  );
  const open = await insertSession(orgA, userId, 2, closed);
  const openB = await insertSession(orgB, userId, 1);
  return {
    orgA,
    orgB,
    userId,
    clientA,
    clientB,
    saleA,
    counterSaleA,
    saleB,
    orderA,
    orderB,
    cashA,
    transferA,
    cashB,
    closed,
    open,
    openB,
  };
}

type Seed = Awaited<ReturnType<typeof seed>>;

// Un cobro válido de A, en transferencia, con lo que cambie cada caso.
function receiptOf(
  s: Seed,
  values: Partial<ReceiptValues> = {},
): ReceiptValues {
  return {
    organizationId: s.orgA,
    number: 1,
    saleId: s.saleA,
    clientId: s.clientA,
    paymentMethodId: s.transferA,
    sessionId: null,
    userId: s.userId,
    ...values,
  };
}

beforeEach(async () => {
  await resetDatabase(getDb());
});

afterAll(async () => {
  await getDb().$client.end();
});

describe("los valores nuevos de los enums (AC-1)", () => {
  async function enumValues(name: string) {
    const result = await getDb().execute<{ value: string }>(
      sql`select e.enumlabel as value from pg_enum e
          join pg_type t on t.oid = e.enumtypid
          where t.typname = ${name} order by e.enumsortorder`,
    );
    return result.rows.map((row) => row.value);
  }

  it("suma el recibo a los documentos y a la auditoría; el destino nace con la venta y suma el pedido y la cuenta", async () => {
    expect(await enumValues("document_kind")).toContain("receipt");
    expect(await enumValues("audit_entity_type")).toContain("receipt");
    expect(await enumValues("receipt_target")).toEqual([
      "sale",
      "order",
      "account",
    ]);
  });
});

describe("privilegios y solo inserción (AC-1)", () => {
  it("crm_app tiene SELECT e INSERT en receipts, sin UPDATE ni DELETE", async () => {
    const result = await getDb().execute<{ privilege: string }>(
      sql`select privilege_type as privilege from information_schema.role_table_grants
          where grantee = 'crm_app' and table_name = 'receipts'
          order by privilege_type`,
    );
    expect(result.rows.map((row) => row.privilege)).toEqual([
      "INSERT",
      "SELECT",
    ]);
  });

  it("crm_app inserta un cobro, y no lo actualiza ni lo borra", async () => {
    const s = await seed();
    await asAppRole((tx) => insertReceipt(tx, receiptOf(s)));
    expect(
      (
        await pgError(
          asAppRole((tx) => tx.execute(sql`update receipts set amount = 1`)),
        )
      ).code,
    ).toBe("42501");
    expect(
      (await pgError(asAppRole((tx) => tx.execute(sql`delete from receipts`))))
        .code,
    ).toBe("42501");
  });

  it("el trigger rechaza UPDATE y DELETE, también al dueño", async () => {
    const s = await seed();
    await insertReceipt(getDb(), receiptOf(s));
    const update = await pgError(
      getDb().execute(sql`update receipts set amount = 1`),
    );
    expect(update.code).toBe("P0001");
    expect(update.message).toContain("solo inserción: UPDATE");
    const remove = await pgError(getDb().execute(sql`delete from receipts`));
    expect(remove.code).toBe("P0001");
    expect(remove.message).toContain("solo inserción: DELETE");
  });
});

describe("el destino (AC-1; ADR 0022, punto 2)", () => {
  it("un cobro sin venta se rechaza", async () => {
    const s = await seed();
    const error = await pgError(
      insertReceipt(getDb(), receiptOf(s, { saleId: null })),
    );
    expect(error).toMatchObject({
      code: "23514",
      constraint: "receipts_target_check",
    });
  });

  it("el destino solo puede ser una venta, un pedido o la cuenta", async () => {
    const s = await seed();
    expect(
      (
        await pgError(
          insertReceipt(getDb(), receiptOf(s, { target: "client" })),
        )
      ).code,
    ).toBe("22P02");
  });

  // brief-21.6, D-1: el cobro a cuenta, con el cliente y sin venta ni pedido.
  it("un cobro a cuenta con su cliente, sin venta ni pedido, se acepta", async () => {
    const s = await seed();
    await insertReceipt(
      getDb(),
      receiptOf(s, { target: "account", saleId: null, orderId: null }),
    );
  });

  it.each([
    [
      "un cobro a cuenta sin cliente",
      () => ({ target: "account", saleId: null, clientId: null }),
    ],
    [
      "un cobro a cuenta con venta",
      (s: Seed) => ({ target: "account", saleId: s.saleA }),
    ],
    [
      "un cobro a cuenta con pedido",
      (s: Seed) => ({ target: "account", saleId: null, orderId: s.orderA }),
    ],
  ])("%s se rechaza", async (_, values) => {
    const s = await seed();
    const error = await pgError(
      insertReceipt(getDb(), receiptOf(s, values(s))),
    );
    expect(error).toMatchObject({
      code: "23514",
      constraint: "receipts_target_check",
    });
  });

  // brief-21.4, D-1: un solo destino, con su clave y sin la del otro.
  it.each([
    [
      "una seña sin pedido",
      () => ({ target: "order", saleId: null, orderId: null }),
    ],
    [
      "una seña con venta y pedido",
      (s: Seed) => ({ target: "order", saleId: s.saleA, orderId: s.orderA }),
    ],
    [
      "un cobro de venta con pedido",
      (s: Seed) => ({ target: "sale", saleId: s.saleA, orderId: s.orderA }),
    ],
  ])("%s se rechaza", async (_, values) => {
    const s = await seed();
    const error = await pgError(
      insertReceipt(getDb(), receiptOf(s, values(s))),
    );
    expect(error).toMatchObject({
      code: "23514",
      constraint: "receipts_target_check",
    });
  });

  it("una seña con su pedido y sin venta se acepta", async () => {
    const s = await seed();
    await insertReceipt(
      getDb(),
      receiptOf(s, { target: "order", saleId: null, orderId: s.orderA }),
    );
  });

  it("un cobro de una venta sin cliente lleva el cliente nulo", async () => {
    const s = await seed();
    await insertReceipt(
      getDb(),
      receiptOf(s, { saleId: s.counterSaleA, clientId: null }),
    );
  });
});

describe("el efectivo y su sesión (AC-1; brief-21.3, H-3 y H-4)", () => {
  it("un cobro en efectivo sin sesión se rechaza", async () => {
    const s = await seed();
    const error = await pgError(
      insertReceipt(getDb(), receiptOf(s, { paymentMethodId: s.cashA })),
    );
    expect(error.code).toBe("P0001");
    expect(error.message).toContain("necesita una sesión de caja");
  });

  it("un cobro que no es en efectivo, con sesión, se rechaza", async () => {
    const s = await seed();
    const error = await pgError(
      insertReceipt(getDb(), receiptOf(s, { sessionId: s.open })),
    );
    expect(error.code).toBe("P0001");
    expect(error.message).toContain("no va en una sesión de caja");
  });

  it("un cobro en efectivo en una sesión cerrada se rechaza", async () => {
    const s = await seed();
    const error = await pgError(
      insertReceipt(
        getDb(),
        receiptOf(s, { paymentMethodId: s.cashA, sessionId: s.closed }),
      ),
    );
    expect(error.code).toBe("P0001");
    expect(error.message).toContain("está cerrada");
  });

  it("los triggers de la 0043 valen igual para una seña (brief-21.4, D-1)", async () => {
    const s = await seed();
    const sena = (values: Partial<ReceiptValues>) =>
      receiptOf(s, {
        target: "order",
        saleId: null,
        orderId: s.orderA,
        ...values,
      });
    expect(
      (
        await pgError(
          insertReceipt(getDb(), sena({ paymentMethodId: s.cashA })),
        )
      ).message,
    ).toContain("necesita una sesión de caja");
    expect(
      (
        await pgError(
          insertReceipt(
            getDb(),
            sena({ paymentMethodId: s.cashA, sessionId: s.closed }),
          ),
        )
      ).message,
    ).toContain("está cerrada");
    await insertReceipt(
      getDb(),
      sena({ paymentMethodId: s.cashA, sessionId: s.open }),
    );
    expect(
      (await pgError(getDb().execute(sql`update receipts set amount = 1`)))
        .message,
    ).toContain("solo inserción: UPDATE");
  });

  it("en efectivo en la sesión abierta, y en transferencia sin sesión, se aceptan", async () => {
    const s = await seed();
    await insertReceipt(
      getDb(),
      receiptOf(s, { paymentMethodId: s.cashA, sessionId: s.open }),
    );
    await insertReceipt(getDb(), receiptOf(s, { number: 2 }));
  });
});

describe("las claves compuestas (AC-1)", () => {
  it.each([
    ["la venta", "receipts_sale_fk", (s: Seed) => ({ saleId: s.saleB })],
    [
      "el pedido",
      "receipts_order_fk",
      (s: Seed) => ({ target: "order", saleId: null, orderId: s.orderB }),
    ],
    [
      "el cliente",
      "receipts_client_fk",
      (s: Seed) => ({ clientId: s.clientB }),
    ],
    [
      "el medio",
      "receipts_payment_method_fk",
      (s: Seed) => ({ paymentMethodId: s.cashB, sessionId: s.openB }),
    ],
    [
      "la sesión",
      "receipts_session_fk",
      (s: Seed) => ({ paymentMethodId: s.cashA, sessionId: s.openB }),
    ],
  ])("rechazan %s de otra organización", async (_, constraint, values) => {
    const s = await seed();
    const error = await pgError(
      insertReceipt(getDb(), receiptOf(s, values(s))),
    );
    expect(error).toMatchObject({ code: "23503", constraint });
  });

  // orders_guard rechaza cualquier DELETE de un pedido antes de la clave: se apaga dentro de una
  // transacción que se deshace, para ver que la clave también lo impide (brief-21.4, AC-1).
  it("un pedido con señas no se borra, aun sin el trigger de orders", async () => {
    const s = await seed();
    await insertReceipt(
      getDb(),
      receiptOf(s, { target: "order", saleId: null, orderId: s.orderA }),
    );
    const error = await pgError(
      getDb().transaction(async (tx) => {
        await tx.execute(sql`alter table orders disable trigger orders_guard`);
        await tx.execute(sql`delete from orders where id = ${s.orderA}`);
      }),
    );
    expect(error).toMatchObject({
      code: "23001",
      constraint: "receipts_order_fk",
    });
  });

  it("un cliente con cobros no se borra; uno sin cobros sí", async () => {
    const s = await seed();
    // Un cliente sin ventas, para que lo único que lo retenga sea el cobro: la base no exige que el
    // cliente sea el de la venta, eso lo asegura el servicio (H-4).
    const withReceipt = await insertClient(s.orgA);
    await insertReceipt(
      getDb(),
      receiptOf(s, { saleId: s.counterSaleA, clientId: withReceipt }),
    );
    expect(
      await pgError(
        getDb().execute(sql`delete from clients where id = ${withReceipt}`),
      ),
    ).toMatchObject({ code: "23001", constraint: "receipts_client_fk" });
    const free = await insertClient(s.orgA);
    await getDb().execute(sql`delete from clients where id = ${free}`);
  });
});

describe("los CHECK (AC-1)", () => {
  it("el monto es positivo", async () => {
    const s = await seed();
    for (const amount of ["0", "-1"]) {
      expect(
        await pgError(insertReceipt(getDb(), receiptOf(s, { amount }))),
        amount,
      ).toMatchObject({
        code: "23514",
        constraint: "receipts_amount_positive",
      });
    }
  });

  it("la moneda tiene tres letras mayúsculas", async () => {
    const s = await seed();
    for (const currency of ["ars", "PESO", "AR"]) {
      expect(
        await pgError(insertReceipt(getDb(), receiptOf(s, { currency }))),
        currency,
      ).toMatchObject({
        code: "23514",
        constraint: "receipts_currency_format",
      });
    }
  });

  it("el número es positivo y único por organización", async () => {
    const s = await seed();
    expect(
      await pgError(insertReceipt(getDb(), receiptOf(s, { number: 0 }))),
    ).toMatchObject({ code: "23514", constraint: "receipts_number_positive" });
    await insertReceipt(getDb(), receiptOf(s));
    expect(await pgError(insertReceipt(getDb(), receiptOf(s)))).toMatchObject({
      code: "23505",
      constraint: "receipts_organization_number_unique",
    });
    // El mismo número en otra organización no choca.
    await insertReceipt(
      getDb(),
      receiptOf(s, {
        organizationId: s.orgB,
        saleId: s.saleB,
        clientId: s.clientB,
        paymentMethodId: s.cashB,
        sessionId: s.openB,
      }),
    );
  });

  it("la hora sale de clock_timestamp", async () => {
    const s = await seed();
    const times = await getDb().transaction(async (tx) => {
      await insertReceipt(tx, receiptOf(s));
      await tx.execute(sql`select pg_sleep(0.01)`);
      await insertReceipt(tx, receiptOf(s, { number: 2 }));
      const result = await tx.execute<{ created_at: Date }>(
        sql`select created_at from receipts order by number`,
      );
      return result.rows.map((row) => new Date(row.created_at).getTime());
    });
    expect(times[1]!).toBeGreaterThan(times[0]!);
  });
});

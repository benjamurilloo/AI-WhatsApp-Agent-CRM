import { sql, type SQL } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { getDb, type DbTransaction } from "@/shared/db";
import { resetDatabase } from "./reset-database";

// Esquema de la anulación de un cobro, la devolución y su anulación contra PostgreSQL real
// (brief-21.5, AC-1): privilegios, solo inserción, a lo sumo una anulación, la copia de la moneda, el
// monto y la sesión, el destino de la devolución, el efectivo y su sesión, la sesión cerrada, las
// claves compuestas y el cliente con devoluciones. Con SQL directo y con el rol dueño, que es el que
// no frenan los privilegios. Lo que decide el servicio lo prueban receipt-voids.test.ts y
// refunds.test.ts.

type Executor = { execute: (query: SQL) => Promise<unknown> };

async function returningId(executor: Executor, query: SQL): Promise<string> {
  const result = (await executor.execute(query)) as { rows: { id: string }[] };
  return result.rows[0]!.id;
}

const db = () => getDb();

const createOrganization = (name: string) =>
  returningId(
    db(),
    sql`insert into organizations (name) values (${name}) returning id`,
  );

const insertClient = (organizationId: string) =>
  returningId(
    db(),
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
    db(),
    sql`insert into sales (organization_id, number, client_id, currency, total, created_by)
        values (${organizationId}, ${number}, ${clientId}, 'ARS', '1000', ${userId})
        returning id`,
  );

const insertMethod = (organizationId: string, name: string, isCash: boolean) =>
  returningId(
    db(),
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
    db(),
    sql`insert into cash_sessions (organization_id, number, previous_session_id, opened_by)
        values (${organizationId}, ${number}, ${previousSessionId}, ${userId})
        returning id`,
  );

const closeSession = (
  organizationId: string,
  sessionId: string,
  userId: string,
) =>
  db().execute(
    sql`insert into cash_session_closings (organization_id, session_id, closed_by)
        values (${organizationId}, ${sessionId}, ${userId})`,
  );

const insertReceipt = (
  organizationId: string,
  number: number,
  saleId: string,
  clientId: string | null,
  paymentMethodId: string,
  sessionId: string | null,
  userId: string,
) =>
  returningId(
    db(),
    sql`insert into receipts (organization_id, number, target, sale_id, client_id,
                              payment_method_id, session_id, currency, amount, created_by)
        values (${organizationId}, ${number}, 'sale', ${saleId}, ${clientId}, ${paymentMethodId},
                ${sessionId}, 'ARS', '100', ${userId})
        returning id`,
  );

type RefundValues = {
  organizationId: string;
  number: number;
  target: string;
  clientId: string | null;
  saleId: string | null;
  paymentMethodId: string;
  sessionId: string | null;
  userId: string;
  currency?: string;
  amount?: string;
};

function insertRefund(executor: Executor, values: RefundValues) {
  return executor.execute(
    sql`insert into refunds (organization_id, number, target, client_id, sale_id,
                             payment_method_id, session_id, currency, amount, created_by)
        values (${values.organizationId}, ${values.number}, ${values.target},
                ${values.clientId}, ${values.saleId}, ${values.paymentMethodId},
                ${values.sessionId}, ${values.currency ?? "ARS"}, ${values.amount ?? "100"},
                ${values.userId})
        returning id`,
  );
}

type VoidValues = {
  organizationId: string;
  number: number;
  sourceId: string;
  sessionId: string | null;
  userId: string;
  currency?: string;
  amount?: string;
  reason?: string;
};

function insertReceiptVoid(executor: Executor, values: VoidValues) {
  return executor.execute(
    sql`insert into receipt_voids (organization_id, number, receipt_id, currency, amount, reason,
                                   session_id, created_by)
        values (${values.organizationId}, ${values.number}, ${values.sourceId},
                ${values.currency ?? "ARS"}, ${values.amount ?? "100"},
                ${values.reason ?? "wrong_amount"}, ${values.sessionId}, ${values.userId})
        returning id`,
  );
}

function insertRefundVoid(executor: Executor, values: VoidValues) {
  return executor.execute(
    sql`insert into refund_voids (organization_id, number, refund_id, currency, amount, reason,
                                  session_id, created_by)
        values (${values.organizationId}, ${values.number}, ${values.sourceId},
                ${values.currency ?? "ARS"}, ${values.amount ?? "100"},
                ${values.reason ?? "wrong_amount"}, ${values.sessionId}, ${values.userId})
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

// A con un cliente, una venta con cliente y otra sin, efectivo y transferencia, una sesión cerrada
// con un cobro y una devolución en efectivo, la siguiente abierta con lo mismo, y un cobro y una
// devolución por transferencia. B con su cliente, su venta, su efectivo y su sesión abierta.
async function seed() {
  const orgA = await createOrganization("Negocio A");
  const orgB = await createOrganization("Negocio B");
  const userId = await returningId(
    db(),
    sql`insert into users (email, password_hash, name)
        values ('ana@example.com', 'hash', 'Ana') returning id`,
  );
  const clientA = await insertClient(orgA);
  const clientB = await insertClient(orgB);
  const saleA = await insertSale(orgA, userId, 1, clientA);
  const counterSaleA = await insertSale(orgA, userId, 2, null);
  const saleB = await insertSale(orgB, userId, 1, clientB);
  const cashA = await insertMethod(orgA, "Efectivo", true);
  const transferA = await insertMethod(orgA, "Transferencia", false);
  const cashB = await insertMethod(orgB, "Efectivo", true);
  const closed = await insertSession(orgA, userId, 1);
  const cashReceiptClosed = await insertReceipt(
    orgA,
    1,
    saleA,
    clientA,
    cashA,
    closed,
    userId,
  );
  const cashRefundClosed = await returningId(
    db(),
    sql`insert into refunds (organization_id, number, target, client_id, payment_method_id,
                             session_id, currency, amount, created_by)
        values (${orgA}, 1, 'account', ${clientA}, ${cashA}, ${closed}, 'ARS', '100', ${userId})
        returning id`,
  );
  await closeSession(orgA, closed, userId);
  const open = await insertSession(orgA, userId, 2, closed);
  const cashReceiptOpen = await insertReceipt(
    orgA,
    2,
    saleA,
    clientA,
    cashA,
    open,
    userId,
  );
  const transferReceipt = await insertReceipt(
    orgA,
    3,
    saleA,
    clientA,
    transferA,
    null,
    userId,
  );
  const refundOf = (values: Partial<RefundValues>): RefundValues => ({
    organizationId: orgA,
    number: 50,
    target: "account",
    clientId: clientA,
    saleId: null,
    paymentMethodId: transferA,
    sessionId: null,
    userId,
    ...values,
  });
  const cashRefundOpen = await returningId(
    db(),
    sql`insert into refunds (organization_id, number, target, client_id, payment_method_id,
                             session_id, currency, amount, created_by)
        values (${orgA}, 2, 'account', ${clientA}, ${cashA}, ${open}, 'ARS', '100', ${userId})
        returning id`,
  );
  return {
    orgA,
    orgB,
    userId,
    clientA,
    clientB,
    saleA,
    counterSaleA,
    saleB,
    cashA,
    transferA,
    cashB,
    closed,
    open,
    openB: await insertSession(orgB, userId, 1),
    cashReceiptClosed,
    cashRefundClosed,
    cashReceiptOpen,
    transferReceipt,
    cashRefundOpen,
    refundOf,
  };
}

type Seed = Awaited<ReturnType<typeof seed>>;

beforeEach(async () => {
  await resetDatabase(getDb());
});

afterAll(async () => {
  await getDb().$client.end();
});

describe("los valores nuevos de los enums (AC-1; H-7)", () => {
  async function enumValues(name: string) {
    const result = await getDb().execute<{ value: string }>(
      sql`select e.enumlabel as value from pg_enum e
          join pg_type t on t.oid = e.enumtypid
          where t.typname = ${name} order by e.enumsortorder`,
    );
    return result.rows.map((row) => row.value);
  }

  it("suma los tres documentos, la devolución a la auditoría, el destino y los motivos", async () => {
    expect(await enumValues("document_kind")).toEqual(
      expect.arrayContaining(["receipt_void", "refund", "refund_void"]),
    );
    expect(await enumValues("audit_entity_type")).toContain("refund");
    expect(await enumValues("refund_target")).toEqual(["account", "sale"]);
    expect(await enumValues("receipt_void_reason")).toEqual([
      "not_received",
      "wrong_method",
      "wrong_amount",
      "wrong_target",
      "other",
    ]);
    expect(await enumValues("refund_void_reason")).toEqual([
      "not_paid",
      "wrong_method",
      "wrong_amount",
      "wrong_client",
      "other",
    ]);
  });
});

describe("privilegios y solo inserción (AC-1)", () => {
  it.each(["receipt_voids", "refunds", "refund_voids"])(
    "crm_app tiene SELECT e INSERT en %s, sin UPDATE ni DELETE",
    async (table) => {
      const result = await getDb().execute<{ privilege: string }>(
        sql`select privilege_type as privilege from information_schema.role_table_grants
            where grantee = 'crm_app' and table_name = ${table}
            order by privilege_type`,
      );
      expect(result.rows.map((row) => row.privilege)).toEqual([
        "INSERT",
        "SELECT",
      ]);
    },
  );

  it("crm_app inserta las tres, y no las actualiza ni las borra", async () => {
    const s = await seed();
    await asAppRole(async (tx) => {
      await insertReceiptVoid(tx, {
        organizationId: s.orgA,
        number: 1,
        sourceId: s.transferReceipt,
        sessionId: null,
        userId: s.userId,
      });
      const refundId = await returningId(
        tx,
        sql`insert into refunds (organization_id, number, target, client_id, payment_method_id,
                                 currency, amount, created_by)
            values (${s.orgA}, 9, 'account', ${s.clientA}, ${s.transferA}, 'ARS', '100', ${s.userId})
            returning id`,
      );
      await insertRefundVoid(tx, {
        organizationId: s.orgA,
        number: 1,
        sourceId: refundId,
        sessionId: null,
        userId: s.userId,
      });
    });
    for (const table of ["receipt_voids", "refunds", "refund_voids"]) {
      expect(
        (
          await pgError(
            asAppRole((tx) =>
              tx.execute(sql.raw(`update ${table} set amount = 1`)),
            ),
          )
        ).code,
        table,
      ).toBe("42501");
      expect(
        (
          await pgError(
            asAppRole((tx) => tx.execute(sql.raw(`delete from ${table}`))),
          )
        ).code,
        table,
      ).toBe("42501");
    }
  });

  it("el trigger rechaza UPDATE y DELETE en las tres, también al dueño", async () => {
    const s = await seed();
    await insertReceiptVoid(db(), {
      organizationId: s.orgA,
      number: 1,
      sourceId: s.transferReceipt,
      sessionId: null,
      userId: s.userId,
    });
    await insertRefundVoid(db(), {
      organizationId: s.orgA,
      number: 1,
      sourceId: s.cashRefundClosed,
      sessionId: null,
      userId: s.userId,
    });
    for (const table of ["receipt_voids", "refunds", "refund_voids"]) {
      const update = await pgError(
        db().execute(sql.raw(`update ${table} set amount = 1`)),
      );
      expect(update.code, table).toBe("P0001");
      expect(update.message).toContain("solo inserción: UPDATE");
      const remove = await pgError(
        db().execute(sql.raw(`delete from ${table}`)),
      );
      expect(remove.code, table).toBe("P0001");
      expect(remove.message).toContain("solo inserción: DELETE");
    }
  });
});

describe("a lo sumo una anulación (AC-1; ADR 0022, punto 7)", () => {
  it("un cobro y una devolución se anulan una sola vez", async () => {
    const s = await seed();
    const voidOf = (number: number) => ({
      organizationId: s.orgA,
      number,
      sourceId: s.transferReceipt,
      sessionId: null,
      userId: s.userId,
    });
    await insertReceiptVoid(db(), voidOf(1));
    expect(await pgError(insertReceiptVoid(db(), voidOf(2)))).toMatchObject({
      code: "23505",
      constraint: "receipt_voids_receipt_unique",
    });
    const refundVoidOf = (number: number) => ({
      organizationId: s.orgA,
      number,
      sourceId: s.cashRefundClosed,
      sessionId: null,
      userId: s.userId,
    });
    await insertRefundVoid(db(), refundVoidOf(1));
    expect(
      await pgError(insertRefundVoid(db(), refundVoidOf(2))),
    ).toMatchObject({
      code: "23505",
      constraint: "refund_voids_refund_unique",
    });
  });
});

describe("la copia de la moneda, el monto y la sesión (AC-1; D-1 y D-3)", () => {
  const cases: [
    string,
    "receipt" | "refund",
    (s: Seed) => Partial<VoidValues> & { sourceId: string },
    string,
  ][] = [
    [
      "un cobro anulado con otro monto",
      "receipt",
      (s) => ({ sourceId: s.transferReceipt, amount: "99" }),
      "no copia",
    ],
    [
      "un cobro anulado con otra moneda",
      "receipt",
      (s) => ({ sourceId: s.transferReceipt, currency: "USD" }),
      "no copia",
    ],
    [
      "un cobro por transferencia anulado en una sesión",
      "receipt",
      (s) => ({ sourceId: s.transferReceipt, sessionId: s.open }),
      "ninguna sesión abierta",
    ],
    [
      "un cobro en efectivo de la sesión abierta anulado sin sesión",
      "receipt",
      (s) => ({ sourceId: s.cashReceiptOpen, sessionId: null }),
      "sesión abierta de su cobro",
    ],
    [
      "un cobro en efectivo de una sesión cerrada anulado en la abierta",
      "receipt",
      (s) => ({ sourceId: s.cashReceiptClosed, sessionId: s.open }),
      "ninguna sesión abierta",
    ],
    [
      "una devolución anulada con otro monto",
      "refund",
      (s) => ({ sourceId: s.cashRefundClosed, amount: "1" }),
      "no copia",
    ],
    [
      "una devolución en efectivo de la sesión abierta anulada sin sesión",
      "refund",
      (s) => ({ sourceId: s.cashRefundOpen, sessionId: null }),
      "sesión abierta de su devolución",
    ],
    [
      "una devolución en efectivo de una sesión cerrada anulada en la abierta",
      "refund",
      (s) => ({ sourceId: s.cashRefundClosed, sessionId: s.open }),
      "ninguna sesión abierta",
    ],
  ];

  it.each(cases)("rechaza %s", async (_, kind, values, message) => {
    const s = await seed();
    const row = {
      organizationId: s.orgA,
      number: 1,
      sessionId: null,
      userId: s.userId,
      ...values(s),
    };
    const error = await pgError(
      kind === "receipt"
        ? insertReceiptVoid(db(), row)
        : insertRefundVoid(db(), row),
    );
    expect(error.code).toBe("P0001");
    expect(error.message).toContain(message);
  });

  it("acepta la sesión abierta del original, y ninguna si la suya está cerrada o no es efectivo", async () => {
    const s = await seed();
    const row = (
      sourceId: string,
      sessionId: string | null,
      number: number,
    ) => ({
      organizationId: s.orgA,
      number,
      sourceId,
      sessionId,
      userId: s.userId,
    });
    await insertReceiptVoid(db(), row(s.cashReceiptOpen, s.open, 1));
    await insertReceiptVoid(db(), row(s.cashReceiptClosed, null, 2));
    await insertReceiptVoid(db(), row(s.transferReceipt, null, 3));
    await insertRefundVoid(db(), row(s.cashRefundOpen, s.open, 1));
    await insertRefundVoid(db(), row(s.cashRefundClosed, null, 2));
  });

  it("una anulación no entra en una sesión que se cerró", async () => {
    const s = await seed();
    await closeSession(s.orgA, s.open, s.userId);
    // La copia ya no la acepta en la sesión, y cash_reject_closed_session() tampoco.
    const error = await pgError(
      insertReceiptVoid(db(), {
        organizationId: s.orgA,
        number: 1,
        sourceId: s.cashReceiptOpen,
        sessionId: s.open,
        userId: s.userId,
      }),
    );
    expect(error.code).toBe("P0001");
  });
});

describe("el destino de la devolución (AC-1; D-2)", () => {
  it.each([
    ["de cuenta sin cliente", { clientId: null }],
    ["de cuenta con venta", { saleId: "venta" }],
    ["de venta con cliente", { target: "sale", saleId: "venta" }],
    ["de venta sin venta", { target: "sale", clientId: null }],
  ] as const)("rechaza una devolución %s", async (_, values) => {
    const s = await seed();
    const resolved = {
      ...values,
      ...("saleId" in values ? { saleId: s.counterSaleA } : {}),
    };
    const error = await pgError(insertRefund(db(), s.refundOf(resolved)));
    expect(error).toMatchObject({
      code: "23514",
      constraint: "refunds_target_check",
    });
  });

  it("acepta una de cuenta con su cliente y una de una venta sin cliente", async () => {
    const s = await seed();
    await insertRefund(db(), s.refundOf({ number: 10 }));
    await insertRefund(
      db(),
      s.refundOf({
        number: 11,
        target: "sale",
        clientId: null,
        saleId: s.counterSaleA,
      }),
    );
  });

  it("el destino solo puede ser la cuenta o una venta", async () => {
    const s = await seed();
    expect(
      (await pgError(insertRefund(db(), s.refundOf({ target: "order" })))).code,
    ).toBe("22P02");
  });
});

describe("el efectivo y su sesión en la devolución (AC-1; H-6)", () => {
  it("en efectivo sin sesión se rechaza", async () => {
    const s = await seed();
    const error = await pgError(
      insertRefund(db(), s.refundOf({ paymentMethodId: s.cashA })),
    );
    expect(error.code).toBe("P0001");
    expect(error.message).toContain("necesita una sesión de caja");
  });

  it("si no es en efectivo, con sesión, se rechaza", async () => {
    const s = await seed();
    const error = await pgError(
      insertRefund(db(), s.refundOf({ sessionId: s.open })),
    );
    expect(error.code).toBe("P0001");
    expect(error.message).toContain("no va en una sesión de caja");
  });

  it("en una sesión cerrada se rechaza", async () => {
    const s = await seed();
    const error = await pgError(
      insertRefund(
        db(),
        s.refundOf({ paymentMethodId: s.cashA, sessionId: s.closed }),
      ),
    );
    expect(error.code).toBe("P0001");
    expect(error.message).toContain("está cerrada");
  });
});

describe("las claves compuestas (AC-1)", () => {
  it.each([
    ["el cliente", "refunds_client_fk", (s: Seed) => ({ clientId: s.clientB })],
    [
      "la venta",
      "refunds_sale_fk",
      (s: Seed) => ({ target: "sale", clientId: null, saleId: s.saleB }),
    ],
    [
      "el medio",
      "refunds_payment_method_fk",
      (s: Seed) => ({ paymentMethodId: s.cashB, sessionId: s.openB }),
    ],
    [
      "la sesión",
      "refunds_session_fk",
      (s: Seed) => ({ paymentMethodId: s.cashA, sessionId: s.openB }),
    ],
  ])(
    "la devolución rechaza %s de otra organización",
    async (_, constraint, values) => {
      const s = await seed();
      const error = await pgError(insertRefund(db(), s.refundOf(values(s))));
      expect(error).toMatchObject({ code: "23503", constraint });
    },
  );

  it("las anulaciones rechazan un original de otra organización", async () => {
    const s = await seed();
    const row = (sourceId: string) => ({
      organizationId: s.orgB,
      number: 1,
      sourceId,
      sessionId: null,
      userId: s.userId,
    });
    expect(
      await pgError(insertReceiptVoid(db(), row(s.transferReceipt))),
    ).toMatchObject({ code: "23503", constraint: "receipt_voids_receipt_fk" });
    expect(
      await pgError(insertRefundVoid(db(), row(s.cashRefundClosed))),
    ).toMatchObject({ code: "23503", constraint: "refund_voids_refund_fk" });
  });

  it("un cliente con devoluciones no se borra (D-10)", async () => {
    const s = await seed();
    const clientC = await insertClient(s.orgA);
    await insertRefund(db(), s.refundOf({ number: 10, clientId: clientC }));
    expect(
      await pgError(
        db().execute(sql`delete from clients where id = ${clientC}`),
      ),
    ).toMatchObject({ code: "23001", constraint: "refunds_client_fk" });
  });
});

describe("los CHECK (AC-1)", () => {
  it("el monto es positivo y la moneda tiene tres letras", async () => {
    const s = await seed();
    expect(
      (await pgError(insertRefund(db(), s.refundOf({ amount: "0" }))))
        .constraint,
    ).toBe("refunds_amount_positive");
    expect(
      (await pgError(insertRefund(db(), s.refundOf({ currency: "ars" }))))
        .constraint,
    ).toBe("refunds_currency_format");
  });

  it("el número es único por organización en cada serie", async () => {
    const s = await seed();
    await insertRefund(db(), s.refundOf({ number: 10 }));
    expect(
      await pgError(insertRefund(db(), s.refundOf({ number: 10 }))),
    ).toMatchObject({
      code: "23505",
      constraint: "refunds_organization_number_unique",
    });
  });
});

import { sql, type SQL } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { getDb, type DbTransaction } from "@/shared/db";
import { resetDatabase } from "./reset-database";

// El esquema de los pagos a proveedores contra PostgreSQL real (brief-22.6, AC-1): los privilegios,
// los CHECK, los únicos, las claves compuestas y los triggers de supplier_payments y
// supplier_payment_voids, probados con SQL directo y con el rol dueño, que es el que no frenan los
// privilegios.

async function insertRow(query: SQL) {
  const result = await getDb().execute<{ id: string }>(query);
  return result.rows[0]!.id;
}

type Executor = { execute: (query: SQL) => Promise<unknown> };

type PaymentValues = {
  organizationId: string;
  supplierId: string;
  paymentMethodId: string;
  createdBy: string;
  number?: number;
  target?: string;
  goodsReceiptId?: string | null;
  sessionId?: string | null;
  currency?: string;
  amount?: string;
};

function insertPayment(executor: Executor, values: PaymentValues) {
  const target = values.target ?? "account";
  return executor.execute(
    sql`insert into supplier_payments (organization_id, number, target, goods_receipt_id,
                                       supplier_id, payment_method_id, session_id, currency,
                                       amount, created_by)
        values (${values.organizationId}, ${values.number ?? 1}, ${target},
                ${values.goodsReceiptId ?? null}, ${values.supplierId}, ${values.paymentMethodId},
                ${values.sessionId ?? null}, ${values.currency ?? "ARS"},
                ${values.amount ?? "100.00"}, ${values.createdBy})
        returning id`,
  );
}

type VoidValues = {
  organizationId: string;
  supplierPaymentId: string;
  createdBy: string;
  number?: number;
  currency?: string;
  amount?: string;
  reason?: string;
  sessionId?: string | null;
};

function insertVoid(executor: Executor, values: VoidValues) {
  return executor.execute(
    sql`insert into supplier_payment_voids (organization_id, number, supplier_payment_id,
                                            currency, amount, reason, session_id, created_by)
        values (${values.organizationId}, ${values.number ?? 1}, ${values.supplierPaymentId},
                ${values.currency ?? "ARS"}, ${values.amount ?? "100.00"},
                ${values.reason ?? "other"}, ${values.sessionId ?? null}, ${values.createdBy})`,
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

// Dos organizaciones, cada una con un proveedor, una recepción en ARS, el efectivo y la
// transferencia, y una sesión de caja abierta.
async function seed() {
  const userId = await insertRow(
    sql`insert into users (email, password_hash, name)
        values ('ana@example.com', 'hash', 'Ana') returning id`,
  );
  const organization = async (name: string) => {
    const id = await insertRow(
      sql`insert into organizations (name) values (${name}) returning id`,
    );
    const supplierId = await insertRow(
      sql`insert into suppliers (organization_id, name)
          values (${id}, 'Norte') returning id`,
    );
    const receiptId = await insertRow(
      sql`insert into goods_receipts (organization_id, number, supplier_id, currency, total,
                                      created_by)
          values (${id}, 1, ${supplierId}, 'ARS', 100, ${userId}) returning id`,
    );
    const method = (methodName: string, isCash: boolean) =>
      insertRow(
        sql`insert into payment_methods (organization_id, name, is_cash)
            values (${id}, ${methodName}, ${isCash}) returning id`,
      );
    const sessionId = await insertRow(
      sql`insert into cash_sessions (organization_id, number, opened_by)
          values (${id}, 1, ${userId}) returning id`,
    );
    return {
      id,
      supplierId,
      receiptId,
      cash: await method("Efectivo", true),
      transfer: await method("Transferencia", false),
      sessionId,
    };
  };
  return {
    userId,
    a: await organization("Negocio A"),
    b: await organization("Negocio B"),
  };
}

type Seed = Awaited<ReturnType<typeof seed>>;

const paymentOf = (
  s: Seed,
  extra: Partial<PaymentValues> = {},
): PaymentValues => ({
  organizationId: s.a.id,
  supplierId: s.a.supplierId,
  paymentMethodId: s.a.transfer,
  createdBy: s.userId,
  ...extra,
});

async function payment(s: Seed, extra: Partial<PaymentValues> = {}) {
  const result = (await insertPayment(getDb(), paymentOf(s, extra))) as {
    rows: { id: string }[];
  };
  return result.rows[0]!.id;
}

async function closeSession(s: Seed) {
  await getDb().execute(
    sql`insert into cash_session_closings (organization_id, session_id, closed_by)
        values (${s.a.id}, ${s.a.sessionId}, ${s.userId})`,
  );
}

beforeEach(async () => {
  await resetDatabase(getDb());
});

afterAll(async () => {
  await getDb().$client.end();
});

describe("los privilegios y los tipos (AC-1; D-2 a D-4)", () => {
  it.each(["supplier_payments", "supplier_payment_voids"])(
    "crm_app tiene SELECT e INSERT en %s",
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

  it("crm_app inserta, y no actualiza ni borra: 42501", async () => {
    const s = await seed();
    const id = await asAppRole(async (tx) => {
      const result = (await insertPayment(tx, paymentOf(s))) as {
        rows: { id: string }[];
      };
      return result.rows[0]!.id;
    });
    await asAppRole((tx) =>
      insertVoid(tx, {
        organizationId: s.a.id,
        supplierPaymentId: id,
        createdBy: s.userId,
      }),
    );
    for (const statement of [
      sql`update supplier_payments set amount = 1`,
      sql`delete from supplier_payments`,
      sql`update supplier_payment_voids set reason = 'not_paid'`,
      sql`delete from supplier_payment_voids`,
    ]) {
      expect(
        (await pgError(asAppRole((tx) => tx.execute(statement)))).code,
      ).toBe("42501");
    }
  });

  it("los tipos nuevos y los motivos de D-4", async () => {
    const result = await getDb().execute<{
      kinds: boolean;
      entity: boolean;
      targets: string;
      reasons: string;
    }>(
      sql`select 'supplier_payment' = any(enum_range(null::document_kind)::text[])
                   and 'supplier_payment_void' = any(enum_range(null::document_kind)::text[])
                   as kinds,
                 'supplier_payment' = any(enum_range(null::audit_entity_type)::text[]) as entity,
                 array_to_string(enum_range(null::supplier_payment_target), ',') as targets,
                 array_to_string(enum_range(null::supplier_payment_void_reason), ',') as reasons`,
    );
    expect(result.rows[0]).toEqual({
      kinds: true,
      entity: true,
      targets: "goods_receipt,account",
      reasons: "not_paid,wrong_method,wrong_amount,wrong_target,other",
    });
  });
});

describe("los CHECK, los únicos y las claves (AC-1; D-2 y D-3)", () => {
  it.each([
    ["el número en cero", { number: 0 }, "supplier_payments_number_positive"],
    ["el monto en cero", { amount: "0" }, "supplier_payments_amount_positive"],
    [
      "la moneda en minúsculas",
      { currency: "ars" },
      "supplier_payments_currency_format",
    ],
    [
      "contra una recepción sin la recepción",
      { target: "goods_receipt", goodsReceiptId: null },
      "supplier_payments_target_check",
    ],
  ])("el pago rechaza %s: 23514", async (_name, extra, constraint) => {
    const s = await seed();
    expect(await pgError(payment(s, extra))).toMatchObject({
      code: "23514",
      constraint,
    });
  });

  it("a cuenta con una recepción: 23514", async () => {
    const s = await seed();
    expect(
      await pgError(payment(s, { goodsReceiptId: s.a.receiptId })),
    ).toMatchObject({
      code: "23514",
      constraint: "supplier_payments_target_check",
    });
  });

  it("contra una recepción con ella, y a cuenta sin ella, entran", async () => {
    const s = await seed();
    await payment(s, {
      target: "goods_receipt",
      goodsReceiptId: s.a.receiptId,
    });
    await payment(s, { number: 2 });
  });

  it("un destino fuera del tipo: 22P02", async () => {
    const s = await seed();
    expect((await pgError(payment(s, { target: "sale" }))).code).toBe("22P02");
  });

  it("el número es único por organización, y otra organización lo repite", async () => {
    const s = await seed();
    await payment(s);
    expect(await pgError(payment(s))).toMatchObject({
      code: "23505",
      constraint: "supplier_payments_organization_number_unique",
    });
    await insertPayment(getDb(), {
      organizationId: s.b.id,
      supplierId: s.b.supplierId,
      paymentMethodId: s.b.transfer,
      createdBy: s.userId,
    });
  });

  it.each([
    ["la recepción", { target: "goods_receipt" }, "goods_receipt"],
    ["el proveedor", {}, "supplier"],
    ["el medio", {}, "payment_method"],
  ])("%s de otra organización: 23503", async (_name, extra, which) => {
    const s = await seed();
    const values = paymentOf(s, extra as Partial<PaymentValues>);
    if (which === "goods_receipt") values.goodsReceiptId = s.b.receiptId;
    if (which === "supplier") values.supplierId = s.b.supplierId;
    if (which === "payment_method") values.paymentMethodId = s.b.transfer;
    expect(await pgError(insertPayment(getDb(), values))).toMatchObject({
      code: "23503",
      constraint: `supplier_payments_${which}_fk`,
    });
  });

  it("la sesión de otra organización: 23503", async () => {
    const s = await seed();
    const values = paymentOf(s, {
      paymentMethodId: s.a.cash,
      sessionId: s.b.sessionId,
    });
    expect(await pgError(insertPayment(getDb(), values))).toMatchObject({
      code: "23503",
      constraint: "supplier_payments_session_fk",
    });
  });

  it("la sesión de una anulación, de otra organización: 23503", async () => {
    const s = await seed();
    const id = await payment(s, {
      paymentMethodId: s.a.cash,
      sessionId: s.a.sessionId,
    });
    // La copia rechaza antes una sesión distinta de la del pago: se la apaga dentro de una
    // transacción que se revierte, para que la que frene sea la clave compuesta.
    const error = await pgError(
      getDb().transaction(async (tx) => {
        await tx.execute(
          sql`alter table supplier_payment_voids
              disable trigger supplier_payment_voids_copy_payment`,
        );
        await insertVoid(tx, {
          organizationId: s.a.id,
          supplierPaymentId: id,
          createdBy: s.userId,
          sessionId: s.b.sessionId,
        });
      }),
    );
    expect(error).toMatchObject({
      code: "23503",
      constraint: "supplier_payment_voids_session_fk",
    });
  });

  it("un proveedor con pagos no se borra: 23001, ON DELETE RESTRICT", async () => {
    const s = await seed();
    // Un proveedor sin recepciones, para que la clave que lo frene sea la del pago.
    const other = await insertRow(
      sql`insert into suppliers (organization_id, name)
          values (${s.a.id}, 'Sur') returning id`,
    );
    await payment(s, { number: 2, supplierId: other });
    expect(
      await pgError(
        getDb().execute(sql`delete from suppliers where id = ${other}`),
      ),
    ).toMatchObject({
      code: "23001",
      constraint: "supplier_payments_supplier_fk",
    });
  });

  it("la anulación: CHECK, motivo, único por pago y clave compuesta", async () => {
    const s = await seed();
    const id = await payment(s);
    const base = {
      organizationId: s.a.id,
      supplierPaymentId: crypto.randomUUID(),
      createdBy: s.userId,
    };
    // Con un pago que no existe, el trigger no mira, y el CHECK va antes que la clave foránea.
    expect(
      await pgError(insertVoid(getDb(), { ...base, number: 0 })),
    ).toMatchObject({
      code: "23514",
      constraint: "supplier_payment_voids_number_positive",
    });
    expect(
      await pgError(insertVoid(getDb(), { ...base, amount: "0" })),
    ).toMatchObject({
      code: "23514",
      constraint: "supplier_payment_voids_amount_positive",
    });
    expect(
      await pgError(insertVoid(getDb(), { ...base, currency: "ars" })),
    ).toMatchObject({
      code: "23514",
      constraint: "supplier_payment_voids_currency_format",
    });
    expect(
      (await pgError(insertVoid(getDb(), { ...base, reason: "x" }))).code,
    ).toBe("22P02");
    expect(await pgError(insertVoid(getDb(), base))).toMatchObject({
      code: "23503",
      constraint: "supplier_payment_voids_supplier_payment_fk",
    });
    await insertVoid(getDb(), { ...base, supplierPaymentId: id });
    expect(
      await pgError(
        insertVoid(getDb(), { ...base, supplierPaymentId: id, number: 2 }),
      ),
    ).toMatchObject({
      code: "23505",
      constraint: "supplier_payment_voids_supplier_payment_unique",
    });
    // Un pago de otra organización.
    const idB = (
      (await insertPayment(getDb(), {
        organizationId: s.b.id,
        supplierId: s.b.supplierId,
        paymentMethodId: s.b.transfer,
        createdBy: s.userId,
      })) as { rows: { id: string }[] }
    ).rows[0]!.id;
    expect(
      await pgError(
        insertVoid(getDb(), { ...base, supplierPaymentId: idB, number: 3 }),
      ),
    ).toMatchObject({
      code: "23503",
      constraint: "supplier_payment_voids_supplier_payment_fk",
    });
  });
});

describe("los triggers (AC-1; D-2 y D-3)", () => {
  it("rechazan UPDATE y DELETE también para el dueño", async () => {
    const s = await seed();
    const id = await payment(s);
    await insertVoid(getDb(), {
      organizationId: s.a.id,
      supplierPaymentId: id,
      createdBy: s.userId,
    });
    for (const statement of [
      sql`update supplier_payments set amount = 1`,
      sql`delete from supplier_payments`,
      sql`update supplier_payment_voids set reason = 'not_paid'`,
      sql`delete from supplier_payment_voids`,
    ]) {
      expect((await pgError(getDb().execute(statement))).code).toBe("P0001");
    }
  });

  it("el efectivo va con su sesión, y la transferencia sin ella", async () => {
    const s = await seed();
    expect(
      (await pgError(payment(s, { paymentMethodId: s.a.cash }))).message,
    ).toContain("necesita una sesión de caja");
    expect(
      (await pgError(payment(s, { sessionId: s.a.sessionId }))).message,
    ).toContain("no va en una sesión de caja");
    await payment(s, { paymentMethodId: s.a.cash, sessionId: s.a.sessionId });
  });

  it("nada entra en una sesión cerrada", async () => {
    const s = await seed();
    await closeSession(s);
    expect(
      (
        await pgError(
          payment(s, { paymentMethodId: s.a.cash, sessionId: s.a.sessionId }),
        )
      ).code,
    ).toBe("P0001");
  });

  it("la anulación copia la moneda, el monto y la sesión abierta de su pago", async () => {
    const s = await seed();
    const cashId = await payment(s, {
      paymentMethodId: s.a.cash,
      sessionId: s.a.sessionId,
    });
    const transferId = await payment(s, { number: 2 });
    const base = { organizationId: s.a.id, createdBy: s.userId };
    for (const [extra, message] of [
      [
        {
          supplierPaymentId: cashId,
          sessionId: s.a.sessionId,
          amount: "99.00",
        },
        "no copia",
      ],
      [
        {
          supplierPaymentId: cashId,
          sessionId: s.a.sessionId,
          currency: "USD",
        },
        "no copia",
      ],
      [
        { supplierPaymentId: cashId, sessionId: null },
        "impacta en la sesión abierta",
      ],
      [
        { supplierPaymentId: transferId, sessionId: s.a.sessionId },
        "no impacta en ninguna",
      ],
    ] as const) {
      expect(
        (await pgError(insertVoid(getDb(), { ...base, ...extra }))).message,
      ).toContain(message);
    }
    await insertVoid(getDb(), {
      ...base,
      supplierPaymentId: cashId,
      sessionId: s.a.sessionId,
    });
    await insertVoid(getDb(), {
      ...base,
      number: 2,
      supplierPaymentId: transferId,
    });
  });

  it("con la sesión del pago cerrada, la anulación no impacta en ninguna", async () => {
    const s = await seed();
    const cashId = await payment(s, {
      paymentMethodId: s.a.cash,
      sessionId: s.a.sessionId,
    });
    await closeSession(s);
    const base = {
      organizationId: s.a.id,
      supplierPaymentId: cashId,
      createdBy: s.userId,
    };
    expect(
      (
        await pgError(
          insertVoid(getDb(), { ...base, sessionId: s.a.sessionId }),
        )
      ).code,
    ).toBe("P0001");
    await insertVoid(getDb(), base);
  });
});

import { sql, type SQL } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { getDb, type DbTransaction } from "@/shared/db";
import { resetDatabase } from "./reset-database";

// El esquema de la anulación de la recepción contra PostgreSQL real (brief-22.5, AC-1): los
// privilegios, los CHECK, los únicos, la clave compuesta y el trigger goods_receipt_voids_guard,
// probados con SQL directo y con el rol dueño, que es el que no frenan los privilegios.

async function insertRow(query: SQL) {
  const result = await getDb().execute<{ id: string }>(query);
  return result.rows[0]!.id;
}

type Executor = { execute: (query: SQL) => Promise<unknown> };

type VoidValues = {
  organizationId: string;
  goodsReceiptId: string;
  createdBy: string;
  number?: number;
  currency?: string;
  total?: string;
  reason?: string;
};

function insertVoidRow(executor: Executor, values: VoidValues) {
  return executor.execute(
    sql`insert into goods_receipt_voids (organization_id, number, goods_receipt_id, currency,
                                         total, reason, created_by)
        values (${values.organizationId}, ${values.number ?? 1}, ${values.goodsReceiptId},
                ${values.currency ?? "ARS"}, ${values.total ?? "100.00"},
                ${values.reason ?? "data_entry_error"}, ${values.createdBy})`,
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

// Dos organizaciones, cada una con un proveedor y dos recepciones en ARS de total 100: la 1 y la 2.
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
    const receipt = (number: number) =>
      insertRow(
        sql`insert into goods_receipts (organization_id, number, supplier_id, currency, total,
                                        created_by)
            values (${id}, ${number}, ${supplierId}, 'ARS', 100, ${userId}) returning id`,
      );
    return { id, receipt1: await receipt(1), receipt2: await receipt(2) };
  };
  return {
    userId,
    a: await organization("Negocio A"),
    b: await organization("Negocio B"),
  };
}

type Seed = Awaited<ReturnType<typeof seed>>;

const voidOf = (s: Seed, extra: Partial<VoidValues> = {}): VoidValues => ({
  organizationId: s.a.id,
  goodsReceiptId: s.a.receipt1,
  createdBy: s.userId,
  ...extra,
});

beforeEach(async () => {
  await resetDatabase(getDb());
});

afterAll(async () => {
  await getDb().$client.end();
});

describe("los privilegios y los tipos (AC-1; D-1 y D-2)", () => {
  it("crm_app tiene SELECT e INSERT", async () => {
    const result = await getDb().execute<{ privilege: string }>(
      sql`select privilege_type as privilege from information_schema.role_table_grants
          where grantee = 'crm_app' and table_name = 'goods_receipt_voids'
          order by privilege_type`,
    );
    expect(result.rows.map((row) => row.privilege)).toEqual([
      "INSERT",
      "SELECT",
    ]);
  });

  it("crm_app inserta, y no actualiza ni borra: 42501", async () => {
    const s = await seed();
    await asAppRole((tx) => insertVoidRow(tx, voidOf(s)));
    for (const statement of [
      sql`update goods_receipt_voids set reason = 'other'`,
      sql`delete from goods_receipt_voids`,
    ]) {
      expect(
        (await pgError(asAppRole((tx) => tx.execute(statement)))).code,
      ).toBe("42501");
    }
  });

  it("goods_receipt_void es un valor de document_kind y de inventory_movement_type, y el motivo es la lista de D-2", async () => {
    const result = await getDb().execute<{
      kind: boolean;
      movement: boolean;
      reasons: string;
    }>(
      sql`select 'goods_receipt_void' = any(enum_range(null::document_kind)::text[]) as kind,
                 'goods_receipt_void' = any(enum_range(null::inventory_movement_type)::text[])
                   as movement,
                 array_to_string(enum_range(null::goods_receipt_void_reason), ',') as reasons`,
    );
    expect(result.rows[0]).toEqual({
      kind: true,
      movement: true,
      reasons: "data_entry_error,duplicate,returned_to_supplier,other",
    });
  });
});

describe("los CHECK y los únicos (AC-1; D-1)", () => {
  it.each([
    ["el número en cero", { number: 0 }, "goods_receipt_voids_number_positive"],
    ["el total en cero", { total: "0" }, "goods_receipt_voids_total_positive"],
    [
      "la moneda en minúsculas",
      { currency: "ars" },
      "goods_receipt_voids_currency_format",
    ],
  ])("rechaza %s: 23514", async (_name, extra, constraint) => {
    const s = await seed();
    // Con una recepción que existe, el trigger ataja antes una moneda o un total que no son los
    // suyos. Con una que no existe no mira, y el CHECK va antes que la clave foránea.
    const error = await pgError(
      insertVoidRow(
        getDb(),
        voidOf(s, { goodsReceiptId: crypto.randomUUID(), ...extra }),
      ),
    );
    expect(error).toMatchObject({ code: "23514", constraint });
  });

  it("un motivo fuera de la lista: 22P02", async () => {
    const s = await seed();
    expect(
      (await pgError(insertVoidRow(getDb(), voidOf(s, { reason: "x" })))).code,
    ).toBe("22P02");
  });

  it("el número es único por organización, y otra organización lo repite", async () => {
    const s = await seed();
    await insertVoidRow(getDb(), voidOf(s));
    expect(
      await pgError(
        insertVoidRow(getDb(), voidOf(s, { goodsReceiptId: s.a.receipt2 })),
      ),
    ).toMatchObject({
      code: "23505",
      constraint: "goods_receipt_voids_organization_number_unique",
    });
    await insertVoidRow(getDb(), {
      organizationId: s.b.id,
      goodsReceiptId: s.b.receipt1,
      createdBy: s.userId,
    });
  });

  it("una recepción se anula a lo sumo una vez: 23505", async () => {
    const s = await seed();
    await insertVoidRow(getDb(), voidOf(s));
    expect(
      await pgError(insertVoidRow(getDb(), voidOf(s, { number: 2 }))),
    ).toMatchObject({
      code: "23505",
      constraint: "goods_receipt_voids_goods_receipt_unique",
    });
  });

  it("la recepción de otra organización o inexistente: 23503", async () => {
    const s = await seed();
    for (const goodsReceiptId of [s.b.receipt1, crypto.randomUUID()]) {
      expect(
        await pgError(insertVoidRow(getDb(), voidOf(s, { goodsReceiptId }))),
      ).toMatchObject({
        code: "23503",
        constraint: "goods_receipt_voids_receipt_fk",
      });
    }
  });
});

describe("el trigger goods_receipt_voids_guard (AC-1; D-1)", () => {
  it("rechaza UPDATE y DELETE para cualquier rol: P0001", async () => {
    const s = await seed();
    await insertVoidRow(getDb(), voidOf(s));
    for (const statement of [
      sql`update goods_receipt_voids set reason = 'other'`,
      sql`delete from goods_receipt_voids`,
    ]) {
      const error = await pgError(getDb().execute(statement));
      expect(error.code).toBe("P0001");
      expect(error.message).toMatch(/goods_receipt_voids es de solo inserción/);
    }
  });

  it("exige la moneda y el total de su recepción: P0001", async () => {
    const s = await seed();
    for (const extra of [{ currency: "USD" }, { total: "99.99" }]) {
      const error = await pgError(insertVoidRow(getDb(), voidOf(s, extra)));
      expect(error.code).toBe("P0001");
      expect(error.message).toMatch(
        /no copia la moneda y el total de su recepción/,
      );
    }
    await insertVoidRow(getDb(), voidOf(s));
  });

  it("la recepción anulada no se borra: la frena su propio trigger", async () => {
    const s = await seed();
    await insertVoidRow(getDb(), voidOf(s));
    const error = await pgError(
      getDb().execute(
        sql`delete from goods_receipts where id = ${s.a.receipt1}`,
      ),
    );
    expect(error.code).toBe("P0001");
    expect(error.message).toMatch(/goods_receipts es de solo inserción/);
  });
});

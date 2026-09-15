import { randomUUID } from "node:crypto";
import { sql, type SQL } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { getDb, type Db, type DbTransaction } from "@/shared/db";
import { resetDatabase } from "./reset-database";

// Esquema de catálogo e inventario de la 4.1 contra PostgreSQL real, con SQL directo.
// Cada invariante se prueba intentando violarlo y comprobando el SQLSTATE.

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

function run(query: SQL) {
  return getDb().execute(query);
}

async function codeOf(query: SQL) {
  return (await pgError(run(query))).code;
}

// Ejecuta como crm_app, el rol restringido que la aplicación usará al conectarse con él (ADR 0013).
function asAppRole<T>(fn: (tx: DbTransaction) => Promise<T>): Promise<T> {
  return getDb().transaction(async (tx) => {
    await tx.execute(sql`set local role crm_app`);
    return fn(tx);
  });
}

type Seed = { orgA: string; orgB: string; userId: string };

async function seed(): Promise<Seed> {
  const organizations = await getDb().execute<{ id: string }>(
    sql`insert into organizations (name) values ('Negocio A'), ('Negocio B') returning id`,
  );
  const user = await getDb().execute<{ id: string }>(
    sql`insert into users (email, password_hash, name)
        values ('ana@example.com', 'hash-sintetico', 'Ana') returning id`,
  );
  return {
    orgA: organizations.rows[0]!.id,
    orgB: organizations.rows[1]!.id,
    userId: user.rows[0]!.id,
  };
}

async function createProduct(
  executor: Db | DbTransaction,
  organizationId: string,
  sku = "CAF-250",
) {
  const result = await executor.execute<{ id: string }>(
    sql`insert into products (organization_id, sku, name)
        values (${organizationId}, ${sku}, 'Café 250 g') returning id`,
  );
  return result.rows[0]!.id;
}

function insertInventory(
  executor: Db | DbTransaction,
  organizationId: string,
  productId: string,
  quantity = "5",
) {
  return executor.execute<{ id: string }>(
    sql`insert into inventories (organization_id, product_id, quantity_on_hand)
        values (${organizationId}, ${productId}, ${quantity}) returning id`,
  );
}

type Movement = {
  organizationId: string;
  productId: string;
  createdBy: string;
  type?: string;
  quantity?: string;
  balanceAfter?: string;
  reason?: string;
};

function movementQuery(m: Movement) {
  return sql`insert into inventory_movements
      (organization_id, product_id, type, quantity, balance_after, reason, created_by)
      values (${m.organizationId}, ${m.productId}, ${m.type ?? "adjustment_positive"},
        ${m.quantity ?? "5"}, ${m.balanceAfter ?? "5"}, ${m.reason ?? "Conteo inicial"}, ${m.createdBy})
      returning id`;
}

async function insertMovement(executor: Db | DbTransaction, m: Movement) {
  const result = await executor.execute<{ id: string }>(movementQuery(m));
  return result.rows[0]!.id;
}

// Un producto de la organización A con su usuario, listo para movimientos.
async function seedProduct() {
  const s = await seed();
  const productId = await createProduct(getDb(), s.orgA);
  const movement: Movement = {
    organizationId: s.orgA,
    productId,
    createdBy: s.userId,
  };
  return { ...s, productId, movement };
}

async function movementCount() {
  const result = await getDb().execute<{ count: number }>(
    sql`select count(*)::int as count from inventory_movements`,
  );
  return result.rows[0]!.count;
}

beforeEach(async () => {
  await resetDatabase(getDb());
});

afterAll(async () => {
  await getDb().$client.end();
});

describe("products", () => {
  it("aplica los defaults", async () => {
    const s = await seed();
    const result = await getDb().execute<{
      id: string;
      unit: string;
      reorder_point: string;
      is_active: boolean;
      description: string | null;
      timestamps_now: boolean;
    }>(
      sql`insert into products (organization_id, sku, name)
          values (${s.orgA}, 'CAF-250', 'Café 250 g')
          returning id, unit, reorder_point, is_active, description,
            (created_at = now() and updated_at = now()) as timestamps_now`,
    );
    expect(result.rows[0]).toEqual({
      id: expect.stringMatching(uuidPattern),
      unit: "unidad",
      reorder_point: "0.000",
      is_active: true,
      description: null,
      timestamps_now: true,
    });
  });

  it("rechaza columnas obligatorias en NULL", async () => {
    const s = await seed();
    for (const query of [
      sql`insert into products (organization_id, sku, name) values (null, 'A', 'A')`,
      sql`insert into products (organization_id, sku, name) values (${s.orgA}, null, 'A')`,
      sql`insert into products (organization_id, sku, name) values (${s.orgA}, 'A', null)`,
      sql`insert into products (organization_id, sku, name, unit) values (${s.orgA}, 'A', 'A', null)`,
      sql`insert into products (organization_id, sku, name, reorder_point) values (${s.orgA}, 'A', 'A', null)`,
      sql`insert into products (organization_id, sku, name, is_active) values (${s.orgA}, 'A', 'A', null)`,
    ]) {
      expect(await codeOf(query)).toBe("23502");
    }
  });

  it("rechaza un SKU repetido en la organización, también con otras mayúsculas (D-6)", async () => {
    const s = await seed();
    await createProduct(getDb(), s.orgA, "CAF-250");
    expect(
      (await pgError(createProduct(getDb(), s.orgA, "CAF-250"))).code,
    ).toBe("23505");
    expect(
      (await pgError(createProduct(getDb(), s.orgA, "caf-250"))).code,
    ).toBe("23505");
  });

  it("acepta el mismo SKU en otra organización y guarda el SKU como se escribió", async () => {
    const s = await seed();
    await createProduct(getDb(), s.orgA, "CAF-250");
    await createProduct(getDb(), s.orgB, "caf-250");
    const result = await getDb().execute<{ sku: string }>(
      sql`select sku from products`,
    );
    // Se ordena en JavaScript: el orden de la base depende del collation.
    expect(result.rows.map((row) => row.sku).sort()).toEqual([
      "CAF-250",
      "caf-250",
    ]);
  });

  it("rechaza un punto de reposición negativo (D-5)", async () => {
    const s = await seed();
    expect(
      await codeOf(
        sql`insert into products (organization_id, sku, name, reorder_point)
            values (${s.orgA}, 'A', 'A', -0.001)`,
      ),
    ).toBe("23514");
  });

  it("redondea a tres decimales y rechaza cantidades fuera de numeric(14, 3) (D-4)", async () => {
    const s = await seed();
    const result = await getDb().execute<{ reorder_point: string }>(
      sql`insert into products (organization_id, sku, name, reorder_point)
          values (${s.orgA}, 'A', 'A', 1.23456) returning reorder_point`,
    );
    expect(result.rows[0]?.reorder_point).toBe("1.235");
    expect(
      await codeOf(
        sql`insert into products (organization_id, sku, name, reorder_point)
            values (${s.orgA}, 'B', 'B', 100000000000)`,
      ),
    ).toBe("22003");
  });

  it("rechaza una organización inexistente y no deja borrar la de un producto", async () => {
    const s = await seed();
    expect((await pgError(createProduct(getDb(), randomUUID()))).code).toBe(
      "23503",
    );
    await createProduct(getDb(), s.orgA);
    expect(
      await codeOf(sql`delete from organizations where id = ${s.orgA}`),
    ).toBe("23001");
  });
});

describe("inventories", () => {
  it("aplica los defaults", async () => {
    const { orgA, productId } = await seedProduct();
    const result = await getDb().execute<{
      id: string;
      quantity_on_hand: string;
      updated_now: boolean;
    }>(
      sql`insert into inventories (organization_id, product_id)
          values (${orgA}, ${productId})
          returning id, quantity_on_hand, updated_at = now() as updated_now`,
    );
    expect(result.rows[0]).toEqual({
      id: expect.stringMatching(uuidPattern),
      quantity_on_hand: "0.000",
      updated_now: true,
    });
  });

  it("rechaza columnas obligatorias en NULL", async () => {
    const { orgA, productId } = await seedProduct();
    for (const query of [
      sql`insert into inventories (organization_id, product_id) values (null, ${productId})`,
      sql`insert into inventories (organization_id, product_id) values (${orgA}, null)`,
      sql`insert into inventories (organization_id, product_id, quantity_on_hand) values (${orgA}, ${productId}, null)`,
    ]) {
      expect(await codeOf(query)).toBe("23502");
    }
  });

  it("rechaza una segunda fila para el mismo producto", async () => {
    const { orgA, productId } = await seedProduct();
    await insertInventory(getDb(), orgA, productId);
    expect(
      (await pgError(insertInventory(getDb(), orgA, productId))).code,
    ).toBe("23505");
  });

  it("rechaza un saldo negativo al insertar y al actualizar (ADR 0008)", async () => {
    const { orgA, productId } = await seedProduct();
    expect(
      (await pgError(insertInventory(getDb(), orgA, productId, "-1"))).code,
    ).toBe("23514");
    await insertInventory(getDb(), orgA, productId, "2");
    expect(
      await codeOf(
        sql`update inventories set quantity_on_hand = quantity_on_hand - 2.001
            where product_id = ${productId}`,
      ),
    ).toBe("23514");
  });

  it("rechaza el producto de otra organización (D-3)", async () => {
    const { orgB, productId } = await seedProduct();
    expect(
      (await pgError(insertInventory(getDb(), orgB, productId))).code,
    ).toBe("23503");
  });

  it("rechaza un producto inexistente y no deja borrar el producto de un saldo", async () => {
    const { orgA, productId } = await seedProduct();
    expect(
      (await pgError(insertInventory(getDb(), orgA, randomUUID()))).code,
    ).toBe("23503");
    await insertInventory(getDb(), orgA, productId);
    expect(
      await codeOf(sql`delete from products where id = ${productId}`),
    ).toBe("23001");
  });
});

describe("inventory_movements: esquema", () => {
  it("aplica los defaults", async () => {
    const { movement } = await seedProduct();
    const result = await getDb().execute<{
      id: string;
      quantity: string;
      created_now: boolean;
    }>(
      sql`insert into inventory_movements
            (organization_id, product_id, type, quantity, balance_after, reason, created_by)
          values (${movement.organizationId}, ${movement.productId}, 'adjustment_negative', 1.5, 3.5,
            'Rotura', ${movement.createdBy})
          returning id, quantity, created_at = now() as created_now`,
    );
    expect(result.rows[0]).toEqual({
      id: expect.stringMatching(uuidPattern),
      quantity: "1.500",
      created_now: true,
    });
  });

  it("rechaza columnas obligatorias en NULL", async () => {
    const { movement } = await seedProduct();
    const overrides: Array<Partial<Record<keyof Movement, null>>> = [
      { organizationId: null },
      { productId: null },
      { createdBy: null },
      { type: null },
      { quantity: null },
      { balanceAfter: null },
      { reason: null },
    ];
    for (const override of overrides) {
      const values = { ...movement, ...override } as Record<
        keyof Movement,
        string | null
      >;
      expect(
        await codeOf(
          sql`insert into inventory_movements
                (organization_id, product_id, type, quantity, balance_after, reason, created_by)
              values (${values.organizationId}, ${values.productId},
                ${values.type === undefined ? "adjustment_positive" : values.type},
                ${values.quantity === undefined ? "1" : values.quantity},
                ${values.balanceAfter === undefined ? "1" : values.balanceAfter},
                ${values.reason === undefined ? "Conteo" : values.reason},
                ${values.createdBy})`,
        ),
      ).toBe("23502");
    }
  });

  it("rechaza una cantidad cero o negativa y un saldo posterior negativo", async () => {
    const { movement } = await seedProduct();
    for (const override of [
      { quantity: "0" },
      { quantity: "-1" },
      { balanceAfter: "-0.001" },
    ]) {
      expect(await codeOf(movementQuery({ ...movement, ...override }))).toBe(
        "23514",
      );
    }
  });

  it("rechaza un motivo vacío o solo con espacios (D-5)", async () => {
    const { movement } = await seedProduct();
    for (const reason of ["", "   "]) {
      expect(await codeOf(movementQuery({ ...movement, reason }))).toBe(
        "23514",
      );
    }
    expect(await movementCount()).toBe(0);
  });

  it("rechaza un tipo fuera del enum", async () => {
    const { movement } = await seedProduct();
    expect(await codeOf(movementQuery({ ...movement, type: "inbound" }))).toBe(
      "22P02",
    );
  });

  it("rechaza el producto de otra organización (D-3)", async () => {
    const { orgB, movement } = await seedProduct();
    expect(
      await codeOf(movementQuery({ ...movement, organizationId: orgB })),
    ).toBe("23503");
  });

  it("rechaza producto, organización o usuario inexistentes", async () => {
    const { movement } = await seedProduct();
    for (const override of [
      { productId: randomUUID() },
      { organizationId: randomUUID() },
      { createdBy: randomUUID() },
    ]) {
      expect(await codeOf(movementQuery({ ...movement, ...override }))).toBe(
        "23503",
      );
    }
  });

  // ON DELETE RESTRICT informa 23001 (restrict_violation); 23503 es el de NO ACTION.
  it("no deja borrar la organización, el producto ni el usuario de un movimiento", async () => {
    const { orgA, productId, userId, movement } = await seedProduct();
    await insertMovement(getDb(), movement);
    expect(
      await codeOf(sql`delete from organizations where id = ${orgA}`),
    ).toBe("23001");
    expect(
      await codeOf(sql`delete from products where id = ${productId}`),
    ).toBe("23001");
    expect(await codeOf(sql`delete from users where id = ${userId}`)).toBe(
      "23001",
    );
    expect(await movementCount()).toBe(1);
  });
});

describe("inventory_movements: solo inserción por permisos (crm_app)", () => {
  it("crm_app inserta y lee", async () => {
    const { movement } = await seedProduct();
    await asAppRole((tx) => insertMovement(tx, movement));
    const count = await asAppRole(async (tx) => {
      const result = await tx.execute<{ count: number }>(
        sql`select count(*)::int as count from inventory_movements`,
      );
      return result.rows[0]!.count;
    });
    expect(count).toBe(1);
  });

  it("crm_app no puede actualizar ni borrar: 42501", async () => {
    const { movement } = await seedProduct();
    const id = await insertMovement(getDb(), movement);
    expect(
      (
        await pgError(
          asAppRole((tx) =>
            tx.execute(
              sql`update inventory_movements set reason = 'Otro' where id = ${id}`,
            ),
          ),
        )
      ).code,
    ).toBe("42501");
    expect(
      (
        await pgError(
          asAppRole((tx) =>
            tx.execute(sql`delete from inventory_movements where id = ${id}`),
          ),
        )
      ).code,
    ).toBe("42501");
    expect(await movementCount()).toBe(1);
  });
});

describe("inventory_movements: solo inserción por trigger (rol dueño)", () => {
  it("el dueño no puede actualizar ni borrar y la fila no cambia", async () => {
    const { movement } = await seedProduct();
    const id = await insertMovement(getDb(), movement);

    const update = await pgError(
      run(sql`update inventory_movements set reason = 'Otro' where id = ${id}`),
    );
    expect(update.code).toBe("P0001");
    expect(update.message).toContain("solo inserción: UPDATE");

    const remove = await pgError(
      run(sql`delete from inventory_movements where id = ${id}`),
    );
    expect(remove.code).toBe("P0001");
    expect(remove.message).toContain("solo inserción: DELETE");

    const row = await getDb().execute<{ reason: string; quantity: string }>(
      sql`select reason, quantity from inventory_movements where id = ${id}`,
    );
    expect(row.rows).toEqual([{ reason: "Conteo inicial", quantity: "5.000" }]);
  });
});

describe("products e inventories: escritura completa para crm_app", () => {
  it("crm_app lee, inserta, actualiza y borra productos y saldos", async () => {
    const s = await seed();
    await asAppRole(async (tx) => {
      const productId = await createProduct(tx, s.orgA);
      await insertInventory(tx, s.orgA, productId);
      await tx.execute(
        sql`update products set name = 'Café 500 g' where id = ${productId}`,
      );
      await tx.execute(
        sql`update inventories set quantity_on_hand = 7 where product_id = ${productId}`,
      );
      const read = await tx.execute<{ name: string; quantity_on_hand: string }>(
        sql`select p.name, i.quantity_on_hand from products p
            join inventories i on i.product_id = p.id where p.id = ${productId}`,
      );
      expect(read.rows).toEqual([
        { name: "Café 500 g", quantity_on_hand: "7.000" },
      ]);
      await tx.execute(
        sql`delete from inventories where product_id = ${productId}`,
      );
      await tx.execute(sql`delete from products where id = ${productId}`);
    });
    const remaining = await getDb().execute<{ count: number }>(
      sql`select count(*)::int as count from products`,
    );
    expect(remaining.rows[0]?.count).toBe(0);
  });
});

import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { hashPassword, login } from "@/modules/auth";
import { deactivateProduct } from "@/modules/catalog";
import { adjustStock, type StockAdjustmentInput } from "@/modules/inventory";
import { getAuthContext, type AuthContext } from "@/modules/organizations";
import { getDb } from "@/shared/db";
import { resetDatabase } from "./reset-database";

// Ajuste de stock contra PostgreSQL real (brief-4.3.1): movimiento, saldo y auditoría atómicos,
// rechazos sin efectos, autorización y aislamiento. Sin conexiones simultáneas: eso es la 4.3.2.

const PASSWORD = "contraseña-correcta-larga";
const MAX = "99999999999.999";
let storedHash: string;

async function createOrganization(name: string) {
  const result = await getDb().execute<{ id: string }>(
    sql`insert into organizations (name) values (${name}) returning id`,
  );
  return result.rows[0]!.id;
}

async function addUser(
  organizationId: string,
  email: string,
  role: "admin" | "viewer",
  mustChangePassword = false,
) {
  const user = await getDb().execute<{ id: string }>(
    sql`insert into users (email, password_hash, name, must_change_password)
        values (${email}, ${storedHash}, 'Persona', ${mustChangePassword}) returning id`,
  );
  await getDb().execute(
    sql`insert into organization_members (organization_id, user_id, role)
        values (${organizationId}, ${user.rows[0]!.id}, ${role})`,
  );
  return user.rows[0]!.id;
}

async function contextFor(email: string): Promise<AuthContext> {
  const logged = await login({ email, password: PASSWORD, ip: null });
  if (!logged.ok) throw new Error(`login rechazado: ${logged.code}`);
  const result = await getAuthContext(logged.token);
  if (!result.ok) throw new Error(`contexto rechazado: ${result.code}`);
  return result.context;
}

async function seed() {
  const orgA = await createOrganization("Negocio A");
  const orgB = await createOrganization("Negocio B");
  await addUser(orgA, "admin-a@example.com", "admin");
  await addUser(orgA, "viewer-a@example.com", "viewer");
  await addUser(orgA, "pendiente-a@example.com", "admin", true);
  await addUser(orgB, "admin-b@example.com", "admin");
  return {
    orgA,
    adminA: await contextFor("admin-a@example.com"),
    viewerA: await contextFor("viewer-a@example.com"),
    pendingA: await contextFor("pendiente-a@example.com"),
    adminB: await contextFor("admin-b@example.com"),
  };
}

// Producto y saldo por SQL, sin auditoría: la auditoría que queda es solo la del ajuste.
async function insertProduct(
  organizationId: string,
  { isActive = true, balance }: { isActive?: boolean; balance?: string } = {},
) {
  const result = await getDb().execute<{ id: string }>(
    sql`insert into products (organization_id, sku, name, is_active)
        values (${organizationId}, 'CAF-250', 'Café molido 250 g', ${isActive})
        returning id`,
  );
  const productId = result.rows[0]!.id;
  if (balance !== undefined) {
    await getDb().execute(
      sql`insert into inventories (organization_id, product_id, quantity_on_hand)
          values (${organizationId}, ${productId}, ${balance})`,
    );
  }
  return productId;
}

function adjustment(
  type: "adjustment_positive" | "adjustment_negative",
  quantity: string,
  expectedQuantityOnHand: string,
  reason = "Conteo físico",
): StockAdjustmentInput {
  return { type, quantity, expectedQuantityOnHand, reason };
}

const add = (quantity: string, expected: string, reason?: string) =>
  adjustment("adjustment_positive", quantity, expected, reason);
const remove = (quantity: string, expected: string) =>
  adjustment("adjustment_negative", quantity, expected);

async function count(
  table: "inventories" | "inventory_movements" | "audit_logs",
) {
  const result = await getDb().execute<{ count: number }>(
    sql.raw(`select count(*)::int as count from ${table}`),
  );
  return result.rows[0]!.count;
}

// Todo lo que un ajuste puede escribir, para comparar antes y después de un rechazo.
async function snapshot() {
  const balances = await getDb().execute(
    sql`select product_id, quantity_on_hand, updated_at from inventories order by product_id`,
  );
  return {
    balances: balances.rows,
    movements: await count("inventory_movements"),
    audits: await count("audit_logs"),
  };
}

async function balance(productId: string) {
  const result = await getDb().execute<{ quantity_on_hand: string }>(
    sql`select quantity_on_hand from inventories where product_id = ${productId}`,
  );
  return result.rows[0]?.quantity_on_hand;
}

async function lastMovement(productId: string) {
  const result = await getDb().execute(
    sql`select type, quantity, balance_after, reason, created_by
        from inventory_movements where product_id = ${productId}
        order by created_at desc limit 1`,
  );
  return result.rows[0];
}

beforeEach(async () => {
  await resetDatabase(getDb());
  storedHash ??= await hashPassword(PASSWORD);
});

afterAll(async () => {
  await getDb().$client.end();
});

describe("adjustStock: ajustes aceptados", () => {
  it("el primer ajuste crea la fila, el movimiento y la auditoría", async () => {
    const s = await seed();
    const productId = await insertProduct(s.orgA);

    expect(
      await adjustStock(s.adminA, productId, add("10", "0", "  Recepción  ")),
    ).toEqual({ ok: true, quantityOnHand: "10.000" });

    expect(await balance(productId)).toBe("10.000");
    expect(await lastMovement(productId)).toEqual({
      type: "adjustment_positive",
      quantity: "10.000",
      balance_after: "10.000",
      reason: "Recepción",
      created_by: s.adminA.userId,
    });
    const audits = await getDb().execute(
      sql`select organization_id, actor_user_id, entity_type, entity_id, action, diff
          from audit_logs`,
    );
    expect(audits.rows).toEqual([
      {
        organization_id: s.orgA,
        actor_user_id: s.adminA.userId,
        entity_type: "inventory",
        entity_id: productId,
        action: "stock_adjustment",
        diff: {
          before: { quantityOnHand: "0.000" },
          after: { quantityOnHand: "10.000" },
        },
      },
    ]);
  });

  it("en una serie, balance_after del último movimiento es igual al saldo después de cada ajuste", async () => {
    const s = await seed();
    const productId = await insertProduct(s.orgA);
    const steps: [StockAdjustmentInput, string][] = [
      [add("10", "0"), "10.000"],
      [remove("3,5", "10"), "6.500"],
      [add("0.25", "6.500"), "6.750"],
      [remove("6,75", "6,75"), "0.000"],
    ];

    for (const [input, expected] of steps) {
      expect(await adjustStock(s.adminA, productId, input)).toEqual({
        ok: true,
        quantityOnHand: expected,
      });
      expect(await balance(productId)).toBe(expected);
      expect(await lastMovement(productId)).toMatchObject({
        balance_after: expected,
      });
    }
    expect(await count("inventory_movements")).toBe(4);
    expect(await count("audit_logs")).toBe(4);
  });

  it("un ajuste negativo que deja el saldo exacto en 0 se acepta", async () => {
    const s = await seed();
    const productId = await insertProduct(s.orgA, { balance: "6" });
    expect(await adjustStock(s.adminA, productId, remove("6", "6"))).toEqual({
      ok: true,
      quantityOnHand: "0.000",
    });
    expect(await lastMovement(productId)).toMatchObject({
      type: "adjustment_negative",
      quantity: "6.000",
      balance_after: "0.000",
    });
  });

  it("un ajuste positivo puede llegar exactamente al máximo", async () => {
    const s = await seed();
    const productId = await insertProduct(s.orgA);
    expect(await adjustStock(s.adminA, productId, add(MAX, "0"))).toEqual({
      ok: true,
      quantityOnHand: MAX,
    });
  });
});

describe("adjustStock: rechazos sin efectos", () => {
  it("−0,001 viola negative_stock con saldo actual y cantidad solicitada", async () => {
    const s = await seed();
    const productId = await insertProduct(s.orgA, { balance: "6" });
    const before = await snapshot();

    expect(
      await adjustStock(s.adminA, productId, remove("6,001", "6")),
    ).toEqual({
      ok: false,
      code: "BUSINESS_RULE_VIOLATION",
      rule: "negative_stock",
      currentQuantityOnHand: "6.000",
      requestedQuantity: "6.001",
    });
    expect(await snapshot()).toEqual(before);
  });

  it("un primer ajuste negativo rechazado no deja la fila de inventories", async () => {
    const s = await seed();
    const productId = await insertProduct(s.orgA);

    expect(await adjustStock(s.adminA, productId, remove("1", "0"))).toEqual({
      ok: false,
      code: "BUSINESS_RULE_VIOLATION",
      rule: "negative_stock",
      currentQuantityOnHand: "0.000",
      requestedQuantity: "1.000",
    });
    expect(await count("inventories")).toBe(0);
    expect(await count("inventory_movements")).toBe(0);
    expect(await count("audit_logs")).toBe(0);
  });

  it("un producto desactivado viola inactive_product, tenga o no fila", async () => {
    const s = await seed();
    const withoutRow = await insertProduct(s.orgA, { isActive: false });
    const before = await snapshot();
    expect(await adjustStock(s.adminA, withoutRow, add("1", "0"))).toEqual({
      ok: false,
      code: "BUSINESS_RULE_VIOLATION",
      rule: "inactive_product",
    });
    expect(await snapshot()).toEqual(before);

    const withRow = await getDb().execute<{ id: string }>(
      sql`insert into products (organization_id, sku, name)
          values (${s.orgA}, 'YER-500', 'Yerba') returning id`,
    );
    const productId = withRow.rows[0]!.id;
    await adjustStock(s.adminA, productId, add("5", "0"));
    expect(await deactivateProduct(s.adminA, productId)).toMatchObject({
      ok: true,
    });
    const deactivated = await snapshot();
    expect(await adjustStock(s.adminA, productId, remove("1", "5"))).toEqual({
      ok: false,
      code: "BUSINESS_RULE_VIOLATION",
      rule: "inactive_product",
    });
    expect(await snapshot()).toEqual(deactivated);
  });

  it("superar el máximo viola stock_limit", async () => {
    const s = await seed();
    const productId = await insertProduct(s.orgA, { balance: MAX });
    const before = await snapshot();
    expect(await adjustStock(s.adminA, productId, add("0,001", MAX))).toEqual({
      ok: false,
      code: "BUSINESS_RULE_VIOLATION",
      rule: "stock_limit",
      currentQuantityOnHand: MAX,
      requestedQuantity: "0.001",
    });
    expect(await snapshot()).toEqual(before);
  });

  it("un saldo esperado distinto da CONFLICT con el saldo actual, y sin fila no la crea", async () => {
    const s = await seed();
    const withRow = await insertProduct(s.orgA, { balance: "6" });
    const before = await snapshot();
    expect(await adjustStock(s.adminA, withRow, remove("1", "10"))).toEqual({
      ok: false,
      code: "CONFLICT",
      currentQuantityOnHand: "6.000",
    });
    expect(await snapshot()).toEqual(before);

    const withoutRow = await getDb().execute<{ id: string }>(
      sql`insert into products (organization_id, sku, name)
          values (${s.orgA}, 'YER-500', 'Yerba') returning id`,
    );
    expect(
      await adjustStock(s.adminA, withoutRow.rows[0]!.id, add("1", "2")),
    ).toEqual({ ok: false, code: "CONFLICT", currentQuantityOnHand: "0.000" });
    expect(await count("inventories")).toBe(1);
  });
});

describe("adjustStock: autorización, aislamiento y validación", () => {
  it("viewer y contraseña pendiente reciben FORBIDDEN sin escribir", async () => {
    const s = await seed();
    const productId = await insertProduct(s.orgA);
    for (const context of [s.viewerA, s.pendingA]) {
      expect(await adjustStock(context, productId, add("1", "0"))).toEqual({
        ok: false,
        code: "FORBIDDEN",
      });
    }
    expect(await count("inventories")).toBe(0);
  });

  it("un producto de otra organización da NOT_FOUND sin crear la fila", async () => {
    const s = await seed();
    const productId = await insertProduct(s.orgA);
    expect(await adjustStock(s.adminB, productId, add("1", "0"))).toEqual({
      ok: false,
      code: "NOT_FOUND",
    });
    expect(await adjustStock(s.adminA, randomUUID(), add("1", "0"))).toEqual({
      ok: false,
      code: "NOT_FOUND",
    });
    expect(await count("inventories")).toBe(0);
  });

  it("id inválido y entrada inválida dan VALIDATION_ERROR sin escribir", async () => {
    const s = await seed();
    const productId = await insertProduct(s.orgA);
    expect(await adjustStock(s.adminA, "no-es-un-id", add("1", "0"))).toEqual({
      ok: false,
      code: "VALIDATION_ERROR",
      fields: [],
    });
    expect(
      await adjustStock(s.adminA, productId, {
        type: "sale",
        quantity: "0",
        expectedQuantityOnHand: "-1",
        reason: " ",
      }),
    ).toEqual({
      ok: false,
      code: "VALIDATION_ERROR",
      fields: ["type", "quantity", "expectedQuantityOnHand", "reason"],
    });
    expect(
      await adjustStock(s.adminA, productId, add("1", "0", "a".repeat(501))),
    ).toEqual({ ok: false, code: "VALIDATION_ERROR", fields: ["reason"] });
    expect(await count("inventories")).toBe(0);
  });

  it("si falla una escritura posterior, no persiste nada: ni la fila nueva ni el cambio de saldo", async () => {
    const s = await seed();
    // Un actor inexistente hace fallar las claves foráneas del movimiento y de la auditoría.
    const ghost: AuthContext = { ...s.adminA, userId: randomUUID() };

    const withoutRow = await insertProduct(s.orgA);
    await expect(
      adjustStock(ghost, withoutRow, add("1", "0")),
    ).rejects.toThrow();
    expect(await count("inventories")).toBe(0);

    await getDb().execute(
      sql`insert into inventories (organization_id, product_id, quantity_on_hand)
          values (${s.orgA}, ${withoutRow}, 6)`,
    );
    const before = await snapshot();
    await expect(
      adjustStock(ghost, withoutRow, remove("1", "6")),
    ).rejects.toThrow();
    expect(await snapshot()).toEqual(before);
  });
});

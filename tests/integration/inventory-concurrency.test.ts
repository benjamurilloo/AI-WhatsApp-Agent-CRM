import { sql, type SQL } from "drizzle-orm";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { hashPassword, login } from "@/modules/auth";
import { deactivateProduct } from "@/modules/catalog";
import {
  adjustStock,
  listStockMovements,
  type StockAdjustmentInput,
  type StockAdjustmentResult,
} from "@/modules/inventory";
import { getAuthContext } from "@/modules/organizations";
import { getDb } from "@/shared/db";
import { quantityFromDatabase, quantityToDatabase } from "@/shared/quantity";
import { resetDatabase } from "./reset-database";
import { expectStockInvariant } from "./stock-invariant";

// Ajustes de stock con conexiones simultáneas (brief-4.3.2). Otra conexión retiene un bloqueo,
// se comprueba en pg_stat_activity que todos esperan en él (D-2) y recién entonces se suelta (D-1).
// Los casos 1 a 5 no ordenan movimientos por created_at (brief-4.3.2, hallazgo 4); el caso 6
// comprueba ese orden con created_at como hora del INSERT (brief-4.3.3, D-1).

const PASSWORD = "contraseña-correcta-larga";
const TEST_TIMEOUT = 20000;
let storedHash: string;

async function seed() {
  const organization = await getDb().execute<{ id: string }>(
    sql`insert into organizations (name) values ('Negocio A') returning id`,
  );
  const orgId = organization.rows[0]!.id;
  const user = await getDb().execute<{ id: string }>(
    sql`insert into users (email, password_hash, name)
        values ('admin-a@example.com', ${storedHash}, 'Persona') returning id`,
  );
  await getDb().execute(
    sql`insert into organization_members (organization_id, user_id, role)
        values (${orgId}, ${user.rows[0]!.id}, 'admin')`,
  );
  const logged = await login({
    email: "admin-a@example.com",
    password: PASSWORD,
    ip: null,
  });
  if (!logged.ok) throw new Error(`login rechazado: ${logged.code}`);
  const result = await getAuthContext(logged.token);
  if (!result.ok) throw new Error(`contexto rechazado: ${result.code}`);
  return { orgId, admin: result.context };
}

async function insertProduct(orgId: string, balance?: string) {
  const result = await getDb().execute<{ id: string }>(
    sql`insert into products (organization_id, sku, name)
        values (${orgId}, 'CAF-250', 'Café molido 250 g') returning id`,
  );
  const productId = result.rows[0]!.id;
  if (balance !== undefined) {
    await getDb().execute(
      sql`insert into inventories (organization_id, product_id, quantity_on_hand)
          values (${orgId}, ${productId}, ${balance})`,
    );
  }
  return productId;
}

const add = (quantity: string, expected: string): StockAdjustmentInput => ({
  type: "adjustment_positive",
  quantity,
  expectedQuantityOnHand: expected,
  reason: "Conteo físico",
});
const remove = (quantity: string, expected: string): StockAdjustmentInput => ({
  type: "adjustment_negative",
  quantity,
  expectedQuantityOnHand: expected,
  reason: "Conteo físico",
});

// Bloqueos retenidos del test en curso: se sueltan al terminar aunque el test falle, para que
// la conexión abierta no trabe la limpieza de la base ni los tests siguientes.
const heldLocks: (() => Promise<void>)[] = [];

// Una conexión aparte ejecuta la consulta en su transacción y la mantiene abierta hasta soltarla.
async function hold(query: SQL): Promise<() => Promise<void>> {
  let taken!: () => void;
  let release!: () => void;
  const lockTaken = new Promise<void>((resolve) => (taken = resolve));
  const released = new Promise<void>((resolve) => (release = resolve));
  const holder = getDb().transaction(async (tx) => {
    await tx.execute(query);
    taken();
    await released;
  });
  await lockTaken;
  const releaseLock = async () => {
    release();
    await holder;
  };
  heldLocks.push(releaseLock);
  return releaseLock;
}

afterEach(async () => {
  await Promise.all(heldLocks.splice(0).map((releaseLock) => releaseLock()));
  // El invariante de las unidades, después de cada test (brief-29.5, D-8). Esta suite arma saldos con SQL directo, sin
  // movimiento, así que la suma de los movimientos no se compara: la comparan units.test.ts y
  // orders-cycle.test.ts.
  await expectStockInvariant({ movements: false });
});

// Espera hasta que la base de test tenga exactamente `count` conexiones detenidas en un bloqueo.
async function waitForLockWaiters(count: number, timeoutMs = 5000) {
  const deadline = Date.now() + timeoutMs;
  let waiting = -1;
  while (Date.now() < deadline) {
    const result = await getDb().execute<{ waiting: number }>(
      sql`select count(*)::int as waiting from pg_stat_activity
          where datname = current_database() and wait_event_type = 'Lock'`,
    );
    waiting = result.rows[0]!.waiting;
    if (waiting === count) return;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error(
    `se esperaban ${count} conexiones en un bloqueo y hay ${waiting}`,
  );
}

async function count(
  table: "inventories" | "inventory_movements" | "audit_logs",
) {
  const result = await getDb().execute<{ count: number }>(
    sql.raw(`select count(*)::int as count from ${table}`),
  );
  return result.rows[0]!.count;
}

// El libro del producto: saldo, movimientos con su efecto firmado y balance_after.
async function ledger(productId: string) {
  const balance = await getDb().execute<{ quantity_on_hand: string }>(
    sql`select quantity_on_hand from inventories where product_id = ${productId}`,
  );
  const movements = await getDb().execute<{
    type: string;
    quantity: string;
    balance_after: string;
  }>(
    sql`select type, quantity, balance_after from inventory_movements
        where product_id = ${productId}`,
  );
  const delta = movements.rows.reduce(
    (sum, m) =>
      m.type === "adjustment_positive"
        ? sum + quantityFromDatabase(m.quantity)
        : sum - quantityFromDatabase(m.quantity),
    0n,
  );
  return {
    balance: balance.rows[0]?.quantity_on_hand,
    delta: quantityToDatabase(delta),
    movements: movements.rows.length,
    balancesAfter: movements.rows.map((m) => m.balance_after).sort(),
  };
}

beforeEach(async () => {
  await resetDatabase(getDb());
  storedHash ??= await hashPassword(PASSWORD);
});

afterAll(async () => {
  await getDb().$client.end();
});

describe("ajustes simultáneos del mismo producto", () => {
  it(
    "caso 1: dos ajustes con el mismo saldo esperado: uno se acepta y el otro da CONFLICT",
    async () => {
      const s = await seed();
      const productId = await insertProduct(s.orgId, "5");

      const release = await hold(
        sql`select id from products where id = ${productId} for update`,
      );
      const adjustments = [
        adjustStock(s.admin, productId, remove("5", "5")),
        adjustStock(s.admin, productId, remove("5", "5")),
      ];
      await waitForLockWaiters(2);
      await release();
      const results = await Promise.all(adjustments);

      expect(results).toContainEqual({ ok: true, quantityOnHand: "0.000" });
      expect(results).toContainEqual({
        ok: false,
        code: "CONFLICT",
        currentQuantityOnHand: "0.000",
      });
      expect(await ledger(productId)).toEqual({
        balance: "0.000",
        delta: "-5.000",
        movements: 1,
        balancesAfter: ["0.000"],
      });
      expect(await count("audit_logs")).toBe(1);
    },
    TEST_TIMEOUT,
  );

  it(
    "caso 2: dos primeros ajustes sobre un producto sin fila crean una sola fila",
    async () => {
      const s = await seed();
      const productId = await insertProduct(s.orgId);

      const release = await hold(
        sql`select id from products where id = ${productId} for update`,
      );
      const adjustments = [
        adjustStock(s.admin, productId, add("3", "0")),
        adjustStock(s.admin, productId, add("4", "0")),
      ];
      await waitForLockWaiters(2);
      await release();
      const results = await Promise.all(adjustments);

      const accepted = results.filter((r) => r.ok);
      expect(accepted).toHaveLength(1);
      const winner = accepted[0] as { ok: true; quantityOnHand: string };
      expect(results).toContainEqual({
        ok: false,
        code: "CONFLICT",
        currentQuantityOnHand: winner.quantityOnHand,
      });
      expect(await count("inventories")).toBe(1);
      expect(await ledger(productId)).toEqual({
        balance: winner.quantityOnHand,
        delta: winner.quantityOnHand,
        movements: 1,
        balancesAfter: [winner.quantityOnHand],
      });
      expect(await count("audit_logs")).toBe(1);
    },
    TEST_TIMEOUT,
  );

  it(
    "caso 3: seis ajustes que reintentan ante CONFLICT se aplican todos y el libro cuadra",
    async () => {
      const s = await seed();
      const productId = await insertProduct(s.orgId, "100");

      // Ningún subconjunto suma 0: cada orden posible da saldos intermedios distintos, y ni
      // todos los negativos juntos (−22) dejan el saldo negativo (D-3).
      const inputs: [typeof add, string][] = [
        [add, "10"],
        [remove, "7"],
        [add, "3"],
        [remove, "4"],
        [add, "20"],
        [remove, "11"],
      ];

      async function adjustWithRetry(
        build: typeof add,
        quantity: string,
      ): Promise<StockAdjustmentResult> {
        let expected = "100";
        for (let attempt = 0; attempt < 10; attempt++) {
          const result = await adjustStock(
            s.admin,
            productId,
            build(quantity, expected),
          );
          if (result.ok || result.code !== "CONFLICT") return result;
          expected = result.currentQuantityOnHand;
        }
        throw new Error("demasiados reintentos");
      }

      const release = await hold(
        sql`select id from products where id = ${productId} for update`,
      );
      const adjustments = inputs.map(([build, quantity]) =>
        adjustWithRetry(build, quantity),
      );
      await waitForLockWaiters(inputs.length);
      await release();
      const results = await Promise.all(adjustments);

      expect(results.every((r) => r.ok)).toBe(true);
      const returned = results
        .map((r) => (r as { quantityOnHand: string }).quantityOnHand)
        .sort();
      const book = await ledger(productId);
      expect(book).toMatchObject({
        balance: "111.000",
        delta: "11.000",
        movements: 6,
      });
      expect(book.balancesAfter).toEqual(returned);
      expect(
        book.balancesAfter.every((b) => quantityFromDatabase(b) >= 0n),
      ).toBe(true);
      expect(await count("audit_logs")).toBe(6);
    },
    TEST_TIMEOUT,
  );
});

describe("ajuste y desactivación simultáneos", () => {
  it(
    "caso 4: un ajuste en curso frena la desactivación hasta terminar",
    async () => {
      const s = await seed();
      const productId = await insertProduct(s.orgId, "5");

      // El ajuste toma el producto con FOR SHARE y se detiene en la fila de saldo retenida.
      const release = await hold(
        sql`select id from inventories where product_id = ${productId} for update`,
      );
      const adjustment = adjustStock(s.admin, productId, add("1", "5"));
      await waitForLockWaiters(1);
      const deactivation = deactivateProduct(s.admin, productId);
      await waitForLockWaiters(2);
      await release();

      expect(await adjustment).toEqual({ ok: true, quantityOnHand: "6.000" });
      expect(await deactivation).toEqual({ ok: true, changed: true });
      const audits = await getDb().execute<{ action: string }>(
        sql`select action from audit_logs where entity_id = ${productId}`,
      );
      expect(audits.rows.map((a) => a.action).sort()).toEqual([
        "deactivate",
        "stock_adjustment",
      ]);
      expect(await ledger(productId)).toMatchObject({
        balance: "6.000",
        movements: 1,
      });
    },
    TEST_TIMEOUT,
  );

  it(
    "caso 5: una desactivación sin confirmar frena el ajuste, que termina rechazado sin efectos",
    async () => {
      const s = await seed();
      const productId = await insertProduct(s.orgId);

      const release = await hold(
        sql`update products set is_active = false where id = ${productId}`,
      );
      const adjustment = adjustStock(s.admin, productId, add("1", "0"));
      await waitForLockWaiters(1);
      await release();

      expect(await adjustment).toEqual({
        ok: false,
        code: "BUSINESS_RULE_VIOLATION",
        rule: "inactive_product",
      });
      expect(await count("inventories")).toBe(0);
      expect(await count("inventory_movements")).toBe(0);
      expect(await count("audit_logs")).toBe(0);
    },
    TEST_TIMEOUT,
  );
});

describe("historial después de ajustes simultáneos (brief-4.3.3)", () => {
  it(
    "caso 6: el historial en orden encadena los saldos tras una carrera con reintento",
    async () => {
      const s = await seed();
      const productId = await insertProduct(s.orgId, "100");
      const inputs: [typeof add, string][] = [
        [add, "10"],
        [remove, "7"],
        [add, "3"],
        [remove, "4"],
        [add, "20"],
        [remove, "11"],
      ];

      async function adjustWithRetry(build: typeof add, quantity: string) {
        let expected = "100";
        for (let attempt = 0; attempt < 10; attempt++) {
          const result = await adjustStock(
            s.admin,
            productId,
            build(quantity, expected),
          );
          if (result.ok || result.code !== "CONFLICT") return result;
          expected = result.currentQuantityOnHand;
        }
        throw new Error("demasiados reintentos");
      }

      const release = await hold(
        sql`select id from products where id = ${productId} for update`,
      );
      const adjustments = inputs.map(([build, quantity]) =>
        adjustWithRetry(build, quantity),
      );
      await waitForLockWaiters(inputs.length);
      await release();
      expect((await Promise.all(adjustments)).every((r) => r.ok)).toBe(true);

      const history = await listStockMovements(s.admin, productId, {
        type: "all",
        from: "",
        to: "",
        page: 1,
      });
      if (!history.ok) throw new Error(`historial rechazado: ${history.code}`);
      expect(history.movements).toHaveLength(inputs.length);
      expect(history.movements[0]!.balanceAfter).toBe("111.000");

      // Del más antiguo al más reciente, cada saldo es el anterior más o menos su cantidad.
      let previous = quantityFromDatabase("100.000");
      for (const movement of [...history.movements].reverse()) {
        const quantity = quantityFromDatabase(movement.quantity);
        previous +=
          movement.type === "adjustment_positive" ? quantity : -quantity;
        expect(movement.balanceAfter).toBe(quantityToDatabase(previous));
      }
    },
    TEST_TIMEOUT,
  );
});

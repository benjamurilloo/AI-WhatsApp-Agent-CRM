import { sql, type SQL } from "drizzle-orm";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { hashPassword, login } from "@/modules/auth";
import { deactivateProduct } from "@/modules/catalog";
import {
  adjustStock,
  deliverStock,
  releaseStock,
  reserveStock,
} from "@/modules/inventory";
import {
  cancelOrder,
  confirmOrder,
  createOrder,
  deliverOrder,
  getOrder,
  type OrderInput,
} from "@/modules/orders";
import { getAuthContext, type AuthContext } from "@/modules/organizations";
import { getDb } from "@/shared/db";
import { resetDatabase } from "./reset-database";
import { signedMovementSum } from "./stock-invariant";

// El ciclo del pedido contra PostgreSQL real (brief-19.3): las funciones de stock (AC-2), las
// transiciones (AC-3), la concurrencia (AC-4), el ajuste frente a lo reservado (AC-5) y la
// conciliación (AC-7). Los helpers son los de orders.test.ts.

const PASSWORD = "contraseña-correcta-larga";
const TEST_TIMEOUT = 30000;
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
  name: string,
  role: "admin" | "viewer",
) {
  const user = await getDb().execute<{ id: string }>(
    sql`insert into users (email, password_hash, name)
        values (${email}, ${storedHash}, ${name}) returning id`,
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

async function insertProduct(organizationId: string, sku: string) {
  const result = await getDb().execute<{ id: string }>(
    sql`insert into products (organization_id, sku, name)
        values (${organizationId}, ${sku}, ${`Producto ${sku}`}) returning id`,
  );
  return result.rows[0]!.id;
}

async function insertPrice(
  organizationId: string,
  productId: string,
  createdBy: string,
) {
  const result = await getDb().execute<{ id: string }>(
    sql`insert into product_prices (organization_id, product_id, amount, currency, created_by)
        values (${organizationId}, ${productId}, ${"100.00"}, ${"ARS"}, ${createdBy})
        returning id`,
  );
  return result.rows[0]!.id;
}

// Organización A con admin, viewer, un cliente y tres productos con precio, sin stock; B con su
// admin. El stock se carga con ajustes, para que la conciliación de movimientos cierre.
async function seed() {
  const orgA = await createOrganization("Negocio A");
  const orgB = await createOrganization("Negocio B");
  const adminAId = await addUser(orgA, "admin-a@example.com", "Ana", "admin");
  await addUser(orgA, "viewer-a@example.com", "Vera", "viewer");
  await addUser(orgB, "admin-b@example.com", "Beto", "admin");
  const client = await getDb().execute<{ id: string }>(
    sql`insert into clients (organization_id, display_name)
        values (${orgA}, ${"Lucía Gómez"}) returning id`,
  );
  const coffee = await insertProduct(orgA, "CAF-250");
  const tea = await insertProduct(orgA, "TE-100");
  const sugar = await insertProduct(orgA, "AZU-1");
  return {
    orgA,
    adminAId,
    clientA: client.rows[0]!.id,
    coffee,
    tea,
    sugar,
    prices: new Map([
      [coffee, await insertPrice(orgA, coffee, adminAId)],
      [tea, await insertPrice(orgA, tea, adminAId)],
      [sugar, await insertPrice(orgA, sugar, adminAId)],
    ]),
    adminA: await contextFor("admin-a@example.com"),
    viewerA: await contextFor("viewer-a@example.com"),
    adminB: await contextFor("admin-b@example.com"),
  };
}

type Seed = Awaited<ReturnType<typeof seed>>;

async function stock(s: Seed, productId: string, quantity: string) {
  const current = await balance(productId);
  const result = await adjustStock(s.adminA, productId, {
    type: "adjustment_positive",
    quantity,
    expectedQuantityOnHand: current.onHand,
    reason: "Carga inicial",
  });
  if (!result.ok) throw new Error(`ajuste rechazado: ${result.code}`);
}

async function order(
  s: Seed,
  lines: [productId: string, quantity: string][],
): Promise<string> {
  const input: OrderInput = {
    clientId: s.clientA,
    lines: lines.map(([productId, quantity]) => ({
      productId,
      quantity,
      expectedPriceId: s.prices.get(productId)!,
    })),
  };
  const created = await createOrder(s.adminA, input);
  if (!created.ok) throw new Error(`alta rechazada: ${created.code}`);
  return created.order.id;
}

async function confirmed(
  s: Seed,
  lines: [productId: string, quantity: string][],
) {
  const id = await order(s, lines);
  const result = await confirmOrder(s.adminA, id);
  if (!result.ok) throw new Error(`confirmación rechazada: ${result.code}`);
  return id;
}

async function balance(productId: string) {
  const result = await getDb().execute<{ on_hand: string; reserved: string }>(
    sql`select quantity_on_hand as on_hand, quantity_reserved as reserved
        from inventories where product_id = ${productId}`,
  );
  const row = result.rows[0];
  return {
    onHand: row?.on_hand ?? "0.000",
    reserved: row?.reserved ?? "0.000",
  };
}

async function orderRow(id: string) {
  const result = await getDb().execute<{
    status: string;
    confirmed: boolean;
    delivered: boolean;
    cancelled: boolean;
  }>(
    sql`select status, confirmed_at is not null as confirmed,
               delivered_at is not null as delivered, cancelled_at is not null as cancelled
        from orders where id = ${id}`,
  );
  return result.rows[0]!;
}

async function transitionsAudited(id: string) {
  const result = await getDb().execute<{ diff: unknown }>(
    sql`select diff from audit_logs
        where entity_type = 'order' and action = 'status_change' and entity_id = ${id}
        order by created_at`,
  );
  return result.rows.map((row) => row.diff);
}

async function deliveries() {
  const result = await getDb().execute<{
    product_id: string;
    type: string;
    quantity: string;
    balance_after: string;
    reason: string;
    created_by: string;
  }>(
    sql`select product_id, type, quantity, balance_after, reason, created_by
        from inventory_movements where type = 'order_delivery' order by created_at`,
  );
  return result.rows;
}

async function count(table: "inventories" | "inventory_movements") {
  const result = await getDb().execute<{ count: number }>(
    sql.raw(`select count(*)::int as count from ${table}`),
  );
  return result.rows[0]!.count;
}

// Bloqueos retenidos del test en curso, como en orders.test.ts.
const heldLocks: (() => Promise<void>)[] = [];

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

async function waitForLockWaiters(expected: number, timeoutMs = 5000) {
  const deadline = Date.now() + timeoutMs;
  let waiting = -1;
  while (Date.now() < deadline) {
    const result = await getDb().execute<{ waiting: number }>(
      sql`select count(*)::int as waiting from pg_stat_activity
          where datname = current_database() and wait_event_type = 'Lock'`,
    );
    waiting = result.rows[0]!.waiting;
    if (waiting === expected) return;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error(
    `se esperaban ${expected} conexiones en un bloqueo y hay ${waiting}`,
  );
}

beforeEach(async () => {
  await resetDatabase(getDb());
  storedHash ??= await hashPassword(PASSWORD);
});

afterEach(async () => {
  await Promise.all(heldLocks.splice(0).map((releaseLock) => releaseLock()));
});

afterAll(async () => {
  await getDb().$client.end();
});

describe("las transiciones y su efecto en el stock (AC-2 y AC-3)", () => {
  it(
    "confirmar reserva cada línea sin tocar el saldo ni crear movimientos",
    async () => {
      const s = await seed();
      await stock(s, s.coffee, "10");
      await stock(s, s.tea, "2,5");
      const id = await order(s, [
        [s.coffee, "3"],
        [s.tea, "2,5"],
      ]);
      const movements = await count("inventory_movements");

      expect(await confirmOrder(s.adminA, id)).toEqual({
        ok: true,
        changed: true,
      });
      expect(await balance(s.coffee)).toEqual({
        onHand: "10.000",
        reserved: "3.000",
      });
      expect(await balance(s.tea)).toEqual({
        onHand: "2.500",
        reserved: "2.500",
      });
      expect(await count("inventory_movements")).toBe(movements);
      expect(await orderRow(id)).toEqual({
        status: "confirmed",
        confirmed: true,
        delivered: false,
        cancelled: false,
      });
      expect(await transitionsAudited(id)).toEqual([
        { before: { status: "pending" }, after: { status: "confirmed" } },
      ]);
    },
    TEST_TIMEOUT,
  );

  it(
    "entregar deja un movimiento por línea y baja saldo y reservado, también con todo el saldo reservado",
    async () => {
      const s = await seed();
      await stock(s, s.coffee, "10");
      await stock(s, s.tea, "2,5");
      const id = await confirmed(s, [
        [s.coffee, "3"],
        [s.tea, "2,5"],
      ]);

      expect(await deliverOrder(s.adminA, id)).toEqual({
        ok: true,
        changed: true,
      });
      expect(await balance(s.coffee)).toEqual({
        onHand: "7.000",
        reserved: "0.000",
      });
      // Todo el saldo estaba reservado: en dos sentencias, el CHECK lo habría rechazado.
      expect(await balance(s.tea)).toEqual({
        onHand: "0.000",
        reserved: "0.000",
      });
      const moved = await deliveries();
      expect(
        moved.map((m) => [m.product_id, m.quantity, m.balance_after]).sort(),
      ).toEqual(
        [
          [s.coffee, "3.000", "7.000"],
          [s.tea, "2.500", "0.000"],
        ].sort(),
      );
      for (const movement of moved) {
        expect(movement).toMatchObject({
          type: "order_delivery",
          reason: "Entrega del pedido P-000001",
          created_by: s.adminAId,
        });
      }
      expect(await orderRow(id)).toEqual({
        status: "delivered",
        confirmed: true,
        delivered: true,
        cancelled: false,
      });
      expect((await transitionsAudited(id)).at(-1)).toEqual({
        before: { status: "confirmed" },
        after: { status: "delivered" },
      });
    },
    TEST_TIMEOUT,
  );

  it(
    "cancelar un confirmado libera lo reservado, sin movimientos",
    async () => {
      const s = await seed();
      await stock(s, s.coffee, "10");
      const id = await confirmed(s, [[s.coffee, "4"]]);
      const movements = await count("inventory_movements");

      expect(await cancelOrder(s.adminA, id)).toEqual({
        ok: true,
        changed: true,
      });
      expect(await balance(s.coffee)).toEqual({
        onHand: "10.000",
        reserved: "0.000",
      });
      expect(await count("inventory_movements")).toBe(movements);
      expect(await orderRow(id)).toEqual({
        status: "cancelled",
        confirmed: true,
        delivered: false,
        cancelled: true,
      });
      expect((await transitionsAudited(id)).at(-1)).toEqual({
        before: { status: "confirmed" },
        after: { status: "cancelled" },
      });
    },
    TEST_TIMEOUT,
  );

  it(
    "cancelar un pendiente no lee ni crea saldos",
    async () => {
      const s = await seed();
      const id = await order(s, [[s.coffee, "4"]]);
      expect(await cancelOrder(s.adminA, id)).toEqual({
        ok: true,
        changed: true,
      });
      expect(await count("inventories")).toBe(0);
    },
    TEST_TIMEOUT,
  );

  it(
    "insufficient_stock informa cada línea que no alcanza y no escribe nada, ni la fila en 0",
    async () => {
      const s = await seed();
      await stock(s, s.coffee, "2");
      await stock(s, s.tea, "5");
      const id = await order(s, [
        [s.tea, "1"],
        [s.coffee, "3"],
        [s.sugar, "1"],
      ]);
      const inventories = await count("inventories");

      expect(await confirmOrder(s.adminA, id)).toEqual({
        ok: false,
        code: "BUSINESS_RULE_VIOLATION",
        rule: "insufficient_stock",
        lines: [
          {
            position: 2,
            productId: s.coffee,
            requested: "3.000",
            available: "2.000",
          },
          {
            position: 3,
            productId: s.sugar,
            requested: "1.000",
            available: "0.000",
          },
        ],
      });
      expect(await balance(s.tea)).toEqual({
        onHand: "5.000",
        reserved: "0.000",
      });
      // sugar no tenía fila: lockBalance la creó y el rechazo la revirtió.
      expect(await count("inventories")).toBe(inventories);
      expect((await orderRow(id)).status).toBe("pending");
      expect(await transitionsAudited(id)).toEqual([]);
    },
    TEST_TIMEOUT,
  );

  it(
    "confirmar rechaza un producto inactivo; entregar y cancelar un confirmado no",
    async () => {
      const s = await seed();
      await stock(s, s.coffee, "10");
      await stock(s, s.tea, "10");
      const pending = await order(s, [
        [s.coffee, "1"],
        [s.tea, "1"],
      ]);
      const toDeliver = await confirmed(s, [[s.tea, "2"]]);
      const toCancel = await confirmed(s, [[s.tea, "3"]]);
      const deactivated = await deactivateProduct(s.adminA, s.tea);
      expect(deactivated.ok).toBe(true);

      expect(await confirmOrder(s.adminA, pending)).toEqual({
        ok: false,
        code: "BUSINESS_RULE_VIOLATION",
        rule: "inactive_product",
        lines: [{ position: 2, productId: s.tea }],
      });
      expect(await deliverOrder(s.adminA, toDeliver)).toEqual({
        ok: true,
        changed: true,
      });
      expect(await cancelOrder(s.adminA, toCancel)).toEqual({
        ok: true,
        changed: true,
      });
      expect(await balance(s.tea)).toEqual({
        onHand: "8.000",
        reserved: "0.000",
      });
    },
    TEST_TIMEOUT,
  );

  it(
    "roles, organización e id: FORBIDDEN, NOT_FOUND y VALIDATION_ERROR",
    async () => {
      const s = await seed();
      await stock(s, s.coffee, "10");
      const pending = await order(s, [[s.coffee, "1"]]);
      const toDeliver = await confirmed(s, [[s.coffee, "1"]]);
      for (const transition of [confirmOrder, deliverOrder, cancelOrder]) {
        expect(await transition(s.viewerA, pending)).toEqual({
          ok: false,
          code: "FORBIDDEN",
        });
        expect(await transition(s.adminB, pending)).toEqual({
          ok: false,
          code: "NOT_FOUND",
        });
        expect(await transition(s.adminA, "no-es-un-id")).toEqual({
          ok: false,
          code: "VALIDATION_ERROR",
        });
      }
      expect(await deliverOrder(s.viewerA, toDeliver)).toEqual({
        ok: false,
        code: "FORBIDDEN",
      });
      expect((await orderRow(pending)).status).toBe("pending");
      expect((await orderRow(toDeliver)).status).toBe("confirmed");
    },
    TEST_TIMEOUT,
  );

  it(
    "repetir una transición no escribe; un origen inválido da invalid_transition (D-4)",
    async () => {
      const s = await seed();
      await stock(s, s.coffee, "10");
      const pending = await order(s, [[s.coffee, "1"]]);
      expect(await deliverOrder(s.adminA, pending)).toEqual({
        ok: false,
        code: "BUSINESS_RULE_VIOLATION",
        rule: "invalid_transition",
        status: "pending",
      });

      const id = await confirmed(s, [[s.coffee, "2"]]);
      expect(await confirmOrder(s.adminA, id)).toEqual({
        ok: true,
        changed: false,
      });
      expect((await balance(s.coffee)).reserved).toBe("2.000");
      expect(await deliverOrder(s.adminA, id)).toEqual({
        ok: true,
        changed: true,
      });
      expect(await deliverOrder(s.adminA, id)).toEqual({
        ok: true,
        changed: false,
      });
      expect(await deliveries()).toHaveLength(1);
      for (const transition of [confirmOrder, cancelOrder]) {
        expect(await transition(s.adminA, id)).toEqual({
          ok: false,
          code: "BUSINESS_RULE_VIOLATION",
          rule: "invalid_transition",
          status: "delivered",
        });
      }
      expect(await transitionsAudited(id)).toHaveLength(2);

      const cancelled = await order(s, [[s.coffee, "1"]]);
      await cancelOrder(s.adminA, cancelled);
      expect(await confirmOrder(s.adminA, cancelled)).toEqual({
        ok: false,
        code: "BUSINESS_RULE_VIOLATION",
        rule: "invalid_transition",
        status: "cancelled",
      });
    },
    TEST_TIMEOUT,
  );
});

// Las funciones de stock, directas (brief-19.3, AC-2, D-2 y D-13; revisión independiente, R-4).
// Los casos imposibles por la vía de la aplicación lanzan un error, que revierte la transacción.
describe("las funciones de stock de inventory (AC-2)", () => {
  it(
    "reserveStock reserva todo o nada y devuelve lo que no alcanza",
    async () => {
      const s = await seed();
      await stock(s, s.coffee, "5");
      await stock(s, s.tea, "1");
      const result = await getDb().transaction((tx) =>
        reserveStock(tx, s.orgA, [
          { productId: s.coffee, quantity: "2.000" },
          { productId: s.tea, quantity: "1.500" },
        ]),
      );
      expect(result).toEqual({
        ok: false,
        shortages: [
          { productId: s.tea, requested: "1.500", available: "1.000" },
        ],
      });
      // Quien llama revierte; acá no hubo escrituras de lo reservado.
      expect((await balance(s.coffee)).reserved).toBe("0.000");
      expect(
        await getDb().transaction((tx) =>
          reserveStock(tx, s.orgA, [
            { productId: s.coffee, quantity: "5.000" },
          ]),
        ),
      ).toEqual({ ok: true });
      expect(await balance(s.coffee)).toEqual({
        onHand: "5.000",
        reserved: "5.000",
      });
    },
    TEST_TIMEOUT,
  );

  it(
    "un producto repetido en las líneas es un defecto: lanza y no escribe",
    async () => {
      const s = await seed();
      await stock(s, s.coffee, "5");
      await expect(
        getDb().transaction((tx) =>
          reserveStock(tx, s.orgA, [
            { productId: s.coffee, quantity: "1.000" },
            { productId: s.coffee, quantity: "1.000" },
          ]),
        ),
      ).rejects.toThrow("producto repetido");
      expect((await balance(s.coffee)).reserved).toBe("0.000");
    },
    TEST_TIMEOUT,
  );

  it(
    "liberar o entregar más de lo reservado es un defecto (D-13): lanza y no escribe",
    async () => {
      const s = await seed();
      await stock(s, s.coffee, "5");
      await getDb().transaction((tx) =>
        reserveStock(tx, s.orgA, [{ productId: s.coffee, quantity: "2.000" }]),
      );
      const movements = await count("inventory_movements");
      await expect(
        getDb().transaction((tx) =>
          releaseStock(tx, s.orgA, [
            { productId: s.coffee, quantity: "3.000" },
          ]),
        ),
      ).rejects.toThrow("reservado insuficiente para liberar");
      await expect(
        getDb().transaction((tx) =>
          deliverStock(tx, {
            organizationId: s.orgA,
            lines: [{ productId: s.coffee, quantity: "3.000" }],
            reason: "Entrega del pedido P-000001",
            createdBy: s.adminAId,
          }),
        ),
      ).rejects.toThrow("reservado insuficiente para entregar");
      expect(await balance(s.coffee)).toEqual({
        onHand: "5.000",
        reserved: "2.000",
      });
      expect(await count("inventory_movements")).toBe(movements);
    },
    TEST_TIMEOUT,
  );
});

describe("concurrencia y bloqueos (AC-4)", () => {
  it(
    "dos pedidos que compiten por el mismo stock: solo uno reserva",
    async () => {
      const s = await seed();
      await stock(s, s.coffee, "5");
      const first = await order(s, [[s.coffee, "3"]]);
      const second = await order(s, [[s.coffee, "3"]]);
      const results = await Promise.all([
        confirmOrder(s.adminA, first),
        confirmOrder(s.adminA, second),
      ]);
      expect(results.filter((result) => result.ok)).toHaveLength(1);
      expect(
        results.find((result) => !result.ok && result.code !== "FORBIDDEN"),
      ).toMatchObject({ rule: "insufficient_stock" });
      expect(await balance(s.coffee)).toEqual({
        onHand: "5.000",
        reserved: "3.000",
      });
    },
    TEST_TIMEOUT,
  );

  it(
    "dos confirmaciones simultáneas del mismo pedido reservan y auditan una vez",
    async () => {
      const s = await seed();
      await stock(s, s.coffee, "5");
      const id = await order(s, [[s.coffee, "3"]]);
      const results = await Promise.all([
        confirmOrder(s.adminA, id),
        confirmOrder(s.adminA, id),
      ]);
      expect(
        results.map((result) => result.ok && result.changed).sort(),
      ).toEqual([false, true]);
      expect((await balance(s.coffee)).reserved).toBe("3.000");
      expect(await transitionsAudited(id)).toHaveLength(1);
    },
    TEST_TIMEOUT,
  );

  it(
    "una confirmación y un ajuste negativo simultáneos terminan coherentes",
    async () => {
      const s = await seed();
      await stock(s, s.coffee, "10");
      const id = await order(s, [[s.coffee, "6"]]);
      // El ajuste retiene el saldo hasta que la confirmación espera detrás de él.
      const release = await hold(
        sql`select 1 from inventories where product_id = ${s.coffee} for update`,
      );
      const confirming = confirmOrder(s.adminA, id);
      const adjusting = adjustStock(s.adminA, s.coffee, {
        type: "adjustment_negative",
        quantity: "6",
        expectedQuantityOnHand: "10",
        reason: "Rotura",
      });
      await waitForLockWaiters(2);
      await release();
      const [confirmResult, adjustResult] = await Promise.all([
        confirming,
        adjusting,
      ]);
      // Gane quien gane, uno de los dos se rechaza y el saldo nunca queda por debajo de lo
      // reservado.
      expect([confirmResult.ok, adjustResult.ok].sort()).toEqual([false, true]);
      const after = await balance(s.coffee);
      expect(
        confirmResult.ok
          ? { onHand: "10.000", reserved: "6.000" }
          : { onHand: "4.000", reserved: "0.000" },
      ).toEqual(after);
      if (!adjustResult.ok) {
        expect(adjustResult).toMatchObject({ rule: "below_reserved" });
      }
    },
    TEST_TIMEOUT,
  );

  it(
    "pedidos con los mismos productos en otro orden no se traban",
    async () => {
      const s = await seed();
      await stock(s, s.coffee, "100");
      await stock(s, s.tea, "100");
      await stock(s, s.sugar, "100");
      for (let round = 0; round < 5; round += 1) {
        const one = await order(s, [
          [s.coffee, "1"],
          [s.tea, "1"],
          [s.sugar, "1"],
        ]);
        const other = await order(s, [
          [s.sugar, "1"],
          [s.tea, "1"],
          [s.coffee, "1"],
        ]);
        const results = await Promise.all([
          confirmOrder(s.adminA, one),
          confirmOrder(s.adminA, other),
        ]);
        expect(results).toEqual([
          { ok: true, changed: true },
          { ok: true, changed: true },
        ]);
        expect(
          await Promise.all([
            deliverOrder(s.adminA, one),
            cancelOrder(s.adminA, other),
          ]),
        ).toEqual([
          { ok: true, changed: true },
          { ok: true, changed: true },
        ]);
      }
      expect(await balance(s.coffee)).toEqual({
        onHand: "95.000",
        reserved: "0.000",
      });
    },
    TEST_TIMEOUT,
  );

  it(
    "una transición espera a la cabecera bloqueada y después ve el estado nuevo",
    async () => {
      const s = await seed();
      await stock(s, s.coffee, "10");
      const id = await confirmed(s, [[s.coffee, "2"]]);
      const release = await hold(
        sql`select 1 from orders where id = ${id} for update`,
      );
      const delivering = deliverOrder(s.adminA, id);
      const cancelling = cancelOrder(s.adminA, id);
      await waitForLockWaiters(2);
      await release();
      const results = await Promise.all([delivering, cancelling]);
      // Una gana; la otra encuentra el estado final y no escribe.
      expect(results.filter((result) => result.ok)).toHaveLength(1);
      const after = await balance(s.coffee);
      expect(after.reserved).toBe("0.000");
      expect(["8.000", "10.000"]).toContain(after.onHand);
    },
    TEST_TIMEOUT,
  );
});

describe("el ajuste frente a lo reservado (AC-5)", () => {
  it(
    "below_reserved informa saldo, reservado y cantidad; un ajuste que no baja de lo reservado pasa",
    async () => {
      const s = await seed();
      await stock(s, s.coffee, "10");
      await confirmed(s, [[s.coffee, "8"]]);
      expect(
        await adjustStock(s.adminA, s.coffee, {
          type: "adjustment_negative",
          quantity: "3",
          expectedQuantityOnHand: "10",
          reason: "Rotura",
        }),
      ).toEqual({
        ok: false,
        code: "BUSINESS_RULE_VIOLATION",
        rule: "below_reserved",
        currentQuantityOnHand: "10.000",
        currentQuantityReserved: "8.000",
        requestedQuantity: "3.000",
      });
      expect(
        await adjustStock(s.adminA, s.coffee, {
          type: "adjustment_negative",
          quantity: "2",
          expectedQuantityOnHand: "10",
          reason: "Rotura",
        }),
      ).toEqual({ ok: true, quantityOnHand: "8.000" });
      expect(await balance(s.coffee)).toEqual({
        onHand: "8.000",
        reserved: "8.000",
      });
    },
    TEST_TIMEOUT,
  );

  it(
    "el ajuste rechaza order_delivery como tipo",
    async () => {
      const s = await seed();
      expect(
        await adjustStock(s.adminA, s.coffee, {
          type: "order_delivery",
          quantity: "1",
          expectedQuantityOnHand: "0",
          reason: "Entrega a mano",
        }),
      ).toEqual({ ok: false, code: "VALIDATION_ERROR", fields: ["type"] });
      // Ni sale, la salida de una venta sin pedido (brief-20.3, AC-5).
      expect(
        await adjustStock(s.adminA, s.coffee, {
          type: "sale",
          quantity: "1",
          expectedQuantityOnHand: "0",
          reason: "Venta a mano",
        }),
      ).toEqual({ ok: false, code: "VALIDATION_ERROR", fields: ["type"] });
      // Ni sale_void, la reposición de una anulación (brief-20.4, D-5).
      expect(
        await adjustStock(s.adminA, s.coffee, {
          type: "sale_void",
          quantity: "1",
          expectedQuantityOnHand: "0",
          reason: "Anulación a mano",
        }),
      ).toEqual({ ok: false, code: "VALIDATION_ERROR", fields: ["type"] });
      expect(await count("inventory_movements")).toBe(0);
    },
    TEST_TIMEOUT,
  );
});

describe("el detalle de un pendiente (D-9)", () => {
  it(
    "muestra lo disponible por línea en un pendiente y nada en un confirmado",
    async () => {
      const s = await seed();
      await stock(s, s.coffee, "10");
      await confirmed(s, [[s.coffee, "4"]]);
      const pending = await order(s, [
        [s.coffee, "1"],
        [s.tea, "1"],
      ]);
      const detail = await getOrder(s.viewerA, pending);
      if (!detail.ok) throw new Error(detail.code);
      expect(detail.order.lines.map((line) => line.available)).toEqual([
        "6.000",
        "0.000",
      ]);

      const other = await confirmed(s, [[s.coffee, "1"]]);
      const confirmedDetail = await getOrder(s.adminA, other);
      if (!confirmedDetail.ok) throw new Error(confirmedDetail.code);
      expect(confirmedDetail.order.lines.map((line) => line.available)).toEqual(
        [null],
      );
    },
    TEST_TIMEOUT,
  );
});

describe("la conciliación (AC-7, D-11)", () => {
  it(
    "lo reservado es la suma de los confirmados y el saldo, la de sus movimientos",
    async () => {
      const s = await seed();
      await stock(s, s.coffee, "20");
      await stock(s, s.tea, "7,5");
      await stock(s, s.sugar, "3");

      const a = await confirmed(s, [
        [s.coffee, "5"],
        [s.tea, "2,5"],
      ]);
      const b = await confirmed(s, [
        [s.sugar, "1"],
        [s.coffee, "3"],
      ]);
      await confirmed(s, [[s.tea, "1,25"]]);
      await order(s, [[s.coffee, "9"]]);
      const c = await confirmed(s, [[s.sugar, "2"]]);
      await deliverOrder(s.adminA, a);
      await cancelOrder(s.adminA, c);
      await adjustStock(s.adminA, s.coffee, {
        type: "adjustment_negative",
        quantity: "2",
        expectedQuantityOnHand: "15",
        reason: "Rotura",
      });
      await stock(s, s.tea, "1");
      await deliverOrder(s.adminA, b);
      await confirmed(s, [
        [s.coffee, "4"],
        [s.sugar, "2"],
      ]);

      const reserved = await getDb().execute<{
        product_id: string;
        reserved: string;
        expected: string;
      }>(
        sql`select i.product_id, i.quantity_reserved as reserved,
                   coalesce(sum(l.quantity) filter (where o.status = 'confirmed'), 0)::numeric(14, 3)
                     as expected
            from inventories i
            left join order_lines l on l.product_id = i.product_id
            left join orders o on o.id = l.order_id
            group by i.product_id, i.quantity_reserved`,
      );
      expect(reserved.rows).toHaveLength(3);
      for (const row of reserved.rows) expect(row.reserved).toBe(row.expected);

      const onHand = await getDb().execute<{
        product_id: string;
        on_hand: string;
        expected: string;
      }>(
        // El signo de cada tipo, del mapa de inventory (brief-29.5, H-9): antes sumaba solo
        // adjustment_positive y restaba todo lo demás, también goods_receipt y sale_void.
        sql`select i.product_id, i.quantity_on_hand as on_hand,
                   ${signedMovementSum()}::numeric(14, 3) as expected
            from inventories i
            join inventory_movements m on m.product_id = i.product_id
            group by i.product_id, i.quantity_on_hand`,
      );
      expect(onHand.rows).toHaveLength(3);
      for (const row of onHand.rows) expect(row.on_hand).toBe(row.expected);

      expect(await balance(s.coffee)).toEqual({
        onHand: "10.000",
        reserved: "4.000",
      });
    },
    TEST_TIMEOUT,
  );
});

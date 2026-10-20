import { sql, type SQL } from "drizzle-orm";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { hashPassword, login } from "@/modules/auth";
import { setProductPrice } from "@/modules/catalog";
import { deactivateClient } from "@/modules/crm";
import {
  cancelOrder,
  createOrder,
  getOrder,
  listOrderAudit,
  listOrders,
  listRecentClientOrders,
  type OrderInput,
} from "@/modules/orders";
import { getAuthContext, type AuthContext } from "@/modules/organizations";
import { getDb } from "@/shared/db";
import { resetDatabase } from "./reset-database";
import { expectStockInvariant } from "./stock-invariant";

// El pedido contra PostgreSQL real (brief-19.2): el alta con sus reglas (AC-3), los montos
// (AC-4), los bloqueos (AC-5), la cancelación (AC-6), las lecturas (AC-7) y la auditoría (AC-8).
// Los helpers son los de product-costs.test.ts.

const PASSWORD = "contraseña-correcta-larga";
const TEST_TIMEOUT = 20000;
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

// La primera ficha lleva teléfono y email, para probar que un viewer no los recibe; las demás, no.
async function insertClient(
  organizationId: string,
  name = "Lucía Gómez",
  isActive = true,
) {
  const contact = name === "Lucía Gómez";
  const result = await getDb().execute<{ id: string }>(
    sql`insert into clients (organization_id, display_name, phone_e164, email, is_active)
        values (${organizationId}, ${name}, ${contact ? "+5491155550000" : null},
                ${contact ? "lucia@example.com" : null}, ${isActive})
        returning id`,
  );
  return result.rows[0]!.id;
}

async function insertProduct(
  organizationId: string,
  sku: string,
  isActive = true,
) {
  const result = await getDb().execute<{ id: string }>(
    sql`insert into products (organization_id, sku, name, is_active)
        values (${organizationId}, ${sku}, ${`Producto ${sku}`}, ${isActive}) returning id`,
  );
  return result.rows[0]!.id;
}

// Precio por SQL, sin servicio ni auditoría: el id es el que el formulario manda como esperado.
async function insertPrice(
  organizationId: string,
  productId: string,
  createdBy: string,
  amount: string,
  currency = "ARS",
) {
  const result = await getDb().execute<{ id: string }>(
    sql`insert into product_prices (organization_id, product_id, amount, currency, created_by)
        values (${organizationId}, ${productId}, ${amount}, ${currency}, ${createdBy})
        returning id`,
  );
  return result.rows[0]!.id;
}

// Organización A con admin y viewer, un cliente y tres productos con precio en ARS; B con su admin,
// su cliente y su producto.
async function seed() {
  const orgA = await createOrganization("Negocio A");
  const orgB = await createOrganization("Negocio B");
  const adminAId = await addUser(orgA, "admin-a@example.com", "Ana", "admin");
  await addUser(orgA, "viewer-a@example.com", "Vera", "viewer");
  const adminBId = await addUser(orgB, "admin-b@example.com", "Beto", "admin");
  const clientA = await insertClient(orgA);
  const clientB = await insertClient(orgB);
  const coffee = await insertProduct(orgA, "CAF-250");
  const tea = await insertProduct(orgA, "TE-100");
  const sugar = await insertProduct(orgA, "AZU-1");
  const productB = await insertProduct(orgB, "CAF-250");
  return {
    orgA,
    orgB,
    adminAId,
    clientA,
    clientB,
    coffee,
    tea,
    sugar,
    productB,
    coffeePrice: await insertPrice(orgA, coffee, adminAId, "1234.50"),
    teaPrice: await insertPrice(orgA, tea, adminAId, "0.05"),
    sugarPrice: await insertPrice(orgA, sugar, adminAId, "800.00"),
    productBPrice: await insertPrice(orgB, productB, adminBId, "10.00"),
    adminA: await contextFor("admin-a@example.com"),
    viewerA: await contextFor("viewer-a@example.com"),
    adminB: await contextFor("admin-b@example.com"),
  };
}

type Seed = Awaited<ReturnType<typeof seed>>;

function input(
  clientId: string,
  lines: [productId: string, quantity: string, expectedPriceId: string][],
): OrderInput {
  return {
    clientId,
    lines: lines.map(([productId, quantity, expectedPriceId]) => ({
      productId,
      quantity,
      expectedPriceId,
    })),
  };
}

function twoLines(s: Seed): OrderInput {
  return input(s.clientA, [
    [s.coffee, "3", s.coffeePrice],
    [s.tea, "0,5", s.teaPrice],
  ]);
}

async function count(
  table: "orders" | "order_lines" | "audit_logs" | "document_counters",
) {
  const result = await getDb().execute<{ count: number }>(
    sql.raw(`select count(*)::int as count from ${table}`),
  );
  return result.rows[0]!.count;
}

async function orderAudit() {
  const result = await getDb().execute<{
    entity_id: string;
    action: string;
    diff: { before: unknown; after: Record<string, unknown> };
  }>(
    sql`select entity_id, action, diff from audit_logs
        where entity_type = 'order' order by created_at`,
  );
  return result.rows;
}

// Bloqueos retenidos del test en curso, como en product-costs.test.ts.
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
  // El invariante del saldo y las unidades después de cada test (brief-29.5.2, D-7).
  await expectStockInvariant();
});

afterAll(async () => {
  await getDb().$client.end();
});

describe("createOrder: el alta (AC-3 y AC-4)", () => {
  it(
    "crea un pendiente numerado con los montos copiados y redondeados",
    async () => {
      const s = await seed();
      const result = await createOrder(s.adminA, twoLines(s));
      expect(result).toEqual({
        ok: true,
        order: { id: expect.any(String), number: 1, displayNumber: "P-000001" },
      });
      if (!result.ok) return;
      const order = await getDb().execute<{
        status: string;
        currency: string;
        total: string;
        client_id: string;
        created_by: string;
      }>(
        sql`select status, currency, total, client_id, created_by from orders`,
      );
      // 1.234,50 × 3 = 3.703,50; 0,05 × 0,5 = 0,025 → 0,03.
      expect(order.rows[0]).toEqual({
        status: "pending",
        currency: "ARS",
        total: "3703.53",
        client_id: s.clientA,
        created_by: s.adminAId,
      });
      const lines = await getDb().execute(
        sql`select product_id, position, quantity, unit_price, currency, line_total
            from order_lines order by position`,
      );
      expect(lines.rows).toEqual([
        {
          product_id: s.coffee,
          position: 1,
          quantity: "3.000",
          unit_price: "1234.50",
          currency: "ARS",
          line_total: "3703.50",
        },
        {
          product_id: s.tea,
          position: 2,
          quantity: "0.500",
          unit_price: "0.05",
          currency: "ARS",
          line_total: "0.03",
        },
      ]);
      expect((await createOrder(s.adminA, twoLines(s))).ok).toBe(true);
      const numbers = await getDb().execute<{ number: string }>(
        sql`select number from orders order by number`,
      );
      expect(numbers.rows.map((row) => row.number)).toEqual(["1", "2"]);
    },
    TEST_TIMEOUT,
  );

  it(
    "cambiar el precio después del alta no cambia el pedido",
    async () => {
      const s = await seed();
      const created = await createOrder(s.adminA, twoLines(s));
      if (!created.ok) throw new Error(created.code);
      const changed = await setProductPrice(s.adminA, s.coffee, {
        amount: "9999",
        currency: "ARS",
        expectedPriceId: s.coffeePrice,
      });
      expect(changed.ok).toBe(true);
      const found = await getOrder(s.adminA, created.order.id);
      if (!found.ok) throw new Error(found.code);
      expect(found.order.total).toBe("3703.53");
      expect(found.order.lines[0]!.unitPrice).toBe("1234.50");
    },
    TEST_TIMEOUT,
  );

  it(
    "solo un admin crea pedidos",
    async () => {
      const s = await seed();
      expect(await createOrder(s.viewerA, twoLines(s))).toEqual({
        ok: false,
        code: "FORBIDDEN",
      });
      expect(await count("orders")).toBe(0);
    },
    TEST_TIMEOUT,
  );

  it(
    "valida el cliente, la cantidad de líneas y cada línea",
    async () => {
      const s = await seed();
      expect(
        await createOrder(s.adminA, input("no-es-un-id", [])),
      ).toMatchObject({ code: "VALIDATION_ERROR", reason: "client" });
      expect(await createOrder(s.adminA, input(s.clientA, []))).toMatchObject({
        code: "VALIDATION_ERROR",
        reason: "no_lines",
      });
      const tooMany = Array.from(
        { length: 51 },
        () => [s.coffee, "1", s.coffeePrice] as [string, string, string],
      );
      expect(
        await createOrder(s.adminA, input(s.clientA, tooMany)),
      ).toMatchObject({ code: "VALIDATION_ERROR", reason: "too_many_lines" });
      expect(
        await createOrder(
          s.adminA,
          input(s.clientA, [
            [s.coffee, "0", s.coffeePrice],
            ["x", "1", s.teaPrice],
            [s.sugar, "1,2345", s.sugarPrice],
            [s.tea, "1", "no-es-un-id"],
          ]),
        ),
      ).toEqual({
        ok: false,
        code: "VALIDATION_ERROR",
        reason: "lines",
        lines: [
          { position: 1, field: "quantity" },
          { position: 2, field: "product" },
          { position: 3, field: "quantity" },
          { position: 4, field: "expectedPrice" },
        ],
      });
      expect(await count("orders")).toBe(0);
    },
    TEST_TIMEOUT,
  );

  it(
    "un cliente o un producto inexistente o de otra organización da NOT_FOUND",
    async () => {
      const s = await seed();
      expect(
        await createOrder(
          s.adminA,
          input(s.clientB, [[s.coffee, "1", s.coffeePrice]]),
        ),
      ).toEqual({ ok: false, code: "NOT_FOUND", target: "client" });
      expect(
        await createOrder(
          s.adminA,
          input(s.clientA, [
            [s.coffee, "1", s.coffeePrice],
            [s.productB, "1", s.productBPrice],
          ]),
        ),
      ).toEqual({
        ok: false,
        code: "NOT_FOUND",
        target: "products",
        lines: [{ position: 2, productId: s.productB }],
      });
      expect(await count("orders")).toBe(0);
    },
    TEST_TIMEOUT,
  );

  it(
    "rechaza un cliente inactivo",
    async () => {
      const s = await seed();
      const inactive = await insertClient(s.orgA, "Inactivo", false);
      expect(
        await createOrder(
          s.adminA,
          input(inactive, [[s.coffee, "1", s.coffeePrice]]),
        ),
      ).toEqual({
        ok: false,
        code: "BUSINESS_RULE_VIOLATION",
        rule: "inactive_client",
      });
    },
    TEST_TIMEOUT,
  );

  it(
    "rechaza cada línea con un producto inactivo, sin precio o repetido",
    async () => {
      const s = await seed();
      const inactive = await insertProduct(s.orgA, "OFF-1", false);
      const noPrice = await insertProduct(s.orgA, "SIN-1");
      expect(
        await createOrder(
          s.adminA,
          input(s.clientA, [
            [s.coffee, "1", s.coffeePrice],
            [inactive, "1", ""],
            [noPrice, "1", ""],
          ]),
        ),
      ).toEqual({
        ok: false,
        code: "BUSINESS_RULE_VIOLATION",
        rule: "line_rules",
        lines: [
          { position: 2, productId: inactive, rule: "inactive_product" },
          { position: 3, productId: noPrice, rule: "no_price" },
        ],
      });
      expect(
        await createOrder(
          s.adminA,
          input(s.clientA, [
            [s.coffee, "1", s.coffeePrice],
            [s.tea, "1", s.teaPrice],
            [s.coffee.toUpperCase(), "2", s.coffeePrice],
          ]),
        ),
      ).toEqual({
        ok: false,
        code: "BUSINESS_RULE_VIOLATION",
        rule: "line_rules",
        lines: [
          { position: 3, productId: s.coffee, rule: "duplicate_product" },
        ],
      });
      expect(await count("orders")).toBe(0);
    },
    TEST_TIMEOUT,
  );

  it(
    "rechaza la línea con el precio en otra moneda que la primera",
    async () => {
      const s = await seed();
      const dollars = await insertProduct(s.orgA, "USD-1");
      const price = await insertPrice(s.orgA, dollars, s.adminAId, "5", "USD");
      expect(
        await createOrder(
          s.adminA,
          input(s.clientA, [
            [s.coffee, "1", s.coffeePrice],
            [dollars, "1", price],
          ]),
        ),
      ).toEqual({
        ok: false,
        code: "BUSINESS_RULE_VIOLATION",
        rule: "line_rules",
        lines: [{ position: 2, productId: dollars, rule: "currency_mismatch" }],
      });
      // Con el producto en dólares primero, la moneda del pedido es USD.
      const first = await createOrder(
        s.adminA,
        input(s.clientA, [[dollars, "2", price]]),
      );
      expect(first.ok).toBe(true);
      const order = await getDb().execute<{ currency: string; total: string }>(
        sql`select currency, total from orders`,
      );
      expect(order.rows[0]).toEqual({ currency: "USD", total: "10.00" });
    },
    TEST_TIMEOUT,
  );

  it(
    "rechaza una línea cuyo total redondeado es cero, y montos que no caben",
    async () => {
      const s = await seed();
      // 0,05 × 0,001 = 0,00005 → 0,00.
      expect(
        await createOrder(
          s.adminA,
          input(s.clientA, [[s.tea, "0,001", s.teaPrice]]),
        ),
      ).toEqual({
        ok: false,
        code: "BUSINESS_RULE_VIOLATION",
        rule: "line_rules",
        lines: [{ position: 1, productId: s.tea, rule: "zero_total" }],
      });
      const expensive = await insertProduct(s.orgA, "CARO-1");
      const expensivePrice = await insertPrice(
        s.orgA,
        expensive,
        s.adminAId,
        "999999999999.99",
      );
      expect(
        await createOrder(
          s.adminA,
          input(s.clientA, [[expensive, "2", expensivePrice]]),
        ),
      ).toEqual({
        ok: false,
        code: "BUSINESS_RULE_VIOLATION",
        rule: "line_rules",
        lines: [
          { position: 1, productId: expensive, rule: "amount_too_large" },
        ],
      });
      // Cada línea cabe, la suma no.
      expect(
        await createOrder(
          s.adminA,
          input(s.clientA, [
            [expensive, "1", expensivePrice],
            [s.coffee, "1", s.coffeePrice],
          ]),
        ),
      ).toEqual({
        ok: false,
        code: "BUSINESS_RULE_VIOLATION",
        rule: "total_too_large",
      });
      expect(await count("orders")).toBe(0);
      expect(await count("document_counters")).toBe(0);
    },
    TEST_TIMEOUT,
  );

  it(
    "si un precio esperado cambió, no crea nada y devuelve los precios nuevos (D-5)",
    async () => {
      const s = await seed();
      const changed = await setProductPrice(s.adminA, s.tea, {
        amount: "0.10",
        currency: "ARS",
        expectedPriceId: s.teaPrice,
      });
      if (!changed.ok || !changed.changed) throw new Error("sin precio nuevo");
      expect(await createOrder(s.adminA, twoLines(s))).toEqual({
        ok: false,
        code: "CONFLICT",
        prices: [
          {
            position: 2,
            productId: s.tea,
            lineTotal: null,
            price: {
              id: changed.price.id,
              amount: "0.10",
              currency: "ARS",
              createdAt: expect.any(Date),
            },
          },
        ],
      });
      expect(await count("orders")).toBe(0);
      expect(await count("document_counters")).toBe(0);
      // Con el precio nuevo como esperado, se crea.
      const retried = await createOrder(
        s.adminA,
        input(s.clientA, [
          [s.coffee, "3", s.coffeePrice],
          [s.tea, "0,5", changed.price.id],
        ]),
      );
      expect(retried.ok).toBe(true);
    },
    TEST_TIMEOUT,
  );

  it(
    "un rechazo dentro de la transacción no consume número",
    async () => {
      const s = await seed();
      expect((await createOrder(s.adminA, twoLines(s))).ok).toBe(true);
      await getDb().execute(
        sql`update products set is_active = false where id = ${s.tea}`,
      );
      expect((await createOrder(s.adminA, twoLines(s))).ok).toBe(false);
      await getDb().execute(
        sql`update products set is_active = true where id = ${s.tea}`,
      );
      const third = await createOrder(s.adminA, twoLines(s));
      expect(third.ok && third.order.number).toBe(2);
    },
    TEST_TIMEOUT,
  );
});

describe("createOrder: bloqueos (AC-5)", () => {
  it(
    "espera a una desactivación del cliente en curso y la respeta",
    async () => {
      const s = await seed();
      // La desactivación bloquea la ficha FOR UPDATE; el alta la espera en modo compartido y
      // después lee el cliente ya inactivo.
      const release = await hold(
        sql`update clients set is_active = false where id = ${s.clientA}`,
      );
      const pending = createOrder(s.adminA, twoLines(s));
      await waitForLockWaiters(1);
      await release();
      expect(await pending).toEqual({
        ok: false,
        code: "BUSINESS_RULE_VIOLATION",
        rule: "inactive_client",
      });
      expect(await count("orders")).toBe(0);
    },
    TEST_TIMEOUT,
  );

  // Revisión independiente de la 19.2, R-4: lo mismo con un producto.
  it(
    "espera a una desactivación del producto en curso y la respeta",
    async () => {
      const s = await seed();
      const release = await hold(
        sql`update products set is_active = false where id = ${s.tea}`,
      );
      const pending = createOrder(s.adminA, twoLines(s));
      await waitForLockWaiters(1);
      await release();
      expect(await pending).toEqual({
        ok: false,
        code: "BUSINESS_RULE_VIOLATION",
        rule: "line_rules",
        lines: [{ position: 2, productId: s.tea, rule: "inactive_product" }],
      });
      expect(await count("orders")).toBe(0);
    },
    TEST_TIMEOUT,
  );

  it(
    "un cambio de precio en curso termina antes de que el alta lea el precio",
    async () => {
      const s = await seed();
      // Un cambio de precio bloquea el producto FOR UPDATE; el alta lo espera en modo compartido
      // y después lee el precio nuevo: como el esperado es el viejo, devuelve CONFLICT.
      let release!: () => void;
      const released = new Promise<void>((resolve) => (release = resolve));
      let locked!: () => void;
      const lockTaken = new Promise<void>((resolve) => (locked = resolve));
      const priceChange = getDb().transaction(async (tx) => {
        await tx.execute(
          sql`select id from products where id = ${s.tea} for update`,
        );
        await tx.execute(
          sql`insert into product_prices (organization_id, product_id, amount, currency, created_by)
              values (${s.orgA}, ${s.tea}, '0.10', 'ARS', ${s.adminAId})`,
        );
        locked();
        await released;
      });
      await lockTaken;
      const pending = createOrder(s.adminA, twoLines(s));
      await waitForLockWaiters(1);
      release();
      await priceChange;
      expect(await pending).toMatchObject({ ok: false, code: "CONFLICT" });
    },
    TEST_TIMEOUT,
  );

  it(
    "dos altas con los mismos productos en otro orden y una edición simultánea terminan sin deadlock",
    async () => {
      const s = await seed();
      // Las altas bloquean los productos ordenados por id, sea cual sea el orden de las líneas.
      const [first, second] = await Promise.all([
        createOrder(s.adminA, twoLines(s)),
        createOrder(
          s.adminA,
          input(s.clientA, [
            [s.tea, "1", s.teaPrice],
            [s.coffee, "1", s.coffeePrice],
          ]),
        ),
        getDb().execute(
          sql`update products set name = 'Café nuevo' where id = ${s.coffee}`,
        ),
      ]);
      expect(first.ok && second.ok).toBe(true);
      const numbers = await getDb().execute<{ number: string }>(
        sql`select number from orders order by number`,
      );
      expect(numbers.rows.map((row) => row.number)).toEqual(["1", "2"]);
    },
    TEST_TIMEOUT,
  );

  it(
    "deactivateClient del servicio y un alta simultánea terminan coherentes",
    async () => {
      const s = await seed();
      const [created, deactivated] = await Promise.all([
        createOrder(s.adminA, twoLines(s)),
        deactivateClient(s.adminA, s.clientA),
      ]);
      expect(deactivated.ok).toBe(true);
      // O el alta entró antes y el pedido existe, o entró después y se rechazó.
      if (created.ok) {
        expect(await count("orders")).toBe(1);
      } else {
        expect(created).toEqual({
          ok: false,
          code: "BUSINESS_RULE_VIOLATION",
          rule: "inactive_client",
        });
        expect(await count("orders")).toBe(0);
      }
    },
    TEST_TIMEOUT,
  );
});

describe("cancelOrder (AC-6)", () => {
  it(
    "cancela un pendiente con su fecha y lo audita; un cancelado no cambia",
    async () => {
      const s = await seed();
      const created = await createOrder(s.adminA, twoLines(s));
      if (!created.ok) throw new Error(created.code);
      expect(await cancelOrder(s.adminA, created.order.id)).toEqual({
        ok: true,
        changed: true,
      });
      const row = await getDb().execute<{ status: string; dated: boolean }>(
        sql`select status, cancelled_at is not null as dated from orders`,
      );
      expect(row.rows[0]).toEqual({ status: "cancelled", dated: true });
      expect(await cancelOrder(s.adminA, created.order.id)).toEqual({
        ok: true,
        changed: false,
      });
      const audit = await orderAudit();
      expect(audit.map((entry) => entry.action)).toEqual([
        "create",
        "status_change",
      ]);
      expect(audit[1]!.diff).toEqual({
        before: { status: "pending" },
        after: { status: "cancelled" },
      });
    },
    TEST_TIMEOUT,
  );

  it(
    "solo un admin cancela; otra organización da NOT_FOUND",
    async () => {
      const s = await seed();
      const created = await createOrder(s.adminA, twoLines(s));
      if (!created.ok) throw new Error(created.code);
      expect(await cancelOrder(s.viewerA, created.order.id)).toEqual({
        ok: false,
        code: "FORBIDDEN",
      });
      expect(await cancelOrder(s.adminB, created.order.id)).toEqual({
        ok: false,
        code: "NOT_FOUND",
      });
      expect(await cancelOrder(s.adminA, "no-es-un-id")).toEqual({
        ok: false,
        code: "VALIDATION_ERROR",
      });
    },
    TEST_TIMEOUT,
  );

  it(
    "cancelar no depende del cliente ni de los productos activos",
    async () => {
      const s = await seed();
      const created = await createOrder(s.adminA, twoLines(s));
      if (!created.ok) throw new Error(created.code);
      await getDb().execute(
        sql`update clients set is_active = false where id = ${s.clientA}`,
      );
      await getDb().execute(
        sql`update products set is_active = false where id = ${s.coffee}`,
      );
      expect(await cancelOrder(s.adminA, created.order.id)).toEqual({
        ok: true,
        changed: true,
      });
    },
    TEST_TIMEOUT,
  );

  it(
    // Hasta la 19.2, un confirmado no se cancelaba; desde la 19.3 sí (orders-cycle.test.ts), y lo
    // que no se cancela es un entregado.
    "un pedido entregado no se cancela",
    async () => {
      const s = await seed();
      const created = await createOrder(s.adminA, twoLines(s));
      if (!created.ok) throw new Error(created.code);
      await getDb().execute(
        sql`update orders set status = 'confirmed', confirmed_at = now()`,
      );
      await getDb().execute(
        sql`update orders set status = 'delivered', delivered_at = now()`,
      );
      expect(await cancelOrder(s.adminA, created.order.id)).toEqual({
        ok: false,
        code: "BUSINESS_RULE_VIOLATION",
        rule: "invalid_transition",
        status: "delivered",
      });
    },
    TEST_TIMEOUT,
  );

  it(
    "dos cancelaciones simultáneas auditan una sola vez",
    async () => {
      const s = await seed();
      const created = await createOrder(s.adminA, twoLines(s));
      if (!created.ok) throw new Error(created.code);
      const results = await Promise.all([
        cancelOrder(s.adminA, created.order.id),
        cancelOrder(s.adminA, created.order.id),
      ]);
      expect(
        results.map((result) => result.ok && result.changed).sort(),
      ).toEqual([false, true]);
      const changes = (await orderAudit()).filter(
        (entry) => entry.action === "status_change",
      );
      expect(changes).toHaveLength(1);
    },
    TEST_TIMEOUT,
  );
});

describe("lecturas (AC-7)", () => {
  it(
    "lista de la más reciente a la más vieja, con filtros por estado, cliente y número",
    async () => {
      const s = await seed();
      const other = await insertClient(s.orgA, "Martín");
      const ids: string[] = [];
      for (const clientId of [s.clientA, other, s.clientA]) {
        const created = await createOrder(
          s.adminA,
          input(clientId, [[s.coffee, "1", s.coffeePrice]]),
        );
        if (!created.ok) throw new Error(created.code);
        ids.push(created.order.id);
      }
      await cancelOrder(s.adminA, ids[0]!);
      await createOrder(
        s.adminB,
        input(s.clientB, [[s.productB, "1", s.productBPrice]]),
      );

      const all = await listOrders(s.viewerA, {
        status: "all",
        clientId: null,
        number: "",
        page: 1,
      });
      if (!all.ok) throw new Error(all.code);
      expect(all.total).toBe(3);
      expect(all.orders.map((order) => order.displayNumber)).toEqual([
        "P-000003",
        "P-000002",
        "P-000001",
      ]);
      expect(all.orders[1]).toMatchObject({
        clientName: "Martín",
        lineCount: 1,
        total: "1234.50",
        currency: "ARS",
        status: "pending",
      });

      const cancelled = await listOrders(s.adminA, {
        status: "cancelled",
        clientId: null,
        number: "",
        page: 1,
      });
      expect(cancelled.ok && cancelled.orders.map((o) => o.id)).toEqual([
        ids[0],
      ]);
      const byClient = await listOrders(s.adminA, {
        status: "all",
        clientId: s.clientA,
        number: "",
        page: 1,
      });
      expect(byClient.ok && byClient.orders.map((o) => o.id)).toEqual([
        ids[2],
        ids[0],
      ]);
      for (const text of ["P-000002", "p000002", "000002", "2"]) {
        const byNumber = await listOrders(s.adminA, {
          status: "all",
          clientId: null,
          number: text,
          page: 1,
        });
        expect(byNumber.ok && byNumber.orders.map((o) => o.id), text).toEqual([
          ids[1],
        ]);
      }
      for (const [clientId, number] of [
        ["no-es-un-id", ""],
        [null, "P-ABC"],
        [null, "0"],
      ] as const) {
        const none = await listOrders(s.adminA, {
          status: "all",
          clientId,
          number,
          page: 1,
        });
        expect(none.ok && none.total).toBe(0);
      }
      const recent = await listRecentClientOrders(s.viewerA, s.clientA);
      expect(recent.ok && recent.total).toBe(2);
    },
    TEST_TIMEOUT,
  );

  it(
    "pagina de a 25 y lleva una página fuera de rango a la última",
    async () => {
      const s = await seed();
      for (let i = 0; i < 26; i++) {
        const created = await createOrder(
          s.adminA,
          input(s.clientA, [[s.coffee, "1", s.coffeePrice]]),
        );
        if (!created.ok) throw new Error(created.code);
      }
      const second = await listOrders(s.adminA, {
        status: "all",
        clientId: null,
        number: "",
        page: 9,
      });
      if (!second.ok) throw new Error(second.code);
      expect(second.page).toBe(2);
      expect(second.pageCount).toBe(2);
      expect(second.orders.map((order) => order.number)).toEqual([1]);
    },
    TEST_TIMEOUT * 2,
  );

  it(
    "el detalle trae las líneas con el nombre de hoy y el cliente según el rol",
    async () => {
      const s = await seed();
      const created = await createOrder(s.adminA, twoLines(s));
      if (!created.ok) throw new Error(created.code);
      await getDb().execute(
        sql`update products set name = 'Café renombrado' where id = ${s.coffee}`,
      );
      const asAdmin = await getOrder(s.adminA, created.order.id);
      if (!asAdmin.ok) throw new Error(asAdmin.code);
      expect(asAdmin.order).toMatchObject({
        displayNumber: "P-000001",
        status: "pending",
        total: "3703.53",
        lines: [
          {
            position: 1,
            product: { name: "Café renombrado", sku: "CAF-250" },
            quantity: "3.000",
            unitPrice: "1234.50",
            lineTotal: "3703.50",
          },
          { position: 2, product: { sku: "TE-100" }, lineTotal: "0.03" },
        ],
      });
      expect(asAdmin.order.client?.contact).toEqual({
        email: "lucia@example.com",
        addressLine: null,
        postalCode: null,
      });
      const asViewer = await getOrder(s.viewerA, created.order.id);
      if (!asViewer.ok) throw new Error(asViewer.code);
      expect(asViewer.order.client?.displayName).toBe("Lucía Gómez");
      expect(asViewer.order.client?.contact).toBeNull();
      expect(JSON.stringify(asViewer.order)).not.toContain("5491155550000");
      expect(await getOrder(s.adminB, created.order.id)).toEqual({
        ok: false,
        code: "NOT_FOUND",
      });
    },
    TEST_TIMEOUT,
  );

  it(
    "la historia del pedido es solo de admin",
    async () => {
      const s = await seed();
      const created = await createOrder(s.adminA, twoLines(s));
      if (!created.ok) throw new Error(created.code);
      await cancelOrder(s.adminA, created.order.id);
      expect(await listOrderAudit(s.viewerA, created.order.id, 1)).toEqual({
        ok: false,
        code: "FORBIDDEN",
      });
      const history = await listOrderAudit(s.adminA, created.order.id, 1);
      if (!history.ok) throw new Error(history.code);
      expect(
        history.entries.map((entry) => [entry.action, entry.actor]),
      ).toEqual([
        ["status_change", { kind: "user", id: s.adminAId, name: "Ana" }],
        ["create", { kind: "user", id: s.adminAId, name: "Ana" }],
      ]);
    },
    TEST_TIMEOUT,
  );
});

describe("auditoría del alta (AC-8)", () => {
  it(
    "el diff lleva ids, cantidades, montos y estado, y ningún dato del cliente",
    async () => {
      const s = await seed();
      const created = await createOrder(s.adminA, twoLines(s));
      if (!created.ok) throw new Error(created.code);
      const [entry] = await orderAudit();
      expect(entry).toEqual({
        entity_id: created.order.id,
        action: "create",
        diff: {
          before: null,
          after: {
            number: 1,
            status: "pending",
            client_id: s.clientA,
            currency: "ARS",
            total: "3703.53",
            lines: 2,
            line_1_product_id: s.coffee,
            line_1_quantity: "3.000",
            line_1_unit_price: "1234.50",
            line_1_total: "3703.50",
            line_2_product_id: s.tea,
            line_2_quantity: "0.500",
            line_2_unit_price: "0.05",
            line_2_total: "0.03",
          },
        },
      });
      const text = JSON.stringify(entry!.diff);
      for (const personal of ["Lucía", "Gómez", "5491155550000", "lucia@"]) {
        expect(text).not.toContain(personal);
      }
    },
    TEST_TIMEOUT,
  );
});

import { sql, type SQL } from "drizzle-orm";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { hashPassword, login } from "@/modules/auth";
import { adjustStock, getAvailableStock } from "@/modules/inventory";
import {
  cancelOrder,
  confirmOrder,
  createOrder,
  deliverOrder,
  type OrderInput,
} from "@/modules/orders";
import { getAuthContext, type AuthContext } from "@/modules/organizations";
import {
  getSale,
  getSaleForOrder,
  issueSale,
  issueSaleFromOrder,
  listSaleAudit,
  listSales,
  parseSaleNumberSearch,
  type SaleInput,
  type SaleListFilters,
} from "@/modules/sales";
import { getDb } from "@/shared/db";
import { resetDatabase } from "./reset-database";

// La venta de un pedido entregado contra PostgreSQL real (brief-20.2): la numeración (AC-2), la
// emisión (AC-3), la concurrencia (AC-4), las lecturas (AC-5) y la auditoría (AC-6). Los helpers
// son los de orders-cycle.test.ts. Desde la 20.3, la venta sin pedido (brief-20.3, AC-3 a AC-6),
// al final del archivo.

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

// Lucía lleva teléfono y email, para probar que un viewer no los recibe; las demás fichas, no.
async function insertClient(organizationId: string, name: string) {
  const contact = name === "Lucía Gómez";
  const result = await getDb().execute<{ id: string }>(
    sql`insert into clients (organization_id, display_name, phone_e164, email)
        values (${organizationId}, ${name}, ${contact ? "+5491155550000" : null},
                ${contact ? "lucia@example.com" : null})
        returning id`,
  );
  return result.rows[0]!.id;
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
  amount: string,
  createdBy: string,
) {
  const result = await getDb().execute<{ id: string }>(
    sql`insert into product_prices (organization_id, product_id, amount, currency, created_by)
        values (${organizationId}, ${productId}, ${amount}, ${"ARS"}, ${createdBy})
        returning id`,
  );
  return result.rows[0]!.id;
}

// A con admin, viewer, dos clientes y dos productos con precio y stock; B con su admin, su cliente
// y su producto.
async function seed() {
  const orgA = await createOrganization("Negocio A");
  const orgB = await createOrganization("Negocio B");
  const adminAId = await addUser(orgA, "admin-a@example.com", "Ana", "admin");
  await addUser(orgA, "viewer-a@example.com", "Vera", "viewer");
  const adminBId = await addUser(orgB, "admin-b@example.com", "Beto", "admin");
  const clientA = await insertClient(orgA, "Lucía Gómez");
  const clientA2 = await insertClient(orgA, "Mario Paz");
  const clientB = await insertClient(orgB, "Berta");
  const tv = await insertProduct(orgA, "TV-43");
  const fridge = await insertProduct(orgA, "HEL-370");
  const productB = await insertProduct(orgB, "TV-43");
  const s = {
    orgA,
    orgB,
    adminAId,
    clientA,
    clientA2,
    clientB,
    tv,
    fridge,
    productB,
    prices: new Map([
      [tv, await insertPrice(orgA, tv, "450000.00", adminAId)],
      [fridge, await insertPrice(orgA, fridge, "790000.00", adminAId)],
      [productB, await insertPrice(orgB, productB, "1000.00", adminBId)],
    ]),
    adminA: await contextFor("admin-a@example.com"),
    viewerA: await contextFor("viewer-a@example.com"),
    adminB: await contextFor("admin-b@example.com"),
  };
  await stock(s.adminA, tv, "20");
  await stock(s.adminA, fridge, "20");
  await stock(s.adminB, productB, "20");
  return s;
}

type Seed = Awaited<ReturnType<typeof seed>>;

async function stock(
  context: AuthContext,
  productId: string,
  quantity: string,
) {
  const result = await adjustStock(context, productId, {
    type: "adjustment_positive",
    quantity,
    expectedQuantityOnHand: "0",
    reason: "Carga inicial",
  });
  if (!result.ok) throw new Error(`ajuste rechazado: ${result.code}`);
}

async function order(
  s: Seed,
  lines: [productId: string, quantity: string][],
  { context = s.adminA, clientId = s.clientA } = {},
): Promise<string> {
  const input: OrderInput = {
    clientId,
    lines: lines.map(([productId, quantity]) => ({
      productId,
      quantity,
      expectedPriceId: s.prices.get(productId)!,
    })),
  };
  const created = await createOrder(context, input);
  if (!created.ok) throw new Error(`alta rechazada: ${created.code}`);
  return created.order.id;
}

async function delivered(
  s: Seed,
  lines: [productId: string, quantity: string][],
  options: { context?: AuthContext; clientId?: string } = {},
) {
  const context = options.context ?? s.adminA;
  const id = await order(s, lines, options);
  for (const step of [confirmOrder, deliverOrder]) {
    const result = await step(context, id);
    if (!result.ok) throw new Error(`transición rechazada: ${result.code}`);
  }
  return id;
}

async function issue(s: Seed, orderId: string, context = s.adminA) {
  const result = await issueSaleFromOrder(context, orderId);
  if (!result.ok) throw new Error(`emisión rechazada: ${result.code}`);
  return result.sale;
}

async function snapshot() {
  const result = await getDb().execute<{
    sales: number;
    sale_lines: number;
    sale_audit: number;
    sale_counter: number | null;
    movements: number;
    balances: string;
  }>(
    sql`select
          (select count(*)::int from sales) as sales,
          (select count(*)::int from sale_lines) as sale_lines,
          (select count(*)::int from audit_logs where entity_type = 'sale') as sale_audit,
          (select max(last_number)::int from document_counters where kind = 'sale') as sale_counter,
          (select count(*)::int from inventory_movements) as movements,
          (select string_agg(product_id || ':' || quantity_on_hand || ':' || quantity_reserved, ','
                             order by product_id)
           from inventories) as balances`,
  );
  return result.rows[0]!;
}

async function orderRow(id: string) {
  const result = await getDb().execute<{ status: string; updated_at: Date }>(
    sql`select status, updated_at from orders where id = ${id}`,
  );
  return result.rows[0]!;
}

// Bloqueos retenidos del test en curso, como en orders-cycle.test.ts.
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

const NO_FILTERS: SaleListFilters = {
  clientId: null,
  number: "",
  from: "",
  to: "",
  page: 1,
};

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

describe("la emisión desde un pedido entregado (AC-2 y AC-3)", () => {
  it(
    "copia el cliente, la moneda, las líneas en su orden y el total, sin tocar el stock ni el pedido",
    async () => {
      const s = await seed();
      const orderId = await delivered(s, [
        [s.fridge, "1"],
        [s.tv, "2"],
      ]);
      const before = await snapshot();
      const orderBefore = await orderRow(orderId);

      const result = await issueSaleFromOrder(s.adminA, orderId);
      expect(result).toMatchObject({
        ok: true,
        sale: { number: 1, displayNumber: "V-000001" },
      });

      const header = await getDb().execute<Record<string, unknown>>(
        sql`select number, order_id, client_id, currency, total, created_by from sales`,
      );
      // bigint llega como texto por SQL directo.
      expect(header.rows).toEqual([
        {
          number: "1",
          order_id: orderId,
          client_id: s.clientA,
          currency: "ARS",
          total: "1690000.00",
          created_by: s.adminAId,
        },
      ]);
      const lines = await getDb().execute<Record<string, unknown>>(
        sql`select position, product_id, quantity, unit_price, currency, line_total
            from sale_lines order by position`,
      );
      expect(lines.rows).toEqual([
        {
          position: 1,
          product_id: s.fridge,
          quantity: "1.000",
          unit_price: "790000.00",
          currency: "ARS",
          line_total: "790000.00",
        },
        {
          position: 2,
          product_id: s.tv,
          quantity: "2.000",
          unit_price: "450000.00",
          currency: "ARS",
          line_total: "900000.00",
        },
      ]);

      const after = await snapshot();
      expect(after.movements).toBe(before.movements);
      expect(after.balances).toBe(before.balances);
      expect(await orderRow(orderId)).toEqual(orderBefore);
    },
    TEST_TIMEOUT,
  );

  it(
    "la serie V es por organización e independiente de la serie P",
    async () => {
      const s = await seed();
      const first = await delivered(s, [[s.tv, "1"]]);
      const second = await delivered(s, [[s.tv, "1"]]);
      const third = await delivered(s, [[s.fridge, "1"]]);
      const inB = await delivered(s, [[s.productB, "1"]], {
        context: s.adminB,
        clientId: s.clientB,
      });
      // Los pedidos son P-000001 a P-000003 en A; las ventas empiezan en V-000001.
      expect((await issue(s, third)).displayNumber).toBe("V-000001");
      expect((await issue(s, first)).displayNumber).toBe("V-000002");
      expect((await issue(s, inB, s.adminB)).displayNumber).toBe("V-000001");
      expect((await issue(s, second)).displayNumber).toBe("V-000003");
    },
    TEST_TIMEOUT,
  );

  it(
    "no exige que el cliente ni los productos sigan activos, ni mira el precio de hoy",
    async () => {
      const s = await seed();
      const orderId = await delivered(s, [[s.tv, "1"]]);
      await getDb().execute(
        sql`update clients set is_active = false where id = ${s.clientA}`,
      );
      await getDb().execute(
        sql`update products set is_active = false where id = ${s.tv}`,
      );
      await insertPrice(s.orgA, s.tv, "999999.00", s.adminAId);

      expect((await issue(s, orderId)).displayNumber).toBe("V-000001");
      const total = await getDb().execute<{ total: string }>(
        sql`select total from sales`,
      );
      expect(total.rows[0]!.total).toBe("450000.00");
    },
    TEST_TIMEOUT,
  );

  it(
    "cada rechazo no escribe, no numera ni audita",
    async () => {
      const s = await seed();
      const pending = await order(s, [[s.tv, "1"]]);
      const confirmed = await order(s, [[s.tv, "1"]]);
      await confirmOrder(s.adminA, confirmed);
      const cancelled = await order(s, [[s.tv, "1"]]);
      await cancelOrder(s.adminA, cancelled);
      const done = await delivered(s, [[s.fridge, "1"]]);
      const inB = await delivered(s, [[s.productB, "1"]], {
        context: s.adminB,
        clientId: s.clientB,
      });
      const before = await snapshot();

      expect(await issueSaleFromOrder(s.viewerA, done)).toEqual({
        ok: false,
        code: "FORBIDDEN",
      });
      expect(await issueSaleFromOrder(s.adminA, inB)).toEqual({
        ok: false,
        code: "NOT_FOUND",
      });
      expect(
        await issueSaleFromOrder(
          s.adminA,
          "00000000-0000-4000-8000-000000000000",
        ),
      ).toEqual({ ok: false, code: "NOT_FOUND" });
      expect(await issueSaleFromOrder(s.adminA, "no-es-un-id")).toEqual({
        ok: false,
        code: "VALIDATION_ERROR",
      });
      for (const [id, status] of [
        [pending, "pending"],
        [confirmed, "confirmed"],
        [cancelled, "cancelled"],
      ] as const) {
        expect(await issueSaleFromOrder(s.adminA, id)).toEqual({
          ok: false,
          code: "BUSINESS_RULE_VIOLATION",
          rule: "order_not_delivered",
          status,
        });
      }
      expect(await snapshot()).toEqual(before);

      const sale = await issue(s, done);
      const afterFirst = await snapshot();
      expect(await issueSaleFromOrder(s.adminA, done)).toEqual({
        ok: false,
        code: "BUSINESS_RULE_VIOLATION",
        rule: "already_sold",
        sale: { id: sale.id, number: 1, displayNumber: "V-000001" },
      });
      expect(await snapshot()).toEqual(afterFirst);
    },
    TEST_TIMEOUT,
  );
});

describe("concurrencia (AC-4)", () => {
  it(
    "dos emisiones simultáneas del mismo pedido: una venta y un already_sold, sin número perdido",
    async () => {
      const s = await seed();
      const orderId = await delivered(s, [[s.tv, "1"]]);
      const results = await Promise.all([
        issueSaleFromOrder(s.adminA, orderId),
        issueSaleFromOrder(s.adminA, orderId),
      ]);
      expect(results.filter((result) => result.ok)).toHaveLength(1);
      expect(results.find((result) => !result.ok)).toMatchObject({
        code: "BUSINESS_RULE_VIOLATION",
        rule: "already_sold",
        sale: { number: 1 },
      });
      const after = await snapshot();
      expect(after).toMatchObject({ sales: 1, sale_audit: 1, sale_counter: 1 });
    },
    TEST_TIMEOUT,
  );

  it(
    "con la cabecera del pedido bloqueada, las dos emisiones esperan y después una sola emite",
    async () => {
      const s = await seed();
      const orderId = await delivered(s, [[s.tv, "1"]]);
      const release = await hold(
        sql`select 1 from orders where id = ${orderId} for update`,
      );
      const first = issueSaleFromOrder(s.adminA, orderId);
      const second = issueSaleFromOrder(s.adminA, orderId);
      await waitForLockWaiters(2);
      expect((await snapshot()).sales).toBe(0);
      await release();
      const results = await Promise.all([first, second]);
      expect(results.filter((result) => result.ok)).toHaveLength(1);
      expect(results.find((result) => !result.ok)).toMatchObject({
        rule: "already_sold",
      });
      expect((await snapshot()).sale_counter).toBe(1);
    },
    TEST_TIMEOUT,
  );

  it(
    "una emisión y una cancelación simultáneas del pedido entregado: emite, y la cancelación se rechaza",
    async () => {
      const s = await seed();
      const orderId = await delivered(s, [[s.tv, "1"]]);
      // Las dos esperan a la misma cabecera, así que se superponen de verdad (revisión
      // independiente, R-4).
      const release = await hold(
        sql`select 1 from orders where id = ${orderId} for update`,
      );
      const issuing = issueSaleFromOrder(s.adminA, orderId);
      const cancelling = cancelOrder(s.adminA, orderId);
      await waitForLockWaiters(2);
      await release();
      const [issued, cancelled] = await Promise.all([issuing, cancelling]);
      expect(issued.ok).toBe(true);
      expect(cancelled).toMatchObject({
        ok: false,
        code: "BUSINESS_RULE_VIOLATION",
        rule: "invalid_transition",
        status: "delivered",
      });
      expect((await orderRow(orderId)).status).toBe("delivered");
    },
    TEST_TIMEOUT,
  );

  it(
    "una emisión que espera la ficha del cliente no retiene el contador: la de otro cliente sigue",
    async () => {
      const s = await seed();
      const ofLucia = await delivered(s, [[s.tv, "1"]]);
      const ofMario = await delivered(s, [[s.fridge, "1"]], {
        clientId: s.clientA2,
      });
      // Como un vaciado en curso, que bloquea la ficha FOR UPDATE (revisión independiente, R-7).
      const release = await hold(
        sql`select 1 from clients where id = ${s.clientA} for update`,
      );
      const waiting = issueSaleFromOrder(s.adminA, ofLucia);
      await waitForLockWaiters(1);
      // Antes de la corrección, esta esperaba el contador que la primera ya había tomado.
      expect(await issueSaleFromOrder(s.adminA, ofMario)).toMatchObject({
        ok: true,
        sale: { displayNumber: "V-000001" },
      });
      await release();
      expect(await waiting).toMatchObject({
        ok: true,
        sale: { displayNumber: "V-000002" },
      });
    },
    TEST_TIMEOUT,
  );

  it(
    "si el índice único se dispara, la respuesta es already_sold y no se consume número",
    async () => {
      const s = await seed();
      // Una primera venta crea la fila del contador de sale, para poder retenerla.
      await issue(s, await delivered(s, [[s.fridge, "1"]]));
      const orderId = await delivered(s, [[s.tv, "1"]]);
      // Con el contador retenido, la emisión ya bloqueó el pedido y vio que no tenía venta, y
      // espera el número. Mientras tanto aparece una venta del pedido por un camino que no bloquea
      // la cabecera, y la emisión choca con el índice al insertar (revisión independiente, R-4).
      // Con las claves foráneas activas ese camino no existe: su chequeo pide FOR KEY SHARE sobre el
      // pedido, que la emisión tiene FOR UPDATE. Por eso el INSERT de la prueba las apaga, solo en
      // su transacción y con el rol dueño: el rescate del 23505 es una defensa de respaldo.
      const release = await hold(
        sql`select 1 from document_counters where kind = 'sale' for update`,
      );
      const issuing = issueSaleFromOrder(s.adminA, orderId);
      await waitForLockWaiters(1);
      await getDb().transaction(async (tx) => {
        await tx.execute(sql`set local session_replication_role = replica`);
        await tx.execute(
          sql`insert into sales (organization_id, number, order_id, client_id, currency, total,
                                 created_by)
              select organization_id, 99, id, client_id, currency, total, created_by
              from orders where id = ${orderId}`,
        );
      });
      await release();
      expect(await issuing).toMatchObject({
        ok: false,
        code: "BUSINESS_RULE_VIOLATION",
        rule: "already_sold",
        sale: { number: 99, displayNumber: "V-000099" },
      });
      // El contador sigue en 1: la emisión revertida no consumió el 2.
      expect((await snapshot()).sale_counter).toBe(1);
    },
    TEST_TIMEOUT,
  );
});

describe("lecturas (AC-5)", () => {
  it("el número se reconoce en sus cuatro formas", () => {
    for (const text of ["V-000123", "v000123", "000123", "123"]) {
      expect(parseSaleNumberSearch(text)).toBe(123);
    }
    for (const text of ["P-000123", "V-", "0", "abc", "V-1.5"]) {
      expect(parseSaleNumberSearch(text)).toBeNull();
    }
  });

  it(
    "la lista pagina, filtra por cliente, por número y por fecha, aislada por organización",
    async () => {
      const s = await seed();
      const ofLucia = await delivered(s, [[s.tv, "1"]]);
      const ofMario = await delivered(s, [[s.fridge, "2"]], {
        clientId: s.clientA2,
      });
      const inB = await delivered(s, [[s.productB, "1"]], {
        context: s.adminB,
        clientId: s.clientB,
      });
      await issue(s, ofLucia);
      await issue(s, ofMario);
      await issue(s, inB, s.adminB);

      const all = await listSales(s.adminA, NO_FILTERS);
      if (!all.ok) throw new Error(all.code);
      expect(all.total).toBe(2);
      // De la más reciente a la más vieja.
      expect(all.sales.map((sale) => sale.displayNumber)).toEqual([
        "V-000002",
        "V-000001",
      ]);
      expect(all.sales[0]).toMatchObject({
        orderId: ofMario,
        clientId: s.clientA2,
        clientName: "Mario Paz",
        lineCount: 1,
        total: "1580000.00",
        currency: "ARS",
      });

      const byClient = await listSales(s.viewerA, {
        ...NO_FILTERS,
        clientId: s.clientA,
      });
      expect(byClient).toMatchObject({ ok: true, total: 1 });

      for (const number of ["V-000001", "1"]) {
        const found = await listSales(s.adminA, { ...NO_FILTERS, number });
        if (!found.ok) throw new Error(found.code);
        expect(found.sales.map((sale) => sale.displayNumber)).toEqual([
          "V-000001",
        ]);
      }
      expect(
        await listSales(s.adminA, { ...NO_FILTERS, number: "P-000001" }),
      ).toMatchObject({ ok: true, total: 0 });
      expect(
        await listSales(s.adminA, { ...NO_FILTERS, clientId: "otro" }),
      ).toMatchObject({ ok: true, total: 0 });

      const today = await getDb().execute<{ today: string; tomorrow: string }>(
        sql`select to_char((now() at time zone timezone)::date, 'YYYY-MM-DD') as today,
                   to_char((now() at time zone timezone)::date + 1, 'YYYY-MM-DD') as tomorrow
            from organizations where id = ${s.orgA}`,
      );
      const { today: day, tomorrow } = today.rows[0]!;
      expect(
        await listSales(s.adminA, { ...NO_FILTERS, from: day, to: day }),
      ).toMatchObject({ ok: true, total: 2 });
      expect(
        await listSales(s.adminA, { ...NO_FILTERS, from: tomorrow }),
      ).toMatchObject({ ok: true, total: 0 });
      expect(
        await listSales(s.adminA, { ...NO_FILTERS, from: tomorrow, to: day }),
      ).toEqual({ ok: false, code: "VALIDATION_ERROR", fields: ["from"] });
      expect(
        await listSales(s.adminA, { ...NO_FILTERS, to: "2026-02-30" }),
      ).toEqual({ ok: false, code: "VALIDATION_ERROR", fields: ["to"] });

      // Una página fuera de rango vuelve a la última.
      expect(
        await listSales(s.adminA, { ...NO_FILTERS, page: 9 }),
      ).toMatchObject({ ok: true, page: 1, pageCount: 1 });
    },
    TEST_TIMEOUT,
  );

  it(
    "el detalle trae pedido, líneas con el nombre de hoy y cliente, sin contacto para un viewer",
    async () => {
      const s = await seed();
      const orderId = await delivered(s, [[s.tv, "2"]]);
      const sale = await issue(s, orderId);
      await getDb().execute(
        sql`update products set name = 'TV renombrado' where id = ${s.tv}`,
      );

      const asAdmin = await getSale(s.adminA, sale.id);
      if (!asAdmin.ok) throw new Error(asAdmin.code);
      expect(asAdmin.sale).toMatchObject({
        displayNumber: "V-000001",
        orderId,
        clientId: s.clientA,
        currency: "ARS",
        total: "900000.00",
        lines: [
          {
            position: 1,
            productId: s.tv,
            product: { name: "TV renombrado", sku: "TV-43", unit: "unidad" },
            quantity: "2.000",
            unitPrice: "450000.00",
            lineTotal: "900000.00",
          },
        ],
      });
      expect(asAdmin.sale.client?.contact?.email).toBe("lucia@example.com");

      const asViewer = await getSale(s.viewerA, sale.id);
      if (!asViewer.ok) throw new Error(asViewer.code);
      expect(asViewer.sale.client?.displayName).toBe("Lucía Gómez");
      expect(asViewer.sale.client?.contact).toBeNull();
      expect(JSON.stringify(asViewer.sale)).not.toContain("5491155550000");
      expect(JSON.stringify(asViewer.sale)).not.toContain("lucia@example.com");

      expect(await getSale(s.adminB, sale.id)).toEqual({
        ok: false,
        code: "NOT_FOUND",
      });
      expect(await getSale(s.adminA, "no-es-un-id")).toEqual({
        ok: false,
        code: "VALIDATION_ERROR",
      });
    },
    TEST_TIMEOUT,
  );

  it(
    "la venta de un pedido, o nada, aislada por organización",
    async () => {
      const s = await seed();
      const sold = await delivered(s, [[s.tv, "1"]]);
      const unsold = await delivered(s, [[s.fridge, "1"]]);
      const sale = await issue(s, sold);
      expect(await getSaleForOrder(s.viewerA, sold)).toEqual({
        ok: true,
        sale: { id: sale.id, displayNumber: "V-000001" },
      });
      expect(await getSaleForOrder(s.adminA, unsold)).toEqual({
        ok: true,
        sale: null,
      });
      expect(await getSaleForOrder(s.adminB, sold)).toEqual({
        ok: true,
        sale: null,
      });
    },
    TEST_TIMEOUT,
  );

  it(
    "la historia de la venta es solo de admin",
    async () => {
      const s = await seed();
      const sale = await issue(s, await delivered(s, [[s.tv, "1"]]));
      expect(await listSaleAudit(s.viewerA, sale.id, 1)).toEqual({
        ok: false,
        code: "FORBIDDEN",
      });
      expect(await listSaleAudit(s.adminB, sale.id, 1)).toEqual({
        ok: false,
        code: "NOT_FOUND",
      });
      const audit = await listSaleAudit(s.adminA, sale.id, 1);
      if (!audit.ok) throw new Error(audit.code);
      expect(audit.entries).toHaveLength(1);
      expect(audit.entries[0]).toMatchObject({
        action: "create",
        actor: { kind: "user", name: "Ana" },
      });
    },
    TEST_TIMEOUT,
  );
});

describe("auditoría (AC-6)", () => {
  it(
    "el diff lleva ids, cantidades y montos, y ningún dato del cliente",
    async () => {
      const s = await seed();
      const orderId = await delivered(s, [
        [s.fridge, "1"],
        [s.tv, "2"],
      ]);
      const sale = await issue(s, orderId);
      const result = await getDb().execute<{
        entity_id: string;
        actor_user_id: string;
        diff: unknown;
      }>(
        sql`select entity_id, actor_user_id, diff from audit_logs
            where entity_type = 'sale' and action = 'create'`,
      );
      expect(result.rows).toHaveLength(1);
      const entry = result.rows[0]!;
      expect(entry.entity_id).toBe(sale.id);
      expect(entry.actor_user_id).toBe(s.adminAId);
      expect(entry.diff).toEqual({
        before: null,
        after: {
          number: 1,
          order_id: orderId,
          client_id: s.clientA,
          currency: "ARS",
          total: "1690000.00",
          lines: 2,
          line_1_product_id: s.fridge,
          line_1_quantity: "1.000",
          line_1_unit_price: "790000.00",
          line_1_total: "790000.00",
          line_2_product_id: s.tv,
          line_2_quantity: "2.000",
          line_2_unit_price: "450000.00",
          line_2_total: "900000.00",
        },
      });
      const text = JSON.stringify(entry.diff);
      for (const personal of [
        "Lucía",
        "Gómez",
        "5491155550000",
        "lucia@example.com",
      ]) {
        expect(text).not.toContain(personal);
      }
    },
    TEST_TIMEOUT,
  );
});

// La venta sin pedido (brief-20.3). Cada línea lleva el precio vigente de seed como esperado.

function saleInput(
  s: Seed,
  lines: [productId: string, quantity: string][],
  clientId = "",
): SaleInput {
  return {
    clientId,
    lines: lines.map(([productId, quantity]) => ({
      productId,
      quantity,
      expectedPriceId: s.prices.get(productId) ?? "",
    })),
  };
}

async function balance(productId: string) {
  const result = await getDb().execute<{ on_hand: string; reserved: string }>(
    sql`select quantity_on_hand as on_hand, quantity_reserved as reserved
        from inventories where product_id = ${productId}`,
  );
  return result.rows[0] ?? null;
}

async function saleMovements() {
  const result = await getDb().execute<Record<string, unknown>>(
    sql`select product_id, type, quantity, balance_after, reason, created_by
        from inventory_movements where type = 'sale' order by created_at, product_id`,
  );
  return result.rows;
}

describe("la venta sin pedido (brief-20.3, AC-3)", () => {
  it(
    "sin cliente: precio vigente, totales redondeados, un movimiento sale por línea y lo reservado igual",
    async () => {
      const s = await seed();
      // Lo reservado no cambia: un pedido confirmado reserva 3 televisores.
      const reserved = await order(s, [[s.tv, "3"]]);
      expect((await confirmOrder(s.adminA, reserved)).ok).toBe(true);

      const result = await issueSale(
        s.adminA,
        saleInput(s, [
          [s.fridge, "1"],
          [s.tv, "2,5"],
        ]),
      );
      expect(result).toMatchObject({
        ok: true,
        sale: { number: 1, displayNumber: "V-000001" },
      });
      const header = await getDb().execute<Record<string, unknown>>(
        sql`select number, order_id, client_id, currency, total, created_by from sales`,
      );
      expect(header.rows).toEqual([
        {
          number: "1",
          order_id: null,
          client_id: null,
          currency: "ARS",
          total: "1915000.00",
          created_by: s.adminAId,
        },
      ]);
      const lines = await getDb().execute<Record<string, unknown>>(
        sql`select position, product_id, quantity, unit_price, currency, line_total
            from sale_lines order by position`,
      );
      expect(lines.rows).toEqual([
        {
          position: 1,
          product_id: s.fridge,
          quantity: "1.000",
          unit_price: "790000.00",
          currency: "ARS",
          line_total: "790000.00",
        },
        {
          position: 2,
          product_id: s.tv,
          quantity: "2.500",
          unit_price: "450000.00",
          currency: "ARS",
          line_total: "1125000.00",
        },
      ]);
      expect(
        [...(await saleMovements())].sort((a, b) =>
          String(a.product_id).localeCompare(String(b.product_id)),
        ),
      ).toEqual(
        [
          {
            product_id: s.fridge,
            type: "sale",
            quantity: "1.000",
            balance_after: "19.000",
            reason: "Venta V-000001",
            created_by: s.adminAId,
          },
          {
            product_id: s.tv,
            type: "sale",
            quantity: "2.500",
            balance_after: "17.500",
            reason: "Venta V-000001",
            created_by: s.adminAId,
          },
        ].sort((a, b) => a.product_id.localeCompare(b.product_id)),
      );
      expect(await balance(s.tv)).toEqual({
        on_hand: "17.500",
        reserved: "3.000",
      });
      expect(await balance(s.fridge)).toEqual({
        on_hand: "19.000",
        reserved: "0.000",
      });
      // Lo disponible de inventory refleja la venta sin cambiar su cálculo (AC-5).
      const available = await getAvailableStock(s.adminA, [s.tv]);
      expect(available.ok && available.available.get(s.tv)).toBe("14.500");

      // La auditoría de D-8: el mismo diff, con order_id y client_id nulos.
      const audit = await getDb().execute<{ diff: Record<string, unknown> }>(
        sql`select diff from audit_logs where entity_type = 'sale'`,
      );
      expect(audit.rows).toHaveLength(1);
      expect(audit.rows[0]!.diff).toEqual({
        before: null,
        after: {
          number: 1,
          order_id: null,
          client_id: null,
          currency: "ARS",
          total: "1915000.00",
          lines: 2,
          line_1_product_id: s.fridge,
          line_1_quantity: "1.000",
          line_1_unit_price: "790000.00",
          line_1_total: "790000.00",
          line_2_product_id: s.tv,
          line_2_quantity: "2.500",
          line_2_unit_price: "450000.00",
          line_2_total: "1125000.00",
        },
      });
    },
    TEST_TIMEOUT,
  );

  it(
    "con cliente, y en la misma serie que la venta de un pedido",
    async () => {
      const s = await seed();
      await issue(s, await delivered(s, [[s.fridge, "1"]]));
      const result = await issueSale(
        s.adminA,
        saleInput(s, [[s.tv, "1"]], ` ${s.clientA2.toUpperCase()} `),
      );
      expect(result).toMatchObject({
        ok: true,
        sale: { number: 2, displayNumber: "V-000002" },
      });
      const header = await getDb().execute<Record<string, unknown>>(
        sql`select order_id, client_id from sales where number = 2`,
      );
      expect(header.rows).toEqual([{ order_id: null, client_id: s.clientA2 }]);
      const audit = await getDb().execute<{ client_id: string }>(
        sql`select diff->'after'->>'client_id' as client_id from audit_logs
            where entity_type = 'sale' and diff->'after'->>'number' = '2'`,
      );
      expect(audit.rows).toEqual([{ client_id: s.clientA2 }]);
    },
    TEST_TIMEOUT,
  );

  it(
    "cada rechazo no escribe, no numera, no mueve stock ni audita",
    async () => {
      const s = await seed();
      await getDb().execute(
        sql`update clients set is_active = false where id = ${s.clientA2}`,
      );
      const inactive = await insertProduct(s.orgA, "INACTIVO");
      await insertPrice(s.orgA, inactive, "10.00", s.adminAId);
      await getDb().execute(
        sql`update products set is_active = false where id = ${inactive}`,
      );
      const noPrice = await insertProduct(s.orgA, "SIN-PRECIO");
      const before = await snapshot();

      const cases: [SaleInput, AuthContext, unknown][] = [
        [
          saleInput(s, [[s.tv, "1"]]),
          s.viewerA,
          { ok: false, code: "FORBIDDEN" },
        ],
        [
          saleInput(s, [[s.tv, "1"]], "no-es-un-id"),
          s.adminA,
          { ok: false, code: "VALIDATION_ERROR", reason: "client", lines: [] },
        ],
        [
          saleInput(s, []),
          s.adminA,
          {
            ok: false,
            code: "VALIDATION_ERROR",
            reason: "no_lines",
            lines: [],
          },
        ],
        [
          saleInput(s, [
            [s.tv, "0"],
            ["x", "1"],
          ]),
          s.adminA,
          {
            ok: false,
            code: "VALIDATION_ERROR",
            reason: "lines",
            lines: [
              { position: 1, field: "quantity" },
              { position: 2, field: "product" },
            ],
          },
        ],
        [
          saleInput(s, [[s.tv, "1"]], s.clientB),
          s.adminA,
          { ok: false, code: "NOT_FOUND", target: "client" },
        ],
        [
          saleInput(s, [[s.tv, "1"]], s.clientA2),
          s.adminA,
          {
            ok: false,
            code: "BUSINESS_RULE_VIOLATION",
            rule: "inactive_client",
          },
        ],
        [
          saleInput(s, [
            [s.tv, "1"],
            [s.productB, "1"],
          ]),
          s.adminA,
          {
            ok: false,
            code: "NOT_FOUND",
            target: "products",
            lines: [{ position: 2, productId: s.productB }],
          },
        ],
        [
          saleInput(s, [
            [s.tv, "1"],
            [s.tv, "2"],
          ]),
          s.adminA,
          {
            ok: false,
            code: "BUSINESS_RULE_VIOLATION",
            rule: "line_rules",
            lines: [
              { position: 2, productId: s.tv, rule: "duplicate_product" },
            ],
          },
        ],
        [
          saleInput(s, [
            [inactive, "1"],
            [noPrice, "1"],
          ]),
          s.adminA,
          {
            ok: false,
            code: "BUSINESS_RULE_VIOLATION",
            rule: "line_rules",
            lines: [
              { position: 1, productId: inactive, rule: "inactive_product" },
              { position: 2, productId: noPrice, rule: "no_price" },
            ],
          },
        ],
        // Más que lo disponible en la segunda línea: no se descuenta la primera.
        [
          saleInput(s, [
            [s.fridge, "1"],
            [s.tv, "20,5"],
          ]),
          s.adminA,
          {
            ok: false,
            code: "BUSINESS_RULE_VIOLATION",
            rule: "insufficient_stock",
            lines: [
              {
                position: 2,
                productId: s.tv,
                requested: "20.500",
                available: "20.000",
              },
            ],
          },
        ],
      ];
      for (const [input, context, expected] of cases) {
        expect(await issueSale(context, input)).toEqual(expected);
      }
      expect(await snapshot()).toEqual(before);

      // El precio que vio quien vende cambió (D-4): CONFLICT con el vigente.
      const newPrice = await insertPrice(s.orgA, s.tv, "460000.00", s.adminAId);
      const beforeConflict = await snapshot();
      expect(await issueSale(s.adminA, saleInput(s, [[s.tv, "1"]]))).toEqual({
        ok: false,
        code: "CONFLICT",
        prices: [
          {
            position: 1,
            productId: s.tv,
            price: expect.objectContaining({
              id: newPrice,
              amount: "460000.00",
              currency: "ARS",
            }),
          },
        ],
      });
      expect(await snapshot()).toEqual(beforeConflict);

      // Ningún rechazo consumió número.
      s.prices.set(s.tv, newPrice);
      expect(
        await issueSale(s.adminA, saleInput(s, [[s.tv, "1"]])),
      ).toMatchObject({
        ok: true,
        sale: { displayNumber: "V-000001" },
      });
    },
    TEST_TIMEOUT,
  );

  it(
    "vende justo lo disponible con unidades reservadas, y una unidad más se rechaza",
    async () => {
      const s = await seed();
      const reserved = await order(s, [[s.tv, "15"]]);
      expect((await confirmOrder(s.adminA, reserved)).ok).toBe(true);
      expect(
        await issueSale(s.adminA, saleInput(s, [[s.tv, "5"]])),
      ).toMatchObject({
        ok: true,
      });
      expect(await balance(s.tv)).toEqual({
        on_hand: "15.000",
        reserved: "15.000",
      });
      expect(
        await issueSale(s.adminA, saleInput(s, [[s.tv, "0,001"]])),
      ).toEqual({
        ok: false,
        code: "BUSINESS_RULE_VIOLATION",
        rule: "insufficient_stock",
        lines: [
          {
            position: 1,
            productId: s.tv,
            requested: "0.001",
            available: "0.000",
          },
        ],
      });
      expect(await balance(s.tv)).toEqual({
        on_hand: "15.000",
        reserved: "15.000",
      });
      // El pedido confirmado se sigue entregando: lo reservado estaba intacto.
      expect((await deliverOrder(s.adminA, reserved)).ok).toBe(true);
    },
    TEST_TIMEOUT,
  );

  it(
    "un producto sin saldo se rechaza, y la fila en 0 que crea el bloqueo se revierte",
    async () => {
      const s = await seed();
      const fresh = await insertProduct(s.orgA, "NUEVO");
      s.prices.set(
        fresh,
        await insertPrice(s.orgA, fresh, "10.00", s.adminAId),
      );
      expect(await issueSale(s.adminA, saleInput(s, [[fresh, "1"]]))).toEqual({
        ok: false,
        code: "BUSINESS_RULE_VIOLATION",
        rule: "insufficient_stock",
        lines: [
          {
            position: 1,
            productId: fresh,
            requested: "1.000",
            available: "0.000",
          },
        ],
      });
      expect(await balance(fresh)).toBeNull();
    },
    TEST_TIMEOUT,
  );
});

describe("la venta sin pedido: concurrencia (brief-20.3, AC-4)", () => {
  it(
    "con el saldo retenido, dos ventas que juntas piden más que lo disponible: una se emite y la otra no",
    async () => {
      const s = await seed();
      const movementsBefore = (await snapshot()).movements;
      const release = await hold(
        sql`select 1 from inventories where product_id = ${s.tv} for update`,
      );
      const first = issueSale(s.adminA, saleInput(s, [[s.tv, "12"]]));
      const second = issueSale(s.adminA, saleInput(s, [[s.tv, "12"]]));
      await waitForLockWaiters(2);
      await release();
      const results = await Promise.all([first, second]);
      expect(results.filter((result) => result.ok)).toHaveLength(1);
      expect(results.filter((result) => !result.ok)).toEqual([
        {
          ok: false,
          code: "BUSINESS_RULE_VIOLATION",
          rule: "insufficient_stock",
          lines: [
            {
              position: 1,
              productId: s.tv,
              requested: "12.000",
              available: "8.000",
            },
          ],
        },
      ]);
      expect(await balance(s.tv)).toEqual({
        on_hand: "8.000",
        reserved: "0.000",
      });
      const after = await snapshot();
      expect(after.movements).toBe(movementsBefore + 1);
      expect(after.sales).toBe(1);
      expect(after.sale_counter).toBe(1);
    },
    TEST_TIMEOUT,
  );

  it(
    "una venta y la confirmación de un pedido sobre el mismo producto se serializan",
    async () => {
      const s = await seed();
      const pending = await order(s, [[s.tv, "15"]]);
      const release = await hold(
        sql`select 1 from inventories where product_id = ${s.tv} for update`,
      );
      const confirming = confirmOrder(s.adminA, pending);
      const selling = issueSale(s.adminA, saleInput(s, [[s.tv, "10"]]));
      await waitForLockWaiters(2);
      await release();
      const [confirmed, sold] = await Promise.all([confirming, selling]);
      // Las dos juntas pedirían 25 de 20: entra la que toma el saldo primero.
      expect([confirmed.ok, sold.ok].filter(Boolean)).toHaveLength(1);
      expect(await balance(s.tv)).toEqual(
        sold.ok
          ? { on_hand: "10.000", reserved: "0.000" }
          : { on_hand: "20.000", reserved: "15.000" },
      );
    },
    TEST_TIMEOUT,
  );

  it(
    "una venta con el cliente retenido no retiene el contador (R-7 de la 20.2)",
    async () => {
      const s = await seed();
      // Como un vaciado en curso, que bloquea la ficha FOR UPDATE.
      const release = await hold(
        sql`select 1 from clients where id = ${s.clientA} for update`,
      );
      const waiting = issueSale(
        s.adminA,
        saleInput(s, [[s.tv, "1"]], s.clientA),
      );
      await waitForLockWaiters(1);
      expect(
        await issueSale(s.adminA, saleInput(s, [[s.fridge, "1"]])),
      ).toMatchObject({
        ok: true,
        sale: { displayNumber: "V-000001" },
      });
      await release();
      expect(await waiting).toMatchObject({
        ok: true,
        sale: { displayNumber: "V-000002" },
      });
    },
    TEST_TIMEOUT,
  );
});

describe("la venta sin pedido: lecturas (brief-20.3, AC-6)", () => {
  it(
    "la lista y el detalle la muestran sin cliente y sin pedido; el filtro por cliente la excluye",
    async () => {
      const s = await seed();
      const withOrder = await issue(s, await delivered(s, [[s.fridge, "1"]]));
      const counter = await issueSale(s.adminA, saleInput(s, [[s.tv, "1"]]));
      const toClient = await issueSale(
        s.adminA,
        saleInput(s, [[s.tv, "1"]], s.clientA),
      );
      if (!counter.ok || !toClient.ok) throw new Error("emisión rechazada");

      for (const context of [s.adminA, s.viewerA]) {
        const page = await listSales(context, NO_FILTERS);
        expect(page.ok && page.sales.map((sale) => sale.displayNumber)).toEqual(
          ["V-000003", "V-000002", "V-000001"],
        );
        expect(page.ok && page.sales[1]).toMatchObject({
          orderId: null,
          clientId: null,
          clientName: null,
          lineCount: 1,
          total: "450000.00",
        });
        expect(page.ok && page.sales[0]).toMatchObject({
          orderId: null,
          clientId: s.clientA,
          clientName: "Lucía Gómez",
        });
      }
      const ofLucia = await listSales(s.adminA, {
        ...NO_FILTERS,
        clientId: s.clientA,
      });
      expect(ofLucia.ok && ofLucia.sales.map((sale) => sale.id)).toEqual([
        toClient.sale.id,
        withOrder.id,
      ]);

      const detail = await getSale(s.viewerA, counter.sale.id);
      expect(detail).toMatchObject({
        ok: true,
        sale: {
          orderId: null,
          clientId: null,
          client: null,
          total: "450000.00",
          lines: [{ position: 1, productId: s.tv, quantity: "1.000" }],
        },
      });
      // Un viewer ve la venta con cliente sin su contacto, como en la 20.2.
      const withClient = await getSale(s.viewerA, toClient.sale.id);
      expect(withClient.ok && withClient.sale.client?.contact).toBeNull();
    },
    TEST_TIMEOUT,
  );
});

// Revisión independiente de la 20.3, R-5: los rechazos de las reglas de línea que solo probaba el
// unitario de src/shared/lines, ahora por issueSale.
describe("la venta sin pedido: más rechazos de D-9 (brief-20.3, AC-3)", () => {
  it(
    "too_many_lines, currency_mismatch y total_too_large, sin escribir ni numerar",
    async () => {
      const s = await seed();
      const dollars = await insertProduct(s.orgA, "USD-1");
      await getDb().execute(
        sql`insert into product_prices (organization_id, product_id, amount, currency, created_by)
            values (${s.orgA}, ${dollars}, '10.00', 'USD', ${s.adminAId})`,
      );
      const usdPrice = await getDb().execute<{ id: string }>(
        sql`select id from product_prices where product_id = ${dollars}`,
      );
      s.prices.set(dollars, usdPrice.rows[0]!.id);
      // Dos productos con el precio máximo: cada línea cabe, la suma no.
      const big1 = await insertProduct(s.orgA, "MAX-1");
      const big2 = await insertProduct(s.orgA, "MAX-2");
      s.prices.set(
        big1,
        await insertPrice(s.orgA, big1, "999999999999.99", s.adminAId),
      );
      s.prices.set(
        big2,
        await insertPrice(s.orgA, big2, "999999999999.99", s.adminAId),
      );
      const before = await snapshot();

      expect(
        await issueSale(s.adminA, {
          clientId: "",
          lines: Array.from({ length: 51 }, () => ({
            productId: s.tv,
            quantity: "1",
            expectedPriceId: s.prices.get(s.tv)!,
          })),
        }),
      ).toEqual({
        ok: false,
        code: "VALIDATION_ERROR",
        reason: "too_many_lines",
        lines: [],
      });
      expect(
        await issueSale(
          s.adminA,
          saleInput(s, [
            [s.tv, "1"],
            [dollars, "1"],
          ]),
        ),
      ).toEqual({
        ok: false,
        code: "BUSINESS_RULE_VIOLATION",
        rule: "line_rules",
        lines: [{ position: 2, productId: dollars, rule: "currency_mismatch" }],
      });
      expect(
        await issueSale(
          s.adminA,
          saleInput(s, [
            [big1, "1"],
            [big2, "1"],
          ]),
        ),
      ).toEqual({
        ok: false,
        code: "BUSINESS_RULE_VIOLATION",
        rule: "total_too_large",
      });
      expect(await snapshot()).toEqual(before);
    },
    TEST_TIMEOUT,
  );
});

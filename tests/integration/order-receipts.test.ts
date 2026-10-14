import { sql, type SQL } from "drizzle-orm";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { hashPassword, login } from "@/modules/auth";
import {
  closeCashSession,
  createInitialPaymentMethods,
  createOrderReceipt,
  createSaleReceipt,
  deactivatePaymentMethod,
  getCashState,
  getOrderReceiptForm,
  getOrderReceipts,
  getReceipt,
  getSaleReceipts,
  listPaymentMethods,
  listReceipts,
  openCashSession,
  type CashAmountInput,
} from "@/modules/cash";
import { adjustStock } from "@/modules/inventory";
import {
  cancelOrder,
  confirmOrder,
  createOrder,
  deliverOrder,
} from "@/modules/orders";
import { getAuthContext, type AuthContext } from "@/modules/organizations";
import { issueSale, issueSaleFromOrder, voidSale } from "@/modules/sales";
import { getDb } from "@/shared/db";
import { resetDatabase } from "./reset-database";

// La seña contra PostgreSQL real (brief-21.4): la seña (AC-2), la seña en la cuenta del cliente, un
// caso por estado del pedido (AC-3), los rechazos (AC-4), la serialización (AC-5) y las lecturas
// (AC-6). Los helpers son los de receipts.test.ts y sales.test.ts. Un producto de precio 1000 por
// unidad: un pedido o una venta de n unidades suma n × 1000.

const PASSWORD = "contraseña-correcta-larga";
const TEST_TIMEOUT = 30000;
let storedHash: string;

async function returningId(query: SQL): Promise<string> {
  const result = await getDb().execute<{ id: string }>(query);
  return result.rows[0]!.id;
}

async function addUser(
  organizationId: string,
  email: string,
  name: string,
  role: "admin" | "viewer",
) {
  const userId = await returningId(
    sql`insert into users (email, password_hash, name)
        values (${email}, ${storedHash}, ${name}) returning id`,
  );
  await getDb().execute(
    sql`insert into organization_members (organization_id, user_id, role)
        values (${organizationId}, ${userId}, ${role})`,
  );
  return userId;
}

async function contextFor(email: string): Promise<AuthContext> {
  const logged = await login({ email, password: PASSWORD, ip: null });
  if (!logged.ok) throw new Error(`login rechazado: ${logged.code}`);
  const result = await getAuthContext(logged.token);
  if (!result.ok) throw new Error(`contexto rechazado: ${result.code}`);
  return result.context;
}

type Product = { productId: string; priceId: string };

async function insertProduct(
  organizationId: string,
  sku: string,
  createdBy: string,
): Promise<Product> {
  const productId = await returningId(
    sql`insert into products (organization_id, sku, name)
        values (${organizationId}, ${sku}, ${`Producto ${sku}`}) returning id`,
  );
  const priceId = await returningId(
    sql`insert into product_prices (organization_id, product_id, amount, currency, created_by)
        values (${organizationId}, ${productId}, '1000.00', 'ARS', ${createdBy})
        returning id`,
  );
  return { productId, priceId };
}

async function stock(context: AuthContext, productId: string) {
  const result = await adjustStock(context, productId, {
    type: "adjustment_positive",
    quantity: "1000",
    expectedQuantityOnHand: "0",
    reason: "Carga inicial",
  });
  if (!result.ok) throw new Error(`ajuste rechazado: ${result.code}`);
}

async function methodIds(context: AuthContext) {
  const created = await createInitialPaymentMethods(context);
  if (!created.ok) throw new Error("lista inicial rechazada");
  const listed = await listPaymentMethods(context);
  if (!listed.ok) throw new Error("lista rechazada");
  const idOf = (name: string) =>
    listed.paymentMethods.find((method) => method.name === name)!.id;
  return {
    cash: idOf("Efectivo"),
    transfer: idOf("Transferencia"),
    debit: idOf("Tarjeta de débito"),
  };
}

// A con admin, viewer, dos clientes, un producto en pesos y la lista inicial de medios; B con su
// admin, su cliente, su producto y sus medios.
async function seed() {
  const orgA = await returningId(
    sql`insert into organizations (name) values ('Negocio A') returning id`,
  );
  const orgB = await returningId(
    sql`insert into organizations (name) values ('Negocio B') returning id`,
  );
  const adminAId = await addUser(orgA, "admin-a@example.com", "Ana", "admin");
  await addUser(orgA, "viewer-a@example.com", "Vera", "viewer");
  const adminBId = await addUser(orgB, "admin-b@example.com", "Beto", "admin");
  const clientA = await returningId(
    sql`insert into clients (organization_id, display_name, phone_e164, email)
        values (${orgA}, 'Lucía Gómez', '+5491155550000', 'lucia@example.com')
        returning id`,
  );
  const clientA2 = await returningId(
    sql`insert into clients (organization_id, display_name)
        values (${orgA}, 'Mario Paz') returning id`,
  );
  const clientB = await returningId(
    sql`insert into clients (organization_id, display_name)
        values (${orgB}, 'Berta') returning id`,
  );
  const pesos = await insertProduct(orgA, "P-1", adminAId);
  const productB = await insertProduct(orgB, "P-1", adminBId);
  const s = {
    orgA,
    orgB,
    clientA,
    clientA2,
    clientB,
    pesos,
    productB,
    adminA: await contextFor("admin-a@example.com"),
    viewerA: await contextFor("viewer-a@example.com"),
    adminB: await contextFor("admin-b@example.com"),
  };
  await stock(s.adminA, pesos.productId);
  await stock(s.adminB, productB.productId);
  return {
    ...s,
    methods: await methodIds(s.adminA),
    methodsB: await methodIds(s.adminB),
  };
}

// Un pedido pendiente de n unidades del producto: n × 1000.
async function order(
  context: AuthContext,
  product: Product,
  units: number,
  clientId: string,
) {
  const result = await createOrder(context, {
    clientId,
    lines: [
      {
        productId: product.productId,
        quantity: String(units),
        expectedPriceId: product.priceId,
      },
    ],
  });
  if (!result.ok) throw new Error(`alta rechazada: ${JSON.stringify(result)}`);
  return result.order;
}

async function step(
  transition: typeof confirmOrder,
  context: AuthContext,
  orderId: string,
) {
  const result = await transition(context, orderId);
  if (!result.ok) throw new Error(`transición rechazada: ${result.code}`);
}

async function deliver(context: AuthContext, orderId: string) {
  await step(confirmOrder, context, orderId);
  await step(deliverOrder, context, orderId);
}

async function issue(context: AuthContext, orderId: string) {
  const result = await issueSaleFromOrder(context, orderId);
  if (!result.ok)
    throw new Error(`emisión rechazada: ${JSON.stringify(result)}`);
  return result.sale;
}

// Una venta sin pedido de n unidades, para el cliente.
async function sell(
  context: AuthContext,
  product: Product,
  units: number,
  clientId: string,
) {
  const result = await issueSale(context, {
    clientId,
    lines: [
      {
        productId: product.productId,
        quantity: String(units),
        expectedPriceId: product.priceId,
      },
    ],
  });
  if (!result.ok) throw new Error(`venta rechazada: ${JSON.stringify(result)}`);
  return result.sale;
}

async function voided(context: AuthContext, saleId: string) {
  const result = await voidSale(context, saleId, "data_entry_error");
  if (!result.ok) throw new Error(`anulación rechazada: ${result.code}`);
}

async function open(context: AuthContext, rows: CashAmountInput[]) {
  const result = await openCashSession(context, { rows });
  if (!result.ok)
    throw new Error(`apertura rechazada: ${JSON.stringify(result)}`);
  return result.session;
}

function deposit(
  context: AuthContext,
  orderId: string,
  paymentMethodId: string,
  amount: string,
) {
  return createOrderReceipt(context, { orderId, paymentMethodId, amount });
}

async function deposited(
  context: AuthContext,
  orderId: string,
  paymentMethodId: string,
  amount: string,
) {
  const result = await deposit(context, orderId, paymentMethodId, amount);
  if (!result.ok) throw new Error(`seña rechazada: ${JSON.stringify(result)}`);
  return result.receipt;
}

function receive(
  context: AuthContext,
  saleId: string,
  paymentMethodId: string,
  amount: string,
) {
  return createSaleReceipt(context, { saleId, paymentMethodId, amount });
}

async function saleStanding(context: AuthContext, saleId: string) {
  const result = await getSaleReceipts(context, saleId);
  if (!result.ok) throw new Error(`lectura rechazada: ${result.code}`);
  return result.sale;
}

async function orderStanding(context: AuthContext, orderId: string) {
  const result = await getOrderReceipts(context, orderId);
  if (!result.ok) throw new Error(`lectura rechazada: ${result.code}`);
  return result.order;
}

// Lo que quedó escrito, para comprobar que un rechazo no escribe, numera ni audita.
async function snapshot() {
  const result = await getDb().execute<{
    receipts: number;
    audits: number;
    counter: number | null;
  }>(
    sql`select
          (select count(*)::int from receipts) as receipts,
          (select count(*)::int from audit_logs where entity_type = 'receipt') as audits,
          (select max(last_number)::int from document_counters where kind = 'receipt')
            as counter`,
  );
  return result.rows[0]!;
}

async function receiptRow(id: string) {
  const result = await getDb().execute<{
    target: string;
    sale_id: string | null;
    order_id: string | null;
    client_id: string | null;
    currency: string;
    amount: string;
    session_id: string | null;
  }>(
    sql`select target, sale_id, order_id, client_id, currency, amount, session_id
        from receipts where id = ${id}`,
  );
  return result.rows[0]!;
}

// Bloqueos retenidos del test en curso, como en receipts.test.ts.
const heldLocks: (() => Promise<void>)[] = [];

async function hold(...queries: SQL[]): Promise<() => Promise<void>> {
  let taken!: () => void;
  let release!: () => void;
  const lockTaken = new Promise<void>((resolve) => (taken = resolve));
  const released = new Promise<void>((resolve) => (release = resolve));
  const holder = getDb().transaction(async (tx) => {
    for (const query of queries) await tx.execute(query);
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

function cashLock(organizationId: string) {
  return sql`select pg_advisory_xact_lock(hashtextextended(${`cash:${organizationId}`}, 0))`;
}

const receiptCounter = sql`select 1 from document_counters where kind = 'receipt' for update`;

// El bloqueo de cobros se retiene hasta que las dos escrituras esperan, en orden de llegada, y se
// libera (revisión independiente de la 21.2, R-6).
async function queued<A, B>(
  organizationId: string,
  first: () => Promise<A>,
  second: () => Promise<B>,
): Promise<[A, B]> {
  const release = await hold(cashLock(organizationId));
  const a = first();
  await waitForLockWaiters(1);
  const b = second();
  await waitForLockWaiters(2);
  await release();
  return Promise.all([a, b]);
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

describe("la seña (AC-2; ADR 0022, puntos 2 y 5)", () => {
  it(
    "numera en la serie R con la moneda y el cliente del pedido; varias parciales hasta lo que falta, y el exceso se rechaza",
    async () => {
      const s = await seed();
      const placed = await order(s.adminA, s.pesos, 2, s.clientA);
      const sale = await sell(s.adminA, s.pesos, 1, s.clientA2);
      // Un cobro de venta antes: la seña sigue la misma serie.
      expect(
        await receive(s.adminA, sale.id, s.methods.transfer, "100"),
      ).toMatchObject({ ok: true, receipt: { displayNumber: "R-000001" } });
      const first = await deposited(
        s.adminA,
        placed.id,
        s.methods.transfer,
        "500",
      );
      expect(first).toMatchObject({ number: 2, displayNumber: "R-000002" });
      expect(await receiptRow(first.id)).toEqual({
        target: "order",
        sale_id: null,
        order_id: placed.id,
        client_id: s.clientA,
        currency: "ARS",
        amount: "500.00",
        session_id: null,
      });
      await step(confirmOrder, s.adminA, placed.id);
      await deposited(s.adminA, placed.id, s.methods.debit, "1.000,50");
      const before = await snapshot();
      expect(
        await deposit(s.adminA, placed.id, s.methods.transfer, "499,51"),
      ).toEqual({
        ok: false,
        code: "BUSINESS_RULE_VIOLATION",
        rule: "exceeds_outstanding",
        currency: "ARS",
        outstanding: "499.50",
      });
      expect(await snapshot()).toEqual(before);
      await deposited(s.adminA, placed.id, s.methods.transfer, "499,50");
      expect(
        await deposit(s.adminA, placed.id, s.methods.transfer, "0,01"),
      ).toMatchObject({ rule: "exceeds_outstanding", outstanding: "0.00" });
      expect(await orderStanding(s.adminA, placed.id)).toMatchObject({
        total: "2000.00",
        deposited: "2000.00",
        outstanding: "0.00",
        situation: "retained",
        open: false,
      });
    },
    TEST_TIMEOUT,
  );

  it(
    "en efectivo queda en la sesión abierta y suma a lo esperado; la auditoría lleva el número del pedido (D-7)",
    async () => {
      const s = await seed();
      const session = await open(s.adminA, [
        { currency: "ARS", amount: "100" },
      ]);
      const placed = await order(s.adminA, s.pesos, 1, s.clientA);
      const cash = await deposited(s.adminA, placed.id, s.methods.cash, "300");
      expect((await receiptRow(cash.id)).session_id).toBe(session.id);
      const state = await getCashState(s.adminA);
      if (!state.ok || !state.open) throw new Error("caja cerrada");
      expect(state.open.currencies).toMatchObject([
        { currency: "ARS", receipts: "300.00", expected: "400.00" },
      ]);
      expect(
        state.open.receipts.map((r) => [
          r.displayNumber,
          r.order?.displayNumber,
          r.sale,
        ]),
      ).toEqual([["R-000001", placed.displayNumber, null]]);
      const audit = await getDb().execute<{ action: string; diff: unknown }>(
        sql`select action, diff from audit_logs
            where entity_type = 'receipt' and entity_id = ${cash.id}`,
      );
      expect(audit.rows).toEqual([
        {
          action: "create",
          diff: {
            before: null,
            after: {
              number: 1,
              order_number: placed.number,
              payment_method: "Efectivo",
              currency: "ARS",
              amount: "300.00",
              session_number: session.number,
            },
          },
        },
      ]);
      expect(
        await closeCashSession(s.adminA, {
          sessionId: session.id,
          rows: [{ currency: "ARS", amount: "400" }],
        }),
      ).toMatchObject({ ok: true });
    },
    TEST_TIMEOUT,
  );
});

describe("la seña en la cuenta del cliente (AC-3; ADR 0022, puntos 5 y 9)", () => {
  it(
    "pending y confirmed: retenida; no baja lo que falta a ninguna venta",
    async () => {
      const s = await seed();
      const older = await sell(s.adminA, s.pesos, 1, s.clientA);
      const placed = await order(s.adminA, s.pesos, 2, s.clientA);
      await deposited(s.adminA, placed.id, s.methods.transfer, "300");
      for (const status of ["pending", "confirmed"]) {
        expect(await orderStanding(s.adminA, placed.id), status).toMatchObject({
          deposited: "300.00",
          outstanding: "1700.00",
          situation: "retained",
          sale: null,
          open: true,
        });
        expect(await saleStanding(s.adminA, older.id), status).toMatchObject({
          collected: "0.00",
          imputed: "0.00",
          outstanding: "1000.00",
        });
        if (status === "pending") await step(confirmOrder, s.adminA, placed.id);
      }
    },
    TEST_TIMEOUT,
  );

  it(
    "delivered con venta vigente: cuenta para esa venta, y su cobro tiene como tope el total menos la seña",
    async () => {
      const s = await seed();
      const older = await sell(s.adminA, s.pesos, 1, s.clientA);
      const placed = await order(s.adminA, s.pesos, 2, s.clientA);
      const sena = await deposited(
        s.adminA,
        placed.id,
        s.methods.transfer,
        "500",
      );
      await deliver(s.adminA, placed.id);
      const sale = await issue(s.adminA, placed.id);
      expect(await saleStanding(s.adminA, sale.id)).toMatchObject({
        total: "2000.00",
        collected: "500.00",
        deposited: "500.00",
        order: { id: placed.id, displayNumber: placed.displayNumber },
        imputed: "0.00",
        outstanding: "1500.00",
        status: "pending",
      });
      expect(await orderStanding(s.adminA, placed.id)).toMatchObject({
        situation: "applied",
        sale: { id: sale.id, displayNumber: sale.displayNumber },
        open: false,
      });
      expect(
        await receive(s.adminA, sale.id, s.methods.transfer, "1500,01"),
      ).toMatchObject({ rule: "exceeds_outstanding", outstanding: "1500.00" });
      expect(
        await receive(s.adminA, sale.id, s.methods.transfer, "1500"),
      ).toMatchObject({ ok: true });
      const after = await saleStanding(s.adminA, sale.id);
      expect(after).toMatchObject({
        collected: "2000.00",
        status: "collected",
      });
      // La lista de la venta trae la seña con su pedido, por número.
      expect(
        after.receipts.map((r) => [r.displayNumber, r.order?.id ?? null]),
      ).toEqual([
        [sena.displayNumber, placed.id],
        ["R-000002", null],
      ]);
      // La seña no se cuenta dos veces: la venta vieja sigue igual.
      expect(await saleStanding(s.adminA, older.id)).toMatchObject({
        imputed: "0.00",
        outstanding: "1000.00",
      });
    },
    TEST_TIMEOUT,
  );

  it(
    "delivered sin venta todavía: retenida; y un viewer lee la seña en el pedido y en su venta",
    async () => {
      const s = await seed();
      const placed = await order(s.adminA, s.pesos, 2, s.clientA);
      await deposited(s.adminA, placed.id, s.methods.transfer, "500");
      await deliver(s.adminA, placed.id);
      expect(await orderStanding(s.viewerA, placed.id)).toMatchObject({
        deposited: "500.00",
        situation: "retained",
        sale: null,
        open: false,
      });
      const sale = await issue(s.adminA, placed.id);
      expect(await saleStanding(s.viewerA, sale.id)).toMatchObject({
        collected: "500.00",
        deposited: "500.00",
        order: { id: placed.id },
        outstanding: "1500.00",
      });
    },
    TEST_TIMEOUT,
  );

  it(
    "delivered con su última venta anulada sin reemplazo: retenida otra vez",
    async () => {
      const s = await seed();
      const older = await sell(s.adminA, s.pesos, 1, s.clientA);
      const placed = await order(s.adminA, s.pesos, 2, s.clientA);
      await deposited(s.adminA, placed.id, s.methods.transfer, "500");
      await deliver(s.adminA, placed.id);
      const sale = await issue(s.adminA, placed.id);
      await voided(s.adminA, sale.id);
      expect(await orderStanding(s.adminA, placed.id)).toMatchObject({
        deposited: "500.00",
        situation: "retained",
        sale: null,
        open: false,
      });
      // La venta anulada no la cuenta, y no pasa al remanente: la vieja no recibe nada.
      expect(await saleStanding(s.adminA, sale.id)).toMatchObject({
        status: "voided",
        collected: "0.00",
        deposited: "0.00",
        toAccount: "0.00",
      });
      expect(await saleStanding(s.adminA, older.id)).toMatchObject({
        imputed: "0.00",
        outstanding: "1000.00",
      });
    },
    TEST_TIMEOUT,
  );

  it(
    "la venta anulada y vuelta a emitir: la seña cuenta para la nueva",
    async () => {
      const s = await seed();
      const placed = await order(s.adminA, s.pesos, 2, s.clientA);
      await deposited(s.adminA, placed.id, s.methods.transfer, "500");
      await deliver(s.adminA, placed.id);
      const first = await issue(s.adminA, placed.id);
      await voided(s.adminA, first.id);
      const second = await issue(s.adminA, placed.id);
      expect(await saleStanding(s.adminA, second.id)).toMatchObject({
        collected: "500.00",
        deposited: "500.00",
        outstanding: "1500.00",
      });
      expect(await saleStanding(s.adminA, first.id)).toMatchObject({
        status: "voided",
        deposited: "0.00",
      });
      expect(await orderStanding(s.adminA, placed.id)).toMatchObject({
        situation: "applied",
        sale: { id: second.id },
      });
    },
    TEST_TIMEOUT,
  );

  it(
    "cancelled: pasa al remanente y baja lo que falta a la venta vigente más vieja del cliente",
    async () => {
      const s = await seed();
      const older = await sell(s.adminA, s.pesos, 1, s.clientA);
      const newer = await sell(s.adminA, s.pesos, 1, s.clientA);
      const other = await sell(s.adminA, s.pesos, 1, s.clientA2);
      const placed = await order(s.adminA, s.pesos, 2, s.clientA);
      await deposited(s.adminA, placed.id, s.methods.transfer, "300");
      await step(cancelOrder, s.adminA, placed.id);
      expect(await orderStanding(s.adminA, placed.id)).toMatchObject({
        deposited: "300.00",
        situation: "to_account",
        sale: null,
        open: false,
      });
      expect(await saleStanding(s.adminA, older.id)).toMatchObject({
        collected: "0.00",
        imputed: "300.00",
        outstanding: "700.00",
      });
      expect(await saleStanding(s.adminA, newer.id)).toMatchObject({
        imputed: "0.00",
        outstanding: "1000.00",
      });
      // Otro cliente no se mezcla.
      expect(await saleStanding(s.adminA, other.id)).toMatchObject({
        imputed: "0.00",
        outstanding: "1000.00",
      });
      // El tope del cobro sale de la misma regla.
      expect(
        await receive(s.adminA, older.id, s.methods.transfer, "700,01"),
      ).toMatchObject({ rule: "exceeds_outstanding", outstanding: "700.00" });
    },
    TEST_TIMEOUT,
  );
});

describe("los rechazos (AC-4)", () => {
  it(
    "cada respuesta de D-6, sin escribir, numerar ni auditar",
    async () => {
      const s = await seed();
      const placed = await order(s.adminA, s.pesos, 1, s.clientA);
      const delivered = await order(s.adminA, s.pesos, 1, s.clientA);
      await deliver(s.adminA, delivered.id);
      const cancelled = await order(s.adminA, s.pesos, 1, s.clientA);
      await step(cancelOrder, s.adminA, cancelled.id);
      const orderB = await order(s.adminB, s.productB, 1, s.clientB);
      await deactivatePaymentMethod(s.adminA, s.methods.debit);
      const before = await snapshot();

      expect(
        await deposit(s.viewerA, placed.id, s.methods.transfer, "1"),
      ).toEqual({ ok: false, code: "FORBIDDEN" });
      expect(
        await deposit(s.adminA, "no-es-uuid", s.methods.transfer, "1"),
      ).toEqual({ ok: false, code: "VALIDATION_ERROR" });
      expect(await deposit(s.adminA, placed.id, "", "")).toEqual({
        ok: false,
        code: "VALIDATION_ERROR",
        fields: ["paymentMethod", "amount"],
        amount: "required",
      });
      for (const [amount, reason] of [
        ["0", "zero"],
        ["abc", "invalid"],
        ["10,123", "decimals"],
      ] as const) {
        expect(
          await deposit(s.adminA, placed.id, s.methods.transfer, amount),
          amount,
        ).toEqual({
          ok: false,
          code: "VALIDATION_ERROR",
          fields: ["amount"],
          amount: reason,
        });
      }
      expect(
        await deposit(s.adminA, orderB.id, s.methods.transfer, "1"),
      ).toEqual({ ok: false, code: "NOT_FOUND", entity: "order" });
      expect(
        await deposit(s.adminA, placed.id, s.methodsB.transfer, "1"),
      ).toEqual({ ok: false, code: "NOT_FOUND", entity: "payment_method" });
      expect(
        await deposit(s.adminA, delivered.id, s.methods.transfer, "1"),
      ).toEqual({
        ok: false,
        code: "BUSINESS_RULE_VIOLATION",
        rule: "order_not_open",
        status: "delivered",
      });
      expect(
        await deposit(s.adminA, cancelled.id, s.methods.transfer, "1"),
      ).toEqual({
        ok: false,
        code: "BUSINESS_RULE_VIOLATION",
        rule: "order_not_open",
        status: "cancelled",
      });
      expect(await deposit(s.adminA, placed.id, s.methods.debit, "1")).toEqual({
        ok: false,
        code: "BUSINESS_RULE_VIOLATION",
        rule: "payment_method_inactive",
      });
      expect(await deposit(s.adminA, placed.id, s.methods.cash, "1")).toEqual({
        ok: false,
        code: "BUSINESS_RULE_VIOLATION",
        rule: "no_open_session",
      });
      expect(await snapshot()).toEqual(before);
    },
    TEST_TIMEOUT,
  );

  it(
    "un efectivo que pasaría lo que cabe en numeric(14, 2) se rechaza, como en el cobro",
    async () => {
      const s = await seed();
      await open(s.adminA, [{ currency: "ARS", amount: "999999999999" }]);
      const placed = await order(s.adminA, s.pesos, 1, s.clientA);
      const before = await snapshot();
      expect(await deposit(s.adminA, placed.id, s.methods.cash, "1")).toEqual({
        ok: false,
        code: "VALIDATION_ERROR",
        fields: ["amount"],
        amount: "limit",
      });
      expect(await snapshot()).toEqual(before);
    },
    TEST_TIMEOUT,
  );
});

describe("la serialización (AC-5; ADR 0022, punto 4)", () => {
  it(
    "la seña espera el bloqueo de cobros, y la de otra organización no",
    async () => {
      const s = await seed();
      const placed = await order(s.adminA, s.pesos, 1, s.clientA);
      const orderB = await order(s.adminB, s.productB, 1, s.clientB);
      const release = await hold(cashLock(s.orgA));
      const depositing = deposit(s.adminA, placed.id, s.methods.transfer, "1");
      let settled = false;
      void depositing.then(
        () => (settled = true),
        () => (settled = true),
      );
      // La regla, antes del ayudante que cuenta las conexiones en espera: con el bloqueo retenido,
      // la seña no termina ni escribe (revisión independiente de la 21.4, R-1).
      await new Promise((resolve) => setTimeout(resolve, 1000));
      expect(settled).toBe(false);
      expect((await snapshot()).receipts).toBe(0);
      await waitForLockWaiters(1);
      expect(
        await deposit(s.adminB, orderB.id, s.methodsB.transfer, "1"),
      ).toMatchObject({ ok: true });
      expect(settled).toBe(false);
      await release();
      expect(await depositing).toMatchObject({ ok: true });
    },
    TEST_TIMEOUT,
  );

  // Una transición retenida desde otra conexión: la cabecera tomada FOR UPDATE y el estado nuevo
  // escrito, sin confirmar. La seña espera la cabecera (H-6) y, al soltarse, ve el estado nuevo.
  for (const [target, from] of [
    ["cancelled", "pending"],
    ["delivered", "confirmed"],
  ] as const) {
    it(
      `la seña espera una transición a ${target} del mismo pedido y después la ve: order_not_open`,
      async () => {
        const s = await seed();
        const placed = await order(s.adminA, s.pesos, 1, s.clientA);
        if (from === "confirmed") await step(confirmOrder, s.adminA, placed.id);
        const stamp =
          target === "cancelled"
            ? sql`cancelled_at = now()`
            : sql`delivered_at = now()`;
        const release = await hold(
          sql`select 1 from orders where id = ${placed.id} for update`,
          sql`update orders set status = ${target}, ${stamp} where id = ${placed.id}`,
        );
        const depositing = deposit(
          s.adminA,
          placed.id,
          s.methods.transfer,
          "100",
        );
        await waitForLockWaiters(1);
        await release();
        expect(await depositing).toEqual({
          ok: false,
          code: "BUSINESS_RULE_VIOLATION",
          rule: "order_not_open",
          status: target,
        });
        expect((await snapshot()).receipts).toBe(0);
      },
      TEST_TIMEOUT,
    );
  }

  it(
    "dos señas del mismo pedido en cola que juntas superan lo que falta: una y un exceeds_outstanding",
    async () => {
      const s = await seed();
      const placed = await order(s.adminA, s.pesos, 1, s.clientA);
      const [first, second] = await queued(
        s.orgA,
        () => deposit(s.adminA, placed.id, s.methods.transfer, "700"),
        () => deposit(s.adminA, placed.id, s.methods.debit, "700"),
      );
      expect(first).toMatchObject({ ok: true });
      expect(second).toEqual({
        ok: false,
        code: "BUSINESS_RULE_VIOLATION",
        rule: "exceeds_outstanding",
        currency: "ARS",
        outstanding: "300.00",
      });
      expect((await snapshot()).counter).toBe(1);
    },
    TEST_TIMEOUT,
  );

  it(
    "una seña en efectivo antes que el cierre, en cola: el arqueo la cuenta",
    async () => {
      const s = await seed();
      const session = await open(s.adminA, [
        { currency: "ARS", amount: "100" },
      ]);
      const placed = await order(s.adminA, s.pesos, 1, s.clientA);
      const [paid, closed] = await queued(
        s.orgA,
        () => deposit(s.adminA, placed.id, s.methods.cash, "300"),
        () =>
          closeCashSession(s.adminA, {
            sessionId: session.id,
            rows: [{ currency: "ARS", amount: "400" }],
          }),
      );
      expect(paid).toMatchObject({ ok: true });
      expect(closed).toMatchObject({ ok: true });
    },
    TEST_TIMEOUT,
  );

  it(
    "un cierre antes que la seña en efectivo, en cola: no_open_session",
    async () => {
      const s = await seed();
      const session = await open(s.adminA, [
        { currency: "ARS", amount: "100" },
      ]);
      const placed = await order(s.adminA, s.pesos, 1, s.clientA);
      const [closed, paid] = await queued(
        s.orgA,
        () =>
          closeCashSession(s.adminA, {
            sessionId: session.id,
            rows: [{ currency: "ARS", amount: "100" }],
          }),
        () => deposit(s.adminA, placed.id, s.methods.cash, "300"),
      );
      expect(closed).toMatchObject({ ok: true });
      expect(paid).toEqual({
        ok: false,
        code: "BUSINESS_RULE_VIOLATION",
        rule: "no_open_session",
      });
      expect((await snapshot()).receipts).toBe(0);
    },
    TEST_TIMEOUT,
  );

  it(
    "el pedido cancelado durante el cobro de otra venta del mismo cliente (H-7): el exceso queda a favor, una sola vez",
    async () => {
      const s = await seed();
      const sale = await sell(s.adminA, s.pesos, 2, s.clientA);
      const placed = await order(s.adminA, s.pesos, 1, s.clientA);
      // La seña crea la fila del contador, para poder retenerla.
      await deposited(s.adminA, placed.id, s.methods.transfer, "500");
      const release = await hold(receiptCounter);
      // El cobro lee lo que falta con la seña retenida (2000) y espera el contador.
      const receiving = receive(s.adminA, sale.id, s.methods.transfer, "2000");
      await waitForLockWaiters(1);
      // Cancelar no toma el bloqueo de cobros y pasa: la seña va al remanente.
      await step(cancelOrder, s.adminA, placed.id);
      await release();
      expect(await receiving).toMatchObject({ ok: true });
      expect(await saleStanding(s.adminA, sale.id)).toMatchObject({
        collected: "2000.00",
        imputed: "0.00",
        outstanding: "0.00",
        status: "collected",
      });
      expect(await orderStanding(s.adminA, placed.id)).toMatchObject({
        situation: "to_account",
      });
      // Los 500 quedan a favor y se imputan a la venta siguiente, una sola vez.
      const next = await sell(s.adminA, s.pesos, 1, s.clientA);
      expect(await saleStanding(s.adminA, next.id)).toMatchObject({
        imputed: "500.00",
        outstanding: "500.00",
      });
    },
    TEST_TIMEOUT,
  );
});

describe("las lecturas (AC-6)", () => {
  it(
    "los dos roles ven lo señado, el recibo con su pedido y la lista con el destino; un viewer sin el contacto",
    async () => {
      const s = await seed();
      const placed = await order(s.adminA, s.pesos, 2, s.clientA);
      const sale = await sell(s.adminA, s.pesos, 1, s.clientA2);
      const sena = await deposited(
        s.adminA,
        placed.id,
        s.methods.transfer,
        "400",
      );
      await receive(s.adminA, sale.id, s.methods.debit, "100");
      for (const context of [s.adminA, s.viewerA]) {
        expect(await orderStanding(context, placed.id)).toMatchObject({
          deposited: "400.00",
          outstanding: "1600.00",
          situation: "retained",
        });
      }
      const forAdmin = await getReceipt(s.adminA, sena.id);
      const forViewer = await getReceipt(s.viewerA, sena.id);
      if (!forAdmin.ok || !forViewer.ok) throw new Error("recibo rechazado");
      expect(forAdmin.receipt).toMatchObject({
        displayNumber: "R-000001",
        sale: null,
        order: { id: placed.id, displayNumber: placed.displayNumber },
        clientId: s.clientA,
        client: { displayName: "Lucía Gómez" },
      });
      expect(forAdmin.receipt.client?.contact).not.toBeNull();
      expect(forViewer.receipt.client?.contact).toBeNull();
      const list = await listReceipts(s.viewerA, { number: "", page: 1 });
      if (!list.ok) throw new Error("lista rechazada");
      expect(
        list.receipts.map((r) => [
          r.displayNumber,
          r.sale?.displayNumber ?? null,
          r.order?.displayNumber ?? null,
        ]),
      ).toEqual([
        ["R-000002", sale.displayNumber, null],
        ["R-000001", null, placed.displayNumber],
      ]);
    },
    TEST_TIMEOUT,
  );

  it(
    "otra organización no ve las señas; el formulario es solo de admin",
    async () => {
      const s = await seed();
      const placed = await order(s.adminA, s.pesos, 2, s.clientA);
      const sena = await deposited(
        s.adminA,
        placed.id,
        s.methods.transfer,
        "500",
      );
      expect(await getOrderReceipts(s.adminB, placed.id)).toEqual({
        ok: false,
        code: "NOT_FOUND",
      });
      expect(await getOrderReceiptForm(s.adminB, placed.id)).toEqual({
        ok: false,
        code: "NOT_FOUND",
      });
      expect(await getReceipt(s.adminB, sena.id)).toEqual({
        ok: false,
        code: "NOT_FOUND",
      });
      expect(await getOrderReceiptForm(s.viewerA, placed.id)).toEqual({
        ok: false,
        code: "FORBIDDEN",
      });
      const form = await getOrderReceiptForm(s.adminA, placed.id);
      if (!form.ok) throw new Error("formulario rechazado");
      expect(form).toMatchObject({
        order: { id: placed.id, currency: "ARS", status: "pending" },
        outstanding: "1500.00",
        outstandingInput: "1500.00",
        openSession: null,
      });
    },
    TEST_TIMEOUT,
  );
});

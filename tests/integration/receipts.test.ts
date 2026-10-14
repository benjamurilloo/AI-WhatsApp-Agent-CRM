import { sql, type SQL } from "drizzle-orm";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { hashPassword, login } from "@/modules/auth";
import {
  closeCashSession,
  createInitialPaymentMethods,
  createSaleReceipt,
  deactivatePaymentMethod,
  getCashSession,
  getCashState,
  getReceipt,
  getSaleReceiptForm,
  getSaleReceipts,
  listPaymentMethods,
  listReceipts,
  openCashSession,
  parseReceiptNumberSearch,
  type CashAmountInput,
} from "@/modules/cash";
import { adjustStock } from "@/modules/inventory";
import { getAuthContext, type AuthContext } from "@/modules/organizations";
import { issueSale, voidSale } from "@/modules/sales";
import { getDb } from "@/shared/db";
import { resetDatabase } from "./reset-database";

// El cobro de una venta contra PostgreSQL real (brief-21.3): el cobro (AC-3), los rechazos (AC-4),
// la serialización (AC-5) y las lecturas (AC-6). Los helpers son los de cash.test.ts y
// sales.test.ts. Las ventas se emiten sin pedido, con un producto de precio 1000 por unidad: una
// venta de n unidades suma n × 1000.

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

async function insertProduct(
  organizationId: string,
  sku: string,
  createdBy: string,
  { amount = "1000.00", currency = "ARS" } = {},
) {
  const productId = await returningId(
    sql`insert into products (organization_id, sku, name)
        values (${organizationId}, ${sku}, ${`Producto ${sku}`}) returning id`,
  );
  const priceId = await returningId(
    sql`insert into product_prices (organization_id, product_id, amount, currency, created_by)
        values (${organizationId}, ${productId}, ${amount}, ${currency}, ${createdBy})
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

// A con admin, viewer, dos clientes, un producto en pesos y otro en dólares, y la lista inicial de
// medios; B con su admin, su cliente, su producto y sus medios.
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
  const dollars = await insertProduct(orgA, "D-1", adminAId, {
    amount: "50.00",
    currency: "USD",
  });
  const productB = await insertProduct(orgB, "P-1", adminBId);
  const s = {
    orgA,
    orgB,
    clientA,
    clientA2,
    clientB,
    pesos,
    dollars,
    productB,
    adminA: await contextFor("admin-a@example.com"),
    viewerA: await contextFor("viewer-a@example.com"),
    adminB: await contextFor("admin-b@example.com"),
  };
  await stock(s.adminA, pesos.productId);
  await stock(s.adminA, dollars.productId);
  await stock(s.adminB, productB.productId);
  return {
    ...s,
    methods: await methodIds(s.adminA),
    methodsB: await methodIds(s.adminB),
  };
}

// Una venta sin pedido de n unidades del producto: en pesos, n × 1000.
async function sell(
  context: AuthContext,
  product: { productId: string; priceId: string },
  units: number,
  clientId = "",
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

function receive(
  context: AuthContext,
  saleId: string,
  paymentMethodId: string,
  amount: string,
) {
  return createSaleReceipt(context, { saleId, paymentMethodId, amount });
}

async function received(
  context: AuthContext,
  saleId: string,
  paymentMethodId: string,
  amount: string,
) {
  const result = await receive(context, saleId, paymentMethodId, amount);
  if (!result.ok) throw new Error(`cobro rechazado: ${JSON.stringify(result)}`);
  return result.receipt;
}

async function standing(context: AuthContext, saleId: string) {
  const result = await getSaleReceipts(context, saleId);
  if (!result.ok) throw new Error(`lectura rechazada: ${result.code}`);
  return result.sale;
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
    client_id: string | null;
    currency: string;
    amount: string;
    session_id: string | null;
  }>(
    sql`select client_id, currency, amount, session_id from receipts where id = ${id}`,
  );
  return result.rows[0]!;
}

// Bloqueos retenidos del test en curso, como en cash.test.ts.
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

describe("el cobro (AC-3; ADR 0022, puntos 2 y 3)", () => {
  it(
    "numera R-000001 y sigue la serie; copia la moneda y el cliente de la venta",
    async () => {
      const s = await seed();
      const withClient = await sell(s.adminA, s.pesos, 2, s.clientA);
      const withoutClient = await sell(s.adminA, s.dollars, 1);
      const first = await received(
        s.adminA,
        withClient.id,
        s.methods.transfer,
        "500",
      );
      const second = await received(
        s.adminA,
        withoutClient.id,
        s.methods.debit,
        "20,50",
      );
      expect(first).toMatchObject({ number: 1, displayNumber: "R-000001" });
      expect(second).toMatchObject({ number: 2, displayNumber: "R-000002" });
      expect(await receiptRow(first.id)).toEqual({
        client_id: s.clientA,
        currency: "ARS",
        amount: "500.00",
        session_id: null,
      });
      expect(await receiptRow(second.id)).toEqual({
        client_id: null,
        currency: "USD",
        amount: "20.50",
        session_id: null,
      });
      // Otra organización numera su propia serie.
      const saleB = await sell(s.adminB, s.productB, 1);
      expect(
        await received(s.adminB, saleB.id, s.methodsB.transfer, "1"),
      ).toMatchObject({ displayNumber: "R-000001" });
    },
    TEST_TIMEOUT,
  );

  it(
    "varios cobros parciales en distintos medios, hasta «Cobrada»",
    async () => {
      const s = await seed();
      await open(s.adminA, [{ currency: "ARS", amount: "0" }]);
      const sale = await sell(s.adminA, s.pesos, 3);
      await received(s.adminA, sale.id, s.methods.cash, "1000");
      expect(await standing(s.adminA, sale.id)).toMatchObject({
        total: "3000.00",
        collected: "1000.00",
        outstanding: "2000.00",
        status: "pending",
      });
      await received(s.adminA, sale.id, s.methods.transfer, "1.500,50");
      await received(s.adminA, sale.id, s.methods.debit, "499.50");
      const after = await standing(s.adminA, sale.id);
      expect(after).toMatchObject({
        collected: "3000.00",
        imputed: "0.00",
        outstanding: "0.00",
        status: "collected",
        hasClient: false,
      });
      expect(
        after.receipts.map((r) => [
          r.displayNumber,
          r.paymentMethodName,
          r.amount,
        ]),
      ).toEqual([
        ["R-000001", "Efectivo", "1000.00"],
        ["R-000002", "Transferencia", "1500.50"],
        ["R-000003", "Tarjeta de débito", "499.50"],
      ]);
    },
    TEST_TIMEOUT,
  );

  it(
    "un cobro de más se rechaza con lo que falta, también cuando ya no falta nada",
    async () => {
      const s = await seed();
      const sale = await sell(s.adminA, s.pesos, 1);
      await received(s.adminA, sale.id, s.methods.transfer, "400");
      const before = await snapshot();
      expect(
        await receive(s.adminA, sale.id, s.methods.transfer, "600,01"),
      ).toEqual({
        ok: false,
        code: "BUSINESS_RULE_VIOLATION",
        rule: "exceeds_outstanding",
        currency: "ARS",
        outstanding: "600.00",
      });
      expect(await snapshot()).toEqual(before);
      await received(s.adminA, sale.id, s.methods.transfer, "600");
      expect(await receive(s.adminA, sale.id, s.methods.transfer, "1")).toEqual(
        {
          ok: false,
          code: "BUSINESS_RULE_VIOLATION",
          rule: "exceeds_outstanding",
          currency: "ARS",
          outstanding: "0.00",
        },
      );
    },
    TEST_TIMEOUT,
  );

  it(
    "en efectivo queda en la sesión abierta y suma a lo esperado de su moneda; el cierre lo exige contado",
    async () => {
      const s = await seed();
      const session = await open(s.adminA, [
        { currency: "ARS", amount: "100" },
      ]);
      const pesosSale = await sell(s.adminA, s.pesos, 1);
      const dollarSale = await sell(s.adminA, s.dollars, 1);
      const cash = await received(
        s.adminA,
        pesosSale.id,
        s.methods.cash,
        "300",
      );
      await received(s.adminA, pesosSale.id, s.methods.transfer, "200");
      await received(s.adminA, dollarSale.id, s.methods.cash, "20");
      expect((await receiptRow(cash.id)).session_id).toBe(session.id);

      const state = await getCashState(s.adminA);
      if (!state.ok || !state.open) throw new Error("caja cerrada");
      expect(state.open.currencies).toMatchObject([
        {
          currency: "ARS",
          initial: "100.00",
          receipts: "300.00",
          expected: "400.00",
        },
        {
          currency: "USD",
          initial: "0.00",
          receipts: "20.00",
          expected: "20.00",
        },
      ]);
      // Solo los cobros en efectivo, con su número y su venta.
      expect(
        state.open.receipts.map((r) => [
          r.displayNumber,
          r.sale?.displayNumber,
          r.amount,
        ]),
      ).toEqual([
        ["R-000001", pesosSale.displayNumber, "300.00"],
        ["R-000003", dollarSale.displayNumber, "20.00"],
      ]);

      expect(
        await closeCashSession(s.adminA, {
          sessionId: session.id,
          rows: [{ currency: "ARS", amount: "400" }],
        }),
      ).toMatchObject({ ok: false, reason: "missing", missing: ["USD"] });
      expect(
        await closeCashSession(s.adminA, {
          sessionId: session.id,
          rows: [
            { currency: "ARS", amount: "400" },
            { currency: "USD", amount: "20" },
          ],
        }),
      ).toMatchObject({ ok: true });
      const closed = await getCashSession(s.adminA, session.id);
      if (!closed.ok) throw new Error("detalle rechazado");
      expect(closed.session.currencies).toMatchObject([
        { currency: "ARS", expected: "400.00", counted: "400.00" },
        { currency: "USD", expected: "20.00", counted: "20.00" },
      ]);
    },
    TEST_TIMEOUT,
  );

  it(
    "lo cobrado de una venta anulada de un cliente baja lo que falta en su vigente más vieja (H-8)",
    async () => {
      const s = await seed();
      const older = await sell(s.adminA, s.pesos, 2, s.clientA);
      const toVoid = await sell(s.adminA, s.pesos, 1, s.clientA);
      const newer = await sell(s.adminA, s.pesos, 1, s.clientA);
      await received(s.adminA, toVoid.id, s.methods.transfer, "700");
      await voided(s.adminA, toVoid.id);
      expect(await standing(s.adminA, toVoid.id)).toMatchObject({
        status: "voided",
        collected: "700.00",
        toAccount: "700.00",
        toRefund: "0.00",
        outstanding: "0.00",
      });
      expect(await standing(s.adminA, older.id)).toMatchObject({
        collected: "0.00",
        imputed: "700.00",
        outstanding: "1300.00",
        status: "pending",
      });
      expect(await standing(s.adminA, newer.id)).toMatchObject({
        imputed: "0.00",
        outstanding: "1000.00",
      });
      // El tope del cobro sale de la misma regla.
      expect(
        await receive(s.adminA, older.id, s.methods.transfer, "1300,01"),
      ).toMatchObject({ rule: "exceeds_outstanding", outstanding: "1300.00" });
      // Otro cliente no se mezcla.
      const other = await sell(s.adminA, s.pesos, 1, s.clientA2);
      expect(await standing(s.adminA, other.id)).toMatchObject({
        imputed: "0.00",
        outstanding: "1000.00",
      });
    },
    TEST_TIMEOUT,
  );

  it(
    "anulada una venta sin cliente, lo cobrado queda a devolver",
    async () => {
      const s = await seed();
      const sale = await sell(s.adminA, s.pesos, 1);
      await received(s.adminA, sale.id, s.methods.transfer, "250");
      await voided(s.adminA, sale.id);
      expect(await standing(s.adminA, sale.id)).toMatchObject({
        status: "voided",
        hasClient: false,
        toRefund: "250.00",
        toAccount: "0.00",
      });
    },
    TEST_TIMEOUT,
  );

  it(
    "la auditoría lleva claves planas, sin datos de la persona (D-7)",
    async () => {
      const s = await seed();
      const session = await open(s.adminA, [{ currency: "ARS", amount: "0" }]);
      const sale = await sell(s.adminA, s.pesos, 1, s.clientA);
      const cash = await received(s.adminA, sale.id, s.methods.cash, "100");
      const transfer = await received(
        s.adminA,
        sale.id,
        s.methods.transfer,
        "50",
      );
      const result = await getDb().execute<{
        entity_id: string;
        action: string;
        diff: unknown;
      }>(
        sql`select entity_id, action, diff from audit_logs
            where entity_type = 'receipt' order by created_at, id`,
      );
      expect(result.rows).toEqual([
        {
          entity_id: cash.id,
          action: "create",
          diff: {
            before: null,
            after: {
              number: 1,
              sale_number: sale.number,
              payment_method: "Efectivo",
              currency: "ARS",
              amount: "100.00",
              session_number: session.number,
            },
          },
        },
        {
          entity_id: transfer.id,
          action: "create",
          diff: {
            before: null,
            after: {
              number: 2,
              sale_number: sale.number,
              payment_method: "Transferencia",
              currency: "ARS",
              amount: "50.00",
            },
          },
        },
      ]);
    },
    TEST_TIMEOUT,
  );
});

describe("los rechazos (AC-4)", () => {
  it(
    "cada respuesta de D-6, sin escribir, numerar ni auditar",
    async () => {
      const s = await seed();
      const sale = await sell(s.adminA, s.pesos, 1, s.clientA);
      const saleB = await sell(s.adminB, s.productB, 1);
      const toVoid = await sell(s.adminA, s.pesos, 1);
      await voided(s.adminA, toVoid.id);
      await deactivatePaymentMethod(s.adminA, s.methods.debit);
      const before = await snapshot();

      expect(
        await receive(s.viewerA, sale.id, s.methods.transfer, "1"),
      ).toEqual({
        ok: false,
        code: "FORBIDDEN",
      });
      expect(
        await receive(s.adminA, "no-es-uuid", s.methods.transfer, "1"),
      ).toEqual({ ok: false, code: "VALIDATION_ERROR" });
      expect(await receive(s.adminA, sale.id, "", "")).toEqual({
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
          await receive(s.adminA, sale.id, s.methods.transfer, amount),
          amount,
        ).toEqual({
          ok: false,
          code: "VALIDATION_ERROR",
          fields: ["amount"],
          amount: reason,
        });
      }
      expect(
        await receive(s.adminA, saleB.id, s.methods.transfer, "1"),
      ).toEqual({
        ok: false,
        code: "NOT_FOUND",
        entity: "sale",
      });
      expect(
        await receive(s.adminA, sale.id, s.methodsB.transfer, "1"),
      ).toEqual({
        ok: false,
        code: "NOT_FOUND",
        entity: "payment_method",
      });
      expect(
        await receive(s.adminA, toVoid.id, s.methods.transfer, "1"),
      ).toEqual({
        ok: false,
        code: "BUSINESS_RULE_VIOLATION",
        rule: "sale_voided",
      });
      expect(await receive(s.adminA, sale.id, s.methods.debit, "1")).toEqual({
        ok: false,
        code: "BUSINESS_RULE_VIOLATION",
        rule: "payment_method_inactive",
      });
      expect(await receive(s.adminA, sale.id, s.methods.cash, "1")).toEqual({
        ok: false,
        code: "BUSINESS_RULE_VIOLATION",
        rule: "no_open_session",
      });
      expect(await snapshot()).toEqual(before);
    },
    TEST_TIMEOUT,
  );

  it(
    "un efectivo con la caja cerrada después de abierta también es no_open_session",
    async () => {
      const s = await seed();
      const session = await open(s.adminA, [{ currency: "ARS", amount: "0" }]);
      await closeCashSession(s.adminA, {
        sessionId: session.id,
        rows: [{ currency: "ARS", amount: "0" }],
      });
      const sale = await sell(s.adminA, s.pesos, 1);
      expect(
        await receive(s.adminA, sale.id, s.methods.cash, "1"),
      ).toMatchObject({
        rule: "no_open_session",
      });
      expect((await snapshot()).receipts).toBe(0);
    },
    TEST_TIMEOUT,
  );

  it(
    "un efectivo que pasaría lo que cabe en numeric(14, 2) se rechaza, como el aporte",
    async () => {
      const s = await seed();
      await open(s.adminA, [{ currency: "ARS", amount: "999999999999" }]);
      const sale = await sell(s.adminA, s.pesos, 1);
      const before = await snapshot();
      expect(await receive(s.adminA, sale.id, s.methods.cash, "1")).toEqual({
        ok: false,
        code: "VALIDATION_ERROR",
        fields: ["amount"],
        amount: "limit",
      });
      expect(await snapshot()).toEqual(before);
      // Lo que no es efectivo no entra en la sesión: el mismo monto pasa.
      await received(s.adminA, sale.id, s.methods.transfer, "1");
    },
    TEST_TIMEOUT,
  );
});

describe("la serialización (AC-5; ADR 0022, punto 4)", () => {
  it(
    "el cobro espera el bloqueo de cobros, y el de otra organización no",
    async () => {
      const s = await seed();
      const sale = await sell(s.adminA, s.pesos, 1);
      const saleB = await sell(s.adminB, s.productB, 1);
      const release = await hold(cashLock(s.orgA));
      const receiving = receive(s.adminA, sale.id, s.methods.transfer, "1");
      let settled = false;
      void receiving.then(
        () => (settled = true),
        () => (settled = true),
      );
      await waitForLockWaiters(1);
      // La otra organización no espera.
      expect(
        await receive(s.adminB, saleB.id, s.methodsB.transfer, "1"),
      ).toMatchObject({ ok: true });
      expect(settled).toBe(false);
      await release();
      expect(await receiving).toMatchObject({ ok: true });
    },
    TEST_TIMEOUT,
  );

  // Como en cash.test.ts (revisión independiente de la 21.2, R-6): el bloqueo se retiene hasta que
  // las dos escrituras esperan, en orden de llegada, y se libera.
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

  it(
    "dos cobros de la misma venta en cola que juntos superan lo que falta: uno y un exceeds_outstanding",
    async () => {
      const s = await seed();
      const sale = await sell(s.adminA, s.pesos, 1);
      const [first, second] = await queued(
        s.orgA,
        () => receive(s.adminA, sale.id, s.methods.transfer, "700"),
        () => receive(s.adminA, sale.id, s.methods.debit, "700"),
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

  // El escenario de AC-5 «el segundo ve lo imputado por el primero» no se alcanza con las escrituras
  // de la 21.3: un cobro contra una venta tiene por tope lo que le falta, y si le falta algo el
  // remanente ya se agotó en ella o antes, así que pagarla directo no libera remanente hacia otra
  // venta. Lo cruzado entre ventas de un cliente llega con el cobro a cuenta, la seña y la devolución
  // (21.4 a 21.6). Lo que sí se prueba: los dos cobros en cola, cada uno hasta su tope, sin contar
  // nada dos veces.
  it(
    "dos cobros de ventas distintas del mismo cliente en cola, cada uno hasta su tope: la cuenta cuadra",
    async () => {
      const s = await seed();
      const older = await sell(s.adminA, s.pesos, 1, s.clientA);
      const toVoid = await sell(s.adminA, s.pesos, 1, s.clientA);
      const newer = await sell(s.adminA, s.pesos, 1, s.clientA);
      // Un remanente de 500: cubre media venta, la más vieja.
      await received(s.adminA, toVoid.id, s.methods.transfer, "500");
      await voided(s.adminA, toVoid.id);
      const [first, second] = await queued(
        s.orgA,
        () => receive(s.adminA, older.id, s.methods.transfer, "500"),
        () => receive(s.adminA, newer.id, s.methods.transfer, "1000"),
      );
      expect(first).toMatchObject({ ok: true });
      expect(second).toMatchObject({ ok: true });
      expect(await standing(s.adminA, older.id)).toMatchObject({
        collected: "500.00",
        imputed: "500.00",
        status: "collected",
      });
      expect(await standing(s.adminA, newer.id)).toMatchObject({
        collected: "1000.00",
        imputed: "0.00",
        status: "collected",
      });
      // Ni un peso más: los dos topes ya están cubiertos.
      for (const sale of [older, newer]) {
        expect(
          await receive(s.adminA, sale.id, s.methods.transfer, "0,01"),
        ).toMatchObject({ rule: "exceeds_outstanding", outstanding: "0.00" });
      }
    },
    TEST_TIMEOUT,
  );

  it(
    "un cobro en efectivo antes que el cierre, en cola: el arqueo lo cuenta",
    async () => {
      const s = await seed();
      const session = await open(s.adminA, [
        { currency: "ARS", amount: "100" },
      ]);
      const sale = await sell(s.adminA, s.pesos, 1);
      const [paid, closed] = await queued(
        s.orgA,
        () => receive(s.adminA, sale.id, s.methods.cash, "300"),
        () =>
          closeCashSession(s.adminA, {
            sessionId: session.id,
            rows: [{ currency: "ARS", amount: "400" }],
          }),
      );
      expect(paid).toMatchObject({ ok: true });
      expect(closed).toMatchObject({ ok: true });
      const detail = await getCashSession(s.adminA, session.id);
      if (!detail.ok) throw new Error("detalle rechazado");
      expect(detail.session.currencies).toMatchObject([
        {
          currency: "ARS",
          receipts: "300.00",
          expected: "400.00",
          counted: "400.00",
        },
      ]);
    },
    TEST_TIMEOUT,
  );

  it(
    "un cierre antes que el cobro en efectivo, en cola: no_open_session, y no cae en otra sesión",
    async () => {
      const s = await seed();
      const session = await open(s.adminA, [
        { currency: "ARS", amount: "100" },
      ]);
      const sale = await sell(s.adminA, s.pesos, 1);
      const [closed, paid] = await queued(
        s.orgA,
        () =>
          closeCashSession(s.adminA, {
            sessionId: session.id,
            rows: [{ currency: "ARS", amount: "100" }],
          }),
        () => receive(s.adminA, sale.id, s.methods.cash, "300"),
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
    "la venta anulada durante un cobro (D-10, H-5): el cobro queda, y su monto pasa a la cuenta una sola vez",
    async () => {
      const s = await seed();
      const kept = await sell(s.adminA, s.pesos, 2, s.clientA);
      const sale = await sell(s.adminA, s.pesos, 1, s.clientA);
      // Un primer cobro crea la fila del contador, para poder retenerla.
      await received(s.adminA, sale.id, s.methods.transfer, "100");
      const release = await hold(receiptCounter);
      const receiving = receive(s.adminA, sale.id, s.methods.transfer, "400");
      await waitForLockWaiters(1);
      // El cobro ya leyó la venta vigente y espera el contador: la anulación no toma el bloqueo de
      // cobros y pasa.
      await voided(s.adminA, sale.id);
      await release();
      expect(await receiving).toMatchObject({ ok: true });
      expect(await standing(s.adminA, sale.id)).toMatchObject({
        status: "voided",
        collected: "500.00",
        toAccount: "500.00",
      });
      // Los 500 se imputan a la otra venta, una sola vez.
      expect(await standing(s.adminA, kept.id)).toMatchObject({
        imputed: "500.00",
        outstanding: "1500.00",
      });
    },
    TEST_TIMEOUT,
  );

  it(
    "la venta sin cliente anulada durante un cobro: lo cobrado queda a devolver, una sola vez",
    async () => {
      const s = await seed();
      const sale = await sell(s.adminA, s.pesos, 1);
      await received(s.adminA, sale.id, s.methods.transfer, "100");
      const release = await hold(receiptCounter);
      const receiving = receive(s.adminA, sale.id, s.methods.transfer, "400");
      await waitForLockWaiters(1);
      await voided(s.adminA, sale.id);
      await release();
      expect(await receiving).toMatchObject({ ok: true });
      expect(await standing(s.adminA, sale.id)).toMatchObject({
        status: "voided",
        collected: "500.00",
        toRefund: "500.00",
        toAccount: "0.00",
      });
    },
    TEST_TIMEOUT,
  );

  it(
    "el cliente: el cobro espera una edición del cliente antes de tomar el contador, y otra organización no espera",
    async () => {
      const s = await seed();
      const sale = await sell(s.adminA, s.pesos, 1, s.clientA);
      const saleB = await sell(s.adminB, s.productB, 1);
      await received(s.adminA, sale.id, s.methods.transfer, "100");
      const release = await hold(
        sql`select 1 from clients where id = ${s.clientA} for update`,
      );
      const receiving = receive(s.adminA, sale.id, s.methods.transfer, "100");
      await waitForLockWaiters(1);
      // Espera en el cliente, no en el INSERT: el contador sigue libre (ADR 0022, punto 4).
      await getDb().transaction(async (tx) => {
        await tx.execute(
          sql`select 1 from document_counters
              where organization_id = ${s.orgA} and kind = 'receipt' for update nowait`,
        );
      });
      expect(
        await receive(s.adminB, saleB.id, s.methodsB.transfer, "1"),
      ).toMatchObject({ ok: true });
      await release();
      expect(await receiving).toMatchObject({ ok: true });
    },
    TEST_TIMEOUT,
  );

  it(
    "la venta anulada mientras el cobro espera al cliente: sale_voided, sin escribir",
    async () => {
      const s = await seed();
      const sale = await sell(s.adminA, s.pesos, 1, s.clientA);
      const release = await hold(
        sql`select 1 from clients where id = ${s.clientA} for update`,
      );
      const receiving = receive(s.adminA, sale.id, s.methods.transfer, "100");
      await waitForLockWaiters(1);
      await voided(s.adminA, sale.id);
      await release();
      expect(await receiving).toEqual({
        ok: false,
        code: "BUSINESS_RULE_VIOLATION",
        rule: "sale_voided",
      });
      expect((await snapshot()).receipts).toBe(0);
    },
    TEST_TIMEOUT,
  );
});

describe("las lecturas (AC-6)", () => {
  it(
    "los dos roles ven lo cobrado, el recibo y la lista; un viewer sin el contacto",
    async () => {
      const s = await seed();
      const sale = await sell(s.adminA, s.pesos, 1, s.clientA);
      const counter = await sell(s.adminA, s.pesos, 1);
      const first = await received(
        s.adminA,
        sale.id,
        s.methods.transfer,
        "100",
      );
      await received(s.adminA, counter.id, s.methods.debit, "200");
      await received(s.adminA, sale.id, s.methods.debit, "300");

      for (const context of [s.adminA, s.viewerA]) {
        expect(await standing(context, sale.id)).toMatchObject({
          collected: "400.00",
          outstanding: "600.00",
        });
      }
      const forAdmin = await getReceipt(s.adminA, first.id);
      const forViewer = await getReceipt(s.viewerA, first.id);
      if (!forAdmin.ok || !forViewer.ok) throw new Error("recibo rechazado");
      expect(forAdmin.receipt).toMatchObject({
        displayNumber: "R-000001",
        sale: { id: sale.id, displayNumber: sale.displayNumber },
        clientId: s.clientA,
        paymentMethodName: "Transferencia",
        currency: "ARS",
        amount: "100.00",
        session: null,
        createdByName: "Ana",
        client: { displayName: "Lucía Gómez" },
      });
      expect(forAdmin.receipt.client?.contact).not.toBeNull();
      expect(forViewer.receipt.client?.displayName).toBe("Lucía Gómez");
      expect(forViewer.receipt.client?.contact).toBeNull();

      const list = await listReceipts(s.viewerA, { number: "", page: 1 });
      if (!list.ok) throw new Error("lista rechazada");
      expect(
        list.receipts.map((r) => [
          r.displayNumber,
          r.client?.displayName ?? null,
        ]),
      ).toEqual([
        ["R-000003", "Lucía Gómez"],
        ["R-000002", null],
        ["R-000001", "Lucía Gómez"],
      ]);
      for (const search of ["R-000002", "r2", "2", "000002"]) {
        const found = await listReceipts(s.adminA, { number: search, page: 1 });
        if (!found.ok) throw new Error("búsqueda rechazada");
        expect(
          found.receipts.map((r) => r.displayNumber),
          search,
        ).toEqual(["R-000002"]);
      }
      for (const search of ["V-000002", "x", "R-0"]) {
        const found = await listReceipts(s.adminA, { number: search, page: 1 });
        if (!found.ok) throw new Error("búsqueda rechazada");
        expect(found.total, search).toBe(0);
      }
    },
    TEST_TIMEOUT,
  );

  it(
    "otra organización no ve los cobros",
    async () => {
      const s = await seed();
      const sale = await sell(s.adminA, s.pesos, 1);
      const receipt = await received(
        s.adminA,
        sale.id,
        s.methods.transfer,
        "1",
      );
      expect(await getReceipt(s.adminB, receipt.id)).toEqual({
        ok: false,
        code: "NOT_FOUND",
      });
      expect(await getSaleReceipts(s.adminB, sale.id)).toEqual({
        ok: false,
        code: "NOT_FOUND",
      });
      const list = await listReceipts(s.adminB, { number: "", page: 1 });
      expect(list).toMatchObject({ ok: true, total: 0 });
    },
    TEST_TIMEOUT,
  );

  it(
    "el formulario: lo que falta, los medios activos y la sesión abierta; solo admin",
    async () => {
      const s = await seed();
      const sale = await sell(s.adminA, s.pesos, 2);
      await received(s.adminA, sale.id, s.methods.transfer, "500");
      await deactivatePaymentMethod(s.adminA, s.methods.debit);
      const form = await getSaleReceiptForm(s.adminA, sale.id);
      if (!form.ok) throw new Error("formulario rechazado");
      expect(form).toMatchObject({
        sale: { id: sale.id, currency: "ARS" },
        outstanding: "1500.00",
        voided: false,
        openSession: null,
      });
      expect(form.paymentMethods.map((m) => m.name)).toEqual([
        "Efectivo",
        "Tarjeta de crédito",
        "Transferencia",
      ]);
      expect(await getSaleReceiptForm(s.viewerA, sale.id)).toEqual({
        ok: false,
        code: "FORBIDDEN",
      });
    },
    TEST_TIMEOUT,
  );

  it(
    "en una moneda sin decimales, el formulario propone lo que falta sin decimales, y el cobro lo acepta",
    async () => {
      const s = await seed();
      const adminAId = s.adminA.userId;
      const pesosChilenos = await insertProduct(s.orgA, "CLP-1", adminAId, {
        amount: "7400",
        currency: "CLP",
      });
      await stock(s.adminA, pesosChilenos.productId);
      const sale = await sell(s.adminA, pesosChilenos, 1);
      const form = await getSaleReceiptForm(s.adminA, sale.id);
      if (!form.ok) throw new Error("formulario rechazado");
      expect(form).toMatchObject({
        outstanding: "7400.00",
        outstandingInput: "7400",
      });
      expect(
        await receive(
          s.adminA,
          sale.id,
          s.methods.transfer,
          form.outstandingInput,
        ),
      ).toMatchObject({ ok: true });
      expect(await standing(s.adminA, sale.id)).toMatchObject({
        status: "collected",
      });
    },
    TEST_TIMEOUT,
  );

  it("el número de búsqueda de un recibo", () => {
    expect(parseReceiptNumberSearch("R-000123")).toBe(123);
    expect(parseReceiptNumberSearch(" r123 ")).toBe(123);
    expect(parseReceiptNumberSearch("000123")).toBe(123);
    expect(parseReceiptNumberSearch("V-000123")).toBeNull();
    expect(parseReceiptNumberSearch("R-0")).toBeNull();
    expect(parseReceiptNumberSearch("")).toBeNull();
  });
});

import { sql, type SQL } from "drizzle-orm";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { hashPassword, login } from "@/modules/auth";
import {
  closeCashSession,
  createAccountReceipt,
  createInitialPaymentMethods,
  createRefund,
  createSaleReceipt,
  deactivatePaymentMethod,
  getCashSession,
  getCashState,
  getClientAccountSummary,
  getSaleReceipts,
  listPaymentMethods,
  openCashSession,
  voidReceipt,
  voidRefund,
  type CashAmountInput,
} from "@/modules/cash";
import { adjustStock } from "@/modules/inventory";
import { getAuthContext, type AuthContext } from "@/modules/organizations";
import { issueSale } from "@/modules/sales";
import { getDb } from "@/shared/db";
import { resetDatabase } from "./reset-database";

// El cobro a cuenta contra PostgreSQL real (brief-21.6): el cobro y su imputación (AC-2), su
// anulación (AC-3), los rechazos (AC-4) y la serialización (AC-5, con los escenarios de D-11). Los
// helpers son los de refunds.test.ts. Un producto de precio 1000 por unidad: una venta de n unidades
// suma n × 1000.

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

// A con admin, viewer, un cliente, un producto en pesos y la lista inicial de medios; B con su
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
    sql`insert into clients (organization_id, display_name, phone_e164)
        values (${orgA}, 'Lucía Gómez', '+5491155550000') returning id`,
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

type Seed = Awaited<ReturnType<typeof seed>>;

// Una venta sin pedido de n unidades, del cliente o, con "", sin cliente.
async function sell(s: Seed, units: number, clientId: string) {
  const result = await issueSale(s.adminA, {
    clientId,
    lines: [
      {
        productId: s.pesos.productId,
        quantity: String(units),
        expectedPriceId: s.pesos.priceId,
      },
    ],
  });
  if (!result.ok) throw new Error(`venta rechazada: ${JSON.stringify(result)}`);
  return result.sale;
}

async function open(context: AuthContext, rows: CashAmountInput[]) {
  const result = await openCashSession(context, { rows });
  if (!result.ok)
    throw new Error(`apertura rechazada: ${JSON.stringify(result)}`);
  return result.session;
}

async function saleStanding(context: AuthContext, saleId: string) {
  const result = await getSaleReceipts(context, saleId);
  if (!result.ok) throw new Error(`lectura rechazada: ${result.code}`);
  return result.sale;
}

// Bloqueos retenidos del test en curso, como en order-receipts.test.ts.
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

// Si la promesa se resuelve o se rechaza antes del plazo, sin consumir su resultado.
async function settlesWithin(pending: Promise<unknown>, ms: number) {
  let settled = false;
  void pending.then(
    () => (settled = true),
    () => (settled = true),
  );
  await new Promise((resolve) => setTimeout(resolve, ms));
  return settled;
}

function cashLock(organizationId: string) {
  return sql`select pg_advisory_xact_lock(hashtextextended(${`cash:${organizationId}`}, 0))`;
}

// El bloqueo de cobros se retiene hasta que las dos escrituras esperan, en orden de llegada, y se
// libera.
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

function receiveAccount(
  s: Seed,
  amount: string,
  options: {
    context?: AuthContext;
    currency?: string;
    paymentMethodId?: string;
    clientId?: string;
  } = {},
) {
  return createAccountReceipt(options.context ?? s.adminA, {
    clientId: options.clientId ?? s.clientA,
    currency: options.currency ?? "ARS",
    paymentMethodId: options.paymentMethodId ?? s.methods.transfer,
    amount,
  });
}

async function receivedAccount(
  s: Seed,
  amount: string,
  options: Parameters<typeof receiveAccount>[2] = {},
) {
  const result = await receiveAccount(s, amount, options);
  if (!result.ok)
    throw new Error(`cobro a cuenta rechazado: ${JSON.stringify(result)}`);
  return result.receipt;
}

async function receiptRow(id: string) {
  const result = await getDb().execute<{
    target: string;
    client_id: string | null;
    sale_id: string | null;
    order_id: string | null;
    currency: string;
    amount: string;
    session_id: string | null;
  }>(
    sql`select target, client_id, sale_id, order_id, currency, amount, session_id
        from receipts where id = ${id}`,
  );
  return result.rows[0]!;
}

async function receiptSnapshot() {
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

async function summary(s: Seed, context = s.adminA) {
  const result = await getClientAccountSummary(context, s.clientA);
  if (!result.ok) throw new Error(`resumen rechazado: ${result.code}`);
  return result.currencies.map((row) => ({
    currency: row.currency,
    owed: row.owed,
    inFavor: row.inFavor,
  }));
}

describe("el cobro a cuenta (AC-2; ADR 0022, punto 9)", () => {
  it(
    "numera en R, se imputa de la venta más vieja a la más nueva, y lo que excede queda a favor",
    async () => {
      const s = await seed();
      const older = await sell(s, 2, s.clientA);
      const newer = await sell(s, 1, s.clientA);

      const first = await receivedAccount(s, "2500");
      expect(first.displayNumber).toBe("R-000001");
      expect(await receiptRow(first.id)).toEqual({
        target: "account",
        client_id: s.clientA,
        sale_id: null,
        order_id: null,
        currency: "ARS",
        amount: "2500.00",
        session_id: null,
      });
      expect(await saleStanding(s.adminA, older.id)).toMatchObject({
        imputed: "2000.00",
        outstanding: "0.00",
        status: "collected",
      });
      expect(await saleStanding(s.adminA, newer.id)).toMatchObject({
        imputed: "500.00",
        outstanding: "500.00",
        clientOwed: "500.00",
      });

      const second = await receivedAccount(s, "1000");
      expect(second.displayNumber).toBe("R-000002");
      expect(await saleStanding(s.adminA, newer.id)).toMatchObject({
        outstanding: "0.00",
      });
      expect(await summary(s)).toEqual([
        { currency: "ARS", owed: "0.00", inFavor: "500.00" },
      ]);

      // La auditoría: el recibo, sin datos de la persona.
      const audit = await getDb().execute<{ after: Record<string, unknown> }>(
        sql`select diff->'after' as after from audit_logs
            where entity_type = 'receipt' and entity_id = ${first.id}`,
      );
      expect(audit.rows[0]!.after).toEqual({
        number: 1,
        target: "account",
        payment_method: "Transferencia",
        currency: "ARS",
        amount: "2500.00",
      });
    },
    TEST_TIMEOUT,
  );

  it(
    "en una moneda sin ventas queda todo a favor, y a un cliente desactivado se le cobra",
    async () => {
      const s = await seed();
      await sell(s, 1, s.clientA);
      await getDb().execute(
        sql`update clients set is_active = false where id = ${s.clientA}`,
      );
      await receivedAccount(s, "150", { currency: "USD" });
      expect(await summary(s)).toEqual([
        { currency: "ARS", owed: "1000.00", inFavor: "0.00" },
        { currency: "USD", owed: "0.00", inFavor: "150.00" },
      ]);
    },
    TEST_TIMEOUT,
  );

  it(
    "en efectivo va a la sesión abierta y suma a lo esperado",
    async () => {
      const s = await seed();
      await sell(s, 1, s.clientA);
      const session = await open(s.adminA, [{ currency: "ARS", amount: "0" }]);
      const receipt = await receivedAccount(s, "700", {
        paymentMethodId: s.methods.cash,
      });
      expect(await receiptRow(receipt.id)).toMatchObject({
        session_id: session.id,
      });
      const state = await getCashState(s.adminA);
      if (!state.ok || !state.open) throw new Error("caja cerrada");
      expect(state.open.currencies).toMatchObject([
        { currency: "ARS", expected: "700.00" },
      ]);
    },
    TEST_TIMEOUT,
  );
});

describe("la anulación de un cobro a cuenta (AC-3)", () => {
  it(
    "la deuda vuelve; si lo devuelto lo exige, refunds_exceed_receipts",
    async () => {
      const s = await seed();
      const sale = await sell(s, 1, s.clientA);
      const receipt = await receivedAccount(s, "1500");
      expect(await summary(s)).toEqual([
        { currency: "ARS", owed: "0.00", inFavor: "500.00" },
      ]);
      const refund = await createRefund(s.adminA, {
        target: "account",
        clientId: s.clientA,
        currency: "ARS",
        paymentMethodId: s.methods.transfer,
        amount: "500",
      });
      if (!refund.ok) throw new Error("devolución rechazada");

      expect(
        await voidReceipt(s.adminA, {
          receiptId: receipt.id,
          reason: "wrong_amount",
        }),
      ).toEqual({
        ok: false,
        code: "BUSINESS_RULE_VIOLATION",
        rule: "refunds_exceed_receipts",
        currency: "ARS",
        refunded: "500.00",
      });

      const undone = await voidRefund(s.adminA, {
        refundId: refund.refund.id,
        reason: "not_paid",
      });
      expect(undone).toMatchObject({ ok: true });
      expect(
        await voidReceipt(s.adminA, {
          receiptId: receipt.id,
          reason: "wrong_amount",
        }),
      ).toMatchObject({ ok: true });
      expect(await saleStanding(s.adminA, sale.id)).toMatchObject({
        imputed: "0.00",
        outstanding: "1000.00",
      });
      expect(await summary(s)).toEqual([
        { currency: "ARS", owed: "1000.00", inFavor: "0.00" },
      ]);
    },
    TEST_TIMEOUT,
  );
});

describe("los rechazos (AC-4)", () => {
  it(
    "cada rechazo, sin escribir, numerar ni auditar",
    async () => {
      const s = await seed();
      await sell(s, 1, s.clientA);
      await deactivatePaymentMethod(s.adminA, s.methods.debit);
      const before = await receiptSnapshot();

      expect(await receiveAccount(s, "100", { context: s.viewerA })).toEqual({
        ok: false,
        code: "FORBIDDEN",
      });
      expect(
        await receiveAccount(s, "100", { clientId: "no-es-un-uuid" }),
      ).toEqual({ ok: false, code: "VALIDATION_ERROR" });
      expect(await receiveAccount(s, "100", { currency: "XXX" })).toEqual({
        ok: false,
        code: "VALIDATION_ERROR",
        fields: ["currency"],
      });
      expect(await receiveAccount(s, "0")).toMatchObject({
        ok: false,
        code: "VALIDATION_ERROR",
        fields: ["amount"],
      });
      expect(await receiveAccount(s, "100", { clientId: s.clientB })).toEqual({
        ok: false,
        code: "NOT_FOUND",
        entity: "client",
      });
      expect(
        await receiveAccount(s, "100", {
          paymentMethodId: s.methodsB.transfer,
        }),
      ).toEqual({ ok: false, code: "NOT_FOUND", entity: "payment_method" });
      expect(
        await receiveAccount(s, "100", { paymentMethodId: s.methods.debit }),
      ).toEqual({
        ok: false,
        code: "BUSINESS_RULE_VIOLATION",
        rule: "payment_method_inactive",
      });
      expect(
        await receiveAccount(s, "100", { paymentMethodId: s.methods.cash }),
      ).toEqual({
        ok: false,
        code: "BUSINESS_RULE_VIOLATION",
        rule: "no_open_session",
      });
      // Un efectivo que pasaría lo que cabe en numeric(14, 2) en lo esperado de la sesión.
      await open(s.adminA, [{ currency: "ARS", amount: "999999999999" }]);
      expect(
        await receiveAccount(s, "1", { paymentMethodId: s.methods.cash }),
      ).toEqual({
        ok: false,
        code: "VALIDATION_ERROR",
        fields: ["amount"],
        amount: "limit",
      });

      expect(await receiptSnapshot()).toEqual(before);
    },
    TEST_TIMEOUT,
  );
});

describe("la serialización (AC-5)", () => {
  it(
    "el cobro a cuenta espera el bloqueo de cobros, y el de otra organización no",
    async () => {
      const s = await seed();
      await sell(s, 1, s.clientA);
      const release = await hold(cashLock(s.orgA));
      const receiving = receiveAccount(s, "100");
      // La regla, antes del ayudante que cuenta las conexiones en espera.
      expect(await settlesWithin(receiving, 1000)).toBe(false);
      expect(await receiptSnapshot()).toMatchObject({ receipts: 0 });
      await waitForLockWaiters(1);
      expect(
        await receiveAccount(s, "100", {
          context: s.adminB,
          clientId: s.clientB,
          paymentMethodId: s.methodsB.transfer,
        }),
      ).toMatchObject({ ok: true });
      await release();
      expect(await receiving).toMatchObject({ ok: true });
    },
    TEST_TIMEOUT,
  );

  // D-11 y H-2: el escenario de AC-5 que el sistema puede producir. El cobro a cuenta mueve el
  // remanente; el cobro de una venta en cola detrás de él ve lo que falta después.
  it(
    "un cobro a cuenta y el cobro de una venta del mismo cliente, en cola y en los dos órdenes",
    async () => {
      for (const accountFirst of [true, false]) {
        await resetDatabase(getDb());
        const s = await seed();
        const older = await sell(s, 1, s.clientA);
        const newer = await sell(s, 1, s.clientA);
        const account = () => receiveAccount(s, "1000");
        const direct = () =>
          createSaleReceipt(s.adminA, {
            saleId: older.id,
            paymentMethodId: s.methods.transfer,
            amount: "1000",
          });
        if (accountFirst) {
          const [first, second] = await queued(s.orgA, account, direct);
          expect(first).toMatchObject({ ok: true });
          // El cobro a cuenta ya cubrió la venta más vieja.
          expect(second).toEqual({
            ok: false,
            code: "BUSINESS_RULE_VIOLATION",
            rule: "exceeds_outstanding",
            currency: "ARS",
            outstanding: "0.00",
          });
          expect(await saleStanding(s.adminA, newer.id)).toMatchObject({
            outstanding: "1000.00",
          });
        } else {
          const [first, second] = await queued(s.orgA, direct, account);
          expect(first).toMatchObject({ ok: true });
          expect(second).toMatchObject({ ok: true });
          // La venta más vieja ya estaba cobrada: el cobro a cuenta va a la siguiente.
          expect(await saleStanding(s.adminA, newer.id)).toMatchObject({
            imputed: "1000.00",
            outstanding: "0.00",
          });
        }
        expect(await summary(s)).toEqual(
          accountFirst
            ? [{ currency: "ARS", owed: "1000.00", inFavor: "0.00" }]
            : [],
        );
      }
    },
    TEST_TIMEOUT * 2,
  );

  it(
    "un cobro a cuenta y una devolución desde la cuenta, en cola y en los dos órdenes",
    async () => {
      for (const accountFirst of [true, false]) {
        await resetDatabase(getDb());
        const s = await seed();
        const account = () => receiveAccount(s, "500");
        const refund = () =>
          createRefund(s.adminA, {
            target: "account",
            clientId: s.clientA,
            currency: "ARS",
            paymentMethodId: s.methods.transfer,
            amount: "500",
          });
        if (accountFirst) {
          const [received, refunded] = await queued(s.orgA, account, refund);
          expect(received).toMatchObject({ ok: true });
          // La devolución que espera ve lo que el cobro dejó a favor.
          expect(refunded).toMatchObject({ ok: true });
          expect(await summary(s)).toEqual([]);
        } else {
          const [refunded, received] = await queued(s.orgA, refund, account);
          expect(refunded).toEqual({
            ok: false,
            code: "BUSINESS_RULE_VIOLATION",
            rule: "exceeds_refundable",
            currency: "ARS",
            available: "0.00",
          });
          expect(received).toMatchObject({ ok: true });
          expect(await summary(s)).toEqual([
            { currency: "ARS", owed: "0.00", inFavor: "500.00" },
          ]);
        }
      }
    },
    TEST_TIMEOUT * 2,
  );

  it(
    "un cobro a cuenta en efectivo y el cierre, en cola y en los dos órdenes",
    async () => {
      for (const accountFirst of [true, false]) {
        await resetDatabase(getDb());
        const s = await seed();
        await sell(s, 1, s.clientA);
        const session = await open(s.adminA, [
          { currency: "ARS", amount: "500" },
        ]);
        const account = () =>
          receiveAccount(s, "300", { paymentMethodId: s.methods.cash });
        const close = () =>
          closeCashSession(s.adminA, {
            sessionId: session.id,
            rows: [{ currency: "ARS", amount: accountFirst ? "800" : "500" }],
          });
        if (accountFirst) {
          const [received, closed] = await queued(s.orgA, account, close);
          expect(received).toMatchObject({ ok: true });
          expect(closed).toMatchObject({ ok: true });
        } else {
          const [closed, received] = await queued(s.orgA, close, account);
          expect(closed).toMatchObject({ ok: true });
          expect(received).toMatchObject({ rule: "no_open_session" });
        }
        const detail = await getCashSession(s.adminA, session.id);
        if (!detail.ok) throw new Error("sesión rechazada");
        expect(detail.session.currencies).toMatchObject([
          {
            expected: accountFirst ? "800.00" : "500.00",
            difference: { sign: "zero" },
          },
        ]);
      }
    },
    TEST_TIMEOUT * 2,
  );
});

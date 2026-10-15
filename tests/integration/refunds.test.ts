import { sql, type SQL } from "drizzle-orm";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { hashPassword, login } from "@/modules/auth";
import {
  closeCashSession,
  createInitialPaymentMethods,
  createOrderReceipt,
  createRefund,
  createSaleReceipt,
  deactivatePaymentMethod,
  getCashSession,
  getClientRefundForm,
  getRefund,
  getCashState,
  getSaleReceipts,
  listPaymentMethods,
  listRefunds,
  openCashSession,
  voidReceipt,
  voidRefund,
  type CashAmountInput,
} from "@/modules/cash";
import { adjustStock } from "@/modules/inventory";
import { cancelOrder, confirmOrder, createOrder } from "@/modules/orders";
import { getAuthContext, type AuthContext } from "@/modules/organizations";
import { issueSale, voidSale } from "@/modules/sales";
import { getDb } from "@/shared/db";
import { resetDatabase } from "./reset-database";

// La devolución y su anulación contra PostgreSQL real (brief-21.5): la devolución desde la cuenta y
// desde una venta sin cliente (AC-3), su anulación (AC-4), los rechazos (AC-6), la serialización
// (AC-7, con D-11 y D-12) y las lecturas (AC-8). Los helpers son los de receipt-voids.test.ts. Un producto de precio 1000 por unidad: un pedido o una
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

async function order(s: Seed, units: number) {
  const result = await createOrder(s.adminA, {
    clientId: s.clientA,
    lines: [
      {
        productId: s.pesos.productId,
        quantity: String(units),
        expectedPriceId: s.pesos.priceId,
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

async function received(
  context: AuthContext,
  saleId: string,
  paymentMethodId: string,
  amount: string,
) {
  const result = await createSaleReceipt(context, {
    saleId,
    paymentMethodId,
    amount,
  });
  if (!result.ok) throw new Error(`cobro rechazado: ${JSON.stringify(result)}`);
  return result.receipt;
}

async function deposited(
  context: AuthContext,
  orderId: string,
  paymentMethodId: string,
  amount: string,
) {
  const result = await createOrderReceipt(context, {
    orderId,
    paymentMethodId,
    amount,
  });
  if (!result.ok) throw new Error(`seña rechazada: ${JSON.stringify(result)}`);
  return result.receipt;
}

function refundAccount(
  s: Seed,
  amount: string,
  paymentMethodId = s.methods.transfer,
) {
  return createRefund(s.adminA, {
    target: "account",
    clientId: s.clientA,
    currency: "ARS",
    paymentMethodId,
    amount,
  });
}

async function refundedAccount(s: Seed, amount: string) {
  const result = await refundAccount(s, amount);
  if (!result.ok)
    throw new Error(`devolución rechazada: ${JSON.stringify(result)}`);
  return result.refund;
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

async function refundRow(id: string) {
  const result = await getDb().execute<{
    target: string;
    client_id: string | null;
    sale_id: string | null;
    currency: string;
    amount: string;
    session_id: string | null;
  }>(
    sql`select target, client_id, sale_id, currency, amount, session_id
        from refunds where id = ${id}`,
  );
  return result.rows[0]!;
}

function refundSale(
  s: Seed,
  saleId: string,
  amount: string,
  paymentMethodId = s.methods.transfer,
) {
  return createRefund(s.adminA, {
    target: "sale",
    saleId,
    paymentMethodId,
    amount,
  });
}

function undo(context: AuthContext, refundId: string, reason = "wrong_amount") {
  return voidRefund(context, { refundId, reason });
}

async function refundSnapshot() {
  const result = await getDb().execute<{
    refunds: number;
    voids: number;
    audits: number;
    counter: number | null;
  }>(
    sql`select
          (select count(*)::int from refunds) as refunds,
          (select count(*)::int from refund_voids) as voids,
          (select count(*)::int from audit_logs where entity_type = 'refund') as audits,
          (select max(last_number)::int from document_counters where kind = 'refund')
            as counter`,
  );
  return result.rows[0]!;
}

async function inFavor(s: Seed) {
  const form = await getClientRefundForm(s.adminA, s.clientA);
  if (!form.ok) throw new Error(`formulario rechazado: ${form.code}`);
  return form.inFavor.map((row) => [row.currency, row.amount]);
}

// El cliente con 2000 a favor: una venta de dos unidades cobrada entera y anulada.
async function withCredit(s: Seed) {
  const gone = await sell(s, 2, s.clientA);
  const receipt = await received(s.adminA, gone.id, s.methods.transfer, "2000");
  await voided(s.adminA, gone.id);
  return { gone, receipt };
}

describe("la devolución desde la cuenta (AC-3; ADR 0022, punto 7)", () => {
  it(
    "numera en D, devuelve hasta lo que está a favor sin tocar lo que le falta a ninguna venta, y se audita",
    async () => {
      const s = await seed();
      await withCredit(s);
      // Una venta con saldo recibe 1000 del remanente: a favor quedan 1000, no 2000 (H-2).
      const sale = await sell(s, 1, s.clientA);
      expect(await saleStanding(s.adminA, sale.id)).toMatchObject({
        imputed: "1000.00",
        outstanding: "0.00",
      });
      expect(await inFavor(s)).toEqual([["ARS", "1000.00"]]);
      const before = await refundSnapshot();
      expect(await refundAccount(s, "1000,01")).toEqual({
        ok: false,
        code: "BUSINESS_RULE_VIOLATION",
        rule: "exceeds_refundable",
        currency: "ARS",
        available: "1000.00",
      });
      expect(await refundSnapshot()).toEqual(before);
      const refund = await refundedAccount(s, "600");
      expect(refund).toEqual({
        id: expect.any(String),
        number: 1,
        displayNumber: "D-000001",
      });
      expect(await refundRow(refund.id)).toEqual({
        target: "account",
        client_id: s.clientA,
        sale_id: null,
        currency: "ARS",
        amount: "600.00",
        session_id: null,
      });
      expect(await saleStanding(s.adminA, sale.id)).toMatchObject({
        outstanding: "0.00",
      });
      expect(await inFavor(s)).toEqual([["ARS", "400.00"]]);
      const audit = await getDb().execute<{ action: string; diff: unknown }>(
        sql`select action, diff from audit_logs
            where entity_type = 'refund' and entity_id = ${refund.id}`,
      );
      expect(audit.rows).toEqual([
        {
          action: "create",
          diff: {
            before: null,
            after: {
              number: 1,
              target: "account",
              payment_method: "Transferencia",
              currency: "ARS",
              amount: "600.00",
            },
          },
        },
      ]);
      // En una moneda sin saldo a favor no hay nada que devolver.
      expect(
        await createRefund(s.adminA, {
          target: "account",
          clientId: s.clientA,
          currency: "USD",
          paymentMethodId: s.methods.transfer,
          amount: "1",
        }),
      ).toMatchObject({ rule: "exceeds_refundable", available: "0.00" });
    },
    TEST_TIMEOUT,
  );

  it(
    "en efectivo sale de la sesión abierta y baja lo esperado; nunca lo deja negativo; sin sesión, no_open_session",
    async () => {
      const s = await seed();
      await withCredit(s);
      expect(await refundAccount(s, "100", s.methods.cash)).toMatchObject({
        ok: false,
        rule: "no_open_session",
      });
      const session = await open(s.adminA, [
        { currency: "ARS", amount: "500" },
      ]);
      const before = await refundSnapshot();
      expect(await refundAccount(s, "501", s.methods.cash)).toEqual({
        ok: false,
        code: "BUSINESS_RULE_VIOLATION",
        rule: "insufficient_cash",
        currency: "ARS",
        expected: "500.00",
      });
      expect(await refundSnapshot()).toEqual(before);
      const result = await refundAccount(s, "300", s.methods.cash);
      if (!result.ok) throw new Error("devolución rechazada");
      expect((await refundRow(result.refund.id)).session_id).toBe(session.id);
      const state = await getCashState(s.adminA);
      if (!state.ok || !state.open) throw new Error("caja cerrada");
      expect(state.open.currencies).toMatchObject([
        { currency: "ARS", refunds: "300.00", expected: "200.00" },
      ]);
      expect(state.open.refunds.map((row) => row.displayNumber)).toEqual([
        "D-000001",
      ]);
      // El cierre cuenta la devolución.
      expect(
        await closeCashSession(s.adminA, {
          sessionId: session.id,
          rows: [{ currency: "ARS", amount: "200" }],
        }),
      ).toMatchObject({ ok: true });
    },
    TEST_TIMEOUT,
  );
});

describe("la devolución de una venta sin cliente (AC-3; ADR 0022, punto 6)", () => {
  it(
    "solo de una venta sin cliente y anulada, hasta lo que queda a devolver",
    async () => {
      const s = await seed();
      const counter = await sell(s, 1, "");
      await received(s.adminA, counter.id, s.methods.transfer, "1000");
      expect(await refundSale(s, counter.id, "1")).toEqual({
        ok: false,
        code: "BUSINESS_RULE_VIOLATION",
        rule: "sale_not_refundable",
      });
      await voided(s.adminA, counter.id);
      expect(await saleStanding(s.adminA, counter.id)).toMatchObject({
        toRefund: "1000.00",
        refunded: "0.00",
      });
      const refund = await refundSale(s, counter.id, "400");
      if (!refund.ok) throw new Error("devolución rechazada");
      expect(await refundRow(refund.refund.id)).toMatchObject({
        target: "sale",
        client_id: null,
        sale_id: counter.id,
      });
      const standing = await saleStanding(s.adminA, counter.id);
      expect(standing).toMatchObject({
        toRefund: "600.00",
        refunded: "400.00",
      });
      expect(standing.refunds.map((row) => row.displayNumber)).toEqual([
        "D-000001",
      ]);
      expect(await refundSale(s, counter.id, "600,01")).toMatchObject({
        rule: "exceeds_refundable",
        available: "600.00",
      });
      // Con cliente, lo cobrado pasó a la cuenta: se devuelve desde ahí.
      const { gone } = await withCredit(s);
      expect(await refundSale(s, gone.id, "1")).toMatchObject({
        rule: "sale_not_refundable",
      });
      const audit = await getDb().execute<{ diff: { after: unknown } }>(
        sql`select diff from audit_logs
            where entity_type = 'refund' and entity_id = ${refund.refund.id}`,
      );
      expect(audit.rows[0]!.diff.after).toMatchObject({
        target: "sale",
        sale_number: counter.number,
      });
    },
    TEST_TIMEOUT,
  );
});

describe("la anulación de una devolución (AC-4)", () => {
  it(
    "numera en AD, lo devuelto vuelve a estar a favor o a devolver, y ya anulada se rechaza",
    async () => {
      const s = await seed();
      await withCredit(s);
      const refund = await refundedAccount(s, "500");
      expect(await inFavor(s)).toEqual([["ARS", "1500.00"]]);
      expect(await undo(s.adminA, refund.id, "not_paid")).toEqual({
        ok: true,
        refund,
        refundVoid: {
          id: expect.any(String),
          number: 1,
          displayNumber: "AD-000001",
        },
      });
      expect(await inFavor(s)).toEqual([["ARS", "2000.00"]]);
      const audit = await getDb().execute<{ action: string; diff: unknown }>(
        sql`select action, diff from audit_logs
            where entity_type = 'refund' and action = 'void'`,
      );
      expect(audit.rows[0]!.diff).toEqual({
        before: { void_number: null, reason: null },
        after: { void_number: 1, reason: "not_paid" },
      });
      const before = await refundSnapshot();
      expect(await undo(s.adminA, refund.id)).toMatchObject({
        ok: false,
        rule: "already_voided",
        void: { displayNumber: "AD-000001" },
      });
      expect(await refundSnapshot()).toEqual(before);

      const counter = await sell(s, 1, "");
      await received(s.adminA, counter.id, s.methods.transfer, "1000");
      await voided(s.adminA, counter.id);
      const back = await refundSale(s, counter.id, "1000");
      if (!back.ok) throw new Error("devolución rechazada");
      await undo(s.adminA, back.refund.id);
      expect(await saleStanding(s.adminA, counter.id)).toMatchObject({
        toRefund: "1000.00",
        refunded: "0.00",
      });
    },
    TEST_TIMEOUT,
  );

  it(
    "con su sesión abierta vuelve a lo esperado; con la cerrada no la toca y se lista como posterior",
    async () => {
      const s = await seed();
      await withCredit(s);
      const first = await open(s.adminA, [{ currency: "ARS", amount: "500" }]);
      const inSession = await refundAccount(s, "200", s.methods.cash);
      const later = await refundAccount(s, "100", s.methods.cash);
      if (!inSession.ok || !later.ok) throw new Error("devolución rechazada");
      await undo(s.adminA, inSession.refund.id);
      const state = await getCashState(s.adminA);
      if (!state.ok || !state.open) throw new Error("caja cerrada");
      expect(state.open.currencies).toMatchObject([
        { refunds: "300.00", refundVoids: "200.00", expected: "400.00" },
      ]);
      await closeCashSession(s.adminA, {
        sessionId: first.id,
        rows: [{ currency: "ARS", amount: "400" }],
      });
      await open(s.adminA, [{ currency: "ARS", amount: "400" }]);
      await undo(s.adminA, later.refund.id);
      const closed = await getCashSession(s.adminA, first.id);
      if (!closed.ok) throw new Error("sesión rechazada");
      expect(closed.session.currencies).toMatchObject([
        { expected: "400.00", counted: "400.00" },
      ]);
      expect(
        closed.session.lateVoids.map((row) => [
          row.kind,
          row.displayNumber,
          row.source.displayNumber,
        ]),
      ).toEqual([["refund", "AD-000002", "D-000002"]]);
      const reopened = await getCashState(s.adminA);
      if (!reopened.ok || !reopened.open) throw new Error("caja cerrada");
      expect(reopened.open.currencies).toMatchObject([{ expected: "400.00" }]);
    },
    TEST_TIMEOUT,
  );
});

describe("los rechazos (AC-6)", () => {
  it(
    "un viewer, un destino o una moneda inválidos, lo que no existe en la organización y un medio inactivo",
    async () => {
      const s = await seed();
      await withCredit(s);
      const refund = await refundedAccount(s, "100");
      const before = await refundSnapshot();
      expect(
        await createRefund(s.viewerA, {
          target: "account",
          clientId: s.clientA,
          currency: "ARS",
          paymentMethodId: s.methods.transfer,
          amount: "1",
        }),
      ).toMatchObject({ ok: false, code: "FORBIDDEN" });
      expect(await undo(s.viewerA, refund.id)).toMatchObject({
        ok: false,
        code: "FORBIDDEN",
      });
      expect(
        await createRefund(s.adminA, {
          target: "pedido",
          clientId: s.clientA,
          paymentMethodId: s.methods.transfer,
          amount: "1",
        }),
      ).toEqual({ ok: false, code: "VALIDATION_ERROR", fields: ["target"] });
      expect(
        await createRefund(s.adminA, {
          target: "account",
          clientId: s.clientA,
          currency: "XXX",
          paymentMethodId: s.methods.transfer,
          amount: "",
        }),
      ).toEqual({
        ok: false,
        code: "VALIDATION_ERROR",
        fields: ["amount", "currency"],
        amount: "required",
      });
      expect(
        await createRefund(s.adminA, {
          target: "account",
          clientId: s.clientB,
          currency: "ARS",
          paymentMethodId: s.methods.transfer,
          amount: "1",
        }),
      ).toEqual({ ok: false, code: "NOT_FOUND", entity: "client" });
      const saleB = await issueSale(s.adminB, {
        clientId: "",
        lines: [
          {
            productId: s.productB.productId,
            quantity: "1",
            expectedPriceId: s.productB.priceId,
          },
        ],
      });
      if (!saleB.ok) throw new Error("venta de B rechazada");
      expect(await refundSale(s, saleB.sale.id, "1")).toEqual({
        ok: false,
        code: "NOT_FOUND",
        entity: "sale",
      });
      expect(await undo(s.adminB, refund.id)).toEqual({
        ok: false,
        code: "NOT_FOUND",
        entity: "refund",
      });
      expect(await undo(s.adminA, refund.id, "porque sí")).toEqual({
        ok: false,
        code: "VALIDATION_ERROR",
        fields: ["reason"],
      });
      await deactivatePaymentMethod(s.adminA, s.methods.debit);
      expect(await refundAccount(s, "1", s.methods.debit)).toMatchObject({
        ok: false,
        rule: "payment_method_inactive",
      });
      expect(await refundSnapshot()).toEqual(before);
    },
    TEST_TIMEOUT,
  );
});

describe("la serialización (AC-7)", () => {
  it(
    "la devolución y su anulación esperan el bloqueo de cobros, y las de otra organización no",
    async () => {
      const s = await seed();
      await withCredit(s);
      const done = await refundedAccount(s, "100");
      // La otra organización, con 1000 a favor de su cliente.
      const saleB = await issueSale(s.adminB, {
        clientId: s.clientB,
        lines: [
          {
            productId: s.productB.productId,
            quantity: "1",
            expectedPriceId: s.productB.priceId,
          },
        ],
      });
      if (!saleB.ok) throw new Error("venta de B rechazada");
      await received(s.adminB, saleB.sale.id, s.methodsB.transfer, "1000");
      await voided(s.adminB, saleB.sale.id);
      const release = await hold(cashLock(s.orgA));
      const refunding = refundAccount(s, "100");
      const undoing = undo(s.adminA, done.id);
      let settled = 0;
      for (const pending of [refunding, undoing]) {
        void pending.then(
          () => (settled += 1),
          () => (settled += 1),
        );
      }
      // La regla, antes del ayudante que cuenta las conexiones en espera.
      await new Promise((resolve) => setTimeout(resolve, 1000));
      expect(settled).toBe(0);
      expect(await refundSnapshot()).toMatchObject({ refunds: 1, voids: 0 });
      await waitForLockWaiters(2);
      const refundB = await createRefund(s.adminB, {
        target: "account",
        clientId: s.clientB,
        currency: "ARS",
        paymentMethodId: s.methodsB.transfer,
        amount: "100",
      });
      if (!refundB.ok) throw new Error("devolución de B rechazada");
      expect(await undo(s.adminB, refundB.refund.id)).toMatchObject({
        ok: true,
      });
      expect(settled).toBe(0);
      await release();
      expect(await refunding).toMatchObject({ ok: true });
      expect(await undoing).toMatchObject({ ok: true });
    },
    TEST_TIMEOUT,
  );

  it(
    "dos devoluciones de la misma cuenta en cola que juntas superan lo que está a favor",
    async () => {
      const s = await seed();
      await withCredit(s);
      const [first, second] = await queued(
        s.orgA,
        () => refundAccount(s, "1500"),
        () => refundAccount(s, "1500"),
      );
      expect(first).toMatchObject({ ok: true });
      expect(second).toEqual({
        ok: false,
        code: "BUSINESS_RULE_VIOLATION",
        rule: "exceeds_refundable",
        currency: "ARS",
        available: "500.00",
      });
    },
    TEST_TIMEOUT,
  );

  it(
    "una devolución y la anulación del cobro que la sostiene, en cola y en los dos órdenes: una y un rechazo",
    async () => {
      for (const refundFirst of [true, false]) {
        await resetDatabase(getDb());
        const s = await seed();
        const { receipt } = await withCredit(s);
        const refund = () => refundAccount(s, "2000");
        const cancel = () =>
          voidReceipt(s.adminA, { receiptId: receipt.id, reason: "other" });
        if (refundFirst) {
          const [refunded, voiding] = await queued(s.orgA, refund, cancel);
          expect(refunded).toMatchObject({ ok: true });
          expect(voiding).toMatchObject({
            ok: false,
            rule: "refunds_exceed_receipts",
            refunded: "2000.00",
          });
        } else {
          const [voiding, refunded] = await queued(s.orgA, cancel, refund);
          expect(voiding).toMatchObject({ ok: true });
          expect(refunded).toMatchObject({
            ok: false,
            rule: "exceeds_refundable",
            available: "0.00",
          });
        }
      }
    },
    TEST_TIMEOUT * 2,
  );

  it(
    "una devolución en efectivo y el cierre, en cola y en los dos órdenes",
    async () => {
      for (const refundFirst of [true, false]) {
        await resetDatabase(getDb());
        const s = await seed();
        await withCredit(s);
        const session = await open(s.adminA, [
          { currency: "ARS", amount: "500" },
        ]);
        const refund = () => refundAccount(s, "300", s.methods.cash);
        const close = () =>
          closeCashSession(s.adminA, {
            sessionId: session.id,
            rows: [{ currency: "ARS", amount: refundFirst ? "200" : "500" }],
          });
        if (refundFirst) {
          const [refunded, closed] = await queued(s.orgA, refund, close);
          expect(refunded).toMatchObject({ ok: true });
          expect(closed).toMatchObject({ ok: true });
        } else {
          const [closed, refunded] = await queued(s.orgA, close, refund);
          expect(closed).toMatchObject({ ok: true });
          expect(refunded).toMatchObject({ rule: "no_open_session" });
        }
        const detail = await getCashSession(s.adminA, session.id);
        if (!detail.ok) throw new Error("sesión rechazada");
        expect(detail.session.currencies).toMatchObject([
          {
            expected: refundFirst ? "200.00" : "500.00",
            difference: { sign: "zero" },
          },
        ]);
      }
    },
    TEST_TIMEOUT * 2,
  );

  // H-4 y D-11: anular una venta o cancelar un pedido no toman el bloqueo de cobros y se cruzan con
  // una devolución que ya leyó lo disponible y espera el contador. Solo agrandan lo que está a favor:
  // lo devuelto sigue cabiendo, una sola vez.
  for (const crossing of [
    "la anulación de una venta",
    "la cancelación de un pedido",
  ]) {
    it(
      `una devolución cruzada con ${crossing} del mismo cliente`,
      async () => {
        const s = await seed();
        // Lo que se cruza, antes del saldo a favor: una venta emitida después lo absorbería.
        let cross: () => Promise<void>;
        let freed: string;
        if (crossing === "la anulación de una venta") {
          // Le faltan 700, que el saldo a favor cubre; anulada, libera esos 700 y sus 300.
          const other = await sell(s, 1, s.clientA);
          await received(s.adminA, other.id, s.methods.transfer, "300");
          cross = () => voided(s.adminA, other.id);
          freed = "1000.00";
        } else {
          // La seña retenida pasa a la cuenta al cancelar.
          const placed = await order(s, 1);
          await deposited(s.adminA, placed.id, s.methods.transfer, "300");
          cross = () => step(cancelOrder, s.adminA, placed.id);
          freed = "300.00";
        }
        await withCredit(s);
        // La primera devolución crea la fila del contador, para poder retenerla.
        await refundedAccount(s, "100");
        const available = (await inFavor(s))[0]![1]!;
        const release = await hold(
          sql`select 1 from document_counters where kind = 'refund' for update`,
        );
        // Lee lo disponible y espera el contador.
        const refunding = refundAccount(s, available);
        await waitForLockWaiters(1);
        await cross();
        await release();
        expect(await refunding).toMatchObject({ ok: true });
        // Lo que el cruce pasó a la cuenta queda a favor, una sola vez.
        expect(await inFavor(s)).toEqual([["ARS", freed]]);
      },
      TEST_TIMEOUT,
    );
  }

  // D-11 precisado tras la revisión independiente: emitir una venta sí achica lo que está a favor, y
  // la devolución desde la cuenta toma la ficha del cliente en modo exclusivo para que se esperen.
  for (const first of ["la devolución", "la venta"]) {
    it(
      `una devolución desde la cuenta y una venta del mismo cliente, cruzadas, con ${first} primero`,
      async () => {
        const s = await seed();
        await withCredit(s);
        // La primera devolución crea la fila del contador, para poder retenerla.
        await refundedAccount(s, "100");
        const available = (await inFavor(s))[0]![1]!;
        expect(available).toBe("1900.00");
        if (first === "la devolución") {
          // La devolución toma la ficha y espera el contador; la venta espera la ficha.
          const release = await hold(
            sql`select 1 from document_counters where kind = 'refund' for update`,
          );
          const refunding = refundAccount(s, available);
          await waitForLockWaiters(1);
          const selling = sell(s, 1, s.clientA);
          // La regla, antes del ayudante que cuenta las conexiones en espera (lección de la 21.4).
          expect(await settlesWithin(selling, 1000)).toBe(false);
          await waitForLockWaiters(2);
          await release();
          expect(await refunding).toMatchObject({ ok: true });
          // Lo que estaba a favor ya se devolvió: la venta queda debiendo entera.
          const sale = await selling;
          expect(await saleStanding(s.adminA, sale.id)).toMatchObject({
            outstanding: "1000.00",
          });
        } else {
          // La venta toma la ficha en modo compartido y espera el contador; la devolución espera la
          // ficha y lee lo que está a favor después de la venta.
          const release = await hold(
            sql`select 1 from document_counters where kind = 'sale' for update`,
          );
          const selling = sell(s, 1, s.clientA);
          await waitForLockWaiters(1);
          const refunding = refundAccount(s, available);
          expect(await settlesWithin(refunding, 1000)).toBe(false);
          await waitForLockWaiters(2);
          await release();
          const sale = await selling;
          expect(await refunding).toMatchObject({
            ok: false,
            rule: "exceeds_refundable",
            available: "900.00",
          });
          expect(await saleStanding(s.adminA, sale.id)).toMatchObject({
            outstanding: "0.00",
          });
        }
      },
      TEST_TIMEOUT,
    );
  }

  it(
    "D-12: un cobro en cola detrás de la anulación de una devolución ve lo que falta después de ella",
    async () => {
      const s = await seed();
      await withCredit(s);
      const refund = await refundedAccount(s, "2000");
      const sale = await sell(s, 2, s.clientA);
      expect(await saleStanding(s.adminA, sale.id)).toMatchObject({
        outstanding: "2000.00",
      });
      // Anulada la devolución, los 2000 vuelven al remanente y la venta queda cobrada: el cobro en
      // cola tiene que verlo.
      const [undone, receiving] = await queued(
        s.orgA,
        () => undo(s.adminA, refund.id),
        () =>
          createSaleReceipt(s.adminA, {
            saleId: sale.id,
            paymentMethodId: s.methods.transfer,
            amount: "1",
          }),
      );
      expect(undone).toMatchObject({ ok: true });
      expect(receiving).toEqual({
        ok: false,
        code: "BUSINESS_RULE_VIOLATION",
        rule: "exceeds_outstanding",
        currency: "ARS",
        outstanding: "0.00",
      });
    },
    TEST_TIMEOUT,
  );
});

describe("las lecturas (AC-8)", () => {
  it(
    "los dos roles ven el comprobante y la lista con su búsqueda; un viewer sin el contacto; otra organización no",
    async () => {
      const s = await seed();
      await withCredit(s);
      const refund = await refundedAccount(s, "250");
      await undo(s.adminA, refund.id, "wrong_client");
      await refundedAccount(s, "100");
      for (const context of [s.adminA, s.viewerA]) {
        const detail = await getRefund(context, refund.id);
        if (!detail.ok) throw new Error("devolución rechazada");
        expect(detail.refund).toMatchObject({
          displayNumber: "D-000001",
          target: "account",
          sale: null,
          paymentMethodName: "Transferencia",
          amount: "250.00",
          client: { displayName: "Lucía Gómez" },
          voided: { displayNumber: "AD-000001", reason: "wrong_client" },
          createdByName: "Ana",
          voidedByName: "Ana",
        });
        const list = await listRefunds(context, { number: "", page: 1 });
        if (!list.ok) throw new Error("lista rechazada");
        expect(
          list.refunds.map((row) => [
            row.displayNumber,
            row.client?.displayName,
            row.voided?.displayNumber ?? null,
          ]),
        ).toEqual([
          ["D-000002", "Lucía Gómez", null],
          ["D-000001", "Lucía Gómez", "AD-000001"],
        ]);
        const found = await listRefunds(context, { number: "d1", page: 1 });
        if (!found.ok) throw new Error("lista rechazada");
        expect(found.refunds.map((row) => row.displayNumber)).toEqual([
          "D-000001",
        ]);
      }
      const forViewer = await getRefund(s.viewerA, refund.id);
      if (!forViewer.ok) throw new Error("devolución rechazada");
      expect(forViewer.refund.client?.contact).toBeNull();
      expect(await getRefund(s.adminB, refund.id)).toMatchObject({
        ok: false,
        code: "NOT_FOUND",
      });
      expect(await getClientRefundForm(s.viewerA, s.clientA)).toMatchObject({
        ok: false,
        code: "FORBIDDEN",
      });
    },
    TEST_TIMEOUT,
  );
});

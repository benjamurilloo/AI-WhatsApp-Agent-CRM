import { sql, type SQL } from "drizzle-orm";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { hashPassword, login } from "@/modules/auth";
import {
  closeCashSession,
  createInitialPaymentMethods,
  createOrderReceipt,
  createRefund,
  createSaleReceipt,
  getCashSession,
  getCashState,
  getOrderReceipts,
  getReceipt,
  getSaleReceipts,
  listPaymentMethods,
  listReceipts,
  openCashSession,
  recordCashMovement,
  voidReceipt,
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

// La anulación de un cobro contra PostgreSQL real (brief-21.5): la anulación (AC-2), «nunca queda
// devuelto más de lo cobrado» (AC-5), sus rechazos (AC-6) y su serialización (AC-7, con D-12). Los
// helpers son los de order-receipts.test.ts. Un producto de precio 1000 por unidad: un pedido o una
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

function cancel(
  context: AuthContext,
  receiptId: string,
  reason = "wrong_amount",
) {
  return voidReceipt(context, { receiptId, reason });
}

async function cancelled(context: AuthContext, receiptId: string) {
  const result = await cancel(context, receiptId);
  if (!result.ok)
    throw new Error(`anulación rechazada: ${JSON.stringify(result)}`);
  return result.receiptVoid;
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

async function orderStanding(context: AuthContext, orderId: string) {
  const result = await getOrderReceipts(context, orderId);
  if (!result.ok) throw new Error(`lectura rechazada: ${result.code}`);
  return result.order;
}

async function expectedNow(context: AuthContext) {
  const state = await getCashState(context);
  if (!state.ok || !state.open) throw new Error("caja cerrada");
  return state.open.currencies.map((row) => [
    row.currency,
    row.receiptVoids,
    row.expected,
  ]);
}

// Lo que quedó escrito, para comprobar que un rechazo no escribe, numera ni audita.
async function snapshot() {
  const result = await getDb().execute<{
    voids: number;
    refunds: number;
    audits: number;
    counter: number | null;
  }>(
    sql`select
          (select count(*)::int from receipt_voids) as voids,
          (select count(*)::int from refunds) as refunds,
          (select count(*)::int from audit_logs where action = 'void') as audits,
          (select max(last_number)::int from document_counters where kind = 'receipt_void')
            as counter`,
  );
  return result.rows[0]!;
}

async function voidRow(receiptId: string) {
  const result = await getDb().execute<{
    number: number;
    currency: string;
    amount: string;
    reason: string;
    session_id: string | null;
  }>(
    sql`select number::int, currency, amount, reason, session_id
        from receipt_voids where receipt_id = ${receiptId}`,
  );
  return result.rows[0];
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

describe("la anulación de un cobro (AC-2; ADR 0022, punto 7)", () => {
  it(
    "numera en AR, copia el cobro, deja de contarlo en lo que falta y se audita sobre el cobro; ya anulado se rechaza",
    async () => {
      const s = await seed();
      const sale = await sell(s, 2, s.clientA);
      const receipt = await received(
        s.adminA,
        sale.id,
        s.methods.transfer,
        "500",
      );
      expect(await saleStanding(s.adminA, sale.id)).toMatchObject({
        outstanding: "1500.00",
      });
      expect(await cancel(s.adminA, receipt.id, "wrong_amount")).toEqual({
        ok: true,
        receipt: { id: receipt.id, number: 1, displayNumber: "R-000001" },
        receiptVoid: {
          id: expect.any(String),
          number: 1,
          displayNumber: "AR-000001",
        },
      });
      expect(await voidRow(receipt.id)).toEqual({
        number: 1,
        currency: "ARS",
        amount: "500.00",
        reason: "wrong_amount",
        session_id: null,
      });
      const standing = await saleStanding(s.adminA, sale.id);
      expect(standing).toMatchObject({
        collected: "0.00",
        outstanding: "2000.00",
        status: "pending",
      });
      expect(standing.receipts[0]!.voided).toMatchObject({
        displayNumber: "AR-000001",
        reason: "wrong_amount",
      });
      const audit = await getDb().execute<{ action: string; diff: unknown }>(
        sql`select action, diff from audit_logs
            where entity_type = 'receipt' and entity_id = ${receipt.id}
            order by created_at`,
      );
      expect(audit.rows.map((row) => row.action)).toEqual(["create", "void"]);
      expect(audit.rows[1]!.diff).toEqual({
        before: { void_number: null, reason: null },
        after: { void_number: 1, reason: "wrong_amount" },
      });

      const before = await snapshot();
      expect(await cancel(s.adminA, receipt.id)).toEqual({
        ok: false,
        code: "BUSINESS_RULE_VIOLATION",
        rule: "already_voided",
        void: { id: expect.any(String), number: 1, displayNumber: "AR-000001" },
      });
      expect(await snapshot()).toEqual(before);
      // El cobro correcto se registra después: la venta lo admite entero.
      await received(s.adminA, sale.id, s.methods.transfer, "2000");
    },
    TEST_TIMEOUT,
  );

  it(
    "vale para una seña retenida, aplicada a su venta y en la cuenta de un pedido cancelado",
    async () => {
      const s = await seed();
      // Retenida: el pedido vuelve a no tener señas.
      const retained = await order(s, 1);
      const r1 = await deposited(
        s.adminA,
        retained.id,
        s.methods.transfer,
        "300",
      );
      await cancelled(s.adminA, r1.id);
      expect(await orderStanding(s.adminA, retained.id)).toMatchObject({
        deposited: "0.00",
        outstanding: "1000.00",
        situation: "none",
        open: true,
      });
      // Aplicada: a la venta del pedido le vuelve a faltar la seña.
      const applied = await order(s, 1);
      const r2 = await deposited(
        s.adminA,
        applied.id,
        s.methods.transfer,
        "400",
      );
      await step(confirmOrder, s.adminA, applied.id);
      await step(deliverOrder, s.adminA, applied.id);
      const issued = await issueSaleFromOrder(s.adminA, applied.id);
      if (!issued.ok) throw new Error("emisión rechazada");
      expect(await saleStanding(s.adminA, issued.sale.id)).toMatchObject({
        outstanding: "600.00",
      });
      await cancelled(s.adminA, r2.id);
      expect(await saleStanding(s.adminA, issued.sale.id)).toMatchObject({
        deposited: "0.00",
        outstanding: "1000.00",
      });
      // Cancelada: la seña estaba en el remanente, y la venta con saldo deja de recibirla.
      const dropped = await order(s, 1);
      const r3 = await deposited(
        s.adminA,
        dropped.id,
        s.methods.transfer,
        "200",
      );
      await step(cancelOrder, s.adminA, dropped.id);
      expect(await saleStanding(s.adminA, issued.sale.id)).toMatchObject({
        imputed: "200.00",
        outstanding: "800.00",
      });
      await cancelled(s.adminA, r3.id);
      expect(await saleStanding(s.adminA, issued.sale.id)).toMatchObject({
        imputed: "0.00",
        outstanding: "1000.00",
      });
      expect(await orderStanding(s.adminA, dropped.id)).toMatchObject({
        situation: "none",
      });
    },
    TEST_TIMEOUT,
  );

  it(
    "en efectivo con la sesión abierta, sale de lo esperado y la anulación queda en esa sesión",
    async () => {
      const s = await seed();
      const session = await open(s.adminA, [
        { currency: "ARS", amount: "100" },
      ]);
      const sale = await sell(s, 1, s.clientA);
      const receipt = await received(s.adminA, sale.id, s.methods.cash, "300");
      expect(await expectedNow(s.adminA)).toEqual([["ARS", "0.00", "400.00"]]);
      await cancelled(s.adminA, receipt.id);
      expect(await expectedNow(s.adminA)).toEqual([
        ["ARS", "300.00", "100.00"],
      ]);
      expect((await voidRow(receipt.id))!.session_id).toBe(session.id);
      const audit = await getDb().execute<{ diff: { after: unknown } }>(
        sql`select diff from audit_logs
            where entity_type = 'receipt' and action = 'void'`,
      );
      expect(audit.rows[0]!.diff.after).toEqual({
        void_number: 1,
        reason: "wrong_amount",
        session_number: 1,
      });
      // El cierre cuenta lo esperado sin el cobro anulado.
      expect(
        await closeCashSession(s.adminA, {
          sessionId: session.id,
          rows: [{ currency: "ARS", amount: "100" }],
        }),
      ).toMatchObject({ ok: true });
      const closed = await getCashSession(s.adminA, session.id);
      if (!closed.ok) throw new Error("sesión rechazada");
      expect(closed.session.currencies).toMatchObject([
        { expected: "100.00", counted: "100.00" },
      ]);
      expect(closed.session.lateVoids).toEqual([]);
      expect(closed.session.receipts[0]!.voided).toMatchObject({
        displayNumber: "AR-000001",
      });
    },
    TEST_TIMEOUT,
  );

  it(
    "con su sesión cerrada, el arqueo guardado no cambia y la sesión la lista como posterior; la abierta no se toca",
    async () => {
      const s = await seed();
      const first = await open(s.adminA, [{ currency: "ARS", amount: "100" }]);
      const sale = await sell(s, 1, s.clientA);
      const receipt = await received(s.adminA, sale.id, s.methods.cash, "300");
      await closeCashSession(s.adminA, {
        sessionId: first.id,
        rows: [{ currency: "ARS", amount: "400" }],
      });
      await open(s.adminA, [{ currency: "ARS", amount: "400" }]);
      await cancelled(s.adminA, receipt.id);
      expect((await voidRow(receipt.id))!.session_id).toBeNull();
      expect(await expectedNow(s.adminA)).toEqual([["ARS", "0.00", "400.00"]]);
      const closed = await getCashSession(s.adminA, first.id);
      if (!closed.ok) throw new Error("sesión rechazada");
      expect(closed.session.currencies).toMatchObject([
        {
          currency: "ARS",
          receipts: "300.00",
          receiptVoids: "0.00",
          expected: "400.00",
          counted: "400.00",
          difference: { sign: "zero", amount: "0.00" },
        },
      ]);
      expect(closed.session.lateVoids).toEqual([
        {
          kind: "receipt",
          displayNumber: "AR-000001",
          source: { id: receipt.id, displayNumber: "R-000001" },
          currency: "ARS",
          amount: "300.00",
          reason: "wrong_amount",
          createdAt: expect.any(Date),
        },
      ]);
      expect(await saleStanding(s.adminA, sale.id)).toMatchObject({
        outstanding: "1000.00",
      });
      const audit = await getDb().execute<{ diff: { after: unknown } }>(
        sql`select diff from audit_logs
            where entity_type = 'receipt' and action = 'void'`,
      );
      expect(audit.rows[0]!.diff.after).toEqual({
        void_number: 1,
        reason: "wrong_amount",
      });
    },
    TEST_TIMEOUT,
  );

  it(
    "en efectivo con la sesión abierta, no deja lo esperado por debajo de cero: insufficient_cash",
    async () => {
      const s = await seed();
      const session = await open(s.adminA, [{ currency: "ARS", amount: "0" }]);
      const sale = await sell(s, 1, s.clientA);
      const receipt = await received(s.adminA, sale.id, s.methods.cash, "300");
      const withdrawal = await recordCashMovement(s.adminA, {
        sessionId: session.id,
        kind: "withdrawal",
        currency: "ARS",
        amount: "200",
        reason: "bank_deposit",
      });
      expect(withdrawal).toMatchObject({ ok: true });
      const before = await snapshot();
      expect(await cancel(s.adminA, receipt.id)).toEqual({
        ok: false,
        code: "BUSINESS_RULE_VIOLATION",
        rule: "insufficient_cash",
        currency: "ARS",
        expected: "100.00",
      });
      expect(await snapshot()).toEqual(before);
    },
    TEST_TIMEOUT,
  );
});

describe("nunca queda devuelto más de lo cobrado (AC-5; D-5)", () => {
  it(
    "el caso de H-3: el cobro del remanente no se anula si lo devuelto no cabe; el directo y la seña retenida sí",
    async () => {
      const s = await seed();
      const a = await sell(s, 1, s.clientA);
      const rA = await received(s.adminA, a.id, s.methods.transfer, "1000");
      const b = await sell(s, 1, s.clientA);
      const rB = await received(s.adminA, b.id, s.methods.transfer, "500");
      await voided(s.adminA, b.id);
      const pending = await order(s, 1);
      const sena = await deposited(
        s.adminA,
        pending.id,
        s.methods.transfer,
        "100",
      );
      // Los 500 de B están a favor: A está cobrada entera y la seña, retenida.
      await refundedAccount(s, "500");
      const before = await snapshot();
      // Con la lectura del haber pasaría: el haber sin rB es 1000, no menos que 500.
      expect(await cancel(s.adminA, rB.id)).toEqual({
        ok: false,
        code: "BUSINESS_RULE_VIOLATION",
        rule: "refunds_exceed_receipts",
        currency: "ARS",
        refunded: "500.00",
      });
      expect(await snapshot()).toEqual(before);
      // La seña retenida no está en el remanente: se anula.
      await cancelled(s.adminA, sena.id);
      // El cobro directo de A tampoco: A vuelve a deber y lo devuelto sigue cubierto por rB.
      await cancelled(s.adminA, rA.id);
      expect(await saleStanding(s.adminA, a.id)).toMatchObject({
        outstanding: "1000.00",
      });
    },
    TEST_TIMEOUT,
  );

  it(
    "en una venta sin cliente, un cobro no se anula si lo devuelto supera lo que queda cobrado",
    async () => {
      const s = await seed();
      const sale = await sell(s, 1, "");
      const r1 = await received(s.adminA, sale.id, s.methods.transfer, "600");
      const r2 = await received(s.adminA, sale.id, s.methods.debit, "400");
      await voided(s.adminA, sale.id);
      const refund = await createRefund(s.adminA, {
        target: "sale",
        saleId: sale.id,
        paymentMethodId: s.methods.transfer,
        amount: "700",
      });
      expect(refund).toMatchObject({ ok: true });
      for (const receipt of [r1, r2]) {
        expect(await cancel(s.adminA, receipt.id)).toEqual({
          ok: false,
          code: "BUSINESS_RULE_VIOLATION",
          rule: "refunds_exceed_receipts",
          currency: "ARS",
          refunded: "700.00",
        });
      }
      expect(await saleStanding(s.adminA, sale.id)).toMatchObject({
        toRefund: "300.00",
        refunded: "700.00",
      });
    },
    TEST_TIMEOUT,
  );
});

describe("los rechazos (AC-6)", () => {
  it(
    "un viewer, un id inválido, un motivo fuera de la lista y un cobro de otra organización",
    async () => {
      const s = await seed();
      const sale = await sell(s, 1, s.clientA);
      const receipt = await received(
        s.adminA,
        sale.id,
        s.methods.transfer,
        "100",
      );
      const before = await snapshot();
      expect(await cancel(s.viewerA, receipt.id)).toMatchObject({
        ok: false,
        code: "FORBIDDEN",
      });
      expect(await cancel(s.adminA, "no-es-un-id")).toMatchObject({
        ok: false,
        code: "VALIDATION_ERROR",
      });
      expect(await cancel(s.adminA, receipt.id, "porque sí")).toEqual({
        ok: false,
        code: "VALIDATION_ERROR",
        fields: ["reason"],
      });
      expect(await cancel(s.adminB, receipt.id)).toEqual({
        ok: false,
        code: "NOT_FOUND",
        entity: "receipt",
      });
      expect(await snapshot()).toEqual(before);
    },
    TEST_TIMEOUT,
  );
});

describe("la serialización (AC-7)", () => {
  it(
    "la anulación espera el bloqueo de cobros, y la de otra organización no",
    async () => {
      const s = await seed();
      const sale = await sell(s, 1, s.clientA);
      const receipt = await received(
        s.adminA,
        sale.id,
        s.methods.transfer,
        "100",
      );
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
      const receiptB = await received(
        s.adminB,
        saleB.sale.id,
        s.methodsB.transfer,
        "100",
      );
      const release = await hold(cashLock(s.orgA));
      const voiding = cancel(s.adminA, receipt.id);
      let settled = false;
      void voiding.then(
        () => (settled = true),
        () => (settled = true),
      );
      // La regla, antes del ayudante que cuenta las conexiones en espera (lección de la 21.4).
      await new Promise((resolve) => setTimeout(resolve, 1000));
      expect(settled).toBe(false);
      expect((await snapshot()).voids).toBe(0);
      await waitForLockWaiters(1);
      expect(await cancel(s.adminB, receiptB.id)).toMatchObject({ ok: true });
      expect(settled).toBe(false);
      await release();
      expect(await voiding).toMatchObject({ ok: true });
    },
    TEST_TIMEOUT,
  );

  it(
    "dos anulaciones del mismo cobro en cola: una y un already_voided",
    async () => {
      const s = await seed();
      const sale = await sell(s, 1, s.clientA);
      const receipt = await received(
        s.adminA,
        sale.id,
        s.methods.transfer,
        "100",
      );
      const [first, second] = await queued(
        s.orgA,
        () => cancel(s.adminA, receipt.id),
        () => cancel(s.adminA, receipt.id, "other"),
      );
      expect(first).toMatchObject({ ok: true });
      expect(second).toMatchObject({
        ok: false,
        rule: "already_voided",
        void: { displayNumber: "AR-000001" },
      });
      expect((await snapshot()).counter).toBe(1);
    },
    TEST_TIMEOUT,
  );

  it(
    "una anulación de efectivo antes que el cierre de su sesión, en cola: el arqueo la descuenta",
    async () => {
      const s = await seed();
      const session = await open(s.adminA, [
        { currency: "ARS", amount: "100" },
      ]);
      const sale = await sell(s, 1, s.clientA);
      const receipt = await received(s.adminA, sale.id, s.methods.cash, "300");
      const [voiding, closing] = await queued(
        s.orgA,
        () => cancel(s.adminA, receipt.id),
        () =>
          closeCashSession(s.adminA, {
            sessionId: session.id,
            rows: [{ currency: "ARS", amount: "100" }],
          }),
      );
      expect(voiding).toMatchObject({ ok: true });
      expect(closing).toMatchObject({ ok: true });
      expect((await voidRow(receipt.id))!.session_id).toBe(session.id);
      const closed = await getCashSession(s.adminA, session.id);
      if (!closed.ok) throw new Error("sesión rechazada");
      expect(closed.session.currencies).toMatchObject([
        { expected: "100.00", counted: "100.00" },
      ]);
    },
    TEST_TIMEOUT,
  );

  it(
    "un cierre antes que la anulación de un efectivo de esa sesión, en cola: el arqueo no cambia y la anulación queda sin sesión",
    async () => {
      const s = await seed();
      const session = await open(s.adminA, [
        { currency: "ARS", amount: "100" },
      ]);
      const sale = await sell(s, 1, s.clientA);
      const receipt = await received(s.adminA, sale.id, s.methods.cash, "300");
      const [closing, voiding] = await queued(
        s.orgA,
        () =>
          closeCashSession(s.adminA, {
            sessionId: session.id,
            rows: [{ currency: "ARS", amount: "400" }],
          }),
        () => cancel(s.adminA, receipt.id),
      );
      expect(closing).toMatchObject({ ok: true });
      expect(voiding).toMatchObject({ ok: true });
      expect((await voidRow(receipt.id))!.session_id).toBeNull();
      const closed = await getCashSession(s.adminA, session.id);
      if (!closed.ok) throw new Error("sesión rechazada");
      expect(closed.session.currencies).toMatchObject([
        { expected: "400.00", counted: "400.00" },
      ]);
      expect(closed.session.lateVoids).toHaveLength(1);
    },
    TEST_TIMEOUT,
  );

  it(
    "D-12: un cobro en cola detrás de la anulación de un cobro del remanente ve lo que falta después de ella",
    async () => {
      const s = await seed();
      const gone = await sell(s, 1, s.clientA);
      const rGone = await received(
        s.adminA,
        gone.id,
        s.methods.transfer,
        "500",
      );
      await voided(s.adminA, gone.id);
      const sale = await sell(s, 2, s.clientA);
      // Los 500 del remanente bajan lo que falta: 1500.
      expect(await saleStanding(s.adminA, sale.id)).toMatchObject({
        outstanding: "1500.00",
      });
      // Anulado el cobro del remanente, faltan 2000: un cobro de 1600 cabe solo si lo lee después.
      const [voiding, receiving] = await queued(
        s.orgA,
        () => cancel(s.adminA, rGone.id),
        () =>
          createSaleReceipt(s.adminA, {
            saleId: sale.id,
            paymentMethodId: s.methods.transfer,
            amount: "1600",
          }),
      );
      expect(voiding).toMatchObject({ ok: true });
      expect(receiving).toMatchObject({ ok: true });
      expect(await saleStanding(s.adminA, sale.id)).toMatchObject({
        outstanding: "400.00",
      });
    },
    TEST_TIMEOUT,
  );
});

describe("las lecturas (AC-8)", () => {
  it(
    "los dos roles ven el cobro anulado en el recibo y en la lista; otra organización no lo ve",
    async () => {
      const s = await seed();
      const sale = await sell(s, 1, s.clientA);
      const receipt = await received(
        s.adminA,
        sale.id,
        s.methods.transfer,
        "100",
      );
      await cancel(s.adminA, receipt.id, "not_received");
      for (const context of [s.adminA, s.viewerA]) {
        const detail = await getReceipt(context, receipt.id);
        if (!detail.ok) throw new Error("recibo rechazado");
        expect(detail.receipt).toMatchObject({
          displayNumber: "R-000001",
          voided: { displayNumber: "AR-000001", reason: "not_received" },
          voidedByName: "Ana",
          sessionOpen: false,
        });
        const list = await listReceipts(context, { number: "", page: 1 });
        if (!list.ok) throw new Error("lista rechazada");
        expect(list.receipts[0]!.voided).toMatchObject({
          displayNumber: "AR-000001",
        });
      }
      const forViewer = await getReceipt(s.viewerA, receipt.id);
      if (!forViewer.ok) throw new Error("recibo rechazado");
      expect(forViewer.receipt.client?.contact).toBeNull();
      expect(await getReceipt(s.adminB, receipt.id)).toMatchObject({
        ok: false,
        code: "NOT_FOUND",
      });
    },
    TEST_TIMEOUT,
  );
});

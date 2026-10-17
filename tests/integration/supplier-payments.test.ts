import { sql, type SQL } from "drizzle-orm";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { hashPassword, login } from "@/modules/auth";
import {
  closeCashSession,
  createAccountReceipt,
  createInitialPaymentMethods,
  createRefund,
  createSupplierPayment,
  deactivatePaymentMethod,
  getCashSession,
  getCashState,
  getGoodsReceiptPaymentForm,
  getGoodsReceiptPayments,
  getSupplierAccountPaymentForm,
  getSupplierAccountSummary,
  getSupplierPayment,
  getSupplierStatement,
  listPaymentMethods,
  listSupplierPayments,
  listSuppliersOwed,
  openCashSession,
  previewCashClosing,
  recordCashMovement,
  voidReceipt,
  voidSupplierPayment,
  type SupplierPaymentInput,
} from "@/modules/cash";
import { getAuthContext, type AuthContext } from "@/modules/organizations";
import {
  createGoodsReceipt,
  createSupplier,
  deactivateSupplier,
  voidGoodsReceipt,
} from "@/modules/purchasing";
import { getDb } from "@/shared/db";
import { resetDatabase } from "./reset-database";

// Los pagos a proveedores contra PostgreSQL real (brief-22.6): la operación (AC-3), la caja (AC-4),
// la serialización (AC-5), los rechazos (AC-6) y el aislamiento del servicio (AC-7). La cuenta del
// proveedor está en supplier-accounts.test.ts y el esquema en supplier-payments-schema.test.ts.

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

async function methodIds(context: AuthContext) {
  const created = await createInitialPaymentMethods(context);
  if (!created.ok) throw new Error("lista inicial rechazada");
  const listed = await listPaymentMethods(context);
  if (!listed.ok) throw new Error("lista rechazada");
  const idOf = (name: string) =>
    listed.paymentMethods.find((method) => method.name === name)!.id;
  return { cash: idOf("Efectivo"), transfer: idOf("Transferencia") };
}

async function supplier(context: AuthContext, name: string) {
  const result = await createSupplier(context, { name });
  if (!result.ok) throw new Error(`proveedor rechazado: ${result.code}`);
  return result.supplierId;
}

async function seed() {
  const orgA = await returningId(
    sql`insert into organizations (name) values ('Negocio A') returning id`,
  );
  const orgB = await returningId(
    sql`insert into organizations (name) values ('Negocio B') returning id`,
  );
  await addUser(orgA, "admin-a@example.com", "Ana", "admin");
  await addUser(orgA, "viewer-a@example.com", "Vera", "viewer");
  await addUser(orgB, "admin-b@example.com", "Beto", "admin");
  const adminA = await contextFor("admin-a@example.com");
  const adminB = await contextFor("admin-b@example.com");
  const productA = await returningId(
    sql`insert into products (organization_id, sku, name)
        values (${orgA}, 'CAF-1', 'Café') returning id`,
  );
  const productB = await returningId(
    sql`insert into products (organization_id, sku, name)
        values (${orgB}, 'CAF-1', 'Café') returning id`,
  );
  return {
    orgA,
    orgB,
    adminA,
    adminB,
    viewerA: await contextFor("viewer-a@example.com"),
    methods: await methodIds(adminA),
    methodsB: await methodIds(adminB),
    supplierA: await supplier(adminA, "Importaciones Sur"),
    supplierB: await supplier(adminB, "Importaciones Sur"),
    productA,
    productB,
  };
}

type Seed = Awaited<ReturnType<typeof seed>>;

// Una recepción sin orden de una línea: cantidad × costo.
async function receipt(
  context: AuthContext,
  supplierId: string,
  productId: string,
  quantity: string,
  unitCost: string,
  currency = "ARS",
) {
  const result = await createGoodsReceipt(context, {
    purchaseOrderId: null,
    supplierId,
    currency,
    supplierReference: "",
    lines: [{ productId, quantity, unitCost }],
  });
  if (!result.ok)
    throw new Error(`recepción rechazada: ${JSON.stringify(result)}`);
  return result.receipt;
}

async function open(context: AuthContext, amount: string, currency = "ARS") {
  const result = await openCashSession(context, {
    rows: [{ currency, amount }],
  });
  if (!result.ok)
    throw new Error(`apertura rechazada: ${JSON.stringify(result)}`);
  return result.session;
}

const toReceipt = (
  goodsReceiptId: string,
  paymentMethodId: string,
  amount: string,
): SupplierPaymentInput => ({
  target: "goods_receipt",
  goodsReceiptId,
  paymentMethodId,
  amount,
});

const toAccount = (
  supplierId: string,
  paymentMethodId: string,
  amount: string,
  currency = "ARS",
): SupplierPaymentInput => ({
  target: "account",
  supplierId,
  currency,
  paymentMethodId,
  amount,
});

async function paid(context: AuthContext, input: SupplierPaymentInput) {
  const result = await createSupplierPayment(context, input);
  if (!result.ok) throw new Error(`pago rechazado: ${JSON.stringify(result)}`);
  return result.payment;
}

async function outstanding(context: AuthContext, goodsReceiptId: string) {
  const result = await getGoodsReceiptPayments(context, goodsReceiptId);
  if (!result.ok) throw new Error(`lectura rechazada: ${result.code}`);
  return result.standing;
}

async function expected(context: AuthContext, currency = "ARS") {
  const state = await getCashState(context);
  if (!state.ok || !state.open) throw new Error("caja cerrada");
  return state.open.currencies.find((row) => row.currency === currency)!;
}

// Todo lo que un pago o una anulación escriben, para comprobar que un rechazo no escribe, no audita
// ni consume número (D-10).
async function snapshot() {
  const result = await getDb().execute(
    sql`select
          (select count(*)::int from supplier_payments) as payments,
          (select count(*)::int from supplier_payment_voids) as voids,
          (select count(*)::int from audit_logs) as audits,
          (select coalesce(string_agg(organization_id || '|' || kind::text || '|' || last_number, ','
                    order by organization_id, kind), '')
             from document_counters
             where kind::text in ('supplier_payment', 'supplier_payment_void')) as counters`,
  );
  return result.rows[0]!;
}

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

async function waitForLockWaiters(expectedCount: number, timeoutMs = 5000) {
  const deadline = Date.now() + timeoutMs;
  let waiting = -1;
  while (Date.now() < deadline) {
    const result = await getDb().execute<{ waiting: number }>(
      sql`select count(*)::int as waiting from pg_stat_activity
          where datname = current_database() and wait_event_type = 'Lock'`,
    );
    waiting = result.rows[0]!.waiting;
    if (waiting === expectedCount) return;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error(
    `se esperaban ${expectedCount} conexiones en un bloqueo y hay ${waiting}`,
  );
}

const lockCashOf = (organizationId: string) =>
  sql`select pg_advisory_xact_lock(hashtextextended(${`cash:${organizationId}`}, 0))`;
const lockSupplierRow = (id: string) =>
  sql`select id from suppliers where id = ${id} for update`;

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

describe("el pago (AC-3; D-7)", () => {
  it(
    "contra una recepción, por transferencia: PP, el proveedor y la moneda de la recepción, sin sesión, y la auditoría",
    async () => {
      const s = await seed();
      const rc = await receipt(s.adminA, s.supplierA, s.productA, "4", "250");
      const payment = await paid(
        s.adminA,
        toReceipt(rc.id, s.methods.transfer, "400"),
      );
      expect(payment.displayNumber).toBe("PP-000001");
      const rows = await getDb().execute(
        sql`select target::text, goods_receipt_id, supplier_id, session_id, currency, amount
            from supplier_payments where id = ${payment.id}`,
      );
      expect(rows.rows[0]).toEqual({
        target: "goods_receipt",
        goods_receipt_id: rc.id,
        supplier_id: s.supplierA,
        session_id: null,
        currency: "ARS",
        amount: "400.00",
      });
      const audit = await getDb().execute<{ action: string; diff: unknown }>(
        sql`select action::text, diff from audit_logs
            where entity_type = 'supplier_payment' and entity_id = ${payment.id}`,
      );
      expect(audit.rows).toEqual([
        {
          action: "create",
          diff: {
            before: null,
            after: {
              number: 1,
              goods_receipt_number: rc.number,
              payment_method: "Transferencia",
              currency: "ARS",
              amount: "400.00",
            },
          },
        },
      ]);
      const standing = await outstanding(s.adminA, rc.id);
      expect(standing).toMatchObject({
        total: "1000.00",
        paid: "400.00",
        outstanding: "600.00",
      });
      expect(standing.payments.map((row) => row.displayNumber)).toEqual([
        "PP-000001",
      ]);
    },
    TEST_TIMEOUT,
  );

  it(
    "en efectivo sale de la sesión abierta: la sesión en el pago y lo esperado más bajo",
    async () => {
      const s = await seed();
      const session = await open(s.adminA, "1000");
      const rc = await receipt(s.adminA, s.supplierA, s.productA, "1", "300");
      const payment = await paid(
        s.adminA,
        toReceipt(rc.id, s.methods.cash, "300"),
      );
      const rows = await getDb().execute<{ session_id: string }>(
        sql`select session_id from supplier_payments where id = ${payment.id}`,
      );
      expect(rows.rows[0]!.session_id).toBe(session.id);
      expect(await expected(s.adminA)).toMatchObject({
        supplierPayments: "300.00",
        expected: "700.00",
      });
      const audit = await getDb().execute<{ diff: { after: object } }>(
        sql`select diff from audit_logs
            where entity_type = 'supplier_payment' and entity_id = ${payment.id}`,
      );
      expect(audit.rows[0]!.diff.after).toMatchObject({ session_number: 1 });
    },
    TEST_TIMEOUT,
  );

  it(
    "a cuenta: con el proveedor y la moneda elegida, sin recepción y sin tope",
    async () => {
      const s = await seed();
      await receipt(s.adminA, s.supplierA, s.productA, "1", "100");
      const payment = await paid(
        s.adminA,
        toAccount(s.supplierA, s.methods.transfer, "5000"),
      );
      const rows = await getDb().execute(
        sql`select target::text, goods_receipt_id, supplier_id, currency, amount
            from supplier_payments where id = ${payment.id}`,
      );
      expect(rows.rows[0]).toEqual({
        target: "account",
        goods_receipt_id: null,
        supplier_id: s.supplierA,
        currency: "ARS",
        amount: "5000.00",
      });
      const audit = await getDb().execute<{ diff: { after: object } }>(
        sql`select diff from audit_logs
            where entity_type = 'supplier_payment' and entity_id = ${payment.id}`,
      );
      expect(audit.rows[0]!.diff.after).toEqual({
        number: 1,
        target: "account",
        supplier_id: s.supplierA,
        payment_method: "Transferencia",
        currency: "ARS",
        amount: "5000.00",
      });
      const form = await getSupplierAccountPaymentForm(s.adminA, s.supplierA);
      if (!form.ok) throw new Error("formulario rechazado");
      expect(form.form.currencies).toEqual([
        expect.objectContaining({
          currency: "ARS",
          owed: "0.00",
          inFavor: "4900.00",
        }),
      ]);
      expect(form.form.proposed).toBeNull();
    },
    TEST_TIMEOUT,
  );

  it(
    "un proveedor desactivado se paga, contra sus recepciones y a cuenta (ADR 0023, punto 2)",
    async () => {
      const s = await seed();
      const rc = await receipt(s.adminA, s.supplierA, s.productA, "1", "100");
      const off = await deactivateSupplier(s.adminA, s.supplierA);
      expect(off).toMatchObject({ ok: true });
      await paid(s.adminA, toReceipt(rc.id, s.methods.transfer, "50"));
      await paid(s.adminA, toAccount(s.supplierA, s.methods.transfer, "10"));
      expect(await outstanding(s.adminA, rc.id)).toMatchObject({
        paid: "50.00",
        imputed: "10.00",
        outstanding: "40.00",
      });
    },
    TEST_TIMEOUT,
  );

  it(
    "el formulario de una recepción propone lo que falta, con lo imputado desde la cuenta",
    async () => {
      const s = await seed();
      const rc = await receipt(s.adminA, s.supplierA, s.productA, "2", "100");
      await paid(s.adminA, toAccount(s.supplierA, s.methods.transfer, "30"));
      const form = await getGoodsReceiptPaymentForm(s.adminA, rc.id);
      if (!form.ok) throw new Error("formulario rechazado");
      expect(form.form).toMatchObject({
        paid: "0.00",
        imputed: "30.00",
        outstanding: "170.00",
        openSession: null,
      });
      expect(form.form.paymentMethods.length).toBeGreaterThan(0);
    },
    TEST_TIMEOUT,
  );

  it(
    "contra una recepción, el proveedor es el de la recepción aunque la entrada traiga otro (punto 8)",
    async () => {
      const s = await seed();
      const other = await supplier(s.adminA, "Distribuidora Norte");
      const rc = await receipt(s.adminA, s.supplierA, s.productA, "1", "100");
      const payment = await paid(s.adminA, {
        ...toReceipt(rc.id, s.methods.transfer, "10"),
        supplierId: other,
        currency: "USD",
      });
      const rows = await getDb().execute(
        sql`select supplier_id, currency from supplier_payments where id = ${payment.id}`,
      );
      expect(rows.rows[0]).toEqual({
        supplier_id: s.supplierA,
        currency: "ARS",
      });
    },
    TEST_TIMEOUT,
  );
});

describe("la anulación (AC-3; D-8)", () => {
  it(
    "en efectivo con la sesión abierta: APP con la sesión, lo esperado repuesto y lo que falta otra vez",
    async () => {
      const s = await seed();
      const session = await open(s.adminA, "1000");
      const rc = await receipt(s.adminA, s.supplierA, s.productA, "1", "300");
      const payment = await paid(
        s.adminA,
        toReceipt(rc.id, s.methods.cash, "300"),
      );
      const result = await voidSupplierPayment(s.adminA, {
        paymentId: payment.id,
        reason: "not_paid",
      });
      expect(result).toMatchObject({
        ok: true,
        paymentVoid: { displayNumber: "APP-000001" },
      });
      const rows = await getDb().execute(
        sql`select session_id, currency, amount, reason::text
            from supplier_payment_voids`,
      );
      expect(rows.rows).toEqual([
        {
          session_id: session.id,
          currency: "ARS",
          amount: "300.00",
          reason: "not_paid",
        },
      ]);
      expect(await expected(s.adminA)).toMatchObject({
        supplierPayments: "300.00",
        supplierPaymentVoids: "300.00",
        expected: "1000.00",
      });
      expect(await outstanding(s.adminA, rc.id)).toMatchObject({
        paid: "0.00",
        outstanding: "300.00",
      });
      const audit = await getDb().execute<{ action: string; diff: unknown }>(
        sql`select action::text, diff from audit_logs
            where entity_type = 'supplier_payment' and action = 'void'`,
      );
      expect(audit.rows).toEqual([
        {
          action: "void",
          diff: {
            before: { void_number: null, reason: null, session_number: null },
            after: { void_number: 1, reason: "not_paid", session_number: 1 },
          },
        },
      ]);
    },
    TEST_TIMEOUT,
  );

  it(
    "con la sesión del pago ya cerrada, no impacta en ninguna: el arqueo guardado no cambia y la abierta tampoco",
    async () => {
      const s = await seed();
      const first = await open(s.adminA, "1000");
      const rc = await receipt(s.adminA, s.supplierA, s.productA, "1", "300");
      const payment = await paid(
        s.adminA,
        toReceipt(rc.id, s.methods.cash, "300"),
      );
      expect(
        await closeCashSession(s.adminA, {
          sessionId: first.id,
          rows: [{ currency: "ARS", amount: "700" }],
        }),
      ).toMatchObject({ ok: true });
      await open(s.adminA, "700");
      expect(
        await voidSupplierPayment(s.adminA, {
          paymentId: payment.id,
          reason: "other",
        }),
      ).toMatchObject({ ok: true });
      const rows = await getDb().execute(
        sql`select session_id from supplier_payment_voids`,
      );
      expect(rows.rows).toEqual([{ session_id: null }]);
      expect(await expected(s.adminA)).toMatchObject({ expected: "700.00" });
      const closed = await getCashSession(s.adminA, first.id);
      if (!closed.ok) throw new Error("sesión no encontrada");
      expect(closed.session.currencies[0]).toMatchObject({
        expected: "700.00",
        counted: "700.00",
      });
      // La anulación posterior al cierre explica la sesión, solo para un admin.
      expect(closed.session.supplierPayments?.lateVoids).toEqual([
        expect.objectContaining({
          displayNumber: "APP-000001",
          source: expect.objectContaining({ displayNumber: "PP-000001" }),
        }),
      ]);
    },
    TEST_TIMEOUT,
  );

  it(
    "por transferencia no impacta en ninguna sesión",
    async () => {
      const s = await seed();
      await open(s.adminA, "100");
      const payment = await paid(
        s.adminA,
        toAccount(s.supplierA, s.methods.transfer, "50"),
      );
      await voidSupplierPayment(s.adminA, {
        paymentId: payment.id,
        reason: "wrong_method",
      });
      const rows = await getDb().execute(
        sql`select session_id from supplier_payment_voids`,
      );
      expect(rows.rows).toEqual([{ session_id: null }]);
      expect(await expected(s.adminA)).toMatchObject({ expected: "100.00" });
    },
    TEST_TIMEOUT,
  );
});

describe("la caja con los pagos (AC-4; D-9)", () => {
  it(
    "un retiro posterior a un pago en efectivo ve lo esperado ya descontado",
    async () => {
      const s = await seed();
      const session = await open(s.adminA, "500");
      await paid(s.adminA, toAccount(s.supplierA, s.methods.cash, "400"));
      const withdrawal = await recordCashMovement(s.adminA, {
        sessionId: session.id,
        kind: "withdrawal",
        currency: "ARS",
        amount: "200",
        reason: "bank_deposit",
      });
      expect(withdrawal).toMatchObject({
        ok: false,
        rule: "insufficient_cash",
        expected: "100.00",
      });
    },
    TEST_TIMEOUT,
  );

  // Un cobro a cuenta en efectivo de un cliente, para tener algo que devolver o anular.
  async function cashCredit(s: Seed, amount: string) {
    const clientId = await returningId(
      sql`insert into clients (organization_id, display_name)
          values (${s.orgA}, 'Lucía Gómez') returning id`,
    );
    const result = await createAccountReceipt(s.adminA, {
      clientId,
      currency: "ARS",
      paymentMethodId: s.methods.cash,
      amount,
    });
    if (!result.ok)
      throw new Error(`cobro rechazado: ${JSON.stringify(result)}`);
    return { clientId, receiptId: result.receipt.id };
  }

  it(
    "una devolución posterior a un pago en efectivo ve lo esperado ya descontado",
    async () => {
      const s = await seed();
      await open(s.adminA, "0");
      const { clientId } = await cashCredit(s, "300");
      await paid(s.adminA, toAccount(s.supplierA, s.methods.cash, "200"));
      const refund = (amount: string) =>
        createRefund(s.adminA, {
          target: "account",
          clientId,
          currency: "ARS",
          paymentMethodId: s.methods.cash,
          amount,
        });
      expect(await refund("101")).toMatchObject({
        ok: false,
        rule: "insufficient_cash",
        expected: "100.00",
      });
      expect(await refund("100")).toMatchObject({ ok: true });
    },
    TEST_TIMEOUT,
  );

  it(
    "la anulación de un cobro posterior a un pago en efectivo ve lo esperado ya descontado",
    async () => {
      const s = await seed();
      await open(s.adminA, "0");
      const { receiptId } = await cashCredit(s, "300");
      await paid(s.adminA, toAccount(s.supplierA, s.methods.cash, "201"));
      expect(
        await voidReceipt(s.adminA, { receiptId, reason: "wrong_amount" }),
      ).toMatchObject({
        ok: false,
        rule: "insufficient_cash",
        expected: "99.00",
      });
    },
    TEST_TIMEOUT,
  );

  it(
    "la vista previa del cierre y el cierre cuentan el pago, también en una moneda solo con pagos",
    async () => {
      const s = await seed();
      const session = await open(s.adminA, "500");
      await paid(s.adminA, toAccount(s.supplierA, s.methods.cash, "120"));
      const preview = await previewCashClosing(s.adminA, {
        sessionId: session.id,
        rows: [{ currency: "ARS", amount: "380" }],
      });
      expect(preview).toMatchObject({
        ok: true,
        rows: [
          expect.objectContaining({ currency: "ARS", expected: "380.00" }),
        ],
      });
      expect(
        await closeCashSession(s.adminA, {
          sessionId: session.id,
          rows: [{ currency: "ARS", amount: "380" }],
        }),
      ).toMatchObject({ ok: true });
      const amounts = await getDb().execute(
        sql`select currency, counted, expected from cash_session_closing_amounts`,
      );
      expect(amounts.rows).toEqual([
        { currency: "ARS", counted: "380.00", expected: "380.00" },
      ]);
    },
    TEST_TIMEOUT,
  );

  it(
    "un viewer ve los totales de la sesión, sin los pagos ni sus anulaciones",
    async () => {
      const s = await seed();
      await open(s.adminA, "500");
      await paid(s.adminA, toAccount(s.supplierA, s.methods.cash, "120"));
      const asViewer = await getCashState(s.viewerA);
      if (!asViewer.ok || !asViewer.open) throw new Error("caja cerrada");
      expect(asViewer.open.supplierPayments).toBeNull();
      expect(asViewer.open.currencies[0]).toMatchObject({
        supplierPayments: "120.00",
        expected: "380.00",
      });
      const asAdmin = await getCashState(s.adminA);
      if (!asAdmin.ok || !asAdmin.open) throw new Error("caja cerrada");
      expect(
        asAdmin.open.supplierPayments?.items.map((row) => row.displayNumber),
      ).toEqual(["PP-000001"]);
    },
    TEST_TIMEOUT,
  );
});

describe("los rechazos (AC-6; D-10)", () => {
  it(
    "cada rechazo no escribe, no audita ni consume número",
    async () => {
      const s = await seed();
      const rc = await receipt(s.adminA, s.supplierA, s.productA, "1", "100");
      const voidedRc = await receipt(
        s.adminA,
        s.supplierA,
        s.productA,
        "1",
        "50",
      );
      expect(
        await voidGoodsReceipt(s.adminA, voidedRc.id, "data_entry_error"),
      ).toMatchObject({ ok: true });
      const rcB = await receipt(s.adminB, s.supplierB, s.productB, "1", "100");
      const listed = await listPaymentMethods(s.adminA);
      if (!listed.ok) throw new Error("lista rechazada");
      const debit = listed.paymentMethods.find(
        (method) => method.name === "Tarjeta de débito",
      )!.id;
      expect(await deactivatePaymentMethod(s.adminA, debit)).toMatchObject({
        ok: true,
      });
      const before = await snapshot();
      const cases: [SupplierPaymentInput, object][] = [
        [
          { ...toReceipt(rc.id, s.methods.transfer, "1"), target: "x" },
          { code: "VALIDATION_ERROR", fields: ["target"] },
        ],
        [
          toReceipt("no-uuid", s.methods.transfer, "1"),
          { code: "VALIDATION_ERROR" },
        ],
        [
          toAccount("no-uuid", s.methods.transfer, "1"),
          { code: "VALIDATION_ERROR" },
        ],
        [
          toReceipt(rc.id, s.methods.transfer, ""),
          { code: "VALIDATION_ERROR", fields: ["amount"], amount: "required" },
        ],
        [
          toReceipt(rc.id, s.methods.transfer, "0"),
          { code: "VALIDATION_ERROR", fields: ["amount"] },
        ],
        [
          toAccount(s.supplierA, s.methods.transfer, "1", "XYZ"),
          { code: "VALIDATION_ERROR", fields: ["currency"] },
        ],
        [
          toReceipt(rcB.id, s.methods.transfer, "1"),
          { code: "NOT_FOUND", entity: "goods_receipt" },
        ],
        [
          toAccount(s.supplierB, s.methods.transfer, "1"),
          { code: "NOT_FOUND", entity: "supplier" },
        ],
        [
          toReceipt(rc.id, s.methodsB.transfer, "1"),
          { code: "NOT_FOUND", entity: "payment_method" },
        ],
        [
          toReceipt(voidedRc.id, s.methods.transfer, "1"),
          { rule: "goods_receipt_voided" },
        ],
        [
          toReceipt(rc.id, s.methods.transfer, "100.01"),
          {
            rule: "exceeds_outstanding",
            currency: "ARS",
            outstanding: "100.00",
          },
        ],
        [toReceipt(rc.id, debit, "1"), { rule: "payment_method_inactive" }],
        [toReceipt(rc.id, s.methods.cash, "1"), { rule: "no_open_session" }],
      ];
      for (const [input, expectedFailure] of cases) {
        expect(await createSupplierPayment(s.adminA, input)).toMatchObject({
          ok: false,
          ...expectedFailure,
        });
      }
      expect(
        await createSupplierPayment(
          s.viewerA,
          toReceipt(rc.id, s.methods.transfer, "1"),
        ),
      ).toMatchObject({ ok: false, code: "FORBIDDEN" });
      await open(s.adminA, "10");
      expect(
        await createSupplierPayment(
          s.adminA,
          toReceipt(rc.id, s.methods.cash, "10.01"),
        ),
      ).toMatchObject({ rule: "insufficient_cash", expected: "10.00" });
      const afterOpen = await snapshot();
      expect({ ...afterOpen, audits: before.audits }).toEqual(before);
      // La apertura audita; ningún rechazo de pago lo hace.
      expect(afterOpen.audits).toBe((before.audits as number) + 1);
    },
    TEST_TIMEOUT,
  );

  it(
    "la anulación rechaza sin escribir: viewer, id, motivo, pago de otra organización, ya anulado y el tope de lo esperado",
    async () => {
      const s = await seed();
      const payment = await paid(
        s.adminA,
        toAccount(s.supplierA, s.methods.transfer, "10"),
      );
      const paymentB = await paid(
        s.adminB,
        toAccount(s.supplierB, s.methodsB.transfer, "10"),
      );
      await voidSupplierPayment(s.adminA, {
        paymentId: payment.id,
        reason: "other",
      });
      const before = await snapshot();
      expect(
        await voidSupplierPayment(s.viewerA, {
          paymentId: payment.id,
          reason: "other",
        }),
      ).toMatchObject({ code: "FORBIDDEN" });
      expect(
        await voidSupplierPayment(s.adminA, {
          paymentId: "x",
          reason: "other",
        }),
      ).toMatchObject({ code: "VALIDATION_ERROR" });
      expect(
        await voidSupplierPayment(s.adminA, {
          paymentId: payment.id,
          reason: "duplicate",
        }),
      ).toMatchObject({ code: "VALIDATION_ERROR", fields: ["reason"] });
      expect(
        await voidSupplierPayment(s.adminA, {
          paymentId: paymentB.id,
          reason: "other",
        }),
      ).toMatchObject({ code: "NOT_FOUND", entity: "supplier_payment" });
      expect(
        await voidSupplierPayment(s.adminA, {
          paymentId: payment.id,
          reason: "other",
        }),
      ).toMatchObject({
        rule: "already_voided",
        void: { displayNumber: "APP-000001" },
      });
      expect(await snapshot()).toEqual(before);
    },
    TEST_TIMEOUT,
  );

  it(
    "la anulación de un pago en efectivo no deja lo esperado fuera de numeric(14, 2)",
    async () => {
      const s = await seed();
      await open(s.adminA, "1000");
      const payment = await paid(
        s.adminA,
        toAccount(s.supplierA, s.methods.cash, "1000"),
      );
      // Un cobro a cuenta no existe acá: el aporte lleva lo esperado al tope.
      const state = await getCashState(s.adminA);
      if (!state.ok || !state.open) throw new Error("caja cerrada");
      expect(
        await recordCashMovement(s.adminA, {
          sessionId: state.open.id,
          kind: "contribution",
          currency: "ARS",
          amount: "999999999999.99",
          reason: "owner_contribution",
        }),
      ).toMatchObject({ ok: true });
      const before = await snapshot();
      expect(
        await voidSupplierPayment(s.adminA, {
          paymentId: payment.id,
          reason: "other",
        }),
      ).toMatchObject({
        code: "VALIDATION_ERROR",
        fields: ["amount"],
        amount: "limit",
      });
      expect(await snapshot()).toEqual(before);
    },
    TEST_TIMEOUT,
  );

  it(
    "las lecturas son solo de admin",
    async () => {
      const s = await seed();
      const rc = await receipt(s.adminA, s.supplierA, s.productA, "1", "100");
      const payment = await paid(
        s.adminA,
        toReceipt(rc.id, s.methods.transfer, "10"),
      );
      for (const result of [
        await getSupplierPayment(s.viewerA, payment.id),
        await listSupplierPayments(s.viewerA, {
          status: "all",
          supplierId: null,
          search: "",
          page: 1,
        }),
        await getGoodsReceiptPayments(s.viewerA, rc.id),
        await getGoodsReceiptPaymentForm(s.viewerA, rc.id),
        await getSupplierAccountPaymentForm(s.viewerA, s.supplierA),
      ]) {
        expect(result).toMatchObject({ ok: false, code: "FORBIDDEN" });
      }
    },
    TEST_TIMEOUT,
  );
});

describe("la lista y el detalle (AC-3; D-13)", () => {
  it(
    "filtra por estado y por proveedor, y busca por PP y por APP",
    async () => {
      const s = await seed();
      const other = await supplier(s.adminA, "Distribuidora Norte");
      const rc = await receipt(s.adminA, s.supplierA, s.productA, "1", "100");
      const p1 = await paid(
        s.adminA,
        toReceipt(rc.id, s.methods.transfer, "10"),
      );
      const p2 = await paid(
        s.adminA,
        toAccount(other, s.methods.transfer, "20"),
      );
      await paid(s.adminA, toAccount(s.supplierA, s.methods.transfer, "30"));
      await voidSupplierPayment(s.adminA, {
        paymentId: p2.id,
        reason: "other",
      });
      const list = async (query: {
        status?: "all" | "current" | "voided";
        supplierId?: string | null;
        search?: string;
      }) => {
        const result = await listSupplierPayments(s.adminA, {
          status: query.status ?? "all",
          supplierId: query.supplierId ?? null,
          search: query.search ?? "",
          page: 1,
        });
        if (!result.ok) throw new Error("lista rechazada");
        return result.payments.items.map((row) => row.displayNumber);
      };
      expect(await list({})).toEqual(["PP-000003", "PP-000002", "PP-000001"]);
      expect(await list({ status: "voided" })).toEqual(["PP-000002"]);
      expect(await list({ status: "current" })).toEqual([
        "PP-000003",
        "PP-000001",
      ]);
      expect(await list({ supplierId: other })).toEqual(["PP-000002"]);
      expect(await list({ search: "pp-000001" })).toEqual(["PP-000001"]);
      expect(await list({ search: "1" })).toEqual(["PP-000001"]);
      expect(await list({ search: "APP-000001" })).toEqual(["PP-000002"]);
      expect(await list({ search: "Importaciones" })).toEqual([]);

      const detail = await getSupplierPayment(s.adminA, p1.id);
      expect(detail).toMatchObject({
        ok: true,
        payment: {
          displayNumber: "PP-000001",
          goodsReceipt: { id: rc.id, displayNumber: rc.displayNumber },
          paymentMethodName: "Transferencia",
          createdByName: "Ana",
          session: null,
          voided: null,
        },
      });
    },
    TEST_TIMEOUT,
  );
});

describe("la serialización (AC-5; D-7 y D-8)", () => {
  it(
    "dos pagos a la misma recepción con lo justo: uno entra y el otro responde exceeds_outstanding",
    async () => {
      const s = await seed();
      const rc = await receipt(s.adminA, s.supplierA, s.productA, "1", "100");
      const release = await hold(lockCashOf(s.orgA));
      const first = createSupplierPayment(
        s.adminA,
        toReceipt(rc.id, s.methods.transfer, "100"),
      );
      const second = createSupplierPayment(
        s.adminA,
        toReceipt(rc.id, s.methods.transfer, "100"),
      );
      await waitForLockWaiters(2);
      await release();
      const results = await Promise.all([first, second]);
      expect(results.filter((row) => row.ok)).toHaveLength(1);
      expect(results.filter((row) => !row.ok)).toEqual([
        expect.objectContaining({
          rule: "exceeds_outstanding",
          outstanding: "0.00",
        }),
      ]);
    },
    TEST_TIMEOUT,
  );

  it(
    "un pago en efectivo contra un retiro, con lo justo en la caja: uno entra y lo esperado nunca queda negativo",
    async () => {
      const s = await seed();
      const session = await open(s.adminA, "100");
      const release = await hold(lockCashOf(s.orgA));
      const payment = createSupplierPayment(
        s.adminA,
        toAccount(s.supplierA, s.methods.cash, "100"),
      );
      const withdrawal = recordCashMovement(s.adminA, {
        sessionId: session.id,
        kind: "withdrawal",
        currency: "ARS",
        amount: "100",
        reason: "bank_deposit",
      });
      await waitForLockWaiters(2);
      await release();
      const results = await Promise.all([payment, withdrawal]);
      expect(results.filter((row) => row.ok)).toHaveLength(1);
      expect(results.filter((row) => !row.ok)).toEqual([
        expect.objectContaining({ rule: "insufficient_cash" }),
      ]);
      expect(await expected(s.adminA)).toMatchObject({ expected: "0.00" });
    },
    TEST_TIMEOUT,
  );

  // La anulación de la recepción no toma el bloqueo de cobros ni el proveedor (ADR 0023, punto 10):
  // no se serializa con el pago. Las dos ventanas en que puede entrar, cada una con lo que prueba.
  for (const window of ["el proveedor", "el contador"] as const) {
    it(
      `la recepción se anula mientras el pago espera ${window}: nada se pierde ni se cuenta dos veces`,
      async () => {
        const s = await seed();
        const rc = await receipt(s.adminA, s.supplierA, s.productA, "1", "100");
        const later = await receipt(
          s.adminA,
          s.supplierA,
          s.productA,
          "1",
          "500",
        );
        // Un pago en otra moneda deja la fila del contador creada sin tocar la cuenta en pesos.
        await paid(
          s.adminA,
          toAccount(s.supplierA, s.methods.transfer, "1", "USD"),
        );
        const release = await hold(
          window === "el proveedor"
            ? lockSupplierRow(s.supplierA)
            : sql`select last_number from document_counters
                  where organization_id = ${s.orgA} and kind = 'supplier_payment'
                  for update`,
        );
        const payment = createSupplierPayment(
          s.adminA,
          toReceipt(rc.id, s.methods.transfer, "60"),
        );
        await waitForLockWaiters(1);
        expect(
          await voidGoodsReceipt(s.adminA, rc.id, "data_entry_error"),
        ).toMatchObject({ ok: true });
        await release();
        const result = await payment;
        const sums = await getDb().execute<{ total: string }>(
          sql`select coalesce(sum(amount), 0)::text as total from supplier_payments p
              where currency = 'ARS' and not exists (
                select 1 from supplier_payment_voids v where v.supplier_payment_id = p.id)`,
        );
        const standing = await outstanding(s.adminA, rc.id);
        const laterStanding = await outstanding(s.adminA, later.id);
        if (window === "el proveedor") {
          // Releyó la recepción con el proveedor tomado y la vio anulada.
          expect(result).toMatchObject({ rule: "goods_receipt_voided" });
          expect(sums.rows[0]!.total).toBe("0");
          expect(laterStanding).toMatchObject({ imputed: "0.00" });
        } else {
          // Ya había comprobado: queda contra una recepción anulada (punto 10).
          expect(result).toMatchObject({ ok: true });
          expect(sums.rows[0]!.total).toBe("60.00");
          // Lo pagado contra la anulada pasó a la cuenta y se imputó a la siguiente, una sola vez.
          expect(standing).toMatchObject({ paid: "60.00", toAccount: "60.00" });
          expect(laterStanding).toMatchObject({
            imputed: "60.00",
            outstanding: "440.00",
          });
        }
      },
      TEST_TIMEOUT,
    );
  }

  it(
    "un pago que espera al proveedor no tiene tomado el contador",
    async () => {
      const s = await seed();
      // Un número ya tomado: la fila del contador existe.
      await paid(s.adminA, toAccount(s.supplierA, s.methods.transfer, "1"));
      const release = await hold(lockSupplierRow(s.supplierA));
      const payment = createSupplierPayment(
        s.adminA,
        toAccount(s.supplierA, s.methods.transfer, "2"),
      );
      await waitForLockWaiters(1);
      // Una tercera conexión toma la fila del contador sin esperar.
      const counter = await getDb().transaction(async (tx) => {
        const rows = await tx.execute<{ last_number: string }>(
          sql`select last_number::text from document_counters
              where organization_id = ${s.orgA} and kind = 'supplier_payment'
              for update nowait`,
        );
        return rows.rows[0]!.last_number;
      });
      expect(counter).toBe("1");
      await release();
      expect(await payment).toMatchObject({
        ok: true,
        payment: { displayNumber: "PP-000002" },
      });
    },
    TEST_TIMEOUT,
  );

  it(
    "dos anulaciones del mismo pago: una entra y la otra responde already_voided",
    async () => {
      const s = await seed();
      const payment = await paid(
        s.adminA,
        toAccount(s.supplierA, s.methods.transfer, "10"),
      );
      const release = await hold(lockCashOf(s.orgA));
      const first = voidSupplierPayment(s.adminA, {
        paymentId: payment.id,
        reason: "other",
      });
      const second = voidSupplierPayment(s.adminA, {
        paymentId: payment.id,
        reason: "not_paid",
      });
      await waitForLockWaiters(2);
      await release();
      const results = await Promise.all([first, second]);
      expect(results.filter((row) => row.ok)).toHaveLength(1);
      expect(results.filter((row) => !row.ok)).toEqual([
        expect.objectContaining({ rule: "already_voided" }),
      ]);
    },
    TEST_TIMEOUT,
  );

  for (const order of ["el cierre primero", "la anulación primero"] as const) {
    it(
      `la anulación de un pago en efectivo contra el cierre de su sesión (${order})`,
      async () => {
        const s = await seed();
        const session = await open(s.adminA, "1000");
        const payment = await paid(
          s.adminA,
          toAccount(s.supplierA, s.methods.cash, "300"),
        );
        const release = await hold(lockCashOf(s.orgA));
        const close = () =>
          closeCashSession(s.adminA, {
            sessionId: session.id,
            rows: [{ currency: "ARS", amount: "1000" }],
          });
        const voidIt = () =>
          voidSupplierPayment(s.adminA, {
            paymentId: payment.id,
            reason: "not_paid",
          });
        const firstCall = order === "el cierre primero" ? close() : voidIt();
        await waitForLockWaiters(1);
        const secondCall = order === "el cierre primero" ? voidIt() : close();
        await waitForLockWaiters(2);
        await release();
        const [a, b] = await Promise.all([firstCall, secondCall]);
        expect(a).toMatchObject({ ok: true });
        expect(b).toMatchObject({ ok: true });
        const voids = await getDb().execute<{ session_id: string | null }>(
          sql`select session_id from supplier_payment_voids`,
        );
        const closing = await getDb().execute<{ expected: string }>(
          sql`select expected from cash_session_closing_amounts`,
        );
        if (order === "el cierre primero") {
          expect(voids.rows).toEqual([{ session_id: null }]);
          expect(closing.rows).toEqual([{ expected: "700.00" }]);
        } else {
          expect(voids.rows).toEqual([{ session_id: session.id }]);
          expect(closing.rows).toEqual([{ expected: "1000.00" }]);
        }
      },
      TEST_TIMEOUT,
    );
  }
});

describe("el rendimiento (AC-8; D-14)", () => {
  // El umbral de 754 ms es el de la lista de clientes de la 13.2, que la 22.2 a la 22.5 también usaron.
  const THRESHOLD_MS = 754;

  it("un proveedor con 2.000 recepciones y 3.000 pagos, la lista con 10.000 y una sesión con 500 pagos en efectivo quedan bajo el umbral", async () => {
    const s = await seed();
    const session = await open(s.adminA, "100000000");
    const userId = s.adminA.userId;
    const other = await supplier(s.adminA, "Distribuidora Norte");
    // 2.000 recepciones del proveedor, la mitad en pesos y la mitad en dólares; 200 anuladas.
    await getDb().execute(
      sql`insert into goods_receipts (organization_id, number, supplier_id, currency, total,
                                        created_by)
            select ${s.orgA}, n, ${s.supplierA}, case when n % 2 = 0 then 'ARS' else 'USD' end,
                   100, ${userId}
            from generate_series(1, 2000) as n`,
    );
    await getDb().execute(
      sql`insert into goods_receipt_lines (organization_id, goods_receipt_id, product_id,
                                             position, quantity, unit_cost, line_total)
            select ${s.orgA}::uuid, id, ${s.productA}::uuid, 1, 1, 100, 100 from goods_receipts`,
    );
    await getDb().execute(
      sql`insert into goods_receipt_voids (organization_id, number, goods_receipt_id, currency,
                                             total, reason, created_by)
            select ${s.orgA}, number / 10, id, currency, 100, 'other', ${userId}
            from goods_receipts where number % 10 = 0`,
    );
    // 3.000 pagos del proveedor: 1.500 contra recepciones y 1.500 a cuenta. 500 son en efectivo y
    // en pesos de la sesión, que son los del detalle de la sesión: 250 contra recepciones distintas,
    // para que el detalle lea el número de cada una, y 250 a cuenta. 300 anulados.
    await getDb().execute(
      sql`insert into supplier_payments (organization_id, number, target, goods_receipt_id,
                                           supplier_id, payment_method_id, session_id, currency,
                                           amount, created_by)
            select ${s.orgA}, n, 'goods_receipt', r.id, ${s.supplierA},
                   case when n <= 500 and r.currency = 'ARS' then ${s.methods.cash}::uuid
                        else ${s.methods.transfer}::uuid end,
                   case when n <= 500 and r.currency = 'ARS' then ${session.id}::uuid end,
                   r.currency, 10, ${userId}
            from generate_series(1, 1500) as n
            join goods_receipts r on r.number = n`,
    );
    await getDb().execute(
      sql`insert into supplier_payments (organization_id, number, target, supplier_id,
                                           payment_method_id, session_id, currency, amount,
                                           created_by)
            select ${s.orgA}, 1500 + n, 'account', ${s.supplierA},
                   case when n <= 250 then ${s.methods.cash}::uuid else ${s.methods.transfer}::uuid end,
                   case when n <= 250 then ${session.id}::uuid else null end,
                   case when n <= 250 or n % 2 = 0 then 'ARS' else 'USD' end, 5,
                   ${userId}
            from generate_series(1, 1500) as n`,
    );
    await getDb().execute(
      sql`insert into supplier_payment_voids (organization_id, number, supplier_payment_id,
                                                currency, amount, reason, session_id, created_by)
            select ${s.orgA}, number / 10, id, currency, amount, 'other', session_id, ${userId}
            from supplier_payments where number % 10 = 0`,
    );
    // 7.000 pagos a cuenta de otro proveedor: 10.000 en la organización.
    await getDb().execute(
      sql`insert into supplier_payments (organization_id, number, target, supplier_id,
                                           payment_method_id, currency, amount, created_by)
            select ${s.orgA}, 3000 + n, 'account', ${other}, ${s.methods.transfer}, 'ARS', 1,
                   ${userId}
            from generate_series(1, 7000) as n`,
    );
    // El contador nace en 0 y solo suma de a 1 (document_counters_guard_change): se lo lleva hasta
    // el último número de a uno, para que el pago medido no choque con los números sembrados.
    await getDb().execute(
      sql`insert into document_counters (organization_id, kind, last_number)
            values (${s.orgA}, 'supplier_payment', 0), (${s.orgA}, 'supplier_payment_void', 0)`,
    );
    await getDb().execute(
      sql.raw(`do $$ begin
                   for i in 1..10000 loop
                     update document_counters set last_number = last_number + 1
                     where organization_id = '${s.orgA}' and kind = 'supplier_payment';
                   end loop;
                   for i in 1..300 loop
                     update document_counters set last_number = last_number + 1
                     where organization_id = '${s.orgA}' and kind = 'supplier_payment_void';
                   end loop;
                 end $$`),
    );
    for (const table of [
      "goods_receipts",
      "goods_receipt_lines",
      "goods_receipt_voids",
      "supplier_payments",
      "supplier_payment_voids",
    ]) {
      await getDb().execute(sql.raw(`analyze ${table}`));
    }
    const receiptId = (
      await getDb().execute<{ id: string }>(
        sql`select id from goods_receipts where number = 1998`,
      )
    ).rows[0]!.id;

    const timings: string[] = [];
    const measure = async (label: string, run: () => Promise<unknown>) => {
      // Una corrida previa calienta la caché: se mide la consulta, no el primer acceso.
      await run();
      const started = performance.now();
      const result = await run();
      const elapsed = performance.now() - started;
      expect(result, label).toMatchObject({ ok: true });
      expect(elapsed, label).toBeLessThan(THRESHOLD_MS);
      timings.push(`${label}: ${elapsed.toFixed(1)} ms`);
    };
    await measure("lo pagado de una recepción", () =>
      getGoodsReceiptPayments(s.adminA, receiptId),
    );
    await measure("el formulario del pago de una recepción", () =>
      getGoodsReceiptPaymentForm(s.adminA, receiptId),
    );
    await measure("el formulario del pago a cuenta", () =>
      getSupplierAccountPaymentForm(s.adminA, s.supplierA),
    );
    await measure("el pago a cuenta", () =>
      createSupplierPayment(
        s.adminA,
        toAccount(s.supplierA, s.methods.transfer, "1"),
      ),
    );
    await measure("el pago contra una recepción", () =>
      createSupplierPayment(
        s.adminA,
        toReceipt(receiptId, s.methods.transfer, "1"),
      ),
    );
    for (const query of [
      { status: "all", supplierId: null, search: "", page: 200 },
      { status: "current", supplierId: null, search: "", page: 100 },
      { status: "voided", supplierId: null, search: "", page: 5 },
      { status: "all", supplierId: s.supplierA, search: "", page: 50 },
      { status: "all", supplierId: null, search: "PP-009999", page: 1 },
      { status: "all", supplierId: null, search: "APP-000150", page: 1 },
    ] as const) {
      await measure(`lista ${JSON.stringify(query)}`, () =>
        listSupplierPayments(s.adminA, query),
      );
    }
    await measure("el detalle de la sesión con 500 pagos en efectivo", () =>
      getCashSession(s.adminA, session.id),
    );
    const detail = await getCashSession(s.adminA, session.id);
    if (!detail.ok) throw new Error("sesión no encontrada");
    expect(detail.session.supplierPayments?.items).toHaveLength(500);
    // Desde la 22.7 (brief-22.7, D-8 y AC-7): el estado de cuenta del proveedor, con más de 5.000
    // comprobantes, de los que muestra 500, y el resumen de su ficha. La lista de toda la organización
    // se mide con scripts/medir-caminos.ts; acá corre con este volumen, como control.
    await measure("el estado de cuenta del proveedor", () =>
      getSupplierStatement(s.adminA, s.supplierA),
    );
    await measure("el resumen de la cuenta en la ficha", () =>
      getSupplierAccountSummary(s.adminA, s.supplierA),
    );
    await measure("la lista de proveedores a los que se les debe", () =>
      listSuppliersOwed(s.adminA, { currency: null, page: 1 }),
    );
    const statement = await getSupplierStatement(s.adminA, s.supplierA);
    if (!statement.ok) throw new Error("estado de cuenta rechazado");
    expect(statement.statement.truncated).toBe(true);
    expect(statement.statement.documents).toHaveLength(500);
    // Los 500 más nuevos de todos sus comprobantes, y el resumen con todas las recepciones vigentes,
    // no solo las de esos 500 (revisión independiente de la 22.7, R5).
    const allDates = await getDb().execute<{ ms: string }>(
      sql`select floor(extract(epoch from created_at) * 1000)::bigint::text as ms from goods_receipts where supplier_id = ${s.supplierA}
          union all
          select floor(extract(epoch from v.created_at) * 1000)::bigint::text as ms from goods_receipt_voids v
            join goods_receipts r on r.id = v.goods_receipt_id where r.supplier_id = ${s.supplierA}
          union all
          select floor(extract(epoch from created_at) * 1000)::bigint::text as ms from supplier_payments where supplier_id = ${s.supplierA}
          union all
          select floor(extract(epoch from v.created_at) * 1000)::bigint::text as ms from supplier_payment_voids v
            join supplier_payments p on p.id = v.supplier_payment_id
           where p.supplier_id = ${s.supplierA}`,
    );
    const newest = allDates.rows
      .map((row) => Number(row.ms))
      .sort((a, b) => b - a);
    expect(newest.length).toBeGreaterThan(5000);
    expect(
      statement.statement.documents.map((row) => row.createdAt.getTime()),
    ).toEqual(newest.slice(0, 500));
    const current = await getDb().execute<{ count: string }>(
      sql`select count(*)::text as count from goods_receipts r
          where r.supplier_id = ${s.supplierA}
            and not exists (select 1 from goods_receipt_voids v where v.goods_receipt_id = r.id)`,
    );
    expect(
      statement.statement.currencies.reduce(
        (sum, account) => sum + account.receipts.length,
        0,
      ),
    ).toBe(Number(current.rows[0]!.count));
    console.info(timings.join("\n"));
  }, 120000);
});

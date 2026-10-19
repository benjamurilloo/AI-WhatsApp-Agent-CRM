import { sql, type SQL } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { hashPassword, login } from "@/modules/auth";
import {
  createInitialPaymentMethods,
  createRefund,
  createSaleReceipt,
  createSupplierPayment,
  closeCashSession,
  getCashSession,
  getCashState,
  getClientRefundForm,
  getGoodsReceiptPaymentForm,
  getRefund,
  getSaleRefundForm,
  getSupplierAccountPaymentForm,
  getSupplierAccountSummary,
  getSupplierStatement,
  listPaymentMethods,
  listSuppliersOwed,
  openCashSession,
  voidRefund,
  voidSupplierPayment,
  type CashAmountInput,
} from "@/modules/cash";
import { createExchangeSettings, recordExchangeRate } from "@/modules/fx";
import { adjustStock } from "@/modules/inventory";
import {
  getAuthContext,
  setMainCurrency,
  type AuthContext,
} from "@/modules/organizations";
import { createGoodsReceipt, createSupplier } from "@/modules/purchasing";
import { issueSale, voidSale } from "@/modules/sales";
import { getDb } from "@/shared/db";
import { exportClientData } from "../../scripts/client-data-export";
import { resetDatabase } from "./reset-database";

// Devoluciones y pagos en otra moneda contra PostgreSQL real (brief-29.4.3, D-10): la devolución desde
// la cuenta y la de una venta anulada, el pago de una recepción y a cuenta, sus anulaciones, la caja
// que cuenta lo que salió, los totales de referencia de proveedores, la exportación y que sin moneda
// principal nada cambia. A tiene USD como principal y ARS como la otra; B no tiene moneda principal.

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
  createdBy: string,
  amount: string,
  currency: string,
): Promise<Product> {
  const productId = await returningId(
    sql`insert into products (organization_id, sku, name)
        values (${organizationId}, 'P-1', 'Producto') returning id`,
  );
  const priceId = await returningId(
    sql`insert into product_prices (organization_id, product_id, amount, currency, created_by)
        values (${organizationId}, ${productId}, ${amount}, ${currency}, ${createdBy})
        returning id`,
  );
  return { productId, priceId };
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

// La moneda principal y la configuración, como las fija org:currency.
async function fixCurrency(organizationId: string, adminEmail: string) {
  await getDb().transaction(async (tx) => {
    const fixed = await setMainCurrency(tx, {
      organizationId,
      currency: "USD",
      adminEmail,
    });
    if (!fixed.ok) throw new Error(`moneda rechazada: ${fixed.code}`);
    const settings = await createExchangeSettings(tx, {
      organizationId,
      quoteCurrency: "ARS",
      actorUserId: fixed.actorUserId,
    });
    if (!settings.ok) throw new Error("configuración rechazada");
  });
}

async function seed() {
  const orgA = await returningId(
    sql`insert into organizations (name) values ('Tienda A') returning id`,
  );
  const orgB = await returningId(
    sql`insert into organizations (name) values ('Negocio B') returning id`,
  );
  const adminAId = await addUser(orgA, "admin-a@example.com", "Ana", "admin");
  await addUser(orgA, "viewer-a@example.com", "Vera", "viewer");
  await addUser(orgB, "admin-b@example.com", "Beto", "admin");
  const clientA = await returningId(
    sql`insert into clients (organization_id, display_name)
        values (${orgA}, 'Lucía') returning id`,
  );
  const dollars = await insertProduct(orgA, adminAId, "100.00", "USD");
  const adminA = await contextFor("admin-a@example.com");
  const adminB = await contextFor("admin-b@example.com");
  const stocked = await adjustStock(adminA, dollars.productId, {
    type: "adjustment_positive",
    quantity: "1000",
    expectedQuantityOnHand: "0",
    reason: "Carga inicial",
  });
  if (!stocked.ok) throw new Error("ajuste rechazado");
  const supplierA = await createSupplier(adminA, { name: "Importaciones" });
  const supplierB = await createSupplier(adminB, { name: "Importaciones" });
  if (!supplierA.ok || !supplierB.ok) throw new Error("proveedor rechazado");
  const productB = await returningId(
    sql`insert into products (organization_id, sku, name)
        values (${orgB}, 'P-1', 'Producto') returning id`,
  );
  return {
    orgA,
    orgB,
    clientA,
    dollars,
    adminA,
    adminB,
    viewerA: await contextFor("viewer-a@example.com"),
    methods: await methodIds(adminA),
    methodsB: await methodIds(adminB),
    supplierA: supplierA.supplierId,
    supplierB: supplierB.supplierId,
    productB,
  };
}

type Seed = Awaited<ReturnType<typeof seed>>;

async function rate(context: AuthContext, value: string) {
  const result = await recordExchangeRate(context, {
    rate: value,
    confirmLargeChange: true,
  });
  if (!result.ok) throw new Error(`cotización rechazada: ${result.code}`);
  return result.id;
}

async function open(context: AuthContext, rows: CashAmountInput[]) {
  const result = await openCashSession(context, { rows });
  if (!result.ok)
    throw new Error(`apertura rechazada: ${JSON.stringify(result)}`);
  return result.session;
}

async function expected(context: AuthContext, currency: string) {
  const state = await getCashState(context);
  if (!state.ok || !state.open) throw new Error("caja cerrada");
  return state.open.currencies.find((row) => row.currency === currency)
    ?.expected;
}

// Una venta de USD 100 cobrada por transferencia, con o sin cliente; anulada, deja USD 100 a favor del
// cliente, o a devolver sobre la venta.
async function creditOf100(s: Seed, clientId: string | null) {
  const sale = await issueSale(s.adminA, {
    clientId: clientId ?? "",
    lines: [
      {
        productId: s.dollars.productId,
        quantity: "1",
        expectedPriceId: s.dollars.priceId,
      },
    ],
  });
  if (!sale.ok) throw new Error(`venta rechazada: ${JSON.stringify(sale)}`);
  const paid = await createSaleReceipt(s.adminA, {
    saleId: sale.sale.id,
    paymentMethodId: s.methods.transfer,
    amount: "100",
  });
  if (!paid.ok) throw new Error(`cobro rechazado: ${JSON.stringify(paid)}`);
  const voided = await voidSale(s.adminA, sale.sale.id, "data_entry_error");
  if (!voided.ok) throw new Error(`anulación rechazada: ${voided.code}`);
  return sale.sale;
}

// Una recepción sin orden de una línea, de USD 100.
async function goodsReceipt(
  context: AuthContext,
  supplierId: string,
  productId: string,
  currency = "USD",
) {
  const result = await createGoodsReceipt(context, {
    purchaseOrderId: null,
    supplierId,
    currency,
    supplierReference: "",
    lines: [{ productId, quantity: "1", unitCost: "100" }],
  });
  if (!result.ok)
    throw new Error(`recepción rechazada: ${JSON.stringify(result)}`);
  return result.receipt;
}

async function tenderedRow(table: "refunds" | "supplier_payments", id: string) {
  const result = await getDb().execute<{
    currency: string;
    amount: string;
    tendered_currency: string | null;
    tendered_amount: string | null;
    exchange_rate: string | null;
    exchange_rate_id: string | null;
  }>(
    sql`select currency, amount, tendered_currency, tendered_amount, exchange_rate,
          exchange_rate_id from ${sql.identifier(table)} where id = ${id}`,
  );
  return result.rows[0]!;
}

// drizzle-orm envuelve el error de pg: la restricción y el mensaje quedan en la causa.
async function rejection(query: Promise<unknown>): Promise<string> {
  try {
    await query;
  } catch (error) {
    const e = error as {
      message?: string;
      cause?: { constraint?: string; message?: string };
    };
    return `${e.cause?.constraint ?? ""} ${e.cause?.message ?? e.message ?? ""}`;
  }
  throw new Error("La consulta debía ser rechazada y no lo fue.");
}

beforeEach(async () => {
  await resetDatabase(getDb());
  storedHash ??= await hashPassword(PASSWORD);
});

describe("el esquema (D-2)", () => {
  it(
    "los CHECK de lo que salió en las cuatro tablas, y los triggers de copia de las anulaciones",
    async () => {
      const s = await seed();
      await fixCurrency(s.orgA, "admin-a@example.com");
      const rateId = await rate(s.adminA, "1570");
      await creditOf100(s, s.clientA);
      const insertRefund = (columns: SQL) =>
        getDb().execute(
          sql`insert into refunds (organization_id, number, target, client_id, payment_method_id,
                currency, amount, created_by, tendered_currency, tendered_amount, exchange_rate,
                exchange_rate_id)
              values (${s.orgA}, 900, 'account', ${s.clientA}, ${s.methods.transfer}, 'USD',
                '10.00', ${s.adminA.userId}, ${columns})`,
        );
      expect(
        await rejection(insertRefund(sql`'ARS', null, '1570', null`)),
      ).toMatch(/refunds_tendered_together/);
      expect(
        await rejection(insertRefund(sql`null, null, null, ${rateId}`)),
      ).toMatch(/refunds_exchange_rate_id_tendered/);
      expect(
        await rejection(insertRefund(sql`'USD', '10.00', '1570', null`)),
      ).toMatch(/refunds_tendered_currency_distinct/);
      expect(
        await rejection(insertRefund(sql`'ARS', '0.00', '1570', null`)),
      ).toMatch(/refunds_tendered_amount_positive/);
      expect(
        await rejection(insertRefund(sql`'ARS', '10.00', '0.5', null`)),
      ).toMatch(/refunds_exchange_rate_minimum/);

      const received = await goodsReceipt(
        s.adminA,
        s.supplierA,
        s.dollars.productId,
      );
      const insertPayment = (columns: SQL) =>
        getDb().execute(
          sql`insert into supplier_payments (organization_id, number, target, goods_receipt_id,
                supplier_id, payment_method_id, currency, amount, created_by, tendered_currency,
                tendered_amount, exchange_rate, exchange_rate_id)
              values (${s.orgA}, 900, 'goods_receipt', ${received.id}, ${s.supplierA},
                ${s.methods.transfer}, 'USD', '10.00', ${s.adminA.userId}, ${columns})`,
        );
      expect(
        await rejection(insertPayment(sql`'ARS', null, '1570', null`)),
      ).toMatch(/supplier_payments_tendered_together/);
      expect(
        await rejection(insertPayment(sql`'USD', '10.00', '1570', null`)),
      ).toMatch(/supplier_payments_tendered_currency_distinct/);

      // Una devolución y un pago en pesos, y sus anulaciones sin copiar lo que salió.
      const refund = await createRefund(s.adminA, {
        target: "account",
        clientId: s.clientA,
        currency: "USD",
        paymentMethodId: s.methods.transfer,
        amount: "157000",
        tenderedCurrency: "ARS",
      });
      if (!refund.ok) throw new Error(JSON.stringify(refund));
      expect(
        await rejection(
          getDb().execute(
            sql`insert into refund_voids (organization_id, number, refund_id, currency, amount,
                  reason, session_id, created_by)
                select organization_id, 900, id, currency, amount, 'other', session_id, created_by
                from refunds where id = ${refund.refund.id}`,
          ),
        ),
      ).toMatch(/no copia lo que salió en su devolución/);
      const payment = await createSupplierPayment(s.adminA, {
        target: "goods_receipt",
        goodsReceiptId: received.id,
        paymentMethodId: s.methods.transfer,
        amount: "157000",
        tenderedCurrency: "ARS",
      });
      if (!payment.ok) throw new Error(JSON.stringify(payment));
      expect(
        await rejection(
          getDb().execute(
            sql`insert into supplier_payment_voids (organization_id, number, supplier_payment_id,
                  currency, amount, reason, session_id, created_by)
                select organization_id, 900, id, currency, amount, 'other', session_id, created_by
                from supplier_payments where id = ${payment.payment.id}`,
          ),
        ),
      ).toMatch(/no copia lo que salió en su pago/);
    },
    TEST_TIMEOUT,
  );
});

describe("la devolución en la otra moneda (D-3)", () => {
  it(
    "pesos contra lo que está a favor en dólares: la cuenta baja en dólares y la caja resta pesos",
    async () => {
      const s = await seed();
      await fixCurrency(s.orgA, "admin-a@example.com");
      const rateId = await rate(s.adminA, "1570");
      await open(s.adminA, [{ currency: "ARS", amount: "200000" }]);
      await creditOf100(s, s.clientA);

      const form = await getClientRefundForm(s.adminA, s.clientA);
      if (!form.ok) throw new Error("formulario rechazado");
      expect(form.exchange).toMatchObject({
        currency: "ARS",
        mainCurrency: "USD",
        rate: { id: rateId, value: "1570.000000" },
        outstanding: "157000.00",
      });

      const refund = await createRefund(s.adminA, {
        target: "account",
        clientId: s.clientA,
        currency: "USD",
        paymentMethodId: s.methods.cash,
        amount: "157000",
        tenderedCurrency: "ARS",
        exchangeRateId: rateId,
      });
      if (!refund.ok) throw new Error(JSON.stringify(refund));
      expect(await tenderedRow("refunds", refund.refund.id)).toEqual({
        currency: "USD",
        amount: "100.00",
        tendered_currency: "ARS",
        tendered_amount: "157000.00",
        exchange_rate: "1570.000000",
        exchange_rate_id: rateId,
      });
      expect(await expected(s.adminA, "ARS")).toBe("43000.00");
      const after = await getClientRefundForm(s.adminA, s.clientA);
      expect(after.ok && after.inFavor).toEqual([]);

      // Un viewer la ve con lo que salió, y la auditoría lo guarda.
      expect(await getRefund(s.viewerA, refund.refund.id)).toMatchObject({
        ok: true,
        refund: {
          currency: "USD",
          amount: "100.00",
          tender: {
            currency: "ARS",
            amount: "157000.00",
            exchangeRate: "1570.000000",
            negotiated: false,
          },
        },
      });
      const audit = await getDb().execute<{ diff: { after: object } }>(
        sql`select diff from audit_logs
            where entity_type = 'refund' and entity_id = ${refund.refund.id} and action = 'create'`,
      );
      expect(audit.rows[0]!.diff.after).toMatchObject({
        tendered_currency: "ARS",
        tendered_amount: "157000.00",
        exchange_rate: "1570.000000",
      });

      // La anulación devuelve los pesos a la caja y los dólares a la cuenta, copiando lo que salió.
      const voided = await voidRefund(s.adminA, {
        refundId: refund.refund.id,
        reason: "other",
      });
      expect(voided.ok).toBe(true);
      expect(await expected(s.adminA, "ARS")).toBe("200000.00");
      const back = await getClientRefundForm(s.adminA, s.clientA);
      expect(back.ok && back.inFavor).toMatchObject([
        { currency: "USD", amount: "100.00" },
      ]);
      const copy = await getDb().execute(
        sql`select tendered_currency, tendered_amount, exchange_rate_id from refund_voids
            where refund_id = ${refund.refund.id}`,
      );
      expect(copy.rows[0]).toEqual({
        tendered_currency: "ARS",
        tendered_amount: "157000.00",
        exchange_rate_id: rateId,
      });
    },
    TEST_TIMEOUT,
  );

  it(
    "la venta anulada sin cliente, el tope con la tolerancia de un centavo y la acordada",
    async () => {
      const s = await seed();
      await fixCurrency(s.orgA, "admin-a@example.com");
      await rate(s.adminA, "3");
      const sale = await creditOf100(s, null);
      const form = await getSaleRefundForm(s.adminA, sale.id);
      expect(form.ok && form.exchange).toMatchObject({
        currency: "ARS",
        outstanding: "300.00",
      });
      const refund = (amount: string, exchangeRate?: string) =>
        createRefund(s.adminA, {
          target: "sale",
          saleId: sale.id,
          paymentMethodId: s.methods.transfer,
          amount,
          tenderedCurrency: "ARS",
          ...(exchangeRate ? { exchangeRate } : {}),
        });
      // ARS 300,05 / 3 = 100,0167 → USD 100,02: dos centavos de más.
      expect(await refund("300,05")).toMatchObject({
        ok: false,
        rule: "exceeds_refundable",
        currency: "USD",
        available: "100.00",
      });
      // ARS 300,02 / 3 = 100,0067 → USD 100,01: un centavo, se aplica lo disponible.
      const fitted = await refund("300,02");
      if (!fitted.ok) throw new Error(JSON.stringify(fitted));
      expect(await tenderedRow("refunds", fitted.refund.id)).toMatchObject({
        amount: "100.00",
        tendered_amount: "300.02",
      });
      // Anulada, la acordada no pasa a ser la vigente y no guarda la fila de la cotización.
      await voidRefund(s.adminA, {
        refundId: fitted.refund.id,
        reason: "other",
      });
      const negotiated = await refund("250", "2,50");
      if (!negotiated.ok) throw new Error(JSON.stringify(negotiated));
      expect(await tenderedRow("refunds", negotiated.refund.id)).toEqual({
        currency: "USD",
        amount: "100.00",
        tendered_currency: "ARS",
        tendered_amount: "250.00",
        exchange_rate: "2.500000",
        exchange_rate_id: null,
      });
    },
    TEST_TIMEOUT,
  );

  it(
    "sin vigente, con la vigente cambiada, y sin pesos en la caja aunque haya dólares",
    async () => {
      const s = await seed();
      await fixCurrency(s.orgA, "admin-a@example.com");
      await creditOf100(s, s.clientA);
      const refund = (input: {
        exchangeRateId?: string;
        exchangeRate?: string;
        method?: string;
      }) =>
        createRefund(s.adminA, {
          target: "account",
          clientId: s.clientA,
          currency: "USD",
          paymentMethodId: input.method ?? s.methods.transfer,
          amount: "157000",
          tenderedCurrency: "ARS",
          ...input,
        });
      // Sin vigente se rechaza, también con una acordada.
      expect(await refund({})).toMatchObject({ rule: "no_exchange_rate" });
      expect(await refund({ exchangeRate: "1570" })).toMatchObject({
        rule: "no_exchange_rate",
      });
      const first = await rate(s.adminA, "1565");
      await rate(s.adminA, "1570");
      expect(await refund({ exchangeRateId: first })).toMatchObject({
        rule: "exchange_rate_changed",
      });
      // La caja tiene dólares y no pesos: la salida se mide en la moneda que sale.
      await open(s.adminA, [
        { currency: "USD", amount: "5000" },
        { currency: "ARS", amount: "1000" },
      ]);
      expect(await refund({ method: s.methods.cash })).toMatchObject({
        ok: false,
        rule: "insufficient_cash",
        currency: "ARS",
        expected: "1000.00",
      });
      // Nada se escribió.
      const count = await getDb().execute<{ total: number }>(
        sql`select count(*)::int as total from refunds`,
      );
      expect(count.rows[0]!.total).toBe(0);
    },
    TEST_TIMEOUT,
  );
});

describe("el pago a un proveedor en la otra moneda (D-4)", () => {
  it(
    "pesos contra una recepción en dólares: la cuenta baja en dólares y la caja resta pesos",
    async () => {
      const s = await seed();
      await fixCurrency(s.orgA, "admin-a@example.com");
      const rateId = await rate(s.adminA, "1570");
      await open(s.adminA, [{ currency: "ARS", amount: "200000" }]);
      const received = await goodsReceipt(
        s.adminA,
        s.supplierA,
        s.dollars.productId,
      );
      const form = await getGoodsReceiptPaymentForm(s.adminA, received.id);
      expect(form.ok && form.form.exchange).toMatchObject({
        currency: "ARS",
        outstanding: "157000.00",
      });

      const paid = await createSupplierPayment(s.adminA, {
        target: "goods_receipt",
        goodsReceiptId: received.id,
        paymentMethodId: s.methods.cash,
        amount: "157000",
        tenderedCurrency: "ARS",
        exchangeRateId: rateId,
      });
      if (!paid.ok) throw new Error(JSON.stringify(paid));
      expect(await tenderedRow("supplier_payments", paid.payment.id)).toEqual({
        currency: "USD",
        amount: "100.00",
        tendered_currency: "ARS",
        tendered_amount: "157000.00",
        exchange_rate: "1570.000000",
        exchange_rate_id: rateId,
      });
      expect(await expected(s.adminA, "ARS")).toBe("43000.00");
      const after = await getGoodsReceiptPaymentForm(s.adminA, received.id);
      expect(after.ok && after.form.outstanding).toBe("0.00");

      const voided = await voidSupplierPayment(s.adminA, {
        paymentId: paid.payment.id,
        reason: "other",
      });
      expect(voided.ok).toBe(true);
      expect(await expected(s.adminA, "ARS")).toBe("200000.00");
      const again = await getGoodsReceiptPaymentForm(s.adminA, received.id);
      expect(again.ok && again.form.outstanding).toBe("100.00");
    },
    TEST_TIMEOUT,
  );

  it(
    "a cuenta, la moneda aplicada es la principal o una con saldo (H-3)",
    async () => {
      const s = await seed();
      await fixCurrency(s.orgA, "admin-a@example.com");
      await rate(s.adminA, "1570");
      await goodsReceipt(s.adminA, s.supplierA, s.dollars.productId);
      const toAccount = (currency: string, tenderedCurrency?: string) =>
        createSupplierPayment(s.adminA, {
          target: "account",
          supplierId: s.supplierA,
          currency,
          paymentMethodId: s.methods.transfer,
          amount: currency === "USD" && !tenderedCurrency ? "10" : "15700",
          ...(tenderedCurrency ? { tenderedCurrency } : {}),
        });
      // Pesos aplicados en pesos a un proveedor que solo tiene saldo en dólares: no.
      expect(await toAccount("ARS")).toMatchObject({
        ok: false,
        code: "VALIDATION_ERROR",
        fields: ["currency"],
      });
      const form = await getSupplierAccountPaymentForm(s.adminA, s.supplierA);
      expect(form.ok && form.form.appliedCurrencies).toEqual(["USD"]);
      // Pesos aplicados en dólares, sí.
      const paid = await toAccount("USD", "ARS");
      if (!paid.ok) throw new Error(JSON.stringify(paid));
      expect(
        await tenderedRow("supplier_payments", paid.payment.id),
      ).toMatchObject({
        currency: "USD",
        amount: "10.00",
        tendered_amount: "15700.00",
      });
    },
    TEST_TIMEOUT,
  );
});

describe("la caja con salidas en las dos monedas (D-5; revisión R1-3)", () => {
  it(
    "lo esperado por moneda, el pago sin pesos suficientes y las anulaciones posteriores al cierre",
    async () => {
      const s = await seed();
      await fixCurrency(s.orgA, "admin-a@example.com");
      await rate(s.adminA, "1570");
      const session = await open(s.adminA, [
        { currency: "USD", amount: "500" },
        { currency: "ARS", amount: "300000" },
      ]);
      await creditOf100(s, s.clientA);
      const refund = (amount: string, tenderedCurrency?: string) =>
        createRefund(s.adminA, {
          target: "account",
          clientId: s.clientA,
          currency: "USD",
          paymentMethodId: s.methods.cash,
          amount,
          ...(tenderedCurrency ? { tenderedCurrency } : {}),
        });
      // USD 50 en dólares y USD 50 en pesos (ARS 78.500).
      const inDollars = await refund("50");
      const inPesos = await refund("78500", "ARS");
      if (!inDollars.ok || !inPesos.ok) throw new Error("devolución rechazada");
      const first = await goodsReceipt(
        s.adminA,
        s.supplierA,
        s.dollars.productId,
      );
      const paid = await createSupplierPayment(s.adminA, {
        target: "goods_receipt",
        goodsReceiptId: first.id,
        paymentMethodId: s.methods.cash,
        amount: "157000",
        tenderedCurrency: "ARS",
      });
      if (!paid.ok) throw new Error(JSON.stringify(paid));
      expect(await expected(s.adminA, "USD")).toBe("450.00");
      expect(await expected(s.adminA, "ARS")).toBe("64500.00");

      // Un pago en pesos que la caja no tiene, aunque tenga dólares: se mide en pesos.
      const second = await goodsReceipt(
        s.adminA,
        s.supplierA,
        s.dollars.productId,
      );
      expect(
        await createSupplierPayment(s.adminA, {
          target: "goods_receipt",
          goodsReceiptId: second.id,
          paymentMethodId: s.methods.cash,
          amount: "157000",
          tenderedCurrency: "ARS",
        }),
      ).toMatchObject({
        ok: false,
        rule: "insufficient_cash",
        currency: "ARS",
        expected: "64500.00",
      });

      // Cerrada la sesión, las anulaciones se muestran en lo que salió: pesos.
      const closed = await closeCashSession(s.adminA, {
        sessionId: session.id,
        rows: [
          { currency: "USD", amount: "450" },
          { currency: "ARS", amount: "64500" },
        ],
      });
      expect(closed.ok).toBe(true);
      expect(
        (
          await voidRefund(s.adminA, {
            refundId: inPesos.refund.id,
            reason: "other",
          })
        ).ok,
      ).toBe(true);
      expect(
        (
          await voidSupplierPayment(s.adminA, {
            paymentId: paid.payment.id,
            reason: "other",
          })
        ).ok,
      ).toBe(true);
      const detail = await getCashSession(s.adminA, session.id);
      if (!detail.ok) throw new Error("detalle rechazado");
      expect(detail.session.lateVoids).toMatchObject([
        { kind: "refund", currency: "ARS", amount: "78500.00" },
      ]);
      expect(detail.session.supplierPayments?.lateVoids).toMatchObject([
        { currency: "ARS", amount: "157000.00" },
      ]);
    },
    TEST_TIMEOUT,
  );

  it(
    "el tope de lo que vuelve a la caja se mide en la moneda que vuelve",
    async () => {
      const s = await seed();
      await fixCurrency(s.orgA, "admin-a@example.com");
      await rate(s.adminA, "1570");
      // Los dólares de la caja están en el tope: si la anulación midiera lo aplicado, la rechazaría.
      await open(s.adminA, [
        { currency: "USD", amount: "999999999999.99" },
        { currency: "ARS", amount: "157000" },
      ]);
      await creditOf100(s, s.clientA);
      const refund = await createRefund(s.adminA, {
        target: "account",
        clientId: s.clientA,
        currency: "USD",
        paymentMethodId: s.methods.cash,
        amount: "157000",
        tenderedCurrency: "ARS",
      });
      if (!refund.ok) throw new Error(JSON.stringify(refund));
      expect(await expected(s.adminA, "ARS")).toBe("0.00");
      const voided = await voidRefund(s.adminA, {
        refundId: refund.refund.id,
        reason: "other",
      });
      expect(voided.ok).toBe(true);
      expect(await expected(s.adminA, "ARS")).toBe("157000.00");
    },
    TEST_TIMEOUT,
  );

  it(
    "el pago con la vigente cambiada y con una acordada",
    async () => {
      const s = await seed();
      await fixCurrency(s.orgA, "admin-a@example.com");
      const old = await rate(s.adminA, "1565");
      await rate(s.adminA, "1570");
      const received = await goodsReceipt(
        s.adminA,
        s.supplierA,
        s.dollars.productId,
      );
      const pay = (input: { exchangeRateId?: string; exchangeRate?: string }) =>
        createSupplierPayment(s.adminA, {
          target: "goods_receipt",
          goodsReceiptId: received.id,
          paymentMethodId: s.methods.transfer,
          amount: "150000",
          tenderedCurrency: "ARS",
          ...input,
        });
      expect(await pay({ exchangeRateId: old })).toMatchObject({
        rule: "exchange_rate_changed",
      });
      const negotiated = await pay({ exchangeRate: "1500" });
      if (!negotiated.ok) throw new Error(JSON.stringify(negotiated));
      expect(
        await tenderedRow("supplier_payments", negotiated.payment.id),
      ).toEqual({
        currency: "USD",
        amount: "100.00",
        tendered_currency: "ARS",
        tendered_amount: "150000.00",
        exchange_rate: "1500.000000",
        exchange_rate_id: null,
      });
    },
    TEST_TIMEOUT,
  );
});

describe("una organización no usa la cotización de otra (D-10; revisión R1-2)", () => {
  it(
    "ni en la base ni en el servicio",
    async () => {
      const s = await seed();
      await fixCurrency(s.orgA, "admin-a@example.com");
      await fixCurrency(s.orgB, "admin-b@example.com");
      await rate(s.adminA, "1570");
      const rateB = await rate(s.adminB, "1570");
      await creditOf100(s, s.clientA);
      const received = await goodsReceipt(
        s.adminA,
        s.supplierA,
        s.dollars.productId,
      );

      // La base: la clave compuesta rechaza la cotización de B en una fila de A.
      expect(
        await rejection(
          getDb().execute(
            sql`insert into refunds (organization_id, number, target, client_id, payment_method_id,
                  currency, amount, created_by, tendered_currency, tendered_amount, exchange_rate,
                  exchange_rate_id)
                values (${s.orgA}, 900, 'account', ${s.clientA}, ${s.methods.transfer}, 'USD',
                  '10.00', ${s.adminA.userId}, 'ARS', '15700.00', '1570', ${rateB})`,
          ),
        ),
      ).toMatch(/refunds_exchange_rate_fk/);
      expect(
        await rejection(
          getDb().execute(
            sql`insert into supplier_payments (organization_id, number, target, goods_receipt_id,
                  supplier_id, payment_method_id, currency, amount, created_by, tendered_currency,
                  tendered_amount, exchange_rate, exchange_rate_id)
                values (${s.orgA}, 900, 'goods_receipt', ${received.id}, ${s.supplierA},
                  ${s.methods.transfer}, 'USD', '10.00', ${s.adminA.userId}, 'ARS', '15700.00',
                  '1570', ${rateB})`,
          ),
        ),
      ).toMatch(/supplier_payments_exchange_rate_fk/);

      // El servicio: la cotización de B no es la vigente de A.
      expect(
        await createRefund(s.adminA, {
          target: "account",
          clientId: s.clientA,
          currency: "USD",
          paymentMethodId: s.methods.transfer,
          amount: "157000",
          tenderedCurrency: "ARS",
          exchangeRateId: rateB,
        }),
      ).toMatchObject({ rule: "exchange_rate_changed" });
      expect(
        await createSupplierPayment(s.adminA, {
          target: "goods_receipt",
          goodsReceiptId: received.id,
          paymentMethodId: s.methods.transfer,
          amount: "157000",
          tenderedCurrency: "ARS",
          exchangeRateId: rateB,
        }),
      ).toMatchObject({ rule: "exchange_rate_changed" });
    },
    TEST_TIMEOUT,
  );
});

describe("los totales de referencia de proveedores (D-6)", () => {
  it(
    "la ficha, el estado de cuenta y «A pagar», con la vigente",
    async () => {
      const s = await seed();
      await fixCurrency(s.orgA, "admin-a@example.com");
      await rate(s.adminA, "1570");
      await goodsReceipt(s.adminA, s.supplierA, s.dollars.productId);
      await goodsReceipt(s.adminA, s.supplierA, s.dollars.productId, "ARS");

      const summary = await getSupplierAccountSummary(s.adminA, s.supplierA);
      // USD 100 más ARS 100 a 1570: USD 100,06.
      expect(summary.ok && summary.references.owed).toMatchObject({
        currency: "USD",
        total: "100.06",
        quoteCurrency: "ARS",
        unconverted: [],
      });
      expect(summary.ok && summary.references.inFavor).toBeNull();
      const statement = await getSupplierStatement(s.adminA, s.supplierA);
      expect(statement.ok && statement.statement.references.owed).toMatchObject(
        { total: "100.06" },
      );
      const owed = await listSuppliersOwed(s.adminA, {
        currency: null,
        page: 1,
      });
      expect(owed.ok && owed.suppliers.reference).toMatchObject({
        total: "100.06",
      });
    },
    TEST_TIMEOUT,
  );
});

describe("la exportación de los datos de un cliente (D-8)", () => {
  it(
    "trae lo que entró y lo que salió en la otra moneda",
    async () => {
      const s = await seed();
      await fixCurrency(s.orgA, "admin-a@example.com");
      await rate(s.adminA, "1570");
      await creditOf100(s, s.clientA);
      const refund = await createRefund(s.adminA, {
        target: "account",
        clientId: s.clientA,
        currency: "USD",
        paymentMethodId: s.methods.transfer,
        amount: "157000",
        tenderedCurrency: "ARS",
      });
      if (!refund.ok) throw new Error(JSON.stringify(refund));
      const data = await exportClientData(getDb(), s.orgA, s.clientA);
      expect(data.refunds[0]).toMatchObject({
        currency: "USD",
        amount: "100.00",
        tendered_currency: "ARS",
        tendered_amount: "157000.00",
        exchange_rate: "1570.000000",
      });
      // El cobro de la venta fue en dólares: sin otra moneda, las columnas van vacías.
      expect(data.receipts[0]).toMatchObject({
        currency: "USD",
        tendered_currency: null,
        tendered_amount: null,
        exchange_rate: null,
      });
    },
    TEST_TIMEOUT,
  );
});

describe("sin moneda principal nada cambia (invariante 1)", () => {
  it(
    "la devolución y el pago no ofrecen otra moneda, y el pago a cuenta acepta cualquiera",
    async () => {
      const s = await seed();
      const received = await goodsReceipt(s.adminB, s.supplierB, s.productB);
      const form = await getGoodsReceiptPaymentForm(s.adminB, received.id);
      expect(form.ok && form.form.exchange).toBeNull();
      const account = await getSupplierAccountPaymentForm(
        s.adminB,
        s.supplierB,
      );
      expect(account.ok && account.form).toMatchObject({
        appliedCurrencies: null,
        mainCurrency: null,
        exchange: null,
      });
      expect(
        await createSupplierPayment(s.adminB, {
          target: "goods_receipt",
          goodsReceiptId: received.id,
          paymentMethodId: s.methodsB.transfer,
          amount: "157000",
          tenderedCurrency: "ARS",
        }),
      ).toMatchObject({
        ok: false,
        code: "VALIDATION_ERROR",
        fields: ["tenderedCurrency"],
      });
      // Pesos a cuenta de un proveedor que solo tiene saldo en dólares: como siempre, se aceptan.
      const paid = await createSupplierPayment(s.adminB, {
        target: "account",
        supplierId: s.supplierB,
        currency: "ARS",
        paymentMethodId: s.methodsB.transfer,
        amount: "1000",
      });
      expect(paid.ok).toBe(true);
      const summary = await getSupplierAccountSummary(s.adminB, s.supplierB);
      expect(summary.ok && summary.references).toEqual({
        owed: null,
        inFavor: null,
      });

      // La devolución (revisión R1-4): sin elección de moneda, y la otra moneda se rechaza.
      const clientB = await returningId(
        sql`insert into clients (organization_id, display_name)
            values (${s.orgB}, 'Bruno') returning id`,
      );
      const refundForm = await getClientRefundForm(s.adminB, clientB);
      expect(refundForm.ok && refundForm.exchange).toBeNull();
      expect(
        await createRefund(s.adminB, {
          target: "account",
          clientId: clientB,
          currency: "USD",
          paymentMethodId: s.methodsB.transfer,
          amount: "157000",
          tenderedCurrency: "ARS",
        }),
      ).toMatchObject({
        ok: false,
        code: "VALIDATION_ERROR",
        fields: ["tenderedCurrency"],
      });
    },
    TEST_TIMEOUT,
  );
});

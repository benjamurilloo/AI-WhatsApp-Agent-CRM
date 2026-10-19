import { sql, type SQL } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { hashPassword, login } from "@/modules/auth";
import {
  createAccountReceipt,
  createInitialPaymentMethods,
  createOrderReceipt,
  createSaleReceipt,
  getAccountReceiptForm,
  getCashState,
  getClientAccountSummary,
  getOpeningProposal,
  getReceipt,
  getSaleReceiptForm,
  listDebtors,
  listPaymentMethods,
  openCashSession,
  recordCashMovement,
  voidReceipt,
  type CashAmountInput,
} from "@/modules/cash";
import {
  createExchangeSettings,
  getExchangeRatePage,
  getExchangeSetup,
  recordExchangeRate,
} from "@/modules/fx";
import { adjustStock } from "@/modules/inventory";
import { createOrder } from "@/modules/orders";
import {
  getAuthContext,
  getMainCurrency,
  setMainCurrency,
  type AuthContext,
} from "@/modules/organizations";
import { issueSale } from "@/modules/sales";
import { getDb } from "@/shared/db";
import { resetDatabase } from "./reset-database";

// El tipo de cambio contra PostgreSQL real (brief-29.4, D-13): la moneda principal y el script, la
// cotización manual, los tres cobros en la otra moneda con su anulación, la caja que cuenta lo
// recibido, los totales de referencia y que sin moneda principal nada cambia. A tiene USD como
// principal y ARS como la otra; B no tiene moneda principal. Un producto de USD 100 por unidad en A, y
// uno de ARS 1000 en B.

const PASSWORD = "contraseña-correcta-larga";
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
  sku = "P-1",
): Promise<Product> {
  const productId = await returningId(
    sql`insert into products (organization_id, sku, name)
        values (${organizationId}, ${sku}, 'Producto') returning id`,
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
  return { cash: idOf("Efectivo"), transfer: idOf("Transferencia") };
}

// La moneda principal y la configuración, como las fija org:currency.
async function fixCurrency(organizationId: string, adminEmail: string) {
  return getDb().transaction(async (tx) => {
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
    if (!settings.ok) throw new Error(`configuración rechazada`);
    return { fixed, settings };
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
  const adminBId = await addUser(orgB, "admin-b@example.com", "Beto", "admin");
  const clientA = await returningId(
    sql`insert into clients (organization_id, display_name)
        values (${orgA}, 'Lucía') returning id`,
  );
  const clientB = await returningId(
    sql`insert into clients (organization_id, display_name)
        values (${orgB}, 'Berta') returning id`,
  );
  const dollars = await insertProduct(orgA, adminAId, "100.00", "USD");
  const pesosB = await insertProduct(orgB, adminBId, "1000.00", "ARS");
  // Una venta en la otra moneda de A (revisión independiente de la 29.4, R1-1).
  const pesos = await insertProduct(orgA, adminAId, "100000.00", "ARS", "P-2");
  const s = {
    orgA,
    orgB,
    clientA,
    clientB,
    dollars,
    pesos,
    pesosB,
    adminA: await contextFor("admin-a@example.com"),
    viewerA: await contextFor("viewer-a@example.com"),
    adminB: await contextFor("admin-b@example.com"),
  };
  await stock(s.adminA, dollars.productId);
  await stock(s.adminA, pesos.productId);
  await stock(s.adminB, pesosB.productId);
  return {
    ...s,
    methods: await methodIds(s.adminA),
    methodsB: await methodIds(s.adminB),
  };
}

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

async function open(context: AuthContext, rows: CashAmountInput[]) {
  const result = await openCashSession(context, { rows });
  if (!result.ok)
    throw new Error(`apertura rechazada: ${JSON.stringify(result)}`);
  return result.session;
}

async function rate(context: AuthContext, value: string) {
  const result = await recordExchangeRate(context, {
    rate: value,
    confirmLargeChange: true,
  });
  if (!result.ok) throw new Error(`cotización rechazada: ${result.code}`);
  return result.id;
}

async function expected(context: AuthContext, currency: string) {
  const state = await getCashState(context);
  if (!state.ok || !state.open) throw new Error("caja cerrada");
  return state.open.currencies.find((row) => row.currency === currency)
    ?.expected;
}

async function owed(context: AuthContext, clientId: string) {
  const summary = await getClientAccountSummary(context, clientId);
  if (!summary.ok) throw new Error("cuenta rechazada");
  return summary;
}

async function receiptRow(id: string) {
  const result = await getDb().execute<{
    currency: string;
    amount: string;
    tendered_currency: string | null;
    tendered_amount: string | null;
    exchange_rate: string | null;
    exchange_rate_id: string | null;
  }>(
    sql`select currency, amount, tendered_currency, tendered_amount, exchange_rate,
          exchange_rate_id from receipts where id = ${id}`,
  );
  return result.rows[0]!;
}

// drizzle-orm envuelve el error de pg: la restricción y el mensaje de PostgreSQL quedan en la causa,
// como en receipts-schema.test.ts.
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

describe("el esquema (D-6)", () => {
  it("los CHECK de lo recibido y la cotización de solo inserción", async () => {
    const s = await seed();
    await fixCurrency(s.orgA, "admin-a@example.com");
    const rateId = await rate(s.adminA, "1565");
    const sale = await sell(s.adminA, s.dollars, 1, s.clientA);
    const insert = (columns: SQL) =>
      getDb().execute(
        sql`insert into receipts (organization_id, number, target, sale_id, client_id,
              payment_method_id, currency, amount, created_by, tendered_currency, tendered_amount,
              exchange_rate, exchange_rate_id)
            values (${s.orgA}, 900, 'sale', ${sale.id}, ${s.clientA}, ${s.methods.transfer},
              'USD', '10.00', ${s.adminA.userId}, ${columns})`,
      );
    // Las tres juntas o ninguna.
    expect(await rejection(insert(sql`'ARS', null, '1565', null`))).toMatch(
      /receipts_tendered_together/,
    );
    // La fila de la cotización, solo con lo recibido.
    expect(await rejection(insert(sql`null, null, null, ${rateId}`))).toMatch(
      /receipts_exchange_rate_id_tendered/,
    );
    // Otra moneda que la aplicada, monto positivo y cotización de al menos 1.
    expect(await rejection(insert(sql`'USD', '10.00', '1565', null`))).toMatch(
      /receipts_tendered_currency_distinct/,
    );
    expect(await rejection(insert(sql`'ARS', '0.00', '1565', null`))).toMatch(
      /receipts_tendered_amount_positive/,
    );
    expect(await rejection(insert(sql`'ARS', '10.00', '0.5', null`))).toMatch(
      /receipts_exchange_rate_minimum/,
    );
    // Una cotización no se edita ni se borra, y es al menos 1.
    expect(
      await rejection(
        getDb().execute(
          sql`update exchange_rates set rate = 2 where id = ${rateId}`,
        ),
      ),
    ).toMatch(/solo inserción/);
    expect(
      await rejection(
        getDb().execute(sql`delete from exchange_rates where id = ${rateId}`),
      ),
    ).toMatch(/solo inserción/);
    expect(
      await rejection(
        getDb().execute(
          sql`insert into exchange_rates (organization_id, base_currency, quote_currency, rate,
                source, recorded_by)
              values (${s.orgA}, 'USD', 'ARS', '0.9', 'manual', ${s.adminA.userId})`,
        ),
      ),
    ).toMatch(/exchange_rates_rate_minimum/);
  });
});

describe("la moneda principal y el script (D-2)", () => {
  it("la fija una vez, audita, no la cambia y no rehace la configuración", async () => {
    const s = await seed();
    expect(await getMainCurrency(s.orgA)).toBeNull();
    const first = await fixCurrency(s.orgA, "admin-a@example.com");
    expect(first.fixed.status).toBe("set");
    expect(first.settings.status).toBe("created");
    expect(await getMainCurrency(s.orgA)).toBe("USD");

    const again = await fixCurrency(s.orgA, "admin-a@example.com");
    expect(again.fixed.status).toBe("already_set");
    expect(again.settings.status).toBe("already_created");

    const change = await getDb().transaction((tx) =>
      setMainCurrency(tx, {
        organizationId: s.orgA,
        currency: "EUR",
        adminEmail: "admin-a@example.com",
      }),
    );
    expect(change).toEqual({ ok: false, code: "CONFLICT", current: "USD" });

    const otherQuote = await getDb().transaction((tx) =>
      createExchangeSettings(tx, {
        organizationId: s.orgA,
        quoteCurrency: "EUR",
        actorUserId: s.adminA.userId,
      }),
    );
    expect(otherQuote).toEqual({ ok: false, code: "CONFLICT", current: "ARS" });

    const audit = await getDb().execute<{ entity_type: string; diff: unknown }>(
      sql`select entity_type, diff from audit_logs
          where organization_id = ${s.orgA}
            and entity_type in ('organization', 'exchange_rate_setting')
          order by created_at`,
    );
    expect(audit.rows).toEqual([
      {
        entity_type: "organization",
        diff: {
          before: { main_currency: null },
          after: { main_currency: "USD" },
        },
      },
      {
        entity_type: "exchange_rate_setting",
        diff: {
          before: null,
          after: { quote_currency: "ARS", source: "manual", origen: "script" },
        },
      },
    ]);
  });

  it("rechaza un viewer, una moneda no aceptada y la otra igual a la principal", async () => {
    const s = await seed();
    const viewer = await getDb().transaction((tx) =>
      setMainCurrency(tx, {
        organizationId: s.orgA,
        currency: "USD",
        adminEmail: "viewer-a@example.com",
      }),
    );
    expect(viewer).toEqual({ ok: false, code: "FORBIDDEN" });
    const unknown = await getDb().transaction((tx) =>
      setMainCurrency(tx, {
        organizationId: s.orgA,
        currency: "XXX",
        adminEmail: "admin-a@example.com",
      }),
    );
    expect(unknown).toEqual({ ok: false, code: "VALIDATION_ERROR" });
    await expect(
      getDb().transaction(async (tx) => {
        const fixed = await setMainCurrency(tx, {
          organizationId: s.orgA,
          currency: "USD",
          adminEmail: "admin-a@example.com",
        });
        if (!fixed.ok) throw new Error("no");
        const same = await createExchangeSettings(tx, {
          organizationId: s.orgA,
          quoteCurrency: "USD",
          actorUserId: fixed.actorUserId,
        });
        // Falla la configuración: la transacción entera se revierte.
        if (!same.ok) throw new Error(`configuración: ${same.code}`);
      }),
    ).rejects.toThrow(/VALIDATION_ERROR/);
    expect(await getMainCurrency(s.orgA)).toBeNull();
  });
});

describe("la cotización (D-4)", () => {
  it("la vigente es la última; un viewer la ve sin cargarla; el 10 % pide confirmación", async () => {
    const s = await seed();
    await fixCurrency(s.orgA, "admin-a@example.com");
    const empty = await getExchangeRatePage(s.viewerA);
    expect(empty).toMatchObject({
      ok: true,
      value: { current: null, total: 0 },
    });

    await rate(s.adminA, "1.565,50");
    const large = await recordExchangeRate(s.adminA, { rate: "1800" });
    expect(large).toEqual({
      ok: false,
      code: "BUSINESS_RULE_VIOLATION",
      rule: "large_change",
      current: "1.565,50",
    });
    await rate(s.adminA, "1600");

    const page = await getExchangeRatePage(s.viewerA);
    if (!page.ok) throw new Error("página rechazada");
    expect(page.value.mainCurrency).toBe("USD");
    expect(page.value.quoteCurrency).toBe("ARS");
    expect(page.value.current?.rate).toBe(1_600_000_000n);
    expect(page.value.current?.recordedByName).toBe("Ana");
    expect(page.value.history.map((row) => row.rate)).toEqual([
      1_600_000_000n,
      1_565_500_000n,
    ]);

    expect(await recordExchangeRate(s.viewerA, { rate: "1700" })).toEqual({
      ok: false,
      code: "FORBIDDEN",
    });
    expect(await recordExchangeRate(s.adminA, { rate: "0,5" })).toEqual({
      ok: false,
      code: "VALIDATION_ERROR",
      reason: "below_one",
    });
  });

  it("sin moneda principal la sección no existe, y una organización no ve la de otra", async () => {
    const s = await seed();
    await fixCurrency(s.orgA, "admin-a@example.com");
    await rate(s.adminA, "1565");
    expect(await getExchangeRatePage(s.adminB)).toEqual({
      ok: false,
      code: "NOT_FOUND",
    });
    expect(await recordExchangeRate(s.adminB, { rate: "1565" })).toEqual({
      ok: false,
      code: "NOT_FOUND",
    });
    expect(await getExchangeSetup(s.orgB)).toBeNull();
  });
});

describe("el cobro en la otra moneda (D-6)", () => {
  it("pesos contra una venta en dólares: la cuenta baja en dólares y la caja suma pesos", async () => {
    const s = await seed();
    await fixCurrency(s.orgA, "admin-a@example.com");
    const rateId = await rate(s.adminA, "1565");
    await open(s.adminA, [{ currency: "ARS", amount: "0" }]);
    const sale = await sell(s.adminA, s.dollars, 2, s.clientA);

    const form = await getSaleReceiptForm(s.adminA, sale.id);
    if (!form.ok) throw new Error("formulario rechazado");
    expect(form.exchange).toMatchObject({
      currency: "ARS",
      mainCurrency: "USD",
      rate: { id: rateId, value: "1565.000000" },
      outstanding: "313000.00",
      outstandingInput: "313000.00",
    });

    const paid = await createSaleReceipt(s.adminA, {
      saleId: sale.id,
      paymentMethodId: s.methods.cash,
      amount: "156500",
      tenderedCurrency: "ARS",
      exchangeRateId: rateId,
    });
    if (!paid.ok) throw new Error(`cobro rechazado: ${JSON.stringify(paid)}`);
    expect(await receiptRow(paid.receipt.id)).toEqual({
      currency: "USD",
      amount: "100.00",
      tendered_currency: "ARS",
      tendered_amount: "156500.00",
      exchange_rate: "1565.000000",
      exchange_rate_id: rateId,
    });
    expect(await expected(s.adminA, "ARS")).toBe("156500.00");
    expect(await expected(s.adminA, "USD")).toBeUndefined();
    const account = await owed(s.adminA, s.clientA);
    expect(account.currencies).toMatchObject([
      { currency: "USD", owed: "100.00" },
    ]);
    // La ficha del cobro muestra los dos montos.
    const detail = await getReceipt(s.viewerA, paid.receipt.id);
    expect(detail).toMatchObject({
      ok: true,
      receipt: {
        currency: "USD",
        amount: "100.00",
        tender: {
          currency: "ARS",
          amount: "156500.00",
          exchangeRate: "1565.000000",
          negotiated: false,
        },
      },
    });
    const audit = await getDb().execute<{ diff: { after: object } }>(
      sql`select diff from audit_logs where entity_type = 'receipt' and entity_id = ${paid.receipt.id}`,
    );
    expect(audit.rows[0]!.diff.after).toMatchObject({
      currency: "USD",
      amount: "100.00",
      tendered_currency: "ARS",
      tendered_amount: "156500.00",
      exchange_rate: "1565.000000",
    });
  });

  it("el tope con la tolerancia de un centavo, después de redondear (R-M4)", async () => {
    const s = await seed();
    await fixCurrency(s.orgA, "admin-a@example.com");
    await rate(s.adminA, "3");
    const sale = await sell(s.adminA, s.dollars, 1, s.clientA);
    const pay = (amount: string) =>
      createSaleReceipt(s.adminA, {
        saleId: sale.id,
        paymentMethodId: s.methods.transfer,
        amount,
        tenderedCurrency: "ARS",
      });
    // ARS 300,05 / 3 = 100,0167 → USD 100,02: dos centavos de más.
    expect(await pay("300,05")).toMatchObject({
      ok: false,
      rule: "exceeds_outstanding",
      outstanding: "100.00",
    });
    // ARS 300,02 / 3 = 100,0067 → USD 100,01: uno de más, se aplica lo que falta.
    const fitted = await pay("300,02");
    if (!fitted.ok) throw new Error("cobro rechazado");
    expect(await receiptRow(fitted.receipt.id)).toMatchObject({
      amount: "100.00",
      tendered_amount: "300.02",
    });
  });

  it("sin vigente se rechaza, aunque venga una acordada (R1-2); la acordada no apunta a la vigente ni la cambia; con otra vigente, se rechaza", async () => {
    const s = await seed();
    await fixCurrency(s.orgA, "admin-a@example.com");
    const sale = await sell(s.adminA, s.dollars, 3, s.clientA);
    const base = {
      saleId: sale.id,
      paymentMethodId: s.methods.transfer,
      tenderedCurrency: "ARS",
    };
    expect(
      await createSaleReceipt(s.adminA, { ...base, amount: "1000" }),
    ).toEqual({
      ok: false,
      code: "BUSINESS_RULE_VIOLATION",
      rule: "no_exchange_rate",
    });
    expect(
      await createSaleReceipt(s.adminA, {
        ...base,
        amount: "160000",
        exchangeRate: "1.600",
      }),
    ).toEqual({
      ok: false,
      code: "BUSINESS_RULE_VIOLATION",
      rule: "no_exchange_rate",
    });

    const first = await rate(s.adminA, "1565");
    const negotiated = await createSaleReceipt(s.adminA, {
      ...base,
      amount: "160000",
      exchangeRate: "1.600",
      exchangeRateId: first,
    });
    if (!negotiated.ok) throw new Error("cobro rechazado");
    expect(await receiptRow(negotiated.receipt.id)).toMatchObject({
      amount: "100.00",
      exchange_rate: "1600.000000",
      exchange_rate_id: null,
    });
    expect((await getExchangeSetup(s.orgA))?.current?.id).toBe(first);

    await rate(s.adminA, "1570");
    expect(
      await createSaleReceipt(s.adminA, {
        ...base,
        amount: "1000",
        exchangeRateId: first,
      }),
    ).toEqual({
      ok: false,
      code: "BUSINESS_RULE_VIOLATION",
      rule: "exchange_rate_changed",
    });
  });

  // Revisión independiente de la 29.4, R1-1: dólares contra pesos, el redondeo de lo recibido se
  // multiplica por la cotización (63,90 x 1.565 = 100.003,50 contra 100.000,00). No se ofrece ni se
  // acepta: un destino en la otra moneda se cobra en su moneda (ADR 0025, punto 5).
  it("una venta en la otra moneda no se cobra en la principal", async () => {
    const s = await seed();
    await fixCurrency(s.orgA, "admin-a@example.com");
    const rateId = await rate(s.adminA, "1565");
    const sale = await sell(s.adminA, s.pesos, 1, s.clientA);
    const form = await getSaleReceiptForm(s.adminA, sale.id);
    if (!form.ok) throw new Error("formulario rechazado");
    expect(form.exchange).toBeNull();
    expect(
      await createSaleReceipt(s.adminA, {
        saleId: sale.id,
        paymentMethodId: s.methods.transfer,
        amount: "63,90",
        tenderedCurrency: "USD",
        exchangeRateId: rateId,
      }),
    ).toMatchObject({
      ok: false,
      code: "VALIDATION_ERROR",
      fields: ["tenderedCurrency"],
    });
    // Un cobro a cuenta aplicado en pesos, con saldo en pesos, tampoco recibe dólares.
    expect(
      await createAccountReceipt(s.adminA, {
        clientId: s.clientA,
        currency: "ARS",
        paymentMethodId: s.methods.transfer,
        amount: "10",
        tenderedCurrency: "USD",
        exchangeRateId: rateId,
      }),
    ).toMatchObject({
      ok: false,
      code: "VALIDATION_ERROR",
      fields: ["tenderedCurrency"],
    });
    const paid = await createSaleReceipt(s.adminA, {
      saleId: sale.id,
      paymentMethodId: s.methods.transfer,
      amount: "100000",
    });
    expect(paid.ok).toBe(true);
  });

  it("la seña de un pedido en dólares, en pesos", async () => {
    const s = await seed();
    await fixCurrency(s.orgA, "admin-a@example.com");
    await rate(s.adminA, "1565");
    const created = await createOrder(s.adminA, {
      clientId: s.clientA,
      lines: [
        {
          productId: s.dollars.productId,
          quantity: "1",
          expectedPriceId: s.dollars.priceId,
        },
      ],
    });
    if (!created.ok) throw new Error("pedido rechazado");
    const deposit = await createOrderReceipt(s.adminA, {
      orderId: created.order.id,
      paymentMethodId: s.methods.transfer,
      amount: "78250",
      tenderedCurrency: "ARS",
    });
    if (!deposit.ok)
      throw new Error(`seña rechazada: ${JSON.stringify(deposit)}`);
    expect(await receiptRow(deposit.receipt.id)).toMatchObject({
      currency: "USD",
      amount: "50.00",
      tendered_currency: "ARS",
      tendered_amount: "78250.00",
    });
  });

  it("el cobro a cuenta se aplica en la principal o en una moneda con saldo (R-M2)", async () => {
    const s = await seed();
    await fixCurrency(s.orgA, "admin-a@example.com");
    await rate(s.adminA, "1565");
    await sell(s.adminA, s.dollars, 1, s.clientA);

    const form = await getAccountReceiptForm(s.adminA, s.clientA);
    if (!form.ok) throw new Error("formulario rechazado");
    expect(form.exchange?.appliedCurrencies).toEqual(["USD"]);

    // Pesos aplicados en pesos: el cliente no tiene saldo en pesos.
    expect(
      await createAccountReceipt(s.adminA, {
        clientId: s.clientA,
        currency: "ARS",
        paymentMethodId: s.methods.transfer,
        amount: "1000",
      }),
    ).toEqual({ ok: false, code: "VALIDATION_ERROR", fields: ["currency"] });

    // Pesos recibidos, aplicados en dólares.
    const paid = await createAccountReceipt(s.adminA, {
      clientId: s.clientA,
      currency: "USD",
      paymentMethodId: s.methods.transfer,
      amount: "78250",
      tenderedCurrency: "ARS",
    });
    if (!paid.ok) throw new Error(`cobro rechazado: ${JSON.stringify(paid)}`);
    expect(await receiptRow(paid.receipt.id)).toMatchObject({
      currency: "USD",
      amount: "50.00",
      tendered_currency: "ARS",
    });
    expect((await owed(s.adminA, s.clientA)).currencies).toMatchObject([
      { currency: "USD", owed: "50.00" },
    ]);
  });
});

describe("la anulación (D-6) y la caja (D-7)", () => {
  it("devuelve los pesos a la caja y los dólares a la cuenta; el trigger exige copiar lo recibido", async () => {
    const s = await seed();
    await fixCurrency(s.orgA, "admin-a@example.com");
    await rate(s.adminA, "1565");
    await open(s.adminA, [{ currency: "ARS", amount: "0" }]);
    const sale = await sell(s.adminA, s.dollars, 1, s.clientA);
    const paid = await createSaleReceipt(s.adminA, {
      saleId: sale.id,
      paymentMethodId: s.methods.cash,
      amount: "156500",
      tenderedCurrency: "ARS",
    });
    if (!paid.ok) throw new Error("cobro rechazado");

    // Una anulación que no copia lo recibido no entra.
    expect(
      await rejection(
        getDb().execute(
          sql`insert into receipt_voids (organization_id, number, receipt_id, currency, amount,
              reason, session_id, created_by)
            select organization_id, 900, id, currency, amount, 'other', session_id, created_by
            from receipts where id = ${paid.receipt.id}`,
        ),
      ),
    ).toMatch(/no copia lo recibido/);

    const voided = await voidReceipt(s.adminA, {
      receiptId: paid.receipt.id,
      reason: "wrong_amount",
    });
    expect(voided.ok).toBe(true);
    expect(await expected(s.adminA, "ARS")).toBe("0.00");
    expect((await owed(s.adminA, s.clientA)).currencies).toMatchObject([
      { currency: "USD", owed: "100.00" },
    ]);
    const copy = await getDb().execute<{
      tendered_currency: string;
      tendered_amount: string;
    }>(
      sql`select tendered_currency, tendered_amount from receipt_voids
          where receipt_id = ${paid.receipt.id}`,
    );
    expect(copy.rows[0]).toEqual({
      tendered_currency: "ARS",
      tendered_amount: "156500.00",
    });
  });

  it("la anulación no deja lo esperado de los pesos por debajo de cero", async () => {
    const s = await seed();
    await fixCurrency(s.orgA, "admin-a@example.com");
    await rate(s.adminA, "1565");
    const session = await open(s.adminA, [{ currency: "ARS", amount: "0" }]);
    const sale = await sell(s.adminA, s.dollars, 1, s.clientA);
    const paid = await createSaleReceipt(s.adminA, {
      saleId: sale.id,
      paymentMethodId: s.methods.cash,
      amount: "156500",
      tenderedCurrency: "ARS",
    });
    if (!paid.ok) throw new Error("cobro rechazado");
    // Un retiro de pesos deja menos de lo que el cobro había hecho entrar.
    const withdrawn = await recordCashMovement(s.adminA, {
      sessionId: session.id,
      kind: "withdrawal",
      reason: "bank_deposit",
      currency: "ARS",
      amount: "100000",
    });
    expect(withdrawn.ok).toBe(true);
    expect(
      await voidReceipt(s.adminA, {
        receiptId: paid.receipt.id,
        reason: "wrong_amount",
      }),
    ).toMatchObject({
      ok: false,
      rule: "insufficient_cash",
      currency: "ARS",
      expected: "56500.00",
    });
  });

  it("los totales de referencia de la caja, la cuenta y los deudores", async () => {
    const s = await seed();
    await fixCurrency(s.orgA, "admin-a@example.com");
    await rate(s.adminA, "1000");
    await open(s.adminA, [
      { currency: "ARS", amount: "50000" },
      { currency: "USD", amount: "10" },
    ]);
    await sell(s.adminA, s.dollars, 1, s.clientA);

    const state = await getCashState(s.viewerA);
    if (!state.ok || !state.open) throw new Error("caja cerrada");
    expect(state.open.reference).toMatchObject({
      currency: "USD",
      quoteCurrency: "ARS",
      total: "60.00",
      rate: "1000.000000",
      unconverted: [],
    });
    const account = await owed(s.viewerA, s.clientA);
    // Todo en la principal: no hay nada que convertir.
    expect(account.references.owed).toBeNull();
    const debtors = await listDebtors(s.viewerA, { currency: null, page: 1 });
    expect(debtors).toMatchObject({ ok: true, debtors: { reference: null } });
  });
});

describe("sin moneda principal nada cambia (invariante 1)", () => {
  it("el cobro de siempre, sin otra moneda, sin referencia y sin oferta", async () => {
    const s = await seed();
    await open(s.adminB, [{ currency: "ARS", amount: "0" }]);
    const sale = await sell(s.adminB, s.pesosB, 1, s.clientB);
    const form = await getSaleReceiptForm(s.adminB, sale.id);
    if (!form.ok) throw new Error("formulario rechazado");
    expect(form.exchange).toBeNull();
    expect(
      await createSaleReceipt(s.adminB, {
        saleId: sale.id,
        paymentMethodId: s.methodsB.cash,
        amount: "1",
        tenderedCurrency: "USD",
      }),
    ).toMatchObject({
      ok: false,
      code: "VALIDATION_ERROR",
      fields: ["tenderedCurrency"],
    });
    const paid = await createSaleReceipt(s.adminB, {
      saleId: sale.id,
      paymentMethodId: s.methodsB.cash,
      amount: "1000",
    });
    if (!paid.ok) throw new Error("cobro rechazado");
    expect(await receiptRow(paid.receipt.id)).toEqual({
      currency: "ARS",
      amount: "1000.00",
      tendered_currency: null,
      tendered_amount: null,
      exchange_rate: null,
      exchange_rate_id: null,
    });
    const state = await getCashState(s.adminB);
    expect(state).toMatchObject({ ok: true, open: { reference: null } });
    // Un cobro a cuenta en cualquier moneda aceptada, como siempre.
    const accountForm = await getAccountReceiptForm(s.adminB, s.clientB);
    expect(accountForm).toMatchObject({ ok: true, exchange: null });
    const anyCurrency = await createAccountReceipt(s.adminB, {
      clientId: s.clientB,
      currency: "EUR",
      paymentMethodId: s.methodsB.transfer,
      amount: "5",
    });
    expect(anyCurrency.ok).toBe(true);
  });

  it("la apertura propone la moneda principal solo si la hay (D-9)", async () => {
    const s = await seed();
    expect(await getOpeningProposal(s.adminA)).toEqual({
      ok: true,
      open: null,
      proposal: [],
    });
    await fixCurrency(s.orgA, "admin-a@example.com");
    expect(await getOpeningProposal(s.adminA)).toEqual({
      ok: true,
      open: null,
      proposal: [{ currency: "USD", amount: "" }],
    });
  });
});

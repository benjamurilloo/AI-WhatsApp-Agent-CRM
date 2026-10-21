import { sql, type SQL } from "drizzle-orm";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from "vitest";
import { hashPassword, login } from "@/modules/auth";
import {
  closeCashSession,
  createAccountReceipt,
  createInitialPaymentMethods,
  createOrderReceipt,
  createRefund,
  createSaleReceipt,
  createSupplierPayment,
  createTradeInPayment,
  deactivatePaymentMethod,
  ensureTradeInPaymentMethod,
  getCashSession,
  getSaleReceiptForm,
  getSaleReceipts,
  getTradeInMoney,
  getTradeInPayment,
  getTradeInPaymentForm,
  listPaymentMethods,
  listTradeInsToPay,
  openCashSession,
  renamePaymentMethod,
  voidReceipt,
  voidTradeIn,
  voidTradeInPayment,
} from "@/modules/cash";
import {
  createModel,
  createProduct,
  createServiceProduct,
  type ProductInput,
} from "@/modules/catalog";
import { createExchangeSettings, recordExchangeRate } from "@/modules/fx";
import {
  applyGradeTemplate,
  changeProductTracking,
  listUnitGrades,
  registerUnit,
} from "@/modules/inventory";
import {
  activateCapability,
  getAuthContext,
  getProfile,
  setMainCurrency,
  type AuthContext,
} from "@/modules/organizations";
import { createSupplier } from "@/modules/purchasing";
import { createOrder } from "@/modules/orders";
import { issueSale, voidSale } from "@/modules/sales";
import { applyRepairTypeTemplate } from "@/modules/service";
import {
  applyChecklistTemplate,
  createTradeIn,
  type TradeInInput,
} from "@/modules/tradeins";
import { getDb } from "@/shared/db";
import { exportClientData } from "../../scripts/client-data-export";
import { resetDatabase } from "./reset-database";
import { expectStockInvariant } from "./stock-invariant";

// La permuta y la compra de usados contra PostgreSQL real (brief-29.7.2, D-9): el medio de sistema
// «Permuta» y sus rechazos en los demás caminos; el cobro de una venta con «Permuta», con lo disponible
// y cada rechazo por su nombre; el pago de un usado comprado, en su moneda y en la otra, con la caja; su
// anulación; la anulación del usado contra cobros y pagos vigentes; las carreras contra la anulación del
// usado, con una tercera conexión que retiene el bloqueo de cobros; la venta anulada (U-3); los
// triggers; el viewer y una organización sin trade_ins. El invariante del saldo corre después de cada
// test.

const PASSWORD = "contraseña-correcta-larga";
const TEST_TIMEOUT = 30000;
let storedHash: string;

async function returningId(query: SQL): Promise<string> {
  const result = await getDb().execute<{ id: string }>(query);
  return result.rows[0]!.id;
}

async function count(query: SQL): Promise<number> {
  const result = await getDb().execute<{ count: number }>(query);
  return result.rows[0]!.count;
}

function ok<T extends { ok: boolean }>(result: T): Extract<T, { ok: true }> {
  if (!result.ok) throw new Error(`rechazado: ${JSON.stringify(result)}`);
  return result as Extract<T, { ok: true }>;
}

// drizzle-orm envuelve el error de pg: el mensaje del trigger queda en la causa.
async function rejection(query: Promise<unknown>): Promise<string> {
  try {
    await query;
  } catch (error) {
    const e = error as { message?: string; cause?: { message?: string } };
    return e.cause?.message ?? e.message ?? "sin mensaje";
  }
  throw new Error("La consulta debía ser rechazada y no lo fue.");
}

async function member(
  orgId: string,
  email: string,
  role: "admin" | "viewer",
): Promise<{ context: AuthContext; userId: string }> {
  const userId = await returningId(
    sql`insert into users (email, password_hash, name, must_change_password)
        values (${email}, ${storedHash}, ${email}, false) returning id`,
  );
  await getDb().execute(
    sql`insert into organization_members (organization_id, user_id, role)
        values (${orgId}, ${userId}, ${role})`,
  );
  const logged = await login({ email, password: PASSWORD, ip: null });
  if (!logged.ok) throw new Error("login rechazado");
  const auth = await getAuthContext(logged.token);
  if (!auth.ok) throw new Error("contexto rechazado");
  return { context: auth.context, userId };
}

// Lo que hace org:capability --profile iphone, con «Permuta» desde la 29.7.2 (U-4), y la moneda
// principal con su cotización en pesos, como org:currency.
async function activate(organizationId: string, adminEmail: string) {
  const profile = getProfile("iphone")!;
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
    let actorUserId = "";
    for (const capability of profile.capabilities) {
      const activated = await activateCapability(tx, {
        organizationId,
        capability,
        adminEmail,
      });
      if (!activated.ok) throw new Error(activated.code);
      actorUserId = activated.actorUserId;
    }
    await applyGradeTemplate(tx, {
      organizationId,
      actorUserId,
      grades: profile.grades,
    });
    await applyRepairTypeTemplate(tx, {
      organizationId,
      actorUserId,
      repairTypes: profile.repairTypes,
    });
    await createServiceProduct(tx, { organizationId, actorUserId });
    await applyChecklistTemplate(tx, {
      organizationId,
      actorUserId,
      items: profile.tradeInChecklist,
    });
    const method = await ensureTradeInPaymentMethod(
      tx,
      organizationId,
      actorUserId,
    );
    if (!method.ok) throw new Error("«Permuta» rechazada");
  });
}

function productInput(
  sku: string,
  condition: ProductInput["condition"],
): ProductInput {
  return {
    sku,
    name: `iPhone ${sku}`,
    description: null,
    unit: "unidad",
    reorderPoint: "0",
    brand: null,
    category: null,
    condition,
    barcode: null,
    weightKg: null,
    lengthCm: null,
    widthCm: null,
    heightCm: null,
    location: null,
    shelf: null,
  };
}

async function seed() {
  const orgA = await returningId(
    sql`insert into organizations (name) values ('iPhone A') returning id`,
  );
  const orgB = await returningId(
    sql`insert into organizations (name) values ('Sin usados') returning id`,
  );
  const admin = await member(orgA, "admin-a@example.com", "admin");
  const viewer = await member(orgA, "viewer-a@example.com", "viewer");
  const adminB = await member(orgB, "admin-b@example.com", "admin");
  await activate(orgA, "admin-a@example.com");
  ok(await createInitialPaymentMethods(admin.context));
  ok(await createInitialPaymentMethods(adminB.context));
  const methods = ok(await listPaymentMethods(admin.context)).paymentMethods;
  const methodId = (name: string) =>
    methods.find((method) => method.name === name)!.id;
  ok(
    await recordExchangeRate(admin.context, {
      rate: "1570",
      confirmLargeChange: true,
    }),
  );

  const model = ok(
    await createModel(admin.context, { name: "iPhone 13", brand: "Apple" }),
  );
  // El producto usado al que entran los usados, y uno nuevo por unidad para vender.
  const used = ok(
    await createProduct(admin.context, productInput("13U", "used")),
  );
  ok(await changeProductTracking(admin.context, used.productId, "unit"));
  const fresh = ok(
    await createProduct(admin.context, productInput("15N", "new")),
  );
  ok(await changeProductTracking(admin.context, fresh.productId, "unit"));
  for (const productId of [used.productId, fresh.productId]) {
    await getDb().execute(
      sql`update products set model_id = ${model.modelId} where id = ${productId}`,
    );
  }
  const freshPriceId = await returningId(
    sql`insert into product_prices (organization_id, product_id, amount, currency, created_by)
        values (${orgA}, ${fresh.productId}, '1000.00', 'USD', ${admin.userId}) returning id`,
  );
  const gradeA = ok(await listUnitGrades(admin.context)).grades.find(
    (grade) => grade.name === "A",
  )!.id;

  const clientId = await returningId(
    sql`insert into clients (organization_id, display_name, phone_e164)
        values (${orgA}, 'Ana Cliente', '+5491155551234') returning id`,
  );
  const otherClientId = await returningId(
    sql`insert into clients (organization_id, display_name, phone_e164)
        values (${orgA}, 'Beto Otro', '+5491155554321') returning id`,
  );

  return {
    orgA,
    orgB,
    admin: admin.context,
    adminId: admin.userId,
    viewer: viewer.context,
    adminB: adminB.context,
    usedProductId: used.productId,
    freshProductId: fresh.productId,
    freshPriceId,
    gradeA,
    clientId,
    otherClientId,
    permuta: methods.find((method) => method.systemRole === "trade_in")!.id,
    cash: methodId("Efectivo"),
    transfer: methodId("Transferencia"),
  };
}

type Seed = Awaited<ReturnType<typeof seed>>;

let serialCounter = 0;

async function receive(s: Seed, overrides: Partial<TradeInInput> = {}) {
  serialCounter += 1;
  const items = await getDb().execute<{ id: string }>(
    sql`select id from trade_in_checklist_items where organization_id = ${s.orgA}`,
  );
  return ok(
    await createTradeIn(s.admin, {
      clientId: s.clientId,
      productId: s.usedProductId,
      serial: `IMEI-USADO-${serialCounter}`,
      batteryHealth: "88",
      gradeId: s.gradeA,
      value: "300",
      currency: "USD",
      destination: "sale_credit",
      passed: items.rows.map((row) => row.id),
      ...overrides,
    }),
  ).tradeIn;
}

// Una venta de una unidad nueva de USD 1000, del cliente que se pida o sin cliente.
async function sell(s: Seed, clientId: string | null = s.clientId) {
  serialCounter += 1;
  const serial = `IMEI-NUEVO-${serialCounter}`;
  ok(
    await registerUnit(s.admin, s.freshProductId, {
      serial,
      cost: "700",
      currency: "USD",
      gradeId: "",
      batteryHealth: "",
    }),
  );
  return ok(
    await issueSale(s.admin, {
      clientId: clientId ?? "",
      lines: [
        {
          productId: s.freshProductId,
          quantity: "",
          expectedPriceId: s.freshPriceId,
          serials: serial,
        },
      ],
    }),
  ).sale;
}

// Un pedido abierto del cliente, con una unidad nueva (brief-29.7.2, D-9: la seña rechaza «Permuta»).
async function order(s: Seed) {
  serialCounter += 1;
  const serial = `IMEI-PEDIDO-${serialCounter}`;
  ok(
    await registerUnit(s.admin, s.freshProductId, {
      serial,
      cost: "700",
      currency: "USD",
      gradeId: "",
      batteryHealth: "",
    }),
  );
  return ok(
    await createOrder(s.admin, {
      clientId: s.clientId,
      lines: [
        {
          productId: s.freshProductId,
          quantity: "",
          expectedPriceId: s.freshPriceId,
          serials: serial,
        },
      ],
    }),
  ).order;
}

function permuta(
  s: Seed,
  saleId: string,
  tradeInId: string,
  amount: string,
  extra: Record<string, string> = {},
) {
  return createSaleReceipt(s.admin, {
    saleId,
    paymentMethodId: s.permuta,
    amount,
    tradeInId,
    ...extra,
  });
}

async function open(s: Seed, amount: string, currency = "USD") {
  return ok(await openCashSession(s.admin, { rows: [{ currency, amount }] }))
    .session;
}

async function expected(s: Seed, sessionId: string, currency = "USD") {
  const detail = ok(await getCashSession(s.admin, sessionId)).session;
  return detail.currencies.find((row) => row.currency === currency) ?? null;
}

// Bloqueos retenidos del test en curso: se sueltan al terminar aunque el test falle.
const heldLocks: (() => Promise<void>)[] = [];

async function holdCash(organizationId: string): Promise<() => Promise<void>> {
  let taken!: () => void;
  let release!: () => void;
  const lockTaken = new Promise<void>((resolve) => (taken = resolve));
  const released = new Promise<void>((resolve) => (release = resolve));
  const holder = getDb().transaction(async (tx) => {
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtextextended(${`cash:${organizationId}`}, 0))`,
    );
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
    waiting = await count(
      sql`select count(*)::int as count from pg_stat_activity
          where datname = current_database() and wait_event_type = 'Lock'`,
    );
    if (waiting === expected) return;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error(
    `se esperaban ${expected} conexiones en un bloqueo y hay ${waiting}`,
  );
}

beforeAll(async () => {
  storedHash = await hashPassword(PASSWORD);
});

beforeEach(async () => {
  await resetDatabase(getDb());
});

afterEach(async () => {
  await Promise.all(heldLocks.splice(0).map((releaseLock) => releaseLock()));
  await expectStockInvariant({ movements: true });
});

afterAll(async () => {
  await getDb().$client.end();
});

describe("el medio de sistema «Permuta» (AC-3 y AC-10)", () => {
  it(
    "se crea una sola vez con su auditoría, no se renombra ni se desactiva, y no aparece en los formularios",
    async () => {
      const s = await seed();
      expect(
        await count(
          sql`select count(*)::int as count from payment_methods
              where organization_id = ${s.orgA} and system_role = 'trade_in'
                and name = 'Permuta' and not is_cash and is_active`,
        ),
      ).toBe(1);
      expect(
        await count(
          sql`select count(*)::int as count from audit_logs
              where organization_id = ${s.orgA} and entity_type = 'payment_method'
                and entity_id = ${s.permuta} and action = 'create'`,
        ),
      ).toBe(1);
      // Volver a correr org:capability no crea otro.
      const again = await getDb().transaction((tx) =>
        ensureTradeInPaymentMethod(tx, s.orgA, s.adminId),
      );
      expect(again).toEqual({
        ok: true,
        created: false,
        paymentMethodId: s.permuta,
      });

      expect(
        await renamePaymentMethod(s.admin, s.permuta, { name: "Canje" }),
      ).toEqual({
        ok: false,
        code: "BUSINESS_RULE_VIOLATION",
        rule: "system_payment_method",
      });
      expect(await deactivatePaymentMethod(s.admin, s.permuta)).toEqual({
        ok: false,
        code: "BUSINESS_RULE_VIOLATION",
        rule: "system_payment_method",
      });

      // El formulario del cobro, sin usados del cliente, no ofrece «Permuta» ni como medio común.
      const sale = await sell(s);
      const form = await getSaleReceiptForm(s.admin, sale.id);
      if (!form.ok) throw new Error("formulario rechazado");
      expect(form.paymentMethods.map((method) => method.name)).not.toContain(
        "Permuta",
      );
      expect(form.permuta).toBeNull();
    },
    TEST_TIMEOUT,
  );

  it(
    "con un medio de la organización llamado «Permuta», no lo crea y lo dice",
    async () => {
      const s = await seed();
      const result = await getDb().transaction((tx) =>
        ensureTradeInPaymentMethod(tx, s.orgB, s.adminId),
      );
      expect(result).toMatchObject({ ok: true, created: true });
      const orgC = await returningId(
        sql`insert into organizations (name) values ('Con Permuta') returning id`,
      );
      await getDb().execute(
        sql`insert into payment_methods (organization_id, name, is_cash)
            values (${orgC}, 'permuta', false)`,
      );
      expect(
        await getDb().transaction((tx) =>
          ensureTradeInPaymentMethod(tx, orgC, s.adminId),
        ),
      ).toEqual({ ok: false, reason: "name_taken" });
    },
    TEST_TIMEOUT,
  );

  it(
    "la seña, el cobro a cuenta, la devolución, el pago a un proveedor y el pago de un usado lo rechazan",
    async () => {
      const s = await seed();
      const expectedRule = {
        ok: false,
        code: "BUSINESS_RULE_VIOLATION",
        rule: "trade_in_method_requires_trade_in",
      };
      // La seña de un pedido abierto del cliente (revisión independiente de la 29.7.2, NB-2).
      const pending = await order(s);
      expect(
        await createOrderReceipt(s.admin, {
          orderId: pending.id,
          paymentMethodId: s.permuta,
          amount: "10",
        }),
      ).toEqual(expectedRule);
      // La devolución a cuenta del cliente, con un cobro a cuenta que deja algo para devolver.
      ok(
        await createAccountReceipt(s.admin, {
          clientId: s.clientId,
          currency: "USD",
          paymentMethodId: s.transfer,
          amount: "50",
        }),
      );
      expect(
        await createRefund(s.admin, {
          target: "account",
          clientId: s.clientId,
          currency: "USD",
          paymentMethodId: s.permuta,
          amount: "10",
        }),
      ).toEqual(expectedRule);
      expect(
        await createAccountReceipt(s.admin, {
          clientId: s.clientId,
          currency: "USD",
          paymentMethodId: s.permuta,
          amount: "10",
        }),
      ).toEqual(expectedRule);
      const supplier = ok(
        await createSupplier(s.admin, { name: "Proveedor Uno" }),
      );
      expect(
        await createSupplierPayment(s.admin, {
          target: "account",
          supplierId: supplier.supplierId,
          currency: "USD",
          paymentMethodId: s.permuta,
          amount: "10",
        }),
      ).toEqual(expectedRule);
      const bought = await receive(s, { destination: "purchase" });
      expect(
        await createTradeInPayment(s.admin, {
          tradeInId: bought.id,
          paymentMethodId: s.permuta,
          amount: "10",
        }),
      ).toEqual(expectedRule);
      // Un cobro de venta con «Permuta» y sin usado, también.
      const sale = await sell(s);
      expect(
        await createSaleReceipt(s.admin, {
          saleId: sale.id,
          paymentMethodId: s.permuta,
          amount: "10",
        }),
      ).toEqual(expectedRule);
    },
    TEST_TIMEOUT,
  );
});

describe("el cobro con «Permuta» (AC-1 y AC-2)", () => {
  it(
    "descuenta el usado de la venta hasta lo disponible, y anular el cobro lo libera",
    async () => {
      const s = await seed();
      const tradeIn = await receive(s);
      const sale = await sell(s);

      const offer = await getSaleReceiptForm(s.admin, sale.id);
      if (!offer.ok) throw new Error("formulario rechazado");
      expect(offer.permuta).toMatchObject({
        paymentMethodId: s.permuta,
        tradeIns: [{ id: tradeIn.id, available: "300.00" }],
      });

      const first = ok(await permuta(s, sale.id, tradeIn.id, "200"));
      const row = await getDb().execute<{
        trade_in_id: string;
        session_id: string | null;
        amount: string;
      }>(
        sql`select trade_in_id, session_id, amount from receipts where id = ${first.receipt.id}`,
      );
      expect(row.rows[0]).toEqual({
        trade_in_id: tradeIn.id,
        session_id: null,
        amount: "200.00",
      });
      expect(await permuta(s, sale.id, tradeIn.id, "150")).toEqual({
        ok: false,
        code: "BUSINESS_RULE_VIOLATION",
        rule: "exceeds_trade_in_available",
        currency: "USD",
        available: "100.00",
      });
      ok(await permuta(s, sale.id, tradeIn.id, "100"));
      expect(
        ok(await getTradeInMoney(s.admin, tradeIn.id)).money,
      ).toMatchObject({
        destination: "sale_credit",
        used: "300.00",
        available: "0.00",
      });
      // La venta lo muestra con su usado, también a un viewer.
      const receipts = ok(await getSaleReceipts(s.viewer, sale.id)).sale;
      expect(receipts.outstanding).toBe("700.00");
      expect(receipts.receipts.map((r) => r.tradeIn?.displayNumber)).toEqual([
        tradeIn.displayNumber,
        tradeIn.displayNumber,
      ]);
      // Sin disponible, el formulario ya no lo ofrece.
      const empty = await getSaleReceiptForm(s.admin, sale.id);
      if (!empty.ok) throw new Error("formulario rechazado");
      expect(empty.permuta).toBeNull();

      // Anular un cobro libera lo que usaba, sin tocar la caja.
      ok(
        await voidReceipt(s.admin, {
          receiptId: first.receipt.id,
          reason: "wrong_amount",
        }),
      );
      expect(
        ok(await getTradeInMoney(s.admin, tradeIn.id)).money,
      ).toMatchObject({
        used: "100.00",
        available: "200.00",
      });
      // La auditoría del cobro nombra el usado.
      const audit = await getDb().execute<{ after: Record<string, unknown> }>(
        sql`select diff->'after' as after from audit_logs
            where entity_type = 'receipt' and entity_id = ${first.receipt.id} and action = 'create'`,
      );
      expect(audit.rows[0]!.after).toMatchObject({
        payment_method: "Permuta",
        trade_in_number: tradeIn.number,
      });
    },
    TEST_TIMEOUT,
  );

  it(
    "cada rechazo tiene su nombre y no escribe nada",
    async () => {
      const s = await seed();
      const sale = await sell(s);
      const before = await count(
        sql`select count(*)::int as count from receipts`,
      );
      const rule = (name: string) => ({
        ok: false,
        code: "BUSINESS_RULE_VIOLATION",
        rule: name,
      });

      // De otro cliente, y contra una venta sin cliente (U-2).
      const others = await receive(s, { clientId: s.otherClientId });
      expect(await permuta(s, sale.id, others.id, "10")).toEqual(
        rule("trade_in_other_client"),
      );
      const anonymous = await sell(s, null);
      const mine = await receive(s);
      expect(await permuta(s, anonymous.id, mine.id, "10")).toEqual(
        rule("trade_in_other_client"),
      );
      // Comprado, no permuta.
      const bought = await receive(s, { destination: "purchase" });
      expect(await permuta(s, sale.id, bought.id, "10")).toEqual(
        rule("trade_in_not_sale_credit"),
      );
      // En otra moneda, o con lo recibido en otra moneda (R-B5).
      const pesos = await receive(s, { value: "300000", currency: "ARS" });
      expect(await permuta(s, sale.id, pesos.id, "10")).toEqual(
        rule("trade_in_currency_mismatch"),
      );
      expect(
        await permuta(s, sale.id, mine.id, "15700", {
          tenderedCurrency: "ARS",
        }),
      ).toEqual(rule("trade_in_currency_mismatch"));
      // Un usado con un medio que no es «Permuta».
      expect(
        await createSaleReceipt(s.admin, {
          saleId: sale.id,
          paymentMethodId: s.transfer,
          amount: "10",
          tradeInId: mine.id,
        }),
      ).toEqual(rule("trade_in_requires_trade_in_method"));
      // Más que lo que falta de la venta, aunque el usado alcance.
      const big = await receive(s, { value: "5000" });
      expect(await permuta(s, sale.id, big.id, "1500")).toEqual({
        ok: false,
        code: "BUSINESS_RULE_VIOLATION",
        rule: "exceeds_outstanding",
        currency: "USD",
        outstanding: "1000.00",
      });
      // Anulado.
      ok(
        await voidTradeIn(s.admin, {
          tradeInId: mine.id,
          reason: "customer_withdrew",
        }),
      );
      expect(await permuta(s, sale.id, mine.id, "10")).toEqual(
        rule("trade_in_voided"),
      );
      // Inexistente.
      expect(
        await permuta(s, sale.id, "00000000-0000-4000-8000-000000000000", "10"),
      ).toEqual({ ok: false, code: "NOT_FOUND", entity: "trade_in" });

      expect(
        await count(sql`select count(*)::int as count from receipts`),
      ).toBe(before);
    },
    TEST_TIMEOUT,
  );

  it(
    "una venta anulada deja su permuta vigente y a favor del cliente, y el usado no se anula (U-3)",
    async () => {
      const s = await seed();
      const tradeIn = await receive(s);
      const sale = await sell(s);
      const receipt = ok(await permuta(s, sale.id, tradeIn.id, "300"));
      ok(await voidSale(s.admin, sale.id, "data_entry_error"));
      const standing = ok(await getSaleReceipts(s.admin, sale.id)).sale;
      expect(standing).toMatchObject({
        status: "voided",
        toAccount: "300.00",
        clientInFavor: "300.00",
      });
      expect(
        await voidTradeIn(s.admin, {
          tradeInId: tradeIn.id,
          reason: "customer_withdrew",
        }),
      ).toEqual({
        ok: false,
        code: "BUSINESS_RULE_VIOLATION",
        rule: "trade_in_used_in_receipt",
        displayNumber: receipt.receipt.displayNumber,
      });
    },
    TEST_TIMEOUT,
  );
});

describe("el pago de un usado (AC-4, AC-5 y AC-11)", () => {
  it(
    "en efectivo sale de la caja hasta lo que falta, y su anulación vuelve a la caja abierta",
    async () => {
      const s = await seed();
      const tradeIn = await receive(s, { destination: "purchase" });
      const session = await open(s, "1000");

      const paid = ok(
        await createTradeInPayment(s.admin, {
          tradeInId: tradeIn.id,
          paymentMethodId: s.cash,
          amount: "120",
        }),
      );
      expect(paid.payment.displayNumber).toMatch(/^PPU-0+1$/);
      expect(await expected(s, session.id)).toMatchObject({
        tradeInPayments: "120.00",
        expected: "880.00",
      });
      expect(
        await createTradeInPayment(s.admin, {
          tradeInId: tradeIn.id,
          paymentMethodId: s.transfer,
          amount: "200",
        }),
      ).toEqual({
        ok: false,
        code: "BUSINESS_RULE_VIOLATION",
        rule: "exceeds_outstanding",
        currency: "USD",
        outstanding: "180.00",
      });
      const form = ok(await getTradeInPaymentForm(s.admin, tradeIn.id)).form;
      expect(form).toMatchObject({
        paid: "120.00",
        outstanding: "180.00",
        outstandingInput: "180.00",
      });
      expect(form.paymentMethods.map((method) => method.name)).not.toContain(
        "Permuta",
      );

      // La sesión muestra el pago a un admin, y a un viewer solo el total.
      const adminView = ok(await getCashSession(s.admin, session.id)).session;
      expect(
        adminView.tradeInPayments?.items.map((item) => item.displayNumber),
      ).toEqual([paid.payment.displayNumber]);
      expect(
        ok(await getCashSession(s.viewer, session.id)).session.tradeInPayments,
      ).toBeNull();

      const voided = ok(
        await voidTradeInPayment(s.admin, {
          paymentId: paid.payment.id,
          reason: "wrong_amount",
        }),
      );
      expect(voided.paymentVoid.displayNumber).toMatch(/^APPU-0+1$/);
      expect(await expected(s, session.id)).toMatchObject({
        tradeInPaymentVoids: "120.00",
        expected: "1000.00",
      });
      expect(
        await voidTradeInPayment(s.admin, {
          paymentId: paid.payment.id,
          reason: "other",
        }),
      ).toMatchObject({ ok: false, rule: "already_voided" });
      expect(
        ok(await getTradeInMoney(s.admin, tradeIn.id)).money,
      ).toMatchObject({
        destination: "purchase",
        paid: "0.00",
        outstanding: "300.00",
      });
      const audit = await count(
        sql`select count(*)::int as count from audit_logs
            where entity_type = 'trade_in_payment' and entity_id = ${paid.payment.id}`,
      );
      expect(audit).toBe(2);
    },
    TEST_TIMEOUT,
  );

  it(
    "sin efectivo suficiente, con la caja cerrada o anulado después del cierre",
    async () => {
      const s = await seed();
      const tradeIn = await receive(s, { destination: "purchase" });
      expect(
        await createTradeInPayment(s.admin, {
          tradeInId: tradeIn.id,
          paymentMethodId: s.cash,
          amount: "100",
        }),
      ).toEqual({
        ok: false,
        code: "BUSINESS_RULE_VIOLATION",
        rule: "no_open_session",
      });
      const session = await open(s, "50");
      expect(
        await createTradeInPayment(s.admin, {
          tradeInId: tradeIn.id,
          paymentMethodId: s.cash,
          amount: "100",
        }),
      ).toEqual({
        ok: false,
        code: "BUSINESS_RULE_VIOLATION",
        rule: "insufficient_cash",
        currency: "USD",
        expected: "50.00",
      });
      const paid = ok(
        await createTradeInPayment(s.admin, {
          tradeInId: tradeIn.id,
          paymentMethodId: s.cash,
          amount: "30",
        }),
      );
      ok(
        await closeCashSession(s.admin, {
          sessionId: session.id,
          rows: [{ currency: "USD", amount: "20" }],
        }),
      );
      ok(
        await voidTradeInPayment(s.admin, {
          paymentId: paid.payment.id,
          reason: "not_paid",
        }),
      );
      const voidRow = await getDb().execute<{ session_id: string | null }>(
        sql`select session_id from trade_in_payment_voids where trade_in_payment_id = ${paid.payment.id}`,
      );
      expect(voidRow.rows[0]!.session_id).toBeNull();
      const closed = ok(await getCashSession(s.admin, session.id)).session;
      expect(closed.tradeInPayments?.lateVoids).toHaveLength(1);
    },
    TEST_TIMEOUT,
  );

  it(
    "en pesos contra un usado en dólares, con la cotización vigente, y la anulación copia lo que salió",
    async () => {
      const s = await seed();
      const tradeIn = await receive(s, { destination: "purchase" });
      const session = await open(s, "500000", "ARS");
      const paid = ok(
        await createTradeInPayment(s.admin, {
          tradeInId: tradeIn.id,
          paymentMethodId: s.cash,
          amount: "157000",
          tenderedCurrency: "ARS",
        }),
      );
      const row = await getDb().execute<{
        currency: string;
        amount: string;
        tendered_currency: string;
        tendered_amount: string;
        exchange_rate: string;
      }>(
        sql`select currency, amount, tendered_currency, tendered_amount, exchange_rate
            from trade_in_payments where id = ${paid.payment.id}`,
      );
      expect(row.rows[0]).toEqual({
        currency: "USD",
        amount: "100.00",
        tendered_currency: "ARS",
        tendered_amount: "157000.00",
        exchange_rate: "1570.000000",
      });
      expect(await expected(s, session.id, "ARS")).toMatchObject({
        tradeInPayments: "157000.00",
        expected: "343000.00",
      });
      ok(
        await voidTradeInPayment(s.admin, {
          paymentId: paid.payment.id,
          reason: "wrong_method",
        }),
      );
      expect(await expected(s, session.id, "ARS")).toMatchObject({
        expected: "500000.00",
      });
    },
    TEST_TIMEOUT,
  );

  it(
    "un usado de permuta, anulado o inexistente no se paga",
    async () => {
      const s = await seed();
      const credit = await receive(s);
      expect(
        await createTradeInPayment(s.admin, {
          tradeInId: credit.id,
          paymentMethodId: s.transfer,
          amount: "10",
        }),
      ).toEqual({
        ok: false,
        code: "BUSINESS_RULE_VIOLATION",
        rule: "trade_in_not_purchase",
      });
      const bought = await receive(s, { destination: "purchase" });
      ok(
        await voidTradeIn(s.admin, {
          tradeInId: bought.id,
          reason: "entered_by_mistake",
        }),
      );
      expect(
        await createTradeInPayment(s.admin, {
          tradeInId: bought.id,
          paymentMethodId: s.transfer,
          amount: "10",
        }),
      ).toEqual({
        ok: false,
        code: "BUSINESS_RULE_VIOLATION",
        rule: "trade_in_voided",
      });
      expect(
        await createTradeInPayment(s.admin, {
          tradeInId: "00000000-0000-4000-8000-000000000000",
          paymentMethodId: s.transfer,
          amount: "10",
        }),
      ).toEqual({ ok: false, code: "NOT_FOUND", entity: "trade_in" });
    },
    TEST_TIMEOUT,
  );

  it(
    "el filtro «Falta pagar» deja afuera los pagados del todo, los anulados y los de permuta",
    async () => {
      const s = await seed();
      const unpaid = await receive(s, { destination: "purchase" });
      const partial = await receive(s, { destination: "purchase" });
      const full = await receive(s, { destination: "purchase" });
      const voided = await receive(s, { destination: "purchase" });
      await receive(s);
      for (const [tradeIn, amount] of [
        [partial, "100"],
        [full, "300"],
      ] as const) {
        ok(
          await createTradeInPayment(s.admin, {
            tradeInId: tradeIn.id,
            paymentMethodId: s.transfer,
            amount,
          }),
        );
      }
      ok(
        await voidTradeIn(s.admin, {
          tradeInId: voided.id,
          reason: "entered_by_mistake",
        }),
      );
      const page = await listTradeInsToPay(s.admin, { search: "", page: 1 });
      if (!page.ok) throw new Error("lista rechazada");
      expect(page.tradeIns.map((row) => row.id).sort()).toEqual(
        [unpaid.id, partial.id].sort(),
      );
      expect(
        await listTradeInsToPay(s.viewer, { search: "", page: 1 }),
      ).toEqual({ ok: false, code: "FORBIDDEN" });
    },
    TEST_TIMEOUT,
  );
});

describe("la anulación del usado (AC-6)", () => {
  it(
    "se rechaza con un cobro con «Permuta» o un pago vigente, y pasa después de anularlos",
    async () => {
      const s = await seed();
      const credit = await receive(s);
      const sale = await sell(s);
      const receipt = ok(await permuta(s, sale.id, credit.id, "50"));
      expect(
        await voidTradeIn(s.admin, {
          tradeInId: credit.id,
          reason: "customer_withdrew",
        }),
      ).toEqual({
        ok: false,
        code: "BUSINESS_RULE_VIOLATION",
        rule: "trade_in_used_in_receipt",
        displayNumber: receipt.receipt.displayNumber,
      });
      ok(
        await voidReceipt(s.admin, {
          receiptId: receipt.receipt.id,
          reason: "wrong_target",
        }),
      );
      ok(
        await voidTradeIn(s.admin, {
          tradeInId: credit.id,
          reason: "customer_withdrew",
        }),
      );

      const bought = await receive(s, { destination: "purchase" });
      const paid = ok(
        await createTradeInPayment(s.admin, {
          tradeInId: bought.id,
          paymentMethodId: s.transfer,
          amount: "50",
        }),
      );
      expect(
        await voidTradeIn(s.admin, {
          tradeInId: bought.id,
          reason: "customer_withdrew",
        }),
      ).toEqual({
        ok: false,
        code: "BUSINESS_RULE_VIOLATION",
        rule: "trade_in_paid",
        displayNumber: paid.payment.displayNumber,
      });
      ok(
        await voidTradeInPayment(s.admin, {
          paymentId: paid.payment.id,
          reason: "not_paid",
        }),
      );
      ok(
        await voidTradeIn(s.admin, {
          tradeInId: bought.id,
          reason: "customer_withdrew",
        }),
      );
    },
    TEST_TIMEOUT,
  );
});

describe("las carreras contra la anulación del usado (AC-7)", () => {
  it(
    "un cobro con «Permuta» contra la anulación, con el bloqueo de cobros retenido, deja un solo ganador",
    async () => {
      const s = await seed();
      const tradeIn = await receive(s);
      const sale = await sell(s);
      const release = await holdCash(s.orgA);
      const receipt = permuta(s, sale.id, tradeIn.id, "100");
      const voiding = voidTradeIn(s.admin, {
        tradeInId: tradeIn.id,
        reason: "customer_withdrew",
      });
      await waitForLockWaiters(2);
      await release();
      const results = await Promise.all([receipt, voiding]);
      expect(results.filter((result) => result.ok)).toHaveLength(1);
      const [receiptResult, voidResult] = results;
      if (receiptResult.ok) {
        expect(voidResult).toMatchObject({ rule: "trade_in_used_in_receipt" });
      } else {
        expect(receiptResult).toMatchObject({ rule: "trade_in_voided" });
      }
    },
    TEST_TIMEOUT,
  );

  it(
    "un pago contra la anulación, con el bloqueo de cobros retenido, deja un solo ganador",
    async () => {
      const s = await seed();
      const tradeIn = await receive(s, { destination: "purchase" });
      const release = await holdCash(s.orgA);
      const payment = createTradeInPayment(s.admin, {
        tradeInId: tradeIn.id,
        paymentMethodId: s.transfer,
        amount: "100",
      });
      const voiding = voidTradeIn(s.admin, {
        tradeInId: tradeIn.id,
        reason: "customer_withdrew",
      });
      await waitForLockWaiters(2);
      await release();
      const results = await Promise.all([payment, voiding]);
      expect(results.filter((result) => result.ok)).toHaveLength(1);
      const [paymentResult, voidResult] = results;
      if (paymentResult.ok) {
        expect(voidResult).toMatchObject({ rule: "trade_in_paid" });
      } else {
        expect(paymentResult).toMatchObject({ rule: "trade_in_voided" });
      }
    },
    TEST_TIMEOUT,
  );
});

describe("los triggers de la 0061 (AC-3 y AC-9)", () => {
  it(
    "rechazan cada cambio con su mensaje",
    async () => {
      const s = await seed();
      const bought = await receive(s, { destination: "purchase" });
      const paid = ok(
        await createTradeInPayment(s.admin, {
          tradeInId: bought.id,
          paymentMethodId: s.transfer,
          amount: "100",
        }),
      );
      // El medio de sistema, aun como dueño de la tabla.
      expect(
        await rejection(
          getDb().execute(
            sql`update payment_methods set name = 'Canje' where id = ${s.permuta}`,
          ),
        ),
      ).toMatch(/no se renombra ni se desactiva/);
      expect(
        await rejection(
          getDb().execute(
            sql`update payment_methods set is_active = false where id = ${s.permuta}`,
          ),
        ),
      ).toMatch(/no se renombra ni se desactiva/);
      expect(
        await rejection(
          getDb().execute(
            sql`update payment_methods set system_role = 'trade_in' where id = ${s.transfer}`,
          ),
        ),
      ).toMatch(/no cambia su papel de sistema/);

      // El cobro: «Permuta» sin usado y un usado sin «Permuta».
      const sale = await sell(s);
      expect(
        await rejection(
          getDb().execute(
            sql`insert into receipts (organization_id, number, target, sale_id, client_id,
                  payment_method_id, currency, amount, created_by)
                values (${s.orgA}, 9001, 'sale', ${sale.id}, ${s.clientId}, ${s.permuta},
                  'USD', '10.00', ${s.adminId})`,
          ),
        ),
      ).toMatch(/necesita su usado/);
      const credit = await receive(s);
      expect(
        await rejection(
          getDb().execute(
            sql`insert into receipts (organization_id, number, target, sale_id, client_id,
                  payment_method_id, currency, amount, trade_in_id, created_by)
                values (${s.orgA}, 9002, 'sale', ${sale.id}, ${s.clientId}, ${s.transfer},
                  'USD', '10.00', ${credit.id}, ${s.adminId})`,
          ),
        ),
      ).toMatch(/va con «Permuta»/);
      expect(
        await rejection(
          getDb().execute(
            sql`insert into receipts (organization_id, number, target, client_id,
                  payment_method_id, currency, amount, trade_in_id, created_by)
                values (${s.orgA}, 9003, 'account', ${s.clientId}, ${s.permuta},
                  'USD', '10.00', ${credit.id}, ${s.adminId})`,
          ),
        ),
      ).toMatch(/receipts_trade_in_check/);

      // El pago: de solo inserción, sin medio de sistema, y la anulación copia el pago.
      expect(
        await rejection(
          getDb().execute(
            sql`update trade_in_payments set amount = '1.00' where id = ${paid.payment.id}`,
          ),
        ),
      ).toMatch(/solo inserción|no se modifica|no cambia/);
      expect(
        await rejection(
          getDb().execute(
            sql`delete from trade_in_payments where id = ${paid.payment.id}`,
          ),
        ),
      ).toMatch(/solo inserción|no se modifica|no cambia/);
      expect(
        await rejection(
          getDb().execute(
            sql`insert into trade_in_payments (organization_id, number, trade_in_id,
                  payment_method_id, currency, amount, created_by)
                values (${s.orgA}, 9004, ${bought.id}, ${s.permuta}, 'USD', '1.00', ${s.adminId})`,
          ),
        ),
      ).toMatch(/no va con un medio de sistema/);
      // En efectivo, con sesión (revisión independiente de la 29.7.2, O-7).
      expect(
        await rejection(
          getDb().execute(
            sql`insert into trade_in_payments (organization_id, number, trade_in_id,
                  payment_method_id, currency, amount, created_by)
                values (${s.orgA}, 9006, ${bought.id}, ${s.cash}, 'USD', '1.00', ${s.adminId})`,
          ),
        ),
      ).toMatch(/necesita una sesión de caja/);
      expect(
        await rejection(
          getDb().execute(
            sql`insert into trade_in_payment_voids (organization_id, number, trade_in_payment_id,
                  currency, amount, reason, created_by)
                values (${s.orgA}, 9005, ${paid.payment.id}, 'USD', '99.00', 'other', ${s.adminId})`,
          ),
        ),
      ).toMatch(/no copia la moneda y el monto/);
    },
    TEST_TIMEOUT,
  );

  it(
    "crm_app no modifica ni borra los pagos ni sus anulaciones",
    async () => {
      const privileges = await getDb().execute<{
        table_name: string;
        privilege_type: string;
      }>(
        sql`select table_name, privilege_type from information_schema.role_table_grants
            where grantee = 'crm_app'
              and table_name in ('trade_in_payments', 'trade_in_payment_voids')
            order by table_name, privilege_type`,
      );
      expect(privileges.rows).toEqual([
        { table_name: "trade_in_payment_voids", privilege_type: "INSERT" },
        { table_name: "trade_in_payment_voids", privilege_type: "SELECT" },
        { table_name: "trade_in_payments", privilege_type: "INSERT" },
        { table_name: "trade_in_payments", privilege_type: "SELECT" },
      ]);
    },
    TEST_TIMEOUT,
  );
});

describe("el viewer, la capacidad y la exportación (AC-12 y AC-13)", () => {
  it(
    "un viewer no ve pagos, disponible ni lo que falta, y no paga",
    async () => {
      const s = await seed();
      const bought = await receive(s, { destination: "purchase" });
      const paid = ok(
        await createTradeInPayment(s.admin, {
          tradeInId: bought.id,
          paymentMethodId: s.transfer,
          amount: "10",
        }),
      );
      const forbidden = { ok: false, code: "FORBIDDEN" };
      expect(await getTradeInMoney(s.viewer, bought.id)).toEqual(forbidden);
      expect(await getTradeInPaymentForm(s.viewer, bought.id)).toEqual(
        forbidden,
      );
      expect(await getTradeInPayment(s.viewer, paid.payment.id)).toEqual(
        forbidden,
      );
      expect(
        await createTradeInPayment(s.viewer, {
          tradeInId: bought.id,
          paymentMethodId: s.transfer,
          amount: "10",
        }),
      ).toEqual(forbidden);
      expect(
        await voidTradeInPayment(s.viewer, {
          paymentId: paid.payment.id,
          reason: "other",
        }),
      ).toEqual(forbidden);
    },
    TEST_TIMEOUT,
  );

  it(
    "sin trade_ins no hay «Permuta» ni pagos, y la lista inicial y el límite no cuentan el medio de sistema",
    async () => {
      const s = await seed();
      const methodsB = ok(await listPaymentMethods(s.adminB)).paymentMethods;
      expect(methodsB.some((method) => method.systemRole !== null)).toBe(false);
      expect(
        await createTradeInPayment(s.adminB, {
          tradeInId: "00000000-0000-4000-8000-000000000000",
          paymentMethodId: methodsB[0]!.id,
          amount: "10",
        }),
      ).toEqual({ ok: false, code: "NOT_FOUND" });
      // Una organización con «Permuta» y sin otros medios todavía crea la lista inicial.
      const orgC = await returningId(
        sql`insert into organizations (name) values ('Solo Permuta') returning id`,
      );
      const adminC = await member(orgC, "admin-c@example.com", "admin");
      await getDb().transaction((tx) =>
        ensureTradeInPaymentMethod(tx, orgC, adminC.userId),
      );
      expect(await createInitialPaymentMethods(adminC.context)).toEqual({
        ok: true,
        created: 4,
      });
    },
    TEST_TIMEOUT,
  );

  it(
    "la exportación de un cliente suma los pagos de sus usados y el usado de cada cobro con «Permuta»",
    async () => {
      const s = await seed();
      const bought = await receive(s, { destination: "purchase" });
      const paid = ok(
        await createTradeInPayment(s.admin, {
          tradeInId: bought.id,
          paymentMethodId: s.transfer,
          amount: "10",
        }),
      );
      ok(
        await voidTradeInPayment(s.admin, {
          paymentId: paid.payment.id,
          reason: "other",
        }),
      );
      const credit = await receive(s);
      const sale = await sell(s);
      ok(await permuta(s, sale.id, credit.id, "20"));
      const exported = await exportClientData(getDb(), s.orgA, s.clientId);
      expect(exported.trade_in_payments).toMatchObject([
        {
          trade_in_number: String(bought.number),
          payment_method: "Transferencia",
          amount: "10.00",
        },
      ]);
      expect(exported.trade_in_payment_voids).toMatchObject([
        { reason: "other" },
      ]);
      expect(
        exported.receipts.find((row) => row.trade_in_id === credit.id),
      ).toMatchObject({
        payment_method: "Permuta",
        trade_in_number: String(credit.number),
      });
    },
    TEST_TIMEOUT,
  );
});

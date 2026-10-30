import { sql, type SQL } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { hashPassword, login } from "@/modules/auth";
import {
  createAccountReceipt,
  createInitialPaymentMethods,
  createOrderReceipt,
  createRefund,
  createSaleReceipt,
  getAccountReceiptForm,
  getClientAccountSummary,
  getClientBalances,
  getClientStatement,
  getSaleReceipts,
  listDebtors,
  listPaymentMethods,
  previewAccountReceipt,
  voidReceipt,
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

// Las lecturas de la cuenta corriente contra PostgreSQL real (brief-21.6, AC-6): el estado de cuenta,
// el resumen, el saldo en la venta, la vista previa del cobro a cuenta, su formulario y la lista de
// deudores, todos contra la misma regla. Los helpers son los de refunds.test.ts. Un producto de
// precio 1000 por unidad: una venta o un pedido de n unidades suma n × 1000.

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

async function saleStanding(context: AuthContext, saleId: string) {
  const result = await getSaleReceipts(context, saleId);
  if (!result.ok) throw new Error(`lectura rechazada: ${result.code}`);
  return result.sale;
}

beforeEach(async () => {
  await resetDatabase(getDb());
  storedHash ??= await hashPassword(PASSWORD);
});

afterAll(async () => {
  await getDb().$client.end();
});

async function receivedAccount(
  s: Seed,
  amount: string,
  currency = "ARS",
  clientId = s.clientA,
) {
  const result = await createAccountReceipt(s.adminA, {
    clientId,
    currency,
    paymentMethodId: s.methods.transfer,
    amount,
  });
  if (!result.ok)
    throw new Error(`cobro a cuenta rechazado: ${JSON.stringify(result)}`);
  return result.receipt;
}

async function addClient(organizationId: string, name: string) {
  return returningId(
    sql`insert into clients (organization_id, display_name)
        values (${organizationId}, ${name}) returning id`,
  );
}

// Una cuenta con todo lo que la regla mira (AC-6), en pesos:
// - A, la venta más vieja, de 3000, con un cobro directo de 1000;
// - B, de 2000, sin cobros;
// - C, de 1000, cobrada entera y anulada: lo cobrado pasa al remanente;
// - P1, pendiente con una seña de 500, retenida;
// - P2, cancelado con una seña de 300, que pasa al remanente;
// - un cobro a cuenta de 700, y otro de 50, anulado.
// El remanente, 1000 + 300 + 700 = 2000, cubre lo que le falta a A; a B le faltan 2000.
// Y en dólares, un cobro a cuenta de 150 sin ventas y una devolución de 20: 130 a favor.
async function fullAccount(s: Seed) {
  const a = await sell(s, 3, s.clientA);
  const b = await sell(s, 2, s.clientA);
  const c = await sell(s, 1, s.clientA);
  await received(s.adminA, a.id, s.methods.transfer, "1000");
  await received(s.adminA, c.id, s.methods.transfer, "1000");
  await voided(s.adminA, c.id);
  const p1 = await order(s, 1);
  await deposited(s.adminA, p1.id, s.methods.transfer, "500");
  const p2 = await order(s, 1);
  await deposited(s.adminA, p2.id, s.methods.transfer, "300");
  await step(cancelOrder, s.adminA, p2.id);
  await receivedAccount(s, "700");
  const gone = await receivedAccount(s, "50");
  const undone = await voidReceipt(s.adminA, {
    receiptId: gone.id,
    reason: "wrong_amount",
  });
  if (!undone.ok) throw new Error("anulación rechazada");
  await receivedAccount(s, "150", "USD");
  const refund = await createRefund(s.adminA, {
    target: "account",
    clientId: s.clientA,
    currency: "USD",
    paymentMethodId: s.methods.transfer,
    amount: "20",
  });
  if (!refund.ok) throw new Error("devolución rechazada");
  return { a, b, c };
}

describe("las lecturas de la cuenta (AC-6)", () => {
  it(
    "el estado de cuenta, el resumen y el detalle de la venta salen de la misma regla",
    async () => {
      const s = await seed();
      const { a, b, c } = await fullAccount(s);

      const result = await getClientStatement(s.adminA, s.clientA);
      if (!result.ok) throw new Error(`estado rechazado: ${result.code}`);
      const { statement } = result;
      expect(statement.client).toEqual({
        id: s.clientA,
        displayName: "Lucía Gómez",
      });
      expect(statement.currencies).toMatchObject([
        {
          currency: "ARS",
          // Al debe, A y B; al haber, 1000 de A, 1000 de C, 300 de P2 y 700 a cuenta.
          debit: "5000.00",
          credit: "3000.00",
          balance: { side: "debt", amount: "2000.00" },
          owed: "2000.00",
          inFavor: "0.00",
          retained: "500.00",
          salesWithBalance: 1,
          sales: [
            {
              id: a.id,
              total: "3000.00",
              direct: "1000.00",
              imputed: "2000.00",
              outstanding: "0.00",
            },
            {
              id: b.id,
              total: "2000.00",
              direct: "0.00",
              imputed: "0.00",
              outstanding: "2000.00",
            },
          ],
        },
        {
          currency: "USD",
          debit: "0.00",
          credit: "130.00",
          balance: { side: "favor", amount: "130.00" },
          owed: "0.00",
          inFavor: "130.00",
          sales: [],
        },
      ]);
      const kinds = statement.documents.map((row) => row.kind).sort();
      expect(kinds).toEqual(
        [
          ...Array(3).fill("sale"),
          "sale_void",
          // Dos de ventas, dos señas y tres a cuenta: dos en pesos (uno anulado) y uno en dólares.
          ...Array(7).fill("receipt"),
          "receipt_void",
          "refund",
        ].sort(),
      );
      const saleVoid = statement.documents.find(
        (row) => row.kind === "sale_void",
      )!;
      expect(saleVoid).toMatchObject({ id: c.id, displayNumber: "A-000001" });
      expect(
        statement.documents.filter(
          (row) =>
            row.kind === "receipt" && row.destination?.target === "account",
        ),
      ).toHaveLength(3);
      // De la más nueva a la más vieja.
      const times = statement.documents.map((row) => row.createdAt.getTime());
      expect(times).toEqual([...times].sort((x, y) => y - x));
      expect(statement.truncated).toBe(false);

      const summary = await getClientAccountSummary(s.adminA, s.clientA);
      expect(summary).toMatchObject({
        ok: true,
        currencies: [
          {
            currency: "ARS",
            owed: "2000.00",
            inFavor: "0.00",
            retained: "500.00",
          },
          { currency: "USD", owed: "0.00", inFavor: "130.00" },
        ],
      });
      expect(await saleStanding(s.adminA, b.id)).toMatchObject({
        outstanding: "2000.00",
        clientOwed: "2000.00",
      });
    },
    TEST_TIMEOUT,
  );

  it(
    "la vista previa reparte con la regla y no escribe",
    async () => {
      const s = await seed();
      const { b } = await fullAccount(s);
      const before = await getDb().execute<{ receipts: number }>(
        sql`select count(*)::int as receipts from receipts`,
      );
      const preview = await previewAccountReceipt(s.adminA, {
        clientId: s.clientA,
        currency: "ARS",
        paymentMethodId: s.methods.transfer,
        amount: "2500",
      });
      expect(preview).toEqual({
        ok: true,
        preview: {
          currency: "ARS",
          amount: "2500.00",
          applications: [
            { saleId: b.id, displayNumber: "V-000002", amount: "2000.00" },
          ],
          toFavor: "500.00",
          tender: null,
        },
      });
      const after = await getDb().execute<{ receipts: number }>(
        sql`select count(*)::int as receipts from receipts`,
      );
      expect(after.rows[0]!.receipts).toBe(before.rows[0]!.receipts);
      expect(
        await previewAccountReceipt(s.viewerA, {
          clientId: s.clientA,
          currency: "ARS",
          paymentMethodId: s.methods.transfer,
          amount: "1",
        }),
      ).toEqual({ ok: false, code: "FORBIDDEN" });
    },
    TEST_TIMEOUT,
  );

  it(
    "la lista de deudores: solo quien debe, por moneda y de la deuda mayor a la menor",
    async () => {
      const s = await seed();
      await fullAccount(s);
      // Otro cliente que debe menos, uno que debe más en dólares y uno con todo cobrado.
      const small = await addClient(s.orgA, "Mario Paz");
      const smallSale = await sell(s, 1, small);
      await received(s.adminA, smallSale.id, s.methods.transfer, "400");
      const paid = await addClient(s.orgA, "Pagó Todo");
      const paidSale = await sell(s, 1, paid);
      await receivedAccount(s, "1000", "ARS", paid);
      expect(await saleStanding(s.adminA, paidSale.id)).toMatchObject({
        outstanding: "0.00",
      });

      const listed = await listDebtors(s.viewerA, { currency: null, page: 1 });
      if (!listed.ok) throw new Error(`lista rechazada: ${listed.code}`);
      expect(listed.debtors).toMatchObject({
        total: 2,
        page: 1,
        currencies: ["ARS"],
        rows: [
          {
            clientId: s.clientA,
            displayName: "Lucía Gómez",
            currency: "ARS",
            owed: "2000.00",
            salesWithBalance: 1,
          },
          {
            clientId: small,
            displayName: "Mario Paz",
            currency: "ARS",
            owed: "600.00",
            salesWithBalance: 1,
          },
        ],
      });
      // La deuda de cada fila es la del estado de cuenta.
      const statement = await getClientStatement(s.adminA, small);
      if (!statement.ok) throw new Error("estado rechazado");
      expect(statement.statement.currencies[0]!.owed).toBe("600.00");

      expect(
        await listDebtors(s.adminA, { currency: "USD", page: 1 }),
      ).toMatchObject({ ok: true, debtors: { total: 0, rows: [] } });
      expect(await listDebtors(s.adminA, { currency: "usd", page: 1 })).toEqual(
        { ok: false, code: "VALIDATION_ERROR" },
      );
      expect(await listDebtors(s.adminA, { currency: null, page: 0 })).toEqual({
        ok: false,
        code: "VALIDATION_ERROR",
      });
      // Otra organización no ve estos deudores.
      expect(
        await listDebtors(s.adminB, { currency: null, page: 1 }),
      ).toMatchObject({ ok: true, debtors: { total: 0 } });
    },
    TEST_TIMEOUT,
  );

  it(
    "otra organización da NOT_FOUND, y un viewer lee la cuenta sin acciones",
    async () => {
      const s = await seed();
      await fullAccount(s);
      expect(await getClientStatement(s.adminB, s.clientA)).toEqual({
        ok: false,
        code: "NOT_FOUND",
      });
      expect(await getClientAccountSummary(s.adminB, s.clientA)).toEqual({
        ok: false,
        code: "NOT_FOUND",
      });
      expect(await getAccountReceiptForm(s.adminB, s.clientA)).toEqual({
        ok: false,
        code: "NOT_FOUND",
      });
      expect(await getClientStatement(s.viewerA, s.clientA)).toMatchObject({
        ok: true,
      });
      expect(await getAccountReceiptForm(s.viewerA, s.clientA)).toEqual({
        ok: false,
        code: "FORBIDDEN",
      });
      expect(await getClientStatement(s.adminA, "no-es-un-uuid")).toEqual({
        ok: false,
        code: "VALIDATION_ERROR",
      });
    },
    TEST_TIMEOUT,
  );

  it(
    "el formulario propone la moneda y lo que debe de la venta con saldo más vieja",
    async () => {
      const s = await seed();
      await fullAccount(s);
      const form = await getAccountReceiptForm(s.adminA, s.clientA);
      if (!form.ok) throw new Error(`formulario rechazado: ${form.code}`);
      expect(form.proposed).toEqual({
        currency: "ARS",
        amount: "2000.00",
        amountInput: "2000.00",
      });
      // Un cliente sin ventas no tiene propuesta.
      const empty = await addClient(s.orgA, "Sin Ventas");
      const emptyForm = await getAccountReceiptForm(s.adminA, empty);
      if (!emptyForm.ok) throw new Error("formulario rechazado");
      expect(emptyForm.proposed).toBeNull();
      expect(emptyForm.currencies).toEqual([]);
    },
    TEST_TIMEOUT,
  );
  it(
    "una seña aplicada cuenta para su venta igual en el estado de cuenta, el resumen y la lista de deudores",
    async () => {
      const s = await seed();
      // V1, la más vieja, de 1000; P, de 2000, con una seña de 500, entregado y vendido en V2; y un
      // cobro a cuenta de 300, que va a V1. A V1 le faltan 700 y a V2, 2000 − 500 = 1500.
      const v1 = await sell(s, 1, s.clientA);
      const p = await order(s, 2);
      await deposited(s.adminA, p.id, s.methods.transfer, "500");
      await step(confirmOrder, s.adminA, p.id);
      await step(deliverOrder, s.adminA, p.id);
      const issued = await issueSaleFromOrder(s.adminA, p.id);
      if (!issued.ok)
        throw new Error(`emisión rechazada: ${JSON.stringify(issued)}`);
      const v2 = issued.sale;
      await receivedAccount(s, "300");

      const result = await getClientStatement(s.adminA, s.clientA);
      if (!result.ok) throw new Error(`estado rechazado: ${result.code}`);
      expect(result.statement.currencies).toMatchObject([
        {
          currency: "ARS",
          debit: "3000.00",
          credit: "800.00",
          balance: { side: "debt", amount: "2200.00" },
          owed: "2200.00",
          inFavor: "0.00",
          retained: "0.00",
          salesWithBalance: 2,
          sales: [
            { id: v1.id, imputed: "300.00", outstanding: "700.00" },
            { id: v2.id, imputed: "0.00", outstanding: "1500.00" },
          ],
        },
      ]);
      expect(await getClientAccountSummary(s.adminA, s.clientA)).toMatchObject({
        ok: true,
        currencies: [
          {
            currency: "ARS",
            owed: "2200.00",
            inFavor: "0.00",
            retained: "0.00",
          },
        ],
      });
      expect(await saleStanding(s.adminA, v2.id)).toMatchObject({
        deposited: "500.00",
        outstanding: "1500.00",
        clientOwed: "2200.00",
      });
      expect(
        await listDebtors(s.viewerA, { currency: null, page: 1 }),
      ).toMatchObject({
        ok: true,
        debtors: {
          total: 1,
          rows: [
            {
              clientId: s.clientA,
              currency: "ARS",
              owed: "2200.00",
              salesWithBalance: 2,
            },
          ],
        },
      });
    },
    TEST_TIMEOUT,
  );
});

// El saldo de la lista de clientes (brief-24.4.2, D-2 y AC-2): por cliente y moneda, sin sumar, con
// la misma regla que la ficha; un cliente sin ventas con un cobro a cuenta tiene saldo a favor.
describe("el saldo de cada cliente para la lista (brief-24.4.2)", () => {
  it(
    "da lo mismo que el resumen de la ficha, por moneda, y no cruza la organización",
    async () => {
      const s = await seed();
      await fullAccount(s);
      const favorOnly = await addClient(s.orgA, "Solo A Favor");
      await receivedAccount(s, "400", "ARS", favorOnly);
      await addClient(s.orgA, "Sin Nada");
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

      for (const context of [s.adminA, s.viewerA]) {
        const result = await getClientBalances(context);
        if (!result.ok) throw new Error(`saldo rechazado: ${result.code}`);
        const sorted = [...result.balances].sort((x, y) =>
          (x.clientId + x.currency).localeCompare(y.clientId + y.currency),
        );
        expect(sorted).toEqual(
          [
            {
              clientId: s.clientA,
              currency: "ARS",
              owed: "2000.00",
              inFavor: "0.00",
            },
            {
              clientId: s.clientA,
              currency: "USD",
              owed: "0.00",
              inFavor: "130.00",
            },
            {
              clientId: favorOnly,
              currency: "ARS",
              owed: "0.00",
              inFavor: "400.00",
            },
          ].sort((x, y) =>
            (x.clientId + x.currency).localeCompare(y.clientId + y.currency),
          ),
        );
      }

      // La misma regla que la ficha (condición de detención del brief).
      const summary = await getClientAccountSummary(s.adminA, s.clientA);
      if (!summary.ok) throw new Error("resumen rechazado");
      expect(
        summary.currencies.map(({ currency, owed, inFavor }) => ({
          currency,
          owed,
          inFavor,
        })),
      ).toEqual([
        { currency: "ARS", owed: "2000.00", inFavor: "0.00" },
        { currency: "USD", owed: "0.00", inFavor: "130.00" },
      ]);

      const favorSummary = await getClientAccountSummary(s.adminA, favorOnly);
      if (!favorSummary.ok) throw new Error("resumen rechazado");
      expect(
        favorSummary.currencies.map(({ currency, owed, inFavor }) => ({
          currency,
          owed,
          inFavor,
        })),
      ).toEqual([{ currency: "ARS", owed: "0.00", inFavor: "400.00" }]);

      const otherOrg = await getClientBalances(s.adminB);
      if (!otherOrg.ok) throw new Error("saldo de B rechazado");
      expect(otherOrg.balances).toEqual([
        {
          clientId: s.clientB,
          currency: "ARS",
          owed: "1000.00",
          inFavor: "0.00",
        },
      ]);
    },
    TEST_TIMEOUT,
  );
});

import { sql, type SQL } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { hashPassword, login } from "@/modules/auth";
import {
  createInitialPaymentMethods,
  createSupplierPayment,
  getGoodsReceiptPayments,
  getSupplierAccountPaymentForm,
  getSupplierAccountSummary,
  getSupplierStatement,
  listPaymentMethods,
  listSuppliersOwed,
  voidSupplierPayment,
  type SupplierPaymentInput,
} from "@/modules/cash";
import { getAuthContext, type AuthContext } from "@/modules/organizations";
import {
  createGoodsReceipt,
  createSupplier,
  deactivateSupplier,
  getGoodsReceiptForPayment,
  listGoodsReceiptsForAccounts,
  voidGoodsReceipt,
} from "@/modules/purchasing";
import { getDb } from "@/shared/db";
import { resetDatabase } from "./reset-database";

// La cuenta del proveedor contra PostgreSQL real (brief-22.6, AC-2; ADR 0023, punto 9): la regla de
// imputación de la cuenta de clientes, sin cambios, con las recepciones al debe y los pagos al
// haber, por moneda. Lo que se lee es lo que muestran el detalle de la recepción y el formulario del
// pago a cuenta, armados por una sola función (D-6). Desde la 22.7 (brief-22.7), el estado de cuenta,
// el resumen de la ficha y la lista de proveedores a los que se les debe, que salen de la misma
// cuenta (AC-1 a AC-4).

const PASSWORD = "contraseña-correcta-larga";
const TEST_TIMEOUT = 30000;
let storedHash: string;

async function returningId(query: SQL): Promise<string> {
  const result = await getDb().execute<{ id: string }>(query);
  return result.rows[0]!.id;
}

async function member(
  orgId: string,
  email: string,
  role: "admin" | "viewer",
): Promise<AuthContext> {
  const userId = await returningId(
    sql`insert into users (email, password_hash, name)
        values (${email}, ${storedHash}, ${email}) returning id`,
  );
  await getDb().execute(
    sql`insert into organization_members (organization_id, user_id, role)
        values (${orgId}, ${userId}, ${role})`,
  );
  const logged = await login({ email, password: PASSWORD, ip: null });
  if (!logged.ok) throw new Error("login rechazado");
  const auth = await getAuthContext(logged.token);
  if (!auth.ok) throw new Error("contexto rechazado");
  return auth.context;
}

async function seed() {
  const orgId = await returningId(
    sql`insert into organizations (name) values ('Negocio A') returning id`,
  );
  const admin = await member(orgId, "admin-a@example.com", "admin");
  await createInitialPaymentMethods(admin);
  const listed = await listPaymentMethods(admin);
  if (!listed.ok) throw new Error("lista rechazada");
  const transfer = listed.paymentMethods.find(
    (method) => method.name === "Transferencia",
  )!.id;
  const created = await createSupplier(admin, { name: "Importaciones Sur" });
  if (!created.ok) throw new Error("proveedor rechazado");
  const productId = await returningId(
    sql`insert into products (organization_id, sku, name)
        values (${orgId}, 'CAF-1', 'Café') returning id`,
  );
  return {
    orgId,
    admin,
    transfer,
    supplierId: created.supplierId,
    productId,
  };
}

type Seed = Awaited<ReturnType<typeof seed>>;

async function receipt(
  s: Seed,
  total: string,
  currency = "ARS",
  supplierId = s.supplierId,
) {
  const result = await createGoodsReceipt(s.admin, {
    purchaseOrderId: null,
    supplierId,
    currency,
    supplierReference: "",
    lines: [{ productId: s.productId, quantity: "1", unitCost: total }],
  });
  if (!result.ok) throw new Error(`recepción rechazada: ${result.code}`);
  return result.receipt;
}

async function pay(
  s: Seed,
  input: Omit<SupplierPaymentInput, "paymentMethodId">,
) {
  const result = await createSupplierPayment(s.admin, {
    ...input,
    paymentMethodId: s.transfer,
  });
  if (!result.ok) throw new Error(`pago rechazado: ${JSON.stringify(result)}`);
  return result.payment;
}

async function standing(s: Seed, goodsReceiptId: string) {
  const result = await getGoodsReceiptPayments(s.admin, goodsReceiptId);
  if (!result.ok) throw new Error("lectura rechazada");
  const { paid, imputed, outstanding, toAccount } = result.standing;
  return { paid, imputed, outstanding, toAccount };
}

async function account(s: Seed) {
  const result = await getSupplierAccountPaymentForm(s.admin, s.supplierId);
  if (!result.ok) throw new Error("formulario rechazado");
  return result.form.currencies.map(({ currency, owed, inFavor }) => ({
    currency,
    owed,
    inFavor,
  }));
}

// El haber de una moneda es la suma de los pagos vigentes (invariante 6): lo que está imputado a
// recepciones vigentes, más lo que sobra a favor.
async function creditOf(currency: string) {
  const result = await getDb().execute<{ total: string }>(
    sql`select coalesce(sum(amount), 0)::text as total from supplier_payments p
        where currency = ${currency} and not exists (
          select 1 from supplier_payment_voids v where v.supplier_payment_id = p.id)`,
  );
  return result.rows[0]!.total;
}

beforeEach(async () => {
  await resetDatabase(getDb());
  storedHash ??= await hashPassword(PASSWORD);
});

afterAll(async () => {
  await getDb().$client.end();
});

describe("la cuenta del proveedor (AC-2; D-6)", () => {
  it(
    "lo que falta de cada recepción, y el remanente de un pago a cuenta de la más vieja a la más nueva",
    async () => {
      const s = await seed();
      const first = await receipt(s, "100");
      const second = await receipt(s, "200");
      const third = await receipt(s, "300");
      await pay(s, {
        target: "goods_receipt",
        goodsReceiptId: second.id,
        amount: "50",
      });
      await pay(s, {
        target: "account",
        supplierId: s.supplierId,
        currency: "ARS",
        amount: "250",
      });
      expect(await standing(s, first.id)).toEqual({
        paid: "0.00",
        imputed: "100.00",
        outstanding: "0.00",
        toAccount: "0.00",
      });
      expect(await standing(s, second.id)).toEqual({
        paid: "50.00",
        imputed: "150.00",
        outstanding: "0.00",
        toAccount: "0.00",
      });
      expect(await standing(s, third.id)).toEqual({
        paid: "0.00",
        imputed: "0.00",
        outstanding: "300.00",
        toAccount: "0.00",
      });
      expect(await account(s)).toEqual([
        { currency: "ARS", owed: "300.00", inFavor: "0.00" },
      ]);
      expect(await creditOf("ARS")).toBe("300.00");
    },
    TEST_TIMEOUT,
  );

  it(
    "lo pagado contra una recepción anulada pasa al remanente, y lo que sobra queda a favor",
    async () => {
      const s = await seed();
      const voidedRc = await receipt(s, "100");
      const current = await receipt(s, "40");
      await pay(s, {
        target: "goods_receipt",
        goodsReceiptId: voidedRc.id,
        amount: "100",
      });
      expect(
        await voidGoodsReceipt(s.admin, voidedRc.id, "data_entry_error"),
      ).toMatchObject({ ok: true });
      expect(await standing(s, voidedRc.id)).toEqual({
        paid: "100.00",
        imputed: "0.00",
        outstanding: "0.00",
        toAccount: "100.00",
      });
      expect(await standing(s, current.id)).toEqual({
        paid: "0.00",
        imputed: "40.00",
        outstanding: "0.00",
        toAccount: "0.00",
      });
      expect(await account(s)).toEqual([
        { currency: "ARS", owed: "0.00", inFavor: "60.00" },
      ]);
      // Un pago contra la anulada ya no entra.
      expect(
        await createSupplierPayment(s.admin, {
          target: "goods_receipt",
          goodsReceiptId: voidedRc.id,
          paymentMethodId: s.transfer,
          amount: "1",
        }),
      ).toMatchObject({ rule: "goods_receipt_voided" });
      expect(await creditOf("ARS")).toBe("100.00");
    },
    TEST_TIMEOUT,
  );

  it(
    "un pago anulado no cuenta, y lo que falta vuelve a crecer",
    async () => {
      const s = await seed();
      const rc = await receipt(s, "100");
      const payment = await pay(s, {
        target: "account",
        supplierId: s.supplierId,
        currency: "ARS",
        amount: "70",
      });
      expect(await standing(s, rc.id)).toMatchObject({ outstanding: "30.00" });
      await voidSupplierPayment(s.admin, {
        paymentId: payment.id,
        reason: "wrong_amount",
      });
      expect(await standing(s, rc.id)).toMatchObject({
        imputed: "0.00",
        outstanding: "100.00",
      });
      expect(await creditOf("ARS")).toBe("0");
    },
    TEST_TIMEOUT,
  );

  it(
    "cada moneda va aparte: un pago en dólares no cubre una recepción en pesos",
    async () => {
      const s = await seed();
      const pesos = await receipt(s, "100", "ARS");
      const dollars = await receipt(s, "10", "USD");
      await pay(s, {
        target: "account",
        supplierId: s.supplierId,
        currency: "USD",
        amount: "25",
      });
      expect(await standing(s, pesos.id)).toMatchObject({
        outstanding: "100.00",
      });
      expect(await standing(s, dollars.id)).toMatchObject({
        imputed: "10.00",
        outstanding: "0.00",
      });
      expect(await account(s)).toEqual([
        { currency: "ARS", owed: "100.00", inFavor: "0.00" },
        { currency: "USD", owed: "0.00", inFavor: "15.00" },
      ]);
      // El formulario propone la moneda de la recepción con saldo más vieja.
      const form = await getSupplierAccountPaymentForm(s.admin, s.supplierId);
      expect(form).toMatchObject({
        ok: true,
        form: { proposed: { currency: "ARS", amount: "100.00" } },
      });
    },
    TEST_TIMEOUT,
  );

  it(
    "el tope de un pago contra una recepción es lo que falta según la cuenta entera",
    async () => {
      const s = await seed();
      const rc = await receipt(s, "100");
      await pay(s, {
        target: "account",
        supplierId: s.supplierId,
        currency: "ARS",
        amount: "80",
      });
      expect(
        await createSupplierPayment(s.admin, {
          target: "goods_receipt",
          goodsReceiptId: rc.id,
          paymentMethodId: s.transfer,
          amount: "20.01",
        }),
      ).toMatchObject({ rule: "exceeds_outstanding", outstanding: "20.00" });
      await pay(s, {
        target: "goods_receipt",
        goodsReceiptId: rc.id,
        amount: "20",
      });
      expect(await standing(s, rc.id)).toEqual({
        paid: "20.00",
        imputed: "80.00",
        outstanding: "0.00",
        toAccount: "0.00",
      });
    },
    TEST_TIMEOUT,
  );
});

// La 22.7 (brief-22.7): lo que se lee de la cuenta, con la misma regla.

async function namedSupplier(s: Seed, name: string, context = s.admin) {
  const created = await createSupplier(context, { name });
  if (!created.ok) throw new Error("proveedor rechazado");
  return created.supplierId;
}

async function summary(context: AuthContext, supplierId: string) {
  const result = await getSupplierAccountSummary(context, supplierId);
  if (!result.ok) throw new Error(`resumen rechazado: ${result.code}`);
  return result.currencies.map(({ currency, owed, inFavor }) => ({
    currency,
    owed,
    inFavor,
  }));
}

async function owedRows(
  context: AuthContext,
  query: { currency: string | null; page: number } = {
    currency: null,
    page: 1,
  },
) {
  const result = await listSuppliersOwed(context, query);
  if (!result.ok) throw new Error(`lista rechazada: ${result.code}`);
  return result.suppliers;
}

async function otherOrganization() {
  const orgB = await returningId(
    sql`insert into organizations (name) values ('Negocio B') returning id`,
  );
  const adminB = await member(orgB, "admin-b@example.com", "admin");
  const created = await createSupplier(adminB, { name: "Proveedor de B" });
  if (!created.ok) throw new Error("proveedor rechazado");
  const productB = await returningId(
    sql`insert into products (organization_id, sku, name)
        values (${orgB}, 'CAF-1', 'Café') returning id`,
  );
  return { orgB, adminB, supplierB: created.supplierId, productB };
}

// La cuenta de «Importaciones Sur» del estado de cuenta: tres recepciones en pesos, una anulada con
// un pago contra ella, un pago directo, dos a cuenta (uno anulado), y en dólares una recepción y un
// pago a cuenta que la excede.
async function statementScenario(s: Seed) {
  const first = await receipt(s, "100");
  const voided = await receipt(s, "200");
  const third = await receipt(s, "300");
  const towardVoided = await pay(s, {
    target: "goods_receipt",
    goodsReceiptId: voided.id,
    amount: "50",
  });
  expect(
    await voidGoodsReceipt(s.admin, voided.id, "data_entry_error"),
  ).toMatchObject({ ok: true });
  await pay(s, {
    target: "goods_receipt",
    goodsReceiptId: third.id,
    amount: "30",
  });
  const onAccount = await pay(s, {
    target: "account",
    supplierId: s.supplierId,
    currency: "ARS",
    amount: "250",
  });
  const voidedPayment = await pay(s, {
    target: "account",
    supplierId: s.supplierId,
    currency: "ARS",
    amount: "10",
  });
  expect(
    await voidSupplierPayment(s.admin, {
      paymentId: voidedPayment.id,
      reason: "wrong_amount",
    }),
  ).toMatchObject({ ok: true });
  const dollars = await receipt(s, "10", "USD");
  await pay(s, {
    target: "account",
    supplierId: s.supplierId,
    currency: "USD",
    amount: "25",
  });
  return {
    first,
    voided,
    third,
    towardVoided,
    onAccount,
    voidedPayment,
    dollars,
  };
}

describe("el estado de cuenta del proveedor (brief-22.7, AC-2 y AC-3)", () => {
  it(
    "el resumen, la imputación y los comprobantes salen de la misma cuenta",
    async () => {
      const s = await seed();
      const docs = await statementScenario(s);
      const result = await getSupplierStatement(s.admin, s.supplierId);
      if (!result.ok) throw new Error(`estado rechazado: ${result.code}`);
      const { statement } = result;
      expect(statement.supplier).toEqual({
        id: s.supplierId,
        name: "Importaciones Sur",
      });
      expect(statement.truncated).toBe(false);
      // Pesos: debe 100 + 300 (la anulada no); haber 50 + 30 + 250 (el anulado no). El remanente,
      // 50 + 250, va a la más vieja: 100 a la primera y 200 a la tercera, a la que le faltan 70.
      expect(statement.currencies).toEqual([
        {
          currency: "ARS",
          owed: "70.00",
          inFavor: "0.00",
          receiptsWithBalance: 1,
          oldestOutstandingAt: expect.any(Date),
          debit: "400.00",
          credit: "330.00",
          balance: { side: "owed", amount: "70.00" },
          receipts: [
            {
              // Desde la 29.6, qué es cada fila: una recepción o una orden de servicio (brief-29.6, D-7).
              kind: "goods_receipt",
              id: docs.first.id,
              displayNumber: docs.first.displayNumber,
              issuedAt: expect.any(Date),
              total: "100.00",
              direct: "0.00",
              imputed: "100.00",
              outstanding: "0.00",
            },
            {
              // Desde la 29.6, qué es cada fila: una recepción o una orden de servicio (brief-29.6, D-7).
              kind: "goods_receipt",
              id: docs.third.id,
              displayNumber: docs.third.displayNumber,
              issuedAt: expect.any(Date),
              total: "300.00",
              direct: "30.00",
              imputed: "200.00",
              outstanding: "70.00",
            },
          ],
        },
        {
          currency: "USD",
          owed: "0.00",
          inFavor: "15.00",
          receiptsWithBalance: 0,
          oldestOutstandingAt: null,
          debit: "10.00",
          credit: "25.00",
          balance: { side: "favor", amount: "15.00" },
          receipts: [
            {
              // Desde la 29.6, qué es cada fila: una recepción o una orden de servicio (brief-29.6, D-7).
              kind: "goods_receipt",
              id: docs.dollars.id,
              displayNumber: docs.dollars.displayNumber,
              issuedAt: expect.any(Date),
              total: "10.00",
              direct: "0.00",
              imputed: "10.00",
              outstanding: "0.00",
            },
          ],
        },
      ]);

      // Los comprobantes, de los más nuevos a los más viejos, con la fecha de cada anulación.
      const voids = await getDb().execute<{ kind: string; created_at: Date }>(
        sql`select 'receipt' as kind, created_at from goods_receipt_voids
            union all
            select 'payment', created_at from supplier_payment_voids`,
      );
      const voidedAt = (kind: string) =>
        new Date(voids.rows.find((row) => row.kind === kind)!.created_at);
      const kinds = statement.documents.map((row) => [
        row.kind,
        row.displayNumber,
        row.voided,
      ]);
      expect(kinds).toHaveLength(11);
      expect(kinds).toEqual(
        expect.arrayContaining([
          ["goods_receipt", docs.first.displayNumber, false],
          ["goods_receipt", docs.voided.displayNumber, true],
          ["goods_receipt_void", "ARC-000001", false],
          ["payment", docs.towardVoided.displayNumber, false],
          ["payment", docs.voidedPayment.displayNumber, true],
          ["payment_void", "APP-000001", false],
        ]),
      );
      const times = statement.documents.map((row) => row.createdAt.getTime());
      expect(times).toEqual([...times].sort((a, b) => b - a));
      expect(
        statement.documents.find((row) => row.kind === "goods_receipt_void")!
          .createdAt,
      ).toEqual(voidedAt("receipt"));
      expect(
        statement.documents.find((row) => row.kind === "payment_void")!
          .createdAt,
      ).toEqual(voidedAt("payment"));
      // El destino de cada pago, con el número de su recepción, también de la anulada.
      const destinationOf = (id: string) =>
        statement.documents.find(
          (row) => row.kind === "payment" && row.id === id,
        )!.destination;
      expect(destinationOf(docs.towardVoided.id)).toEqual({
        target: "goods_receipt",
        ref: { id: docs.voided.id, displayNumber: docs.voided.displayNumber },
      });
      expect(destinationOf(docs.onAccount.id)).toEqual({ target: "account" });

      // AC-3: el resumen de la ficha, el formulario del pago a cuenta y la lista dan lo mismo.
      const expected = [
        { currency: "ARS", owed: "70.00", inFavor: "0.00" },
        { currency: "USD", owed: "0.00", inFavor: "15.00" },
      ];
      expect(await summary(s.admin, s.supplierId)).toEqual(expected);
      expect(await account(s)).toEqual(expected);
      expect((await owedRows(s.admin)).rows).toEqual([
        {
          supplierId: s.supplierId,
          name: "Importaciones Sur",
          currency: "ARS",
          owed: "70.00",
          oldestOutstandingAt: expect.any(Date),
          receiptsWithBalance: 1,
        },
      ]);
    },
    TEST_TIMEOUT,
  );

  it(
    "un proveedor sin recepciones ni pagos no tiene monedas, y uno desactivado tiene estado de cuenta",
    async () => {
      const s = await seed();
      const empty = await namedSupplier(s, "Sin movimientos");
      expect(await getSupplierStatement(s.admin, empty)).toMatchObject({
        ok: true,
        statement: { currencies: [], documents: [], truncated: false },
      });
      expect(await summary(s.admin, empty)).toEqual([]);
      await receipt(s, "100");
      expect(await deactivateSupplier(s.admin, s.supplierId)).toMatchObject({
        ok: true,
      });
      expect(await summary(s.admin, s.supplierId)).toEqual([
        { currency: "ARS", owed: "100.00", inFavor: "0.00" },
      ]);
    },
    TEST_TIMEOUT,
  );

  it(
    "las respuestas: un viewer no ve nada, otra organización no existe, y lo inválido se rechaza",
    async () => {
      const s = await seed();
      const viewer = await member(s.orgId, "viewer-a@example.com", "viewer");
      const { supplierB } = await otherOrganization();
      for (const read of [getSupplierStatement, getSupplierAccountSummary]) {
        expect(await read(viewer, s.supplierId)).toEqual({
          ok: false,
          code: "FORBIDDEN",
        });
        expect(await read(s.admin, supplierB)).toEqual({
          ok: false,
          code: "NOT_FOUND",
        });
        expect(await read(s.admin, "no-uuid")).toEqual({
          ok: false,
          code: "VALIDATION_ERROR",
        });
      }
      expect(
        await listSuppliersOwed(viewer, { currency: null, page: 1 }),
      ).toEqual({ ok: false, code: "FORBIDDEN" });
      for (const query of [
        { currency: "usd", page: 1 },
        { currency: "PESOS", page: 1 },
        { currency: null, page: 0 },
        { currency: null, page: 1.5 },
      ]) {
        expect(await listSuppliersOwed(s.admin, query)).toEqual({
          ok: false,
          code: "VALIDATION_ERROR",
        });
      }
    },
    TEST_TIMEOUT,
  );
});

describe("la lista de proveedores a los que se les debe (brief-22.7, AC-1 y AC-4)", () => {
  it(
    "una fila por proveedor y moneda con algo que pagar, igual al resumen de su cuenta",
    async () => {
      const s = await seed();
      // Importaciones Sur: le faltan 70 de 100.
      await receipt(s, "100");
      await pay(s, {
        target: "account",
        supplierId: s.supplierId,
        currency: "ARS",
        amount: "30",
      });
      // Distribuidora Norte: todo a favor del negocio, no está.
      const north = await namedSupplier(s, "Distribuidora Norte");
      await receipt(s, "50", "USD", north);
      await pay(s, {
        target: "account",
        supplierId: north,
        currency: "USD",
        amount: "60",
      });
      // Lácteos Oeste: desactivada, se le debe en las dos monedas.
      const west = await namedSupplier(s, "Lácteos Oeste");
      await receipt(s, "500", "ARS", west);
      await receipt(s, "5", "USD", west);
      expect(await deactivateSupplier(s.admin, west)).toMatchObject({
        ok: true,
      });
      // Pagada entera: no está.
      const paidUp = await namedSupplier(s, "Al día");
      const rc = await receipt(s, "40", "ARS", paidUp);
      await pay(s, {
        target: "goods_receipt",
        goodsReceiptId: rc.id,
        amount: "40",
      });
      // Otra organización con deuda: no aparece.
      const b = await otherOrganization();
      expect(
        await createGoodsReceipt(b.adminB, {
          purchaseOrderId: null,
          supplierId: b.supplierB,
          currency: "ARS",
          supplierReference: "",
          lines: [{ productId: b.productB, quantity: "1", unitCost: "9999" }],
        }),
      ).toMatchObject({ ok: true });

      const all = await owedRows(s.admin);
      expect(all.rows.map((row) => [row.name, row.currency, row.owed])).toEqual(
        [
          ["Lácteos Oeste", "ARS", "500.00"],
          ["Importaciones Sur", "ARS", "70.00"],
          ["Lácteos Oeste", "USD", "5.00"],
        ],
      );
      expect(all).toMatchObject({
        total: 3,
        page: 1,
        pageSize: 25,
        currencies: ["ARS", "USD"],
      });
      // Cada fila es el resumen de la cuenta de su proveedor (AC-4), con todos sus campos: lo que se le
      // debe, la recepción con saldo más vieja y cuántas tienen saldo (revisión independiente, R5).
      for (const row of all.rows) {
        const statement = await getSupplierStatement(s.admin, row.supplierId);
        if (!statement.ok) throw new Error("estado rechazado");
        const currency = statement.statement.currencies.find(
          (account) => account.currency === row.currency,
        )!;
        expect(row).toEqual({
          supplierId: row.supplierId,
          name: row.name,
          currency: currency.currency,
          owed: currency.owed,
          oldestOutstandingAt: currency.oldestOutstandingAt,
          receiptsWithBalance: currency.receiptsWithBalance,
        });
        expect(currency.inFavor).toBe("0.00");
      }
      const dollars = await owedRows(s.admin, { currency: "USD", page: 1 });
      expect(dollars.rows.map((row) => row.name)).toEqual(["Lácteos Oeste"]);
      expect(dollars.total).toBe(1);
      expect(
        await owedRows(s.admin, { currency: "EUR", page: 1 }),
      ).toMatchObject({ rows: [], total: 0 });
      expect(
        await owedRows(s.admin, { currency: null, page: 2 }),
      ).toMatchObject({ rows: [], total: 3 });
      expect((await owedRows(b.adminB)).rows.map((row) => row.name)).toEqual([
        "Proveedor de B",
      ]);
    },
    TEST_TIMEOUT,
  );

  it(
    "pagina de a 25, de la deuda mayor a la menor",
    async () => {
      const s = await seed();
      for (let i = 1; i <= 26; i += 1) {
        const id = await namedSupplier(s, `Proveedor ${i}`);
        await receipt(s, String(i), "ARS", id);
      }
      const first = await owedRows(s.admin);
      expect(first.total).toBe(26);
      expect(first.rows).toHaveLength(25);
      expect(first.rows[0]!.owed).toBe("26.00");
      const second = await owedRows(s.admin, { currency: null, page: 2 });
      expect(second.rows.map((row) => [row.name, row.owed])).toEqual([
        ["Proveedor 1", "1.00"],
      ]);
    },
    TEST_TIMEOUT,
  );

  it(
    "purchasing da las recepciones de toda la organización, con las anuladas y la fecha de su anulación",
    async () => {
      const s = await seed();
      const north = await namedSupplier(s, "Distribuidora Norte");
      const a = await receipt(s, "10");
      const b = await receipt(s, "20", "ARS", north);
      const c = await receipt(s, "30");
      expect(
        await voidGoodsReceipt(s.admin, c.id, "data_entry_error"),
      ).toMatchObject({ ok: true });
      const other = await otherOrganization();
      expect(
        await createGoodsReceipt(other.adminB, {
          purchaseOrderId: null,
          supplierId: other.supplierB,
          currency: "ARS",
          supplierReference: "",
          lines: [{ productId: other.productB, quantity: "1", unitCost: "1" }],
        }),
      ).toMatchObject({ ok: true });
      const rows = await getDb().transaction((tx) =>
        listGoodsReceiptsForAccounts(tx, s.orgId),
      );
      const voidRow = await getDb().execute<{ created_at: Date }>(
        sql`select created_at from goods_receipt_voids`,
      );
      // Por proveedor y, dentro de cada uno, de la más vieja a la más nueva.
      const expectedOrder = [s.supplierId, north]
        .sort()
        .flatMap((id) => (id === s.supplierId ? [a.id, c.id] : [b.id]));
      expect(rows.map((row) => row.id)).toEqual(expectedOrder);
      expect(rows.find((row) => row.id === c.id)).toMatchObject({
        voided: true,
        voidDisplayNumber: "ARC-000001",
        voidedAt: new Date(voidRow.rows[0]!.created_at),
      });
      expect(rows.find((row) => row.id === a.id)).toMatchObject({
        voided: false,
        voidDisplayNumber: null,
        voidedAt: null,
      });
      // La lectura de una recepción por id trae la misma fecha (R5).
      expect(
        await getDb().transaction((tx) =>
          getGoodsReceiptForPayment(tx, s.orgId, c.id),
        ),
      ).toMatchObject({
        voided: true,
        voidedAt: new Date(voidRow.rows[0]!.created_at),
      });
      expect(
        await getDb().transaction((tx) =>
          getGoodsReceiptForPayment(tx, s.orgId, a.id),
        ),
      ).toMatchObject({ voided: false, voidedAt: null });
    },
    TEST_TIMEOUT,
  );
});

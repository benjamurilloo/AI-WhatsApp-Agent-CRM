import { sql, type SQL } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { hashPassword, login } from "@/modules/auth";
import {
  createInitialPaymentMethods,
  createSupplierPayment,
  getGoodsReceiptPayments,
  getSupplierAccountPaymentForm,
  listPaymentMethods,
  voidSupplierPayment,
  type SupplierPaymentInput,
} from "@/modules/cash";
import { getAuthContext } from "@/modules/organizations";
import {
  createGoodsReceipt,
  createSupplier,
  voidGoodsReceipt,
} from "@/modules/purchasing";
import { getDb } from "@/shared/db";
import { resetDatabase } from "./reset-database";

// La cuenta del proveedor contra PostgreSQL real (brief-22.6, AC-2; ADR 0023, punto 9): la regla de
// imputación de la cuenta de clientes, sin cambios, con las recepciones al debe y los pagos al
// haber, por moneda. Lo que se lee es lo que muestran el detalle de la recepción y el formulario del
// pago a cuenta, armados por una sola función (D-6).

const PASSWORD = "contraseña-correcta-larga";
const TEST_TIMEOUT = 30000;
let storedHash: string;

async function returningId(query: SQL): Promise<string> {
  const result = await getDb().execute<{ id: string }>(query);
  return result.rows[0]!.id;
}

async function seed() {
  const orgId = await returningId(
    sql`insert into organizations (name) values ('Negocio A') returning id`,
  );
  const userId = await returningId(
    sql`insert into users (email, password_hash, name)
        values ('admin-a@example.com', ${storedHash}, 'Ana') returning id`,
  );
  await getDb().execute(
    sql`insert into organization_members (organization_id, user_id, role)
        values (${orgId}, ${userId}, 'admin')`,
  );
  const logged = await login({
    email: "admin-a@example.com",
    password: PASSWORD,
    ip: null,
  });
  if (!logged.ok) throw new Error("login rechazado");
  const auth = await getAuthContext(logged.token);
  if (!auth.ok) throw new Error("contexto rechazado");
  const admin = auth.context;
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
    admin,
    transfer,
    supplierId: created.supplierId,
    productId,
  };
}

type Seed = Awaited<ReturnType<typeof seed>>;

async function receipt(s: Seed, total: string, currency = "ARS") {
  const result = await createGoodsReceipt(s.admin, {
    purchaseOrderId: null,
    supplierId: s.supplierId,
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

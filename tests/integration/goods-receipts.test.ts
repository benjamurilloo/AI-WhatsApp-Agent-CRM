import { sql, type SQL } from "drizzle-orm";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { hashPassword, login } from "@/modules/auth";
import { getAuthContext, type AuthContext } from "@/modules/organizations";
import {
  cancelPurchaseOrder,
  closePurchaseOrder,
  createGoodsReceipt,
  createPurchaseOrder,
  createSupplier,
  getGoodsReceipt,
  getPurchaseOrder,
  GOODS_RECEIPTS_PAGE_SIZE,
  listGoodsReceiptAudit,
  listGoodsReceipts,
  listRecentSupplierGoodsReceipts,
  type GoodsReceiptInput,
  type GoodsReceiptLineInput,
} from "@/modules/purchasing";
import { getDb } from "@/shared/db";
import { resetDatabase } from "./reset-database";
import { expectStockInvariant } from "./stock-invariant";

// La recepción contra PostgreSQL real (brief-22.4): las operaciones (AC-2 a AC-4), los rechazos
// (AC-6), la serialización (AC-5) y el rendimiento (AC-8). Los helpers son los de
// purchase-orders.test.ts.

const PASSWORD = "contraseña-correcta-larga";
const TEST_TIMEOUT = 30000;
let storedHash: string;

async function createOrganization(name: string) {
  const result = await getDb().execute<{ id: string }>(
    sql`insert into organizations (name) values (${name}) returning id`,
  );
  return result.rows[0]!.id;
}

async function addUser(
  organizationId: string,
  email: string,
  name: string,
  role: "admin" | "viewer",
) {
  const user = await getDb().execute<{ id: string }>(
    sql`insert into users (email, password_hash, name)
        values (${email}, ${storedHash}, ${name}) returning id`,
  );
  await getDb().execute(
    sql`insert into organization_members (organization_id, user_id, role)
        values (${organizationId}, ${user.rows[0]!.id}, ${role})`,
  );
  return user.rows[0]!.id;
}

async function contextFor(email: string): Promise<AuthContext> {
  const logged = await login({ email, password: PASSWORD, ip: null });
  if (!logged.ok) throw new Error(`login rechazado: ${logged.code}`);
  const result = await getAuthContext(logged.token);
  if (!result.ok) throw new Error(`contexto rechazado: ${result.code}`);
  return result.context;
}

async function insertProduct(
  organizationId: string,
  sku: string,
  isActive = true,
) {
  const result = await getDb().execute<{ id: string }>(
    sql`insert into products (organization_id, sku, name, is_active)
        values (${organizationId}, ${sku}, ${`Producto ${sku}`}, ${isActive}) returning id`,
  );
  return result.rows[0]!.id;
}

async function supplier(context: AuthContext, name: string, full = true) {
  const result = await createSupplier(
    context,
    full
      ? {
          name,
          phone: "+5491155551234",
          email: "ventas@norte.com",
          cuit: "20-12345678-6",
        }
      : { name },
  );
  if (!result.ok) throw new Error(`proveedor rechazado: ${result.code}`);
  return result.supplierId;
}

async function seed() {
  const orgA = await createOrganization("Negocio A");
  const orgB = await createOrganization("Negocio B");
  const adminUserA = await addUser(orgA, "admin-a@example.com", "Ana", "admin");
  await addUser(orgA, "viewer-a@example.com", "Vera", "viewer");
  await addUser(orgB, "admin-b@example.com", "Beto", "admin");
  const adminA = await contextFor("admin-a@example.com");
  const adminB = await contextFor("admin-b@example.com");
  return {
    orgA,
    orgB,
    adminUserA,
    adminA,
    viewerA: await contextFor("viewer-a@example.com"),
    adminB,
    supplierA: await supplier(adminA, "Importaciones Sur"),
    supplierA2: await supplier(adminA, "Distribuidora Norte", false),
    supplierB: await supplier(adminB, "Importaciones Sur"),
    productA: await insertProduct(orgA, "CAF-1"),
    productA2: await insertProduct(orgA, "CAF-2"),
    inactiveA: await insertProduct(orgA, "VIEJO", false),
    productB: await insertProduct(orgB, "CAF-1"),
  };
}

type Seed = Awaited<ReturnType<typeof seed>>;

const free = (
  productId: string,
  quantity = "2",
  unitCost = "1500,50",
): GoodsReceiptLineInput => ({ productId, quantity, unitCost });

const fromOrder = (
  purchaseOrderLineId: string,
  quantity: string,
  unitCost = "1500,50",
): GoodsReceiptLineInput => ({
  purchaseOrderLineId,
  productId: "",
  quantity,
  unitCost,
});

function withoutOrder(
  s: Seed,
  lines: GoodsReceiptLineInput[],
  extra: Partial<GoodsReceiptInput> = {},
): GoodsReceiptInput {
  return {
    purchaseOrderId: null,
    supplierId: s.supplierA,
    currency: "ARS",
    supplierReference: "",
    lines,
    ...extra,
  };
}

function withOrder(
  orderId: string,
  lines: GoodsReceiptLineInput[],
  supplierReference = "",
): GoodsReceiptInput {
  // El proveedor y la moneda de la entrada no se miran con orden.
  return {
    purchaseOrderId: orderId,
    supplierId: "",
    currency: "",
    supplierReference,
    lines,
  };
}

async function receive(context: AuthContext, input: GoodsReceiptInput) {
  const result = await createGoodsReceipt(context, input);
  if (!result.ok)
    throw new Error(`recepción rechazada: ${JSON.stringify(result)}`);
  return result;
}

// Una orden de CAF-1 × 10 y CAF-2 × 4, con sus ids de línea.
async function order(s: Seed, currency = "ARS") {
  const created = await createPurchaseOrder(s.adminA, {
    supplierId: s.supplierA,
    currency,
    lines: [
      { productId: s.productA, quantity: "10", unitCost: "100" },
      { productId: s.productA2, quantity: "4", unitCost: "50" },
    ],
  });
  if (!created.ok) throw new Error(`orden rechazada: ${created.code}`);
  const detail = await getPurchaseOrder(s.adminA, created.order.id);
  if (!detail.ok) throw new Error("orden no encontrada");
  return {
    id: created.order.id,
    lineA: detail.order.lines[0]!.id,
    lineA2: detail.order.lines[1]!.id,
  };
}

async function setCost(
  s: Seed,
  productId: string,
  amount: string,
  currency = "ARS",
) {
  await getDb().execute(
    sql`insert into product_costs (organization_id, product_id, amount, currency, created_by)
        values (${s.orgA}, ${productId}, ${amount}, ${currency}, ${s.adminUserA})`,
  );
}

async function currentCost(productId: string) {
  const result = await getDb().execute<{ amount: string; currency: string }>(
    sql`select amount, currency from product_costs where product_id = ${productId}
        order by created_at desc, id desc limit 1`,
  );
  return result.rows[0] ?? null;
}

// Todo lo que una recepción escribe, para comprobar que un rechazo no escribe, no audita, no mueve
// stock, no cambia costos ni consume número (D-10).
async function snapshot() {
  const result = await getDb().execute(
    sql`select
          (select count(*)::int from goods_receipts) as receipts,
          (select count(*)::int from goods_receipt_lines) as lines,
          (select count(*)::int from inventory_movements) as movements,
          (select coalesce(string_agg(product_id || '|' || quantity_on_hand || '|' || quantity_reserved,
                    ',' order by product_id), '') from inventories) as balances,
          (select count(*)::int from product_costs) as costs,
          (select count(*)::int from audit_logs) as audits,
          (select coalesce(string_agg(number || '|' || status::text, ',' order by id), '')
             from purchase_orders) as orders,
          (select coalesce(string_agg(organization_id || '|' || last_number, ','
                    order by organization_id), '')
             from document_counters where kind = 'goods_receipt') as counters`,
  );
  return result.rows[0]!;
}

async function audits(entityType: string) {
  const result = await getDb().execute<{
    action: string;
    entity_id: string;
    diff: {
      before: Record<string, unknown> | null;
      after: Record<string, unknown>;
    };
  }>(
    sql`select action, entity_id, diff from audit_logs
        where entity_type = ${entityType} order by created_at, id`,
  );
  return result.rows;
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

beforeEach(async () => {
  await resetDatabase(getDb());
  storedHash ??= await hashPassword(PASSWORD);
});

afterEach(async () => {
  await Promise.all(heldLocks.splice(0).map((releaseLock) => releaseLock()));
  // El invariante de las unidades, después de cada test (brief-29.5, D-8). Esta suite arma saldos con SQL directo, sin
  // movimiento, así que la suma de los movimientos no se compara: la comparan units.test.ts y
  // orders-cycle.test.ts.
  await expectStockInvariant({ movements: false });
});

afterAll(async () => {
  await getDb().$client.end();
});

describe("la recepción sin orden (AC-2 a AC-4)", () => {
  it(
    "escribe la cabecera, las líneas, el número RC, los movimientos, los costos y la auditoría",
    async () => {
      const s = await seed();
      // CAF-1 ya tiene 5 en stock y 2 reservados; CAF-2 no tiene fila de saldo.
      await getDb().execute(
        sql`insert into inventories (organization_id, product_id, quantity_on_hand, quantity_reserved)
            values (${s.orgA}, ${s.productA}, 5, 2)`,
      );
      await setCost(s, s.productA, "1000.00");
      const result = await receive(
        s.adminA,
        withoutOrder(
          s,
          [free(s.productA, "2", "1200"), free(s.productA2, "1,5", "0,99")],
          { supplierReference: "  R 0001-00012345  " },
        ),
      );
      expect(result).toMatchObject({
        receipt: { number: 1, displayNumber: "RC-000001" },
        closedOrder: false,
      });
      const id = result.receipt.id;

      const header = await getDb().execute(
        sql`select number, supplier_id, purchase_order_id, currency, total, supplier_reference,
                   created_by
            from goods_receipts where id = ${id}`,
      );
      expect(header.rows).toEqual([
        {
          number: "1",
          supplier_id: s.supplierA,
          purchase_order_id: null,
          currency: "ARS",
          // 2 × 1200 = 2400,00 y 1,5 × 0,99 = 1,485 → 1,49.
          total: "2401.49",
          supplier_reference: "R 0001-00012345",
          created_by: s.adminUserA,
        },
      ]);
      const lines = await getDb().execute(
        sql`select position, purchase_order_line_id, product_id, quantity, unit_cost, line_total
            from goods_receipt_lines where goods_receipt_id = ${id} order by position`,
      );
      expect(lines.rows).toEqual([
        {
          position: 1,
          purchase_order_line_id: null,
          product_id: s.productA,
          quantity: "2.000",
          unit_cost: "1200.00",
          line_total: "2400.00",
        },
        {
          position: 2,
          purchase_order_line_id: null,
          product_id: s.productA2,
          quantity: "1.500",
          unit_cost: "0.99",
          line_total: "1.49",
        },
      ]);

      // El stock: cada línea suma su cantidad con un movimiento que nombra la recepción y no el
      // proveedor; lo reservado no cambia, y el saldo que faltaba nace en 0 (AC-2).
      const movements = await getDb().execute(
        sql`select product_id, type, quantity, balance_after, reason, created_by
            from inventory_movements order by product_id`,
      );
      expect(movements.rows).toEqual(
        [
          {
            product_id: s.productA,
            type: "goods_receipt",
            quantity: "2.000",
            balance_after: "7.000",
            reason: "Recepción RC-000001",
            created_by: s.adminUserA,
          },
          {
            product_id: s.productA2,
            type: "goods_receipt",
            quantity: "1.500",
            balance_after: "1.500",
            reason: "Recepción RC-000001",
            created_by: s.adminUserA,
          },
        ].sort((a, b) => (a.product_id < b.product_id ? -1 : 1)),
      );
      const balances = await getDb().execute(
        sql`select product_id, quantity_on_hand, quantity_reserved from inventories
            order by product_id`,
      );
      expect(balances.rows).toEqual(
        [
          {
            product_id: s.productA,
            quantity_on_hand: "7.000",
            quantity_reserved: "2.000",
          },
          {
            product_id: s.productA2,
            quantity_on_hand: "1.500",
            quantity_reserved: "0.000",
          },
        ].sort((a, b) => (a.product_id < b.product_id ? -1 : 1)),
      );

      // El costo: el último recibido queda vigente, con el origen en la auditoría (AC-3; D-6).
      expect(await currentCost(s.productA)).toEqual({
        amount: "1200.00",
        currency: "ARS",
      });
      expect(await currentCost(s.productA2)).toEqual({
        amount: "0.99",
        currency: "ARS",
      });
      const costAudits = (await audits("product")).filter(
        (audit) => audit.action === "cost_change",
      );
      expect(costAudits).toEqual(
        expect.arrayContaining([
          {
            action: "cost_change",
            entity_id: s.productA,
            diff: {
              before: {
                amount: "1000.00",
                currency: "ARS",
                source: "goods_receipt",
                goods_receipt_number: "RC-000001",
              },
              after: {
                amount: "1200.00",
                currency: "ARS",
                source: "goods_receipt",
                goods_receipt_number: "RC-000001",
              },
            },
          },
          {
            action: "cost_change",
            entity_id: s.productA2,
            diff: {
              before: {
                amount: null,
                currency: null,
                source: "goods_receipt",
                goods_receipt_number: "RC-000001",
              },
              after: {
                amount: "0.99",
                currency: "ARS",
                source: "goods_receipt",
                goods_receipt_number: "RC-000001",
              },
            },
          },
        ]),
      );
      expect(costAudits).toHaveLength(2);

      // La auditoría de la recepción: ids, cantidades, montos y la referencia; ningún dato del
      // proveedor (D-6).
      expect(await audits("goods_receipt")).toEqual([
        {
          action: "create",
          entity_id: id,
          diff: {
            before: null,
            after: {
              number: 1,
              supplier_id: s.supplierA,
              purchase_order_number: null,
              currency: "ARS",
              total: "2401.49",
              supplier_reference: "R 0001-00012345",
              lines: 2,
              line_1_product_id: s.productA,
              line_1_quantity: "2.000",
              line_1_unit_cost: "1200.00",
              line_1_total: "2400.00",
              line_2_product_id: s.productA2,
              line_2_quantity: "1.500",
              line_2_unit_cost: "0.99",
              line_2_total: "1.49",
            },
          },
        },
      ]);
      const counter = await getDb().execute<{ last_number: string }>(
        sql`select last_number from document_counters
            where organization_id = ${s.orgA} and kind = 'goods_receipt'`,
      );
      expect(counter.rows[0]!.last_number).toBe("1");
    },
    TEST_TIMEOUT,
  );

  it(
    "con el mismo costo y la misma moneda no escribe el costo; con otra moneda, sí",
    async () => {
      const s = await seed();
      await setCost(s, s.productA, "1200.00");
      await setCost(s, s.productA2, "1200.00");
      await receive(s.adminA, withoutOrder(s, [free(s.productA, "1", "1200")]));
      await receive(
        s.adminA,
        withoutOrder(s, [free(s.productA2, "1", "1200")], { currency: "USD" }),
      );
      expect(await currentCost(s.productA)).toEqual({
        amount: "1200.00",
        currency: "ARS",
      });
      expect(await currentCost(s.productA2)).toEqual({
        amount: "1200.00",
        currency: "USD",
      });
      const costs = await getDb().execute<{ product_id: string; n: number }>(
        sql`select product_id, count(*)::int as n from product_costs group by product_id`,
      );
      expect(
        Object.fromEntries(costs.rows.map((row) => [row.product_id, row.n])),
      ).toEqual({ [s.productA]: 1, [s.productA2]: 2 });
      const costAudits = (await audits("product")).filter(
        (audit) => audit.action === "cost_change",
      );
      expect(costAudits.map((audit) => audit.entity_id)).toEqual([s.productA2]);
    },
    TEST_TIMEOUT,
  );
});

describe("la recepción con orden y el cierre de la orden (AC-4; D-7 y D-9)", () => {
  it(
    "una recepción parcial deja la orden abierta, y la que completa la orden la cierra",
    async () => {
      const s = await seed();
      const o = await order(s);
      // La primera completa el té y no toca el café: todas sus líneas quedan sin faltante, pero la
      // orden sigue abierta. El cierre mira todas las líneas de la orden, no solo las de esta
      // recepción.
      const first = await receive(
        s.adminA,
        withOrder(o.id, [fromOrder(o.lineA2, "4", "50")], "REM-1"),
      );
      expect(first.closedOrder).toBe(false);
      const header = await getDb().execute(
        sql`select supplier_id, purchase_order_id, currency from goods_receipts
            where id = ${first.receipt.id}`,
      );
      expect(header.rows).toEqual([
        { supplier_id: s.supplierA, purchase_order_id: o.id, currency: "ARS" },
      ]);

      let detail = await getPurchaseOrder(s.adminA, o.id);
      if (!detail.ok) throw new Error("orden no encontrada");
      expect(detail.order.status).toBe("open");
      expect(
        detail.order.lines.map(({ quantity, received, pending }) => ({
          quantity,
          received,
          pending,
        })),
      ).toEqual([
        { quantity: "10.000", received: "0.000", pending: "10.000" },
        { quantity: "4.000", received: "4.000", pending: "0.000" },
      ]);
      expect(detail.order.receipts.map((r) => r.displayNumber)).toEqual([
        "RC-000001",
      ]);

      const second = await receive(
        s.adminA,
        withOrder(o.id, [fromOrder(o.lineA, "10", "110")]),
      );
      expect(second).toMatchObject({
        receipt: { displayNumber: "RC-000002" },
        closedOrder: true,
      });
      detail = await getPurchaseOrder(s.adminA, o.id);
      if (!detail.ok) throw new Error("orden no encontrada");
      expect(detail.order.status).toBe("closed");
      expect(detail.order.closedAt).not.toBeNull();
      expect(detail.order.lines.map((line) => line.pending)).toEqual([
        "0.000",
        "0.000",
      ]);
      expect(detail.order.receipts.map((r) => r.displayNumber)).toEqual([
        "RC-000002",
        "RC-000001",
      ]);

      const orderAudits = (await audits("purchase_order")).filter(
        (audit) => audit.action === "status_change",
      );
      expect(orderAudits).toEqual([
        {
          action: "status_change",
          entity_id: o.id,
          diff: {
            before: {
              status: "open",
              closed_by: "goods_receipt",
              goods_receipt_number: "RC-000002",
            },
            after: {
              status: "closed",
              closed_by: "goods_receipt",
              goods_receipt_number: "RC-000002",
            },
          },
        },
      ]);
      const receiptAudit = (await audits("goods_receipt"))[0]!;
      expect(receiptAudit.diff.after).toMatchObject({
        purchase_order_number: "OC-000001",
        supplier_reference: "REM-1",
      });
      const lines = await getDb().execute<{
        goods_receipt_id: string;
        purchase_order_line_id: string;
      }>(
        sql`select l.goods_receipt_id, l.purchase_order_line_id
            from goods_receipt_lines l join goods_receipts r on r.id = l.goods_receipt_id
            order by r.number, l.position`,
      );
      expect(lines.rows).toEqual([
        {
          goods_receipt_id: first.receipt.id,
          purchase_order_line_id: o.lineA2,
        },
        {
          goods_receipt_id: second.receipt.id,
          purchase_order_line_id: o.lineA,
        },
      ]);
    },
    TEST_TIMEOUT,
  );

  it(
    "una recepción sin orden, del mismo proveedor y la misma moneda, no cuenta para la orden ni la cierra",
    async () => {
      const s = await seed();
      const o = await order(s);
      await receive(
        s.adminA,
        withoutOrder(s, [free(s.productA, "10"), free(s.productA2, "4")]),
      );
      const detail = await getPurchaseOrder(s.adminA, o.id);
      if (!detail.ok) throw new Error("orden no encontrada");
      expect(detail.order.status).toBe("open");
      expect(detail.order.lines.map((line) => line.received)).toEqual([
        "0.000",
        "0.000",
      ]);
    },
    TEST_TIMEOUT,
  );

  it(
    "el cierre a mano exige alguna recepción, y la cancelación rechaza una orden con recepciones",
    async () => {
      const s = await seed();
      const o = await order(s);
      const before = await snapshot();
      expect(await closePurchaseOrder(s.adminA, o.id)).toEqual({
        ok: false,
        code: "BUSINESS_RULE_VIOLATION",
        rule: "no_receipts",
      });
      expect(await snapshot()).toEqual(before);

      await receive(s.adminA, withOrder(o.id, [fromOrder(o.lineA, "1")]));
      const afterReceipt = await snapshot();
      expect(await cancelPurchaseOrder(s.adminA, o.id)).toEqual({
        ok: false,
        code: "BUSINESS_RULE_VIOLATION",
        rule: "has_receipts",
      });
      expect(await snapshot()).toEqual(afterReceipt);

      expect(await closePurchaseOrder(s.adminA, o.id)).toEqual({ ok: true });
      const detail = await getPurchaseOrder(s.adminA, o.id);
      if (!detail.ok) throw new Error("orden no encontrada");
      expect(detail.order.status).toBe("closed");
      expect(
        (await audits("purchase_order")).filter(
          (audit) => audit.action === "status_change",
        ),
      ).toEqual([
        {
          action: "status_change",
          entity_id: o.id,
          diff: {
            before: { status: "open", closed_by: "manual" },
            after: { status: "closed", closed_by: "manual" },
          },
        },
      ]);
      // Cerrada, no se cierra otra vez ni recibe.
      expect(await closePurchaseOrder(s.adminA, o.id)).toEqual({
        ok: false,
        code: "BUSINESS_RULE_VIOLATION",
        rule: "not_open",
        status: "closed",
      });
      expect(
        await createGoodsReceipt(
          s.adminA,
          withOrder(o.id, [fromOrder(o.lineA, "1")]),
        ),
      ).toEqual({
        ok: false,
        code: "BUSINESS_RULE_VIOLATION",
        rule: "order_not_open",
        status: "closed",
      });
      // Una orden sin recepciones se sigue cancelando.
      const other = await order(s);
      expect(await cancelPurchaseOrder(s.adminA, other.id)).toEqual({
        ok: true,
      });
    },
    TEST_TIMEOUT,
  );
});

describe("las lecturas (AC-4; D-11 y D-12)", () => {
  it(
    "la lista filtra por proveedor, busca por número y pagina; el detalle y la historia",
    async () => {
      const s = await seed();
      const o = await order(s);
      await receive(s.adminA, withOrder(o.id, [fromOrder(o.lineA, "1")]));
      for (let index = 0; index < GOODS_RECEIPTS_PAGE_SIZE; index++) {
        await receive(
          s.adminA,
          withoutOrder(s, [free(s.productA, "1", "100")], {
            supplierId: s.supplierA2,
          }),
        );
      }
      const all = await listGoodsReceipts(s.adminA, {
        supplierId: null,
        number: "",
        page: 2,
      });
      expect(all).toMatchObject({ ok: true, total: 26, page: 2, pageCount: 2 });
      if (!all.ok) throw new Error("lista rechazada");
      // La más nueva primero: la página 2 tiene la primera, que es la de la orden.
      expect(all.receipts.map((r) => r.displayNumber)).toEqual(["RC-000001"]);
      expect(all.receipts[0]).toMatchObject({
        supplierName: "Importaciones Sur",
        purchaseOrderId: o.id,
        purchaseOrderDisplayNumber: "OC-000001",
        lineCount: 1,
        currency: "ARS",
      });

      const bySupplier = await listGoodsReceipts(s.adminA, {
        supplierId: s.supplierA,
        number: "",
        page: 1,
      });
      expect(bySupplier).toMatchObject({ total: 1 });
      for (const number of ["RC-000007", "rc7", "7", "000007"]) {
        const found = await listGoodsReceipts(s.adminA, {
          supplierId: null,
          number,
          page: 1,
        });
        if (!found.ok) throw new Error("lista rechazada");
        expect(found.receipts.map((r) => r.displayNumber)).toEqual([
          "RC-000007",
        ]);
      }
      expect(
        await listGoodsReceipts(s.adminA, {
          supplierId: null,
          number: "OC-7",
          page: 1,
        }),
      ).toMatchObject({ total: 0, receipts: [] });

      const recent = await listRecentSupplierGoodsReceipts(
        s.adminA,
        s.supplierA2,
      );
      expect(recent).toMatchObject({ ok: true, total: 25 });
      if (!recent.ok) throw new Error("lista rechazada");
      expect(recent.receipts).toHaveLength(5);

      const first = all.receipts[0]!;
      const detail = await getGoodsReceipt(s.adminA, first.id);
      expect(detail).toMatchObject({
        ok: true,
        receipt: {
          displayNumber: "RC-000001",
          supplier: { name: "Importaciones Sur", cuit: "20123456786" },
          purchaseOrder: { id: o.id, displayNumber: "OC-000001" },
          currency: "ARS",
          supplierReference: null,
          lines: [
            {
              position: 1,
              productId: s.productA,
              product: { name: "Producto CAF-1", sku: "CAF-1" },
              quantity: "1.000",
              unitCost: "1500.50",
              lineTotal: "1500.50",
            },
          ],
        },
      });
      const history = await listGoodsReceiptAudit(s.adminA, first.id, 1);
      expect(history).toMatchObject({
        ok: true,
        total: 1,
        entries: [{ action: "create", actor: { name: "Ana" } }],
      });
    },
    TEST_TIMEOUT,
  );
});

describe("los rechazos (AC-6; D-10)", () => {
  it(
    "un viewer recibe FORBIDDEN en cada lectura y escritura",
    async () => {
      const s = await seed();
      const o = await order(s);
      const created = await receive(
        s.adminA,
        withOrder(o.id, [fromOrder(o.lineA, "1")]),
      );
      const before = await snapshot();
      const forbidden = { ok: false, code: "FORBIDDEN" };
      expect(
        await createGoodsReceipt(
          s.viewerA,
          withoutOrder(s, [free(s.productA)]),
        ),
      ).toEqual(forbidden);
      expect(await closePurchaseOrder(s.viewerA, o.id)).toEqual(forbidden);
      expect(
        await listGoodsReceipts(s.viewerA, {
          supplierId: null,
          number: "",
          page: 1,
        }),
      ).toEqual(forbidden);
      expect(
        await listRecentSupplierGoodsReceipts(s.viewerA, s.supplierA),
      ).toEqual(forbidden);
      expect(await getGoodsReceipt(s.viewerA, created.receipt.id)).toEqual(
        forbidden,
      );
      expect(
        await listGoodsReceiptAudit(s.viewerA, created.receipt.id, 1),
      ).toEqual(forbidden);
      expect(await snapshot()).toEqual(before);
    },
    TEST_TIMEOUT,
  );

  it(
    "los datos que no se leen responden VALIDATION_ERROR sin escribir nada",
    async () => {
      const s = await seed();
      const o = await order(s);
      const before = await snapshot();
      const invalid = (reason: string, lines: unknown[] = []) => ({
        ok: false,
        code: "VALIDATION_ERROR",
        reason,
        lines,
      });
      const cases: [GoodsReceiptInput, unknown][] = [
        [
          withoutOrder(s, [free(s.productA)], {
            purchaseOrderId: "no-es-uuid",
          }),
          invalid("purchase_order"),
        ],
        [
          withoutOrder(s, [free(s.productA)], { supplierId: "x" }),
          invalid("supplier"),
        ],
        [
          withoutOrder(s, [free(s.productA)], { currency: "XXX" }),
          invalid("currency"),
        ],
        [
          withoutOrder(s, [free(s.productA)], { supplierReference: "R#1" }),
          invalid("supplier_reference"),
        ],
        [
          withoutOrder(s, [free(s.productA)], {
            supplierReference: "A".repeat(41),
          }),
          invalid("supplier_reference"),
        ],
        [withoutOrder(s, []), invalid("no_lines")],
        [
          withoutOrder(
            s,
            Array.from({ length: 51 }, () => free(s.productA)),
          ),
          invalid("too_many_lines"),
        ],
        [
          withoutOrder(s, [free(s.productA, "0"), free(s.productA2, "1", "")]),
          invalid("lines", [
            { position: 1, field: "quantity" },
            { position: 2, field: "unitCost", reason: "invalid" },
          ]),
        ],
        [
          withOrder(o.id, [fromOrder("no-es-uuid", "1")]),
          invalid("lines", [{ position: 1, field: "product" }]),
        ],
      ];
      for (const [input, expected] of cases) {
        expect(await createGoodsReceipt(s.adminA, input)).toEqual(expected);
      }
      expect(await snapshot()).toEqual(before);
    },
    TEST_TIMEOUT,
  );

  it(
    "lo que no existe en la organización responde NOT_FOUND sin escribir nada",
    async () => {
      const s = await seed();
      const o = await order(s);
      const otherOrder = await createPurchaseOrder(s.adminB, {
        supplierId: s.supplierB,
        currency: "ARS",
        lines: [{ productId: s.productB, quantity: "1", unitCost: "1" }],
      });
      if (!otherOrder.ok) throw new Error("orden rechazada");
      const otherDetail = await getPurchaseOrder(s.adminB, otherOrder.order.id);
      if (!otherDetail.ok) throw new Error("orden no encontrada");
      const before = await snapshot();
      expect(
        await createGoodsReceipt(
          s.adminA,
          withoutOrder(s, [free(s.productA)], { supplierId: s.supplierB }),
        ),
      ).toEqual({ ok: false, code: "NOT_FOUND", target: "supplier" });
      expect(
        await createGoodsReceipt(
          s.adminA,
          withOrder(otherOrder.order.id, [fromOrder(o.lineA, "1")]),
        ),
      ).toEqual({ ok: false, code: "NOT_FOUND", target: "purchase_order" });
      expect(
        await createGoodsReceipt(
          s.adminA,
          withoutOrder(s, [free(s.productA), free(s.productB)]),
        ),
      ).toEqual({
        ok: false,
        code: "NOT_FOUND",
        target: "products",
        lines: [{ position: 2, productId: s.productB }],
      });
      // Una línea de otra orden, aunque sea de la misma organización, no es de esta.
      const o2 = await order(s);
      const afterSecondOrder = await snapshot();
      expect(
        await createGoodsReceipt(
          s.adminA,
          withOrder(o.id, [
            fromOrder(o.lineA, "1"),
            fromOrder(o2.lineA2, "1"),
            fromOrder(otherDetail.order.lines[0]!.id, "1"),
          ]),
        ),
      ).toEqual({
        ok: false,
        code: "NOT_FOUND",
        target: "order_lines",
        lines: [
          { position: 2, productId: "" },
          { position: 3, productId: "" },
        ],
      });
      expect(await snapshot()).toEqual(afterSecondOrder);
      expect(before.receipts).toBe(0);
    },
    TEST_TIMEOUT,
  );

  it(
    "las reglas de negocio responden BUSINESS_RULE_VIOLATION sin escribir nada",
    async () => {
      const s = await seed();
      const o = await order(s);
      await receive(s.adminA, withOrder(o.id, [fromOrder(o.lineA, "7")]));
      const inactiveSupplier = await supplier(s.adminA, "Cerrado", false);
      await getDb().execute(
        sql`update suppliers set is_active = false where id = ${inactiveSupplier}`,
      );
      // CAF-2 en el máximo de numeric(14, 3): una unidad más no cabe.
      await getDb().execute(
        sql`insert into inventories (organization_id, product_id, quantity_on_hand)
            values (${s.orgA}, ${s.productA2}, 99999999999.999)`,
      );
      // Un producto sin saldo: bloquear los saldos crea su fila en 0, y el rechazo la revierte.
      const noBalance = await insertProduct(s.orgA, "CAF-3");
      const before = await snapshot();
      const rule = (body: Record<string, unknown>) => ({
        ok: false,
        code: "BUSINESS_RULE_VIOLATION",
        ...body,
      });
      const cases: [GoodsReceiptInput, unknown][] = [
        [
          withoutOrder(s, [free(s.productA)], { supplierId: inactiveSupplier }),
          rule({ rule: "inactive_supplier" }),
        ],
        [
          withoutOrder(s, [free(s.productA), free(s.productA)]),
          rule({
            rule: "line_rules",
            lines: [
              { position: 2, productId: s.productA, rule: "duplicate_product" },
            ],
          }),
        ],
        [
          withoutOrder(s, [free(s.inactiveA)]),
          rule({
            rule: "line_rules",
            lines: [
              { position: 1, productId: s.inactiveA, rule: "inactive_product" },
            ],
          }),
        ],
        [
          withoutOrder(s, [free(s.productA, "0,001", "1")]),
          rule({
            rule: "line_rules",
            lines: [{ position: 1, productId: s.productA, rule: "zero_total" }],
          }),
        ],
        [
          withOrder(o.id, [
            fromOrder(o.lineA, "3,001"),
            fromOrder(o.lineA2, "5"),
          ]),
          rule({
            rule: "line_rules",
            lines: [
              {
                position: 1,
                productId: s.productA,
                rule: "exceeds_pending",
                pending: "3.000",
              },
              {
                position: 2,
                productId: s.productA2,
                rule: "exceeds_pending",
                pending: "4.000",
              },
            ],
          }),
        ],
        [
          withoutOrder(s, [
            free(noBalance),
            free(s.productA),
            free(s.productA2, "1", "1"),
          ]),
          rule({ rule: "stock_limit", productIds: [s.productA2] }),
        ],
      ];
      for (const [input, expected] of cases) {
        expect(await createGoodsReceipt(s.adminA, input)).toEqual(expected);
      }
      expect(await snapshot()).toEqual(before);
    },
    TEST_TIMEOUT,
  );
});

describe("la serialización (AC-5; D-8)", () => {
  const lockOrder = (id: string) =>
    sql`select id from purchase_orders where id = ${id} for update`;

  it(
    "dos recepciones de la misma orden que juntas pasan lo que falta: una entra y la otra responde exceeds_pending",
    async () => {
      const s = await seed();
      const o = await order(s);
      const release = await hold(lockOrder(o.id));
      const first = createGoodsReceipt(
        s.adminA,
        withOrder(o.id, [fromOrder(o.lineA, "6")]),
      );
      await waitForLockWaiters(1);
      const second = createGoodsReceipt(
        s.adminA,
        withOrder(o.id, [fromOrder(o.lineA, "6")]),
      );
      await waitForLockWaiters(2);
      await release();
      const results = await Promise.all([first, second]);
      expect(results.filter((result) => result.ok)).toHaveLength(1);
      expect(results.find((result) => !result.ok)).toEqual({
        ok: false,
        code: "BUSINESS_RULE_VIOLATION",
        rule: "line_rules",
        lines: [
          {
            position: 1,
            productId: s.productA,
            rule: "exceeds_pending",
            pending: "4.000",
          },
        ],
      });
      const received = await getDb().execute<{ total: string }>(
        sql`select sum(quantity)::text as total from goods_receipt_lines`,
      );
      expect(received.rows[0]!.total).toBe("6.000");
    },
    TEST_TIMEOUT,
  );

  it(
    "una cancelación contra una recepción: la que llega segunda ve a la otra",
    async () => {
      const s = await seed();
      const o = await order(s);
      const release = await hold(lockOrder(o.id));
      const receiving = createGoodsReceipt(
        s.adminA,
        withOrder(o.id, [fromOrder(o.lineA, "1")]),
      );
      await waitForLockWaiters(1);
      const cancelling = cancelPurchaseOrder(s.adminA, o.id);
      await waitForLockWaiters(2);
      await release();
      const [received, cancelled] = await Promise.all([receiving, cancelling]);
      const receiptFirst =
        received.ok &&
        cancelled.ok === false &&
        "rule" in cancelled &&
        cancelled.rule === "has_receipts";
      const cancelFirst =
        cancelled.ok &&
        !received.ok &&
        "rule" in received &&
        received.rule === "order_not_open";
      expect(
        receiptFirst || cancelFirst,
        JSON.stringify([received, cancelled]),
      ).toBe(true);
    },
    TEST_TIMEOUT,
  );

  it(
    "una desactivación del proveedor en curso: la recepción espera y responde inactive_supplier",
    async () => {
      const s = await seed();
      const before = await snapshot();
      const release = await hold(
        sql`select id from suppliers where id = ${s.supplierA} for update`,
        sql`update suppliers set is_active = false where id = ${s.supplierA}`,
      );
      const receiving = createGoodsReceipt(
        s.adminA,
        withoutOrder(s, [free(s.productA)]),
      );
      await waitForLockWaiters(1);
      await release();
      expect(await receiving).toEqual({
        ok: false,
        code: "BUSINESS_RULE_VIOLATION",
        rule: "inactive_supplier",
      });
      expect(await snapshot()).toEqual(before);
    },
    TEST_TIMEOUT,
  );

  it(
    "una desactivación de un producto en curso: la recepción espera y responde inactive_product",
    async () => {
      const s = await seed();
      const before = await snapshot();
      const release = await hold(
        sql`select id from products where id = ${s.productA2} for update`,
        sql`update products set is_active = false where id = ${s.productA2}`,
      );
      const receiving = createGoodsReceipt(
        s.adminA,
        withoutOrder(s, [free(s.productA), free(s.productA2)]),
      );
      await waitForLockWaiters(1);
      await release();
      expect(await receiving).toEqual({
        ok: false,
        code: "BUSINESS_RULE_VIOLATION",
        rule: "line_rules",
        lines: [
          { position: 2, productId: s.productA2, rule: "inactive_product" },
        ],
      });
      expect(await snapshot()).toEqual(before);
    },
    TEST_TIMEOUT,
  );

  // H-2: las dos toman el producto en modo compartido y las ordena el saldo. La segunda lee el costo
  // después de su bloqueo, ve el de la primera y escribe el suyo. Si leyera el costo antes de la
  // entrada de stock, vería el original, igual al suyo, no escribiría y quedaría vigente el de la
  // primera, que no es el último recibido.
  it(
    "dos recepciones del mismo producto con costos distintos: queda el de la que confirmó última",
    async () => {
      const s = await seed();
      await setCost(s, s.productA, "1000.00");
      await getDb().execute(
        sql`insert into inventories (organization_id, product_id, quantity_on_hand)
            values (${s.orgA}, ${s.productA}, 0)`,
      );
      const release = await hold(
        sql`select product_id from inventories where product_id = ${s.productA} for update`,
      );
      const first = createGoodsReceipt(
        s.adminA,
        withoutOrder(s, [free(s.productA, "1", "1200")]),
      );
      await waitForLockWaiters(1);
      const second = createGoodsReceipt(
        s.adminA,
        withoutOrder(s, [free(s.productA, "1", "1000")]),
      );
      await waitForLockWaiters(2);
      await release();
      const [firstResult, secondResult] = await Promise.all([first, second]);
      expect(firstResult).toMatchObject({
        ok: true,
        receipt: { number: 1 },
      });
      expect(secondResult).toMatchObject({
        ok: true,
        receipt: { number: 2 },
      });
      expect(await currentCost(s.productA)).toEqual({
        amount: "1000.00",
        currency: "ARS",
      });
      const history = await getDb().execute<{ amount: string }>(
        sql`select amount from product_costs where product_id = ${s.productA}
            order by created_at, id`,
      );
      expect(history.rows.map((row) => row.amount)).toEqual([
        "1000.00",
        "1200.00",
        "1000.00",
      ]);
    },
    TEST_TIMEOUT,
  );

  // El contador se toma al armar el motivo, después de los bloqueos (ADR 0023, punto 10): una
  // recepción que espera a su proveedor no retiene el número.
  it(
    "una recepción que espera a su proveedor no frena el número de otra",
    async () => {
      const s = await seed();
      const release = await hold(
        sql`select id from suppliers where id = ${s.supplierA} for update`,
      );
      const waiting = createGoodsReceipt(
        s.adminA,
        withoutOrder(s, [free(s.productA)]),
      );
      await waitForLockWaiters(1);
      const other = await Promise.race([
        receive(
          s.adminA,
          withoutOrder(s, [free(s.productA2)], { supplierId: s.supplierA2 }),
        ),
        new Promise<"bloqueada">((resolve) =>
          setTimeout(() => resolve("bloqueada"), 3000),
        ),
      ]);
      expect(other).toMatchObject({ receipt: { number: 1 } });
      await release();
      expect(await waiting).toMatchObject({ ok: true, receipt: { number: 2 } });
    },
    TEST_TIMEOUT,
  );
});

describe("el rendimiento (AC-8; D-12)", () => {
  // El umbral de 754 ms es el de la lista de clientes de la 13.2, que la 22.2 y la 22.3 también usaron.
  const THRESHOLD_MS = 754;

  it(
    "la lista con 2.000 recepciones y el detalle de una orden de 50 líneas con 100 recepciones quedan bajo el umbral",
    async () => {
      const s = await seed();
      await getDb().execute(
        sql`insert into suppliers (organization_id, name)
            select ${s.orgA}, 'Proveedor ' || lpad(n::text, 2, '0')
            from generate_series(1, 20) as n`,
      );
      await getDb().execute(
        sql`insert into goods_receipts (organization_id, number, supplier_id, currency, total,
                                        created_by)
            select ${s.orgA}, n,
                   (select id from suppliers where organization_id = ${s.orgA}
                    order by name offset (n % 20) limit 1),
                   'ARS', 100, ${s.adminUserA}
            from generate_series(1, 2000) as n`,
      );
      await getDb().execute(
        sql`insert into goods_receipt_lines (organization_id, goods_receipt_id, product_id,
                                             position, quantity, unit_cost, line_total)
            select ${s.orgA}::uuid, id, ${s.productA}::uuid, 1, 1, 100, 100 from goods_receipts`,
      );

      // Una orden de 50 líneas con 100 recepciones de una línea cada una, numeradas desde 2.001.
      const products = await getDb().execute<{ id: string }>(
        sql`insert into products (organization_id, sku, name)
            select ${s.orgA}, 'P-' || n, 'Producto ' || n from generate_series(1, 50) as n
            returning id`,
      );
      const big = await createPurchaseOrder(s.adminA, {
        supplierId: s.supplierA,
        currency: "ARS",
        lines: products.rows.map((product) => ({
          productId: product.id,
          quantity: "1000",
          unitCost: "1",
        })),
      });
      if (!big.ok) throw new Error("orden rechazada");
      await getDb().execute(
        sql`insert into goods_receipts (organization_id, number, supplier_id, purchase_order_id,
                                        currency, total, created_by)
            select ${s.orgA}, 2000 + n, ${s.supplierA}, ${big.order.id}, 'ARS', 1,
                   ${s.adminUserA}
            from generate_series(1, 100) as n`,
      );
      await getDb().execute(
        sql`insert into goods_receipt_lines (organization_id, goods_receipt_id,
                                             purchase_order_line_id, product_id, position,
                                             quantity, unit_cost, line_total)
            select ${s.orgA}::uuid, r.id, l.id, l.product_id, 1, 1, 1, 1
            from goods_receipts r
            join purchase_order_lines l on l.purchase_order_id = r.purchase_order_id
              and l.position = ((r.number - 2001) % 50) + 1
            where r.purchase_order_id = ${big.order.id}`,
      );
      await getDb().execute(sql`analyze goods_receipts`);
      await getDb().execute(sql`analyze goods_receipt_lines`);
      const busy = await getDb().execute<{ id: string }>(
        sql`select id from suppliers where organization_id = ${s.orgA}
            and name = 'Proveedor 07'`,
      );
      const busyId = busy.rows[0]!.id;

      const measure = async (label: string, run: () => Promise<unknown>) => {
        // Una corrida previa calienta la caché: se mide la consulta, no el primer acceso.
        await run();
        const started = performance.now();
        const result = await run();
        const elapsed = performance.now() - started;
        expect(result).toMatchObject({ ok: true });
        expect(elapsed, label).toBeLessThan(THRESHOLD_MS);
        console.info(`${label}: ${elapsed.toFixed(1)} ms`);
      };
      for (const query of [
        { supplierId: null, number: "", page: 40 },
        { supplierId: busyId, number: "", page: 3 },
        { supplierId: null, number: "RC-001234", page: 1 },
      ]) {
        await measure(`lista ${JSON.stringify(query)}`, () =>
          listGoodsReceipts(s.adminA, query),
        );
      }
      await measure("detalle de la orden de 50 líneas y 100 recepciones", () =>
        getPurchaseOrder(s.adminA, big.order.id),
      );
      const detail = await getPurchaseOrder(s.adminA, big.order.id);
      if (!detail.ok) throw new Error("orden no encontrada");
      expect(detail.order.receipts).toHaveLength(100);
      expect(detail.order.lines[0]).toMatchObject({
        received: "2.000",
        pending: "998.000",
      });
    },
    TEST_TIMEOUT,
  );
});

import { sql, type SQL } from "drizzle-orm";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { hashPassword, login } from "@/modules/auth";
import {
  getProductBalanceForService,
  removeReceivedStock,
} from "@/modules/inventory";
import { getAuthContext, type AuthContext } from "@/modules/organizations";
import {
  cancelPurchaseOrder,
  closePurchaseOrder,
  createGoodsReceipt,
  createPurchaseOrder,
  createSupplier,
  getGoodsReceipt,
  getPurchaseOrder,
  listGoodsReceiptAudit,
  listGoodsReceipts,
  listRecentSupplierGoodsReceipts,
  voidGoodsReceipt,
  type GoodsReceiptInput,
  type GoodsReceiptLineInput,
} from "@/modules/purchasing";
import { issueSale } from "@/modules/sales";
import { getDb } from "@/shared/db";
import { resetDatabase } from "./reset-database";
import { expectStockInvariant } from "./stock-invariant";

// La anulación de la recepción contra PostgreSQL real (brief-22.5): la salida de stock (AC-2), la
// operación y lo vigente en la orden (AC-3), la serialización (AC-4), los rechazos (AC-5), la
// lectura del agente (AC-11) y el rendimiento (AC-7). Los helpers son los de goods-receipts.test.ts.

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

async function insertProduct(organizationId: string, sku: string) {
  const result = await getDb().execute<{ id: string }>(
    sql`insert into products (organization_id, sku, name)
        values (${organizationId}, ${sku}, ${`Producto ${sku}`}) returning id`,
  );
  return result.rows[0]!.id;
}

async function supplier(context: AuthContext, name: string) {
  const result = await createSupplier(context, { name });
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
    supplierB: await supplier(adminB, "Importaciones Sur"),
    productA: await insertProduct(orgA, "CAF-1"),
    productA2: await insertProduct(orgA, "CAF-2"),
    productB: await insertProduct(orgB, "CAF-1"),
  };
}

type Seed = Awaited<ReturnType<typeof seed>>;

const free = (
  productId: string,
  quantity = "2",
  unitCost = "1500",
): GoodsReceiptLineInput => ({ productId, quantity, unitCost });

const fromOrder = (
  purchaseOrderLineId: string,
  quantity: string,
): GoodsReceiptLineInput => ({
  purchaseOrderLineId,
  productId: "",
  quantity,
  unitCost: "100",
});

function withoutOrder(
  s: Seed,
  lines: GoodsReceiptLineInput[],
): GoodsReceiptInput {
  return {
    purchaseOrderId: null,
    supplierId: s.supplierA,
    currency: "ARS",
    supplierReference: "",
    lines,
  };
}

function withOrder(
  orderId: string,
  lines: GoodsReceiptLineInput[],
): GoodsReceiptInput {
  return {
    purchaseOrderId: orderId,
    supplierId: "",
    currency: "",
    supplierReference: "",
    lines,
  };
}

async function receive(context: AuthContext, input: GoodsReceiptInput) {
  const result = await createGoodsReceipt(context, input);
  if (!result.ok)
    throw new Error(`recepción rechazada: ${JSON.stringify(result)}`);
  return result.receipt;
}

async function voidOk(context: AuthContext, receiptId: string, reason: string) {
  const result = await voidGoodsReceipt(context, receiptId, reason);
  if (!result.ok)
    throw new Error(`anulación rechazada: ${JSON.stringify(result)}`);
  return result;
}

// Una orden de CAF-1 × 10 y CAF-2 × 4, con sus ids de línea.
async function order(s: Seed) {
  const created = await createPurchaseOrder(s.adminA, {
    supplierId: s.supplierA,
    currency: "ARS",
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

async function orderDetail(s: Seed, orderId: string) {
  const detail = await getPurchaseOrder(s.adminA, orderId);
  if (!detail.ok) throw new Error("orden no encontrada");
  return detail.order;
}

async function balance(productId: string) {
  const result = await getDb().execute<{ on_hand: string; reserved: string }>(
    sql`select quantity_on_hand as on_hand, quantity_reserved as reserved
        from inventories where product_id = ${productId}`,
  );
  return result.rows[0] ?? null;
}

// Todo lo que una anulación escribe, para comprobar que un rechazo no escribe, no audita, no mueve
// stock ni consume número (D-6). Los saldos van enteros: una fila en 0 que quedara confirmada se ve.
async function snapshot() {
  const result = await getDb().execute(
    sql`select
          (select count(*)::int from goods_receipt_voids) as voids,
          (select count(*)::int from inventory_movements) as movements,
          (select coalesce(string_agg(product_id || '|' || quantity_on_hand || '|' || quantity_reserved,
                    ',' order by product_id), '') from inventories) as balances,
          (select count(*)::int from product_costs) as costs,
          (select count(*)::int from audit_logs) as audits,
          (select coalesce(string_agg(number || '|' || status::text, ',' order by id), '')
             from purchase_orders) as orders,
          (select coalesce(string_agg(organization_id || '|' || last_number, ','
                    order by organization_id), '')
             from document_counters where kind = 'goods_receipt_void') as counters`,
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

const lockBalance = (productId: string) =>
  sql`select product_id from inventories where product_id = ${productId} for update`;
const lockOrder = (id: string) =>
  sql`select id from purchase_orders where id = ${id} for update`;

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

describe("la salida de stock (AC-2; D-3)", () => {
  it(
    "saca con un movimiento goods_receipt_void por línea y no toca lo reservado",
    async () => {
      const s = await seed();
      await getDb().execute(
        sql`insert into inventories (organization_id, product_id, quantity_on_hand, quantity_reserved)
            values (${s.orgA}, ${s.productA}, 5, 2), (${s.orgA}, ${s.productA2}, 3, 0)`,
      );
      let asked = 0;
      const result = await getDb().transaction((tx) =>
        removeReceivedStock(tx, {
          organizationId: s.orgA,
          lines: [
            { productId: s.productA2, quantity: "3.000" },
            { productId: s.productA, quantity: "3.000" },
          ],
          reason: async () => {
            asked++;
            return "Anulación ARC-000009 de la recepción RC-000009";
          },
          createdBy: s.adminUserA,
        }),
      );
      expect(result).toEqual({ ok: true });
      expect(asked).toBe(1);
      expect(await balance(s.productA)).toEqual({
        on_hand: "2.000",
        reserved: "2.000",
      });
      expect(await balance(s.productA2)).toEqual({
        on_hand: "0.000",
        reserved: "0.000",
      });
      const movements = await getDb().execute(
        sql`select product_id, type, quantity, balance_after, reason from inventory_movements
            order by product_id`,
      );
      expect(movements.rows).toEqual(
        [
          { product_id: s.productA, quantity: "3.000", balance_after: "2.000" },
          {
            product_id: s.productA2,
            quantity: "3.000",
            balance_after: "0.000",
          },
        ]
          .sort((a, b) => (a.product_id < b.product_id ? -1 : 1))
          .map((row) => ({
            ...row,
            type: "goods_receipt_void",
            reason: "Anulación ARC-000009 de la recepción RC-000009",
          })),
      );
    },
    TEST_TIMEOUT,
  );

  it(
    "con una línea que no alcanza, por el saldo o por lo reservado, no escribe, no pide el motivo y devuelve las faltas",
    async () => {
      const s = await seed();
      // CAF-1 tiene 1 y hay que sacar 2: falta por el saldo. CAF-2 tiene 5 con 4 reservados y hay
      // que sacar 2: el saldo alcanza, lo disponible no.
      await getDb().execute(
        sql`insert into inventories (organization_id, product_id, quantity_on_hand, quantity_reserved)
            values (${s.orgA}, ${s.productA}, 1, 0), (${s.orgA}, ${s.productA2}, 5, 4)`,
      );
      const before = await snapshot();
      let asked = 0;
      const result = await getDb().transaction((tx) =>
        removeReceivedStock(tx, {
          organizationId: s.orgA,
          lines: [
            { productId: s.productA, quantity: "2.000" },
            { productId: s.productA2, quantity: "2.000" },
          ],
          reason: async () => {
            asked++;
            return "motivo";
          },
          createdBy: s.adminUserA,
        }),
      );
      expect(asked).toBe(0);
      expect(result.ok).toBe(false);
      expect(
        !result.ok &&
          result.reason === "insufficient" &&
          [...result.shortages].sort((a, b) =>
            a.productId < b.productId ? -1 : 1,
          ),
      ).toEqual(
        [
          { productId: s.productA, requested: "2.000", available: "1.000" },
          { productId: s.productA2, requested: "2.000", available: "1.000" },
        ].sort((a, b) => (a.productId < b.productId ? -1 : 1)),
      );
      expect(await snapshot()).toEqual(before);
    },
    TEST_TIMEOUT,
  );
});

describe("la anulación (AC-3; D-4, D-7 y D-8)", () => {
  it(
    "sin orden: la anulación ARC, los movimientos, la auditoría, el costo sin cambio y la recepción marcada",
    async () => {
      const s = await seed();
      const receipt = await receive(
        s.adminA,
        withoutOrder(s, [
          free(s.productA, "2", "1200"),
          free(s.productA2, "1,5", "10"),
        ]),
      );
      const costs = await getDb().execute(
        sql`select product_id, amount from product_costs order by id`,
      );

      const result = await voidGoodsReceipt(
        s.adminA,
        receipt.id.toUpperCase(),
        "returned_to_supplier",
      );
      expect(result).toMatchObject({
        ok: true,
        receiptVoid: { number: 1, displayNumber: "ARC-000001" },
        purchaseOrderId: null,
      });

      const row = await getDb().execute(
        sql`select organization_id, number, goods_receipt_id, currency, total, reason, created_by
            from goods_receipt_voids`,
      );
      expect(row.rows).toEqual([
        {
          organization_id: s.orgA,
          number: "1",
          goods_receipt_id: receipt.id,
          currency: "ARS",
          total: "2415.00",
          reason: "returned_to_supplier",
          created_by: s.adminUserA,
        },
      ]);

      // Los movimientos nombran la anulación y la recepción, no el proveedor.
      const movements = await getDb().execute<{
        type: string;
        quantity: string;
        balance_after: string;
        reason: string;
      }>(
        sql`select type, quantity, balance_after, reason from inventory_movements
            where type = 'goods_receipt_void' order by quantity`,
      );
      expect(movements.rows).toEqual([
        {
          type: "goods_receipt_void",
          quantity: "1.500",
          balance_after: "0.000",
          reason: "Anulación ARC-000001 de la recepción RC-000001",
        },
        {
          type: "goods_receipt_void",
          quantity: "2.000",
          balance_after: "0.000",
          reason: "Anulación ARC-000001 de la recepción RC-000001",
        },
      ]);
      expect(await balance(s.productA)).toEqual({
        on_hand: "0.000",
        reserved: "0.000",
      });

      // El costo no cambia (punto 6).
      expect(
        (
          await getDb().execute(
            sql`select product_id, amount from product_costs order by id`,
          )
        ).rows,
      ).toEqual(costs.rows);

      // La auditoría, sobre la recepción, con el número y el motivo, y nada más (D-7).
      const audit = await getDb().execute(
        sql`select entity_type, entity_id, action, diff from audit_logs
            where action = 'void'`,
      );
      expect(audit.rows).toEqual([
        {
          entity_type: "goods_receipt",
          entity_id: receipt.id,
          action: "void",
          diff: {
            before: { void_number: null, reason: null },
            after: { void_number: 1, reason: "returned_to_supplier" },
          },
        },
      ]);
      const history = await listGoodsReceiptAudit(s.adminA, receipt.id, 1);
      expect(
        history.ok && history.entries.map((entry) => entry.action),
      ).toEqual(["void", "create"]);

      const detail = await getGoodsReceipt(s.adminA, receipt.id);
      expect(detail.ok && detail.receipt.receiptVoid).toMatchObject({
        displayNumber: "ARC-000001",
        reason: "returned_to_supplier",
      });
      const counter = await getDb().execute(
        sql`select last_number from document_counters where kind = 'goods_receipt_void'`,
      );
      expect(counter.rows).toEqual([{ last_number: "1" }]);
    },
    TEST_TIMEOUT,
  );

  it(
    "no mira si el producto está activo: lo que entró tiene que poder salir",
    async () => {
      const s = await seed();
      const receipt = await receive(
        s.adminA,
        withoutOrder(s, [free(s.productA)]),
      );
      await getDb().execute(
        sql`update products set is_active = false where id = ${s.productA}`,
      );
      expect(
        await voidGoodsReceipt(s.adminA, receipt.id, "other"),
      ).toMatchObject({ ok: true });
    },
    TEST_TIMEOUT,
  );

  it(
    "con orden: lo recibido deja de contarla, se vuelve a recibir, el cierre a mano no se ofrece y la orden no se audita",
    async () => {
      const s = await seed();
      const o = await order(s);
      const first = await receive(
        s.adminA,
        withOrder(o.id, [fromOrder(o.lineA, "4")]),
      );
      expect(await cancelPurchaseOrder(s.adminA, o.id)).toMatchObject({
        rule: "has_receipts",
      });
      const orderAudits = await getDb().execute(
        sql`select count(*)::int as total from audit_logs where entity_type = 'purchase_order'`,
      );

      expect(
        await voidOk(s.adminA, first.id, "data_entry_error"),
      ).toMatchObject({ purchaseOrderId: o.id });
      const after = await orderDetail(s, o.id);
      expect(after.status).toBe("open");
      expect(after.lines[0]).toMatchObject({
        received: "0.000",
        pending: "10.000",
      });
      expect(after.receipts).toMatchObject([
        { id: first.id, voidDisplayNumber: "ARC-000001" },
      ]);
      // Ninguna recepción vigente: el cierre a mano no corresponde (D-8).
      expect(await closePurchaseOrder(s.adminA, o.id)).toMatchObject({
        rule: "no_receipts",
      });
      expect(
        (
          await getDb().execute(
            sql`select count(*)::int as total from audit_logs where entity_type = 'purchase_order'`,
          )
        ).rows,
      ).toEqual(orderAudits.rows);

      // Lo anulado se vuelve a recibir con la misma orden, y la recepción completa la cierra.
      const again = await createGoodsReceipt(
        s.adminA,
        withOrder(o.id, [fromOrder(o.lineA, "10"), fromOrder(o.lineA2, "4")]),
      );
      expect(again).toMatchObject({ ok: true, closedOrder: true });
    },
    TEST_TIMEOUT,
  );

  it(
    "una orden cuyas recepciones se anularon todas se cancela",
    async () => {
      const s = await seed();
      const o = await order(s);
      const first = await receive(
        s.adminA,
        withOrder(o.id, [fromOrder(o.lineA, "1")]),
      );
      const second = await receive(
        s.adminA,
        withOrder(o.id, [fromOrder(o.lineA2, "1")]),
      );
      await voidOk(s.adminA, first.id, "duplicate");
      expect(await cancelPurchaseOrder(s.adminA, o.id)).toMatchObject({
        rule: "has_receipts",
      });
      await voidOk(s.adminA, second.id, "duplicate");
      expect(await cancelPurchaseOrder(s.adminA, o.id)).toEqual({ ok: true });
    },
    TEST_TIMEOUT,
  );

  it(
    "una orden cerrada sigue cerrada, con lo que falta",
    async () => {
      const s = await seed();
      const o = await order(s);
      const full = await createGoodsReceipt(
        s.adminA,
        withOrder(o.id, [fromOrder(o.lineA, "10"), fromOrder(o.lineA2, "4")]),
      );
      if (!full.ok) throw new Error("recepción rechazada");
      expect(full.closedOrder).toBe(true);
      await voidOk(s.adminA, full.receipt.id, "data_entry_error");
      const after = await orderDetail(s, o.id);
      expect(after.status).toBe("closed");
      expect(after.lines.map((line) => line.pending)).toEqual([
        "10.000",
        "4.000",
      ]);
    },
    TEST_TIMEOUT,
  );

  it(
    "la lista filtra por estado y busca por el número de la anulación",
    async () => {
      const s = await seed();
      const kept = await receive(s.adminA, withoutOrder(s, [free(s.productA)]));
      const voided = await receive(
        s.adminA,
        withoutOrder(s, [free(s.productA2)]),
      );
      await voidOk(s.adminA, voided.id, "other");
      const list = async (
        status: "all" | "current" | "voided",
        number = "",
      ) => {
        const result = await listGoodsReceipts(s.adminA, {
          supplierId: null,
          number,
          status,
          page: 1,
        });
        if (!result.ok) throw new Error("lista rechazada");
        return result.receipts.map((receipt) => [
          receipt.displayNumber,
          receipt.voidDisplayNumber,
        ]);
      };
      expect(await list("all")).toEqual([
        ["RC-000002", "ARC-000001"],
        ["RC-000001", null],
      ]);
      expect(await list("current")).toEqual([["RC-000001", null]]);
      expect(await list("voided")).toEqual([["RC-000002", "ARC-000001"]]);
      for (const text of ["ARC-000001", "arc1", " Arc-1 "]) {
        expect(await list("all", text)).toEqual([["RC-000002", "ARC-000001"]]);
      }
      expect(await list("all", "ARC-000002")).toEqual([]);
      expect(await list("current", "ARC-000001")).toEqual([]);
      expect(await list("all", "RC-000001")).toEqual([["RC-000001", null]]);
      expect(await list("all", "ARC")).toEqual([]);
      const recent = await listRecentSupplierGoodsReceipts(
        s.adminA,
        s.supplierA,
      );
      expect(
        recent.ok &&
          recent.receipts.map((receipt) => receipt.voidDisplayNumber),
      ).toEqual(["ARC-000001", null]);
      expect(kept.number).toBe(1);
    },
    TEST_TIMEOUT,
  );

  it(
    "el agente lee el saldo nuevo, sin cambio de contrato (AC-11)",
    async () => {
      const s = await seed();
      const receipt = await receive(
        s.adminA,
        withoutOrder(s, [free(s.productA, "3")]),
      );
      expect(
        await getProductBalanceForService(s.orgA, s.productA),
      ).toMatchObject({ quantityOnHand: "3.000" });
      await voidOk(s.adminA, receipt.id, "data_entry_error");
      expect(
        await getProductBalanceForService(s.orgA, s.productA),
      ).toMatchObject({ quantityOnHand: "0.000", quantityAvailable: "0.000" });
    },
    TEST_TIMEOUT,
  );
});

describe("los rechazos (AC-5; D-6)", () => {
  it(
    "un viewer, el id, el motivo, la recepción de otra organización o inexistente: sin escribir nada",
    async () => {
      const s = await seed();
      const receipt = await receive(
        s.adminA,
        withoutOrder(s, [free(s.productA)]),
      );
      const before = await snapshot();
      const cases: [AuthContext, string, string, unknown][] = [
        [s.viewerA, receipt.id, "other", { ok: false, code: "FORBIDDEN" }],
        [
          s.adminA,
          "no-es-uuid",
          "other",
          { ok: false, code: "VALIDATION_ERROR" },
        ],
        [
          s.adminA,
          receipt.id,
          "not_completed",
          { ok: false, code: "VALIDATION_ERROR" },
        ],
        [s.adminA, receipt.id, "", { ok: false, code: "VALIDATION_ERROR" }],
        [s.adminB, receipt.id, "other", { ok: false, code: "NOT_FOUND" }],
        [
          s.adminA,
          crypto.randomUUID(),
          "other",
          { ok: false, code: "NOT_FOUND" },
        ],
      ];
      for (const [context, id, reason, expected] of cases) {
        expect(await voidGoodsReceipt(context, id, reason)).toMatchObject(
          expected as object,
        );
      }
      expect(await snapshot()).toEqual(before);
    },
    TEST_TIMEOUT,
  );

  it(
    "una recepción ya anulada: already_voided, sin escribir nada",
    async () => {
      const s = await seed();
      const receipt = await receive(
        s.adminA,
        withoutOrder(s, [free(s.productA)]),
      );
      const first = await voidOk(s.adminA, receipt.id, "other");
      const before = await snapshot();
      expect(await voidGoodsReceipt(s.adminA, receipt.id, "duplicate")).toEqual(
        {
          ok: false,
          code: "BUSINESS_RULE_VIOLATION",
          rule: "already_voided",
          receiptVoid: first.receiptVoid,
        },
      );
      expect(await snapshot()).toEqual(before);
    },
    TEST_TIMEOUT,
  );

  it(
    "el stock que no alcanza, por el saldo, por lo reservado o sin fila de saldo: insufficient_stock, sin escribir nada",
    async () => {
      const s = await seed();
      const productA3 = await insertProduct(s.orgA, "CAF-3");
      const receipt = await receive(
        s.adminA,
        withoutOrder(s, [
          free(s.productA, "2"),
          free(s.productA2, "2"),
          free(productA3, "1"),
        ]),
      );
      // CAF-1 bajó a 1 (una venta, un ajuste): falta por el saldo. CAF-2 tiene sus 2 con 1 reservado:
      // falta por lo reservado. CAF-3 se quedó sin fila de saldo: el bloqueo la crea en 0, y el
      // rechazo tiene que revertirla (R-1 de la 22.4).
      await getDb().execute(
        sql`update inventories set quantity_on_hand = 1 where product_id = ${s.productA}`,
      );
      await getDb().execute(
        sql`update inventories set quantity_reserved = 1 where product_id = ${s.productA2}`,
      );
      await getDb().execute(
        sql`delete from inventories where product_id = ${productA3}`,
      );
      const before = await snapshot();
      expect(await voidGoodsReceipt(s.adminA, receipt.id, "other")).toEqual({
        ok: false,
        code: "BUSINESS_RULE_VIOLATION",
        rule: "insufficient_stock",
        shortages: [
          { productId: s.productA, requested: "2.000", available: "1.000" },
          { productId: s.productA2, requested: "2.000", available: "1.000" },
          { productId: productA3, requested: "1.000", available: "0.000" },
        ],
      });
      expect(await snapshot()).toEqual(before);
    },
    TEST_TIMEOUT,
  );
});

describe("la serialización (AC-4; D-5)", () => {
  it(
    "dos anulaciones de la misma recepción sin orden, con lo justo de stock: una entra y la otra responde already_voided",
    async () => {
      const s = await seed();
      const receipt = await receive(
        s.adminA,
        withoutOrder(s, [free(s.productA, "2")]),
      );
      const release = await hold(lockBalance(s.productA));
      const first = voidGoodsReceipt(s.adminA, receipt.id, "other");
      await waitForLockWaiters(1);
      const second = voidGoodsReceipt(s.adminA, receipt.id, "duplicate");
      await waitForLockWaiters(2);
      await release();
      const results = await Promise.all([first, second]);
      const won = results.find((result) => result.ok);
      expect(won).toBeDefined();
      expect(results.find((result) => !result.ok)).toEqual({
        ok: false,
        code: "BUSINESS_RULE_VIOLATION",
        rule: "already_voided",
        receiptVoid: won!.ok ? won!.receiptVoid : null,
      });
      expect(await balance(s.productA)).toEqual({
        on_hand: "0.000",
        reserved: "0.000",
      });
    },
    TEST_TIMEOUT,
  );

  it(
    "dos anulaciones de la misma recepción con orden: una entra y la otra responde already_voided",
    async () => {
      const s = await seed();
      const o = await order(s);
      const receipt = await receive(
        s.adminA,
        withOrder(o.id, [fromOrder(o.lineA, "2")]),
      );
      const release = await hold(lockOrder(o.id));
      const first = voidGoodsReceipt(s.adminA, receipt.id, "other");
      await waitForLockWaiters(1);
      const second = voidGoodsReceipt(s.adminA, receipt.id, "duplicate");
      await waitForLockWaiters(2);
      await release();
      const results = await Promise.all([first, second]);
      expect(results.filter((result) => result.ok)).toHaveLength(1);
      expect(results.find((result) => !result.ok)).toMatchObject({
        rule: "already_voided",
      });
      const voids = await getDb().execute(
        sql`select count(*)::int as total from goods_receipt_voids`,
      );
      expect(voids.rows).toEqual([{ total: 1 }]);
    },
    TEST_TIMEOUT,
  );

  // Las dos esperan el saldo, y lo toma primero la que llegó primero. Con la venta primero, la
  // anulación encuentra el stock vendido: sin comprobar lo disponible, dejaría el saldo negativo y la
  // base la rechazaría con un error, no con insufficient_stock.
  it.each([["la anulación"], ["la venta"]])(
    "la anulación contra una venta sin pedido del mismo producto, con lo justo para una y %s primero: ningún saldo queda negativo",
    async (first) => {
      const s = await seed();
      const price = await getDb().execute<{ id: string }>(
        sql`insert into product_prices (organization_id, product_id, amount, currency, created_by)
            values (${s.orgA}, ${s.productA}, 2000, 'ARS', ${s.adminUserA}) returning id`,
      );
      const receipt = await receive(
        s.adminA,
        withoutOrder(s, [free(s.productA, "2")]),
      );
      const release = await hold(lockBalance(s.productA));
      const voidNow = () => voidGoodsReceipt(s.adminA, receipt.id, "other");
      const sellNow = () =>
        issueSale(s.adminA, {
          clientId: "",
          lines: [
            {
              productId: s.productA,
              quantity: "2",
              expectedPriceId: price.rows[0]!.id,
            },
          ],
        });
      const voidFirst = first === "la anulación";
      const firstCall = voidFirst ? voidNow() : sellNow();
      await waitForLockWaiters(1);
      const secondCall = voidFirst ? sellNow() : voidNow();
      await waitForLockWaiters(2);
      await release();
      const [firstResult, secondResult] = await Promise.all([
        firstCall,
        secondCall,
      ]);
      expect(firstResult).toMatchObject({ ok: true });
      expect(secondResult).toMatchObject({
        ok: false,
        code: "BUSINESS_RULE_VIOLATION",
        rule: "insufficient_stock",
      });
      expect(await balance(s.productA)).toEqual({
        on_hand: "0.000",
        reserved: "0.000",
      });
    },
    TEST_TIMEOUT,
  );

  // La última defensa (D-5): con stock de sobra, la segunda anulación no encuentra falta y la frena la
  // mirada del motivo; sin esa mirada, la frena el UNIQUE, que se rescata como «ya anulada».
  it(
    "dos anulaciones de la misma recepción sin orden, con stock de sobra: una entra y la otra responde already_voided",
    async () => {
      const s = await seed();
      await getDb().execute(
        sql`insert into inventories (organization_id, product_id, quantity_on_hand)
            values (${s.orgA}, ${s.productA}, 5)`,
      );
      const receipt = await receive(
        s.adminA,
        withoutOrder(s, [free(s.productA, "2")]),
      );
      const release = await hold(lockBalance(s.productA));
      const first = voidGoodsReceipt(s.adminA, receipt.id, "other");
      await waitForLockWaiters(1);
      const second = voidGoodsReceipt(s.adminA, receipt.id, "duplicate");
      await waitForLockWaiters(2);
      await release();
      const results = await Promise.all([first, second]);
      expect(results.filter((result) => result.ok)).toHaveLength(1);
      expect(results.find((result) => !result.ok)).toMatchObject({
        rule: "already_voided",
        receiptVoid: { number: 1 },
      });
      expect(await balance(s.productA)).toEqual({
        on_hand: "5.000",
        reserved: "0.000",
      });
    },
    TEST_TIMEOUT,
  );

  it(
    "la cancelación que espera la cabecera de la orden ve la recepción anulada y entra",
    async () => {
      const s = await seed();
      const o = await order(s);
      const receipt = await receive(
        s.adminA,
        withOrder(o.id, [fromOrder(o.lineA, "2")]),
      );
      // La anulación toma la cabecera y espera en el saldo; la cancelación espera la cabecera.
      const release = await hold(lockBalance(s.productA));
      const voiding = voidGoodsReceipt(s.adminA, receipt.id, "other");
      await waitForLockWaiters(1);
      const cancelling = cancelPurchaseOrder(s.adminA, o.id);
      await waitForLockWaiters(2);
      await release();
      expect(await voiding).toMatchObject({ ok: true });
      expect(await cancelling).toEqual({ ok: true });
    },
    TEST_TIMEOUT,
  );

  // El contador se toma al armar el motivo, después de los bloqueos (ADR 0023, punto 10): una
  // anulación que espera sus saldos no retiene el número.
  it(
    "una anulación que espera sus saldos no frena el número de otra",
    async () => {
      const s = await seed();
      const waitingReceipt = await receive(
        s.adminA,
        withoutOrder(s, [free(s.productA)]),
      );
      const otherReceipt = await receive(
        s.adminA,
        withoutOrder(s, [free(s.productA2)]),
      );
      const release = await hold(lockBalance(s.productA));
      const waiting = voidGoodsReceipt(s.adminA, waitingReceipt.id, "other");
      await waitForLockWaiters(1);
      const other = await Promise.race([
        voidOk(s.adminA, otherReceipt.id, "other"),
        new Promise<"bloqueada">((resolve) =>
          setTimeout(() => resolve("bloqueada"), 3000),
        ),
      ]);
      expect(other).toMatchObject({ receiptVoid: { number: 1 } });
      await release();
      expect(await waiting).toMatchObject({
        ok: true,
        receiptVoid: { number: 2 },
      });
    },
    TEST_TIMEOUT,
  );
});

describe("el rendimiento (AC-7; D-10)", () => {
  // El umbral de 754 ms es el de la lista de clientes de la 13.2, que la 22.2 a la 22.4 también usaron.
  const THRESHOLD_MS = 754;

  it(
    "la lista con 2.000 recepciones y 500 anuladas, y el detalle de una orden de 50 líneas con 100 recepciones y 30 anuladas, quedan bajo el umbral",
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
      // Una de cada cuatro, anulada: 500.
      await getDb().execute(
        sql`insert into goods_receipt_voids (organization_id, number, goods_receipt_id, currency,
                                             total, reason, created_by)
            select ${s.orgA}, number / 4, id, 'ARS', 100, 'data_entry_error', ${s.adminUserA}
            from goods_receipts where number % 4 = 0`,
      );

      // Una orden de 50 líneas con 100 recepciones de una línea cada una, numeradas desde 2.001, y
      // 30 de ellas anuladas.
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
      await getDb().execute(
        sql`insert into goods_receipt_voids (organization_id, number, goods_receipt_id, currency,
                                             total, reason, created_by)
            select ${s.orgA}, 500 + (number - 2000), id, 'ARS', 1, 'other', ${s.adminUserA}
            from goods_receipts where purchase_order_id = ${big.order.id} and number <= 2030`,
      );
      for (const table of [
        "goods_receipts",
        "goods_receipt_lines",
        "goods_receipt_voids",
      ]) {
        await getDb().execute(sql.raw(`analyze ${table}`));
      }

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
        { status: "all", number: "", page: 40 },
        { status: "current", number: "", page: 30 },
        { status: "voided", number: "", page: 10 },
        { status: "all", number: "ARC-000250", page: 1 },
      ] as const) {
        await measure(`lista ${JSON.stringify(query)}`, () =>
          listGoodsReceipts(s.adminA, { supplierId: null, ...query }),
        );
      }
      const voided = await listGoodsReceipts(s.adminA, {
        supplierId: null,
        number: "",
        status: "voided",
        page: 1,
      });
      expect(voided.ok && voided.total).toBe(530);
      await measure(
        "detalle de la orden de 50 líneas, 100 recepciones y 30 anuladas",
        () => getPurchaseOrder(s.adminA, big.order.id),
      );
      const detail = await orderDetail(s, big.order.id);
      expect(detail.receipts).toHaveLength(100);
      expect(
        detail.receipts.filter((receipt) => receipt.voidDisplayNumber !== null),
      ).toHaveLength(30);
      // La línea 1 recibió las recepciones 2001 y 2051; la 2001 está anulada.
      expect(detail.lines[0]).toMatchObject({
        received: "1.000",
        pending: "999.000",
      });
    },
    TEST_TIMEOUT,
  );
});

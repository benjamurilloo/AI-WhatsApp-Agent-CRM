import { sql, type SQL } from "drizzle-orm";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { hashPassword, login } from "@/modules/auth";
import { getAuthContext, type AuthContext } from "@/modules/organizations";
import {
  cancelPurchaseOrder,
  createPurchaseOrder,
  createSupplier,
  getPurchaseOrder,
  listPurchaseOrderAudit,
  listPurchaseOrders,
  listRecentSupplierPurchaseOrders,
  PURCHASE_ORDERS_PAGE_SIZE,
  type PurchaseOrderInput,
  type PurchaseOrderLineInput,
} from "@/modules/purchasing";
import { getDb } from "@/shared/db";
import { resetDatabase } from "./reset-database";

// La orden de compra contra PostgreSQL real (brief-22.3): las operaciones (AC-3), los rechazos
// (AC-4), la serialización (AC-5) y la lista con 2.000 órdenes (AC-7). Los helpers son los de
// suppliers.test.ts.

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

// El primero de cada organización, con todos sus datos; los demás, solo con el nombre, porque el
// CUIT no se repite en una organización.
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

const line = (
  productId: string,
  quantity = "2",
  unitCost = "1500,50",
): PurchaseOrderLineInput => ({ productId, quantity, unitCost });

async function create(context: AuthContext, input: PurchaseOrderInput) {
  const result = await createPurchaseOrder(context, input);
  if (!result.ok) throw new Error(`orden rechazada: ${JSON.stringify(result)}`);
  return result.order;
}

// Lo que quedó escrito, para comprobar que un rechazo no escribe, no audita ni consume número.
async function snapshot() {
  const result = await getDb().execute<{
    orders: string;
    lines: number;
    audits: number;
    counters: string;
  }>(
    sql`select
          (select coalesce(string_agg(number || '|' || status::text, ',' order by id), '')
             from purchase_orders) as orders,
          (select count(*)::int from purchase_order_lines) as lines,
          (select count(*)::int from audit_logs) as audits,
          (select coalesce(string_agg(organization_id || '|' || last_number, ','
                    order by organization_id), '')
             from document_counters where kind = 'purchase_order') as counters`,
  );
  return result.rows[0]!;
}

async function orderAudits() {
  const result = await getDb().execute<{
    action: string;
    entity_id: string;
    diff: {
      before: Record<string, unknown> | null;
      after: Record<string, unknown>;
    };
  }>(
    sql`select action, entity_id, diff from audit_logs
        where entity_type = 'purchase_order' order by created_at, id`,
  );
  return result.rows;
}

// Bloqueos retenidos del test en curso, como en suppliers.test.ts.
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
});

afterAll(async () => {
  await getDb().$client.end();
});

describe("las operaciones (AC-3; D-8 a D-11)", () => {
  it(
    "el alta escribe la cabecera, las líneas, el número OC y la auditoría",
    async () => {
      const s = await seed();
      const order = await create(s.adminA, {
        supplierId: s.supplierA,
        currency: "ARS",
        lines: [
          line(s.productA, "2", "1500,50"),
          line(s.productA2, "1,5", "0,99"),
        ],
      });
      expect(order).toMatchObject({ number: 1, displayNumber: "OC-000001" });

      const header = await getDb().execute(
        sql`select number, supplier_id, currency, total, status, closed_at, cancelled_at,
                   created_by
            from purchase_orders where id = ${order.id}`,
      );
      expect(header.rows).toEqual([
        {
          number: "1",
          supplier_id: s.supplierA,
          currency: "ARS",
          // 2 × 1500,50 = 3001,00 y 1,5 × 0,99 = 1,485 → 1,49.
          total: "3002.49",
          status: "open",
          closed_at: null,
          cancelled_at: null,
          created_by: s.adminUserA,
        },
      ]);
      const lines = await getDb().execute(
        sql`select position, product_id, quantity, unit_cost, line_total
            from purchase_order_lines where purchase_order_id = ${order.id}
            order by position`,
      );
      expect(lines.rows).toEqual([
        {
          position: 1,
          product_id: s.productA,
          quantity: "2.000",
          unit_cost: "1500.50",
          line_total: "3001.00",
        },
        {
          position: 2,
          product_id: s.productA2,
          quantity: "1.500",
          unit_cost: "0.99",
          line_total: "1.49",
        },
      ]);
      expect(await orderAudits()).toEqual([
        {
          action: "create",
          entity_id: order.id,
          diff: {
            before: null,
            after: {
              number: 1,
              status: "open",
              supplier_id: s.supplierA,
              currency: "ARS",
              total: "3002.49",
              lines: 2,
              line_1_product_id: s.productA,
              line_1_quantity: "2.000",
              line_1_unit_cost: "1500.50",
              line_1_total: "3001.00",
              line_2_product_id: s.productA2,
              line_2_quantity: "1.500",
              line_2_unit_cost: "0.99",
              line_2_total: "1.49",
            },
          },
        },
      ]);

      // Una moneda sin decimales redondea al entero.
      const pesos = await create(s.adminA, {
        supplierId: s.supplierA,
        currency: "CLP",
        lines: [line(s.productA, "1,5", "333")],
      });
      expect(pesos.displayNumber).toBe("OC-000002");
      const detail = await getPurchaseOrder(s.adminA, pesos.id);
      expect(detail.ok && detail.order.total).toBe("500.00");
    },
    TEST_TIMEOUT,
  );

  it(
    "la orden no toca el stock ni el costo (invariante 6)",
    async () => {
      const s = await seed();
      const before = await getDb().execute(
        sql`select (select count(*)::int from inventories) as inventories,
                   (select count(*)::int from inventory_movements) as movements,
                   (select count(*)::int from product_costs) as costs`,
      );
      const order = await create(s.adminA, {
        supplierId: s.supplierA,
        currency: "ARS",
        lines: [line(s.productA)],
      });
      await cancelPurchaseOrder(s.adminA, order.id);
      const after = await getDb().execute(
        sql`select (select count(*)::int from inventories) as inventories,
                   (select count(*)::int from inventory_movements) as movements,
                   (select count(*)::int from product_costs) as costs`,
      );
      expect(after.rows).toEqual(before.rows);
    },
    TEST_TIMEOUT,
  );

  it(
    "el detalle lee el proveedor de su ficha y los productos con su nombre de hoy",
    async () => {
      const s = await seed();
      const order = await create(s.adminA, {
        supplierId: s.supplierA,
        currency: "ARS",
        lines: [line(s.productA, "3", "10")],
      });
      await getDb().execute(
        sql`update products set name = 'Café molido' where id = ${s.productA}`,
      );
      const found = await getPurchaseOrder(s.adminA, order.id.toUpperCase());
      expect(found).toMatchObject({
        ok: true,
        order: {
          id: order.id,
          displayNumber: "OC-000001",
          supplierId: s.supplierA,
          supplier: {
            name: "Importaciones Sur",
            phone: "+5491155551234",
            email: "ventas@norte.com",
            cuit: "20123456786",
            isActive: true,
          },
          currency: "ARS",
          total: "30.00",
          status: "open",
          lines: [
            {
              position: 1,
              productId: s.productA,
              product: { name: "Café molido", sku: "CAF-1", isActive: true },
              quantity: "3.000",
              unitCost: "10.00",
              lineTotal: "30.00",
            },
          ],
        },
      });
    },
    TEST_TIMEOUT,
  );

  it(
    "la cancelación pasa a cancelled con su fecha y su auditoría, y la historia la muestra",
    async () => {
      const s = await seed();
      const order = await create(s.adminA, {
        supplierId: s.supplierA,
        currency: "ARS",
        lines: [line(s.productA)],
      });
      expect(await cancelPurchaseOrder(s.adminA, order.id)).toEqual({
        ok: true,
      });
      const found = await getPurchaseOrder(s.adminA, order.id);
      expect(found.ok && found.order.status).toBe("cancelled");
      expect(found.ok && found.order.cancelledAt).toBeInstanceOf(Date);
      expect(found.ok && found.order.closedAt).toBeNull();
      expect((await orderAudits()).map((audit) => audit.diff)).toEqual([
        expect.objectContaining({ before: null }),
        { before: { status: "open" }, after: { status: "cancelled" } },
      ]);

      const audit = await listPurchaseOrderAudit(s.adminA, order.id, 1);
      expect(audit.ok && audit.entries.map((entry) => entry.action)).toEqual([
        "status_change",
        "create",
      ]);
      expect(audit.ok && audit.entries[0]!.actor).toEqual({
        kind: "user",
        id: s.adminUserA,
        name: "Ana",
      });
    },
    TEST_TIMEOUT,
  );

  it(
    "la lista ordena, filtra por estado y por proveedor, busca por número y pagina",
    async () => {
      const s = await seed();
      const ids: string[] = [];
      for (let index = 0; index < PURCHASE_ORDERS_PAGE_SIZE + 2; index += 1) {
        const order = await create(s.adminA, {
          supplierId: index % 3 === 0 ? s.supplierA2 : s.supplierA,
          currency: "ARS",
          lines: [line(s.productA, "1", String(index + 1))],
        });
        ids.push(order.id);
      }
      await cancelPurchaseOrder(s.adminA, ids[1]!);
      // Otra organización no aparece.
      await create(s.adminB, {
        supplierId: s.supplierB,
        currency: "ARS",
        lines: [line(s.productB)],
      });

      const all = await listPurchaseOrders(s.adminA, {
        status: "all",
        supplierId: null,
        number: "",
        page: 1,
      });
      expect(all.ok && all.total).toBe(PURCHASE_ORDERS_PAGE_SIZE + 2);
      expect(all.ok && all.pageCount).toBe(2);
      expect(all.ok && all.orders.map((order) => order.number)).toEqual(
        Array.from(
          { length: PURCHASE_ORDERS_PAGE_SIZE },
          (_, index) => PURCHASE_ORDERS_PAGE_SIZE + 2 - index,
        ),
      );
      expect(all.ok && all.orders[0]).toMatchObject({
        displayNumber: "OC-000027",
        supplierName: "Importaciones Sur",
        lineCount: 1,
        total: "27.00",
        currency: "ARS",
        status: "open",
      });
      const second = await listPurchaseOrders(s.adminA, {
        status: "all",
        supplierId: null,
        number: "",
        page: 2,
      });
      expect(second.ok && second.orders.map((order) => order.number)).toEqual([
        2, 1,
      ]);
      // Una página fuera de rango va a la última.
      const beyond = await listPurchaseOrders(s.adminA, {
        status: "all",
        supplierId: null,
        number: "",
        page: 99,
      });
      expect(beyond.ok && beyond.page).toBe(2);

      const cancelled = await listPurchaseOrders(s.adminA, {
        status: "cancelled",
        supplierId: null,
        number: "",
        page: 1,
      });
      expect(cancelled.ok && cancelled.orders.map((order) => order.id)).toEqual(
        [ids[1]],
      );
      const open = await listPurchaseOrders(s.adminA, {
        status: "open",
        supplierId: null,
        number: "",
        page: 1,
      });
      expect(open.ok && open.total).toBe(PURCHASE_ORDERS_PAGE_SIZE + 1);
      const closed = await listPurchaseOrders(s.adminA, {
        status: "closed",
        supplierId: null,
        number: "",
        page: 1,
      });
      expect(closed.ok && closed.total).toBe(0);

      const bySupplier = await listPurchaseOrders(s.adminA, {
        status: "all",
        supplierId: s.supplierA2.toUpperCase(),
        number: "",
        page: 1,
      });
      expect(bySupplier.ok && bySupplier.total).toBe(9);
      expect(
        bySupplier.ok &&
          bySupplier.orders.every(
            (order) => order.supplierName === "Distribuidora Norte",
          ),
      ).toBe(true);

      for (const text of [
        "OC-000007",
        "oc000007",
        "oc7",
        "000007",
        "7",
        " 7 ",
      ]) {
        const found = await listPurchaseOrders(s.adminA, {
          status: "all",
          supplierId: null,
          number: text,
          page: 1,
        });
        expect(found.ok && found.orders.map((order) => order.id), text).toEqual(
          [ids[6]],
        );
      }
      // Lo que no puede ser un número, o un proveedor que no es uuid, da la lista vacía.
      for (const filters of [
        { number: "P-000007", supplierId: null },
        { number: "siete", supplierId: null },
        { number: "", supplierId: "no-es-un-uuid" },
      ]) {
        const empty = await listPurchaseOrders(s.adminA, {
          status: "all",
          page: 1,
          ...filters,
        });
        expect(empty).toEqual({
          ok: true,
          orders: [],
          total: 0,
          page: 1,
          pageCount: 1,
        });
      }
    },
    TEST_TIMEOUT,
  );

  it(
    "las órdenes de un proveedor salen en su ficha: las 5 últimas y el total",
    async () => {
      const s = await seed();
      for (let index = 0; index < 7; index += 1) {
        await create(s.adminA, {
          supplierId: s.supplierA,
          currency: "ARS",
          lines: [line(s.productA)],
        });
      }
      await create(s.adminA, {
        supplierId: s.supplierA2,
        currency: "ARS",
        lines: [line(s.productA)],
      });
      const recent = await listRecentSupplierPurchaseOrders(
        s.adminA,
        s.supplierA,
      );
      expect(recent.ok && recent.total).toBe(7);
      expect(recent.ok && recent.orders.map((order) => order.number)).toEqual([
        7, 6, 5, 4, 3,
      ]);
    },
    TEST_TIMEOUT,
  );
});

describe("los rechazos (AC-4; D-8)", () => {
  it(
    "un viewer recibe FORBIDDEN en cada lectura y cada escritura, sin escribir",
    async () => {
      const s = await seed();
      const order = await create(s.adminA, {
        supplierId: s.supplierA,
        currency: "ARS",
        lines: [line(s.productA)],
      });
      const before = await snapshot();
      const forbidden = { ok: false, code: "FORBIDDEN" };
      expect(
        await createPurchaseOrder(s.viewerA, {
          supplierId: s.supplierA,
          currency: "ARS",
          lines: [line(s.productA)],
        }),
      ).toEqual(forbidden);
      expect(await cancelPurchaseOrder(s.viewerA, order.id)).toEqual(forbidden);
      expect(
        await listPurchaseOrders(s.viewerA, {
          status: "all",
          supplierId: null,
          number: "",
          page: 1,
        }),
      ).toEqual(forbidden);
      expect(
        await listRecentSupplierPurchaseOrders(s.viewerA, s.supplierA),
      ).toEqual(forbidden);
      expect(await getPurchaseOrder(s.viewerA, order.id)).toEqual(forbidden);
      expect(await listPurchaseOrderAudit(s.viewerA, order.id, 1)).toEqual(
        forbidden,
      );
      expect(await snapshot()).toEqual(before);
    },
    TEST_TIMEOUT,
  );

  it(
    "VALIDATION_ERROR con el campo y la línea, sin escribir ni consumir número",
    async () => {
      const s = await seed();
      const before = await snapshot();
      const cases: [PurchaseOrderInput, unknown][] = [
        [
          { supplierId: "no-es-un-uuid", currency: "ARS", lines: [] },
          { reason: "supplier", lines: [] },
        ],
        [
          { supplierId: s.supplierA, currency: "ars", lines: [] },
          { reason: "currency", lines: [] },
        ],
        [
          { supplierId: s.supplierA, currency: "XXX", lines: [] },
          { reason: "currency", lines: [] },
        ],
        // El dinar de Bahréin tiene tres decimales, que numeric(14, 2) no guarda.
        [
          { supplierId: s.supplierA, currency: "BHD", lines: [] },
          { reason: "currency", lines: [] },
        ],
        [
          { supplierId: s.supplierA, currency: "", lines: [] },
          { reason: "currency", lines: [] },
        ],
        [
          { supplierId: s.supplierA, currency: "ARS", lines: [] },
          { reason: "no_lines", lines: [] },
        ],
        [
          {
            supplierId: s.supplierA,
            currency: "ARS",
            lines: Array.from({ length: 51 }, () => line(s.productA)),
          },
          { reason: "too_many_lines", lines: [] },
        ],
        [
          {
            supplierId: s.supplierA,
            currency: "ARS",
            lines: [
              line("x", "1", "1"),
              line(s.productA, "0", "1"),
              line(s.productA2, "1", "1,234"),
            ],
          },
          {
            reason: "lines",
            lines: [
              { position: 1, field: "product" },
              { position: 2, field: "quantity" },
              { position: 3, field: "unitCost", reason: "decimals" },
            ],
          },
        ],
        // Sin decimales, el separador se rechaza.
        [
          {
            supplierId: s.supplierA,
            currency: "CLP",
            lines: [line(s.productA, "1", "1.500")],
          },
          {
            reason: "lines",
            lines: [{ position: 1, field: "unitCost", reason: "separator" }],
          },
        ],
      ];
      for (const [input, expected] of cases) {
        expect(await createPurchaseOrder(s.adminA, input)).toEqual({
          ok: false,
          code: "VALIDATION_ERROR",
          ...(expected as object),
        });
      }
      expect(await snapshot()).toEqual(before);
    },
    TEST_TIMEOUT,
  );

  it(
    "NOT_FOUND: el proveedor o los productos que no existen en la organización",
    async () => {
      const s = await seed();
      const before = await snapshot();
      const missing = "44444444-4444-4444-8444-444444444444";
      for (const supplierId of [missing, s.supplierB]) {
        expect(
          await createPurchaseOrder(s.adminA, {
            supplierId,
            currency: "ARS",
            lines: [line(s.productA)],
          }),
        ).toEqual({ ok: false, code: "NOT_FOUND", target: "supplier" });
      }
      expect(
        await createPurchaseOrder(s.adminA, {
          supplierId: s.supplierA,
          currency: "ARS",
          lines: [line(s.productA), line(missing), line(s.productB)],
        }),
      ).toEqual({
        ok: false,
        code: "NOT_FOUND",
        target: "products",
        lines: [
          { position: 2, productId: missing },
          { position: 3, productId: s.productB },
        ],
      });
      expect(await snapshot()).toEqual(before);
    },
    TEST_TIMEOUT,
  );

  it(
    "BUSINESS_RULE_VIOLATION: el proveedor inactivo, las reglas de línea y el total",
    async () => {
      const s = await seed();
      await getDb().execute(
        sql`update suppliers set is_active = false where id = ${s.supplierA2}`,
      );
      const before = await snapshot();
      expect(
        await createPurchaseOrder(s.adminA, {
          supplierId: s.supplierA2,
          currency: "ARS",
          lines: [line(s.productA)],
        }),
      ).toEqual({
        ok: false,
        code: "BUSINESS_RULE_VIOLATION",
        rule: "inactive_supplier",
      });
      const rules: [PurchaseOrderLineInput[], unknown][] = [
        [
          [line(s.productA), line(s.productA)],
          [{ position: 2, productId: s.productA, rule: "duplicate_product" }],
        ],
        [
          [line(s.productA), line(s.inactiveA)],
          [{ position: 2, productId: s.inactiveA, rule: "inactive_product" }],
        ],
        [
          [line(s.productA, "0,001", "0,01")],
          [{ position: 1, productId: s.productA, rule: "zero_total" }],
        ],
        [
          [line(s.productA, "2", "999999999999,99")],
          [{ position: 1, productId: s.productA, rule: "amount_too_large" }],
        ],
      ];
      for (const [lines, issues] of rules) {
        expect(
          await createPurchaseOrder(s.adminA, {
            supplierId: s.supplierA,
            currency: "ARS",
            lines,
          }),
        ).toEqual({
          ok: false,
          code: "BUSINESS_RULE_VIOLATION",
          rule: "line_rules",
          lines: issues,
        });
      }
      expect(
        await createPurchaseOrder(s.adminA, {
          supplierId: s.supplierA,
          currency: "ARS",
          lines: [
            line(s.productA, "1", "600000000000"),
            line(s.productA2, "1", "600000000000"),
          ],
        }),
      ).toEqual({
        ok: false,
        code: "BUSINESS_RULE_VIOLATION",
        rule: "total_too_large",
      });
      expect(await snapshot()).toEqual(before);
    },
    TEST_TIMEOUT,
  );

  it(
    "cancelar una cancelada responde not_open y no audita; un id inválido o de otra organización",
    async () => {
      const s = await seed();
      const order = await create(s.adminA, {
        supplierId: s.supplierA,
        currency: "ARS",
        lines: [line(s.productA)],
      });
      await cancelPurchaseOrder(s.adminA, order.id);
      const before = await snapshot();
      expect(await cancelPurchaseOrder(s.adminA, order.id)).toEqual({
        ok: false,
        code: "BUSINESS_RULE_VIOLATION",
        rule: "not_open",
        status: "cancelled",
      });
      const orderB = await create(s.adminB, {
        supplierId: s.supplierB,
        currency: "ARS",
        lines: [line(s.productB)],
      });
      const afterB = await snapshot();
      for (const operation of [
        (id: string) => cancelPurchaseOrder(s.adminA, id),
        (id: string) => getPurchaseOrder(s.adminA, id),
        (id: string) => listPurchaseOrderAudit(s.adminA, id, 1),
      ]) {
        expect(await operation("no-es-un-uuid")).toEqual({
          ok: false,
          code: "VALIDATION_ERROR",
        });
        expect(await operation(orderB.id)).toEqual({
          ok: false,
          code: "NOT_FOUND",
        });
      }
      expect(
        await listRecentSupplierPurchaseOrders(s.adminA, "no-es-un-uuid"),
      ).toEqual({ ok: false, code: "VALIDATION_ERROR" });
      expect(await snapshot()).toEqual(afterB);
      expect(afterB.audits).toBe(before.audits + 1);
    },
    TEST_TIMEOUT,
  );
});

describe("la serialización (AC-5; D-7)", () => {
  const lockSupplier = (id: string) =>
    sql`select id from suppliers where id = ${id} for update`;

  it(
    "una desactivación del proveedor en curso: el alta espera y responde inactive_supplier",
    async () => {
      const s = await seed();
      const before = await snapshot();
      const release = await hold(
        lockSupplier(s.supplierA),
        sql`update suppliers set is_active = false where id = ${s.supplierA}`,
      );
      const creating = createPurchaseOrder(s.adminA, {
        supplierId: s.supplierA,
        currency: "ARS",
        lines: [line(s.productA)],
      });
      await waitForLockWaiters(1);
      await release();
      // Sin el FOR SHARE, el alta pasaría por la clave foránea con el proveedor inactivo (H-4).
      expect(await creating).toEqual({
        ok: false,
        code: "BUSINESS_RULE_VIOLATION",
        rule: "inactive_supplier",
      });
      expect(await snapshot()).toEqual(before);
    },
    TEST_TIMEOUT,
  );

  it(
    "una desactivación de un producto en curso: el alta espera y responde inactive_product",
    async () => {
      const s = await seed();
      const before = await snapshot();
      const release = await hold(
        sql`select id from products where id = ${s.productA2} for update`,
        sql`update products set is_active = false where id = ${s.productA2}`,
      );
      const creating = createPurchaseOrder(s.adminA, {
        supplierId: s.supplierA,
        currency: "ARS",
        lines: [line(s.productA), line(s.productA2)],
      });
      await waitForLockWaiters(1);
      await release();
      expect(await creating).toEqual({
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

  // El UPDATE también espera una fila bloqueada, así que solo este escenario distingue el FOR UPDATE
  // de la lectura: sin él, las dos leerían «open» y la segunda intentaría cancelar otra vez una
  // orden ya cancelada. El trigger la rechaza («una fecha de estado no cambia») y esa cancelación
  // termina en una excepción en lugar de not_open, así que el caso falla igual, pero por la segunda
  // defensa (revisión independiente de la 22.3, R-5; nota «Prove a Row Lock…»).
  it(
    "dos cancelaciones simultáneas: una cancela y la otra responde not_open, con una sola auditoría",
    async () => {
      const s = await seed();
      const order = await create(s.adminA, {
        supplierId: s.supplierA,
        currency: "ARS",
        lines: [line(s.productA)],
      });
      const release = await hold(
        sql`select id from purchase_orders where id = ${order.id} for update`,
      );
      const first = cancelPurchaseOrder(s.adminA, order.id);
      await waitForLockWaiters(1);
      const second = cancelPurchaseOrder(s.adminA, order.id);
      await waitForLockWaiters(2);
      await release();
      expect(await Promise.all([first, second])).toEqual(
        expect.arrayContaining([
          { ok: true },
          {
            ok: false,
            code: "BUSINESS_RULE_VIOLATION",
            rule: "not_open",
            status: "cancelled",
          },
        ]),
      );
      expect(
        (await orderAudits()).filter(
          (audit) => audit.action === "status_change",
        ),
      ).toHaveLength(1);
    },
    TEST_TIMEOUT,
  );

  // El contador se toma al final (D-7; ADR 0021, punto 7): un alta que espera a su proveedor no
  // retiene el número, y el alta de otro proveedor termina antes. Con el contador tomado primero,
  // la segunda quedaría esperando a la primera.
  it(
    "un alta que espera a su proveedor no frena el número del alta de otro",
    async () => {
      const s = await seed();
      const release = await hold(lockSupplier(s.supplierA));
      const waiting = createPurchaseOrder(s.adminA, {
        supplierId: s.supplierA,
        currency: "ARS",
        lines: [line(s.productA)],
      });
      await waitForLockWaiters(1);
      const other = await Promise.race([
        create(s.adminA, {
          supplierId: s.supplierA2,
          currency: "ARS",
          lines: [line(s.productA)],
        }),
        new Promise<"bloqueada">((resolve) =>
          setTimeout(() => resolve("bloqueada"), 3000),
        ),
      ]);
      expect(other).toMatchObject({ number: 1 });
      await release();
      expect(await waiting).toMatchObject({ ok: true, order: { number: 2 } });
    },
    TEST_TIMEOUT,
  );

  it(
    "dos altas simultáneas toman números consecutivos sin hueco",
    async () => {
      const s = await seed();
      const input = {
        supplierId: s.supplierA,
        currency: "ARS",
        lines: [line(s.productA)],
      };
      const results = await Promise.all([
        create(s.adminA, input),
        create(s.adminA, input),
        create(s.adminA, input),
      ]);
      expect(results.map((order) => order.number).sort()).toEqual([1, 2, 3]);
      const counter = await getDb().execute<{ last_number: string }>(
        sql`select last_number from document_counters
            where organization_id = ${s.orgA} and kind = 'purchase_order'`,
      );
      expect(counter.rows[0]!.last_number).toBe("3");
    },
    TEST_TIMEOUT,
  );
});

describe("la lista con 2.000 órdenes (AC-7; D-11)", () => {
  // El umbral de 754 ms es el de la lista de clientes de la 13.2, que la 22.2 también usó.
  const THRESHOLD_MS = 754;

  it(
    "la lista con cada filtro queda bajo el umbral",
    async () => {
      const s = await seed();
      // Veinte proveedores, 2.000 órdenes con una o dos líneas, y una de cada cuatro cancelada.
      await getDb().execute(
        sql`insert into suppliers (organization_id, name)
            select ${s.orgA}, 'Proveedor ' || lpad(n::text, 2, '0')
            from generate_series(1, 20) as n`,
      );
      await getDb().execute(
        sql`insert into purchase_orders (organization_id, number, supplier_id, currency, total,
                                         created_by)
            select ${s.orgA}, n,
                   (select id from suppliers where organization_id = ${s.orgA}
                    order by name offset (n % 20) limit 1),
                   'ARS', 100, ${s.adminUserA}
            from generate_series(1, 2000) as n`,
      );
      await getDb().execute(
        sql`insert into purchase_order_lines (organization_id, purchase_order_id, product_id,
                                              position, quantity, unit_cost, line_total)
            select ${s.orgA}::uuid, id, ${s.productA}::uuid, 1, 1, 100, 100 from purchase_orders
            union all
            select ${s.orgA}::uuid, id, ${s.productA2}::uuid, 2, 1, 100, 100 from purchase_orders
            where number % 2 = 0`,
      );
      await getDb().execute(
        sql`update purchase_orders set status = 'cancelled', cancelled_at = now()
            where number % 4 = 0`,
      );
      await getDb().execute(sql`analyze purchase_orders`);
      await getDb().execute(sql`analyze purchase_order_lines`);
      // Uno de los veinte, con cien órdenes.
      const busy = await getDb().execute<{ id: string }>(
        sql`select id from suppliers where organization_id = ${s.orgA}
            and name = 'Proveedor 07'`,
      );
      const busyId = busy.rows[0]!.id;

      const queries = [
        { status: "all" as const, supplierId: null, number: "", page: 40 },
        {
          status: "cancelled" as const,
          supplierId: null,
          number: "",
          page: 10,
        },
        { status: "open" as const, supplierId: null, number: "", page: 1 },
        { status: "all" as const, supplierId: busyId, number: "", page: 3 },
        {
          status: "all" as const,
          supplierId: null,
          number: "OC-001234",
          page: 1,
        },
      ];
      for (const query of queries) {
        // Una corrida previa calienta la caché: se mide la consulta, no el primer acceso.
        await listPurchaseOrders(s.adminA, query);
        const started = performance.now();
        const result = await listPurchaseOrders(s.adminA, query);
        const elapsed = performance.now() - started;
        expect(result.ok).toBe(true);
        expect(elapsed, JSON.stringify(query)).toBeLessThan(THRESHOLD_MS);
        console.info(
          `lista ${JSON.stringify(query)}: ${elapsed.toFixed(1)} ms`,
        );
      }
    },
    TEST_TIMEOUT,
  );
});

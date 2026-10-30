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
  createInitialPaymentMethods,
  createSaleReceipt,
  createSupplierPayment,
  getGoodsReceiptPaymentForm,
  getSupplierAccountSummary,
  getSupplierStatement,
  listPaymentMethods,
  listSuppliersOwed,
} from "@/modules/cash";
import {
  createModel,
  createServiceProduct,
  getActiveProductForService,
  searchActiveProductsForService,
  suggestProducts,
} from "@/modules/catalog";
import { adjustStock, changeProductTracking } from "@/modules/inventory";
import { createOrder } from "@/modules/orders";
import {
  activateCapability,
  getAuthContext,
  getProfile,
  type AuthContext,
} from "@/modules/organizations";
import {
  createGoodsReceipt,
  createPurchaseOrder,
  createSupplier,
  deactivateSupplier,
  listTechnicians,
  setSupplierTechnician,
} from "@/modules/purchasing";
import { getSale, issueSale, voidSale } from "@/modules/sales";
import {
  applyRepairTypeTemplate,
  approveServiceOrder,
  cancelServiceOrder,
  createRepairType,
  createServiceOrder,
  deliverServiceOrder,
  getModelRepairPrices,
  getQuoteForm,
  getServiceOrder,
  listClientServiceOrders,
  CLIENT_OPERATION_SERVICE_ORDERS_LIMIT,
  countOpenServiceOrdersByClient,
  listClientOperationServiceOrders,
  listOpenClientServiceOrders,
  listRepairTypes,
  listServiceOrderAudit,
  listServiceOrders,
  markServiceOrderRepaired,
  quoteServiceOrder,
  rejectServiceOrder,
  renameRepairType,
  sendServiceOrder,
  setRepairPrice,
  type QuoteInput,
} from "@/modules/service";
import { getDb } from "@/shared/db";
import { resetDatabase } from "./reset-database";
import { expectStockInvariant } from "./stock-invariant";

// Las reparaciones de equipos de clientes contra PostgreSQL real (brief-29.6, D-13): la lista y su
// auditoría, cada transición de la orden y cada rechazo del trigger, el presupuesto con monedas
// mezcladas, la entrega con su venta sin tocar el stock y su anulación, el producto de servicio
// rechazado donde no va, la deuda del técnico en su cuenta y su pago a cuenta, dos entregas simultáneas
// forzadas con una tercera conexión, el viewer y una organización sin la capacidad.

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

// Lo que hace org:capability --profile iphone (brief-29.6, D-1): las capacidades, los tipos de ejemplo y
// el producto de servicio, en una transacción.
async function activateRepairs(organizationId: string, adminEmail: string) {
  const profile = getProfile("iphone")!;
  return getDb().transaction(async (tx) => {
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
    const types = await applyRepairTypeTemplate(tx, {
      organizationId,
      actorUserId,
      repairTypes: profile.repairTypes,
    });
    const product = await createServiceProduct(tx, {
      organizationId,
      actorUserId,
    });
    return { types, product };
  });
}

async function seed() {
  const orgA = await returningId(
    sql`insert into organizations (name, main_currency) values ('iPhone A', 'USD') returning id`,
  );
  const orgB = await returningId(
    sql`insert into organizations (name, main_currency) values ('iPhone B', 'USD') returning id`,
  );
  const orgC = await returningId(
    sql`insert into organizations (name) values ('Sin reparaciones') returning id`,
  );
  const admin = await member(orgA, "admin-a@example.com", "admin");
  const viewer = await member(orgA, "viewer-a@example.com", "viewer");
  const adminB = await member(orgB, "admin-b@example.com", "admin");
  const adminC = await member(orgC, "admin-c@example.com", "admin");
  const activation = await activateRepairs(orgA, "admin-a@example.com");
  await activateRepairs(orgB, "admin-b@example.com");

  const model = await createModel(admin.context, {
    name: "iPhone 13",
    brand: "Apple",
  });
  if (!model.ok) throw new Error("modelo rechazado");
  const types = await listRepairTypes(admin.context);
  if (!types.ok) throw new Error("tipos rechazados");
  const typeId = (name: string) =>
    types.types.find((type) => type.name === name)!.id;
  const battery = typeId("Cambio de batería");
  const screen = typeId("Cambio de pantalla");

  const price = async (
    repairTypeId: string,
    values: {
      price: string;
      priceCurrency?: string;
      cost: string;
      costCurrency?: string;
    },
  ) => {
    const result = await setRepairPrice(admin.context, {
      repairTypeId,
      modelId: model.modelId,
      price: values.price,
      priceCurrency: values.priceCurrency ?? "USD",
      cost: values.cost,
      costCurrency: values.costCurrency ?? "USD",
    });
    if (!result.ok) throw new Error(`precio rechazado: ${result.code}`);
  };
  await price(battery, { price: "80", cost: "35" });
  await price(screen, { price: "200", cost: "120" });

  const clientId = await returningId(
    sql`insert into clients (organization_id, display_name) values (${orgA}, 'Ana Cliente') returning id`,
  );
  const technician = await createSupplier(admin.context, {
    name: "Técnico Uno",
  });
  if (!technician.ok) throw new Error("técnico rechazado");
  const marked = await setSupplierTechnician(
    admin.context,
    technician.supplierId,
    true,
  );
  if (!marked.ok) throw new Error("marca rechazada");

  await createInitialPaymentMethods(admin.context);
  const methods = await listPaymentMethods(admin.context);
  if (!methods.ok) throw new Error("medios rechazados");
  const transfer = methods.paymentMethods.find(
    (method) => method.name === "Transferencia",
  )!.id;

  return {
    orgA,
    orgB,
    orgC,
    admin: admin.context,
    adminId: admin.userId,
    viewer: viewer.context,
    adminB: adminB.context,
    adminC: adminC.context,
    serviceProductId: activation.product.productId,
    modelId: model.modelId,
    battery,
    screen,
    clientId,
    technicianId: technician.supplierId,
    transfer,
  };
}

type Seed = Awaited<ReturnType<typeof seed>>;

async function newOrder(s: Seed, deviceSerial = "356789012345678") {
  const created = await createServiceOrder(s.admin, {
    clientId: s.clientId,
    modelId: s.modelId,
    deviceSerial,
    reportedIssue: "La batería dura poco.",
  });
  if (!created.ok)
    throw new Error(`orden rechazada: ${JSON.stringify(created)}`);
  return created.order;
}

const batteryQuote = (s: Seed): QuoteInput => ({
  customerCurrency: "USD",
  technicianCurrency: "USD",
  lines: [{ repairTypeId: s.battery, price: "80", cost: "35" }],
});

function ok<T extends { ok: boolean }>(result: T): Extract<T, { ok: true }> {
  if (!result.ok) throw new Error(`rechazado: ${JSON.stringify(result)}`);
  return result as Extract<T, { ok: true }>;
}

// Una orden hasta el estado pedido, por el camino de D-4.
async function orderAt(
  s: Seed,
  status: "received" | "sent" | "quoted" | "approved" | "repaired",
) {
  const order = await newOrder(s);
  if (status === "received") return order;
  ok(await sendServiceOrder(s.admin, order.id, s.technicianId));
  if (status === "sent") return order;
  ok(await quoteServiceOrder(s.admin, order.id, batteryQuote(s)));
  if (status === "quoted") return order;
  ok(await approveServiceOrder(s.admin, order.id));
  if (status === "approved") return order;
  ok(await markServiceOrderRepaired(s.admin, order.id));
  return order;
}

async function detail(s: Seed, id: string, context = s.admin) {
  const result = await getServiceOrder(context, id);
  if (!result.ok) throw new Error("detalle rechazado");
  return result.order;
}

// Bloqueos retenidos del test en curso: se sueltan al terminar aunque el test falle.
const heldLocks: (() => Promise<void>)[] = [];

async function hold(query: SQL): Promise<() => Promise<void>> {
  let taken!: () => void;
  let release!: () => void;
  const lockTaken = new Promise<void>((resolve) => (taken = resolve));
  const released = new Promise<void>((resolve) => (release = resolve));
  const holder = getDb().transaction(async (tx) => {
    await tx.execute(query);
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

// El producto de servicio nunca tiene saldo ni movimientos (invariante del brief).
async function serviceStockRows(s: Seed) {
  return count(
    sql`select ((select count(*) from inventories where product_id = ${s.serviceProductId})
             + (select count(*) from inventory_movements where product_id = ${s.serviceProductId}))::int as count`,
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

describe("la activación (AC-12)", () => {
  it(
    "copia los tipos de ejemplo y crea el producto de servicio una sola vez",
    async () => {
      const s = await seed();
      const again = await getDb().transaction(async (tx) => {
        const types = await applyRepairTypeTemplate(tx, {
          organizationId: s.orgA,
          actorUserId: s.adminId,
          repairTypes: getProfile("iphone")!.repairTypes,
        });
        const product = await createServiceProduct(tx, {
          organizationId: s.orgA,
          actorUserId: s.adminId,
        });
        return { types, product };
      });
      expect(again.types.created).toEqual([]);
      expect(again.types.skipped).toHaveLength(6);
      expect(again.product).toEqual({
        status: "exists",
        productId: s.serviceProductId,
      });
      expect(
        await count(
          sql`select count(*)::int as count from products where organization_id = ${s.orgA} and is_service`,
        ),
      ).toBe(1);
      const types = ok(await listRepairTypes(s.admin));
      expect(types.types.map((type) => [type.name, type.isExample])).toEqual([
        ["Cambio de batería", true],
        ["Cambio de pantalla", true],
        ["Cámara trasera", true],
        ["Cámara frontal", true],
        ["Pin de carga", true],
        ["Face ID", true],
      ]);
    },
    TEST_TIMEOUT,
  );
});

describe("la lista de reparaciones (AC-1)", () => {
  it(
    "un admin carga tipos y precios con auditoría; un viewer ve el precio y no el costo",
    async () => {
      const s = await seed();
      const created = ok(await createRepairType(s.admin, { name: "Parlante" }));
      expect(await createRepairType(s.admin, { name: "parlante" })).toEqual({
        ok: false,
        code: "CONFLICT",
        field: "name",
      });
      ok(
        await renameRepairType(s.admin, created.repairTypeId, {
          name: "Parlante inferior",
        }),
      );
      expect(await createRepairType(s.viewer, { name: "Otra" })).toEqual({
        ok: false,
        code: "FORBIDDEN",
      });

      // El precio de la batería cambia de precio y de costo: dos entradas, cada una con su acción.
      ok(
        await setRepairPrice(s.admin, {
          repairTypeId: s.battery,
          modelId: s.modelId,
          price: "85",
          priceCurrency: "USD",
          cost: "40",
          costCurrency: "USD",
        }),
      );
      // Sin cambios, no escribe ni audita.
      expect(
        await setRepairPrice(s.admin, {
          repairTypeId: s.battery,
          modelId: s.modelId,
          price: "85.00",
          priceCurrency: "USD",
          cost: "40",
          costCurrency: "USD",
        }),
      ).toEqual({ ok: true, changed: false });
      const actions = await getDb().execute<{ action: string }>(
        sql`select action::text from audit_logs where entity_type = 'repair_price' order by created_at, action`,
      );
      expect(actions.rows.map((row) => row.action).sort()).toEqual([
        "cost_change",
        "create",
        "create",
        "price_change",
      ]);
      expect(
        await setRepairPrice(s.admin, {
          repairTypeId: s.battery,
          modelId: s.modelId,
          price: "0",
          priceCurrency: "USD",
          cost: "40",
          costCurrency: "XYZ",
        }),
      ).toMatchObject({
        ok: false,
        code: "VALIDATION_ERROR",
        fields: ["price", "costCurrency"],
      });

      const forAdmin = ok(await getModelRepairPrices(s.admin, s.modelId));
      const forViewer = ok(await getModelRepairPrices(s.viewer, s.modelId));
      const batteryRow = (rows: typeof forAdmin.prices.rows) =>
        rows.find((row) => row.type.id === s.battery)!.price;
      expect(batteryRow(forAdmin.prices.rows)).toMatchObject({
        price: "85.00",
        cost: "40.00",
        costCurrency: "USD",
      });
      expect(batteryRow(forViewer.prices.rows)).toMatchObject({
        price: "85.00",
        priceCurrency: "USD",
        cost: null,
        costCurrency: null,
      });
    },
    TEST_TIMEOUT,
  );
});

describe("el técnico (AC-2)", () => {
  it(
    "solo los técnicos activos aparecen y reciben órdenes",
    async () => {
      const s = await seed();
      const plain = ok(await createSupplier(s.admin, { name: "Repuestos SA" }));
      const retired = ok(
        await createSupplier(s.admin, { name: "Técnico Dos" }),
      );
      ok(await setSupplierTechnician(s.admin, retired.supplierId, true));
      ok(await deactivateSupplier(s.admin, retired.supplierId));
      const listed = ok(await listTechnicians(s.admin));
      expect(listed.technicians.map((t) => t.name)).toEqual(["Técnico Uno"]);
      expect(await listTechnicians(s.viewer)).toEqual({
        ok: false,
        code: "FORBIDDEN",
      });

      const order = await newOrder(s);
      expect(
        await sendServiceOrder(s.admin, order.id, plain.supplierId),
      ).toEqual({
        ok: false,
        code: "BUSINESS_RULE_VIOLATION",
        rule: "not_technician",
      });
      expect(
        await sendServiceOrder(s.admin, order.id, retired.supplierId),
      ).toEqual({
        ok: false,
        code: "BUSINESS_RULE_VIOLATION",
        rule: "inactive_technician",
      });
      ok(await sendServiceOrder(s.admin, order.id, s.technicianId));
      expect((await detail(s, order.id)).technician).toEqual({
        id: s.technicianId,
        name: "Técnico Uno",
      });
    },
    TEST_TIMEOUT,
  );
});

describe("el ciclo de la orden (AC-3, AC-4, AC-5, AC-6)", () => {
  it(
    "recorre received → sent → quoted → approved → repaired → delivered y emite la venta sin tocar el stock",
    async () => {
      const s = await seed();
      const order = await newOrder(s);
      expect((await detail(s, order.id)).status).toBe("received");
      expect(order.displayNumber).toBe("OS-000001");
      ok(await sendServiceOrder(s.admin, order.id, s.technicianId));

      const form = ok(await getQuoteForm(s.admin, order.id));
      expect(form.form.customerCurrency).toBe("USD");
      expect(
        form.form.rows.find((row) => row.repairTypeId === s.screen)!.listPrice,
      ).toEqual({
        price: "200.00",
        priceCurrency: "USD",
        cost: "120.00",
        costCurrency: "USD",
      });
      // El presupuesto edita los montos de la lista antes de guardarlo.
      ok(
        await quoteServiceOrder(s.admin, order.id, {
          customerCurrency: "USD",
          technicianCurrency: "USD",
          lines: [
            { repairTypeId: s.battery, price: "75", cost: "35" },
            { repairTypeId: s.screen, price: "200", cost: "110" },
          ],
        }),
      );
      const quoted = await detail(s, order.id);
      expect(quoted).toMatchObject({
        status: "quoted",
        customerTotal: "275.00",
        technicianTotal: "145.00",
      });
      // Las líneas no cambian: otro presupuesto se rechaza (AC-4).
      expect(
        await quoteServiceOrder(s.admin, order.id, batteryQuote(s)),
      ).toEqual({
        ok: false,
        code: "BUSINESS_RULE_VIOLATION",
        rule: "invalid_transition",
        status: "quoted",
      });
      ok(await approveServiceOrder(s.admin, order.id));
      ok(await markServiceOrderRepaired(s.admin, order.id));
      // Una reparada no se cancela.
      expect(
        await cancelServiceOrder(s.admin, order.id, "customer_withdrew"),
      ).toEqual({
        ok: false,
        code: "BUSINESS_RULE_VIOLATION",
        rule: "invalid_transition",
        status: "repaired",
      });

      const delivered = await deliverServiceOrder(s.admin, order.id);
      if (!delivered.ok || delivered.sale === null) {
        throw new Error("entrega rechazada");
      }
      const sale = ok(await getSale(s.admin, delivered.sale.id)).sale;
      expect(sale).toMatchObject({
        orderId: null,
        clientId: s.clientId,
        currency: "USD",
        total: "275.00",
      });
      expect(sale.lines).toHaveLength(1);
      expect(sale.lines[0]).toMatchObject({
        productId: s.serviceProductId,
        quantity: "1.000",
        unitPrice: "275.00",
        lineTotal: "275.00",
      });
      expect(await serviceStockRows(s)).toBe(0);
      expect(await detail(s, order.id)).toMatchObject({
        status: "delivered",
        sale: {
          id: delivered.sale.id,
          displayNumber: delivered.sale.displayNumber,
          voidDisplayNumber: null,
        },
      });

      // Se cobra como cualquier venta (AC-5).
      const receipt = await createSaleReceipt(s.admin, {
        saleId: delivered.sale.id,
        paymentMethodId: s.transfer,
        amount: "275",
      });
      expect(receipt.ok).toBe(true);

      // La historia: el alta y cinco transiciones, sin el IMEI ni lo que reportó el cliente.
      const audit = ok(await listServiceOrderAudit(s.admin, order.id, 1));
      expect(audit.total).toBe(6);
      const diffs = JSON.stringify(audit.entries.map((entry) => entry.diff));
      expect(diffs).not.toContain("356789012345678");
      expect(diffs).not.toContain("batería dura");
    },
    TEST_TIMEOUT,
  );

  it(
    "una orden rechazada se entrega sin venta, y una cancelada no sigue",
    async () => {
      const s = await seed();
      const order = await orderAt(s, "quoted");
      ok(await rejectServiceOrder(s.admin, order.id));
      expect(await deliverServiceOrder(s.admin, order.id)).toEqual({
        ok: true,
        sale: null,
      });
      expect(await detail(s, order.id)).toMatchObject({
        status: "delivered",
        sale: null,
        repairedAt: null,
      });
      expect(await count(sql`select count(*)::int as count from sales`)).toBe(
        0,
      );

      for (const from of ["received", "sent", "quoted", "approved"] as const) {
        const other = await orderAt(s, from);
        ok(await cancelServiceOrder(s.admin, other.id, "not_repairable"));
        expect(await detail(s, other.id)).toMatchObject({
          status: "cancelled",
          cancelReason: "not_repairable",
        });
        expect(await deliverServiceOrder(s.admin, other.id)).toMatchObject({
          rule: "invalid_transition",
          status: "cancelled",
        });
      }
      expect(await cancelServiceOrder(s.admin, order.id, "no_existe")).toEqual({
        ok: false,
        code: "VALIDATION_ERROR",
      });
    },
    TEST_TIMEOUT,
  );

  it(
    "el presupuesto rechaza monedas mezcladas, un tipo inactivo y montos que no se leen",
    async () => {
      const s = await seed();
      // La pantalla en pesos: la lista del modelo queda con monedas mezcladas.
      ok(
        await setRepairPrice(s.admin, {
          repairTypeId: s.screen,
          modelId: s.modelId,
          price: "180000",
          priceCurrency: "ARS",
          cost: "120",
          costCurrency: "USD",
        }),
      );
      const order = await orderAt(s, "sent");
      expect(
        await quoteServiceOrder(s.admin, order.id, {
          customerCurrency: "USD",
          technicianCurrency: "USD",
          lines: [
            { repairTypeId: s.battery, price: "80", cost: "35" },
            { repairTypeId: s.screen, price: "200", cost: "120" },
          ],
        }),
      ).toEqual({
        ok: false,
        code: "BUSINESS_RULE_VIOLATION",
        rule: "line_rules",
        lines: [
          {
            position: 2,
            repairTypeId: s.screen,
            rule: "price_currency_mismatch",
          },
        ],
      });
      expect(
        await quoteServiceOrder(s.admin, order.id, {
          customerCurrency: "USD",
          technicianCurrency: "USD",
          lines: [{ repairTypeId: s.battery, price: "80,999", cost: "35" }],
        }),
      ).toEqual({
        ok: false,
        code: "VALIDATION_ERROR",
        reason: "lines",
        lines: [{ position: 1, field: "price", reason: "decimals" }],
      });
      expect(
        await quoteServiceOrder(s.admin, order.id, {
          customerCurrency: "USD",
          technicianCurrency: "USD",
          lines: [],
        }),
      ).toMatchObject({ code: "VALIDATION_ERROR", reason: "no_lines" });
      // Nada se escribió: la orden sigue mandada, sin líneas.
      expect(await detail(s, order.id)).toMatchObject({
        status: "sent",
        lines: [],
      });
    },
    TEST_TIMEOUT,
  );
});

describe("el trigger de la orden (AC-3)", () => {
  it(
    "rechaza las transiciones fuera de la lista, los cambios a lo ya fijado y las líneas fuera del presupuesto",
    async () => {
      const s = await seed();
      const received = await orderAt(s, "received");
      const reject = (query: SQL) =>
        expect(getDb().execute(query)).rejects.toThrow();
      await reject(
        sql`update service_orders set status = 'quoted', quoted_at = now() where id = ${received.id}`,
      );
      await reject(sql`delete from service_orders where id = ${received.id}`);
      await reject(
        sql`update service_orders set model_id = model_id, client_id = gen_random_uuid() where id = ${received.id}`,
      );
      await reject(
        sql`insert into service_orders (organization_id, number, client_id, model_id, reported_issue, created_by, status)
            values (${s.orgA}, 99, ${s.clientId}, ${s.modelId}, 'x', ${s.adminId}, 'sent')`,
      );
      await reject(
        sql`insert into service_order_lines (organization_id, service_order_id, repair_type_id, position, price, cost)
            values (${s.orgA}, ${received.id}, ${s.battery}, 1, 10, 5)`,
      );

      const repaired = await orderAt(s, "repaired");
      await reject(
        sql`update service_orders set status = 'cancelled', cancelled_at = now(), cancel_reason = 'other' where id = ${repaired.id}`,
      );
      await reject(
        sql`update service_orders set technician_total = 1 where id = ${repaired.id}`,
      );
      await reject(
        sql`update service_order_lines set price = 1 where service_order_id = ${repaired.id}`,
      );
      await reject(
        sql`delete from service_order_lines where service_order_id = ${repaired.id}`,
      );

      // El vaciado de datos de un cliente (D-11): solo el IMEI y lo que reportó, en cualquier estado.
      await getDb().execute(
        sql`update service_orders set device_serial = null, reported_issue = null where id = ${repaired.id}`,
      );
      expect(await detail(s, repaired.id)).toMatchObject({
        status: "repaired",
        deviceSerial: null,
        reportedIssue: null,
      });
    },
    TEST_TIMEOUT,
  );

  it(
    "cada transición fija solo sus columnas, ninguna sale de entregada o cancelada, y no entra una línea después del presupuesto",
    async () => {
      const s = await seed();
      // El mensaje del trigger, para que cada rechazo sea por la regla que se prueba.
      const rejection = async (query: SQL) => {
        try {
          await getDb().execute(query);
        } catch (error) {
          const e = error as { message?: string; cause?: { message?: string } };
          return e.cause?.message ?? e.message ?? "";
        }
        throw new Error("La consulta debía ser rechazada y no lo fue.");
      };

      const received = await orderAt(s, "received");
      expect(
        await rejection(
          sql`update service_orders set status = 'cancelled', cancelled_at = now(), cancel_reason = 'other',
              technician_id = ${s.technicianId}, sent_at = now() where id = ${received.id}`,
        ),
      ).toMatch(/solo fija/);
      const quoted = await orderAt(s, "quoted");
      expect(
        await rejection(
          sql`update service_orders set status = 'cancelled', cancelled_at = now(), cancel_reason = 'other',
              approved_at = now() where id = ${quoted.id}`,
        ),
      ).toMatch(/solo fija/);
      // Después del presupuesto no entra otra línea, aunque la orden siga presupuestada.
      expect(
        await rejection(
          sql`insert into service_order_lines (organization_id, service_order_id, repair_type_id, position, price, cost)
              values (${s.orgA}, ${quoted.id}, ${s.screen}, 2, 0.01, 0.01)`,
        ),
      ).toMatch(/pasan los totales/);

      ok(await rejectServiceOrder(s.admin, quoted.id));
      expect(
        await rejection(
          sql`update service_orders set status = 'approved', approved_at = now() where id = ${quoted.id}`,
        ),
      ).toMatch(/rejected -> approved no permitida/);
      const repaired = await orderAt(s, "repaired");
      ok(await deliverServiceOrder(s.admin, repaired.id));
      expect(
        await rejection(
          sql`update service_orders set status = 'cancelled', cancelled_at = now(), cancel_reason = 'other'
              where id = ${repaired.id}`,
        ),
      ).toMatch(/delivered -> cancelled no permitida/);
      const cancelled = await orderAt(s, "received");
      ok(await cancelServiceOrder(s.admin, cancelled.id, "other"));
      expect(
        await rejection(
          sql`update service_orders set status = 'sent', technician_id = ${s.technicianId}, sent_at = now()
              where id = ${cancelled.id}`,
        ),
      ).toMatch(/cancelled -> sent no permitida/);

      // El vaciado no arrastra otro cambio.
      expect(
        await rejection(
          sql`update service_orders set device_serial = null, reported_issue = null, technician_total = 1
              where id = ${repaired.id}`,
        ),
      ).toMatch(/sin cambio de estado no cambia nada/);

      // Una transición con exactamente sus columnas pasa también a mano.
      const manual = await orderAt(s, "received");
      await getDb().execute(
        sql`update service_orders set status = 'cancelled', cancelled_at = now(), cancel_reason = 'other',
            updated_at = now() where id = ${manual.id}`,
      );
      expect((await detail(s, manual.id)).status).toBe("cancelled");
    },
    TEST_TIMEOUT,
  );
});

describe("la anulación de la venta de una reparación (AC-5)", () => {
  it(
    "no toca el stock, deja la orden entregada y no se anula dos veces",
    async () => {
      const s = await seed();
      const order = await orderAt(s, "repaired");
      const delivered = await deliverServiceOrder(s.admin, order.id);
      if (!delivered.ok || delivered.sale === null) {
        throw new Error("entrega rechazada");
      }
      const voided = await voidSale(s.admin, delivered.sale.id, "other");
      expect(voided).toMatchObject({ ok: true, orderId: null });
      expect(await serviceStockRows(s)).toBe(0);
      const after = await detail(s, order.id);
      expect(after.status).toBe("delivered");
      expect(after.sale?.voidDisplayNumber).toBe("A-000001");
      expect(await voidSale(s.admin, delivered.sale.id, "other")).toMatchObject(
        { ok: false, rule: "already_voided" },
      );
    },
    TEST_TIMEOUT,
  );
});

describe("el producto de servicio fuera de su orden (AC-8)", () => {
  it(
    "se rechaza en el pedido, la venta, el ajuste, la orden de compra y la recepción, y el agente no lo ve",
    async () => {
      const s = await seed();
      const priceId = await returningId(
        sql`insert into product_prices (organization_id, product_id, amount, currency, created_by)
            values (${s.orgA}, ${s.serviceProductId}, 10, 'USD', ${s.adminId}) returning id`,
      );
      const line = {
        productId: s.serviceProductId,
        quantity: "1",
        expectedPriceId: priceId,
      };
      expect(
        await createOrder(s.admin, { clientId: s.clientId, lines: [line] }),
      ).toMatchObject({
        ok: false,
        rule: "line_rules",
        lines: [{ position: 1, rule: "service_product" }],
      });
      expect(
        await issueSale(s.admin, { clientId: "", lines: [line] }),
      ).toMatchObject({
        ok: false,
        rule: "line_rules",
        lines: [{ position: 1, rule: "service_product" }],
      });
      expect(
        await adjustStock(s.admin, s.serviceProductId, {
          type: "adjustment_positive",
          quantity: "1",
          expectedQuantityOnHand: "0",
          reason: "Conteo físico",
        }),
      ).toEqual({
        ok: false,
        code: "BUSINESS_RULE_VIOLATION",
        rule: "service_product",
      });
      expect(
        await changeProductTracking(s.admin, s.serviceProductId, "unit"),
      ).toEqual({
        ok: false,
        code: "BUSINESS_RULE_VIOLATION",
        rule: "service_product",
      });
      const purchaseLine = {
        productId: s.serviceProductId,
        quantity: "1",
        unitCost: "10",
      };
      expect(
        await createPurchaseOrder(s.admin, {
          supplierId: s.technicianId,
          currency: "USD",
          lines: [purchaseLine],
        }),
      ).toMatchObject({
        ok: false,
        rule: "line_rules",
        lines: [{ position: 1, rule: "service_product" }],
      });
      expect(
        await createGoodsReceipt(s.admin, {
          purchaseOrderId: null,
          supplierId: s.technicianId,
          currency: "USD",
          supplierReference: "",
          lines: [purchaseLine],
        }),
      ).toMatchObject({
        ok: false,
        rule: "line_rules",
        lines: [{ position: 1, rule: "service_product" }],
      });
      expect(
        await getActiveProductForService(s.orgA, s.serviceProductId),
      ).toBeNull();
      expect(
        await searchActiveProductsForService(s.orgA, {
          text: "Reparación",
          limit: 10,
        }),
      ).toEqual([]);
      expect(ok(await suggestProducts(s.admin, "Reparación")).products).toEqual(
        [],
      );
      expect(await serviceStockRows(s)).toBe(0);
      // La base es la última defensa.
      await expect(
        getDb().execute(
          sql`insert into inventories (organization_id, product_id) values (${s.orgA}, ${s.serviceProductId})`,
        ),
      ).rejects.toThrow();
      await expect(
        getDb().execute(
          sql`update products set is_service = false where id = ${s.serviceProductId}`,
        ),
      ).rejects.toThrow();
    },
    TEST_TIMEOUT,
  );
});

describe("la deuda con el técnico (AC-7)", () => {
  it(
    "una orden reparada va al debe de su cuenta y un pago a cuenta la cancela",
    async () => {
      const s = await seed();
      // Una orden que no se reparó no le debe nada.
      await orderAt(s, "approved");
      const empty = ok(
        await getSupplierAccountSummary(s.admin, s.technicianId),
      );
      expect(empty.currencies).toEqual([]);

      const first = await orderAt(s, "repaired");
      const second = await orderAt(s, "repaired");
      // Entregar no cambia lo que se le debe.
      ok(await deliverServiceOrder(s.admin, first.id));
      const summary = ok(
        await getSupplierAccountSummary(s.admin, s.technicianId),
      );
      expect(summary.currencies).toMatchObject([
        { currency: "USD", owed: "70.00", receiptsWithBalance: 2 },
      ]);
      const owed = ok(
        await listSuppliersOwed(s.admin, { currency: null, page: 1 }),
      );
      expect(owed.suppliers.rows).toMatchObject([
        { supplierId: s.technicianId, currency: "USD", owed: "70.00" },
      ]);

      // El tope del pago a cuenta no existe, pero lo pagado se aplica de la más vieja a la más nueva.
      const paid = await createSupplierPayment(s.admin, {
        target: "account",
        supplierId: s.technicianId,
        currency: "USD",
        amount: "35",
        paymentMethodId: s.transfer,
      });
      expect(paid.ok).toBe(true);
      const statement = ok(
        await getSupplierStatement(s.admin, s.technicianId),
      ).statement;
      expect(statement.currencies[0]!.receipts).toMatchObject([
        {
          kind: "service_order",
          id: first.id,
          displayNumber: first.displayNumber,
          outstanding: "0.00",
        },
        {
          kind: "service_order",
          id: second.id,
          outstanding: "35.00",
        },
      ]);
      expect(
        statement.documents.filter((doc) => doc.kind === "service_order"),
      ).toHaveLength(2);
    },
    TEST_TIMEOUT,
  );

  it(
    "una orden que se repara después no baja lo que falta de una recepción: toma el saldo a favor y suma al debe (D-9)",
    async () => {
      const s = await seed();
      const productId = (
        await getDb().execute<{ id: string }>(
          sql`insert into products (organization_id, sku, name)
              values (${s.orgA}, 'CAB-1', 'Cable') returning id`,
        )
      ).rows[0]!.id;
      const received = await createGoodsReceipt(s.admin, {
        purchaseOrderId: null,
        supplierId: s.technicianId,
        currency: "USD",
        supplierReference: "",
        lines: [{ productId, quantity: "1", unitCost: "50" }],
      });
      if (!received.ok) throw new Error("recepción rechazada");
      const receiptId = received.receipt.id;
      ok(
        await createSupplierPayment(s.admin, {
          target: "account",
          supplierId: s.technicianId,
          currency: "USD",
          amount: "60",
          paymentMethodId: s.transfer,
        }),
      );
      const outstanding = async () =>
        ok(await getGoodsReceiptPaymentForm(s.admin, receiptId)).form
          .outstanding;
      expect(await outstanding()).toBe("0.00");

      const order = await orderAt(s, "repaired");
      expect(await outstanding()).toBe("0.00");
      const statement = ok(
        await getSupplierStatement(s.admin, s.technicianId),
      ).statement;
      expect(statement.currencies[0]!.receipts).toMatchObject([
        { kind: "goods_receipt", id: receiptId, outstanding: "0.00" },
        { kind: "service_order", id: order.id, outstanding: "25.00" },
      ]);
      expect(
        ok(await getSupplierAccountSummary(s.admin, s.technicianId)).currencies,
      ).toMatchObject([{ currency: "USD", owed: "25.00" }]);
    },
    TEST_TIMEOUT,
  );
});

describe("dos entregas simultáneas (AC-9)", () => {
  it(
    "emiten una sola venta: las dos esperan la orden que retiene otra conexión",
    async () => {
      const s = await seed();
      const order = await orderAt(s, "repaired");
      const release = await hold(
        sql`select id from service_orders where id = ${order.id} for update`,
      );
      const first = deliverServiceOrder(s.admin, order.id);
      const second = deliverServiceOrder(s.admin, order.id);
      await waitForLockWaiters(2);
      await release();
      const results = await Promise.all([first, second]);
      expect(results.filter((result) => result.ok)).toHaveLength(1);
      expect(results.find((result) => !result.ok)).toEqual({
        ok: false,
        code: "BUSINESS_RULE_VIOLATION",
        rule: "invalid_transition",
        status: "delivered",
      });
      expect(await count(sql`select count(*)::int as count from sales`)).toBe(
        1,
      );
    },
    TEST_TIMEOUT,
  );
});

describe("el viewer (AC-10)", () => {
  it(
    "ve las órdenes sin el técnico ni el costo, y no las opera",
    async () => {
      const s = await seed();
      const order = await orderAt(s, "quoted");
      const seen = await detail(s, order.id, s.viewer);
      expect(seen).toMatchObject({
        technician: null,
        technicianCurrency: null,
        technicianTotal: null,
        customerTotal: "80.00",
      });
      expect(seen.lines.map((line) => line.cost)).toEqual([null]);
      expect(JSON.stringify(seen)).not.toContain("35.00");
      const listed = ok(
        await listServiceOrders(s.viewer, {
          status: "all",
          number: "",
          page: 1,
        }),
      );
      expect(listed.orders).toHaveLength(1);
      expect(await approveServiceOrder(s.viewer, order.id)).toEqual({
        ok: false,
        code: "FORBIDDEN",
      });
      expect(await listServiceOrderAudit(s.viewer, order.id, 1)).toEqual({
        ok: false,
        code: "FORBIDDEN",
      });
      expect(await getQuoteForm(s.viewer, order.id)).toEqual({
        ok: false,
        code: "FORBIDDEN",
      });
    },
    TEST_TIMEOUT,
  );
});

describe("el aislamiento y la capacidad (AC-11)", () => {
  it(
    "otra organización no ve las órdenes, y sin repairs nada existe",
    async () => {
      const s = await seed();
      const order = await newOrder(s);
      expect(await getServiceOrder(s.adminB, order.id)).toEqual({
        ok: false,
        code: "NOT_FOUND",
      });
      expect(
        ok(
          await listServiceOrders(s.adminB, {
            status: "all",
            number: "",
            page: 1,
          }),
        ).orders,
      ).toEqual([]);
      expect(
        await sendServiceOrder(s.adminB, order.id, s.technicianId),
      ).toEqual({ ok: false, code: "NOT_FOUND" });

      expect(await listRepairTypes(s.adminC)).toEqual({
        ok: false,
        code: "NOT_FOUND",
      });
      expect(
        await createServiceOrder(s.adminC, {
          clientId: s.clientId,
          modelId: s.modelId,
          deviceSerial: "",
          reportedIssue: "x",
        }),
      ).toEqual({ ok: false, code: "NOT_FOUND" });
      const supplierC = ok(
        await createSupplier(s.adminC, { name: "Proveedor C" }),
      );
      expect(
        await setSupplierTechnician(s.adminC, supplierC.supplierId, true),
      ).toEqual({ ok: false, code: "NOT_FOUND" });
      expect(await listClientServiceOrders(s.adminC, s.clientId)).toEqual({
        ok: false,
        code: "NOT_FOUND",
      });
    },
    TEST_TIMEOUT,
  );

  it(
    "las órdenes de un cliente, para su ficha, y el alta con datos que no se leen",
    async () => {
      const s = await seed();
      await newOrder(s);
      await newOrder(s, "");
      const listed = ok(await listClientServiceOrders(s.admin, s.clientId));
      expect(listed.total).toBe(2);
      expect(listed.orders[0]).toMatchObject({
        clientName: "Ana Cliente",
        modelName: "iPhone 13",
        status: "received",
      });
      expect(
        await createServiceOrder(s.admin, {
          clientId: "x",
          modelId: s.modelId,
          deviceSerial: "IMEI con espacios",
          reportedIssue: "  ",
        }),
      ).toEqual({
        ok: false,
        code: "VALIDATION_ERROR",
        fields: ["client", "deviceSerial", "reportedIssue"],
      });
      const inactive = await returningId(
        sql`insert into clients (organization_id, display_name, is_active)
            values (${s.orgA}, 'Inactivo', false) returning id`,
      );
      expect(
        await createServiceOrder(s.admin, {
          clientId: inactive,
          modelId: s.modelId,
          deviceSerial: "",
          reportedIssue: "No enciende",
        }),
      ).toEqual({
        ok: false,
        code: "BUSINESS_RULE_VIOLATION",
        rule: "inactive_client",
      });
    },
    TEST_TIMEOUT,
  );
});

// Operaciones, Actividad y el Resumen de la ficha del cliente (brief-24.4.3, D-2, D-5 y D-7).
describe("las órdenes de la ficha del cliente", () => {
  it(
    "da las fechas de cada estado y si sigue abierta, para los dos roles, sin el IMEI del equipo",
    async () => {
      const s = await seed();
      const open = await orderAt(s, "repaired");
      const closed = await newOrder(s, "");
      ok(await cancelServiceOrder(s.admin, closed.id, "customer_withdrew"));

      const listed = ok(
        await listClientOperationServiceOrders(s.viewer, s.clientId),
      );
      expect(listed.total).toBe(2);
      const byId = new Map(listed.orders.map((order) => [order.id, order]));
      expect(byId.get(open.id)).toMatchObject({
        status: "repaired",
        open: true,
      });
      expect(byId.get(open.id)?.sentAt).toBeInstanceOf(Date);
      expect(byId.get(open.id)?.quotedAt).toBeInstanceOf(Date);
      expect(byId.get(open.id)?.repairedAt).toBeInstanceOf(Date);
      expect(byId.get(closed.id)).toMatchObject({ open: false });
      expect(byId.get(closed.id)?.cancelledAt).toBeInstanceOf(Date);
      expect(JSON.stringify(listed.orders)).not.toContain("356789012345678");
    },
    TEST_TIMEOUT,
  );

  it(
    "el Resumen y la lista dan la misma cantidad, con más de 5 órdenes (AC-7)",
    async () => {
      const s = await seed();
      for (let i = 0; i < 7; i++) await newOrder(s, "");
      const closed = await newOrder(s, "");
      ok(await cancelServiceOrder(s.admin, closed.id, "customer_withdrew"));

      const summary = ok(
        await listOpenClientServiceOrders(s.admin, s.clientId),
      );
      const list = ok(
        await countOpenServiceOrdersByClient(s.admin, [s.clientId]),
      );
      expect(summary.total).toBe(7);
      expect(summary.orders).toHaveLength(7);
      expect(list.counts.get(s.clientId)).toBe(summary.total);
      expect(summary.orders.map((order) => order.id)).not.toContain(closed.id);
    },
    TEST_TIMEOUT,
  );

  it(
    "corta en el tope con la cantidad real, y sin repairs no existe",
    async () => {
      const s = await seed();
      await newOrder(s, "");
      await getDb().execute(
        sql`insert into service_orders
             select (jsonb_populate_record(o, jsonb_build_object(
               'id', gen_random_uuid(), 'number', o.number + n))).*
             from service_orders o, generate_series(1, ${CLIENT_OPERATION_SERVICE_ORDERS_LIMIT}) n`,
      );
      const capped = ok(
        await listClientOperationServiceOrders(s.admin, s.clientId),
      );
      expect(capped.total).toBe(CLIENT_OPERATION_SERVICE_ORDERS_LIMIT + 1);
      expect(capped.orders).toHaveLength(CLIENT_OPERATION_SERVICE_ORDERS_LIMIT);

      const notFound = { ok: false, code: "NOT_FOUND" };
      expect(
        await listClientOperationServiceOrders(s.adminC, s.clientId),
      ).toEqual(notFound);
      expect(await listOpenClientServiceOrders(s.adminC, s.clientId)).toEqual(
        notFound,
      );
      expect(
        ok(await listClientOperationServiceOrders(s.adminB, s.clientId)).total,
      ).toBe(0);
    },
    TEST_TIMEOUT,
  );
});

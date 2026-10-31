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
  createSupplierPayment,
  getSupplierAccountSummary,
  getSupplierStatement,
  listPaymentMethods,
} from "@/modules/cash";
import {
  createModel,
  createProduct,
  createServiceProduct,
  type ProductInput,
} from "@/modules/catalog";
import {
  changeProductTracking,
  countUnitsByStatus,
  correctUnit,
  listProductUnits,
  registerUnit,
  releaseUnit,
  returnUnitFromRepair,
  writeOffUnit,
} from "@/modules/inventory";
import { confirmOrder, createOrder } from "@/modules/orders";
import {
  activateCapability,
  getAuthContext,
  getProfile,
  type AuthContext,
} from "@/modules/organizations";
import { createSupplier, setSupplierTechnician } from "@/modules/purchasing";
import { issueSale } from "@/modules/sales";
import {
  applyRepairTypeTemplate,
  cancelServiceOrder,
  createOwnUnitServiceOrder,
  createServiceOrder,
  deliverServiceOrder,
  getOwnUnitRepairForm,
  getServiceOrder,
  listRepairTypes,
  listServiceOrders,
  listUnitServiceOrders,
  markOwnUnitRepaired,
  markServiceOrderRepaired,
  quoteServiceOrder,
  sendServiceOrder,
  setRepairPrice,
} from "@/modules/service";
import { getDb } from "@/shared/db";
import { resetDatabase } from "./reset-database";
import { expectStockInvariant } from "./stock-invariant";

// Las reparaciones de unidades propias contra PostgreSQL real (brief-29.6.2, D-10): mandar a reparar
// desde disponible y desde revisión, marcarla reparada con el costo sumado y su auditoría, cancelarla,
// liberarla y venderla; la baja y la corrección en revisión (U-2 y U-3), la moneda del costo (U-1); la
// orden propia en la cuenta del técnico; cada rechazo de los triggers por su mensaje; una sola orden
// abierta por unidad; mandar a reparar contra confirmar un pedido, forzado con una tercera conexión; el
// viewer, y una organización sin repairs. El invariante del saldo corre después de cada test.

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

// Lo que hace org:capability --profile iphone: las capacidades, los tipos de ejemplo y el producto de
// servicio. Con only, solo esas capacidades, sin tipos ni producto de servicio.
async function activate(
  organizationId: string,
  adminEmail: string,
  only?: ("serialized_units" | "variants")[],
) {
  const profile = getProfile("iphone")!;
  await getDb().transaction(async (tx) => {
    let actorUserId = "";
    for (const capability of only ?? profile.capabilities) {
      const activated = await activateCapability(tx, {
        organizationId,
        capability,
        adminEmail,
      });
      if (!activated.ok) throw new Error(activated.code);
      actorUserId = activated.actorUserId;
    }
    if (only) return;
    await applyRepairTypeTemplate(tx, {
      organizationId,
      actorUserId,
      repairTypes: profile.repairTypes,
    });
    await createServiceProduct(tx, { organizationId, actorUserId });
  });
}

function productInput(sku: string): ProductInput {
  return {
    sku,
    name: `iPhone ${sku}`,
    description: null,
    unit: "unidad",
    reorderPoint: "0",
    brand: null,
    category: null,
    condition: "new",
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
    sql`insert into organizations (name, main_currency) values ('iPhone A', 'USD') returning id`,
  );
  const orgC = await returningId(
    sql`insert into organizations (name, main_currency) values ('Sin reparaciones', 'USD') returning id`,
  );
  const admin = await member(orgA, "admin-a@example.com", "admin");
  const viewer = await member(orgA, "viewer-a@example.com", "viewer");
  const adminC = await member(orgC, "admin-c@example.com", "admin");
  await activate(orgA, "admin-a@example.com");
  await activate(orgC, "admin-c@example.com", ["serialized_units"]);

  const model = ok(
    await createModel(admin.context, { name: "iPhone 13", brand: "Apple" }),
  );
  const types = ok(await listRepairTypes(admin.context));
  const typeId = (name: string) =>
    types.types.find((type) => type.name === name)!.id;
  const battery = typeId("Cambio de batería");
  const screen = typeId("Cambio de pantalla");
  const camera = typeId("Cámara trasera");
  const price = async (
    repairTypeId: string,
    cost: string,
    costCurrency = "USD",
  ) =>
    ok(
      await setRepairPrice(admin.context, {
        repairTypeId,
        modelId: model.modelId,
        price: "100",
        priceCurrency: "USD",
        cost,
        costCurrency,
      }),
    );
  await price(battery, "35");
  await price(screen, "120");
  // Un costo de la lista en otra moneda que la de la unidad: no se propone (U-1).
  await price(camera, "40000", "ARS");

  const technician = ok(
    await createSupplier(admin.context, { name: "Técnico Uno" }),
  );
  ok(await setSupplierTechnician(admin.context, technician.supplierId, true));
  const notTechnician = ok(
    await createSupplier(admin.context, { name: "Mayorista" }),
  );
  await createInitialPaymentMethods(admin.context);
  const methods = ok(await listPaymentMethods(admin.context));
  const transfer = methods.paymentMethods.find(
    (method) => method.name === "Transferencia",
  )!.id;
  const clientId = await returningId(
    sql`insert into clients (organization_id, display_name) values (${orgA}, 'Ana Cliente') returning id`,
  );

  return {
    orgA,
    orgC,
    admin: admin.context,
    adminId: admin.userId,
    viewer: viewer.context,
    adminC: adminC.context,
    adminCId: adminC.userId,
    modelId: model.modelId,
    battery,
    screen,
    camera,
    technicianId: technician.supplierId,
    notTechnicianId: notTechnician.supplierId,
    transfer,
    clientId,
  };
}

type Seed = Awaited<ReturnType<typeof seed>>;

// Un producto por unidad, con su modelo y su precio, y una unidad disponible.
async function phone(
  s: Seed,
  sku: string,
  {
    serial = `IMEI${sku}`,
    currency = "USD",
    withModel = true,
    context = s.admin,
    orgId = s.orgA,
    userId = s.adminId,
  } = {},
) {
  const created = ok(await createProduct(context, productInput(sku)));
  ok(await changeProductTracking(context, created.productId, "unit"));
  if (withModel) {
    await getDb().execute(
      sql`update products set model_id = ${s.modelId} where id = ${created.productId}`,
    );
  }
  const priceId = await returningId(
    sql`insert into product_prices (organization_id, product_id, amount, currency, created_by)
        values (${orgId}, ${created.productId}, '900.00', 'USD', ${userId}) returning id`,
  );
  const unit = ok(
    await registerUnit(context, created.productId, {
      serial,
      cost: "450",
      currency,
      gradeId: "",
      batteryHealth: "",
    }),
  );
  return { productId: created.productId, priceId, unitId: unit.unitId, serial };
}

async function unitRow(unitId: string) {
  const result = await getDb().execute<{
    status: string;
    cost: string;
    cost_currency: string;
  }>(
    sql`select status::text as status, cost, cost_currency from stock_units where id = ${unitId}`,
  );
  return result.rows[0]!;
}

async function onHand(productId: string): Promise<string | null> {
  const result = await getDb().execute<{ on_hand: string }>(
    sql`select quantity_on_hand as on_hand from inventories where product_id = ${productId}`,
  );
  return result.rows[0]?.on_hand ?? null;
}

async function movementTypes(productId: string): Promise<string[]> {
  const result = await getDb().execute<{ type: string }>(
    sql`select type::text as type from inventory_movements
        where product_id = ${productId} order by created_at`,
  );
  return result.rows.map((row) => row.type);
}

async function sendToRepair(s: Seed, unitId: string, context = s.admin) {
  return createOwnUnitServiceOrder(context, unitId, {
    technicianId: s.technicianId,
    reportedIssue: "La batería no carga.",
  });
}

const batteryLine = (s: Seed, cost = "35") => [
  { repairTypeId: s.battery, cost },
];

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

describe("el ciclo de una unidad propia (AC-1, AC-2 y AC-4)", () => {
  it(
    "una disponible va a reparar, vuelve con el costo sumado, se libera y se vende",
    async () => {
      const s = await seed();
      const unit = await phone(s, "13");
      expect(await onHand(unit.productId)).toBe("1.000");

      const sent = ok(await sendToRepair(s, unit.unitId));
      expect(await unitRow(unit.unitId)).toMatchObject({ status: "in_repair" });
      expect(await onHand(unit.productId)).toBe("0.000");
      const order = ok(await getServiceOrder(s.admin, sent.order.id)).order;
      expect(order).toMatchObject({
        kind: "own_unit",
        status: "sent",
        clientId: null,
        client: null,
        unit: {
          id: unit.unitId,
          serial: unit.serial,
          status: "in_repair",
          productId: unit.productId,
        },
        model: { id: s.modelId },
        technician: { id: s.technicianId, name: "Técnico Uno" },
        reportedIssue: "La batería no carga.",
      });
      const reason = await getDb().execute<{ reason: string }>(
        sql`select reason from inventory_movements
            where product_id = ${unit.productId} and type::text = 'unit_to_repair'`,
      );
      expect(reason.rows).toEqual([{ reason: sent.order.displayNumber }]);

      ok(
        await markOwnUnitRepaired(s.admin, sent.order.id, [
          { repairTypeId: s.battery, cost: "35" },
          { repairTypeId: s.screen, cost: "100,50" },
        ]),
      );
      expect(await unitRow(unit.unitId)).toEqual({
        status: "in_review",
        cost: "585.50",
        cost_currency: "USD",
      });
      expect(await onHand(unit.productId)).toBe("0.000");
      const repaired = ok(await getServiceOrder(s.admin, sent.order.id)).order;
      expect(repaired).toMatchObject({
        status: "repaired",
        technicianCurrency: "USD",
        technicianTotal: "135.50",
        customerTotal: null,
        sale: null,
      });
      expect(repaired.lines).toMatchObject([
        { repairTypeId: s.battery, price: null, cost: "35.00" },
        { repairTypeId: s.screen, price: null, cost: "100.50" },
      ]);
      const audit = await getDb().execute<{ diff: unknown }>(
        sql`select diff from audit_logs
            where entity_id = ${unit.unitId} and action::text = 'cost_change'`,
      );
      expect(audit.rows).toEqual([
        {
          diff: {
            before: { cost: "450.00", cost_currency: "USD", reference: null },
            after: {
              cost: "585.50",
              cost_currency: "USD",
              reference: sent.order.displayNumber,
            },
          },
        },
      ]);

      expect(await releaseUnit(s.admin, unit.unitId)).toEqual({
        ok: true,
        productId: unit.productId,
      });
      expect(await unitRow(unit.unitId)).toMatchObject({ status: "available" });
      expect(await onHand(unit.productId)).toBe("1.000");
      ok(
        await issueSale(s.admin, {
          clientId: "",
          lines: [
            {
              productId: unit.productId,
              quantity: "",
              expectedPriceId: unit.priceId,
              serials: unit.serial,
            },
          ],
        }),
      );
      expect(await unitRow(unit.unitId)).toMatchObject({ status: "sold" });
      expect(await movementTypes(unit.productId)).toEqual([
        "adjustment_positive",
        "unit_to_repair",
        "unit_released",
        "sale",
      ]);
    },
    TEST_TIMEOUT,
  );

  it(
    "desde revisión va a reparar sin tocar el saldo, y cancelar la devuelve sin cambiar el costo (AC-3)",
    async () => {
      const s = await seed();
      const unit = await phone(s, "14");
      const first = ok(await sendToRepair(s, unit.unitId));
      ok(await markOwnUnitRepaired(s.admin, first.order.id, batteryLine(s)));
      expect(await unitRow(unit.unitId)).toMatchObject({
        status: "in_review",
        cost: "485.00",
      });

      const second = ok(await sendToRepair(s, unit.unitId));
      expect(await unitRow(unit.unitId)).toMatchObject({ status: "in_repair" });
      expect(await movementTypes(unit.productId)).toEqual([
        "adjustment_positive",
        "unit_to_repair",
      ]);
      ok(await cancelServiceOrder(s.admin, second.order.id, "not_repairable"));
      expect(await unitRow(unit.unitId)).toEqual({
        status: "in_review",
        cost: "485.00",
        cost_currency: "USD",
      });
      expect(
        ok(await getServiceOrder(s.admin, second.order.id)).order,
      ).toMatchObject({ status: "cancelled", cancelReason: "not_repairable" });
      // Las órdenes de la unidad, de la más nueva a la más vieja.
      const orders = await listUnitServiceOrders(s.admin, [unit.unitId]);
      expect(orders.get(unit.unitId)).toMatchObject([
        { id: second.order.id, status: "cancelled" },
        { id: first.order.id, status: "repaired" },
      ]);
    },
    TEST_TIMEOUT,
  );

  it(
    "«En curso» lista la orden propia mientras está en el técnico, no después",
    async () => {
      const s = await seed();
      const unit = await phone(s, "15");
      const sent = ok(await sendToRepair(s, unit.unitId));
      const open = async () =>
        ok(
          await listServiceOrders(s.admin, {
            status: "open",
            kind: "own_unit",
            number: "",
            page: 1,
          }),
        ).orders.map((order) => order.id);
      expect(await open()).toEqual([sent.order.id]);
      const listed = ok(
        await listServiceOrders(s.admin, {
          status: "all",
          number: "",
          page: 1,
        }),
      ).orders;
      expect(listed).toMatchObject([
        {
          kind: "own_unit",
          clientId: null,
          unitSerial: unit.serial,
        },
      ]);
      ok(await markOwnUnitRepaired(s.admin, sent.order.id, batteryLine(s)));
      expect(await open()).toEqual([]);
    },
    TEST_TIMEOUT,
  );
});

describe("los rechazos al mandar a reparar (AC-1 y AC-7)", () => {
  it(
    "una reservada, vendida, dada de baja o en reparación no va; tampoco sin modelo ni a quien no es técnico",
    async () => {
      const s = await seed();
      const notAvailable = {
        ok: false,
        code: "BUSINESS_RULE_VIOLATION",
        rule: "unit_not_available",
      };
      // Reservada por un pedido confirmado.
      const reserved = await phone(s, "20");
      const order = ok(
        await createOrder(s.admin, {
          clientId: s.clientId,
          lines: [
            {
              productId: reserved.productId,
              quantity: "",
              expectedPriceId: reserved.priceId,
              serials: reserved.serial,
              expectedLineTotal: "",
            },
          ],
        }),
      );
      ok(await confirmOrder(s.admin, order.order.id));
      expect(await sendToRepair(s, reserved.unitId)).toEqual(notAvailable);

      // Vendida.
      const sold = await phone(s, "21");
      ok(
        await issueSale(s.admin, {
          clientId: "",
          lines: [
            {
              productId: sold.productId,
              quantity: "",
              expectedPriceId: sold.priceId,
              serials: sold.serial,
            },
          ],
        }),
      );
      expect(await sendToRepair(s, sold.unitId)).toEqual(notAvailable);

      // Dada de baja.
      const gone = await phone(s, "22");
      ok(await writeOffUnit(s.admin, gone.unitId, "Rota"));
      expect(await sendToRepair(s, gone.unitId)).toEqual(notAvailable);

      // Ya en reparación: una sola orden abierta por unidad.
      const busy = await phone(s, "23");
      ok(await sendToRepair(s, busy.unitId));
      expect(await sendToRepair(s, busy.unitId)).toEqual(notAvailable);
      expect(
        await count(
          sql`select count(*)::int as count from service_orders where unit_id = ${busy.unitId}`,
        ),
      ).toBe(1);

      // Sin modelo, y con un proveedor que no es técnico.
      const bare = await phone(s, "24", { withModel: false });
      expect(await sendToRepair(s, bare.unitId)).toEqual({
        ok: false,
        code: "BUSINESS_RULE_VIOLATION",
        rule: "unit_without_model",
      });
      const fine = await phone(s, "25");
      expect(
        await createOwnUnitServiceOrder(s.admin, fine.unitId, {
          technicianId: s.notTechnicianId,
          reportedIssue: "Pantalla",
        }),
      ).toEqual({
        ok: false,
        code: "BUSINESS_RULE_VIOLATION",
        rule: "not_technician",
      });
      expect(
        await createOwnUnitServiceOrder(s.admin, fine.unitId, {
          technicianId: s.technicianId,
          reportedIssue: "  ",
        }),
      ).toEqual({
        ok: false,
        code: "VALIDATION_ERROR",
        fields: ["reportedIssue"],
      });
      // Ningún rechazo dejó una orden, un movimiento ni una unidad cambiada.
      expect(await unitRow(fine.unitId)).toMatchObject({ status: "available" });
      expect(await movementTypes(fine.productId)).toEqual([
        "adjustment_positive",
      ]);
    },
    TEST_TIMEOUT,
  );

  it(
    "el índice único es la última defensa: una segunda orden abierta de la misma unidad no entra",
    async () => {
      const s = await seed();
      const unit = await phone(s, "26");
      const sent = ok(await sendToRepair(s, unit.unitId));
      const message = await rejection(
        getDb().execute(
          sql`insert into service_orders (organization_id, number, kind, unit_id, model_id,
                reported_issue, technician_id, status, sent_at, created_by)
              values (${s.orgA}, 99, 'own_unit', ${unit.unitId}, ${s.modelId}, 'Otra',
                ${s.technicianId}, 'sent', now(), ${s.adminId})`,
        ),
      );
      expect(message).toMatch(/service_orders_unit_open_unique/);
      expect(sent.order.number).toBe(1);
    },
    TEST_TIMEOUT,
  );
});

describe("la moneda, la baja y la corrección en revisión (AC-11)", () => {
  it(
    "la orden va en la moneda del costo de la unidad, y la lista propone solo los costos en esa moneda (U-1)",
    async () => {
      const s = await seed();
      const unit = await phone(s, "30", { currency: "ARS" });
      const sent = ok(await sendToRepair(s, unit.unitId));
      const form = ok(await getOwnUnitRepairForm(s.admin, sent.order.id)).form;
      expect(form.currency).toBe("ARS");
      const listCost = (id: string) =>
        form.rows.find((row) => row.repairTypeId === id)?.listCost;
      // La batería y la pantalla tienen su costo en USD: no se proponen. La cámara, en ARS, sí.
      expect(listCost(s.battery)).toBeNull();
      expect(listCost(s.screen)).toBeNull();
      expect(listCost(s.camera)).toBe("40000.00");
      ok(
        await markOwnUnitRepaired(s.admin, sent.order.id, [
          { repairTypeId: s.battery, cost: "50000" },
        ]),
      );
      expect(await unitRow(unit.unitId)).toEqual({
        status: "in_review",
        cost: "50450.00",
        cost_currency: "ARS",
      });
      expect(
        ok(await getServiceOrder(s.admin, sent.order.id)).order,
      ).toMatchObject({
        technicianCurrency: "ARS",
        technicianTotal: "50000.00",
      });
    },
    TEST_TIMEOUT,
  );

  it(
    "inventory rechaza sumar un costo en otra moneda que el de la unidad, sin escribir",
    async () => {
      const s = await seed();
      const unit = await phone(s, "31");
      ok(await sendToRepair(s, unit.unitId));
      const result = await getDb().transaction((tx) =>
        returnUnitFromRepair(tx, {
          organizationId: s.orgA,
          unitId: unit.unitId,
          amount: "35.00",
          currency: "ARS",
          reference: "OS-000001",
          createdBy: s.adminId,
        }),
      );
      expect(result).toEqual({ ok: false, reason: "cost_currency_mismatch" });
      expect(await unitRow(unit.unitId)).toMatchObject({
        status: "in_repair",
        cost: "450.00",
      });
    },
    TEST_TIMEOUT,
  );

  it(
    "una unidad en revisión se corrige y se da de baja sin movimiento (U-2 y U-3)",
    async () => {
      const s = await seed();
      const unit = await phone(s, "32");
      const sent = ok(await sendToRepair(s, unit.unitId));
      ok(await markOwnUnitRepaired(s.admin, sent.order.id, batteryLine(s)));
      expect(
        await correctUnit(s.admin, unit.unitId, {
          gradeId: "",
          batteryHealth: "100",
        }),
      ).toEqual({ ok: true, changed: true, productId: unit.productId });
      const before = await movementTypes(unit.productId);
      expect(await writeOffUnit(s.admin, unit.unitId, "Sin arreglo")).toEqual({
        ok: true,
        productId: unit.productId,
        from: "in_review",
      });
      expect(await unitRow(unit.unitId)).toMatchObject({
        status: "written_off",
      });
      expect(await movementTypes(unit.productId)).toEqual(before);
      expect(await onHand(unit.productId)).toBe("0.000");
      // Una dada de baja no se libera.
      expect(await releaseUnit(s.admin, unit.unitId)).toEqual({
        ok: false,
        code: "BUSINESS_RULE_VIOLATION",
        rule: "unit_not_in_review",
      });
    },
    TEST_TIMEOUT,
  );
});

describe("la cuenta del técnico (AC-6)", () => {
  it(
    "la orden propia reparada va al debe de su cuenta y un pago a cuenta la cancela",
    async () => {
      const s = await seed();
      const unit = await phone(s, "40");
      const sent = ok(await sendToRepair(s, unit.unitId));
      expect(
        ok(await getSupplierAccountSummary(s.admin, s.technicianId)).currencies,
      ).toEqual([]);
      ok(await markOwnUnitRepaired(s.admin, sent.order.id, batteryLine(s)));
      expect(
        ok(await getSupplierAccountSummary(s.admin, s.technicianId)).currencies,
      ).toMatchObject([{ currency: "USD", owed: "35.00" }]);
      ok(
        await createSupplierPayment(s.admin, {
          target: "account",
          supplierId: s.technicianId,
          currency: "USD",
          amount: "35",
          paymentMethodId: s.transfer,
        }),
      );
      const statement = ok(
        await getSupplierStatement(s.admin, s.technicianId),
      ).statement;
      expect(statement.currencies[0]!.receipts).toMatchObject([
        {
          kind: "service_order",
          id: sent.order.id,
          displayNumber: sent.order.displayNumber,
          outstanding: "0.00",
        },
      ]);
    },
    TEST_TIMEOUT,
  );
});

describe("los triggers de la orden propia y de la unidad (AC-5)", () => {
  it(
    "rechazan cada transición que no es la suya, cada una por su mensaje",
    async () => {
      const s = await seed();
      const unit = await phone(s, "50");
      const sent = ok(await sendToRepair(s, unit.unitId));
      const id = sent.order.id;
      const update = (set: SQL) =>
        rejection(
          getDb().execute(
            sql`update service_orders set ${set} where id = ${id}`,
          ),
        );

      // La orden propia no pasa por el presupuesto ni la entrega.
      expect(
        await update(
          sql`status = 'quoted', quoted_at = now(), customer_currency = 'USD', customer_total = 1,
              technician_currency = 'USD', technician_total = 1`,
        ),
      ).toMatch(/transición sent -> quoted no permitida/);
      // Marcarla reparada fija solo lo del técnico y la fecha.
      expect(
        await update(
          sql`status = 'repaired', repaired_at = now(), technician_currency = 'USD',
              technician_total = 1, reported_issue = 'Otra cosa'`,
        ),
      ).toMatch(/la transición sent -> repaired solo fija/);
      // Una línea con precio al cliente.
      ok(await markOwnUnitRepaired(s.admin, id, batteryLine(s, "10")));
      expect(
        await update(sql`status = 'delivered', delivered_at = now()`),
      ).toMatch(/transición repaired -> delivered no permitida/);
      expect(
        await rejection(
          getDb().execute(
            sql`insert into service_order_lines (organization_id, service_order_id, repair_type_id, position, price, cost)
                values (${s.orgA}, ${id}, ${s.screen}, 2, 1, 0.01)`,
          ),
        ),
      ).toMatch(/una unidad propia no tiene precio al cliente/);
      expect(
        await rejection(
          getDb().execute(
            sql`insert into service_order_lines (organization_id, service_order_id, repair_type_id, position, cost)
                values (${s.orgA}, ${id}, ${s.screen}, 2, 0.01)`,
          ),
        ),
      ).toMatch(/las líneas pasan los totales del presupuesto/);
      // Una orden propia no nace recibida, ni sin unidad.
      expect(
        await rejection(
          getDb().execute(
            sql`insert into service_orders (organization_id, number, kind, unit_id, model_id,
                  reported_issue, created_by)
                values (${s.orgA}, 98, 'own_unit', ${unit.unitId}, ${s.modelId}, 'Otra', ${s.adminId})`,
          ),
        ),
      ).toMatch(/nace mandada al técnico/);
      expect(
        await rejection(
          getDb().execute(
            sql`insert into service_orders (organization_id, number, kind, client_id, model_id,
                  reported_issue, technician_id, status, sent_at, created_by)
                values (${s.orgA}, 97, 'own_unit', ${s.clientId}, ${s.modelId}, 'Otra',
                  ${s.technicianId}, 'sent', now(), ${s.adminId})`,
          ),
        ),
      ).toMatch(/service_orders_kind_subject/);
      // Ni nace con la reparación hecha y el costo del técnico (revisión independiente, hallazgo 1).
      expect(
        await rejection(
          getDb().execute(
            sql`insert into service_orders (organization_id, number, kind, unit_id, model_id,
                  reported_issue, technician_id, status, sent_at, repaired_at,
                  technician_currency, technician_total, created_by)
                values (${s.orgA}, 96, 'own_unit', ${unit.unitId}, ${s.modelId}, 'Otra',
                  ${s.technicianId}, 'sent', now(), now(), 'USD', 500, ${s.adminId})`,
          ),
        ),
      ).toMatch(/nace mandada al técnico/);

      // La unidad: de revisión no vuelve a disponible sin liberarla por inventory, pero el trigger
      // admite la transición; lo que no admite es saltar de reparación a disponible, bajar el costo,
      // cambiarlo fuera de la vuelta de reparación ni cambiar su moneda.
      const unitUpdate = (set: SQL) =>
        rejection(
          getDb().execute(
            sql`update stock_units set ${set} where id = ${unit.unitId}`,
          ),
        );
      expect(await unitUpdate(sql`cost = 1000`)).toMatch(
        /el costo solo sube al volver de reparación/,
      );
      expect(await unitUpdate(sql`cost_currency = 'ARS'`)).toMatch(
        /la moneda del costo no cambia/,
      );
      expect(await unitUpdate(sql`status = 'sold'`)).toMatch(
        /transición in_review -> sold no permitida/,
      );
      const again = ok(await sendToRepair(s, unit.unitId));
      expect(await unitUpdate(sql`status = 'available'`)).toMatch(
        /transición in_repair -> available no permitida/,
      );
      expect(await unitUpdate(sql`status = 'in_review', cost = 1`)).toMatch(
        /el costo solo sube al volver de reparación/,
      );
      ok(await cancelServiceOrder(s.admin, again.order.id, "other"));
    },
    TEST_TIMEOUT,
  );

  it(
    "rechazan el resto de las transiciones y columnas, una por una (D-10)",
    async () => {
      const s = await seed();
      const unit = await phone(s, "52");
      const sent = ok(await sendToRepair(s, unit.unitId));
      const id = sent.order.id;
      const update = (set: SQL) =>
        rejection(
          getDb().execute(
            sql`update service_orders set ${set} where id = ${id}`,
          ),
        );
      const unitUpdate = (set: SQL) =>
        rejection(
          getDb().execute(
            sql`update stock_units set ${set} where id = ${unit.unitId}`,
          ),
        );

      // La orden propia mandada: ni pasa al camino del cliente ni cambia lo que la ata a la unidad.
      for (const to of ["approved", "rejected", "received"]) {
        expect(await update(sql`status = ${to}::service_order_status`)).toMatch(
          new RegExp(`transición sent -> ${to} no permitida`),
        );
      }
      const other = await phone(s, "53");
      expect(await update(sql`unit_id = ${other.unitId}`)).toMatch(
        /sin cambio de estado no cambia nada/,
      );
      expect(
        await update(
          sql`kind = 'customer_device', client_id = ${s.clientId}, unit_id = null`,
        ),
      ).toMatch(/sin cambio de estado no cambia nada/);
      expect(
        await update(
          sql`status = 'cancelled', cancelled_at = now(), cancel_reason = 'other',
              reported_issue = 'Otra cosa'`,
        ),
      ).toMatch(/la transición sent -> cancelled solo fija/);

      // La unidad en reparación no se da de baja, ni se reserva, ni se vende.
      for (const to of ["written_off", "reserved", "sold"]) {
        expect(
          await unitUpdate(sql`status = ${to}::stock_unit_status`),
        ).toMatch(new RegExp(`transición in_repair -> ${to} no permitida`));
      }
      ok(await markOwnUnitRepaired(s.admin, id, batteryLine(s)));
      // Reparada es final.
      expect(
        await update(
          sql`status = 'cancelled', cancelled_at = now(), cancel_reason = 'other'`,
        ),
      ).toMatch(/transición repaired -> cancelled no permitida/);
      // La unidad en revisión no se reserva; una disponible no pasa a revisión sin el técnico.
      expect(await unitUpdate(sql`status = 'reserved'`)).toMatch(
        /transición in_review -> reserved no permitida/,
      );
      expect(
        await rejection(
          getDb().execute(
            sql`update stock_units set status = 'in_review' where id = ${other.unitId}`,
          ),
        ),
      ).toMatch(/transición available -> in_review no permitida/);

      // La línea de un equipo de cliente lleva precio.
      const customer = ok(
        await createServiceOrder(s.admin, {
          clientId: s.clientId,
          modelId: s.modelId,
          deviceSerial: "",
          reportedIssue: "La batería dura poco.",
        }),
      ).order.id;
      ok(await sendServiceOrder(s.admin, customer, s.technicianId));
      ok(
        await quoteServiceOrder(s.admin, customer, {
          customerCurrency: "USD",
          technicianCurrency: "USD",
          lines: [{ repairTypeId: s.battery, price: "80", cost: "35" }],
        }),
      );
      expect(
        await rejection(
          getDb().execute(
            sql`insert into service_order_lines (organization_id, service_order_id, repair_type_id, position, cost)
                values (${s.orgA}, ${customer}, ${s.screen}, 1, 0.01)`,
          ),
        ),
      ).toMatch(/la línea de un equipo de cliente tiene precio/);
    },
    TEST_TIMEOUT,
  );

  it(
    "los casos de uso de una orden de cliente no operan una orden propia",
    async () => {
      const s = await seed();
      const unit = await phone(s, "51");
      const sent = ok(await sendToRepair(s, unit.unitId));
      const invalid = {
        ok: false,
        code: "BUSINESS_RULE_VIOLATION",
        rule: "invalid_transition",
        status: "sent",
      };
      expect(await markServiceOrderRepaired(s.admin, sent.order.id)).toEqual(
        invalid,
      );
      expect(
        await quoteServiceOrder(s.admin, sent.order.id, {
          customerCurrency: "USD",
          technicianCurrency: "USD",
          lines: [{ repairTypeId: s.battery, price: "80", cost: "35" }],
        }),
      ).toEqual(invalid);
      expect(await deliverServiceOrder(s.admin, sent.order.id)).toEqual(
        invalid,
      );
      expect(await unitRow(unit.unitId)).toMatchObject({ status: "in_repair" });
    },
    TEST_TIMEOUT,
  );
});

describe("mandar a reparar contra confirmar un pedido (AC-8)", () => {
  it(
    "con la unidad retenida por una tercera conexión, gana uno y el otro se rechaza",
    async () => {
      const s = await seed();
      const unit = await phone(s, "60");
      const order = ok(
        await createOrder(s.admin, {
          clientId: s.clientId,
          lines: [
            {
              productId: unit.productId,
              quantity: "",
              expectedPriceId: unit.priceId,
              serials: unit.serial,
              expectedLineTotal: "",
            },
          ],
        }),
      );
      const release = await hold(
        sql`select id from stock_units where id = ${unit.unitId} for update`,
      );
      const repair = sendToRepair(s, unit.unitId);
      const confirm = confirmOrder(s.admin, order.order.id);
      await waitForLockWaiters(2);
      await release();
      const [repaired, confirmed] = await Promise.all([repair, confirm]);
      const winners = [repaired.ok, confirmed.ok].filter(Boolean);
      expect(winners).toHaveLength(1);
      const status = (await unitRow(unit.unitId)).status;
      if (repaired.ok) {
        expect(status).toBe("in_repair");
        // El rechazo nombra la unidad y dónde está (D-6).
        expect(confirmed).toMatchObject({
          ok: false,
          code: "BUSINESS_RULE_VIOLATION",
          rule: "units_unavailable",
          units: [{ serial: unit.serial, status: "in_repair" }],
        });
      } else {
        expect(status).toBe("reserved");
        expect(repaired).toEqual({
          ok: false,
          code: "BUSINESS_RULE_VIOLATION",
          rule: "unit_not_available",
        });
      }
    },
    TEST_TIMEOUT,
  );
});

describe("el viewer y la capacidad (AC-10 y AC-12)", () => {
  it(
    "un viewer ve la orden propia sin el técnico ni los costos, y no la opera",
    async () => {
      const s = await seed();
      const unit = await phone(s, "70");
      const sent = ok(await sendToRepair(s, unit.unitId));
      expect(await sendToRepair(s, unit.unitId, s.viewer)).toMatchObject({
        ok: false,
        code: "FORBIDDEN",
      });
      ok(await markOwnUnitRepaired(s.admin, sent.order.id, batteryLine(s)));
      const seen = ok(await getServiceOrder(s.viewer, sent.order.id)).order;
      expect(seen).toMatchObject({
        kind: "own_unit",
        technician: null,
        technicianTotal: null,
        technicianCurrency: null,
        unit: { serial: unit.serial, status: "in_review" },
      });
      expect(seen.lines).toMatchObject([{ cost: null, price: null }]);
      const units = ok(await listProductUnits(s.viewer, unit.productId));
      expect(units.units[0]).toMatchObject({ status: "in_review", cost: null });
      expect(await releaseUnit(s.viewer, unit.unitId)).toMatchObject({
        ok: false,
        code: "FORBIDDEN",
      });
      expect(
        await markOwnUnitRepaired(s.viewer, sent.order.id, batteryLine(s)),
      ).toMatchObject({ ok: false, code: "FORBIDDEN" });
    },
    TEST_TIMEOUT,
  );

  it(
    "sin repairs no se manda a reparar; sin serialized_units, ni se manda ni se libera",
    async () => {
      const s = await seed();
      const unit = await phone(s, "C1", {
        context: s.adminC,
        orgId: s.orgC,
        userId: s.adminCId,
        withModel: false,
      });
      expect(
        await createOwnUnitServiceOrder(s.adminC, unit.unitId, {
          technicianId: s.technicianId,
          reportedIssue: "Batería",
        }),
      ).toEqual({ ok: false, code: "NOT_FOUND" });
      expect(await listUnitServiceOrders(s.adminC, [unit.unitId])).toEqual(
        new Map(),
      );
      // Una unidad de otra organización no existe para A.
      expect(await sendToRepair(s, unit.unitId)).toEqual({
        ok: false,
        code: "NOT_FOUND",
        target: "unit",
      });
      expect(await releaseUnit(s.admin, unit.unitId)).toEqual({
        ok: false,
        code: "NOT_FOUND",
      });
      expect(await unitRow(unit.unitId)).toMatchObject({ status: "available" });

      // Con repairs y sin serialized_units (revisión independiente, hallazgo 5): ni se manda a
      // reparar ni se libera, aunque la unidad esté en revisión.
      const reviewed = await phone(s, "71");
      const waiting = await phone(s, "72");
      const sent = ok(await sendToRepair(s, reviewed.unitId));
      ok(await markOwnUnitRepaired(s.admin, sent.order.id, batteryLine(s)));
      await getDb().execute(
        sql`delete from organization_capabilities
            where organization_id = ${s.orgA} and capability = 'serialized_units'`,
      );
      expect(await sendToRepair(s, waiting.unitId)).toEqual({
        ok: false,
        code: "NOT_FOUND",
      });
      expect(await releaseUnit(s.admin, reviewed.unitId)).toEqual({
        ok: false,
        code: "NOT_FOUND",
      });
      expect(await unitRow(reviewed.unitId)).toMatchObject({
        status: "in_review",
      });
      expect(await unitRow(waiting.unitId)).toMatchObject({
        status: "available",
      });
    },
    TEST_TIMEOUT,
  );
});

// El recuento por estado de la 24.5.1 (brief-24.5.1, D-6 y AC-7). Vive acá porque este archivo es
// el único que llega a los seis estados: in_repair e in_review necesitan una orden de unidad propia.
describe("el recuento de unidades por estado (brief-24.5.1, AC-7)", () => {
  it(
    "cuenta los seis estados de un mismo producto en una sola consulta",
    async () => {
      const s = await seed();
      // Un producto con seis unidades: la de phone() y cinco más.
      const base = await phone(s, "40", { serial: "IMEI40-DISPONIBLE" });
      const extra = async (serial: string) =>
        ok(
          await registerUnit(s.admin, base.productId, {
            serial,
            cost: "450",
            currency: "USD",
            gradeId: "",
            batteryHealth: "",
          }),
        ).unitId;
      const reservedId = await extra("IMEI40-RESERVADA");
      const soldId = await extra("IMEI40-VENDIDA");
      const goneId = await extra("IMEI40-BAJA");
      const repairId = await extra("IMEI40-REPARACION");
      const reviewId = await extra("IMEI40-REVISION");

      // Reservada: un pedido confirmado.
      const order = ok(
        await createOrder(s.admin, {
          clientId: s.clientId,
          lines: [
            {
              productId: base.productId,
              quantity: "",
              expectedPriceId: base.priceId,
              serials: "IMEI40-RESERVADA",
              expectedLineTotal: "",
            },
          ],
        }),
      );
      ok(await confirmOrder(s.admin, order.order.id));
      // Vendida.
      ok(
        await issueSale(s.admin, {
          clientId: "",
          lines: [
            {
              productId: base.productId,
              quantity: "",
              expectedPriceId: base.priceId,
              serials: "IMEI40-VENDIDA",
            },
          ],
        }),
      );
      // Dada de baja, en reparación y en revisión.
      ok(await writeOffUnit(s.admin, goneId, "Rota"));
      ok(await sendToRepair(s, repairId));
      const toReview = ok(await sendToRepair(s, reviewId));
      ok(await markOwnUnitRepaired(s.admin, toReview.order.id, batteryLine(s)));

      // Los seis estados quedaron realmente puestos, y no los supone el recuento.
      expect([
        (await unitRow(base.unitId)).status,
        (await unitRow(reservedId)).status,
        (await unitRow(soldId)).status,
        (await unitRow(goneId)).status,
        (await unitRow(repairId)).status,
        (await unitRow(reviewId)).status,
      ]).toEqual([
        "available",
        "reserved",
        "sold",
        "written_off",
        "in_repair",
        "in_review",
      ]);

      const counted = ok(await countUnitsByStatus(s.admin, base.productId));
      expect(counted).toEqual({
        ok: true,
        tracking: "unit",
        counts: {
          available: 1,
          reserved: 1,
          sold: 1,
          written_off: 1,
          in_repair: 1,
          in_review: 1,
        },
      });
      // Lo que esta subfase declara (brief-24.5.1, I-3): el saldo cuenta las disponibles y las
      // reservadas, y nada más. Con seis unidades físicas, una en cada estado, el saldo es 2: la
      // vendida, la dada de baja, la que está en reparación y la que está en revisión quedan fuera.
      // Por eso el Resumen no puede dibujar un total que sume disponible + reservado + en revisión,
      // que daría 3 y no coincide con ningún número del sistema.
      expect(await onHand(base.productId)).toBe("2.000");
    },
    TEST_TIMEOUT,
  );

  it(
    "un viewer también lo lee, y otra organización no ve nada",
    async () => {
      const s = await seed();
      const base = await phone(s, "41", { serial: "IMEI41" });
      expect(ok(await countUnitsByStatus(s.viewer, base.productId))).toEqual({
        ok: true,
        tracking: "unit",
        counts: {
          available: 1,
          reserved: 0,
          sold: 0,
          written_off: 0,
          in_repair: 0,
          in_review: 0,
        },
      });
      expect(await countUnitsByStatus(s.adminC, base.productId)).toEqual({
        ok: false,
        code: "NOT_FOUND",
      });
    },
    TEST_TIMEOUT,
  );
});

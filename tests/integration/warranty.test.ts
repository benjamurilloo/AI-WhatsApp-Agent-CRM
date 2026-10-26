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
  createModel,
  createProduct,
  createServiceProduct,
  type ProductInput,
} from "@/modules/catalog";
import {
  applyUnitSettingsTemplate,
  changeProductTracking,
  findUnitsBySerial,
  getUnitWarranties,
  getUnitWarrantySettings,
  localDate,
  registerUnit,
  saveUnitWarrantySettings,
  setUnitWarrantyDays,
  writeOffUnit,
} from "@/modules/inventory";
import {
  confirmOrder,
  createOrder,
  deliverOrder,
  listClientDeliveredUnits,
} from "@/modules/orders";
import {
  activateCapability,
  getAuthContext,
  getProfile,
  type AuthContext,
} from "@/modules/organizations";
import { createSupplier, setSupplierTechnician } from "@/modules/purchasing";
import { issueSale, listClientSoldUnits, voidSale } from "@/modules/sales";
import {
  applyRepairTypeTemplate,
  applyServiceSettingsTemplate,
  approveServiceOrder,
  createServiceOrder,
  deliverServiceOrder,
  getServiceWarrantySettings,
  listClientServiceOrders,
  listRepairTypes,
  listServiceOrdersBySerial,
  markServiceOrderRepaired,
  quoteServiceOrder,
  saveServiceWarrantySettings,
  sendServiceOrder,
  setRepairPrice,
} from "@/modules/service";
import { getDb } from "@/shared/db";
import { resetDatabase } from "./reset-database";
import { expectStockInvariant } from "./stock-invariant";

// La garantía contra PostgreSQL real (brief-29.9, D-7): la migración 0063, la copia del perfil, la
// garantía de una unidad vendida sin pedido y por un pedido, la anulación y la venta otra vez, el equipo
// que volvió al local, la de una reparación entregada, los días de la organización y de una unidad con
// su auditoría, los roles, la búsqueda por IMEI y el aislamiento por organización.

const PASSWORD = "contraseña-correcta-larga";
const TEST_TIMEOUT = 30000;
const BA = "America/Argentina/Buenos_Aires";
let storedHash: string;

async function returningId(query: SQL): Promise<string> {
  const result = await getDb().execute<{ id: string }>(query);
  return result.rows[0]!.id;
}

function ok<T extends { ok: boolean }>(result: T): Extract<T, { ok: true }> {
  if (!result.ok) throw new Error(`rechazado: ${JSON.stringify(result)}`);
  return result as Extract<T, { ok: true }>;
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

// Las capacidades del perfil, los tipos de reparación y el producto de servicio; con `warranty`, también
// los días del perfil, como hace org:capability.
async function activate(
  organizationId: string,
  adminEmail: string,
  warranty: boolean,
) {
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
    await applyRepairTypeTemplate(tx, {
      organizationId,
      actorUserId,
      repairTypes: profile.repairTypes,
    });
    await createServiceProduct(tx, { organizationId, actorUserId });
    if (!warranty) return null;
    return {
      units: await applyUnitSettingsTemplate(tx, {
        organizationId,
        actorUserId,
        warrantyDays: profile.warrantyDays!,
      }),
      repairs: await applyServiceSettingsTemplate(tx, {
        organizationId,
        actorUserId,
        warrantyDays: profile.warrantyDays!,
      }),
    };
  });
}

function productInput(sku: string): ProductInput {
  return {
    sku,
    name: `Producto ${sku}`,
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
  const orgB = await returningId(
    sql`insert into organizations (name, main_currency) values ('iPhone B', 'USD') returning id`,
  );
  const admin = await member(orgA, "admin-a@example.com", "admin");
  const viewer = await member(orgA, "viewer-a@example.com", "viewer");
  const adminB = await member(orgB, "admin-b@example.com", "admin");
  const copied = await activate(orgA, "admin-a@example.com", true);
  // B tiene las capacidades, pero no los días: «sin configurar».
  await activate(orgB, "admin-b@example.com", false);

  const product = async (
    context: AuthContext,
    orgId: string,
    userId: string,
  ) => {
    const created = ok(await createProduct(context, productInput("IP13")));
    ok(await changeProductTracking(context, created.productId, "unit"));
    const priceId = await returningId(
      sql`insert into product_prices (organization_id, product_id, amount, currency, created_by)
          values (${orgId}, ${created.productId}, '900.00', 'USD', ${userId}) returning id`,
    );
    return { id: created.productId, priceId };
  };
  const phone = await product(admin.context, orgA, admin.userId);
  const phoneB = await product(adminB.context, orgB, adminB.userId);
  const clientId = await returningId(
    sql`insert into clients (organization_id, display_name, phone_e164)
        values (${orgA}, 'Lucía', '+5493511234567') returning id`,
  );
  return {
    orgA,
    orgB,
    admin: admin.context,
    viewer: viewer.context,
    adminB: adminB.context,
    copied,
    phone,
    phoneB,
    clientId,
  };
}

async function register(
  context: AuthContext,
  productId: string,
  serial: string,
) {
  return ok(
    await registerUnit(context, productId, {
      serial,
      cost: "450",
      currency: "USD",
      gradeId: "",
      batteryHealth: "",
    }),
  ).unitId;
}

async function sell(
  context: AuthContext,
  line: { id: string; priceId: string },
  serials: string,
  clientId = "",
) {
  return ok(
    await issueSale(context, {
      clientId,
      lines: [
        {
          productId: line.id,
          quantity: "",
          expectedPriceId: line.priceId,
          serials,
        },
      ],
    }),
  ).sale.id;
}

async function warrantyOf(context: AuthContext, unitId: string) {
  const result = ok(await getUnitWarranties(context, [unitId]));
  return result.units[0]!.warranty;
}

// La fecha del último movimiento que sacó a la unidad, leída aparte para comparar.
async function lastExit(unitId: string): Promise<Date> {
  const result = await getDb().execute<{ at: Date }>(
    sql`select max(created_at) as at from inventory_movements
        where unit_id = ${unitId} and type in ('sale', 'order_delivery')`,
  );
  return new Date(result.rows[0]!.at);
}

function endsOn(start: Date, days: number): string {
  const [y, m, d] = localDate(start, BA).split("-").map(Number);
  return new Date(Date.UTC(y!, m! - 1, d! + days)).toISOString().slice(0, 10);
}

async function auditRows(entityType: string) {
  const result = await getDb().execute<{ action: string; diff: unknown }>(
    sql`select action::text as action, diff from audit_logs
        where entity_type = ${entityType} order by created_at, id`,
  );
  return result.rows;
}

// drizzle-orm envuelve el error de pg; el mensaje queda en la causa.
async function pgMessage(query: Promise<unknown>): Promise<string> {
  try {
    await query;
  } catch (error) {
    const e = error as { message?: string; cause?: { message?: string } };
    return e.cause?.message ?? e.message ?? "";
  }
  throw new Error("La consulta debía ser rechazada y no lo fue.");
}

beforeAll(async () => {
  storedHash = await hashPassword(PASSWORD);
});

beforeEach(async () => {
  await resetDatabase(getDb());
});

afterEach(async () => {
  await expectStockInvariant();
});

afterAll(async () => {
  await getDb().$client.end();
});

describe("la migración 0063 (D-5, AC-1)", () => {
  it(
    "rechaza días fuera de rango y una segunda fila de la organización",
    async () => {
      const s = await seed();
      const unitId = await register(s.admin, s.phone.id, "111");
      expect(
        await pgMessage(
          getDb().execute(
            sql`update stock_units set warranty_days = 3651 where id = ${unitId}`,
          ),
        ),
      ).toMatch(/stock_units_warranty_days_range/);
      expect(
        await pgMessage(
          getDb().execute(
            sql`update stock_units set warranty_days = -1 where id = ${unitId}`,
          ),
        ),
      ).toMatch(/stock_units_warranty_days_range/);
      for (const table of ["unit_settings", "service_settings"]) {
        expect(
          await pgMessage(
            getDb().execute(
              sql`insert into ${sql.identifier(table)} (organization_id, warranty_days)
                  values (${s.orgA}, 30)`,
            ),
          ),
        ).toMatch(new RegExp(`${table}_organization_unique`));
        expect(
          await pgMessage(
            getDb().execute(
              sql`insert into ${sql.identifier(table)} (organization_id, warranty_days)
                  values (${s.orgB}, 3651)`,
            ),
          ),
        ).toMatch(new RegExp(`${table}_warranty_days_range`));
      }
    },
    TEST_TIMEOUT,
  );
});

describe("la copia del perfil (D-1, AC-2)", () => {
  it(
    "crea los dos días de ejemplo una sola vez, con su auditoría",
    async () => {
      const s = await seed();
      expect(s.copied).toEqual({
        units: { created: true },
        repairs: { created: true },
      });
      expect(ok(await getUnitWarrantySettings(s.admin)).settings).toEqual({
        warrantyDays: 30,
        isExample: true,
      });
      expect(ok(await getServiceWarrantySettings(s.admin)).settings).toEqual({
        warrantyDays: 30,
        isExample: true,
      });
      // Otra corrida, sobre la organización que ya los tiene: no los toca.
      const again = await activate(s.orgA, "admin-a@example.com", true);
      expect(again).toEqual({
        units: { created: false },
        repairs: { created: false },
      });
      expect(await auditRows("unit_settings")).toMatchObject([
        { action: "create" },
      ]);
      expect(await auditRows("service_settings")).toMatchObject([
        { action: "create" },
      ]);
      // B, sin la copia, no tiene fila.
      expect(ok(await getUnitWarrantySettings(s.adminB)).settings).toBeNull();
    },
    TEST_TIMEOUT,
  );
});

describe("la garantía de una unidad vendida (D-2, AC-3, AC-4, AC-6)", () => {
  it(
    "una venta sin pedido empieza en su movimiento, con los días del perfil o los de la unidad",
    async () => {
      const s = await seed();
      const unitId = await register(s.admin, s.phone.id, "111");
      expect(await warrantyOf(s.admin, unitId)).toBeNull();
      await sell(s.admin, s.phone, "111", s.clientId);
      const soldAt = await lastExit(unitId);
      expect(await warrantyOf(s.admin, unitId)).toEqual({
        status: "in_warranty",
        startedAt: soldAt,
        days: 30,
        source: "settings",
        startsOn: localDate(soldAt, BA),
        endsOn: endsOn(soldAt, 30),
      });
      // Los propios de la unidad, también vendida, con su auditoría.
      expect(
        await setUnitWarrantyDays(s.admin, unitId, { warrantyDays: "90" }),
      ).toEqual({ ok: true, changed: true, productId: s.phone.id });
      expect(await warrantyOf(s.admin, unitId)).toMatchObject({
        days: 90,
        source: "unit",
        endsOn: endsOn(soldAt, 90),
      });
      expect(
        await setUnitWarrantyDays(s.admin, unitId, { warrantyDays: "90" }),
      ).toMatchObject({ changed: false });
      expect(
        (await auditRows("stock_unit")).filter(
          (row) => row.action === "update",
        ),
      ).toEqual([
        {
          action: "update",
          diff: {
            before: { warranty_days: null },
            after: { warranty_days: 90 },
          },
        },
      ]);
      // Cero: vence el mismo día de la venta.
      ok(await setUnitWarrantyDays(s.admin, unitId, { warrantyDays: "0" }));
      expect(await warrantyOf(s.admin, unitId)).toMatchObject({
        days: 0,
        endsOn: localDate(soldAt, BA),
      });
      // Vacío: vuelve a los de la organización.
      ok(await setUnitWarrantyDays(s.admin, unitId, { warrantyDays: "" }));
      expect(await warrantyOf(s.admin, unitId)).toMatchObject({
        days: 30,
        source: "settings",
      });
      // Y la ficha del cliente la encuentra.
      expect(ok(await listClientSoldUnits(s.admin, s.clientId)).units).toEqual([
        expect.objectContaining({ unitId }),
      ]);
    },
    TEST_TIMEOUT,
  );

  it(
    "un pedido entregado empieza en la entrega",
    async () => {
      const s = await seed();
      const unitId = await register(s.admin, s.phone.id, "222");
      const order = ok(
        await createOrder(s.admin, {
          clientId: s.clientId,
          lines: [
            {
              productId: s.phone.id,
              quantity: "",
              expectedPriceId: s.phone.priceId,
              serials: "222",
              expectedLineTotal: "",
            },
          ],
        }),
      ).order.id;
      ok(await confirmOrder(s.admin, order));
      expect(await warrantyOf(s.admin, unitId)).toBeNull();
      ok(await deliverOrder(s.admin, order));
      const deliveredAt = await lastExit(unitId);
      expect(await warrantyOf(s.admin, unitId)).toMatchObject({
        status: "in_warranty",
        startedAt: deliveredAt,
        endsOn: endsOn(deliveredAt, 30),
      });
      expect(
        ok(await listClientDeliveredUnits(s.admin, s.clientId)).units,
      ).toEqual([expect.objectContaining({ unitId, orderId: order })]);
    },
    TEST_TIMEOUT,
  );

  it(
    "la venta anulada deja la unidad sin garantía, y la venta nueva toma su fecha",
    async () => {
      const s = await seed();
      const unitId = await register(s.admin, s.phone.id, "333");
      const first = await sell(s.admin, s.phone, "333", s.clientId);
      const firstAt = await lastExit(unitId);
      ok(await voidSale(s.admin, first, "other"));
      expect(await warrantyOf(s.admin, unitId)).toBeNull();
      expect(ok(await listClientSoldUnits(s.admin, s.clientId)).units).toEqual(
        [],
      );
      await sell(s.admin, s.phone, "333");
      const secondAt = await lastExit(unitId);
      expect(secondAt.getTime()).toBeGreaterThan(firstAt.getTime());
      expect(await warrantyOf(s.admin, unitId)).toMatchObject({
        startedAt: secondAt,
      });
    },
    TEST_TIMEOUT,
  );

  it(
    "un equipo que volvió al local no tiene garantía, y la búsqueda lo muestra con su historia",
    async () => {
      const s = await seed();
      const sold = await register(s.admin, s.phone.id, "AbC-444");
      await sell(s.admin, s.phone, "AbC-444");
      // El mismo IMEI vuelve como otra unidad.
      const back = await register(s.admin, s.phone.id, "abc-444");
      expect(await warrantyOf(s.admin, sold)).toEqual({ status: "returned" });
      const found = ok(await findUnitsBySerial(s.admin, "ABC-444")).units;
      expect(found.map((unit) => [unit.id, unit.status])).toEqual([
        [back, "available"],
        [sold, "sold"],
      ]);
      expect(found[0]).toMatchObject({
        productName: "Producto IP13",
        warranty: null,
      });
      // Un texto que no es un IMEI no encuentra nada.
      expect(ok(await findUnitsBySerial(s.admin, "abc 444")).units).toEqual([]);
    },
    TEST_TIMEOUT,
  );

  it(
    "sin días de la organización, la garantía no está configurada",
    async () => {
      const s = await seed();
      const unitId = await register(s.adminB, s.phoneB.id, "555");
      await sell(s.adminB, s.phoneB, "555");
      expect(await warrantyOf(s.adminB, unitId)).toEqual({
        status: "not_configured",
      });
    },
    TEST_TIMEOUT,
  );
});

describe("la garantía de una reparación entregada (D-2, AC-5)", () => {
  it(
    "una orden reparada y entregada tiene garantía desde la entrega; la búsqueda la encuentra",
    async () => {
      const s = await seed();
      const model = ok(
        await createModel(s.admin, { name: "iPhone 13", brand: "Apple" }),
      );
      const types = ok(await listRepairTypes(s.admin));
      const battery = types.types.find(
        (type) => type.name === "Cambio de batería",
      )!.id;
      ok(
        await setRepairPrice(s.admin, {
          repairTypeId: battery,
          modelId: model.modelId,
          price: "80",
          priceCurrency: "USD",
          cost: "35",
          costCurrency: "USD",
        }),
      );
      const technician = ok(
        await createSupplier(s.admin, { name: "Técnico" }),
      ).supplierId;
      ok(await setSupplierTechnician(s.admin, technician, true));
      const order = ok(
        await createServiceOrder(s.admin, {
          clientId: s.clientId,
          modelId: model.modelId,
          deviceSerial: "356789012345678",
          reportedIssue: "La batería dura poco.",
        }),
      ).order;
      ok(await sendServiceOrder(s.admin, order.id, technician));
      ok(
        await quoteServiceOrder(s.admin, order.id, {
          customerCurrency: "USD",
          technicianCurrency: "USD",
          lines: [{ repairTypeId: battery, price: "80", cost: "35" }],
        }),
      );
      ok(await approveServiceOrder(s.admin, order.id));
      ok(await markServiceOrderRepaired(s.admin, order.id));
      const before = ok(await listClientServiceOrders(s.admin, s.clientId));
      expect(before.orders[0]!.warranty).toBeNull();
      ok(await deliverServiceOrder(s.admin, order.id));
      const delivered = await getDb().execute<{ at: Date }>(
        sql`select delivered_at as at from service_orders where id = ${order.id}`,
      );
      const deliveredAt = new Date(delivered.rows[0]!.at);
      const after = ok(await listClientServiceOrders(s.viewer, s.clientId));
      expect(after.orders[0]!.warranty).toEqual({
        status: "in_warranty",
        startedAt: deliveredAt,
        days: 30,
        source: "settings",
        startsOn: localDate(deliveredAt, BA),
        endsOn: endsOn(deliveredAt, 30),
      });
      // Los días de la organización se cambian, y valen para lo ya entregado.
      ok(await saveServiceWarrantySettings(s.admin, { warrantyDays: "60" }));
      const found = ok(
        await listServiceOrdersBySerial(s.admin, "356789012345678"),
      ).orders;
      expect(found.map((item) => item.id)).toEqual([order.id]);
      expect(found[0]!.warranty).toMatchObject({
        days: 60,
        endsOn: endsOn(deliveredAt, 60),
      });
      // Otra organización no la encuentra.
      expect(
        ok(await listServiceOrdersBySerial(s.adminB, "356789012345678")).orders,
      ).toEqual([]);
    },
    TEST_TIMEOUT,
  );
});

describe("los días de la organización, los roles y el aislamiento (D-1, D-6, AC-7, AC-9)", () => {
  it(
    "guardar valida, apaga la marca de ejemplo y audita",
    async () => {
      const s = await seed();
      for (const value of ["", "-1", "3651", "1.5", "treinta"]) {
        expect(
          await saveUnitWarrantySettings(s.admin, { warrantyDays: value }),
        ).toEqual({
          ok: false,
          code: "VALIDATION_ERROR",
          fields: ["warrantyDays"],
        });
      }
      // Los mismos días: apaga la marca.
      expect(
        await saveUnitWarrantySettings(s.admin, { warrantyDays: "30" }),
      ).toEqual({ ok: true, changed: true });
      expect(ok(await getUnitWarrantySettings(s.admin)).settings).toEqual({
        warrantyDays: 30,
        isExample: false,
      });
      expect(
        await saveUnitWarrantySettings(s.admin, { warrantyDays: "30" }),
      ).toEqual({ ok: true, changed: false });
      // B crea la suya al guardar.
      ok(await saveUnitWarrantySettings(s.adminB, { warrantyDays: "15" }));
      expect(ok(await getUnitWarrantySettings(s.adminB)).settings).toEqual({
        warrantyDays: 15,
        isExample: false,
      });
      // La copia del perfil en A, la marca apagada en A y el alta de B.
      expect(await auditRows("unit_settings")).toMatchObject([
        { action: "create" },
        {
          action: "update",
          diff: { before: { isExample: true }, after: { isExample: false } },
        },
        { action: "create" },
      ]);
    },
    TEST_TIMEOUT,
  );

  it(
    "un viewer ve la garantía y no edita; otra organización no ve nada",
    async () => {
      const s = await seed();
      const unitId = await register(s.admin, s.phone.id, "777");
      await sell(s.admin, s.phone, "777");
      expect(await warrantyOf(s.viewer, unitId)).toMatchObject({
        status: "in_warranty",
      });
      expect(
        await setUnitWarrantyDays(s.viewer, unitId, { warrantyDays: "10" }),
      ).toEqual({ ok: false, code: "FORBIDDEN" });
      expect(
        await saveUnitWarrantySettings(s.viewer, { warrantyDays: "10" }),
      ).toEqual({ ok: false, code: "FORBIDDEN" });
      expect(
        await saveServiceWarrantySettings(s.viewer, { warrantyDays: "10" }),
      ).toEqual({ ok: false, code: "FORBIDDEN" });
      expect(await getUnitWarrantySettings(s.viewer)).toEqual({
        ok: false,
        code: "FORBIDDEN",
      });
      // El mismo IMEI en B: cada organización ve la suya.
      const unitB = await register(s.adminB, s.phoneB.id, "777");
      expect(
        ok(await findUnitsBySerial(s.admin, "777")).units.map((u) => u.id),
      ).toEqual([unitId]);
      expect(
        ok(await findUnitsBySerial(s.adminB, "777")).units.map((u) => u.id),
      ).toEqual([unitB]);
      // La unidad de B, posterior y con el mismo IMEI, no hace que la de A «vuelva al local».
      expect(await warrantyOf(s.admin, unitId)).toMatchObject({
        status: "in_warranty",
      });
      expect(ok(await getUnitWarranties(s.adminB, [unitId])).units).toEqual([]);
      expect(
        await setUnitWarrantyDays(s.adminB, unitId, { warrantyDays: "10" }),
      ).toEqual({ ok: false, code: "NOT_FOUND" });
      // Ni sus ventas: la ficha del cliente de A, leída desde B, está vacía.
      expect(ok(await listClientSoldUnits(s.adminB, s.clientId)).units).toEqual(
        [],
      );
    },
    TEST_TIMEOUT,
  );

  it(
    "una unidad dada de baja no cambia sus días",
    async () => {
      const s = await seed();
      const unitId = await register(s.admin, s.phone.id, "888");
      ok(await writeOffUnit(s.admin, unitId, "Se rompió en el local."));
      expect(
        await setUnitWarrantyDays(s.admin, unitId, { warrantyDays: "10" }),
      ).toEqual({
        ok: false,
        code: "BUSINESS_RULE_VIOLATION",
        rule: "unit_written_off",
      });
    },
    TEST_TIMEOUT,
  );
});

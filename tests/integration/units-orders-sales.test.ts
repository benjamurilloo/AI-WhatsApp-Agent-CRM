import { sql } from "drizzle-orm";
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
import { createProduct, type ProductInput } from "@/modules/catalog";
import {
  applyGradeTemplate,
  changeProductTracking,
  correctUnit,
  getProductBalanceForService,
  listProductUnits,
  registerUnit,
  writeOffUnit,
  type UnitInput,
} from "@/modules/inventory";
import {
  cancelOrder,
  confirmOrder,
  createOrder,
  deliverOrder,
  getOrder,
  getUnitOrders,
  placeOrderFromIngestion,
  type OrderInput,
} from "@/modules/orders";
import {
  activateCapability,
  getAuthContext,
  getProfile,
  type AuthContext,
} from "@/modules/organizations";
import {
  createGoodsReceipt,
  createSupplier,
  voidGoodsReceipt,
} from "@/modules/purchasing";
import {
  getSale,
  getUnitSales,
  issueSale,
  issueSaleFromOrder,
  voidSale,
  type SaleInput,
} from "@/modules/sales";
import { getDb } from "@/shared/db";
import { resetDatabase } from "./reset-database";
import { expectStockInvariant } from "./stock-invariant";

// Las unidades en pedidos y ventas contra PostgreSQL real (brief-29.5.2, D-9): el alta del pedido con
// sus IMEI y el precio de cada unidad, cada camino de D-3 con el invariante completo después de cada
// test, los rechazos, la concurrencia, la baja y la anulación de la recepción de una unidad tomada, el
// agente, la lectura v2, el viewer y el aislamiento. Un producto por cantidad y una organización sin la
// capacidad no cambian: lo prueban las suites de siempre, que pasan con el invariante sumado.

const PASSWORD = "contraseña-correcta-larga";
const TEST_TIMEOUT = 30000;
let storedHash: string;

async function createOrganization(name: string) {
  const result = await getDb().execute<{ id: string }>(
    sql`insert into organizations (name, main_currency) values (${name}, 'USD') returning id`,
  );
  return result.rows[0]!.id;
}

async function addUser(
  organizationId: string,
  email: string,
  role: "admin" | "viewer",
) {
  const user = await getDb().execute<{ id: string }>(
    sql`insert into users (email, password_hash, name, must_change_password)
        values (${email}, ${storedHash}, 'Persona', false) returning id`,
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

async function activateUnits(organizationId: string, adminEmail: string) {
  const profile = getProfile("iphone")!;
  return getDb().transaction(async (tx) => {
    const activated = await activateCapability(tx, {
      organizationId,
      capability: "serialized_units",
      adminEmail,
    });
    if (!activated.ok) throw new Error(activated.code);
    return applyGradeTemplate(tx, {
      organizationId,
      actorUserId: activated.actorUserId,
      grades: profile.grades,
    });
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

async function insertPrice(
  organizationId: string,
  productId: string,
  createdBy: string,
  amount = "900.00",
  currency = "USD",
) {
  const result = await getDb().execute<{ id: string }>(
    sql`insert into product_prices (organization_id, product_id, amount, currency, created_by)
        values (${organizationId}, ${productId}, ${amount}, ${currency}, ${createdBy}) returning id`,
  );
  return result.rows[0]!.id;
}

// Un producto con su precio; por unidad, salvo que se pida por cantidad.
async function product(
  s: Seed,
  sku: string,
  {
    byUnit = true,
    context = s.adminA,
    orgId = s.orgA,
    userId = s.adminAId,
  } = {},
) {
  const created = await createProduct(context, productInput(sku));
  if (!created.ok)
    throw new Error(`alta rechazada: ${JSON.stringify(created)}`);
  if (byUnit) {
    const changed = await changeProductTracking(
      context,
      created.productId,
      "unit",
    );
    if (!changed.ok) throw new Error(`seguimiento rechazado: ${changed.code}`);
  }
  const priceId = await insertPrice(orgId, created.productId, userId);
  return { id: created.productId, priceId };
}

async function register(
  context: AuthContext,
  productId: string,
  serial: string,
  overrides: Partial<UnitInput> = {},
) {
  const result = await registerUnit(context, productId, {
    serial,
    cost: "450",
    currency: "USD",
    gradeId: "",
    batteryHealth: "",
    ...overrides,
  });
  if (!result.ok) throw new Error(`alta rechazada: ${JSON.stringify(result)}`);
  return result.unitId;
}

// A con la capacidad, admin y viewer, y un cliente con teléfono; B con la capacidad.
async function seed() {
  const orgA = await createOrganization("iPhone A");
  const orgB = await createOrganization("iPhone B");
  const adminAId = await addUser(orgA, "admin-a@example.com", "admin");
  await addUser(orgA, "viewer-a@example.com", "viewer");
  const adminBId = await addUser(orgB, "admin-b@example.com", "admin");
  await activateUnits(orgA, "admin-a@example.com");
  await activateUnits(orgB, "admin-b@example.com");
  const client = await getDb().execute<{ id: string }>(
    sql`insert into clients (organization_id, display_name, phone_e164)
        values (${orgA}, 'Lucía', '+5493511234567') returning id`,
  );
  return {
    orgA,
    orgB,
    adminAId,
    adminBId,
    adminA: await contextFor("admin-a@example.com"),
    viewerA: await contextFor("viewer-a@example.com"),
    adminB: await contextFor("admin-b@example.com"),
    clientA: client.rows[0]!.id,
  };
}

type Seed = Awaited<ReturnType<typeof seed>>;

type Line = { id: string; priceId: string };

function orderInput(
  s: Seed,
  lines: (Line & { serials?: string; quantity?: string; total?: string })[],
): OrderInput {
  return {
    clientId: s.clientA,
    lines: lines.map((line) => ({
      productId: line.id,
      quantity: line.quantity ?? "",
      expectedPriceId: line.priceId,
      serials: line.serials ?? "",
      expectedLineTotal: line.total ?? "",
    })),
  };
}

function saleInput(
  lines: (Line & { serials?: string; quantity?: string })[],
): SaleInput {
  return {
    clientId: "",
    lines: lines.map((line) => ({
      productId: line.id,
      quantity: line.quantity ?? "",
      expectedPriceId: line.priceId,
      serials: line.serials ?? "",
    })),
  };
}

async function newOrder(s: Seed, lines: Parameters<typeof orderInput>[1]) {
  const created = await createOrder(s.adminA, orderInput(s, lines));
  if (!created.ok)
    throw new Error(`pedido rechazado: ${JSON.stringify(created)}`);
  return created.order.id;
}

async function balance(productId: string) {
  const result = await getDb().execute<{ on_hand: string; reserved: string }>(
    sql`select quantity_on_hand as on_hand, quantity_reserved as reserved
        from inventories where product_id = ${productId}`,
  );
  return result.rows[0] ?? null;
}

async function unitsOf(productId: string) {
  const result = await getDb().execute<{ serial: string; status: string }>(
    sql`select serial, status::text as status from stock_units
        where product_id = ${productId} order by serial`,
  );
  return result.rows;
}

async function movementsOf(productId: string) {
  const result = await getDb().execute<{
    type: string;
    quantity: string;
    balance_after: string;
    serial: string | null;
  }>(
    sql`select m.type, m.quantity, m.balance_after, u.serial
        from inventory_movements m left join stock_units u on u.id = m.unit_id
        where m.product_id = ${productId} order by m.created_at, m.id`,
  );
  return result.rows;
}

// drizzle-orm envuelve el error de pg; el mensaje del trigger queda en la causa.
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

// El invariante completo, después de cada test (D-7, AC-9).
afterEach(async () => {
  await expectStockInvariant();
});

afterAll(async () => {
  await getDb().$client.end();
});

describe("el alta del pedido con unidades (D-1, D-2, AC-1, AC-5)", () => {
  it(
    "guarda las unidades sin reservarlas, con el precio de cada una y el monto como suma",
    async () => {
      const s = await seed();
      const phone = await product(s, "IP13");
      await register(s.adminA, phone.id, "111", {
        price: "850",
        priceCurrency: "USD",
      });
      await register(s.adminA, phone.id, "222");
      const orderId = await newOrder(s, [
        { ...phone, serials: "111\n222", total: "1750.00" },
      ]);

      const found = await getOrder(s.adminA, orderId);
      if (!found.ok) throw new Error(found.code);
      expect(found.order.total).toBe("1750.00");
      expect(found.order.lines[0]).toMatchObject({
        quantity: "2.000",
        // Las unidades valen distinto: la línea guarda el precio del producto.
        unitPrice: "900.00",
        lineTotal: "1750.00",
        units: [
          { serial: "111", unitPrice: "850.00", status: "available" },
          { serial: "222", unitPrice: "900.00", status: "available" },
        ],
      });
      // Un pendiente no toca el stock (ADR 0020, punto 4).
      expect(await unitsOf(phone.id)).toEqual([
        { serial: "111", status: "available" },
        { serial: "222", status: "available" },
      ]);
      expect(await balance(phone.id)).toEqual({
        on_hand: "2.000",
        reserved: "0.000",
      });
    },
    TEST_TIMEOUT,
  );

  it(
    "rechaza un IMEI ajeno, de otro producto o no disponible, nombrándolo, sin escribir nada",
    async () => {
      const s = await seed();
      const phone = await product(s, "IP13");
      const other = await product(s, "IP14");
      await register(s.adminA, phone.id, "111");
      const gone = await register(s.adminA, phone.id, "222");
      await writeOffUnit(s.adminA, gone, "rota");
      await register(s.adminA, other.id, "333");
      // Una unidad reservada por otro pedido confirmado.
      await register(s.adminA, phone.id, "444");
      const taken = await newOrder(s, [{ ...phone, serials: "444" }]);
      expect(await confirmOrder(s.adminA, taken)).toEqual({
        ok: true,
        changed: true,
      });

      expect(
        await createOrder(
          s.adminA,
          orderInput(s, [{ ...phone, serials: "111 999 222 333 444" }]),
        ),
      ).toEqual({
        ok: false,
        code: "BUSINESS_RULE_VIOLATION",
        rule: "units",
        units: [
          { position: 1, serial: "999", reason: "not_found" },
          { position: 1, serial: "222", reason: "not_found" },
          { position: 1, serial: "333", reason: "other_product" },
          { position: 1, serial: "444", reason: "unavailable" },
        ],
      });
      const orders = await getDb().execute<{ count: number }>(
        sql`select count(*)::int as count from orders`,
      );
      expect(orders.rows[0]!.count).toBe(1);
    },
    TEST_TIMEOUT,
  );

  it(
    "las reglas de línea: sin IMEI, IMEI en un producto por cantidad, repetidos y otra moneda",
    async () => {
      const s = await seed();
      const phone = await product(s, "IP13");
      const cable = await product(s, "CABLE", { byUnit: false });
      await register(s.adminA, phone.id, "111", {
        price: "850",
        priceCurrency: "ARS",
      });
      await register(s.adminA, phone.id, "222");

      expect(
        await createOrder(
          s.adminA,
          orderInput(s, [
            { ...phone, quantity: "1" },
            { ...cable, serials: "222" },
          ]),
        ),
      ).toEqual({
        ok: false,
        code: "BUSINESS_RULE_VIOLATION",
        rule: "line_rules",
        lines: [
          { position: 1, productId: phone.id, rule: "units_required" },
          { position: 2, productId: cable.id, rule: "not_unit_tracked" },
        ],
      });
      expect(
        await createOrder(
          s.adminA,
          orderInput(s, [{ ...phone, serials: "222 222" }]),
        ),
      ).toMatchObject({
        code: "VALIDATION_ERROR",
        // El IMEI repetido se nombra (AC-1; revisión independiente, H-4).
        lines: [{ position: 1, field: "serials", serial: "222" }],
      });
      expect(
        await createOrder(
          s.adminA,
          orderInput(s, [{ ...phone, serials: "111" }]),
        ),
      ).toEqual({
        ok: false,
        code: "BUSINESS_RULE_VIOLATION",
        rule: "line_rules",
        lines: [
          {
            position: 1,
            productId: phone.id,
            rule: "unit_currency_mismatch",
            serial: "111",
          },
        ],
      });
    },
    TEST_TIMEOUT,
  );

  it(
    "el monto esperado que ya no coincide es un CONFLICT con el monto de ahora",
    async () => {
      const s = await seed();
      const phone = await product(s, "IP13");
      const unitId = await register(s.adminA, phone.id, "111");
      // El precio cambió entre que se vio y se envió.
      expect(
        await correctUnit(s.adminA, unitId, {
          gradeId: "",
          batteryHealth: "",
          price: "800",
          priceCurrency: "USD",
        }),
      ).toMatchObject({ ok: true, changed: true });
      expect(
        await createOrder(
          s.adminA,
          orderInput(s, [{ ...phone, serials: "111", total: "900.00" }]),
        ),
      ).toMatchObject({
        ok: false,
        code: "CONFLICT",
        prices: [{ position: 1, productId: phone.id, lineTotal: "800.00" }],
      });
    },
    TEST_TIMEOUT,
  );
});

describe("los caminos del pedido (D-3, AC-2)", () => {
  it(
    "confirmar reserva sus unidades; cancelar las libera; entregar las vende con un movimiento por unidad",
    async () => {
      const s = await seed();
      const phone = await product(s, "IP13");
      for (const serial of ["111", "222", "333"]) {
        await register(s.adminA, phone.id, serial);
      }
      const first = await newOrder(s, [{ ...phone, serials: "111 222" }]);
      expect(await confirmOrder(s.adminA, first)).toEqual({
        ok: true,
        changed: true,
      });
      expect(await unitsOf(phone.id)).toEqual([
        { serial: "111", status: "reserved" },
        { serial: "222", status: "reserved" },
        { serial: "333", status: "available" },
      ]);
      expect(await balance(phone.id)).toEqual({
        on_hand: "3.000",
        reserved: "2.000",
      });
      // La lectura v2 refleja lo reservado sin cambiar de forma (D-6, AC-8).
      expect(await getProductBalanceForService(s.orgA, phone.id)).toMatchObject(
        {
          quantityOnHand: "3.000",
          quantityReserved: "2.000",
          quantityAvailable: "1.000",
        },
      );
      await expectStockInvariant();

      expect(await cancelOrder(s.adminA, first)).toEqual({
        ok: true,
        changed: true,
      });
      expect((await unitsOf(phone.id)).map((unit) => unit.status)).toEqual([
        "available",
        "available",
        "available",
      ]);
      expect(await balance(phone.id)).toEqual({
        on_hand: "3.000",
        reserved: "0.000",
      });
      await expectStockInvariant();

      // Las mismas unidades, en otro pedido, después de cancelar el primero.
      const second = await newOrder(s, [{ ...phone, serials: "222 333" }]);
      await confirmOrder(s.adminA, second);
      const before = (await movementsOf(phone.id)).length;
      expect(await deliverOrder(s.adminA, second)).toEqual({
        ok: true,
        changed: true,
      });
      expect(await unitsOf(phone.id)).toEqual([
        { serial: "111", status: "available" },
        { serial: "222", status: "sold" },
        { serial: "333", status: "sold" },
      ]);
      expect(await balance(phone.id)).toEqual({
        on_hand: "1.000",
        reserved: "0.000",
      });
      expect((await movementsOf(phone.id)).slice(before)).toEqual([
        {
          type: "order_delivery",
          quantity: "1.000",
          balance_after: "2.000",
          serial: "222",
        },
        {
          type: "order_delivery",
          quantity: "1.000",
          balance_after: "1.000",
          serial: "333",
        },
      ]);
    },
    TEST_TIMEOUT,
  );

  it(
    "confirmar con una unidad ya reservada, vendida o dada de baja se rechaza sin reservar nada",
    async () => {
      const s = await seed();
      const phone = await product(s, "IP13");
      const cable = await product(s, "CABLE", { byUnit: false });
      await getDb().execute(
        sql`insert into inventories (organization_id, product_id, quantity_on_hand)
            values (${s.orgA}, ${cable.id}, 0)`,
      );
      for (const serial of ["111", "222", "333"]) {
        await register(s.adminA, phone.id, serial);
      }
      const pendingA = await newOrder(s, [{ ...phone, serials: "111 222" }]);
      const pendingB = await newOrder(s, [{ ...phone, serials: "222" }]);
      const pendingC = await newOrder(s, [{ ...phone, serials: "333" }]);
      await confirmOrder(s.adminA, pendingB);
      // 333 se vende sin pedido; el pendiente C la marca como no disponible.
      expect(
        await issueSale(s.adminA, saleInput([{ ...phone, serials: "333" }])),
      ).toMatchObject({ ok: true });
      const detail = await getOrder(s.adminA, pendingC);
      expect(detail.ok && detail.order.lines[0]!.units).toMatchObject([
        { serial: "333", status: "sold" },
      ]);

      expect(await confirmOrder(s.adminA, pendingA)).toEqual({
        ok: false,
        code: "BUSINESS_RULE_VIOLATION",
        rule: "units_unavailable",
        units: [
          {
            position: 1,
            productId: phone.id,
            serial: "222",
            status: "reserved",
          },
        ],
      });
      expect(await confirmOrder(s.adminA, pendingC)).toMatchObject({
        rule: "units_unavailable",
        units: [{ serial: "333", status: "sold" }],
      });
      // 111 sigue disponible: no se reservó nada.
      expect(await unitsOf(phone.id)).toEqual([
        { serial: "111", status: "available" },
        { serial: "222", status: "reserved" },
        { serial: "333", status: "sold" },
      ]);
      expect(await balance(phone.id)).toEqual({
        on_hand: "2.000",
        reserved: "1.000",
      });
    },
    TEST_TIMEOUT,
  );

  it(
    "la venta del pedido entregado copia sus IMEI, y ni ella ni su anulación tocan las unidades (AC-3)",
    async () => {
      const s = await seed();
      const phone = await product(s, "IP13");
      await register(s.adminA, phone.id, "111", {
        price: "850",
        priceCurrency: "USD",
      });
      const orderId = await newOrder(s, [{ ...phone, serials: "111" }]);
      await confirmOrder(s.adminA, orderId);
      await deliverOrder(s.adminA, orderId);
      const movements = await movementsOf(phone.id);

      const sold = await issueSaleFromOrder(s.adminA, orderId);
      if (!sold.ok) throw new Error(JSON.stringify(sold));
      const sale = await getSale(s.adminA, sold.sale.id);
      expect(sale.ok && sale.sale.lines[0]).toMatchObject({
        unitPrice: "850.00",
        lineTotal: "850.00",
        units: [{ serial: "111", unitPrice: "850.00", status: "sold" }],
      });
      expect(await voidSale(s.adminA, sold.sale.id, "other")).toMatchObject({
        ok: true,
      });
      expect(await unitsOf(phone.id)).toEqual([
        { serial: "111", status: "sold" },
      ]);
      expect(await movementsOf(phone.id)).toEqual(movements);

      // La venta que reemplaza a la anulada nombra la misma unidad.
      const again = await issueSaleFromOrder(s.adminA, orderId);
      if (!again.ok) throw new Error(JSON.stringify(again));
      const replaced = await getSale(s.adminA, again.sale.id);
      expect(replaced.ok && replaced.sale.lines[0]!.units).toMatchObject([
        { serial: "111" },
      ]);
    },
    TEST_TIMEOUT,
  );
});

describe("la venta sin pedido (D-3, AC-4)", () => {
  it(
    "vende sus unidades con un movimiento por unidad, y la anulación las devuelve",
    async () => {
      const s = await seed();
      const phone = await product(s, "IP13");
      const cable = await product(s, "CABLE", { byUnit: false });
      await register(s.adminA, phone.id, "111");
      await register(s.adminA, phone.id, "222", {
        price: "950",
        priceCurrency: "USD",
      });
      await register(s.adminA, phone.id, "333");
      const stocked = await getDb().execute(
        sql`insert into inventories (organization_id, product_id, quantity_on_hand)
            values (${s.orgA}, ${cable.id}, 0)`,
      );
      expect(stocked).toBeDefined();
      const before = (await movementsOf(phone.id)).length;

      const sold = await issueSale(
        s.adminA,
        saleInput([{ ...phone, serials: "222,111" }]),
      );
      if (!sold.ok) throw new Error(JSON.stringify(sold));
      expect(await unitsOf(phone.id)).toEqual([
        { serial: "111", status: "sold" },
        { serial: "222", status: "sold" },
        { serial: "333", status: "available" },
      ]);
      expect((await movementsOf(phone.id)).slice(before)).toEqual([
        {
          type: "sale",
          quantity: "1.000",
          balance_after: "2.000",
          serial: "222",
        },
        {
          type: "sale",
          quantity: "1.000",
          balance_after: "1.000",
          serial: "111",
        },
      ]);
      const sale = await getSale(s.viewerA, sold.sale.id);
      // El viewer ve los IMEI y los precios (D-8, AC-10).
      expect(sale.ok && sale.sale.total).toBe("1850.00");
      expect(sale.ok && sale.sale.lines[0]!.units).toMatchObject([
        { serial: "111", unitPrice: "900.00" },
        { serial: "222", unitPrice: "950.00" },
      ]);
      await expectStockInvariant();

      expect(await voidSale(s.adminA, sold.sale.id, "other")).toMatchObject({
        ok: true,
      });
      expect((await unitsOf(phone.id)).map((unit) => unit.status)).toEqual([
        "available",
        "available",
        "available",
      ]);
      // Un movimiento sale_void por unidad; el orden entre ellas no importa.
      expect(
        (await movementsOf(phone.id))
          .slice(-2)
          .map((m) => `${m.type} ${m.serial}`)
          .sort(),
      ).toEqual(["sale_void 111", "sale_void 222"]);

      // Vuelven a venderse.
      expect(
        await issueSale(s.adminA, saleInput([{ ...phone, serials: "111" }])),
      ).toMatchObject({ ok: true });
    },
    TEST_TIMEOUT,
  );

  it(
    "un IMEI vendido o reservado se rechaza nombrándolo, sin consumir el número",
    async () => {
      const s = await seed();
      const phone = await product(s, "IP13");
      await register(s.adminA, phone.id, "111");
      await register(s.adminA, phone.id, "222");
      const orderId = await newOrder(s, [{ ...phone, serials: "111" }]);
      await confirmOrder(s.adminA, orderId);
      expect(
        await issueSale(
          s.adminA,
          saleInput([{ ...phone, serials: "111 222" }]),
        ),
      ).toEqual({
        ok: false,
        code: "BUSINESS_RULE_VIOLATION",
        rule: "units",
        units: [{ position: 1, serial: "111", reason: "unavailable" }],
      });
      const sales = await getDb().execute<{ count: number }>(
        sql`select count(*)::int as count from sales`,
      );
      expect(sales.rows[0]!.count).toBe(0);
    },
    TEST_TIMEOUT,
  );
});

describe("la concurrencia (AC-6)", () => {
  it(
    "dos confirmaciones con la misma unidad: una reserva y la otra se rechaza",
    async () => {
      const s = await seed();
      const phone = await product(s, "IP13");
      await register(s.adminA, phone.id, "111");
      const a = await newOrder(s, [{ ...phone, serials: "111" }]);
      const b = await newOrder(s, [{ ...phone, serials: "111" }]);
      const results = await Promise.all([
        confirmOrder(s.adminA, a),
        confirmOrder(s.adminA, b),
      ]);
      expect(results.filter((result) => result.ok)).toHaveLength(1);
      expect(results.filter((result) => !result.ok)).toMatchObject([
        { rule: "units_unavailable", units: [{ serial: "111" }] },
      ]);
      expect(await balance(phone.id)).toEqual({
        on_hand: "1.000",
        reserved: "1.000",
      });
    },
    TEST_TIMEOUT,
  );

  it(
    "una venta sin pedido y una confirmación con la misma unidad: una sola la toma",
    async () => {
      const s = await seed();
      const phone = await product(s, "IP13");
      await register(s.adminA, phone.id, "111");
      const orderId = await newOrder(s, [{ ...phone, serials: "111" }]);
      const [confirmed, sold] = await Promise.all([
        confirmOrder(s.adminA, orderId),
        issueSale(s.adminA, saleInput([{ ...phone, serials: "111" }])),
      ]);
      expect([confirmed.ok, sold.ok].filter(Boolean)).toHaveLength(1);
      const status = (await unitsOf(phone.id))[0]!.status;
      expect(status).toBe(confirmed.ok ? "reserved" : "sold");
    },
    TEST_TIMEOUT,
  );

  it(
    "dos anulaciones de una venta con unidades: una devuelve las unidades y la otra es already_voided",
    async () => {
      // Revisión independiente de la 29.5.2, H-2: la segunda se serializa en las unidades y antes
      // fallaba con un error interno al verlas disponibles.
      const s = await seed();
      const phone = await product(s, "IP13");
      await register(s.adminA, phone.id, "111");
      const sold = await issueSale(
        s.adminA,
        saleInput([{ ...phone, serials: "111" }]),
      );
      if (!sold.ok) throw new Error(JSON.stringify(sold));
      const results = await Promise.all([
        voidSale(s.adminA, sold.sale.id, "other"),
        voidSale(s.adminA, sold.sale.id, "other"),
      ]);
      expect(results.filter((result) => result.ok)).toHaveLength(1);
      expect(results.filter((result) => !result.ok)).toMatchObject([
        { code: "BUSINESS_RULE_VIOLATION", rule: "already_voided" },
      ]);
      expect(await unitsOf(phone.id)).toEqual([
        { serial: "111", status: "available" },
      ]);
      expect(await balance(phone.id)).toEqual({
        on_hand: "1.000",
        reserved: "0.000",
      });
    },
    TEST_TIMEOUT,
  );
});

describe("lo que no cambia (D-3, AC-7, AC-8)", () => {
  it(
    "la baja y la anulación de la recepción se rechazan para una unidad reservada o vendida",
    async () => {
      const s = await seed();
      const phone = await product(s, "IP13");
      const supplier = await createSupplier(s.adminA, { name: "Importadora" });
      if (!supplier.ok) throw new Error("proveedor rechazado");
      const receipt = await createGoodsReceipt(s.adminA, {
        purchaseOrderId: null,
        supplierId: supplier.supplierId,
        currency: "USD",
        supplierReference: "",
        lines: [
          {
            productId: phone.id,
            quantity: "2",
            unitCost: "400",
            serials: "111 222",
          },
        ],
      });
      if (!receipt.ok) throw new Error(JSON.stringify(receipt));
      const orderId = await newOrder(s, [{ ...phone, serials: "111" }]);
      await confirmOrder(s.adminA, orderId);
      expect(
        await issueSale(s.adminA, saleInput([{ ...phone, serials: "222" }])),
      ).toMatchObject({ ok: true });
      const ids = await getDb().execute<{ id: string; serial: string }>(
        sql`select id, serial from stock_units order by serial`,
      );
      for (const row of ids.rows) {
        expect(await writeOffUnit(s.adminA, row.id, "rota")).toEqual({
          ok: false,
          code: "BUSINESS_RULE_VIOLATION",
          rule: "unit_not_available",
        });
        expect(
          await correctUnit(s.adminA, row.id, {
            gradeId: "",
            batteryHealth: "90",
          }),
        ).toEqual({
          ok: false,
          code: "BUSINESS_RULE_VIOLATION",
          rule: "unit_not_available",
        });
      }
      const voided = await voidGoodsReceipt(
        s.adminA,
        receipt.receipt.id,
        "data_entry_error",
      );
      expect(voided).toMatchObject({
        ok: false,
        code: "BUSINESS_RULE_VIOLATION",
        rule: "units_not_available",
      });
      expect("serials" in voided ? [...voided.serials].sort() : []).toEqual([
        "111",
        "222",
      ]);
    },
    TEST_TIMEOUT,
  );

  it(
    "el pedido del agente de un producto por unidad sigue rechazado como product_not_found",
    async () => {
      const s = await seed();
      const phone = await product(s, "IP13");
      await register(s.adminA, phone.id, "111");
      const result = await getDb().transaction((tx) =>
        placeOrderFromIngestion(tx, {
          organizationId: s.orgA,
          credentialId: "00000000-0000-4000-8000-000000000001",
          ingestionEventId: "00000000-0000-4000-8000-000000000002",
          phoneE164: "+5493511234567",
          lines: [{ productId: phone.id, quantity: "1" }],
        }),
      );
      expect(result).toEqual({ ok: false, rule: "product_not_found" });
    },
    TEST_TIMEOUT,
  );
});

describe("el precio propio, el viewer y el aislamiento (D-2, D-8, invariante 7)", () => {
  it(
    "el precio propio se fija en el alta, se corrige con auditoría price_change y lo ve el viewer sin el costo",
    async () => {
      const s = await seed();
      const phone = await product(s, "IP13");
      const unitId = await register(s.adminA, phone.id, "111", {
        price: "850",
        priceCurrency: "USD",
      });
      expect(
        await correctUnit(s.adminA, unitId, {
          gradeId: "",
          batteryHealth: "",
          price: "",
          priceCurrency: "",
        }),
      ).toMatchObject({ ok: true, changed: true });
      // Sin los campos de precio, la corrección no lo cambia.
      await correctUnit(s.adminA, unitId, { gradeId: "", batteryHealth: "80" });
      const audits = await getDb().execute<{ action: string; diff: unknown }>(
        sql`select action::text as action, diff from audit_logs
            where entity_type = 'stock_unit' and entity_id = ${unitId}
              and action in ('price_change', 'update')
            order by created_at`,
      );
      expect(audits.rows).toEqual([
        {
          action: "price_change",
          diff: {
            before: { price: "850.00", price_currency: "USD" },
            after: { price: null, price_currency: null },
          },
        },
        {
          action: "update",
          diff: {
            before: { battery_health: null },
            after: { battery_health: 80 },
          },
        },
      ]);
      await correctUnit(s.adminA, unitId, {
        gradeId: "",
        batteryHealth: "80",
        price: "870",
        priceCurrency: "USD",
      });
      const viewed = await listProductUnits(s.viewerA, phone.id);
      expect(viewed.ok && viewed.units[0]).toMatchObject({
        serial: "111",
        cost: null,
        price: { amount: "870.00", currency: "USD" },
      });
    },
    TEST_TIMEOUT,
  );

  it(
    "otra organización no elige las unidades de A, ni ve sus pedidos ni sus ventas",
    async () => {
      const s = await seed();
      const phone = await product(s, "IP13");
      const unitId = await register(s.adminA, phone.id, "111");
      const phoneB = await product(s, "IP13", {
        context: s.adminB,
        orgId: s.orgB,
        userId: s.adminBId,
      });
      expect(
        await issueSale(s.adminB, saleInput([{ ...phoneB, serials: "111" }])),
      ).toEqual({
        ok: false,
        code: "BUSINESS_RULE_VIOLATION",
        rule: "units",
        units: [{ position: 1, serial: "111", reason: "not_found" }],
      });
      const orderId = await newOrder(s, [{ ...phone, serials: "111" }]);
      await confirmOrder(s.adminA, orderId);
      const mine = await getUnitOrders(s.adminA, [unitId]);
      expect(mine.ok && mine.orders.get(unitId)?.id).toBe(orderId);
      const theirs = await getUnitOrders(s.adminB, [unitId]);
      expect(theirs.ok && theirs.orders.size).toBe(0);
      const sales = await getUnitSales(s.adminB, [unitId]);
      expect(sales.ok && sales.sales.size).toBe(0);
      // La base exige la organización de la unidad en la línea: una fila cruzada se rechaza.
      const line = await getDb().execute<{ id: string }>(
        sql`select id from order_lines limit 1`,
      );
      await expect(
        getDb().execute(
          sql`insert into order_line_units (organization_id, order_line_id, product_id, unit_id, unit_price)
              values (${s.orgB}, ${line.rows[0]!.id}, ${phone.id}, ${unitId}, 1)`,
        ),
      ).rejects.toThrow();
    },
    TEST_TIMEOUT,
  );
});

describe("el esquema (D-4)", () => {
  it(
    "las tablas de unidades son de solo inserción, y el trigger permite solo las transiciones de D-3",
    async () => {
      const s = await seed();
      const phone = await product(s, "IP13");
      const other = await product(s, "IP14");
      const unitId = await register(s.adminA, phone.id, "111");
      const otherUnit = await register(s.adminA, other.id, "222");
      const orderId = await newOrder(s, [{ ...phone, serials: "111" }]);
      for (const statement of [
        sql`update order_line_units set unit_price = 1`,
        sql`delete from order_line_units`,
      ]) {
        await expect(getDb().execute(statement)).rejects.toThrow();
      }
      // sale_line_units, igual (revisión independiente de la 29.5.2, H-7). El pedido pendiente no
      // reserva la unidad, así que una venta sin pedido la puede vender.
      expect(
        await issueSale(s.adminA, saleInput([{ ...phone, serials: "111" }])),
      ).toMatchObject({ ok: true });
      for (const statement of [
        sql`update sale_line_units set unit_price = 1`,
        sql`delete from sale_line_units`,
      ]) {
        await expect(getDb().execute(statement)).rejects.toThrow();
      }
      // La unidad tiene que ser del producto de la línea: la clave compuesta lo exige.
      const line = await getDb().execute<{ id: string }>(
        sql`select id from order_lines where order_id = ${orderId}`,
      );
      await expect(
        getDb().execute(
          sql`insert into order_line_units (organization_id, order_line_id, product_id, unit_id, unit_price)
              values (${s.orgA}, ${line.rows[0]!.id}, ${phone.id}, ${otherUnit}, 1)`,
        ),
      ).rejects.toThrow();
      // El precio y su moneda, los dos o ninguno.
      await expect(
        getDb().execute(
          sql`update stock_units set price = 10 where id = ${unitId}`,
        ),
      ).rejects.toThrow();
      // available -> sold está permitida; written_off sigue final; sold -> reserved no.
      await getDb().execute(
        sql`update stock_units set status = 'sold' where id = ${otherUnit}`,
      );
      expect(
        await pgMessage(
          getDb().execute(
            sql`update stock_units set status = 'reserved' where id = ${otherUnit}`,
          ),
        ),
      ).toMatch(/transición sold -> reserved no permitida/);
      // Se deshace a mano para que el invariante cierre: sold -> available es la de la anulación.
      await getDb().execute(
        sql`update stock_units set status = 'available' where id = ${otherUnit}`,
      );
    },
    TEST_TIMEOUT,
  );
});

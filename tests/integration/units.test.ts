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
import {
  createProduct,
  suggestProducts,
  updateProduct,
  type ProductInput,
} from "@/modules/catalog";
import {
  adjustStock,
  applyGradeTemplate,
  changeProductTracking,
  countUnitsByStatus,
  correctUnit,
  createUnitGrade,
  getCatalogProductAvailableForService,
  getCatalogProductForService,
  getProductBalanceForService,
  getProductStockForService,
  listProductUnits,
  listUnitGrades,
  moveUnitGrade,
  registerUnit,
  searchCatalogAvailableForService,
  searchCatalogForService,
  setUnitGradeActive,
  writeOffUnit,
  type UnitInput,
} from "@/modules/inventory";
import { confirmOrder, createOrder } from "@/modules/orders";
import {
  activateCapability,
  getAuthContext,
  getProfile,
  type AuthContext,
} from "@/modules/organizations";
import {
  createGoodsReceipt,
  createSupplier,
  getGoodsReceipt,
  voidGoodsReceipt,
  type GoodsReceiptInput,
} from "@/modules/purchasing";
import { issueSale } from "@/modules/sales";
import { getDb } from "@/shared/db";
import { resetDatabase } from "./reset-database";
import { expectStockInvariant } from "./stock-invariant";

// Las unidades con IMEI contra PostgreSQL real (brief-29.5, D-10): el esquema, el seguimiento, cada
// camino de D-4 con el invariante después de cada test, los rechazos de pedidos, ventas y ajustes, la
// concurrencia, el agente, el viewer, el aislamiento y los grados. Sin la capacidad, nada cambia: lo
// prueban las suites de siempre, que pasan sin tocarlas.

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

// La activación del script: la capacidad y los grados del perfil, en una transacción.
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

function productInput(
  sku: string,
  overrides: Partial<ProductInput> = {},
): ProductInput {
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
    ...overrides,
  };
}

async function newProduct(
  context: AuthContext,
  sku: string,
  overrides: Partial<ProductInput> = {},
) {
  const created = await createProduct(context, productInput(sku, overrides));
  if (!created.ok)
    throw new Error(`alta rechazada: ${JSON.stringify(created)}`);
  return created.productId;
}

async function insertPrice(
  organizationId: string,
  productId: string,
  createdBy: string,
) {
  const result = await getDb().execute<{ id: string }>(
    sql`insert into product_prices (organization_id, product_id, amount, currency, created_by)
        values (${organizationId}, ${productId}, '899.00', 'USD', ${createdBy}) returning id`,
  );
  return result.rows[0]!.id;
}

async function unitProduct(context: AuthContext, sku: string) {
  const id = await newProduct(context, sku);
  const changed = await changeProductTracking(context, id, "unit");
  if (!changed.ok) throw new Error(`seguimiento rechazado: ${changed.code}`);
  return id;
}

const unit = (
  serial: string,
  overrides: Partial<UnitInput> = {},
): UnitInput => ({
  serial,
  cost: "450",
  currency: "USD",
  gradeId: "",
  batteryHealth: "",
  ...overrides,
});

async function register(
  context: AuthContext,
  productId: string,
  serial: string,
  overrides: Partial<UnitInput> = {},
) {
  const result = await registerUnit(
    context,
    productId,
    unit(serial, overrides),
  );
  if (!result.ok) throw new Error(`alta rechazada: ${JSON.stringify(result)}`);
  return result.unitId;
}

// Organización A con la capacidad y los grados, con admin y viewer; B con la capacidad; C sin ella.
async function seed() {
  const orgA = await createOrganization("iPhone A");
  const orgB = await createOrganization("iPhone B");
  const orgC = await createOrganization("Negocio C");
  const adminAId = await addUser(orgA, "admin-a@example.com", "admin");
  await addUser(orgA, "viewer-a@example.com", "viewer");
  await addUser(orgB, "admin-b@example.com", "admin");
  await addUser(orgC, "admin-c@example.com", "admin");
  const grades = await activateUnits(orgA, "admin-a@example.com");
  await activateUnits(orgB, "admin-b@example.com");
  const adminA = await contextFor("admin-a@example.com");
  const supplier = await createSupplier(adminA, { name: "Importadora" });
  if (!supplier.ok) throw new Error("proveedor rechazado");
  const client = await getDb().execute<{ id: string }>(
    sql`insert into clients (organization_id, display_name) values (${orgA}, 'Lucía') returning id`,
  );
  return {
    orgA,
    orgB,
    orgC,
    adminAId,
    grades,
    adminA,
    viewerA: await contextFor("viewer-a@example.com"),
    adminB: await contextFor("admin-b@example.com"),
    adminC: await contextFor("admin-c@example.com"),
    supplierA: supplier.supplierId,
    clientA: client.rows[0]!.id,
  };
}

type Seed = Awaited<ReturnType<typeof seed>>;

async function balance(productId: string) {
  const result = await getDb().execute<{ on_hand: string; reserved: string }>(
    sql`select quantity_on_hand as on_hand, quantity_reserved as reserved
        from inventories where product_id = ${productId}`,
  );
  return result.rows[0] ?? null;
}

async function unitsOf(productId: string) {
  const result = await getDb().execute<{ serial: string; status: string }>(
    sql`select serial, status from stock_units where product_id = ${productId} order by serial`,
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

function receiptInput(
  s: Seed,
  lines: GoodsReceiptInput["lines"],
): GoodsReceiptInput {
  return {
    purchaseOrderId: null,
    supplierId: s.supplierA,
    currency: "USD",
    supplierReference: "",
    lines,
  };
}

// drizzle-orm envuelve el error de pg; el código queda en la causa.
async function pgError(query: Promise<unknown>): Promise<string> {
  try {
    await query;
  } catch (error) {
    const e = error as { code?: string; cause?: { code?: string } };
    return e.cause?.code ?? e.code ?? "sin código";
  }
  throw new Error("La consulta debía ser rechazada y no lo fue.");
}

beforeAll(async () => {
  storedHash = await hashPassword(PASSWORD);
});

beforeEach(async () => {
  await resetDatabase(getDb());
});

// El invariante, después de cada test (D-8).
afterEach(async () => {
  await expectStockInvariant();
});

afterAll(async () => {
  await getDb().$client.end();
});

describe("el esquema (D-2)", () => {
  it("los privilegios de crm_app", async () => {
    const result = await getDb().execute<{ table: string; privileges: string }>(
      sql`select table_name as table, string_agg(privilege_type, ',' order by privilege_type) as privileges
          from information_schema.role_table_grants
          where grantee = 'crm_app' and table_name in
            ('stock_units', 'unit_grades', 'goods_receipt_line_units')
          group by table_name order by table_name`,
    );
    expect(result.rows).toEqual([
      { table: "goods_receipt_line_units", privileges: "INSERT,SELECT" },
      { table: "stock_units", privileges: "INSERT,SELECT,UPDATE" },
      { table: "unit_grades", privileges: "INSERT,SELECT,UPDATE" },
    ]);
  });

  it(
    "el IMEI, la batería, el índice parcial y el trigger",
    async () => {
      const s = await seed();
      const phone = await unitProduct(s.adminA, "IP13");
      const insert = (serial: string, battery: number | null = null) =>
        getDb().execute(
          sql`insert into stock_units (organization_id, product_id, serial, battery_health, cost,
                cost_currency, origin_type, created_by)
              values (${s.orgA}, ${phone}, ${serial}, ${battery}, 1, 'USD', 'manual', ${s.adminAId})
              returning id`,
        );
      // La forma del IMEI y la batería (CHECK).
      expect(await pgError(insert("con espacio"))).toBe("23514");
      expect(await pgError(insert("A".repeat(33)))).toBe("23514");
      expect(await pgError(insert("111", 101))).toBe("23514");
      // Único entre las vigentes, sin distinguir mayúsculas.
      const first = await insert("abc123");
      expect(await pgError(insert("ABC123"))).toBe("23505");
      const id = (first.rows[0] as { id: string }).id;
      // El trigger: el IMEI no cambia, la unidad no se borra y una dada de baja no vuelve.
      expect(
        await pgError(
          getDb().execute(
            sql`update stock_units set serial = 'otro' where id = ${id}`,
          ),
        ),
      ).toBe("P0001");
      expect(
        await pgError(
          getDb().execute(sql`delete from stock_units where id = ${id}`),
        ),
      ).toBe("P0001");
      await getDb().execute(
        sql`update stock_units set status = 'written_off' where id = ${id}`,
      );
      expect(
        await pgError(
          getDb().execute(
            sql`update stock_units set status = 'available' where id = ${id}`,
          ),
        ),
      ).toBe("P0001");
      expect(
        await pgError(
          getDb().execute(
            sql`update stock_units set battery_health = 50 where id = ${id}`,
          ),
        ),
      ).toBe("P0001");
      // Una dada de baja libera su IMEI.
      await insert("ABC123");
      // Una unidad nace disponible.
      expect(
        await pgError(
          getDb().execute(
            sql`insert into stock_units (organization_id, product_id, serial, status, cost,
                  cost_currency, origin_type, created_by)
                values (${s.orgA}, ${phone}, 'nueva', 'written_off', 1, 'USD', 'manual', ${s.adminAId})`,
          ),
        ),
      ).toBe("P0001");
      // La fila de prueba no pasó por inventory: se da de baja para que el invariante la ignore.
      await getDb().execute(
        sql`update stock_units set status = 'written_off' where serial = 'ABC123'`,
      );
    },
    TEST_TIMEOUT,
  );

  it(
    "las unidades de una línea son de solo inserción",
    async () => {
      const s = await seed();
      const phone = await unitProduct(s.adminA, "IP13");
      const created = await createGoodsReceipt(
        s.adminA,
        receiptInput(s, [
          { productId: phone, quantity: "1", unitCost: "400", serials: "111" },
        ]),
      );
      expect(created.ok).toBe(true);
      expect(
        await pgError(
          getDb().execute(sql`delete from goods_receipt_line_units`),
        ),
      ).toBe("P0001");
    },
    TEST_TIMEOUT,
  );
});

describe("el seguimiento (D-3, AC-1)", () => {
  it(
    "pasa a unidad sin movimientos y con la capacidad, y se audita",
    async () => {
      const s = await seed();
      const id = await newProduct(s.adminA, "IP13");
      expect(await changeProductTracking(s.viewerA, id, "unit")).toMatchObject({
        code: "FORBIDDEN",
      });
      expect(await changeProductTracking(s.adminA, id, "unit")).toEqual({
        ok: true,
        changed: true,
      });
      expect(await changeProductTracking(s.adminA, id, "unit")).toEqual({
        ok: true,
        changed: false,
      });
      const audit = await getDb().execute<{ diff: unknown }>(
        sql`select diff from audit_logs where entity_id = ${id} and action = 'update'`,
      );
      expect(audit.rows).toEqual([
        {
          diff: {
            before: { tracking: "quantity" },
            after: { tracking: "unit" },
          },
        },
      ]);
      // Vuelve a cantidad mientras no tenga movimientos.
      expect(await changeProductTracking(s.adminA, id, "quantity")).toEqual({
        ok: true,
        changed: true,
      });
    },
    TEST_TIMEOUT,
  );

  it(
    "con movimientos o sin la capacidad, se rechaza",
    async () => {
      const s = await seed();
      const moved = await newProduct(s.adminA, "FUNDA");
      await adjustStock(s.adminA, moved, {
        type: "adjustment_positive",
        quantity: "3",
        expectedQuantityOnHand: "0",
        reason: "Carga",
      });
      expect(await changeProductTracking(s.adminA, moved, "unit")).toEqual({
        ok: false,
        code: "BUSINESS_RULE_VIOLATION",
        rule: "has_movements",
      });
      const phone = await unitProduct(s.adminA, "IP13");
      await register(s.adminA, phone, "111");
      expect(await changeProductTracking(s.adminA, phone, "quantity")).toEqual({
        ok: false,
        code: "BUSINESS_RULE_VIOLATION",
        rule: "has_movements",
      });

      const other = await newProduct(s.adminC, "IP13");
      expect(await changeProductTracking(s.adminC, other, "unit")).toEqual({
        ok: false,
        code: "BUSINESS_RULE_VIOLATION",
        rule: "capability_required",
      });
      // El producto de otra organización no existe para A.
      expect(
        await changeProductTracking(s.adminA, other, "unit"),
      ).toMatchObject({
        code: "NOT_FOUND",
      });
    },
    TEST_TIMEOUT,
  );

  it(
    "la condición usado exige la capacidad, y la de un producto por unidad no cambia",
    async () => {
      const s = await seed();
      expect(
        await createProduct(
          s.adminC,
          productInput("USADO", { condition: "used" }),
        ),
      ).toEqual({ ok: false, code: "VALIDATION_ERROR", fields: ["condition"] });
      await newProduct(s.adminA, "USADO", { condition: "used" });

      const phone = await unitProduct(s.adminA, "IP13");
      expect(
        await updateProduct(
          s.adminA,
          phone,
          productInput("IP13", { condition: "refurbished" }),
        ),
      ).toEqual({
        ok: false,
        code: "BUSINESS_RULE_VIOLATION",
        rule: "unit_condition_locked",
      });
      // Los demás campos se editan.
      expect(
        await updateProduct(
          s.adminA,
          phone,
          productInput("IP13", { name: "iPhone 13" }),
        ),
      ).toEqual({ ok: true, changed: true });
    },
    TEST_TIMEOUT,
  );
});

describe("el alta, la baja y la corrección manual (D-4, AC-3, AC-4)", () => {
  it(
    "el alta crea la unidad, sube el saldo con su movimiento y se audita",
    async () => {
      const s = await seed();
      const phone = await unitProduct(s.adminA, "IP13");
      const grades = await listUnitGrades(s.adminA);
      const gradeA = grades.ok
        ? grades.grades.find((grade) => grade.name === "A")!.id
        : "";
      const unitId = await register(s.adminA, phone, "356938035643809", {
        gradeId: gradeA,
        batteryHealth: "87",
        cost: "450,50",
      });
      expect(await balance(phone)).toEqual({
        on_hand: "1.000",
        reserved: "0.000",
      });
      expect(await movementsOf(phone)).toEqual([
        {
          type: "adjustment_positive",
          quantity: "1.000",
          balance_after: "1.000",
          serial: "356938035643809",
        },
      ]);
      const audit = await getDb().execute<{
        action: string;
        entity_type: string;
      }>(
        sql`select action, entity_type from audit_logs where entity_id = ${unitId}`,
      );
      expect(audit.rows).toEqual([
        { action: "create", entity_type: "stock_unit" },
      ]);

      const listed = await listProductUnits(s.adminA, phone);
      expect(listed.ok && listed.units).toMatchObject([
        {
          serial: "356938035643809",
          status: "available",
          grade: { name: "A" },
          batteryHealth: 87,
          cost: { amount: "450.50", currency: "USD" },
          origin: "manual",
        },
      ]);
      // El viewer ve la unidad sin su costo (AC-8).
      const viewed = await listProductUnits(s.viewerA, phone);
      expect(viewed.ok && viewed.units[0]!.cost).toBeNull();
      expect(await registerUnit(s.viewerA, phone, unit("222"))).toMatchObject({
        code: "FORBIDDEN",
      });
    },
    TEST_TIMEOUT,
  );

  it(
    "un IMEI repetido se rechaza; el de una unidad dada de baja se vuelve a cargar",
    async () => {
      const s = await seed();
      const phone = await unitProduct(s.adminA, "IP13");
      const other = await unitProduct(s.adminA, "IP14");
      const unitId = await register(s.adminA, phone, "abc123");
      // Sin distinguir mayúsculas, también en otro producto de la organización.
      expect(await registerUnit(s.adminA, other, unit("ABC123"))).toEqual({
        ok: false,
        code: "CONFLICT",
        field: "serial",
      });
      // En otra organización, el mismo IMEI es otra unidad.
      const foreign = await unitProduct(s.adminB, "IP13");
      await register(s.adminB, foreign, "ABC123");

      expect(await writeOffUnit(s.adminA, unitId, "IMEI mal cargado")).toEqual({
        ok: true,
        productId: phone,
        from: "available",
      });
      await register(s.adminA, other, "ABC123");
      expect(await unitsOf(phone)).toEqual([
        { serial: "abc123", status: "written_off" },
      ]);
      expect(await balance(phone)).toEqual({
        on_hand: "0.000",
        reserved: "0.000",
      });
      expect(await movementsOf(phone)).toMatchObject([
        { type: "adjustment_positive", serial: "abc123" },
        {
          type: "adjustment_negative",
          serial: "abc123",
          balance_after: "0.000",
        },
      ]);
      // La segunda baja de la misma unidad.
      expect(await writeOffUnit(s.adminA, unitId, "otra vez")).toEqual({
        ok: false,
        code: "BUSINESS_RULE_VIOLATION",
        rule: "unit_not_available",
      });
      expect(await writeOffUnit(s.adminA, unitId, "  ")).toEqual({
        ok: false,
        code: "VALIDATION_ERROR",
        fields: ["reason"],
      });
    },
    TEST_TIMEOUT,
  );

  it(
    "dos altas simultáneas del mismo IMEI: una entra y la otra se rechaza",
    async () => {
      const s = await seed();
      const phone = await unitProduct(s.adminA, "IP13");
      const other = await unitProduct(s.adminA, "IP14");
      const results = await Promise.all([
        registerUnit(s.adminA, phone, unit("999")),
        registerUnit(s.adminA, other, unit("999")),
      ]);
      expect(results.filter((result) => result.ok)).toHaveLength(1);
      expect(results.filter((result) => !result.ok)).toEqual([
        { ok: false, code: "CONFLICT", field: "serial" },
      ]);
    },
    TEST_TIMEOUT,
  );

  it(
    "el alta se rechaza en un producto por cantidad, inactivo, sin la capacidad o con un grado inactivo",
    async () => {
      const s = await seed();
      const box = await newProduct(s.adminA, "FUNDA");
      expect(await registerUnit(s.adminA, box, unit("111"))).toEqual({
        ok: false,
        code: "BUSINESS_RULE_VIOLATION",
        rule: "not_unit_tracked",
      });
      const phone = await unitProduct(s.adminA, "IP13");
      const grades = await listUnitGrades(s.adminA);
      const gradeC = grades.ok
        ? grades.grades.find((grade) => grade.name === "C")!.id
        : "";
      await setUnitGradeActive(s.adminA, gradeC, false);
      expect(
        await registerUnit(s.adminA, phone, unit("111", { gradeId: gradeC })),
      ).toEqual({ ok: false, code: "VALIDATION_ERROR", fields: ["gradeId"] });
      await getDb().execute(
        sql`update products set is_active = false where id = ${phone}`,
      );
      expect(await registerUnit(s.adminA, phone, unit("111"))).toEqual({
        ok: false,
        code: "BUSINESS_RULE_VIOLATION",
        rule: "inactive_product",
      });
      const other = await newProduct(s.adminC, "IP13");
      expect(await registerUnit(s.adminC, other, unit("111"))).toEqual({
        ok: false,
        code: "NOT_FOUND",
      });
      // Ningún rechazo escribió: ni unidades, ni movimientos, ni saldos.
      const counts = await getDb().execute<{
        units: number;
        movements: number;
      }>(
        sql`select (select count(*)::int from stock_units) as units,
                   (select count(*)::int from inventory_movements) as movements`,
      );
      expect(counts.rows[0]).toEqual({ units: 0, movements: 0 });
    },
    TEST_TIMEOUT,
  );

  it(
    "la corrección del grado y la batería se audita; el IMEI y el costo no cambian",
    async () => {
      const s = await seed();
      const phone = await unitProduct(s.adminA, "IP13");
      const unitId = await register(s.adminA, phone, "111");
      const grades = await listUnitGrades(s.adminA);
      const gradeB = grades.ok
        ? grades.grades.find((grade) => grade.name === "B")!.id
        : "";
      expect(
        await correctUnit(s.adminA, unitId, {
          gradeId: gradeB,
          batteryHealth: "90",
        }),
      ).toEqual({ ok: true, changed: true, productId: phone });
      expect(
        await correctUnit(s.adminA, unitId, {
          gradeId: gradeB,
          batteryHealth: "90",
        }),
      ).toEqual({ ok: true, changed: false, productId: phone });
      const audit = await getDb().execute<{ diff: unknown }>(
        sql`select diff from audit_logs where entity_id = ${unitId} and action = 'update'`,
      );
      expect(audit.rows).toEqual([
        {
          diff: {
            before: { grade_id: null, battery_health: null },
            after: { grade_id: gradeB, battery_health: 90 },
          },
        },
      ]);
      await writeOffUnit(s.adminA, unitId, "rota");
      expect(
        await correctUnit(s.adminA, unitId, { gradeId: "", batteryHealth: "" }),
      ).toEqual({
        ok: false,
        code: "BUSINESS_RULE_VIOLATION",
        rule: "unit_not_available",
      });
    },
    TEST_TIMEOUT,
  );
});

describe("la recepción de mercadería con IMEI (D-4, AC-2)", () => {
  it(
    "crea una unidad por IMEI, sin product_costs, con su movimiento cada una",
    async () => {
      const s = await seed();
      const phone = await unitProduct(s.adminA, "IP13");
      const box = await newProduct(s.adminA, "FUNDA");
      const created = await createGoodsReceipt(
        s.adminA,
        receiptInput(s, [
          {
            productId: phone,
            quantity: "2",
            unitCost: "400",
            serials: "111\n222\n",
          },
          { productId: box, quantity: "5", unitCost: "3", serials: "" },
        ]),
      );
      if (!created.ok) throw new Error(JSON.stringify(created));
      expect(await unitsOf(phone)).toEqual([
        { serial: "111", status: "available" },
        { serial: "222", status: "available" },
      ]);
      expect(await balance(phone)).toEqual({
        on_hand: "2.000",
        reserved: "0.000",
      });
      expect(await movementsOf(phone)).toMatchObject([
        {
          type: "goods_receipt",
          quantity: "1.000",
          balance_after: "1.000",
          serial: "111",
        },
        {
          type: "goods_receipt",
          quantity: "1.000",
          balance_after: "2.000",
          serial: "222",
        },
      ]);
      expect(await movementsOf(box)).toMatchObject([
        { type: "goods_receipt", quantity: "5.000", serial: null },
      ]);
      // El costo del iPhone vive en cada unidad; el de la funda, en product_costs (H-6).
      const costs = await getDb().execute<{ product_id: string }>(
        sql`select product_id from product_costs`,
      );
      expect(costs.rows).toEqual([{ product_id: box }]);
      const units = await listProductUnits(s.adminA, phone);
      expect(units.ok && units.units.map((u) => [u.origin, u.cost])).toEqual([
        ["goods_receipt", { amount: "400.00", currency: "USD" }],
        ["goods_receipt", { amount: "400.00", currency: "USD" }],
      ]);
      const origin = await getDb().execute<{ origin_id: string }>(
        sql`select distinct origin_id from stock_units`,
      );
      expect(origin.rows).toEqual([{ origin_id: created.receipt.id }]);
      // El detalle muestra los IMEI de la línea.
      const detail = await getGoodsReceipt(s.adminA, created.receipt.id);
      expect(
        detail.ok && detail.receipt.lines.map((line) => line.serials),
      ).toEqual([["111", "222"], []]);
    },
    TEST_TIMEOUT,
  );

  it(
    "las reglas de los IMEI, sin escribir nada",
    async () => {
      const s = await seed();
      const phone = await unitProduct(s.adminA, "IP13");
      const box = await newProduct(s.adminA, "FUNDA");
      await register(s.adminA, phone, "999");
      const rule = async (lines: GoodsReceiptInput["lines"]) =>
        createGoodsReceipt(s.adminA, receiptInput(s, lines));
      expect(
        await rule([
          { productId: phone, quantity: "2", unitCost: "1", serials: "111" },
        ]),
      ).toMatchObject({
        rule: "line_rules",
        lines: [{ rule: "serials_count" }],
      });
      expect(
        await rule([
          {
            productId: phone,
            quantity: "1,5",
            unitCost: "1",
            serials: "111 222",
          },
        ]),
      ).toMatchObject({
        rule: "line_rules",
        lines: [{ rule: "serials_count" }],
      });
      expect(
        await rule([
          {
            productId: phone,
            quantity: "1",
            unitCost: "1",
            serials: "IMEI:111",
          },
        ]),
      ).toMatchObject({
        rule: "line_rules",
        lines: [{ rule: "serial_format" }],
      });
      expect(
        await rule([
          {
            productId: phone,
            quantity: "2",
            unitCost: "1",
            serials: "aaa AAA",
          },
        ]),
      ).toMatchObject({
        rule: "line_rules",
        lines: [{ rule: "serial_repeated" }],
      });
      expect(
        await rule([
          { productId: box, quantity: "1", unitCost: "1", serials: "111" },
        ]),
      ).toMatchObject({
        rule: "line_rules",
        lines: [{ rule: "serials_not_allowed" }],
      });
      expect(
        await rule([
          {
            productId: phone,
            quantity: "2",
            unitCost: "1",
            serials: "111 999",
          },
        ]),
      ).toEqual({
        ok: false,
        code: "BUSINESS_RULE_VIOLATION",
        rule: "serials_taken",
        serials: ["999"],
      });
      const counts = await getDb().execute<{
        receipts: number;
        units: number;
        counter: number;
      }>(
        sql`select (select count(*)::int from goods_receipts) as receipts,
                   (select count(*)::int from stock_units) as units,
                   (select count(*)::int from document_counters where kind = 'goods_receipt') as counter`,
      );
      expect(counts.rows[0]).toEqual({ receipts: 0, units: 1, counter: 0 });
    },
    TEST_TIMEOUT,
  );

  it(
    "la anulación da de baja las unidades; con una ya dada de baja, se rechaza sin escribir",
    async () => {
      const s = await seed();
      const phone = await unitProduct(s.adminA, "IP13");
      const receipt = async (serials: string) => {
        const created = await createGoodsReceipt(
          s.adminA,
          receiptInput(s, [
            { productId: phone, quantity: "2", unitCost: "400", serials },
          ]),
        );
        if (!created.ok) throw new Error(JSON.stringify(created));
        return created.receipt.id;
      };
      const first = await receipt("111 222");
      expect(
        await voidGoodsReceipt(s.adminA, first, "data_entry_error"),
      ).toMatchObject({
        ok: true,
      });
      expect(await unitsOf(phone)).toEqual([
        { serial: "111", status: "written_off" },
        { serial: "222", status: "written_off" },
      ]);
      expect(await balance(phone)).toEqual({
        on_hand: "0.000",
        reserved: "0.000",
      });

      // Los mismos IMEI se vuelven a recibir.
      const second = await receipt("111 222");
      const units = await getDb().execute<{ id: string }>(
        sql`select id from stock_units where status = 'available' and serial = '222'`,
      );
      await writeOffUnit(s.adminA, units.rows[0]!.id, "vendida por fuera");
      const before = await movementsOf(phone);
      expect(
        await voidGoodsReceipt(s.adminA, second, "data_entry_error"),
      ).toEqual({
        ok: false,
        code: "BUSINESS_RULE_VIOLATION",
        rule: "units_not_available",
        serials: ["222"],
      });
      expect(await movementsOf(phone)).toEqual(before);
      const voids = await getDb().execute<{ count: number }>(
        sql`select count(*)::int as count from goods_receipt_voids`,
      );
      expect(voids.rows[0]!.count).toBe(1);
    },
    TEST_TIMEOUT,
  );

  // Revisión independiente de la 29.5, m-4: la traducción del 23505 en la recepción no tenía test.
  // Los IMEI van en orden cruzado a propósito: el contador de la recepción pone a las dos en fila
  // antes de insertar, así que la segunda choca en el índice y no hay deadlock.
  it(
    "dos recepciones simultáneas con los mismos IMEI: una entra y la otra responde serials_taken",
    async () => {
      const s = await seed();
      const phone = await unitProduct(s.adminA, "IP13");
      const other = await unitProduct(s.adminA, "IP14");
      const results = await Promise.all([
        createGoodsReceipt(
          s.adminA,
          receiptInput(s, [
            {
              productId: phone,
              quantity: "2",
              unitCost: "400",
              serials: "111 222",
            },
          ]),
        ),
        createGoodsReceipt(
          s.adminA,
          receiptInput(s, [
            {
              productId: other,
              quantity: "2",
              unitCost: "500",
              serials: "222 111",
            },
          ]),
        ),
      ]);
      expect(results.filter((result) => result.ok)).toHaveLength(1);
      expect(results.find((result) => !result.ok)).toMatchObject({
        ok: false,
        code: "BUSINESS_RULE_VIOLATION",
        rule: "serials_taken",
      });
      const units = await getDb().execute<{ count: number }>(
        sql`select count(*)::int as count from stock_units`,
      );
      expect(units.rows[0]!.count).toBe(2);
      const receipts = await getDb().execute<{ count: number }>(
        sql`select count(*)::int as count from goods_receipts`,
      );
      expect(receipts.rows[0]!.count).toBe(1);
    },
    TEST_TIMEOUT,
  );

  it(
    "una baja simultánea con la anulación de la recepción: una de las dos gana",
    async () => {
      const s = await seed();
      const phone = await unitProduct(s.adminA, "IP13");
      const created = await createGoodsReceipt(
        s.adminA,
        receiptInput(s, [
          { productId: phone, quantity: "1", unitCost: "400", serials: "111" },
        ]),
      );
      if (!created.ok) throw new Error(JSON.stringify(created));
      const unitRow = await getDb().execute<{ id: string }>(
        sql`select id from stock_units`,
      );
      const [voided, writtenOff] = await Promise.all([
        voidGoodsReceipt(s.adminA, created.receipt.id, "duplicate"),
        writeOffUnit(s.adminA, unitRow.rows[0]!.id, "rota"),
      ]);
      expect([voided.ok, writtenOff.ok].filter(Boolean)).toHaveLength(1);
      expect(await balance(phone)).toEqual({
        on_hand: "0.000",
        reserved: "0.000",
      });
      expect(await unitsOf(phone)).toEqual([
        { serial: "111", status: "written_off" },
      ]);
    },
    TEST_TIMEOUT,
  );
});

// Desde la 29.5.2 (brief-29.5.2, D-3 y D-5), el pedido y la venta llevan los IMEI: sin ellos, una línea
// de un producto por unidad se rechaza con units_required, y un pendiente creado cuando el producto era
// por cantidad sigue sin confirmarse (unit_tracked). Los caminos con unidades están en
// units-orders-sales.test.ts.
describe("los rechazos sin IMEI (D-1, AC-5; brief-29.5.2, D-3)", () => {
  it(
    "el ajuste, el pedido sin IMEI, la confirmación de un pendiente viejo y la venta sin IMEI",
    async () => {
      const s = await seed();
      const phone = await newProduct(s.adminA, "IP13");
      const priceId = await insertPrice(s.orgA, phone, s.adminAId);
      // Un pedido pendiente de cuando el producto era por cantidad.
      const pending = await createOrder(s.adminA, {
        clientId: s.clientA,
        lines: [{ productId: phone, quantity: "1", expectedPriceId: priceId }],
      });
      if (!pending.ok) throw new Error(JSON.stringify(pending));
      await changeProductTracking(s.adminA, phone, "unit");
      await register(s.adminA, phone, "111");

      expect(
        await adjustStock(s.adminA, phone, {
          type: "adjustment_negative",
          quantity: "1",
          expectedQuantityOnHand: "1",
          reason: "x",
        }),
      ).toEqual({
        ok: false,
        code: "BUSINESS_RULE_VIOLATION",
        rule: "unit_tracked",
      });
      expect(
        await createOrder(s.adminA, {
          clientId: s.clientA,
          lines: [
            { productId: phone, quantity: "1", expectedPriceId: priceId },
          ],
        }),
      ).toEqual({
        ok: false,
        code: "BUSINESS_RULE_VIOLATION",
        rule: "line_rules",
        lines: [{ position: 1, productId: phone, rule: "units_required" }],
      });
      expect(await confirmOrder(s.adminA, pending.order.id)).toEqual({
        ok: false,
        code: "BUSINESS_RULE_VIOLATION",
        rule: "unit_tracked",
        lines: [{ position: 1, productId: phone }],
      });
      expect(
        await issueSale(s.adminA, {
          clientId: "",
          lines: [
            { productId: phone, quantity: "1", expectedPriceId: priceId },
          ],
        }),
      ).toEqual({
        ok: false,
        code: "BUSINESS_RULE_VIOLATION",
        rule: "line_rules",
        lines: [{ position: 1, productId: phone, rule: "units_required" }],
      });
      expect(await balance(phone)).toEqual({
        on_hand: "1.000",
        reserved: "0.000",
      });
    },
    TEST_TIMEOUT,
  );
});

describe("el agente no ve los usados (D-7, AC-7)", () => {
  it(
    "read-v1 y read-v2 dejan afuera los productos usados; los buscadores de la app no",
    async () => {
      const s = await seed();
      const used = await newProduct(s.adminA, "IP13-USADO", {
        name: "iPhone 13 usado",
        condition: "used",
      });
      const fresh = await newProduct(s.adminA, "IP13-NUEVO", {
        name: "iPhone 13 nuevo",
      });
      const query = { text: "iphone", limit: 10 };
      for (const search of [
        searchCatalogForService,
        searchCatalogAvailableForService,
      ]) {
        expect((await search(s.orgA, query)).map((p) => p.id)).toEqual([fresh]);
      }
      for (const read of [
        getCatalogProductForService,
        getCatalogProductAvailableForService,
        getProductStockForService,
        getProductBalanceForService,
      ]) {
        expect(await read(s.orgA, used)).toBeNull();
        expect(await read(s.orgA, fresh)).not.toBeNull();
      }
      const suggested = await suggestProducts(s.adminA, "iphone");
      expect(
        suggested.ok && suggested.products.map((p) => p.id).sort(),
      ).toEqual([used, fresh].sort());
    },
    TEST_TIMEOUT,
  );
});

describe("el aislamiento (invariante 7)", () => {
  it(
    "una organización no ve ni toca las unidades de otra",
    async () => {
      const s = await seed();
      const phone = await unitProduct(s.adminA, "IP13");
      const unitId = await register(s.adminA, phone, "111");
      expect(await registerUnit(s.adminB, phone, unit("222"))).toEqual({
        ok: false,
        code: "NOT_FOUND",
      });
      expect(await writeOffUnit(s.adminB, unitId, "x")).toEqual({
        ok: false,
        code: "NOT_FOUND",
      });
      expect(
        await correctUnit(s.adminB, unitId, { gradeId: "", batteryHealth: "" }),
      ).toEqual({ ok: false, code: "NOT_FOUND" });
      expect(await listProductUnits(s.adminB, phone)).toEqual({
        ok: false,
        code: "NOT_FOUND",
      });
      // Una unidad no puede apuntar al grado de otra organización: la clave es compuesta.
      const gradesB = await listUnitGrades(s.adminB);
      const gradeB = gradesB.ok ? gradesB.grades[0]!.id : "";
      expect(
        await correctUnit(s.adminA, unitId, {
          gradeId: gradeB,
          batteryHealth: "",
        }),
      ).toEqual({ ok: false, code: "VALIDATION_ERROR", fields: ["gradeId"] });
    },
    TEST_TIMEOUT,
  );
});

describe("los grados (D-5)", () => {
  it(
    "el perfil copia A, B y C; un admin agrega, edita, ordena y desactiva, con auditoría",
    async () => {
      const s = await seed();
      expect(s.grades).toEqual({ created: ["A", "B", "C"], skipped: [] });
      const listed = await listUnitGrades(s.viewerA);
      expect(
        listed.ok &&
          listed.grades.map((grade) => [
            grade.name,
            grade.description,
            grade.isExample,
          ]),
      ).toEqual([
        ["A", "Como nuevo", true],
        ["B", "Marcas leves", true],
        ["C", "Marcas visibles", true],
      ]);
      // La copia otra vez saltea los que ya están.
      const again = await getDb().transaction((tx) =>
        applyGradeTemplate(tx, {
          organizationId: s.orgA,
          actorUserId: s.adminAId,
          grades: getProfile("iphone")!.grades,
        }),
      );
      expect(again).toEqual({ created: [], skipped: ["A", "B", "C"] });

      const created = await createUnitGrade(s.adminA, {
        name: "Batería cambiada",
        description: "",
      });
      expect(created).toMatchObject({ ok: true, changed: true });
      expect(
        await createUnitGrade(s.adminA, { name: "a", description: "" }),
      ).toEqual({ ok: false, code: "CONFLICT", field: "name" });
      expect(
        await createUnitGrade(s.viewerA, { name: "D", description: "" }),
      ).toMatchObject({ code: "FORBIDDEN" });
      const id = created.ok ? created.gradeId : "";
      expect(await moveUnitGrade(s.adminA, id, "up")).toMatchObject({
        ok: true,
        changed: true,
      });
      const moved = await listUnitGrades(s.adminA);
      expect(moved.ok && moved.grades.map((grade) => grade.name)).toEqual([
        "A",
        "B",
        "Batería cambiada",
        "C",
      ]);
      // El vecino también cambia de posición y también queda auditado, con las posiciones guardadas
      // (revisión independiente de la 29.5, m-7).
      const moves = await getDb().execute<{ name: string; diff: unknown }>(
        sql`select g.name, a.diff from audit_logs a
            join unit_grades g on g.id = a.entity_id
            where a.entity_type = 'unit_grade' and a.action = 'update'
            order by g.name`,
      );
      expect(moves.rows).toEqual([
        {
          name: "Batería cambiada",
          diff: { before: { position: 3 }, after: { position: 2 } },
        },
        {
          name: "C",
          diff: { before: { position: 2 }, after: { position: 3 } },
        },
      ]);
      expect(await setUnitGradeActive(s.adminA, id, false)).toMatchObject({
        ok: true,
        changed: true,
      });
      const audit = await getDb().execute<{ action: string }>(
        sql`select action from audit_logs where entity_id = ${id} order by created_at`,
      );
      expect(audit.rows.map((row) => row.action)).toEqual([
        "create",
        "update",
        "deactivate",
      ]);
      // Sin la capacidad, los grados no existen.
      expect(await listUnitGrades(s.adminC)).toEqual({
        ok: false,
        code: "NOT_FOUND",
      });
    },
    TEST_TIMEOUT,
  );
});

// El recuento por estado de la 24.5.1 (brief-24.5.1, D-6 y AC-7). Los seis estados juntos se prueban
// en service-own-units.test.ts, que es el único que llega a in_repair y a in_review.
describe("el recuento de unidades por estado (brief-24.5.1, AC-7)", () => {
  const ZERO = {
    available: 0,
    reserved: 0,
    sold: 0,
    written_off: 0,
    in_repair: 0,
    in_review: 0,
  };

  it(
    "un producto por unidad sin unidades da cero en los seis estados, no un error",
    async () => {
      const s = await seed();
      const productId = await unitProduct(s.adminA, "SIN-UNIDADES");
      expect(await countUnitsByStatus(s.adminA, productId)).toEqual({
        ok: true,
        tracking: "unit",
        counts: ZERO,
      });
    },
    TEST_TIMEOUT,
  );

  it(
    "con unidades en un solo estado, solo ese estado tiene número",
    async () => {
      const s = await seed();
      const productId = await unitProduct(s.adminA, "TRES-DISPONIBLES");
      await register(s.adminA, productId, "SERIE-A");
      await register(s.adminA, productId, "SERIE-B");
      await register(s.adminA, productId, "SERIE-C");
      expect(await countUnitsByStatus(s.adminA, productId)).toEqual({
        ok: true,
        tracking: "unit",
        counts: { ...ZERO, available: 3 },
      });
    },
    TEST_TIMEOUT,
  );

  it(
    "un producto por cantidad no trae recuentos: no hay unidades que contar",
    async () => {
      const s = await seed();
      const productId = await newProduct(s.adminA, "POR-CANTIDAD");
      expect(await countUnitsByStatus(s.adminA, productId)).toEqual({
        ok: true,
        tracking: "quantity",
        counts: null,
      });
    },
    TEST_TIMEOUT,
  );

  it(
    "otra organización no lo ve, y un producto que no existe tampoco",
    async () => {
      const s = await seed();
      const productId = await unitProduct(s.adminA, "AJENO");
      await register(s.adminA, productId, "SERIE-AJENA");
      expect(await countUnitsByStatus(s.adminB, productId)).toEqual({
        ok: false,
        code: "NOT_FOUND",
      });
      expect(
        await countUnitsByStatus(
          s.adminA,
          "00000000-0000-4000-8000-000000000000",
        ),
      ).toEqual({ ok: false, code: "NOT_FOUND" });
    },
    TEST_TIMEOUT,
  );
});

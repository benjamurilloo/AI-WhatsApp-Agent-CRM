import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
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
import { voidTradeIn } from "@/modules/cash";
import {
  createModel,
  createProduct,
  createServiceProduct,
  type ProductInput,
} from "@/modules/catalog";
import { createClient, getClient, updateClient } from "@/modules/crm";
import {
  applyGradeTemplate,
  changeProductTracking,
  correctUnit,
  listUnitGrades,
  registerUnit,
  releaseUnit,
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
import { issueSale, voidSale } from "@/modules/sales";
import {
  applyRepairTypeTemplate,
  createOwnUnitServiceOrder,
  listRepairTypes,
  markOwnUnitRepaired,
} from "@/modules/service";
import {
  applyChecklistTemplate,
  createChecklistItem,
  createTradeIn,
  getTradeIn,
  getUnitTradeIns,
  listChecklistItems,
  listClientTradeIns,
  listTradeIns,
  moveChecklistItem,
  setChecklistItemActive,
  updateChecklistItem,
  type TradeInInput,
} from "@/modules/tradeins";
import { getDb } from "@/shared/db";
import {
  describeRetained,
  eraseClientData,
  reportClientData,
} from "../../scripts/client-data-delete";
import { exportClientData } from "../../scripts/client-data-export";
import { resetDatabase } from "./reset-database";
import { expectStockInvariant } from "./stock-invariant";

// La recepción de usados contra PostgreSQL real (brief-29.7, D-10): la recepción con su unidad en
// revisión, su checklist y su auditoría, sin cambiar el saldo; cada rechazo por su nombre; el IMEI de
// una unidad vendida que vuelve (U-2); la unidad del usado por los caminos de la 29.6.2; la anulación
// desde revisión y desde disponible, y sus rechazos; dos recepciones del mismo IMEI y una anulación
// contra mandar a reparar, cada una con una tercera conexión; los triggers; el checklist y la copia del
// perfil; el DNI y el Instagram; el viewer, y una organización sin trade_ins. El invariante del saldo
// corre después de cada test.

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

// Lo que hace org:capability --profile iphone: las capacidades en su orden, los grados, los tipos de
// reparación, el producto de servicio y el checklist. Con only, solo esas capacidades y nada más.
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
    await applyGradeTemplate(tx, {
      organizationId,
      actorUserId,
      grades: profile.grades,
    });
    await applyRepairTypeTemplate(tx, {
      organizationId,
      actorUserId,
      repairTypes: profile.repairTypes,
    });
    await createServiceProduct(tx, { organizationId, actorUserId });
    await applyChecklistTemplate(tx, {
      organizationId,
      actorUserId,
      items: profile.tradeInChecklist,
    });
  });
}

function productInput(
  sku: string,
  condition: ProductInput["condition"] = "used",
): ProductInput {
  return {
    sku,
    name: `iPhone ${sku}`,
    description: null,
    unit: "unidad",
    reorderPoint: "0",
    brand: null,
    category: null,
    condition,
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
    sql`insert into organizations (name, main_currency) values ('Sin usados', 'USD') returning id`,
  );
  const admin = await member(orgA, "admin-a@example.com", "admin");
  const viewer = await member(orgA, "viewer-a@example.com", "viewer");
  const adminB = await member(orgB, "admin-b@example.com", "admin");
  await activate(orgA, "admin-a@example.com");
  await activate(orgB, "admin-b@example.com", ["serialized_units"]);

  const model = ok(
    await createModel(admin.context, { name: "iPhone 13", brand: "Apple" }),
  );
  // El producto usado llevado por unidad, con su modelo y su precio, al que entran los usados.
  const used = ok(await createProduct(admin.context, productInput("13U")));
  ok(await changeProductTracking(admin.context, used.productId, "unit"));
  await getDb().execute(
    sql`update products set model_id = ${model.modelId} where id = ${used.productId}`,
  );
  const priceId = await returningId(
    sql`insert into product_prices (organization_id, product_id, amount, currency, created_by)
        values (${orgA}, ${used.productId}, '500.00', 'USD', ${admin.userId}) returning id`,
  );
  // Uno nuevo por unidad y uno usado por cantidad: ninguno recibe usados.
  const fresh = ok(
    await createProduct(admin.context, productInput("13N", "new")),
  );
  ok(await changeProductTracking(admin.context, fresh.productId, "unit"));
  const quantity = ok(await createProduct(admin.context, productInput("13Q")));

  const grades = ok(await listUnitGrades(admin.context));
  const gradeA = grades.grades.find((grade) => grade.name === "A")!.id;
  const gradeC = grades.grades.find((grade) => grade.name === "C")!.id;
  const items = ok(await listChecklistItems(admin.context)).items;
  const item = (name: string) => items.find((one) => one.name === name)!.id;

  const types = ok(await listRepairTypes(admin.context));
  const battery = types.types.find(
    (type) => type.name === "Cambio de batería",
  )!.id;
  const technician = ok(
    await createSupplier(admin.context, { name: "Técnico Uno" }),
  );
  ok(await setSupplierTechnician(admin.context, technician.supplierId, true));

  const clientId = await returningId(
    sql`insert into clients (organization_id, display_name, phone_e164, document_number, instagram)
        values (${orgA}, 'Ana Cliente', '+5491155551234', '30123456', 'ana.cliente') returning id`,
  );

  return {
    orgA,
    orgB,
    admin: admin.context,
    adminId: admin.userId,
    viewer: viewer.context,
    adminB: adminB.context,
    modelId: model.modelId,
    productId: used.productId,
    priceId,
    freshProductId: fresh.productId,
    quantityProductId: quantity.productId,
    gradeA,
    gradeC,
    items,
    signal: item("Toma señal"),
    icloud: item("iCloud desvinculado"),
    camera: item("Cámara trasera"),
    battery,
    technicianId: technician.supplierId,
    clientId,
  };
}

type Seed = Awaited<ReturnType<typeof seed>>;

function input(s: Seed, overrides: Partial<TradeInInput> = {}): TradeInInput {
  return {
    clientId: s.clientId,
    productId: s.productId,
    serial: "356000000000001",
    batteryHealth: "88",
    gradeId: s.gradeA,
    value: "300",
    currency: "USD",
    destination: "purchase",
    passed: s.items.map((item) => item.id),
    ...overrides,
  };
}

async function receive(s: Seed, overrides: Partial<TradeInInput> = {}) {
  return ok(await createTradeIn(s.admin, input(s, overrides)));
}

async function unitRow(unitId: string) {
  const result = await getDb().execute<{
    status: string;
    cost: string;
    cost_currency: string;
    grade_id: string | null;
    battery_health: number | null;
    origin_type: string;
    origin_id: string | null;
    product_id: string;
  }>(
    sql`select status::text as status, cost, cost_currency, grade_id, battery_health,
               origin_type::text as origin_type, origin_id, product_id
        from stock_units where id = ${unitId}`,
  );
  return result.rows[0]!;
}

async function onHand(productId: string): Promise<string | null> {
  const result = await getDb().execute<{ on_hand: string }>(
    sql`select quantity_on_hand as on_hand from inventories where product_id = ${productId}`,
  );
  return result.rows[0]?.on_hand ?? null;
}

async function movements(
  productId: string,
): Promise<{ type: string; reason: string }[]> {
  const result = await getDb().execute<{ type: string; reason: string }>(
    sql`select type::text as type, reason from inventory_movements
        where product_id = ${productId} order by created_at`,
  );
  return result.rows;
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

describe("la recepción (AC-1 y AC-3)", () => {
  it(
    "deja el PU, la unidad en revisión con su costo y su checklist, y no cambia el saldo",
    async () => {
      const s = await seed();
      const created = await receive(s, {
        passed: s.items
          .filter((item) => item.id !== s.camera)
          .map((item) => item.id),
      });
      expect(created.tradeIn.displayNumber).toBe("PU-000001");
      expect(await unitRow(created.unitId)).toEqual({
        status: "in_review",
        cost: "300.00",
        cost_currency: "USD",
        grade_id: s.gradeA,
        battery_health: 88,
        origin_type: "trade_in",
        origin_id: created.tradeIn.id,
        product_id: s.productId,
      });
      // Fuera del saldo: ni fila ni movimiento hasta liberarla.
      expect(await onHand(s.productId)).toBeNull();
      expect(await movements(s.productId)).toEqual([]);

      const detail = ok(await getTradeIn(s.admin, created.tradeIn.id)).tradeIn;
      expect(detail).toMatchObject({
        displayNumber: "PU-000001",
        clientName: "Ana Cliente",
        serial: "356000000000001",
        batteryHealth: 88,
        grade: { id: s.gradeA, name: "A" },
        value: { amount: "300.00", currency: "USD" },
        destination: "purchase",
        unitStatus: "in_review",
        void: null,
      });
      // El DNI se lee de la ficha, para un admin (U-5).
      expect(detail.client?.contact?.documentNumber).toBe("30123456");
      expect(detail.checks).toHaveLength(10);
      expect(
        detail.checks.find((check) => check.name === "Cámara trasera"),
      ).toEqual({
        position: 1,
        name: "Cámara trasera",
        wasMandatory: false,
        passed: false,
      });

      // AC-3: renombrar y volver obligatorio un punto no cambia la copia del resultado.
      ok(
        await updateChecklistItem(s.admin, s.camera, {
          name: "Cámara de atrás",
          isMandatory: true,
        }),
      );
      const again = ok(await getTradeIn(s.admin, created.tradeIn.id)).tradeIn;
      expect(again.checks[0]).toEqual({
        position: 1,
        name: "Cámara trasera",
        wasMandatory: false,
        passed: false,
      });

      // La auditoría: el comprobante sin datos del cliente, y la unidad.
      const audit = await getDb().execute<{
        entity_type: string;
        action: string;
        after: Record<string, unknown>;
      }>(
        sql`select entity_type::text as entity_type, action::text as action, diff->'after' as after
            from audit_logs where organization_id = ${s.orgA}
              and entity_type::text in ('trade_in', 'stock_unit')
            order by entity_type::text`,
      );
      expect(audit.rows).toEqual([
        expect.objectContaining({
          entity_type: "stock_unit",
          action: "create",
          after: expect.objectContaining({
            status: "in_review",
            origin: "trade_in",
            cost: "300.00",
          }),
        }),
        {
          entity_type: "trade_in",
          action: "create",
          after: {
            number: 1,
            product_id: s.productId,
            unit_id: created.unitId,
            serial: "356000000000001",
            value: "300.00",
            currency: "USD",
            destination: "purchase",
          },
        },
      ]);
      expect(JSON.stringify(audit.rows)).not.toMatch(
        /Ana|30123456|ana\.cliente/,
      );
    },
    TEST_TIMEOUT,
  );
});

describe("los rechazos de la recepción (AC-2)", () => {
  it(
    "cada rechazo tiene su nombre y no escribe nada",
    async () => {
      const s = await seed();
      const attempt = (overrides: Partial<TradeInInput>) =>
        createTradeIn(s.admin, input(s, overrides));

      expect(
        await attempt({
          passed: s.items
            .filter((item) => item.id !== s.icloud)
            .map((item) => item.id),
        }),
      ).toEqual({
        ok: false,
        code: "BUSINESS_RULE_VIOLATION",
        rule: "mandatory_check_failed",
        items: ["iCloud desvinculado"],
      });
      expect(await attempt({ passed: [] })).toMatchObject({
        rule: "mandatory_check_failed",
        items: ["Toma señal", "iCloud desvinculado"],
      });
      expect(
        await attempt({ clientId: "00000000-0000-4000-8000-000000000000" }),
      ).toEqual({ ok: false, code: "NOT_FOUND", target: "client" });
      await getDb().execute(
        sql`update clients set is_active = false where id = ${s.clientId}`,
      );
      expect(await attempt({})).toMatchObject({ rule: "inactive_client" });
      await getDb().execute(
        sql`update clients set is_active = true where id = ${s.clientId}`,
      );
      expect(
        await attempt({ productId: "00000000-0000-4000-8000-000000000000" }),
      ).toEqual({ ok: false, code: "NOT_FOUND", target: "product" });
      expect(await attempt({ productId: s.freshProductId })).toMatchObject({
        rule: "not_used_unit_product",
      });
      expect(await attempt({ productId: s.quantityProductId })).toMatchObject({
        rule: "not_used_unit_product",
      });
      await getDb().execute(
        sql`update unit_grades set is_active = false where id = ${s.gradeC}`,
      );
      expect(await attempt({ gradeId: s.gradeC })).toMatchObject({
        rule: "inactive_grade",
      });
      expect(await attempt({ batteryHealth: "101" })).toMatchObject({
        code: "VALIDATION_ERROR",
        fields: ["batteryHealth"],
      });
      expect(await attempt({ value: "0" })).toMatchObject({
        code: "VALIDATION_ERROR",
        fields: ["value"],
        amount: "zero",
      });
      expect(await attempt({ value: "10,123" })).toMatchObject({
        fields: ["value"],
      });
      expect(await attempt({ serial: "356 000" })).toMatchObject({
        fields: ["serial"],
      });
      expect(await attempt({ destination: "gift" })).toMatchObject({
        fields: ["destination"],
      });
      expect(await attempt({ currency: "XYZ" })).toMatchObject({
        fields: ["currency"],
      });

      // Un IMEI que ya está en el local, sin distinguir mayúsculas.
      const product = s.productId;
      ok(
        await registerUnit(s.admin, product, {
          serial: "ABC123",
          cost: "100",
          currency: "USD",
          gradeId: "",
          batteryHealth: "",
        }),
      );
      expect(await attempt({ serial: "abc123" })).toEqual({
        ok: false,
        code: "CONFLICT",
        field: "serial",
      });

      expect(
        await count(sql`select count(*)::int as count from trade_ins`),
      ).toBe(0);
      expect(
        await count(
          sql`select count(*)::int as count from document_counters where kind::text = 'trade_in'`,
        ),
      ).toBe(0);
    },
    TEST_TIMEOUT,
  );
});

describe("el IMEI de un equipo vendido que vuelve (AC-4, U-2)", () => {
  it(
    "se recibe; la venta original no se anula; un pedido elige la unidad del local",
    async () => {
      const s = await seed();
      ok(
        await registerUnit(s.admin, s.productId, {
          serial: "IMEI-VUELVE",
          cost: "400",
          currency: "USD",
          gradeId: "",
          batteryHealth: "",
        }),
      );
      const sale = ok(
        await issueSale(s.admin, {
          clientId: "",
          lines: [
            {
              productId: s.productId,
              quantity: "",
              expectedPriceId: s.priceId,
              serials: "IMEI-VUELVE",
            },
          ],
        }),
      );
      // El mismo equipo vuelve como usado: una unidad nueva con el mismo IMEI.
      const back = await receive(s, { serial: "imei-vuelve" });
      expect(
        await count(
          sql`select count(*)::int as count from stock_units where lower(serial) = 'imei-vuelve'`,
        ),
      ).toBe(2);

      expect(await voidSale(s.admin, sale.sale.id, "data_entry_error")).toEqual(
        {
          ok: false,
          code: "BUSINESS_RULE_VIOLATION",
          rule: "unit_serial_back",
          serials: ["imei-vuelve"],
        },
      );

      // Liberada, un pedido que pide ese IMEI elige la del local, no la vendida.
      ok(await releaseUnit(s.admin, back.unitId));
      const order = ok(
        await createOrder(s.admin, {
          clientId: s.clientId,
          lines: [
            {
              productId: s.productId,
              quantity: "",
              expectedPriceId: s.priceId,
              serials: "IMEI-VUELVE",
              expectedLineTotal: "",
            },
          ],
        }),
      );
      ok(await confirmOrder(s.admin, order.order.id));
      expect((await unitRow(back.unitId)).status).toBe("reserved");
    },
    TEST_TIMEOUT,
  );
});

describe("la unidad de un usado sigue los caminos de siempre (AC-5)", () => {
  it(
    "se manda a reparar, se corrige, se libera y se vende",
    async () => {
      const s = await seed();
      const created = await receive(s, { serial: "IMEI-CAMINO" });
      const order = ok(
        await createOwnUnitServiceOrder(s.admin, created.unitId, {
          technicianId: s.technicianId,
          reportedIssue: "Cambiar la batería.",
        }),
      );
      expect((await unitRow(created.unitId)).status).toBe("in_repair");
      ok(
        await markOwnUnitRepaired(s.admin, order.order.id, [
          { repairTypeId: s.battery, cost: "40" },
        ]),
      );
      expect(await unitRow(created.unitId)).toMatchObject({
        status: "in_review",
        cost: "340.00",
      });
      ok(
        await correctUnit(s.admin, created.unitId, {
          gradeId: s.gradeC,
          batteryHealth: "100",
        }),
      );
      ok(await releaseUnit(s.admin, created.unitId));
      expect(await onHand(s.productId)).toBe("1.000");
      ok(
        await issueSale(s.admin, {
          clientId: "",
          lines: [
            {
              productId: s.productId,
              quantity: "",
              expectedPriceId: s.priceId,
              serials: "IMEI-CAMINO",
            },
          ],
        }),
      );
      expect((await unitRow(created.unitId)).status).toBe("sold");
      expect((await movements(s.productId)).map((m) => m.type)).toEqual([
        "unit_released",
        "sale",
      ]);
    },
    TEST_TIMEOUT,
  );
});

describe("la anulación (AC-6)", () => {
  it(
    "en revisión, sin movimiento; disponible, con unit_written_off; una segunda, rechazada",
    async () => {
      const s = await seed();
      const inReview = await receive(s, { serial: "IMEI-REV" });
      const voided = ok(
        await voidTradeIn(s.admin, {
          tradeInId: inReview.tradeIn.id,
          reason: "entered_by_mistake",
        }),
      );
      expect(voided.tradeIn).toEqual({
        id: inReview.tradeIn.id,
        number: 1,
        displayNumber: "PU-000001",
        voidDisplayNumber: "APU-000001",
      });
      expect((await unitRow(inReview.unitId)).status).toBe("written_off");
      expect(await movements(s.productId)).toEqual([]);
      expect(
        await voidTradeIn(s.admin, {
          tradeInId: inReview.tradeIn.id,
          reason: "other",
        }),
      ).toEqual({
        ok: false,
        code: "BUSINESS_RULE_VIOLATION",
        rule: "already_voided",
        voidDisplayNumber: "APU-000001",
      });
      // Su IMEI quedó libre: se puede volver a recibir.
      await receive(s, { serial: "IMEI-REV" });

      const available = await receive(s, { serial: "IMEI-DISP" });
      ok(await releaseUnit(s.admin, available.unitId));
      expect(await onHand(s.productId)).toBe("1.000");
      ok(
        await voidTradeIn(s.admin, {
          tradeInId: available.tradeIn.id,
          reason: "customer_withdrew",
        }),
      );
      expect((await unitRow(available.unitId)).status).toBe("written_off");
      expect(await onHand(s.productId)).toBe("0.000");
      expect(await movements(s.productId)).toEqual([
        { type: "unit_released", reason: "Liberada a la venta" },
        {
          type: "unit_written_off",
          reason: "Anulación APU-000002 del usado PU-000003",
        },
      ]);
      const detail = ok(
        await getTradeIn(s.admin, available.tradeIn.id),
      ).tradeIn;
      expect(detail.void).toMatchObject({
        displayNumber: "APU-000002",
        reason: "customer_withdrew",
      });
      expect(detail.voidDisplayNumber).toBe("APU-000002");
    },
    TEST_TIMEOUT,
  );

  it(
    "se rechaza con la unidad en reparación, reservada, vendida o dada de baja, nombrando el estado",
    async () => {
      const s = await seed();
      const notInShop = (status: string) => ({
        ok: false,
        code: "BUSINESS_RULE_VIOLATION",
        rule: "unit_not_in_shop",
        status,
      });
      const tryVoid = (tradeInId: string) =>
        voidTradeIn(s.admin, { tradeInId, reason: "other" });

      const repair = await receive(s, { serial: "IMEI-R1" });
      ok(
        await createOwnUnitServiceOrder(s.admin, repair.unitId, {
          technicianId: s.technicianId,
          reportedIssue: "Pantalla.",
        }),
      );
      expect(await tryVoid(repair.tradeIn.id)).toEqual(notInShop("in_repair"));

      const reserved = await receive(s, { serial: "IMEI-R2" });
      ok(await releaseUnit(s.admin, reserved.unitId));
      const order = ok(
        await createOrder(s.admin, {
          clientId: s.clientId,
          lines: [
            {
              productId: s.productId,
              quantity: "",
              expectedPriceId: s.priceId,
              serials: "IMEI-R2",
              expectedLineTotal: "",
            },
          ],
        }),
      );
      ok(await confirmOrder(s.admin, order.order.id));
      expect(await tryVoid(reserved.tradeIn.id)).toEqual(notInShop("reserved"));

      const sold = await receive(s, { serial: "IMEI-R3" });
      ok(await releaseUnit(s.admin, sold.unitId));
      ok(
        await issueSale(s.admin, {
          clientId: "",
          lines: [
            {
              productId: s.productId,
              quantity: "",
              expectedPriceId: s.priceId,
              serials: "IMEI-R3",
            },
          ],
        }),
      );
      expect(await tryVoid(sold.tradeIn.id)).toEqual(notInShop("sold"));

      const gone = await receive(s, { serial: "IMEI-R4" });
      ok(await writeOffUnit(s.admin, gone.unitId, "Pantalla rota."));
      expect(await tryVoid(gone.tradeIn.id)).toEqual(notInShop("written_off"));

      expect(
        await count(sql`select count(*)::int as count from trade_in_voids`),
      ).toBe(0);
      expect(
        await count(
          sql`select count(*)::int as count from document_counters where kind::text = 'trade_in_void'`,
        ),
      ).toBe(0);
    },
    TEST_TIMEOUT,
  );
});

describe("las carreras (AC-7)", () => {
  it(
    "dos recepciones del mismo IMEI, con el producto retenido por una tercera conexión, dejan una",
    async () => {
      const s = await seed();
      const release = await hold(
        sql`select id from products where id = ${s.productId} for update`,
      );
      const first = createTradeIn(s.admin, input(s, { serial: "IMEI-DOBLE" }));
      const second = createTradeIn(s.admin, input(s, { serial: "imei-doble" }));
      await waitForLockWaiters(2);
      await release();
      const results = await Promise.all([first, second]);
      expect(results.filter((result) => result.ok)).toHaveLength(1);
      expect(results.find((result) => !result.ok)).toEqual({
        ok: false,
        code: "CONFLICT",
        field: "serial",
      });
      expect(
        await count(sql`select count(*)::int as count from trade_ins`),
      ).toBe(1);
      expect(
        await count(
          sql`select count(*)::int as count from stock_units where lower(serial) = 'imei-doble'`,
        ),
      ).toBe(1);
    },
    TEST_TIMEOUT,
  );

  it(
    "la anulación contra mandar a reparar, con la unidad retenida por una tercera conexión, deja un solo ganador",
    async () => {
      const s = await seed();
      const created = await receive(s, { serial: "IMEI-CARRERA" });
      const release = await hold(
        sql`select id from stock_units where id = ${created.unitId} for update`,
      );
      const voiding = voidTradeIn(s.admin, {
        tradeInId: created.tradeIn.id,
        reason: "other",
      });
      const repairing = createOwnUnitServiceOrder(s.admin, created.unitId, {
        technicianId: s.technicianId,
        reportedIssue: "Batería.",
      });
      await waitForLockWaiters(2);
      await release();
      const [voided, repaired] = await Promise.all([voiding, repairing]);
      expect([voided.ok, repaired.ok].filter(Boolean)).toHaveLength(1);
      const status = (await unitRow(created.unitId)).status;
      if (voided.ok) {
        expect(status).toBe("written_off");
        expect(repaired).toEqual({
          ok: false,
          code: "BUSINESS_RULE_VIOLATION",
          rule: "unit_not_available",
        });
      } else {
        expect(status).toBe("in_repair");
        expect(voided).toEqual({
          ok: false,
          code: "BUSINESS_RULE_VIOLATION",
          rule: "unit_not_in_shop",
          status: "in_repair",
        });
      }
    },
    TEST_TIMEOUT,
  );
});

describe("los triggers (AC-8)", () => {
  it(
    "rechazan cambiar o borrar una recepción, su resultado y su anulación, y los nacimientos fuera de regla",
    async () => {
      const s = await seed();
      const created = await receive(s, { serial: "IMEI-T1" });
      const other = await receive(s, { serial: "IMEI-T2" });
      ok(
        await voidTradeIn(s.admin, {
          tradeInId: other.tradeIn.id,
          reason: "other",
        }),
      );
      expect(
        await rejection(
          getDb().execute(
            sql`update trade_ins set value = 1 where id = ${created.tradeIn.id}`,
          ),
        ),
      ).toBe("trade_ins es de solo inserción: UPDATE rechazado");
      expect(
        await rejection(
          getDb().execute(
            sql`delete from trade_ins where id = ${created.tradeIn.id}`,
          ),
        ),
      ).toBe("trade_ins es de solo inserción: DELETE rechazado");
      expect(
        await rejection(
          getDb().execute(
            sql`update trade_in_checklist_results set passed = false where trade_in_id = ${created.tradeIn.id}`,
          ),
        ),
      ).toBe(
        "trade_in_checklist_results es de solo inserción: UPDATE rechazado",
      );
      expect(
        await rejection(
          getDb().execute(
            sql`delete from trade_in_checklist_results where trade_in_id = ${created.tradeIn.id}`,
          ),
        ),
      ).toBe(
        "trade_in_checklist_results es de solo inserción: DELETE rechazado",
      );
      expect(
        await rejection(
          getDb().execute(sql`update trade_in_voids set reason = 'other'`),
        ),
      ).toBe("trade_in_voids es de solo inserción: UPDATE rechazado");
      expect(
        await rejection(getDb().execute(sql`delete from trade_in_voids`)),
      ).toBe("trade_in_voids es de solo inserción: DELETE rechazado");

      // Un punto obligatorio que no pasó no entra, aunque se escriba a mano.
      expect(
        await rejection(
          getDb().execute(
            sql`insert into trade_in_checklist_results
                  (organization_id, trade_in_id, checklist_item_id, position, item_name, was_mandatory, passed)
                values (${s.orgA}, ${created.tradeIn.id}, ${s.signal}, 40, 'Toma señal', true, false)`,
          ),
        ),
      ).toMatch(/trade_in_checklist_results_mandatory_passed/);

      // La unidad: una manual no nace en revisión, y la de un usado no nace disponible.
      const unitInsert = (
        status: string,
        origin: string,
        originId: string | null,
      ) =>
        getDb().execute(
          sql`insert into stock_units (organization_id, product_id, serial, cost, cost_currency,
                origin_type, origin_id, status, grade_id, battery_health, created_by)
              values (${s.orgA}, ${s.productId}, ${`IMEI-${status.length}-${origin.length}-${originId ? 1 : 0}`}, 100, 'USD',
                ${origin}::stock_unit_origin, ${originId}, ${status}::stock_unit_status,
                ${s.gradeA}, 90, ${s.adminId})`,
        );
      expect(await rejection(unitInsert("in_review", "manual", null))).toBe(
        "stock_units: una unidad nace disponible",
      );
      expect(
        await rejection(
          unitInsert("available", "trade_in", created.tradeIn.id),
        ),
      ).toBe(
        "stock_units: la unidad de un usado nace en revisión, con su comprobante, su grado y su batería, y sin precio",
      );
      expect(
        await rejection(unitInsert("in_review", "trade_in", null)),
      ).toMatch(/la unidad de un usado nace en revisión/);

      // El comprobante tiene que ser el de su unidad.
      expect(
        await rejection(
          getDb().execute(
            sql`insert into trade_ins (organization_id, number, client_id, product_id, unit_id, serial,
                  battery_health, grade_id, value, currency, destination, created_by)
                values (${s.orgA}, 99, ${s.clientId}, ${s.productId}, ${created.unitId}, 'IMEI-T1',
                  88, ${s.gradeA}, 300, 'USD', 'purchase', ${s.adminId})`,
          ),
        ),
      ).toBe("trade_ins: la unidad no es la del comprobante 99");

      // La anulación, después de dar de baja la unidad.
      expect(
        await rejection(
          getDb().execute(
            sql`insert into trade_in_voids (organization_id, number, trade_in_id, reason, created_by)
                values (${s.orgA}, 99, ${created.tradeIn.id}, 'other', ${s.adminId})`,
          ),
        ),
      ).toBe(
        "trade_in_voids: la unidad del usado se da de baja antes de anularlo",
      );
    },
    TEST_TIMEOUT,
  );
});

describe("el checklist y la copia del perfil (AC-10)", () => {
  it(
    "la activación copia los puntos con la marca de ejemplo, y un admin los ajusta con su auditoría",
    async () => {
      const s = await seed();
      const items = ok(await listChecklistItems(s.admin)).items;
      expect(
        items.map((item) => [item.name, item.isMandatory, item.isExample]),
      ).toEqual([
        ["Cámara trasera", false, true],
        ["Cámara frontal", false, true],
        ["Micrófono", false, true],
        ["True Tone", false, true],
        ["Táctil", false, true],
        ["Parlantes", false, true],
        ["Face ID", false, true],
        ["Sin piezas desconocidas", false, true],
        ["Toma señal", true, true],
        ["iCloud desvinculado", true, true],
      ]);

      const created = ok(
        await createChecklistItem(s.admin, {
          name: "Botones",
          isMandatory: false,
        }),
      );
      expect(
        await createChecklistItem(s.admin, {
          name: "botones",
          isMandatory: true,
        }),
      ).toEqual({ ok: false, code: "CONFLICT", field: "name" });
      ok(await moveChecklistItem(s.admin, created.itemId, "up"));
      ok(await setChecklistItemActive(s.admin, s.camera, false));
      const after = ok(await listChecklistItems(s.admin)).items;
      expect(after.at(-2)?.name).toBe("Botones");
      expect(after.find((item) => item.id === s.camera)?.isActive).toBe(false);

      // Un punto inactivo no se pide ni entra en el resultado.
      const received = await receive(s, {
        passed: [s.signal, s.icloud],
        serial: "IMEI-CHK",
      });
      const checks = ok(await getTradeIn(s.admin, received.tradeIn.id)).tradeIn
        .checks;
      expect(checks.map((check) => check.name)).not.toContain("Cámara trasera");
      expect(checks.map((check) => check.name)).toContain("Botones");

      const audited = await count(
        sql`select count(*)::int as count from audit_logs
            where entity_type::text = 'trade_in_checklist_item' and organization_id = ${s.orgA}
              and actor_user_id = ${s.adminId}`,
      );
      // La copia del perfil (10), el alta, el movimiento (2) y la desactivación.
      expect(audited).toBe(14);

      // trade_ins sin serialized_units se rechaza (D-1).
      const lonely = await returningId(
        sql`insert into organizations (name) values ('Sola') returning id`,
      );
      await member(lonely, "admin-sola@example.com", "admin");
      const result = await getDb().transaction((tx) =>
        activateCapability(tx, {
          organizationId: lonely,
          capability: "trade_ins",
          adminEmail: "admin-sola@example.com",
        }),
      );
      expect(result).toEqual({
        ok: false,
        code: "BUSINESS_RULE_VIOLATION",
        rule: "capability_required",
        requires: "serialized_units",
      });
    },
    TEST_TIMEOUT,
  );
});

describe("el DNI y el Instagram (AC-11)", () => {
  it(
    "se validan, se auditan, no llegan a un viewer, se exportan y los contratos del agente no los nombran",
    async () => {
      const s = await seed();
      // La forma la prueban las unitarias de crm; acá, que el alta la aplica.
      expect(
        await createClient(s.admin, {
          displayName: "Bea",
          documentNumber: "123",
        }),
      ).toEqual({
        ok: false,
        code: "VALIDATION_ERROR",
        fields: ["documentNumber"],
      });
      expect(
        await createClient(s.admin, {
          displayName: "Bea",
          instagram: "bea ok",
        }),
      ).toMatchObject({ ok: false, fields: ["instagram"] });

      const created = ok(
        await createClient(s.admin, {
          displayName: "Bea",
          documentNumber: "12345678",
          instagram: "bea",
        }),
      );
      ok(
        await updateClient(s.admin, created.clientId, {
          displayName: "Bea",
          documentNumber: "87654321",
          instagram: "bea",
        }),
      );
      const update = await getDb().execute<{ before: unknown; after: unknown }>(
        sql`select diff->'before' as before, diff->'after' as after from audit_logs
            where entity_id = ${created.clientId} and action::text = 'update'`,
      );
      expect(update.rows).toEqual([
        {
          before: { documentNumber: "12345678" },
          after: { documentNumber: "87654321" },
        },
      ]);

      const asAdmin = ok(await getClient(s.admin, created.clientId)).client;
      expect(asAdmin.contact).toMatchObject({
        documentNumber: "87654321",
        instagram: "bea",
      });
      const asViewer = ok(await getClient(s.viewer, created.clientId)).client;
      expect(asViewer.contact).toBeNull();
      expect(JSON.stringify(asViewer)).not.toMatch(/87654321|"bea"/);

      // La exportación los incluye, con sus usados.
      const received = await receive(s, { serial: "IMEI-EXP" });
      const exported = await exportClientData(getDb(), s.orgA, s.clientId);
      expect(exported.client).toMatchObject({
        document_number: "30123456",
        instagram: "ana.cliente",
      });
      expect(exported.trade_ins).toEqual([
        expect.objectContaining({
          id: received.tradeIn.id,
          display_number: "PU-000001",
          serial: "IMEI-EXP",
          destination: "purchase",
        }),
      ]);
      expect(exported.trade_in_checklist_results).toHaveLength(10);
      expect(exported.trade_in_voids).toEqual([]);

      // Los contratos del agente: ni la API de lectura ni la ingestión nombran estas columnas.
      const files = ["src/app/api", "src/modules/ingestion"].flatMap((root) =>
        readdirSync(root, { recursive: true, encoding: "utf8" })
          .filter((file) => /\.tsx?$/.test(file))
          .map((file) => join(root, file)),
      );
      expect(files.length).toBeGreaterThan(0);
      expect(
        files.filter((file) =>
          /documentNumber|document_number|instagram/i.test(
            readFileSync(file, "utf8"),
          ),
        ),
      ).toEqual([]);
    },
    TEST_TIMEOUT,
  );

  // El vaciado (D-6; revisión B-4): borra el DNI y el Instagram, no toca los usados, que no tienen
  // datos de la persona, y un cliente con usados no se borra (caso B del runbook).
  it(
    "un cliente con usados no se borra, y el vaciado borra el DNI y el Instagram y deja los usados",
    async () => {
      const s = await seed();
      const received = await receive(s, { serial: "IMEI-VAC" });
      ok(
        await voidTradeIn(s.admin, {
          tradeInId: received.tradeIn.id,
          reason: "customer_withdrew",
        }),
      );

      const report = await reportClientData(getDb(), s.orgA, s.clientId);
      expect(report).toMatchObject({
        tradeIns: 1,
        tradeInVoids: 1,
        deletable: false,
      });
      const retained = describeRetained(report).join(" ");
      expect(retained).toContain("1 recepciones de usados en 'trade_ins'");
      expect(retained).toContain("1 anulaciones de usados en 'trade_in_voids'");

      const read = () =>
        getDb().execute(
          sql`select
                (select json_agg(t order by t.id) from trade_ins t) as trade_ins,
                (select json_agg(r order by r.id) from trade_in_checklist_results r) as results,
                (select json_agg(v order by v.id) from trade_in_voids v) as voids`,
        );
      const before = await read();
      await eraseClientData(getDb(), s.orgA, s.clientId);
      expect((await read()).rows).toEqual(before.rows);
      const client = await getDb().execute<{
        document_number: string | null;
        instagram: string | null;
      }>(
        sql`select document_number, instagram from clients where id = ${s.clientId}`,
      );
      expect(client.rows).toEqual([{ document_number: null, instagram: null }]);
    },
    TEST_TIMEOUT,
  );
});

describe("el viewer y la capacidad (AC-12 y AC-13)", () => {
  it(
    "un viewer ve las recepciones sin el valor ni el DNI, y no opera",
    async () => {
      const s = await seed();
      const created = await receive(s, { serial: "IMEI-V" });
      const list = ok(
        await listTradeIns(s.viewer, {
          status: "all",
          destination: "all",
          search: "",
          page: 1,
        }),
      );
      expect(list.tradeIns).toEqual([
        expect.objectContaining({ id: created.tradeIn.id, value: null }),
      ]);
      const detail = ok(await getTradeIn(s.viewer, created.tradeIn.id)).tradeIn;
      expect(detail.value).toBeNull();
      expect(detail.client?.contact).toBeNull();
      expect(JSON.stringify(detail)).not.toMatch(/30123456|300\.00/);
      expect(await createTradeIn(s.viewer, input(s))).toMatchObject({
        ok: false,
        code: "FORBIDDEN",
      });
      expect(
        await voidTradeIn(s.viewer, {
          tradeInId: created.tradeIn.id,
          reason: "other",
        }),
      ).toMatchObject({ ok: false, code: "FORBIDDEN" });
      expect(await listChecklistItems(s.viewer)).toMatchObject({
        ok: false,
        code: "FORBIDDEN",
      });
      expect(
        await createChecklistItem(s.viewer, { name: "X", isMandatory: false }),
      ).toMatchObject({ ok: false, code: "FORBIDDEN" });

      // La búsqueda por número y por IMEI, y el filtro por destino.
      const search = (text: string) =>
        listTradeIns(s.admin, {
          status: "all",
          destination: "all",
          search: text,
          page: 1,
        });
      expect(ok(await search("pu-000001")).total).toBe(1);
      expect(ok(await search("imei-v")).total).toBe(1);
      expect(ok(await search("PU-000002")).total).toBe(0);
      expect(
        ok(
          await listTradeIns(s.admin, {
            status: "current",
            destination: "sale_credit",
            search: "",
            page: 1,
          }),
        ).total,
      ).toBe(0);
      expect(
        ok(await listClientTradeIns(s.viewer, s.clientId)).tradeIns,
      ).toHaveLength(1);
      expect(
        (await getUnitTradeIns(s.viewer, [created.unitId])).get(created.unitId),
      ).toMatchObject({ id: created.tradeIn.id, displayNumber: "PU-000001" });
    },
    TEST_TIMEOUT,
  );

  it(
    "sin trade_ins, nada de los usados existe para nadie",
    async () => {
      const s = await seed();
      const created = await receive(s, { serial: "IMEI-OTRA" });
      const notFound = { ok: false, code: "NOT_FOUND" };
      expect(
        await listTradeIns(s.adminB, {
          status: "all",
          destination: "all",
          search: "",
          page: 1,
        }),
      ).toEqual(notFound);
      expect(await createTradeIn(s.adminB, input(s))).toEqual(notFound);
      expect(await getTradeIn(s.adminB, created.tradeIn.id)).toEqual(notFound);
      expect(
        await voidTradeIn(s.adminB, {
          tradeInId: created.tradeIn.id,
          reason: "other",
        }),
      ).toEqual(notFound);
      expect(await listChecklistItems(s.adminB)).toEqual(notFound);
      expect(await getUnitTradeIns(s.adminB, [created.unitId])).toEqual(
        new Map(),
      );
    },
    TEST_TIMEOUT,
  );
});

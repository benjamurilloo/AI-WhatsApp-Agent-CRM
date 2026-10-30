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
import { getSupplierAccountSummary } from "@/modules/cash";
import {
  createModel,
  createProduct,
  createServiceProduct,
  type ProductInput,
} from "@/modules/catalog";
import {
  applyUnitSettingsTemplate,
  changeProductTracking,
  getUnitWarranties,
  registerUnit,
} from "@/modules/inventory";
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
  applyServiceSettingsTemplate,
  approveServiceOrder,
  cancelServiceOrder,
  countOpenServiceOrdersByClient,
  createServiceOrder,
  createWarrantyClaim,
  deliverServiceOrder,
  getServiceOrder,
  getWarrantyClaimForm,
  getWarrantyClaimRepairForm,
  listClientServiceOrders,
  listClientServiceOrdersForService,
  listOpenClientServiceOrders,
  listRepairTypes,
  listServiceOrders,
  listServiceOrdersBySerial,
  listUnitServiceOrders,
  markServiceOrderRepaired,
  markWarrantyClaimRepaired,
  quoteServiceOrder,
  sendServiceOrder,
  setRepairPrice,
} from "@/modules/service";
import { getDb } from "@/shared/db";
import { resetDatabase } from "./reset-database";
import { expectStockInvariant } from "./stock-invariant";

// El reclamo de garantía contra PostgreSQL real (brief-29.9.2, D-7): el de una unidad vendida y el de
// una reparación entregada de punta a punta y sin venta, los rechazos al abrirlo, la cuenta del técnico
// con y sin cargo, la cancelación con not_covered, las restricciones y el trigger de la 0064 con filas
// escritas directo en la base, la garantía del equipo que no cambia, el aislamiento por organización y
// la lectura del agente, que no lo ve.

const PASSWORD = "contraseña-correcta-larga";
const TEST_TIMEOUT = 30000;
const SERIAL = "356789012345678";
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

// Las capacidades del perfil, los tipos de reparación, el producto de servicio y los días de garantía,
// como hace org:capability.
async function activate(organizationId: string, adminEmail: string) {
  const profile = getProfile("iphone")!;
  await getDb().transaction(async (tx) => {
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
    const input = {
      organizationId,
      actorUserId,
      warrantyDays: profile.warrantyDays!,
    };
    await applyUnitSettingsTemplate(tx, input);
    await applyServiceSettingsTemplate(tx, input);
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

async function orgWith(name: string, email: string) {
  const orgId = await returningId(
    sql`insert into organizations (name, main_currency) values (${name}, 'USD') returning id`,
  );
  const admin = await member(orgId, email, "admin");
  await activate(orgId, email);
  const model = ok(
    await createModel(admin.context, { name: "iPhone 13", brand: "Apple" }),
  );
  const created = ok(await createProduct(admin.context, productInput("IP13")));
  await getDb().execute(
    sql`update products set model_id = ${model.modelId} where id = ${created.productId}`,
  );
  ok(await changeProductTracking(admin.context, created.productId, "unit"));
  const priceId = await returningId(
    sql`insert into product_prices (organization_id, product_id, amount, currency, created_by)
        values (${orgId}, ${created.productId}, '900.00', 'USD', ${admin.userId}) returning id`,
  );
  const types = ok(await listRepairTypes(admin.context));
  const battery = types.types.find(
    (type) => type.name === "Cambio de batería",
  )!.id;
  ok(
    await setRepairPrice(admin.context, {
      repairTypeId: battery,
      modelId: model.modelId,
      price: "80",
      priceCurrency: "USD",
      cost: "35",
      costCurrency: "USD",
    }),
  );
  const technicianId = ok(
    await createSupplier(admin.context, { name: "Técnico" }),
  ).supplierId;
  ok(await setSupplierTechnician(admin.context, technicianId, true));
  const clientId = await returningId(
    sql`insert into clients (organization_id, display_name) values (${orgId}, 'Lucía') returning id`,
  );
  return {
    orgId,
    admin: admin.context,
    userId: admin.userId,
    modelId: model.modelId,
    product: { id: created.productId, priceId },
    battery,
    technicianId,
    clientId,
  };
}

async function seed() {
  const a = await orgWith("iPhone A", "admin-a@example.com");
  const viewer = await member(a.orgId, "viewer-a@example.com", "viewer");
  const b = await orgWith("iPhone B", "admin-b@example.com");
  return { ...a, viewer: viewer.context, b };
}

type Seed = Awaited<ReturnType<typeof seed>>;

// Una unidad vendida al cliente, sin pedido.
async function soldUnit(s: Seed, serial = SERIAL): Promise<string> {
  const unitId = ok(
    await registerUnit(s.admin, s.product.id, {
      serial,
      cost: "450",
      currency: "USD",
      gradeId: "",
      batteryHealth: "",
    }),
  ).unitId;
  ok(
    await issueSale(s.admin, {
      clientId: s.clientId,
      lines: [
        {
          productId: s.product.id,
          quantity: "",
          expectedPriceId: s.product.priceId,
          serials: serial,
        },
      ],
    }),
  );
  return unitId;
}

// Una reparación del cliente, presupuestada en 80 y 35, reparada y entregada con su venta.
async function deliveredRepair(s: Seed): Promise<string> {
  const order = ok(
    await createServiceOrder(s.admin, {
      clientId: s.clientId,
      modelId: s.modelId,
      deviceSerial: SERIAL,
      reportedIssue: "La batería dura poco.",
    }),
  ).order;
  ok(await sendServiceOrder(s.admin, order.id, s.technicianId));
  ok(
    await quoteServiceOrder(s.admin, order.id, {
      customerCurrency: "USD",
      technicianCurrency: "USD",
      lines: [{ repairTypeId: s.battery, price: "80", cost: "35" }],
    }),
  );
  ok(await approveServiceOrder(s.admin, order.id));
  ok(await markServiceOrderRepaired(s.admin, order.id));
  ok(await deliverServiceOrder(s.admin, order.id));
  return order.id;
}

async function count(query: SQL): Promise<number> {
  const result = await getDb().execute<{ n: number }>(query);
  return Number(result.rows[0]!.n);
}

async function owed(s: Seed): Promise<{ currency: string; owed: string }[]> {
  return ok(await getSupplierAccountSummary(s.admin, s.technicianId))
    .currencies;
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

// brief-24.4.3, AC-7. Una unidad propia no tiene cliente (D-7), así que no puede entrar en la cuenta
// de uno: de los tres tipos, los dos que un cliente puede tener.
describe("las reparaciones abiertas de un cliente, con reclamos (brief-24.4.3, AC-7)", () => {
  it(
    "el Resumen y la lista cuentan lo mismo con un equipo del cliente y un reclamo",
    async () => {
      const s = await seed();
      const unitId = await soldUnit(s);
      ok(
        await createWarrantyClaim(s.admin, {
          unitId,
          clientId: s.clientId,
          reportedIssue: "No carga.",
        }),
      );
      ok(
        await createServiceOrder(s.admin, {
          clientId: s.clientId,
          modelId: s.modelId,
          deviceSerial: "",
          reportedIssue: "No enciende",
        }),
      );
      const summary = ok(
        await listOpenClientServiceOrders(s.admin, s.clientId),
      );
      const list = ok(
        await countOpenServiceOrdersByClient(s.admin, [s.clientId]),
      );
      expect(summary.total).toBe(2);
      expect(summary.orders.map((order) => order.kind).sort()).toEqual([
        "customer_device",
        "warranty_claim",
      ]);
      expect(list.counts.get(s.clientId)).toBe(summary.total);
    },
    TEST_TIMEOUT,
  );
});

describe("el reclamo de una unidad vendida (AC-2, AC-4, AC-5, AC-6, AC-7)", () => {
  it(
    "se recibe, se manda, se repara sin cargo y se entrega sin venta; la garantía no cambia",
    async () => {
      const s = await seed();
      const unitId = await soldUnit(s);
      const warrantyBefore = ok(await getUnitWarranties(s.admin, [unitId]))
        .units[0]!.warranty;
      expect(warrantyBefore).toMatchObject({ status: "in_warranty" });
      const sales = await count(sql`select count(*) as n from sales`);

      const form = ok(
        await getWarrantyClaimForm(s.admin, { unitId, clientId: s.clientId }),
      ).form;
      expect(form).toMatchObject({
        description: `Producto IP13 ${SERIAL}`,
        clientId: s.clientId,
        clientName: "Lucía",
        warranty: { status: "in_warranty" },
      });

      const claim = ok(
        await createWarrantyClaim(s.admin, {
          unitId,
          clientId: s.clientId,
          reportedIssue: "  No carga.  ",
        }),
      ).order;
      const row = await getDb().execute<Record<string, unknown>>(
        sql`select kind::text as kind, status::text as status, client_id, claim_unit_id,
              claim_service_order_id, model_id, device_serial, reported_issue
            from service_orders where id = ${claim.id}`,
      );
      expect(row.rows[0]).toEqual({
        kind: "warranty_claim",
        status: "received",
        client_id: s.clientId,
        claim_unit_id: unitId,
        claim_service_order_id: null,
        model_id: s.modelId,
        device_serial: SERIAL,
        reported_issue: "No carga.",
      });
      // La auditoría del alta, sin el IMEI ni lo que reporta (datos personales).
      const audit = await getDb().execute<{ diff: { after: object } }>(
        sql`select diff from audit_logs where entity_id = ${claim.id} and action = 'create'`,
      );
      expect(audit.rows[0]!.diff.after).toEqual({
        number: claim.number,
        kind: "warranty_claim",
        status: "received",
        client_id: s.clientId,
        claim_unit_id: unitId,
        claim_service_order_id: null,
        model_id: s.modelId,
      });

      ok(await sendServiceOrder(s.admin, claim.id, s.technicianId));
      const repairForm = ok(
        await getWarrantyClaimRepairForm(s.admin, claim.id),
      ).form;
      expect(repairForm.currency).toBe("USD");
      expect(
        repairForm.rows.find((item) => item.repairTypeId === s.battery),
      ).toMatchObject({ listCost: "35.00" });
      ok(await markWarrantyClaimRepaired(s.admin, claim.id, { charge: false }));
      // Sin cargo: ninguna deuda, y la cuenta se lee sin error.
      expect(await owed(s)).toEqual([]);
      const delivered = ok(await deliverServiceOrder(s.admin, claim.id));
      expect(delivered.sale).toBeNull();
      expect(await count(sql`select count(*) as n from sales`)).toBe(sales);

      const detail = ok(await getServiceOrder(s.admin, claim.id)).order;
      expect(detail).toMatchObject({
        kind: "warranty_claim",
        status: "delivered",
        sale: null,
        technicianTotal: null,
        lines: [],
        warranty: null,
        claimOf: { kind: "unit", id: unitId, serial: SERIAL },
      });
      // La garantía de la unidad sigue igual.
      expect(
        ok(await getUnitWarranties(s.admin, [unitId])).units[0]!.warranty,
      ).toEqual(warrantyBefore);
      // La unidad muestra su reclamo, y la ficha del cliente y la búsqueda por IMEI también.
      expect(
        (await listUnitServiceOrders(s.viewer, [unitId])).get(unitId),
      ).toMatchObject([{ id: claim.id, kind: "warranty_claim" }]);
      const client = ok(await listClientServiceOrders(s.viewer, s.clientId));
      expect(client.orders).toMatchObject([
        { id: claim.id, kind: "warranty_claim", warranty: null },
      ]);
      expect(
        ok(await listServiceOrdersBySerial(s.viewer, SERIAL)).orders.map(
          (order) => order.id,
        ),
      ).toEqual([claim.id]);
      // El filtro por tipo y las abiertas: entregado, ya no está en curso.
      expect(
        ok(
          await listServiceOrders(s.admin, {
            status: "all",
            kind: "warranty_claim",
            number: "",
            page: 1,
          }),
        ).orders.map((order) => order.id),
      ).toEqual([claim.id]);
      expect(
        ok(
          await listServiceOrders(s.admin, {
            status: "open",
            number: "",
            page: 1,
          }),
        ).orders,
      ).toEqual([]);
    },
    TEST_TIMEOUT,
  );
});

describe("el reclamo de una reparación entregada (AC-2, AC-5, AC-7)", () => {
  it(
    "con cargo, la deuda va a la cuenta del técnico; la orden original lo muestra y su garantía no cambia",
    async () => {
      const s = await seed();
      const originalId = await deliveredRepair(s);
      const original = ok(await getServiceOrder(s.admin, originalId)).order;
      expect(original.warranty).toMatchObject({ status: "in_warranty" });
      expect(await owed(s)).toMatchObject([{ currency: "USD", owed: "35.00" }]);

      const claim = ok(
        await createWarrantyClaim(s.admin, {
          serviceOrderId: originalId,
          reportedIssue: "Volvió a fallar la batería.",
        }),
      ).order;
      const row = await getDb().execute<Record<string, unknown>>(
        sql`select client_id, claim_unit_id, claim_service_order_id, model_id, device_serial
            from service_orders where id = ${claim.id}`,
      );
      expect(row.rows[0]).toEqual({
        client_id: s.clientId,
        claim_unit_id: null,
        claim_service_order_id: originalId,
        model_id: s.modelId,
        device_serial: SERIAL,
      });
      ok(await sendServiceOrder(s.admin, claim.id, s.technicianId));
      ok(
        await markWarrantyClaimRepaired(s.admin, claim.id, {
          charge: true,
          currency: "USD",
          lines: [{ repairTypeId: s.battery, cost: "20" }],
        }),
      );
      expect(await owed(s)).toMatchObject([{ currency: "USD", owed: "55.00" }]);
      const lines = await getDb().execute<{
        price: string | null;
        cost: string;
      }>(
        sql`select price, cost from service_order_lines where service_order_id = ${claim.id}`,
      );
      expect(lines.rows).toEqual([{ price: null, cost: "20.00" }]);
      expect(ok(await deliverServiceOrder(s.admin, claim.id)).sale).toBeNull();

      const after = ok(await getServiceOrder(s.admin, originalId)).order;
      expect(after.warranty).toEqual(original.warranty);
      expect(after.claims).toMatchObject([
        { id: claim.id, status: "delivered" },
      ]);
      expect(ok(await getServiceOrder(s.admin, claim.id)).order).toMatchObject({
        claimOf: {
          kind: "order",
          id: originalId,
          displayNumber: original.displayNumber,
        },
        technicianTotal: "20.00",
        warranty: null,
      });
      // Un viewer lo ve sin costos.
      expect(ok(await getServiceOrder(s.viewer, claim.id)).order).toMatchObject(
        {
          technicianTotal: null,
          technician: null,
          lines: [{ cost: null, price: null }],
        },
      );
    },
    TEST_TIMEOUT,
  );
});

describe("abrirlo se rechaza (AC-3, AC-8)", () => {
  it(
    "fuera de garantía, sin vender, sin reparar, con otro abierto, o sin ser admin",
    async () => {
      const s = await seed();
      const unitId = await soldUnit(s);
      const originalId = await deliveredRepair(s);
      const rule = (value: string) => ({
        ok: false,
        code: "BUSINESS_RULE_VIOLATION",
        rule: value,
      });
      const issue = "No carga.";

      // Una unidad sin vender.
      const available = ok(
        await registerUnit(s.admin, s.product.id, {
          serial: "111",
          cost: "450",
          currency: "USD",
          gradeId: "",
          batteryHealth: "",
        }),
      ).unitId;
      expect(
        await createWarrantyClaim(s.admin, {
          unitId: available,
          clientId: s.clientId,
          reportedIssue: issue,
        }),
      ).toEqual(rule("not_claimable"));
      // Una orden sin reparar ni entregar.
      const received = ok(
        await createServiceOrder(s.admin, {
          clientId: s.clientId,
          modelId: s.modelId,
          deviceSerial: "",
          reportedIssue: issue,
        }),
      ).order;
      expect(
        await createWarrantyClaim(s.admin, {
          serviceOrderId: received.id,
          reportedIssue: issue,
        }),
      ).toEqual(rule("not_claimable"));
      // Un viewer, y lo que reporta vacío.
      expect(
        await createWarrantyClaim(s.viewer, {
          serviceOrderId: originalId,
          reportedIssue: issue,
        }),
      ).toEqual({ ok: false, code: "FORBIDDEN" });
      expect(
        await createWarrantyClaim(s.admin, {
          serviceOrderId: originalId,
          reportedIssue: "   ",
        }),
      ).toEqual({
        ok: false,
        code: "VALIDATION_ERROR",
        fields: ["reportedIssue"],
      });

      // Con otro abierto del mismo equipo; cancelado, se puede abrir otro.
      const first = ok(
        await createWarrantyClaim(s.admin, {
          unitId,
          clientId: s.clientId,
          reportedIssue: issue,
        }),
      ).order;
      const numbers = await count(
        sql`select count(*) as n from service_orders`,
      );
      expect(
        await createWarrantyClaim(s.admin, {
          unitId,
          clientId: s.clientId,
          reportedIssue: issue,
        }),
      ).toEqual(rule("claim_open"));
      // El rechazo no deja la orden ni consume el número.
      expect(await count(sql`select count(*) as n from service_orders`)).toBe(
        numbers,
      );
      ok(await cancelServiceOrder(s.admin, first.id, "not_covered"));
      const second = ok(
        await createWarrantyClaim(s.admin, {
          unitId,
          clientId: s.clientId,
          reportedIssue: issue,
        }),
      ).order;
      expect(second.number).toBe(first.number + 1);
      // No se reclama un reclamo.
      ok(await sendServiceOrder(s.admin, second.id, s.technicianId));
      ok(
        await markWarrantyClaimRepaired(s.admin, second.id, { charge: false }),
      );
      ok(await deliverServiceOrder(s.admin, second.id));
      expect(
        await createWarrantyClaim(s.admin, {
          serviceOrderId: second.id,
          reportedIssue: issue,
        }),
      ).toEqual(rule("not_claimable"));

      // Fuera de garantía: sin los días de la organización, la garantía no está configurada.
      await getDb().execute(sql`delete from unit_settings`);
      await getDb().execute(sql`delete from service_settings`);
      expect(
        await createWarrantyClaim(s.admin, {
          serviceOrderId: originalId,
          reportedIssue: issue,
        }),
      ).toEqual(rule("not_in_warranty"));
      const another = await soldUnit(s, "222");
      expect(
        await createWarrantyClaim(s.admin, {
          unitId: another,
          clientId: s.clientId,
          reportedIssue: issue,
        }),
      ).toEqual(rule("not_in_warranty"));
    },
    TEST_TIMEOUT,
  );
});

describe("la cancelación (AC-4, AC-6)", () => {
  it(
    "not_covered cancela un reclamo y no otra orden; un reclamo reparado no se cancela",
    async () => {
      const s = await seed();
      const originalId = await deliveredRepair(s);
      const other = ok(
        await createServiceOrder(s.admin, {
          clientId: s.clientId,
          modelId: s.modelId,
          deviceSerial: "",
          reportedIssue: "Pantalla rota.",
        }),
      ).order;
      expect(
        await cancelServiceOrder(s.admin, other.id, "not_covered"),
      ).toEqual({ ok: false, code: "VALIDATION_ERROR" });
      const claim = ok(
        await createWarrantyClaim(s.admin, {
          serviceOrderId: originalId,
          reportedIssue: "No carga.",
        }),
      ).order;
      ok(await sendServiceOrder(s.admin, claim.id, s.technicianId));
      ok(await markWarrantyClaimRepaired(s.admin, claim.id, { charge: false }));
      expect(
        await cancelServiceOrder(s.admin, claim.id, "not_covered"),
      ).toEqual({
        ok: false,
        code: "BUSINESS_RULE_VIOLATION",
        rule: "invalid_transition",
        status: "repaired",
      });
      // Ni presupuestar, aprobar ni la marca de reparada de la orden de un cliente.
      expect(await approveServiceOrder(s.admin, claim.id)).toMatchObject({
        rule: "invalid_transition",
      });
      expect(
        await markWarrantyClaimRepaired(s.admin, other.id, { charge: false }),
      ).toMatchObject({ rule: "invalid_transition" });
    },
    TEST_TIMEOUT,
  );
});

describe("la base exige las reglas aunque se salte el servicio (AC-1, AC-4, AC-6, AC-9)", () => {
  it(
    "las restricciones y el trigger de la 0064 rechazan las filas fuera de regla",
    async () => {
      const s = await seed();
      const unitId = await soldUnit(s);
      const originalId = await deliveredRepair(s);
      const insertClaim = (columns: SQL) =>
        getDb().execute(
          sql`insert into service_orders (organization_id, number, kind, client_id, model_id,
                reported_issue, created_by, claim_unit_id, claim_service_order_id, status)
              values (${s.orgId}, 9000, 'warranty_claim', ${s.clientId}, ${s.modelId}, 'x',
                ${s.userId}, ${columns})`,
        );
      // Los dos destinos, ninguno, y un reclamo que nace en otro estado.
      expect(
        await pgMessage(insertClaim(sql`${unitId}, ${originalId}, 'received'`)),
      ).toMatch(/service_orders_kind_subject/);
      expect(await pgMessage(insertClaim(sql`null, null, 'received'`))).toMatch(
        /service_orders_kind_subject/,
      );
      expect(
        await pgMessage(insertClaim(sql`${unitId}, null, 'sent'`)),
      ).toMatch(/nace recibida/);
      // Un destino en otra organización: la FK compuesta lo rechaza.
      const unitB = ok(
        await registerUnit(s.b.admin, s.b.product.id, {
          serial: "B1",
          cost: "450",
          currency: "USD",
          gradeId: "",
          batteryHealth: "",
        }),
      ).unitId;
      expect(
        await pgMessage(insertClaim(sql`${unitB}, null, 'received'`)),
      ).toMatch(/service_orders_claim_unit_fk/);
      const orderB = ok(
        await createServiceOrder(s.b.admin, {
          clientId: s.b.clientId,
          modelId: s.b.modelId,
          deviceSerial: "",
          reportedIssue: "No carga.",
        }),
      ).order;
      expect(
        await pgMessage(insertClaim(sql`null, ${orderB.id}, 'received'`)),
      ).toMatch(/service_orders_claim_order_fk/);

      const claim = ok(
        await createWarrantyClaim(s.admin, {
          unitId,
          clientId: s.clientId,
          reportedIssue: "No carga.",
        }),
      ).order;
      const update = (set: SQL) =>
        getDb().execute(
          sql`update service_orders set ${set} where id = ${claim.id}`,
        );
      // Un reclamo con venta: el CHECK, que se evalúa al insertar (el trigger solo mira el estado).
      const saleId = (
        await getDb().execute<{ id: string }>(sql`select id from sales limit 1`)
      ).rows[0]!.id;
      expect(
        await pgMessage(
          getDb().execute(
            sql`insert into service_orders (organization_id, number, kind, client_id, model_id,
                  reported_issue, created_by, claim_unit_id, sale_id)
                values (${s.orgId}, 9001, 'warranty_claim', ${s.clientId}, ${s.modelId}, 'x',
                  ${s.userId}, ${unitId}, ${saleId})`,
          ),
        ),
      ).toMatch(/service_orders_sale_delivered/);
      // received → repaired salta el técnico; el equipo original no cambia.
      expect(
        await pgMessage(update(sql`status = 'repaired', repaired_at = now()`)),
      ).toMatch(/transición received -> repaired no permitida/);
      expect(
        await pgMessage(
          update(
            sql`claim_unit_id = null, claim_service_order_id = ${originalId}`,
          ),
        ),
      ).toMatch(/sin cambio de estado no cambia nada/);
      // not_covered en la orden de un cliente recibida: el trigger deja cancelarla, y el CHECK lo
      // rechaza.
      const received = ok(
        await createServiceOrder(s.admin, {
          clientId: s.clientId,
          modelId: s.modelId,
          deviceSerial: "",
          reportedIssue: "Pantalla rota.",
        }),
      ).order;
      expect(
        await pgMessage(
          getDb().execute(
            sql`update service_orders set status = 'cancelled', cancelled_at = now(),
                  cancel_reason = 'not_covered'
                where id = ${received.id}`,
          ),
        ),
      ).toMatch(/service_orders_not_covered_claim/);

      // El cliente y el equipo original tampoco cambian junto con una transición.
      const otherClient = await returningId(
        sql`insert into clients (organization_id, display_name) values (${s.orgId}, 'Otra') returning id`,
      );
      expect(
        await pgMessage(
          update(
            sql`status = 'sent', technician_id = ${s.technicianId}, sent_at = now(),
                client_id = ${otherClient}`,
          ),
        ),
      ).toMatch(/la transición received -> sent solo fija/);
      expect(
        await pgMessage(
          update(
            sql`status = 'sent', technician_id = ${s.technicianId}, sent_at = now(),
                claim_unit_id = null, claim_service_order_id = ${originalId}`,
          ),
        ),
      ).toMatch(/la transición received -> sent solo fija/);

      ok(await sendServiceOrder(s.admin, claim.id, s.technicianId));
      // sent → quoted es de la orden de un cliente.
      expect(
        await pgMessage(
          update(
            sql`status = 'quoted', quoted_at = now(), customer_currency = 'USD',
                customer_total = 10, technician_currency = 'USD', technician_total = 5`,
          ),
        ),
      ).toMatch(/transición sent -> quoted no permitida/);
      // Reparado sin cargo: ninguna línea entra.
      ok(await markWarrantyClaimRepaired(s.admin, claim.id, { charge: false }));
      expect(
        await pgMessage(
          getDb().execute(
            sql`insert into service_order_lines (organization_id, service_order_id, repair_type_id,
                  position, price, cost)
                values (${s.orgId}, ${claim.id}, ${s.battery}, 1, null, 10)`,
          ),
        ),
      ).toMatch(/sin costo del técnico no tiene líneas/);
      // Ni una línea con precio al cliente.
      expect(
        await pgMessage(
          getDb().execute(
            sql`insert into service_order_lines (organization_id, service_order_id, repair_type_id,
                  position, price, cost)
                values (${s.orgId}, ${claim.id}, ${s.battery}, 1, 10, 10)`,
          ),
        ),
      ).toMatch(/un reclamo no tiene precio al cliente/);
      // repaired → cancelled no; la entrega con venta tampoco.
      expect(
        await pgMessage(
          update(
            sql`status = 'cancelled', cancelled_at = now(), cancel_reason = 'not_covered'`,
          ),
        ),
      ).toMatch(/transición repaired -> cancelled no permitida/);
      // Un reclamo sin reparar no tiene costo del técnico: la rama del reclamo de quote_together.
      expect(
        await pgMessage(
          getDb().execute(
            sql`insert into service_orders (organization_id, number, kind, client_id, model_id,
                  reported_issue, created_by, claim_service_order_id, technician_currency,
                  technician_total)
                values (${s.orgId}, 9002, 'warranty_claim', ${s.clientId}, ${s.modelId}, 'x',
                  ${s.userId}, ${originalId}, 'USD', 10)`,
          ),
        ),
      ).toMatch(/service_orders_quote_together/);
      // La entrega de un reclamo no fija una venta.
      expect(
        await pgMessage(
          update(
            sql`status = 'delivered', delivered_at = now(), sale_id = ${saleId}`,
          ),
        ),
      ).toMatch(
        /la transición repaired -> delivered solo fija \{delivered_at\}/,
      );
      // Con cargo, el total del técnico no se fija si no está en la lista de la transición: sin
      // estado nuevo, nada cambia.
      expect(
        await pgMessage(
          update(sql`technician_currency = 'USD', technician_total = 10`),
        ),
      ).toMatch(/sin cambio de estado no cambia nada/);
    },
    TEST_TIMEOUT,
  );
});

describe("el aislamiento y el agente (AC-9, AC-10)", () => {
  it(
    "otra organización no abre un reclamo del equipo, y la lectura del agente no lo devuelve",
    async () => {
      const s = await seed();
      const unitId = await soldUnit(s);
      const originalId = await deliveredRepair(s);
      expect(
        await createWarrantyClaim(s.b.admin, {
          unitId,
          clientId: s.b.clientId,
          reportedIssue: "No carga.",
        }),
      ).toEqual({ ok: false, code: "NOT_FOUND", target: "unit" });
      expect(
        await createWarrantyClaim(s.b.admin, {
          serviceOrderId: originalId,
          reportedIssue: "No carga.",
        }),
      ).toEqual({ ok: false, code: "NOT_FOUND", target: "order" });
      // El cliente de otra organización, con la unidad propia.
      expect(
        await createWarrantyClaim(s.admin, {
          unitId,
          clientId: s.b.clientId,
          reportedIssue: "No carga.",
        }),
      ).toEqual({ ok: false, code: "NOT_FOUND", target: "client" });

      const original = ok(await getServiceOrder(s.admin, originalId)).order;
      const claim = ok(
        await createWarrantyClaim(s.admin, {
          serviceOrderId: originalId,
          reportedIssue: "No carga.",
        }),
      ).order;
      expect(
        ok(await listClientServiceOrders(s.b.admin, s.b.clientId)).orders,
      ).toEqual([]);
      expect(await getServiceOrder(s.b.admin, claim.id)).toEqual({
        ok: false,
        code: "NOT_FOUND",
      });
      const agent = await listClientServiceOrdersForService(
        s.orgId,
        s.clientId,
        new Date(),
      );
      // Solo la reparación original: el reclamo, abierto y del mismo cliente, no aparece (U-4).
      expect(agent.map((order) => order.number)).toEqual([original.number]);
      expect(claim.number).not.toBe(original.number);
    },
    TEST_TIMEOUT,
  );
});

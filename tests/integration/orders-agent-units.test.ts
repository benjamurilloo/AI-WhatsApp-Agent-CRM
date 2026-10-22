import { randomUUID } from "node:crypto";
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
  recordIngestionEventV2,
  type IngestionContext,
} from "@/modules/ingestion";
import {
  applyGradeTemplate,
  changeProductTracking,
  registerUnit,
  type UnitInput,
} from "@/modules/inventory";
import { cancelOrder, confirmOrder } from "@/modules/orders";
import {
  activateCapability,
  getAuthContext,
  getProfile,
  type AuthContext,
} from "@/modules/organizations";
import { getDb } from "@/shared/db";
import { resetDatabase } from "./reset-database";
import { expectStockInvariant } from "./stock-invariant";

// El pedido con unidades del agente contra PostgreSQL real (brief-29.8, D-7; AC-5, AC-6 y AC-8):
// order.placed_with_units por el contrato v2 deja un pendiente con sus unidades en order_line_units, sin
// reservarlas; su reenvío es duplicate con el mismo número; cada regla rechaza en su orden sin consumir
// un número; dos pendientes con la misma unidad se aceptan y la segunda confirmación falla; order.placed
// sigue rechazando el producto por unidad; y el aislamiento entre organizaciones. Los eventos se arman
// acá, con forma asumida.

const PASSWORD = "contraseña-correcta-larga";
const RECEIVED_AT = new Date("2026-10-22T15:00:00.000Z");
const PHONE = "+5491155550001";
const TEST_TIMEOUT = 30000;
let storedHash: string;
let eventCounter = 0;

async function createOrganization(name: string) {
  const result = await getDb().execute<{ id: string }>(
    sql`insert into organizations (name, main_currency) values (${name}, 'USD') returning id`,
  );
  return result.rows[0]!.id;
}

async function addAdmin(organizationId: string, email: string) {
  const user = await getDb().execute<{ id: string }>(
    sql`insert into users (email, password_hash, name, must_change_password)
        values (${email}, ${storedHash}, 'Persona', false) returning id`,
  );
  await getDb().execute(
    sql`insert into organization_members (organization_id, user_id, role)
        values (${organizationId}, ${user.rows[0]!.id}, 'admin')`,
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

async function ingestCredential(organizationId: string): Promise<string> {
  const result = await getDb().execute<{ id: string }>(
    sql`insert into ingestion_credentials (organization_id, source, scope, token_hash)
        values (${organizationId}, 'agente-whatsapp', 'ingest', ${randomUUID()}) returning id`,
  );
  return result.rows[0]!.id;
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
    condition: "used",
    barcode: null,
    weightKg: null,
    lengthCm: null,
    widthCm: null,
    heightCm: null,
    location: null,
    shelf: null,
  };
}

// Una organización con la capacidad, sus grados, un admin, un cliente con teléfono y una credencial.
async function organization(name: string, email: string) {
  const organizationId = await createOrganization(name);
  const userId = await addAdmin(organizationId, email);
  await getDb().transaction(async (tx) => {
    const activated = await activateCapability(tx, {
      organizationId,
      capability: "serialized_units",
      adminEmail: email,
    });
    if (!activated.ok) throw new Error(activated.code);
    await applyGradeTemplate(tx, {
      organizationId,
      actorUserId: activated.actorUserId,
      grades: getProfile("iphone")!.grades,
    });
  });
  await getDb().execute(
    sql`insert into clients (organization_id, display_name, phone_e164)
        values (${organizationId}, 'Lucía', ${PHONE})`,
  );
  const credentialId = await ingestCredential(organizationId);
  return {
    organizationId,
    userId,
    admin: await contextFor(email),
    ingestion: {
      organizationId,
      source: "agente-whatsapp",
      credentialId,
    } satisfies IngestionContext,
  };
}

type Org = Awaited<ReturnType<typeof organization>>;

async function product(
  org: Org,
  sku: string,
  { byUnit = true, price = ["400.00", "USD"] as [string, string] | null } = {},
) {
  const created = await createProduct(org.admin, productInput(sku));
  if (!created.ok) throw new Error(`alta rechazada: ${created.code}`);
  if (byUnit) {
    const changed = await changeProductTracking(
      org.admin,
      created.productId,
      "unit",
    );
    if (!changed.ok) throw new Error(`seguimiento rechazado: ${changed.code}`);
  }
  if (price) {
    await getDb().execute(
      sql`insert into product_prices (organization_id, product_id, amount, currency, created_by)
          values (${org.organizationId}, ${created.productId}, ${price[0]}, ${price[1]}, ${org.userId})`,
    );
  }
  return created.productId;
}

// Un producto por cantidad, para las líneas de cantidad. Sin saldo: un pendiente no mira el stock.
function quantityProduct(org: Org, sku: string) {
  return product(org, sku, { byUnit: false, price: ["15.00", "USD"] });
}

async function unit(
  org: Org,
  productId: string,
  serial: string,
  overrides: Partial<UnitInput> = {},
) {
  const result = await registerUnit(org.admin, productId, {
    serial,
    cost: "300",
    currency: "USD",
    gradeId: "",
    batteryHealth: "87",
    ...overrides,
  });
  if (!result.ok) throw new Error(`alta rechazada: ${JSON.stringify(result)}`);
  return result.unitId;
}

type Line =
  | { product_id: string; unit_ids: string[] }
  | { product_id: string; quantity: string };

function event(
  lines: Line[],
  options: { eventType?: string; eventId?: string } = {},
) {
  return {
    contract_version: "2",
    event_type: options.eventType ?? "order.placed_with_units",
    event_id: options.eventId ?? `evt-unidades-${++eventCounter}`,
    occurred_at: "2026-10-22T14:59:58.000Z",
    client: { phone: PHONE },
    lines,
  };
}

function send(org: Org, payload: unknown) {
  return recordIngestionEventV2(
    org.ingestion,
    JSON.stringify(payload),
    RECEIVED_AT,
  );
}

async function ordersOf(organizationId: string) {
  const result = await getDb().execute<{
    id: string;
    number: string;
    status: string;
    currency: string;
    total: string;
    created_by_credential_id: string | null;
  }>(
    sql`select id, number::text, status, currency, total::text, created_by_credential_id
        from orders where organization_id = ${organizationId} order by number`,
  );
  return result.rows;
}

async function linesOf(orderId: string) {
  const result = await getDb().execute<{
    product_id: string;
    quantity: string;
    unit_price: string;
    line_total: string;
  }>(
    sql`select product_id, quantity::text, unit_price::text, line_total::text
        from order_lines where order_id = ${orderId} order by position`,
  );
  return result.rows;
}

async function lineUnitsOf(orderId: string) {
  const result = await getDb().execute<{
    unit_id: string;
    unit_price: string;
  }>(
    sql`select u.unit_id, u.unit_price::text from order_line_units u
        join order_lines l on l.id = u.order_line_id
        where l.order_id = ${orderId} order by l.position, u.unit_price, u.unit_id`,
  );
  return result.rows;
}

async function statusOf(unitId: string) {
  const result = await getDb().execute<{ status: string }>(
    sql`select status::text from stock_units where id = ${unitId}`,
  );
  return result.rows[0]!.status;
}

async function reservedOf(productId: string) {
  const result = await getDb().execute<{ reserved: string }>(
    sql`select quantity_reserved::text as reserved from inventories where product_id = ${productId}`,
  );
  return result.rows[0]?.reserved ?? null;
}

async function counterOf(organizationId: string) {
  const result = await getDb().execute<{ last_number: string }>(
    sql`select last_number::text from document_counters
        where organization_id = ${organizationId} and kind = 'order'`,
  );
  return result.rows[0]?.last_number ?? null;
}

async function failedRule(org: Org, payload: unknown) {
  const result = await send(org, payload);
  if (result.ok || result.code !== "BUSINESS_RULE_VIOLATION") {
    throw new Error(`se esperaba una regla: ${JSON.stringify(result)}`);
  }
  return result.rule;
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

describe("el pendiente con unidades (D-7, AC-5)", () => {
  it(
    "guarda las unidades sin reservarlas, con el precio de cada una, y el reenvío es duplicate",
    async () => {
      const a = await organization("iPhone A", "admin-a@example.com");
      const phone = await product(a, "IP13");
      const own = await unit(a, phone, "356789012345671", {
        price: "420",
        priceCurrency: "USD",
      });
      const inherited = await unit(a, phone, "356789012345672");
      const cover = await quantityProduct(a, "FUNDA");

      const payload = event([
        { product_id: phone, unit_ids: [own, inherited.toUpperCase()] },
        { product_id: cover, quantity: "2" },
      ]);
      const first = await send(a, payload);
      expect(first).toMatchObject({
        ok: true,
        result: "accepted",
        order: { displayNumber: "P-000001" },
      });

      const [order] = await ordersOf(a.organizationId);
      expect(order).toMatchObject({
        status: "pending",
        currency: "USD",
        total: "850.00",
        created_by_credential_id: a.ingestion.credentialId,
      });
      // La línea de unidades: la cantidad es la cuenta de ids, y el monto la suma de sus precios.
      expect(await linesOf(order!.id)).toEqual([
        {
          product_id: phone,
          quantity: "2.000",
          unit_price: "400.00",
          line_total: "820.00",
        },
        {
          product_id: cover,
          quantity: "2.000",
          unit_price: "15.00",
          line_total: "30.00",
        },
      ]);
      // El precio de cada unidad: el propio, o el del producto.
      expect(await lineUnitsOf(order!.id)).toEqual([
        { unit_id: inherited, unit_price: "400.00" },
        { unit_id: own, unit_price: "420.00" },
      ]);
      // Un pendiente no reserva (ADR 0020; ADR 0024, punto 15, R-10).
      expect(await statusOf(own)).toBe("available");
      expect(await statusOf(inherited)).toBe("available");
      expect(await reservedOf(phone)).toBe("0.000");

      // El reenvío idéntico: el mismo número, sin escribir.
      expect(await send(a, payload)).toMatchObject({
        ok: true,
        result: "duplicate",
        order: { displayNumber: "P-000001" },
      });
      expect(await ordersOf(a.organizationId)).toHaveLength(1);

      // La auditoría del alta lleva los ids de las unidades, sin el IMEI, con la credencial.
      const audit = await getDb().execute<{
        actor_credential_id: string | null;
        after: Record<string, unknown>;
      }>(
        sql`select actor_credential_id, diff->'after' as after from audit_logs
            where entity_type = 'order' and entity_id = ${order!.id}`,
      );
      expect(audit.rows[0]!.actor_credential_id).toBe(a.ingestion.credentialId);
      expect(
        String(audit.rows[0]!.after.line_1_unit_ids).split(",").sort(),
      ).toEqual([own, inherited].sort());
      expect(JSON.stringify(audit.rows[0]!.after)).not.toMatch(
        /356789012345671|356789012345672/,
      );
    },
    TEST_TIMEOUT,
  );

  it(
    "dos pendientes con la misma unidad se aceptan; la primera confirmación la reserva y la segunda falla (AC-6)",
    async () => {
      const a = await organization("iPhone A", "admin-a@example.com");
      const phone = await product(a, "IP13");
      const only = await unit(a, phone, "111");

      for (let i = 0; i < 2; i++) {
        expect(
          await send(a, event([{ product_id: phone, unit_ids: [only] }])),
        ).toMatchObject({ ok: true, result: "accepted" });
      }
      const [first, second] = await ordersOf(a.organizationId);
      expect(await confirmOrder(a.admin, first!.id)).toEqual({
        ok: true,
        changed: true,
      });
      expect(await statusOf(only)).toBe("reserved");
      expect(await confirmOrder(a.admin, second!.id)).toMatchObject({
        ok: false,
        code: "BUSINESS_RULE_VIOLATION",
        rule: "units_unavailable",
      });

      // Con la unidad reservada, un pedido nuevo con ella ya no se acepta.
      expect(
        await failedRule(a, event([{ product_id: phone, unit_ids: [only] }])),
      ).toBe("unit_not_available");
      // Cancelar el confirmado la libera, y se vuelve a pedir.
      await cancelOrder(a.admin, first!.id);
      expect(
        await send(a, event([{ product_id: phone, unit_ids: [only] }])),
      ).toMatchObject({ ok: true, result: "accepted" });
    },
    TEST_TIMEOUT,
  );
});

describe("las reglas, en su orden y sin consumir un número (D-7, AC-5)", () => {
  it(
    "unit_tracking_mismatch, unit_not_available y currency_mismatch",
    async () => {
      const a = await organization("iPhone A", "admin-a@example.com");
      const b = await organization("iPhone B", "admin-b@example.com");
      const phone = await product(a, "IP13");
      const other = await product(a, "IP14");
      const cover = await quantityProduct(a, "FUNDA");
      const mine = await unit(a, phone, "111");
      const ofOther = await unit(a, other, "222");
      const pesos = await unit(a, phone, "333", {
        price: "500000",
        priceCurrency: "ARS",
      });
      const foreign = await unit(b, await product(b, "IP13"), "444");

      const cases: [Line[], string][] = [
        // Una línea de cantidad de un producto por unidad, y una de unidades de uno por cantidad.
        [[{ product_id: phone, quantity: "1" }], "unit_tracking_mismatch"],
        [[{ product_id: cover, unit_ids: [mine] }], "unit_tracking_mismatch"],
        // El seguimiento antes que la unidad: un id inexistente en un producto por cantidad.
        [
          [{ product_id: cover, unit_ids: [randomUUID()] }],
          "unit_tracking_mismatch",
        ],
        // Inexistente, de otro producto o de otra organización: sin distinguir.
        [
          [{ product_id: phone, unit_ids: [randomUUID()] }],
          "unit_not_available",
        ],
        [[{ product_id: phone, unit_ids: [ofOther] }], "unit_not_available"],
        [[{ product_id: phone, unit_ids: [foreign] }], "unit_not_available"],
        [
          [{ product_id: phone, unit_ids: [mine, ofOther] }],
          "unit_not_available",
        ],
        // Una unidad con precio propio en otra moneda que el pedido.
        [[{ product_id: phone, unit_ids: [pesos] }], "currency_mismatch"],
        [
          [
            { product_id: cover, quantity: "1" },
            { product_id: phone, unit_ids: [pesos] },
          ],
          "currency_mismatch",
        ],
      ];
      for (const [lines, rule] of cases) {
        expect(await failedRule(a, event(lines))).toBe(rule);
      }
      expect(await ordersOf(a.organizationId)).toEqual([]);
      expect(await counterOf(a.organizationId)).toBeNull();
      expect(await statusOf(mine)).toBe("available");
    },
    TEST_TIMEOUT,
  );

  it(
    "la precedencia: el cliente, después cada línea en su orden con las reglas de order.placed primero",
    async () => {
      const a = await organization("iPhone A", "admin-a@example.com");
      const phone = await product(a, "IP13");
      const noPrice = await product(a, "IP12", { price: null });
      const unpriced = await unit(a, noPrice, "222");

      // El cliente primero.
      expect(
        await failedRule(a, {
          ...event([{ product_id: phone, unit_ids: [randomUUID()] }]),
          client: { phone: "+5491155559999" },
        }),
      ).toBe("client_not_found");
      // La primera línea que falla responde, aunque una posterior también falle.
      expect(
        await failedRule(
          a,
          event([
            { product_id: randomUUID(), quantity: "1" },
            { product_id: phone, unit_ids: [randomUUID()] },
          ]),
        ),
      ).toBe("product_not_found");
      // Dentro de la línea, sin precio antes que la unidad o el seguimiento.
      expect(
        await failedRule(
          a,
          event([{ product_id: noPrice, unit_ids: [randomUUID()] }]),
        ),
      ).toBe("product_without_price");
      expect(
        await failedRule(a, event([{ product_id: noPrice, quantity: "1" }])),
      ).toBe("product_without_price");
      expect(await ordersOf(a.organizationId)).toEqual([]);
      expect(await counterOf(a.organizationId)).toBeNull();
      expect(await statusOf(unpriced)).toBe("available");
    },
    TEST_TIMEOUT,
  );

  // Revisión independiente de la 29.8, H-9: las reglas heredadas por la rama con unidades.
  it(
    "client_inactive y amount_out_of_range con una línea de unidades",
    async () => {
      const a = await organization("iPhone A", "admin-a@example.com");
      const phone = await product(a, "IP13");
      const first = await unit(a, phone, "356789012345681", {
        price: "600000000000",
        priceCurrency: "USD",
      });
      const second = await unit(a, phone, "356789012345682", {
        price: "600000000000",
        priceCurrency: "USD",
      });
      // Dos unidades que caben cada una, y cuya suma no cabe en numeric(14, 2).
      expect(
        await failedRule(
          a,
          event([{ product_id: phone, unit_ids: [first, second] }]),
        ),
      ).toBe("amount_out_of_range");

      await getDb().execute(
        sql`update clients set is_active = false where organization_id = ${a.organizationId}`,
      );
      expect(
        await failedRule(a, event([{ product_id: phone, unit_ids: [first] }])),
      ).toBe("client_inactive");
      expect(await ordersOf(a.organizationId)).toEqual([]);
      expect(await counterOf(a.organizationId)).toBeNull();
    },
    TEST_TIMEOUT,
  );

  it(
    "un reenvío de un rechazo responde la misma regla, aunque ya se cumpla",
    async () => {
      const a = await organization("iPhone A", "admin-a@example.com");
      const phone = await product(a, "IP13");
      const payload = event([{ product_id: phone, unit_ids: [randomUUID()] }]);
      expect(await failedRule(a, payload)).toBe("unit_not_available");
      expect(await failedRule(a, payload)).toBe("unit_not_available");
      const events = await getDb().execute<{
        status: string;
        error_code: string;
      }>(
        sql`select status, error_code from ingestion_events where organization_id = ${a.organizationId}`,
      );
      expect(events.rows).toEqual([
        { status: "failed", error_code: "unit_not_available" },
      ]);
    },
    TEST_TIMEOUT,
  );
});

describe("lo que no cambia (AC-8)", () => {
  it(
    "order.placed sigue rechazando el producto por unidad como product_not_found",
    async () => {
      const a = await organization("iPhone A", "admin-a@example.com");
      const phone = await product(a, "IP13");
      await unit(a, phone, "111");
      expect(
        await failedRule(
          a,
          event([{ product_id: phone, quantity: "1" }], {
            eventType: "order.placed",
          }),
        ),
      ).toBe("product_not_found");
      // Y un pedido solo de cantidades por order.placed_with_units se acepta, como por order.placed.
      const cover = await quantityProduct(a, "FUNDA");
      expect(
        await send(a, event([{ product_id: cover, quantity: "1" }])),
      ).toMatchObject({ ok: true, result: "accepted" });
    },
    TEST_TIMEOUT,
  );
});

import { sql, type SQL } from "drizzle-orm";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type MockInstance,
} from "vitest";
import { errorResponseSchema } from "@/app/api/read/v1/contract";
import {
  repairListResponseSchemaV3,
  serviceOrderListResponseSchemaV3,
} from "@/app/api/read/v3/contract";
import { handleRepairsV3 } from "@/app/api/read/v3/repairs/handler";
import { handleServiceOrdersV3 } from "@/app/api/read/v3/service-orders/handler";
import { hashPassword, login } from "@/modules/auth";
import {
  createModel,
  createProduct,
  createServiceProduct,
  setModelActive,
  type ProductInput,
} from "@/modules/catalog";
import { createExchangeSettings, recordExchangeRate } from "@/modules/fx";
import {
  createIngestionCredential,
  INGESTION_RATE_LIMIT,
} from "@/modules/ingestion";
import { changeProductTracking, registerUnit } from "@/modules/inventory";
import {
  activateCapability,
  getAuthContext,
  getProfile,
  type AuthContext,
} from "@/modules/organizations";
import { createSupplier, setSupplierTechnician } from "@/modules/purchasing";
import {
  applyRepairTypeTemplate,
  approveServiceOrder,
  cancelServiceOrder,
  createOwnUnitServiceOrder,
  createServiceOrder,
  listRepairTypes,
  markServiceOrderRepaired,
  quoteServiceOrder,
  rejectServiceOrder,
  sendServiceOrder,
  setRepairPrice,
  setRepairTypeActive,
} from "@/modules/service";
import { getDb } from "@/shared/db";
import { resetDatabase } from "./reset-database";

// Las reparaciones y las órdenes de servicio de la lectura v3, contra PostgreSQL real (brief-29.8.2,
// D-1 a D-7; AC-1 a AC-7): la búsqueda de modelos por texto y por id, con los modelos que no se venden,
// los que empiezan igual, el modelo y el tipo inactivos; las órdenes del cliente de una conversación,
// con su presupuesto, la ventana de 30 días y el tope de 5; nunca una orden propia, de otro cliente o de
// otra organización; el cuerpo crudo sin el IMEI, lo reportado, el técnico, un costo ni el teléfono; la
// capacidad apagada; el alcance; y el log con las rutas fijas. Los requests son sintéticos: nada de esto
// es evidencia de integración con el agente.

const BASE = "http://localhost/api/read";
const PASSWORD = "contraseña-correcta-larga";
const TEST_TIMEOUT = 60000;
const UNKNOWN_ID = "9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d";
const DAY_MS = 24 * 60 * 60 * 1000;
// Valores que no aparecen en ningún otro campo, para buscarlos en el cuerpo crudo (D-7).
const SERIAL = "356789012345671";
const ISSUE = "Se-moja-la-pantalla-secreta";
const TECHNICIAN = "Tecnico-Secreto-Uno";
const COST = "37.13";
const PHONE = "+5491155550123";
const CONVERSATION = "conv-29.8.2-ana";
let storedHash: string;

type Credential = { id: string; token: string };

async function returningId(query: SQL): Promise<string> {
  const result = await getDb().execute<{ id: string }>(query);
  return result.rows[0]!.id;
}

function ok<T extends { ok: boolean }>(result: T): Extract<T, { ok: true }> {
  if (!result.ok) throw new Error(`rechazado: ${JSON.stringify(result)}`);
  return result as Extract<T, { ok: true }>;
}

async function credential(
  organizationId: string,
  scope: "read" | "context",
): Promise<Credential> {
  const created = await createIngestionCredential(
    organizationId,
    "agente-whatsapp",
    scope,
  );
  if (!created.ok) throw new Error("credencial inválida");
  return { id: created.credentialId, token: created.token };
}

function request(
  path: string,
  token: string | null,
  headers: Record<string, string> = {},
) {
  return new Request(`${BASE}${path}`, {
    headers: {
      ...(token === null ? {} : { authorization: `Bearer ${token}` }),
      ...headers,
    },
  });
}

const v3 = {
  repairs: (
    query: string,
    token: string | null,
    now = new Date(),
    headers: Record<string, string> = {},
  ) => handleRepairsV3(request(`/v3/repairs?${query}`, token, headers), now),
  orders: (
    conversationRef: string | null,
    token: string | null,
    now = new Date(),
    headers: Record<string, string> = {},
  ) =>
    handleServiceOrdersV3(
      request(
        `/v3/service-orders${
          conversationRef === null
            ? ""
            : `?conversation_ref=${encodeURIComponent(conversationRef)}`
        }`,
        token,
        headers,
      ),
      now,
    ),
};

async function json<T>(
  response: Response,
  schema: { safeParse: (value: unknown) => { success: boolean; data?: T } },
): Promise<T> {
  expect(response.status).toBe(200);
  const parsed = schema.safeParse(await response.json());
  if (!parsed.success) throw new Error("respuesta fuera del contrato");
  return parsed.data!;
}

async function rejected(response: Response, status: number) {
  expect(response.status).toBe(status);
  const body = await response.json();
  expect(errorResponseSchema.safeParse(body).success).toBe(true);
  return body as { code: string; request_id: string; fields?: string[] };
}

async function member(
  orgId: string,
  email: string,
): Promise<{ context: AuthContext; userId: string }> {
  const userId = await returningId(
    sql`insert into users (email, password_hash, name, must_change_password)
        values (${email}, ${storedHash}, ${email}, false) returning id`,
  );
  await getDb().execute(
    sql`insert into organization_members (organization_id, user_id, role)
        values (${orgId}, ${userId}, 'admin')`,
  );
  const logged = await login({ email, password: PASSWORD, ip: null });
  if (!logged.ok) throw new Error("login rechazado");
  const auth = await getAuthContext(logged.token);
  if (!auth.ok) throw new Error("contexto rechazado");
  return { context: auth.context, userId };
}

// Lo que hace org:capability --profile iphone: las capacidades, los tipos de ejemplo y el producto de
// servicio; más la cotización de 1200 ARS por USD.
async function activateIphone(
  organizationId: string,
  admin: { context: AuthContext; userId: string },
  adminEmail: string,
) {
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
    const settings = await createExchangeSettings(tx, {
      organizationId,
      quoteCurrency: "ARS",
      actorUserId: admin.userId,
    });
    if (!settings.ok) throw new Error("configuración rechazada");
  });
  ok(
    await recordExchangeRate(admin.context, {
      rate: "1200",
      confirmLargeChange: true,
    }),
  );
}

function productInput(sku: string): ProductInput {
  return {
    sku,
    name: `Equipo ${sku}`,
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

async function seed() {
  const orgA = await returningId(
    sql`insert into organizations (name, main_currency) values ('iPhone A', 'USD') returning id`,
  );
  const orgB = await returningId(
    sql`insert into organizations (name, main_currency) values ('iPhone B', 'USD') returning id`,
  );
  const adminA = await member(orgA, "admin-a@example.com");
  const adminB = await member(orgB, "admin-b@example.com");
  await activateIphone(orgA, adminA, "admin-a@example.com");
  await activateIphone(orgB, adminB, "admin-b@example.com");
  const admin = adminA.context;

  const model = async (context: AuthContext, name: string) =>
    ok(await createModel(context, { name, brand: "Apple" })).modelId;
  // El 11 y el 11 Pro empiezan igual; el 11 no se vende: no tiene producto.
  const eleven = await model(admin, "iPhone 11");
  const elevenPro = await model(admin, "iPhone 11 Pro");
  const thirteen = await model(admin, "iPhone 13");
  const eight = await model(admin, "iPhone 8");
  const twelve = await model(admin, "iPhone 12");
  const elevenB = await model(adminB.context, "iPhone 11");

  const types = ok(await listRepairTypes(admin)).types;
  const typeId = (name: string) => types.find((type) => type.name === name)!.id;
  const battery = typeId("Cambio de batería");
  const screen = typeId("Cambio de pantalla");
  const faceId = typeId("Face ID");
  const price = async (
    context: AuthContext,
    repairTypeId: string,
    modelId: string,
    amount: string,
    currency = "USD",
  ) =>
    ok(
      await setRepairPrice(context, {
        repairTypeId,
        modelId,
        price: amount,
        priceCurrency: currency,
        cost: COST,
        costCurrency: "USD",
      }),
    );
  await price(admin, screen, eleven, "120");
  await price(admin, battery, eleven, "45");
  await price(admin, battery, elevenPro, "55");
  await price(admin, battery, thirteen, "60");
  await price(admin, screen, thirteen, "150000", "ARS");
  // El 8 se desactiva y el 12 solo tiene un tipo que se desactiva: ninguno de los dos aparece.
  await price(admin, battery, eight, "30");
  ok(await setModelActive(admin, eight, false));
  await price(admin, faceId, twelve, "90");
  await price(admin, faceId, eleven, "95");
  ok(await setRepairTypeActive(admin, faceId, false));
  const typesB = ok(await listRepairTypes(adminB.context)).types;
  await price(
    adminB.context,
    typesB.find((type) => type.name === "Cambio de batería")!.id,
    elevenB,
    "99",
  );

  // Ana, con teléfono y una conversación del agente; Beto, otro cliente; y una conversación sin cliente.
  const ana = await returningId(
    sql`insert into clients (organization_id, display_name, phone_e164)
        values (${orgA}, 'Ana Cliente', ${PHONE}) returning id`,
  );
  const beto = await returningId(
    sql`insert into clients (organization_id, display_name) values (${orgA}, 'Beto Cliente') returning id`,
  );
  const conversation = async (
    organizationId: string,
    externalRef: string,
    clientId: string | null,
  ) =>
    getDb().execute(
      sql`insert into conversations (organization_id, client_id, channel, external_ref, status, started_at)
          values (${organizationId}, ${clientId}, 'whatsapp', ${externalRef}, 'open', '2026-10-22T10:00:00Z')`,
    );
  await conversation(orgA, CONVERSATION, ana);
  await conversation(orgA, "conv-sin-cliente", null);
  const anaB = await returningId(
    sql`insert into clients (organization_id, display_name) values (${orgB}, 'Ana B') returning id`,
  );
  await conversation(orgB, "conv-de-b", anaB);

  const technician = ok(await createSupplier(admin, { name: TECHNICIAN }));
  ok(await setSupplierTechnician(admin, technician.supplierId, true));

  return {
    orgA,
    orgB,
    admin,
    adminB: adminB.context,
    adminAId: adminA.userId,
    eleven,
    elevenPro,
    thirteen,
    elevenB,
    battery,
    screen,
    ana,
    beto,
    anaB,
    technicianId: technician.supplierId,
  };
}

type Seed = Awaited<ReturnType<typeof seed>>;

async function newOrder(
  s: Seed,
  { clientId = s.ana, modelId = s.eleven, context = s.admin } = {},
) {
  return ok(
    await createServiceOrder(context, {
      clientId,
      modelId,
      deviceSerial: SERIAL,
      reportedIssue: ISSUE,
    }),
  ).order;
}

// Una orden de Ana hasta el estado pedido, con un presupuesto de pantalla y batería en USD.
async function orderAt(
  s: Seed,
  status: "received" | "sent" | "quoted" | "approved" | "repaired",
) {
  const order = await newOrder(s);
  if (status === "received") return order;
  ok(await sendServiceOrder(s.admin, order.id, s.technicianId));
  if (status === "sent") return order;
  ok(
    await quoteServiceOrder(s.admin, order.id, {
      customerCurrency: "USD",
      technicianCurrency: "USD",
      lines: [
        { repairTypeId: s.screen, price: "150", cost: COST },
        { repairTypeId: s.battery, price: "60", cost: COST },
      ],
    }),
  );
  if (status === "quoted") return order;
  ok(await approveServiceOrder(s.admin, order.id));
  if (status === "approved") return order;
  ok(await markServiceOrderRepaired(s.admin, order.id));
  return order;
}

const savedEnv = {
  enabled: process.env.READ_API_ENABLED,
  allowed: process.env.READ_API_ALLOWED_CREDENTIALS,
};

function allow(...credentials: Credential[]) {
  process.env.READ_API_ENABLED = "true";
  process.env.READ_API_ALLOWED_CREDENTIALS = credentials
    .map((c) => c.id)
    .join(",");
}

let s: Seed;
let readerA: Credential;
let contextA: Credential;
let contextB: Credential;

beforeAll(async () => {
  storedHash = await hashPassword(PASSWORD);
});

beforeEach(async () => {
  await resetDatabase(getDb());
  s = await seed();
  readerA = await credential(s.orgA, "read");
  contextA = await credential(s.orgA, "context");
  contextB = await credential(s.orgB, "context");
  allow(readerA, contextA, contextB);
}, TEST_TIMEOUT);

afterEach(() => {
  for (const [key, value] of [
    ["READ_API_ENABLED", savedEnv.enabled],
    ["READ_API_ALLOWED_CREDENTIALS", savedEnv.allowed],
  ] as const) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  vi.restoreAllMocks();
});

afterAll(async () => {
  await getDb().$client.end();
});

const CONVERTED = (amount: string, currency: string) => ({
  amount,
  currency,
  rate: "1200",
  rate_as_of: expect.stringMatching(/^\d{4}-\d\d-\d\dT.*Z$/),
});

describe(
  "API de lectura v3: las reparaciones y las órdenes de servicio",
  { timeout: TEST_TIMEOUT },
  () => {
    it("1. AC-1: por texto, los modelos activos con precio, también los que no se venden y los que empiezan igual, sin costo", async () => {
      const response = await v3.repairs("q=iphone%2011", readerA.token);
      const raw = await response.clone().text();
      const body = await json(response, repairListResponseSchemaV3);
      expect(body).toStrictEqual({
        contract_version: "3",
        items: [
          {
            model: { model_id: s.eleven, name: "iPhone 11", brand: "Apple" },
            // En el orden de la organización; Face ID está inactivo.
            repairs: [
              {
                repair_type_id: s.battery,
                name: "Cambio de batería",
                price: { amount: "45.00", currency: "USD" },
                price_converted: CONVERTED("54000.00", "ARS"),
              },
              {
                repair_type_id: s.screen,
                name: "Cambio de pantalla",
                price: { amount: "120.00", currency: "USD" },
                price_converted: CONVERTED("144000.00", "ARS"),
              },
            ],
          },
          {
            model: {
              model_id: s.elevenPro,
              name: "iPhone 11 Pro",
              brand: "Apple",
            },
            repairs: [
              {
                repair_type_id: s.battery,
                name: "Cambio de batería",
                price: { amount: "55.00", currency: "USD" },
                price_converted: CONVERTED("66000.00", "ARS"),
              },
            ],
          },
        ],
      });
      expect(raw).not.toContain(COST);
      expect(raw).not.toMatch(/cost/i);

      // Un precio en pesos se convierte a dólares; la marca también se busca.
      const thirteen = await json(
        await v3.repairs("q=apple%2013", readerA.token),
        repairListResponseSchemaV3,
      );
      expect(thirteen.items.map((item) => item.model.name)).toEqual([
        "iPhone 13",
      ]);
      expect(thirteen.items[0]!.repairs[1]).toMatchObject({
        price: { amount: "150000.00", currency: "ARS" },
        price_converted: CONVERTED("125.00", "USD"),
      });

      // El modelo inactivo, el que solo tiene un tipo inactivo, y nada: vacíos.
      for (const query of ["q=iphone%208", "q=iphone%2012", "q=samsung"]) {
        expect(
          (
            await json(
              await v3.repairs(query, readerA.token),
              repairListResponseSchemaV3,
            )
          ).items,
        ).toEqual([]);
      }
    });

    // Revisión independiente de la 29.8.2, O-4: el tope se aplica después de descartar los modelos sin
    // precio (D-2).
    it("1b. D-2: como mucho 10 modelos, contados entre los que tienen precio, por nombre", async () => {
      ok(await createModel(s.admin, { name: "Pixel 0", brand: "Google" }));
      const names: string[] = [];
      for (let i = 1; i <= 11; i++) {
        const name = `Pixel ${i}`;
        const modelId = ok(
          await createModel(s.admin, { name, brand: "Google" }),
        ).modelId;
        ok(
          await setRepairPrice(s.admin, {
            repairTypeId: s.battery,
            modelId,
            price: "40",
            priceCurrency: "USD",
            cost: COST,
            costCurrency: "USD",
          }),
        );
        names.push(name);
      }
      const body = await json(
        await v3.repairs("q=pixel", readerA.token),
        repairListResponseSchemaV3,
      );
      expect(body.items.map((item) => item.model.name)).toEqual(
        [...names].sort().slice(0, 10),
      );
    });

    it("2. AC-1: por model_id; ninguno, los dos o un id inválido son un 400; un modelo de otra organización no aparece", async () => {
      const byId = await json(
        await v3.repairs(
          `model_id=${s.elevenPro.toUpperCase()}`,
          readerA.token,
        ),
        repairListResponseSchemaV3,
      );
      expect(byId.items.map((item) => item.model.model_id)).toEqual([
        s.elevenPro,
      ]);
      for (const id of [s.elevenB, UNKNOWN_ID]) {
        expect(
          (
            await json(
              await v3.repairs(`model_id=${id}`, readerA.token),
              repairListResponseSchemaV3,
            )
          ).items,
        ).toEqual([]);
      }
      // Cada organización ve sus precios.
      const readerB = await credential(s.orgB, "read");
      allow(readerA, readerB, contextA, contextB);
      const fromB = await json(
        await v3.repairs("q=iphone%2011", readerB.token),
        repairListResponseSchemaV3,
      );
      expect(fromB.items).toHaveLength(1);
      expect(fromB.items[0]).toMatchObject({
        model: { model_id: s.elevenB },
        repairs: [{ price: { amount: "99.00", currency: "USD" } }],
      });

      for (const [query, fields] of [
        ["", ["q", "model_id"]],
        ["q=%20%20", ["q", "model_id"]],
        [`q=iphone&model_id=${s.eleven}`, ["q", "model_id"]],
        ["model_id=no-es-un-id", ["model_id"]],
        [`q=${"x".repeat(201)}`, ["q"]],
      ] as const) {
        const body = await rejected(
          await v3.repairs(query, readerA.token),
          400,
        );
        expect(body).toMatchObject({ code: "VALIDATION_ERROR", fields });
      }
    });

    it("3. AC-2 y AC-3: las órdenes de Ana, de la más nueva a la más vieja, con el presupuesto desde quoted y sin datos prohibidos", async () => {
      const received = await orderAt(s, "received");
      const quoted = await orderAt(s, "quoted");
      const repaired = await orderAt(s, "repaired");
      // De Beto, de otra organización y de una unidad propia: ninguna aparece.
      await newOrder(s, { clientId: s.beto });
      await newOrder(s, {
        clientId: s.anaB,
        modelId: s.elevenB,
        context: s.adminB,
      });
      const product = ok(await createProduct(s.admin, productInput("U-1")));
      ok(await changeProductTracking(s.admin, product.productId, "unit"));
      await getDb().execute(
        sql`update products set model_id = ${s.thirteen} where id = ${product.productId}`,
      );
      const unit = ok(
        await registerUnit(s.admin, product.productId, {
          serial: "356000000000999",
          cost: "450",
          currency: "USD",
          gradeId: "",
          batteryHealth: "",
        }),
      );
      ok(
        await createOwnUnitServiceOrder(s.admin, unit.unitId, {
          technicianId: s.technicianId,
          reportedIssue: "Batería propia.",
        }),
      );

      const response = await v3.orders(CONVERSATION, contextA.token);
      const raw = await response.clone().text();
      const body = await json(response, serviceOrderListResponseSchemaV3);
      expect(body.items.map((item) => item.number)).toEqual([
        repaired.displayNumber,
        quoted.displayNumber,
        received.displayNumber,
      ]);
      const timestamps = await getDb().execute<{
        id: string;
        created_at: Date;
        quoted_at: Date | null;
        repaired_at: Date | null;
      }>(
        sql`select id, created_at, quoted_at, repaired_at from service_orders where id in (${received.id}, ${quoted.id}, ${repaired.id})`,
      );
      const at = (id: string) => timestamps.rows.find((row) => row.id === id)!;
      const iso = (value: Date | string | null) =>
        new Date(value as Date).toISOString();
      const quote = {
        total: { amount: "210.00", currency: "USD" },
        repairs: [
          {
            name: "Cambio de pantalla",
            price: { amount: "150.00", currency: "USD" },
          },
          {
            name: "Cambio de batería",
            price: { amount: "60.00", currency: "USD" },
          },
        ],
      };
      const model = { model_id: s.eleven, name: "iPhone 11", brand: "Apple" };
      expect(body.items).toStrictEqual([
        {
          number: repaired.displayNumber,
          model,
          status: "repaired",
          status_at: iso(at(repaired.id).repaired_at),
          received_at: iso(at(repaired.id).created_at),
          quote,
        },
        {
          number: quoted.displayNumber,
          model,
          status: "quoted",
          status_at: iso(at(quoted.id).quoted_at),
          received_at: iso(at(quoted.id).created_at),
          quote,
        },
        {
          number: received.displayNumber,
          model,
          status: "received",
          status_at: iso(at(received.id).created_at),
          received_at: iso(at(received.id).created_at),
          quote: null,
        },
      ]);
      expect(received.displayNumber).toMatch(/^OS-\d{6}$/);
      for (const hidden of [
        SERIAL,
        ISSUE,
        TECHNICIAN,
        COST,
        PHONE,
        "5491155550123",
      ]) {
        expect(raw).not.toContain(hidden);
      }
      expect(raw).not.toMatch(/cost|serial|imei|technician|reported/i);
    });

    // Revisión independiente de la 29.8.2, M-2 y B-2: cada estado con su status_at y su presupuesto, y el
    // borde de 30 días justos.
    it("4. U-3: cada estado con su fecha y su presupuesto; las cerradas aparecen 30 días justos; las abiertas siempre; una cancelada por error nunca; como mucho 5", async () => {
      const open = await orderAt(s, "sent");
      const approved = await orderAt(s, "approved");
      const rejectedOrder = await orderAt(s, "quoted");
      ok(await rejectServiceOrder(s.admin, rejectedOrder.id));
      const delivered = await newOrder(s);
      ok(await sendServiceOrder(s.admin, delivered.id, s.technicianId));
      ok(
        await quoteServiceOrder(s.admin, delivered.id, {
          customerCurrency: "USD",
          technicianCurrency: "USD",
          lines: [{ repairTypeId: s.battery, price: "60", cost: COST }],
        }),
      );
      ok(await rejectServiceOrder(s.admin, delivered.id));
      // PostgreSQL guarda microsegundos y Date, milisegundos: el borde exacto necesita una fecha que Date
      // represente sin redondear, y el trigger no deja cambiarla después. La entrega se escribe aquí, con
      // la misma transición que deja pasar el trigger; deliverServiceOrder se prueba en su propio test.
      await getDb().execute(
        sql`update service_orders
            set status = 'delivered',
                delivered_at = date_trunc('milliseconds', now()) + interval '1 millisecond',
                updated_at = now()
            where id = ${delivered.id}`,
      );
      // Cancelada después del presupuesto: lo conserva (D-4).
      const cancelled = await orderAt(s, "quoted");
      ok(await cancelServiceOrder(s.admin, cancelled.id, "customer_withdrew"));
      // Cancelada por cargarse por error: pudo ser de otro cliente. Nunca aparece, ni ocupa un lugar del
      // tope (O-2 de la revisión independiente; decisión del usuario).
      const mistaken = await orderAt(s, "quoted");
      ok(await cancelServiceOrder(s.admin, mistaken.id, "entered_by_mistake"));

      const timestamps = await getDb().execute<{
        id: string;
        created_at: Date;
        sent_at: Date | null;
        approved_at: Date | null;
        rejected_at: Date | null;
        delivered_at: Date | null;
        cancelled_at: Date | null;
      }>(
        sql`select id, created_at, sent_at, approved_at, rejected_at, delivered_at, cancelled_at
            from service_orders where client_id = ${s.ana}`,
      );
      const at = (id: string) => timestamps.rows.find((row) => row.id === id)!;
      const iso = (value: Date | string | null) =>
        new Date(value as Date).toISOString();
      const model = { model_id: s.eleven, name: "iPhone 11", brand: "Apple" };
      const fullQuote = {
        total: { amount: "210.00", currency: "USD" },
        repairs: [
          {
            name: "Cambio de pantalla",
            price: { amount: "150.00", currency: "USD" },
          },
          {
            name: "Cambio de batería",
            price: { amount: "60.00", currency: "USD" },
          },
        ],
      };
      const order = (
        o: { id: string; displayNumber: string },
        status: string,
        statusAt: Date | null,
        quote: unknown,
      ) => ({
        number: o.displayNumber,
        model,
        status,
        status_at: iso(statusAt),
        received_at: iso(at(o.id).created_at),
        quote,
      });
      const list = async (now: Date) =>
        (
          await json(
            await v3.orders(CONVERSATION, contextA.token, now),
            serviceOrderListResponseSchemaV3,
          )
        ).items;
      const numbers = async (now: Date) =>
        (await list(now)).map((item) => item.number);

      expect(await list(new Date())).toStrictEqual([
        order(cancelled, "cancelled", at(cancelled.id).cancelled_at, fullQuote),
        order(delivered, "delivered", at(delivered.id).delivered_at, {
          total: { amount: "60.00", currency: "USD" },
          repairs: [
            {
              name: "Cambio de batería",
              price: { amount: "60.00", currency: "USD" },
            },
          ],
        }),
        order(
          rejectedOrder,
          "rejected",
          at(rejectedOrder.id).rejected_at,
          fullQuote,
        ),
        order(approved, "approved", at(approved.id).approved_at, fullQuote),
        order(open, "sent", at(open.id).sent_at, null),
      ]);

      // A los 30 días justos de la entrega sigue; un milisegundo después, no.
      const deliveredAt = new Date(at(delivered.id).delivered_at!).getTime();
      expect(await numbers(new Date(deliveredAt + 30 * DAY_MS))).toContain(
        delivered.displayNumber,
      );
      expect(
        await numbers(new Date(deliveredAt + 30 * DAY_MS + 1)),
      ).not.toContain(delivered.displayNumber);
      // A los 31 días, solo las abiertas. Una rechazada sin entregar sigue abierta.
      expect(await numbers(new Date(Date.now() + 31 * DAY_MS))).toEqual([
        rejectedOrder.displayNumber,
        approved.displayNumber,
        open.displayNumber,
      ]);

      const more = [];
      for (let i = 0; i < 3; i++) more.push(await newOrder(s));
      expect(await numbers(new Date())).toEqual([
        more[2]!.displayNumber,
        more[1]!.displayNumber,
        more[0]!.displayNumber,
        cancelled.displayNumber,
        delivered.displayNumber,
      ]);
    });

    it("5. AC-2: una conversación inexistente o ajena da el mismo 404; sin cliente o sin órdenes, vacía; la referencia es obligatoria", async () => {
      await newOrder(s, {
        clientId: s.anaB,
        modelId: s.elevenB,
        context: s.adminB,
      });
      for (const ref of ["conv-que-no-existe", "conv-de-b"]) {
        const body = await rejected(await v3.orders(ref, contextA.token), 404);
        expect(body.code).toBe("NOT_FOUND");
      }
      for (const ref of ["conv-sin-cliente", CONVERSATION]) {
        expect(
          await json(
            await v3.orders(ref, contextA.token),
            serviceOrderListResponseSchemaV3,
          ),
        ).toStrictEqual({ contract_version: "3", items: [] });
      }
      // La otra organización ve la suya.
      expect(
        (
          await json(
            await v3.orders("conv-de-b", contextB.token),
            serviceOrderListResponseSchemaV3,
          )
        ).items,
      ).toHaveLength(1);
      for (const ref of [null, "", " con-espacio", "a".repeat(201)]) {
        const body = await rejected(await v3.orders(ref, contextA.token), 400);
        expect(body).toMatchObject({
          code: "VALIDATION_ERROR",
          fields: ["conversation_ref"],
        });
      }
    });

    // La aplicación no desactiva una capacidad: el test borra sus filas como dueño de la base de prueba,
    // como el caso 10 de read-api-v3.test.ts.
    it("6. AC-4: sin repairs, las dos rutas devuelven la lista vacía aunque los datos y variants sigan", async () => {
      await orderAt(s, "quoted");
      await getDb().execute(
        sql`delete from organization_capabilities
            where organization_id = ${s.orgA} and capability = 'repairs'`,
      );
      for (const query of ["q=iphone", `model_id=${s.eleven}`]) {
        expect(
          await json(
            await v3.repairs(query, readerA.token),
            repairListResponseSchemaV3,
          ),
        ).toStrictEqual({ contract_version: "3", items: [] });
      }
      expect(
        await json(
          await v3.orders(CONVERSATION, contextA.token),
          serviceOrderListResponseSchemaV3,
        ),
      ).toStrictEqual({ contract_version: "3", items: [] });
    });

    it("6b. sin variants no hay modelos que buscar, y las órdenes siguen con el nombre de su modelo", async () => {
      await orderAt(s, "quoted");
      await getDb().execute(
        sql`delete from organization_capabilities
            where organization_id = ${s.orgA} and capability = 'variants'`,
      );
      expect(
        (
          await json(
            await v3.repairs("q=iphone", readerA.token),
            repairListResponseSchemaV3,
          )
        ).items,
      ).toEqual([]);
      // La orden ya nombra su modelo: sigue apareciendo con su nombre.
      const orders = await json(
        await v3.orders(CONVERSATION, contextA.token),
        serviceOrderListResponseSchemaV3,
      );
      expect(orders.items).toHaveLength(1);
      expect(orders.items[0]!.model.name).toBe("iPhone 11");
    });

    // Revisión independiente de la 29.8.2, M-1: el borde completo en las dos rutas.
    it("7. AC-6: repairs exige read y service-orders exige context; la allowlist; 401; correlación; límite; apagada, 404 sin cuerpo", async () => {
      expect(
        (await rejected(await v3.orders(CONVERSATION, readerA.token), 403))
          .code,
      ).toBe("FORBIDDEN");
      expect(
        (await rejected(await v3.repairs("q=iphone", contextA.token), 403))
          .code,
      ).toBe("FORBIDDEN");

      // La correlación vuelve en la respuesta; una inválida es un 400 que la nombra.
      const routes = [
        (headers: Record<string, string>) =>
          v3.repairs("q=iphone", readerA.token, new Date(), headers),
        (headers: Record<string, string>) =>
          v3.orders(CONVERSATION, contextA.token, new Date(), headers),
      ];
      for (const route of routes) {
        const correlated = await route({ "x-correlation-id": "turno-0298" });
        expect(correlated.status).toBe(200);
        expect(correlated.headers.get("x-correlation-id")).toBe("turno-0298");
        expect(correlated.headers.get("cache-control")).toBe("no-store");
        const invalid = await rejected(
          // Los espacios de los bordes los recorta Headers: el largo sí llega (read-api.test.ts).
          await route({ "x-correlation-id": "a".repeat(201) }),
          400,
        );
        expect(invalid).toMatchObject({
          code: "VALIDATION_ERROR",
          fields: ["correlation_id"],
        });
      }

      for (const unauthenticated of [
        await v3.repairs("q=iphone", null),
        await v3.orders(CONVERSATION, null),
      ]) {
        await rejected(unauthenticated, 401);
        expect(unauthenticated.headers.get("www-authenticate")).toBe("Bearer");
      }

      // El límite es el de las demás lecturas, por credencial. Al principio de un minuto de dentro de una
      // hora: la ventana es fija, y así no cuenta los requests de arriba.
      const minute = new Date(
        Math.floor(Date.now() / 60_000) * 60_000 + 60 * 60_000,
      );
      for (let i = 0; i < INGESTION_RATE_LIMIT; i++) {
        expect(
          (await v3.orders("conv-que-no-existe", contextA.token, minute))
            .status,
        ).toBe(404);
      }
      const limited = await v3.orders(CONVERSATION, contextA.token, minute);
      expect((await rejected(limited, 429)).code).toBe("RATE_LIMITED");
      expect(limited.headers.get("retry-after")).toBe("60");

      allow(readerA);
      expect(
        (await rejected(await v3.orders(CONVERSATION, contextA.token), 403))
          .code,
      ).toBe("FORBIDDEN");
      process.env.READ_API_ENABLED = "false";
      for (const off of [
        await v3.repairs("q=iphone", readerA.token),
        await v3.orders(CONVERSATION, contextA.token),
      ]) {
        expect(off.status).toBe(404);
        expect(await off.text()).toBe("");
      }
    });

    it("8. AC-6: el log lleva las rutas fijas, nunca la búsqueda, el id, la referencia ni el token", async () => {
      const lines: string[] = [];
      const capture = (...args: unknown[]) => void lines.push(args.join(" "));
      const spies: MockInstance[] = [
        vi.spyOn(console, "log").mockImplementation(capture),
        vi.spyOn(console, "error").mockImplementation(capture),
        vi.spyOn(console, "warn").mockImplementation(capture),
      ];
      await v3.repairs("q=iphone-secreto", readerA.token);
      await v3.repairs(`model_id=${s.eleven}`, readerA.token);
      await v3.orders(CONVERSATION, contextA.token);
      await v3.orders("conv-que-no-existe", contextA.token);
      for (const spy of spies) spy.mockRestore();

      const output = lines.join("\n");
      for (const hidden of [
        "iphone-secreto",
        s.eleven,
        CONVERSATION,
        "conv-que-no-existe",
        readerA.token.slice("crm_read_".length),
        contextA.token.slice("crm_ctx_".length),
      ]) {
        expect(output).not.toContain(hidden);
      }
      expect(lines.map((line) => JSON.parse(line).route)).toEqual([
        "/api/read/v3/repairs",
        "/api/read/v3/repairs",
        "/api/read/v3/service-orders",
        "/api/read/v3/service-orders",
      ]);
    });
  },
);

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
  tradeInChecklistResponseSchemaV3,
  tradeInQuoteResponseSchemaV3,
} from "@/app/api/read/v3/contract";
import { handleTradeInChecklistV3 } from "@/app/api/read/v3/trade-in-checklist/handler";
import { handleTradeInQuoteV3 } from "@/app/api/read/v3/trade-in-quote/handler";
import { hashPassword, login } from "@/modules/auth";
import {
  createModel,
  createProduct,
  createServiceProduct,
  type ProductInput,
} from "@/modules/catalog";
import { createExchangeSettings, recordExchangeRate } from "@/modules/fx";
import {
  createIngestionCredential,
  INGESTION_RATE_LIMIT,
} from "@/modules/ingestion";
import { applyGradeTemplate, changeProductTracking } from "@/modules/inventory";
import {
  activateCapability,
  getAuthContext,
  getProfile,
  type AuthContext,
} from "@/modules/organizations";
import {
  applyRepairTypeTemplate,
  listRepairTypes,
  repairTypeIdsByName,
  setRepairPrice,
} from "@/modules/service";
import {
  applyChecklistTemplate,
  applyQuoteTemplate,
  listChecklistItems,
  quoteTradeIn,
  setChecklistItemActive,
  setTradeInMargin,
  updateQuoteSettings,
} from "@/modules/tradeins";
import { getDb } from "@/shared/db";
import { resetDatabase } from "./reset-database";

// La cotización de un usado de la lectura v3, contra PostgreSQL real (brief-29.8.3, D-1 a D-7; AC-1 a
// AC-8): el checklist activo en su orden; el mismo rango que la pantalla del admin, con el convertido y
// un piso en cero; cada punto respondido (checklist_incomplete), un obligatorio que falla
// (not_accepted) y cada motivo fino como not_quotable, también los valores de ejemplo y la capacidad
// apagada; los 400 y el 404 sin distinguir; el cuerpo crudo sin el valor exacto, el margen, los costos
// ni el precio de referencia; que no escribe; el borde; y el log con las rutas fijas. Los requests son
// sintéticos: nada de esto es evidencia de integración con el agente.

const BASE = "http://localhost/api/read";
const PASSWORD = "contraseña-correcta-larga";
const TEST_TIMEOUT = 60000;
const UNKNOWN_ID = "9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d";
// Montos que no aparecen en ningún otro campo, para buscarlos en el cuerpo crudo (D-7).
const REFERENCE = "523.00";
const MARGIN = "47.13";
const COST_BATTERY = "40.29";
const COST_CAMERA = "61.17";
const COST_SCREEN = "90.53";
let storedHash: string;

type Credential = { id: string; token: string };

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
  checklist: (
    token: string | null,
    now = new Date(),
    headers: Record<string, string> = {},
  ) =>
    handleTradeInChecklistV3(
      request("/v3/trade-in-checklist", token, headers),
      now,
    ),
  quote: (
    query: string,
    token: string | null,
    now = new Date(),
    headers: Record<string, string> = {},
  ) =>
    handleTradeInQuoteV3(
      request(`/v3/trade-in-quote?${query}`, token, headers),
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

// Lo que hace org:capability --profile iphone, con la copia de la cotización, y la cotización de 1200
// ARS por USD. Con only, solo esas capacidades, sin plantillas.
async function activate(
  organizationId: string,
  admin: { context: AuthContext; userId: string },
  adminEmail: string,
  only?: ("serialized_units" | "variants" | "trade_ins")[],
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
    const quote = profile.tradeInQuote!;
    const typeIds = await repairTypeIdsByName(tx, organizationId);
    await applyQuoteTemplate(tx, {
      organizationId,
      actorUserId,
      template: {
        batteryThreshold: quote.batteryThreshold,
        rangePercent: quote.rangePercent,
        roundingStep: quote.roundingStep,
        roundingCurrency: quote.roundingCurrency,
        batteryRepairTypeId:
          typeIds.get(quote.batteryRepairType.toLowerCase()) ?? null,
        itemRepairTypes: new Map(
          profile.tradeInChecklist
            .filter((item) => item.repairType)
            .map((item) => [
              item.name.toLowerCase(),
              typeIds.get(item.repairType!.toLowerCase())!,
            ]),
        ),
      },
    });
    const settings = await createExchangeSettings(tx, {
      organizationId,
      quoteCurrency: "ARS",
      actorUserId: admin.userId,
    });
    if (!settings.ok) throw new Error("configuración rechazada");
  });
  if (only) return;
  ok(
    await recordExchangeRate(admin.context, {
      rate: "1200",
      confirmLargeChange: true,
    }),
  );
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

// Un producto por unidad, con modelo y, si se pide, con precio.
async function unitProduct(
  admin: { context: AuthContext; userId: string },
  orgId: string,
  sku: string,
  modelId: string,
  price: string | null,
  condition: ProductInput["condition"] = "used",
): Promise<string> {
  const product = ok(
    await createProduct(admin.context, productInput(sku, condition)),
  );
  ok(await changeProductTracking(admin.context, product.productId, "unit"));
  await getDb().execute(
    sql`update products set model_id = ${modelId} where id = ${product.productId}`,
  );
  if (price) {
    await getDb().execute(
      sql`insert into product_prices (organization_id, product_id, amount, currency, created_by)
          values (${orgId}, ${product.productId}, ${price}, 'USD', ${admin.userId})`,
    );
  }
  return product.productId;
}

async function seed() {
  const orgA = await returningId(
    sql`insert into organizations (name, main_currency) values ('iPhone A', 'USD') returning id`,
  );
  const orgB = await returningId(
    sql`insert into organizations (name, main_currency) values ('Sin usados', 'USD') returning id`,
  );
  const admin = await member(orgA, "admin-a@example.com");
  const adminB = await member(orgB, "admin-b@example.com");
  await activate(orgA, admin, "admin-a@example.com");
  await activate(orgB, adminB, "admin-b@example.com", [
    "serialized_units",
    "variants",
  ]);

  const model = ok(
    await createModel(admin.context, { name: "iPhone 13", brand: "Apple" }),
  );
  const bareModel = ok(
    await createModel(admin.context, { name: "iPhone 12", brand: "Apple" }),
  );
  const productId = await unitProduct(
    admin,
    orgA,
    "13U",
    model.modelId,
    REFERENCE,
  );
  const types = ok(await listRepairTypes(admin.context)).types;
  const type = (name: string) => types.find((one) => one.name === name)!.id;
  // Los costos del modelo: la batería, la cámara trasera y la pantalla; la frontal, sin costo.
  for (const [name, cost] of [
    ["Cambio de batería", COST_BATTERY],
    ["Cámara trasera", COST_CAMERA],
    ["Cambio de pantalla", COST_SCREEN],
  ] as const) {
    ok(
      await setRepairPrice(admin.context, {
        repairTypeId: type(name),
        modelId: model.modelId,
        price: "100",
        priceCurrency: "USD",
        cost,
        costCurrency: "USD",
      }),
    );
  }
  ok(
    await setTradeInMargin(admin.context, {
      modelId: model.modelId,
      amount: MARGIN,
      currency: "USD",
    }),
  );
  const items = ok(await listChecklistItems(admin.context)).items;
  const item = (name: string) => items.find((one) => one.name === name)!.id;
  const productB = await unitProduct(
    adminB,
    orgB,
    "13B",
    ok(await createModel(adminB.context, { name: "iPhone 13", brand: "Apple" }))
      .modelId,
    REFERENCE,
  );

  return {
    orgA,
    orgB,
    admin,
    modelId: model.modelId,
    bareModelId: bareModel.modelId,
    productId,
    productB,
    type,
    items,
    item,
  };
}

type Seed = Awaited<ReturnType<typeof seed>>;

// Los valores confirmados, como en «iPhone Demo»: guardar apaga la marca de ejemplo (brief-29.7.3, O-2).
async function confirmSettings(s: Seed) {
  ok(
    await updateQuoteSettings(s.admin.context, {
      batteryThreshold: "80",
      rangePercent: "10",
      roundingStep: "10",
      roundingCurrency: "USD",
      batteryRepairTypeId: s.type("Cambio de batería"),
    }),
  );
}

// La consulta: cada punto activo en passed, salvo los de failing, que van en failed.
function answers(
  s: Seed,
  failing: string[] = [],
  overrides: Record<string, string> = {},
): string {
  const active = s.items.filter((one) => one.isActive);
  const params = new URLSearchParams({
    product_id: s.productId,
    battery_health: "90",
    passed: active
      .filter((one) => !failing.includes(one.name))
      .map((one) => one.id)
      .join(","),
    failed: active
      .filter((one) => failing.includes(one.name))
      .map((one) => one.id)
      .join(","),
    ...overrides,
  });
  return params.toString();
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
let readerB: Credential;
let contextA: Credential;

beforeAll(async () => {
  storedHash = await hashPassword(PASSWORD);
});

beforeEach(async () => {
  await resetDatabase(getDb());
  s = await seed();
  readerA = await credential(s.orgA, "read");
  readerB = await credential(s.orgB, "read");
  contextA = await credential(s.orgA, "context");
  allow(readerA, readerB, contextA);
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

describe(
  "API de lectura v3: la cotización de un usado",
  { timeout: TEST_TIMEOUT },
  () => {
    it("1. AC-1: el checklist activo en su orden, sin el inactivo; sin trade_ins, vacío", async () => {
      ok(
        await setChecklistItemActive(
          s.admin.context,
          s.item("Parlantes"),
          false,
        ),
      );
      const body = await json(
        await v3.checklist(readerA.token),
        tradeInChecklistResponseSchemaV3,
      );
      const expected = s.items
        .filter((one) => one.name !== "Parlantes")
        .map((one) => ({
          item_id: one.id,
          name: one.name,
          mandatory: one.isMandatory,
        }));
      expect(body).toStrictEqual({ contract_version: "3", items: expected });
      expect(body.items.some((one) => one.mandatory)).toBe(true);
      expect(body.items.some((one) => !one.mandatory)).toBe(true);

      expect(
        await json(
          await v3.checklist(readerB.token),
          tradeInChecklistResponseSchemaV3,
        ),
      ).toStrictEqual({ contract_version: "3", items: [] });
    });

    it("2. AC-2 y AC-6: el mismo rango que la pantalla del admin, con el convertido y los nombres", async () => {
      await confirmSettings(s);
      const failing = ["Cámara trasera"];
      const body = await json(
        await v3.quote(
          answers(s, failing, { battery_health: "79" }),
          readerA.token,
        ),
        tradeInQuoteResponseSchemaV3,
      );
      // 523 − 61,17 − 40,29 − 47,13 = 374,41 → 370; piso 336,97 → 330.
      expect(body).toStrictEqual({
        contract_version: "3",
        quote: {
          product: { product_id: s.productId, name: "iPhone 13U" },
          estimate: true,
          range: { low: "330.00", high: "370.00", currency: "USD" },
          range_converted: {
            low: "396000.00",
            high: "444000.00",
            currency: "ARS",
            rate: "1200",
            rate_as_of: expect.stringMatching(/^\d{4}-\d\d-\d\dT.*Z$/),
          },
          repairs: ["Cámara trasera", "Cambio de batería"],
        },
        reason: null,
      });

      const admin = ok(
        await quoteTradeIn(s.admin.context, {
          productId: s.productId,
          batteryHealth: "79",
          passed: s.items
            .filter((one) => !failing.includes(one.name))
            .map((one) => one.id),
        }),
      );
      expect(admin.quote).toMatchObject({
        value: "374.41",
        low: "330.00",
        high: "370.00",
      });

      // La vigente vencida: el rango sigue, sin el convertido.
      const later = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000);
      const stale = await json(
        await v3.quote(answers(s), readerA.token, later),
        tradeInQuoteResponseSchemaV3,
      );
      expect(stale.quote?.range_converted).toBeNull();
      expect(stale.quote?.range.currency).toBe("USD");
    });

    it("2b. AC-2: un piso en cero es cero en las dos monedas", async () => {
      await confirmSettings(s);
      ok(
        await setTradeInMargin(s.admin.context, {
          modelId: s.modelId,
          amount: "512.50",
          currency: "USD",
        }),
      );
      // 523 − 512,50 = 10,50 → 10; piso 9,45 → 0.
      const body = await json(
        await v3.quote(answers(s), readerA.token),
        tradeInQuoteResponseSchemaV3,
      );
      expect(body.quote?.range).toStrictEqual({
        low: "0.00",
        high: "10.00",
        currency: "USD",
      });
      expect(body.quote?.range_converted).toMatchObject({
        low: "0.00",
        high: "12000.00",
      });
      expect(body.quote?.repairs).toEqual([]);
      // El mismo piso y techo que la pantalla del admin (revisión independiente, NB-5).
      expect(
        ok(
          await quoteTradeIn(s.admin.context, {
            productId: s.productId,
            batteryHealth: "90",
            passed: s.items.map((one) => one.id),
          }),
        ).quote,
      ).toMatchObject({ value: "10.50", low: "0.00", high: "10.00" });
    });

    it("3. AC-3 y U-2: cada punto activo respondido; un id ajeno o inactivo se ignora; un obligatorio que falla no se recibe", async () => {
      await confirmSettings(s);
      ok(
        await setChecklistItemActive(
          s.admin.context,
          s.item("Parlantes"),
          false,
        ),
      );
      const active = s.items.filter((one) => one.name !== "Parlantes");
      const missing = active.filter((one) =>
        ["Micrófono", "True Tone"].includes(one.name),
      );
      const incomplete = await json(
        await v3.quote(
          new URLSearchParams({
            product_id: s.productId,
            battery_health: "90",
            // Un id que no es de ningún punto y el del punto inactivo: se ignoran.
            passed: [
              ...active
                .filter((one) => !missing.includes(one))
                .map((one) => one.id),
              UNKNOWN_ID,
              s.item("Parlantes"),
            ].join(","),
          }).toString(),
          readerA.token,
        ),
        tradeInQuoteResponseSchemaV3,
      );
      expect(incomplete).toStrictEqual({
        contract_version: "3",
        quote: null,
        reason: {
          code: "checklist_incomplete",
          item_ids: missing.map((one) => one.id),
        },
      });

      // Con todo respondido, el inactivo afuera y un id ajeno de más, cotiza.
      const answered = await json(
        await v3.quote(
          answers(s, [], {
            passed: [...active.map((one) => one.id), UNKNOWN_ID].join(","),
          }),
          readerA.token,
        ),
        tradeInQuoteResponseSchemaV3,
      );
      expect(answered.quote?.range.high).toBe("470.00");

      const mandatory = s.items.filter((one) => one.isMandatory);
      const notAccepted = await json(
        await v3.quote(
          answers(
            s,
            mandatory.map((one) => one.name),
          ),
          readerA.token,
        ),
        tradeInQuoteResponseSchemaV3,
      );
      expect(notAccepted.reason).toStrictEqual({
        code: "not_accepted",
        items: mandatory.map((one) => one.name),
      });
    });

    it("3b. AC-3 y U-3: los valores de ejemplo, cada motivo fino y la capacidad apagada son not_quotable", async () => {
      const notQuotable = {
        contract_version: "3",
        quote: null,
        reason: { code: "not_quotable" },
      };
      // Los valores del perfil, sin confirmar: el admin cotiza con la marca; el agente, nunca (U-3).
      expect(
        await json(
          await v3.quote(answers(s), readerA.token),
          tradeInQuoteResponseSchemaV3,
        ),
      ).toStrictEqual(notQuotable);
      expect(
        ok(
          await quoteTradeIn(s.admin.context, {
            productId: s.productId,
            batteryHealth: "90",
            passed: s.items.map((one) => one.id),
          }),
        ).quote.usesExample,
      ).toBe(true);
      await confirmSettings(s);

      const noMargin = await unitProduct(
        s.admin,
        s.orgA,
        "12U",
        s.bareModelId,
        "300.00",
      );
      const noPrice = await unitProduct(
        s.admin,
        s.orgA,
        "13SP",
        s.modelId,
        null,
      );
      const newOne = await unitProduct(
        s.admin,
        s.orgA,
        "13N",
        s.modelId,
        "900.00",
        "new",
      );
      for (const query of [
        answers(s, [], { product_id: noMargin }),
        answers(s, [], { product_id: noPrice }),
        answers(s, [], { product_id: newOne }),
        // La cámara frontal no tiene costo para el modelo.
        answers(s, ["Cámara frontal"]),
      ]) {
        expect(
          await json(
            await v3.quote(query, readerA.token),
            tradeInQuoteResponseSchemaV3,
          ),
        ).toStrictEqual(notQuotable);
      }

      // Sin trade_ins: el producto de la otra organización existe, y no se cotiza.
      expect(
        await json(
          await v3.quote(
            `product_id=${s.productB}&battery_health=90`,
            readerB.token,
          ),
          tradeInQuoteResponseSchemaV3,
        ),
      ).toStrictEqual(notQuotable);
    });

    it("3d. AC-8: los puntos de otra organización con trade_ins no se ven ni cuentan", async () => {
      await confirmSettings(s);
      const orgC = await returningId(
        sql`insert into organizations (name, main_currency) values ('iPhone C', 'USD') returning id`,
      );
      const adminC = await member(orgC, "admin-c@example.com");
      await activate(orgC, adminC, "admin-c@example.com");
      const readerC = await credential(orgC, "read");
      allow(readerA, readerC);
      const itemsC = ok(await listChecklistItems(adminC.context)).items;
      expect(itemsC.length).toBeGreaterThan(0);

      // Mismos nombres por la plantilla, otros ids: cada organización ve los suyos.
      const checklistC = await json(
        await v3.checklist(readerC.token),
        tradeInChecklistResponseSchemaV3,
      );
      expect(checklistC.items.map((one) => one.item_id)).toEqual(
        itemsC.map((one) => one.id),
      );
      const idsA = new Set(s.items.map((one) => one.id));
      expect(checklistC.items.some((one) => idsA.has(one.item_id))).toBe(false);

      // Los puntos de C no responden los de A.
      const onlyC = await json(
        await v3.quote(
          answers(s, [], {
            passed: itemsC.map((one) => one.id).join(","),
          }),
          readerA.token,
        ),
        tradeInQuoteResponseSchemaV3,
      );
      expect(onlyC.reason).toStrictEqual({
        code: "checklist_incomplete",
        item_ids: s.items.map((one) => one.id),
      });

      // Un obligatorio de C en failed no rechaza el equipo de A.
      const mandatoryC = itemsC.filter((one) => one.isMandatory);
      expect(mandatoryC.length).toBeGreaterThan(0);
      const quoted = await json(
        await v3.quote(
          answers(s, [], {
            failed: mandatoryC.map((one) => one.id).join(","),
          }),
          readerA.token,
        ),
        tradeInQuoteResponseSchemaV3,
      );
      expect(quoted.reason).toBeNull();
      expect(quoted.quote?.range.high).toBe("470.00");
    });

    it("3c. AC-1 y AC-3: sin trade_ins, el checklist vacío y la cotización not_quotable, aunque los datos sigan", async () => {
      await confirmSettings(s);
      const before = await json(
        await v3.quote(answers(s), readerA.token),
        tradeInQuoteResponseSchemaV3,
      );
      expect(before.quote).not.toBeNull();
      await getDb().execute(
        sql`delete from organization_capabilities
            where organization_id = ${s.orgA} and capability = 'trade_ins'`,
      );
      expect(
        await json(
          await v3.checklist(readerA.token),
          tradeInChecklistResponseSchemaV3,
        ),
      ).toStrictEqual({ contract_version: "3", items: [] });
      expect(
        await json(
          await v3.quote(answers(s), readerA.token),
          tradeInQuoteResponseSchemaV3,
        ),
      ).toStrictEqual({
        contract_version: "3",
        quote: null,
        reason: { code: "not_quotable" },
      });
    });

    it("4. AC-4: los 400 nombran sus campos; un producto ajeno, inexistente, inactivo o de servicio da el mismo 404", async () => {
      await confirmSettings(s);
      const id = s.items[0]!.id;
      for (const [query, fields] of [
        ["battery_health=90", ["product_id"]],
        [`product_id=nope&battery_health=90`, ["product_id"]],
        [`product_id=${s.productId}`, ["battery_health"]],
        [`product_id=${s.productId}&battery_health=101`, ["battery_health"]],
        [`product_id=${s.productId}&battery_health=07`, ["battery_health"]],
        [`product_id=${s.productId}&battery_health=-1`, ["battery_health"]],
        [`product_id=${s.productId}&battery_health=90&passed=x`, ["passed"]],
        [
          `product_id=${s.productId}&battery_health=90&failed=${id},,${UNKNOWN_ID}`,
          ["failed"],
        ],
        [
          `product_id=${s.productId}&battery_health=90&passed=${id}&failed=${id.toUpperCase()}`,
          ["passed", "failed"],
        ],
        [
          `product_id=${s.productId}&battery_health=90&passed=${Array(101).fill(id).join(",")}`,
          ["passed"],
        ],
      ] as const) {
        const body = await rejected(await v3.quote(query, readerA.token), 400);
        expect(body, query).toMatchObject({
          code: "VALIDATION_ERROR",
          fields,
        });
      }

      const serviceId = await returningId(
        sql`select id from products where organization_id = ${s.orgA} and is_service`,
      );
      const inactive = await unitProduct(
        s.admin,
        s.orgA,
        "13I",
        s.modelId,
        "500.00",
      );
      await getDb().execute(
        sql`update products set is_active = false where id = ${inactive}`,
      );
      const bodies: unknown[] = [];
      for (const productId of [UNKNOWN_ID, s.productB, inactive, serviceId]) {
        const body = await rejected(
          await v3.quote(
            answers(s, [], { product_id: productId }),
            readerA.token,
          ),
          404,
        );
        bodies.push({ ...body, request_id: "x" });
      }
      expect(new Set(bodies.map((body) => JSON.stringify(body))).size).toBe(1);
    });

    it("5. AC-5: el cuerpo crudo no lleva el valor exacto, el margen, los costos ni el precio de referencia", async () => {
      await confirmSettings(s);
      const response = await v3.quote(
        answers(s, ["Cámara trasera", "Táctil"], { battery_health: "50" }),
        readerA.token,
      );
      expect(response.status).toBe(200);
      const raw = await response.text();
      // 523 − 61,17 − 90,53 − 40,29 − 47,13 = 283,88.
      for (const hidden of [
        "283.88",
        "283,88",
        REFERENCE,
        MARGIN,
        COST_BATTERY,
        COST_CAMERA,
        COST_SCREEN,
        "margin",
        "cost",
        "value",
        "reference",
        "rounding",
        "percent",
      ]) {
        expect(raw, hidden).not.toContain(hidden);
      }
      expect(JSON.parse(raw).quote.range).toStrictEqual({
        low: "250.00",
        high: "280.00",
        currency: "USD",
      });
    });

    it("6. la cotización no escribe nada: ni filas, ni auditoría", async () => {
      await confirmSettings(s);
      const counts = () =>
        Promise.all(
          [
            sql`select count(*)::int as count from audit_logs`,
            sql`select count(*)::int as count from trade_ins`,
            sql`select count(*)::int as count from trade_in_checklist_results`,
            sql`select count(*)::int as count from trade_in_settings`,
            sql`select count(*)::int as count from trade_in_margins`,
            sql`select count(*)::int as count from product_prices`,
          ].map(count),
        );
      const before = await counts();
      await v3.quote(answers(s, ["Cámara trasera"]), readerA.token);
      await v3.quote(answers(s, ["Toma señal"]), readerA.token);
      await v3.checklist(readerA.token);
      expect(await counts()).toEqual(before);
    });

    it("7. AC-7: alcance read; la allowlist; 401; correlación; límite; apagada, 404 sin cuerpo", async () => {
      await confirmSettings(s);
      const routes = [
        (token: string | null, now = new Date(), headers = {}) =>
          v3.checklist(token, now, headers),
        (token: string | null, now = new Date(), headers = {}) =>
          v3.quote(answers(s), token, now, headers),
      ];
      for (const route of routes) {
        expect((await rejected(await route(contextA.token), 403)).code).toBe(
          "FORBIDDEN",
        );
        const correlated = await route(readerA.token, new Date(), {
          "x-correlation-id": "turno-0298",
        });
        expect(correlated.status).toBe(200);
        expect(correlated.headers.get("x-correlation-id")).toBe("turno-0298");
        expect(correlated.headers.get("cache-control")).toBe("no-store");
        expect(
          await rejected(
            await route(readerA.token, new Date(), {
              "x-correlation-id": "a".repeat(201),
            }),
            400,
          ),
        ).toMatchObject({
          code: "VALIDATION_ERROR",
          fields: ["correlation_id"],
        });
        const unauthenticated = await route(null);
        await rejected(unauthenticated, 401);
        expect(unauthenticated.headers.get("www-authenticate")).toBe("Bearer");
      }

      // El límite es el de las demás lecturas, por credencial, en un minuto de dentro de una hora.
      const minute = new Date(
        Math.floor(Date.now() / 60_000) * 60_000 + 60 * 60_000,
      );
      for (let i = 0; i < INGESTION_RATE_LIMIT; i++) {
        expect((await v3.checklist(readerA.token, minute)).status).toBe(200);
      }
      const limited = await v3.quote(answers(s), readerA.token, minute);
      expect((await rejected(limited, 429)).code).toBe("RATE_LIMITED");
      expect(limited.headers.get("retry-after")).toBe("60");

      allow(readerB);
      for (const route of routes) {
        expect((await rejected(await route(readerA.token), 403)).code).toBe(
          "FORBIDDEN",
        );
      }
      process.env.READ_API_ENABLED = "false";
      for (const route of routes) {
        const off = await route(readerA.token);
        expect(off.status).toBe(404);
        expect(await off.text()).toBe("");
      }
    });

    it("8. AC-7: el log lleva las rutas fijas, nunca el producto, las respuestas ni el token", async () => {
      await confirmSettings(s);
      const lines: string[] = [];
      const capture = (...args: unknown[]) => void lines.push(args.join(" "));
      const spies: MockInstance[] = [
        vi.spyOn(console, "log").mockImplementation(capture),
        vi.spyOn(console, "error").mockImplementation(capture),
        vi.spyOn(console, "warn").mockImplementation(capture),
      ];
      await v3.checklist(readerA.token);
      await v3.quote(answers(s, ["Cámara trasera"]), readerA.token);
      await v3.quote(answers(s, [], { product_id: UNKNOWN_ID }), readerA.token);
      for (const spy of spies) spy.mockRestore();

      const output = lines.join("\n");
      for (const hidden of [
        s.productId,
        UNKNOWN_ID,
        s.item("Cámara trasera"),
        s.item("Micrófono"),
        readerA.token.slice("crm_read_".length),
      ]) {
        expect(output).not.toContain(hidden);
      }
      expect(lines.map((line) => JSON.parse(line).route)).toEqual([
        "/api/read/v3/trade-in-checklist",
        "/api/read/v3/trade-in-quote",
        "/api/read/v3/trade-in-quote",
      ]);
    });
  },
);

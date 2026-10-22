import { sql } from "drizzle-orm";
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
import { handleProductSearch } from "@/app/api/read/v1/products/handler";
import { handleProductSearchV2 } from "@/app/api/read/v2/products/handler";
import { handleCapabilitiesV3 } from "@/app/api/read/v3/capabilities/handler";
import {
  capabilityListResponseSchemaV3,
  productListResponseSchemaV3,
  productResponseSchemaV3,
  productStockResponseSchemaV3,
  unitListResponseSchemaV3,
} from "@/app/api/read/v3/contract";
import {
  handleProductDetailV3,
  handleProductSearchV3,
} from "@/app/api/read/v3/products/handler";
import { handleProductStockV3 } from "@/app/api/read/v3/products/[productId]/stock/handler";
import { handleProductUnitsV3 } from "@/app/api/read/v3/products/[productId]/units/handler";
import { hashPassword, login } from "@/modules/auth";
import {
  applyAttributeTemplate,
  createModel,
  createProduct,
  listAttributes,
  type ProductInput,
  type VariantInput,
} from "@/modules/catalog";
import { createExchangeSettings, recordExchangeRate } from "@/modules/fx";
import {
  createIngestionCredential,
  INGESTION_RATE_LIMIT,
} from "@/modules/ingestion";
import {
  applyGradeTemplate,
  changeProductTracking,
  registerUnit,
  writeOffUnit,
} from "@/modules/inventory";
import {
  activateCapability,
  getAuthContext,
  getProfile,
  setMainCurrency,
  type AuthContext,
} from "@/modules/organizations";
import { getDb } from "@/shared/db";
import { resetDatabase } from "./reset-database";

// La lectura v3, el catálogo del rubro, contra PostgreSQL real (brief-29.8, D-1 a D-6; AC-1 a AC-4,
// AC-8 y AC-9): los usados con su seguimiento, modelo, variante y precio convertido; los filtros; las
// unidades disponibles sin el IMEI ni el costo, en su orden; las capacidades; el convertido null con la
// cotización vencida y sin configuración; cada capacidad apagada; el aislamiento; el borde de v2; y el
// log con las rutas fijas. v1 y v2 siguen sin los usados. Los requests son sintéticos: nada de esto es
// evidencia de integración con el agente.

const BASE = "http://localhost/api/read";
const PASSWORD = "contraseña-correcta-larga";
const TEST_TIMEOUT = 30000;
const UNKNOWN_ID = "9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d";
// El IMEI y el costo de cada unidad: valores que no aparecen en ningún otro campo, para buscarlos en el
// cuerpo crudo (D-8).
const SERIALS = ["356789012345671", "356789012345672", "356789012345673"];
const COST = "317.45";
let storedHash: string;

type Credential = { id: string; token: string };

async function credential(
  organizationId: string,
  scope: "ingest" | "read" | "context",
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

// Las cotizaciones se guardan con la hora real: la lectura usa la misma, salvo que se pida otra.
const v3 = {
  search: (query: string, token: string | null, now = new Date()) =>
    handleProductSearchV3(request(`/v3/products?${query}`, token), now),
  detail: (id: string, token: string | null, now = new Date()) =>
    handleProductDetailV3(request(`/v3/products/${id}`, token), id, now),
  stock: (id: string, token: string | null, now = new Date()) =>
    handleProductStockV3(request(`/v3/products/${id}/stock`, token), id, now),
  units: (
    id: string,
    token: string | null,
    now = new Date(),
    headers: Record<string, string> = {},
  ) =>
    handleProductUnitsV3(
      request(`/v3/products/${id}/units`, token, headers),
      id,
      now,
    ),
  capabilities: (token: string | null, now = new Date()) =>
    handleCapabilitiesV3(request(`/v3/capabilities`, token), now),
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

async function createOrganization(name: string) {
  const result = await getDb().execute<{ id: string }>(
    sql`insert into organizations (name) values (${name}) returning id`,
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

// El negocio de celulares: las dos capacidades con el perfil, USD y ARS con una cotización de 1200.
async function setUpIphone(organizationId: string, adminEmail: string) {
  const profile = getProfile("iphone")!;
  await getDb().transaction(async (tx) => {
    const variants = await activateCapability(tx, {
      organizationId,
      capability: "variants",
      adminEmail,
    });
    if (!variants.ok) throw new Error(variants.code);
    await applyAttributeTemplate(tx, {
      organizationId,
      actorUserId: variants.actorUserId,
      attributes: profile.attributes,
    });
    const units = await activateCapability(tx, {
      organizationId,
      capability: "serialized_units",
      adminEmail,
    });
    if (!units.ok) throw new Error(units.code);
    await applyGradeTemplate(tx, {
      organizationId,
      actorUserId: units.actorUserId,
      grades: profile.grades,
    });
    const fixed = await setMainCurrency(tx, {
      organizationId,
      currency: "USD",
      adminEmail,
    });
    if (!fixed.ok) throw new Error(fixed.code);
    const settings = await createExchangeSettings(tx, {
      organizationId,
      quoteCurrency: "ARS",
      actorUserId: fixed.actorUserId,
    });
    if (!settings.ok) throw new Error("configuración rechazada");
  });
  const admin = await contextFor(adminEmail);
  const rate = await recordExchangeRate(admin, {
    rate: "1200",
    confirmLargeChange: true,
  });
  if (!rate.ok) throw new Error(`cotización rechazada: ${rate.code}`);
  return admin;
}

function productInput(
  sku: string,
  name: string,
  overrides: Partial<ProductInput> = {},
): ProductInput {
  return {
    sku,
    name,
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
  userId: string,
  input: ProductInput,
  price: [string, string] | null,
) {
  const created = await createProduct(context, input);
  if (!created.ok)
    throw new Error(`alta rechazada: ${JSON.stringify(created)}`);
  if (price) {
    await getDb().execute(
      sql`insert into product_prices (organization_id, product_id, amount, currency, created_by)
          values (${context.organizationId}, ${created.productId}, ${price[0]}, ${price[1]}, ${userId})`,
    );
  }
  return created.productId;
}

async function variantOf(
  context: AuthContext,
  modelId: string,
): Promise<VariantInput> {
  const listed = await listAttributes(context);
  if (!listed.ok) throw new Error("atributos rechazados");
  const byKey = (key: string) =>
    listed.definitions.find((definition) => definition.key === key)!;
  const option = (key: string, label: string) =>
    byKey(key).options.find((candidate) => candidate.label === label)!.id;
  return {
    modelId,
    attributes: {
      [byKey("capacidad").id]: option("capacidad", "128 GB"),
      [byKey("color").id]: option("color", "Azul"),
    },
  };
}

async function gradeId(organizationId: string, name: string) {
  const result = await getDb().execute<{ id: string }>(
    sql`select id from unit_grades where organization_id = ${organizationId} and name = ${name}`,
  );
  return result.rows[0]!.id;
}

async function seed() {
  const orgA = await createOrganization("iPhone A");
  const orgB = await createOrganization("Kiosco B");
  const adminAId = await addAdmin(orgA, "admin-a@example.com");
  const adminBId = await addAdmin(orgB, "admin-b@example.com");
  const adminA = await setUpIphone(orgA, "admin-a@example.com");
  const adminB = await contextFor("admin-b@example.com");

  const created = await createModel(adminA, {
    name: "iPhone 13",
    brand: "Apple",
  });
  if (!created.ok) throw new Error("modelo rechazado");
  const otherModel = await createModel(adminA, {
    name: "iPhone 14",
    brand: "Apple",
  });
  if (!otherModel.ok) throw new Error("modelo rechazado");

  // Un iPhone usado por unidad, con su modelo y su variante, a USD 400.
  const phone = await newProduct(
    adminA,
    adminAId,
    {
      ...productInput("IP13-USADO", "iPhone 13 usado", {
        condition: "used",
        brand: "Apple",
      }),
      variant: await variantOf(adminA, created.modelId),
    } as ProductInput,
    ["400.00", "USD"],
  );
  const tracked = await changeProductTracking(adminA, phone, "unit");
  if (!tracked.ok) throw new Error("seguimiento rechazado");
  const register = async (
    serial: string,
    grade: string,
    battery: string,
    price?: string,
  ) => {
    const result = await registerUnit(adminA, phone, {
      serial,
      cost: COST,
      currency: "USD",
      gradeId: await gradeId(orgA, grade),
      batteryHealth: battery,
      ...(price ? { price, priceCurrency: "USD" } : {}),
    });
    if (!result.ok) throw new Error(`unidad rechazada: ${result.code}`);
    return result.unitId;
  };
  const own = await register(SERIALS[0]!, "A", "87", "420");
  const inherited = await register(SERIALS[1]!, "B", "81");
  const gone = await register(SERIALS[2]!, "C", "70");
  const off = await writeOffUnit(adminA, gone, "Pantalla rota");
  if (!off.ok) throw new Error("baja rechazada");

  // Una funda nueva por cantidad, en pesos.
  const cover = await newProduct(
    adminA,
    adminAId,
    productInput("FUNDA-IP13", "Funda iPhone 13"),
    ["12000.00", "ARS"],
  );
  // B no tiene capacidades ni cotización.
  const kiosk = await newProduct(
    adminB,
    adminBId,
    productInput("FUNDA-B", "Funda iPhone de B", {
      condition: "refurbished",
    }),
    ["5000.00", "ARS"],
  );
  return {
    orgA,
    orgB,
    modelId: created.modelId,
    otherModelId: otherModel.modelId,
    phone,
    own,
    inherited,
    gone,
    cover,
    kiosk,
  };
}

function allow(...credentials: Credential[]) {
  process.env.READ_API_ENABLED = "true";
  process.env.READ_API_ALLOWED_CREDENTIALS = credentials
    .map((c) => c.id)
    .join(",");
}

const savedEnv = {
  enabled: process.env.READ_API_ENABLED,
  allowed: process.env.READ_API_ALLOWED_CREDENTIALS,
};

let s: Awaited<ReturnType<typeof seed>>;
let readerA: Credential;
let readerB: Credential;
let contextA: Credential;
let ingestA: Credential;

beforeAll(async () => {
  storedHash = await hashPassword(PASSWORD);
});

beforeEach(async () => {
  await resetDatabase(getDb());
  s = await seed();
  readerA = await credential(s.orgA, "read");
  readerB = await credential(s.orgB, "read");
  contextA = await credential(s.orgA, "context");
  ingestA = await credential(s.orgA, "ingest");
  allow(readerA, readerB, contextA, ingestA);
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
  "API de lectura v3: el catálogo del rubro",
  { timeout: TEST_TIMEOUT },
  () => {
    it("1. AC-1: la búsqueda trae el usado con su seguimiento, modelo, variante y convertido; la funda en pesos se convierte a dólares", async () => {
      const body = await json(
        await v3.search("q=iphone%2013", readerA.token),
        productListResponseSchemaV3,
      );
      const byId = new Map(body.items.map((item) => [item.product_id, item]));
      expect(byId.get(s.phone)).toMatchObject({
        condition: "used",
        tracking: "unit",
        price: { amount: "400.00", currency: "USD" },
        stock_status: "disponible",
        model: { model_id: s.modelId, name: "iPhone 13", brand: "Apple" },
        attributes: [
          { key: "capacidad", name: "Capacidad", value: "128 GB" },
          { key: "color", name: "Color", value: "Azul" },
        ],
        price_converted: CONVERTED("480000.00", "ARS"),
      });
      expect(byId.get(s.cover)).toMatchObject({
        condition: "new",
        tracking: "quantity",
        model: null,
        attributes: [],
        price_converted: CONVERTED("10.00", "USD"),
      });
    });

    it("2. AC-1: los filtros condition y model_id; sin la capacidad, model_id no encuentra nada", async () => {
      const ids = async (query: string, token = readerA.token) =>
        (
          await json(await v3.search(query, token), productListResponseSchemaV3)
        ).items.map((item) => item.product_id);
      expect(await ids("q=iphone&condition=used")).toEqual([s.phone]);
      expect(await ids("q=iphone&condition=new")).toEqual([s.cover]);
      expect(await ids(`q=iphone&model_id=${s.modelId.toUpperCase()}`)).toEqual(
        [s.phone],
      );
      expect(await ids(`q=iphone&model_id=${s.otherModelId}`)).toEqual([]);
      // B no tiene la capacidad variants: su producto aparece sin filtro, y con model_id no.
      expect(await ids("q=funda", readerB.token)).toEqual([s.kiosk]);
      expect(await ids(`q=funda&model_id=${s.modelId}`, readerB.token)).toEqual(
        [],
      );
      for (const [query, field] of [
        ["q=iphone&model_id=no-es-un-id", "model_id"],
        ["q=iphone&condition=broken", "condition"],
        ["q=iphone&condition=", "condition"],
        ["condition=used", "q"],
      ]) {
        expect(
          await rejected(await v3.search(query!, readerA.token), 400),
        ).toMatchObject({ code: "VALIDATION_ERROR", fields: [field] });
      }
    });

    it("3. AC-8: v1 y v2 siguen sin el usado; el detalle y el stock de v3 lo encuentran", async () => {
      for (const handler of [handleProductSearch, handleProductSearchV2]) {
        const response = await handler(
          request("/v2/products?q=iphone", readerA.token),
          new Date(),
        );
        const body = (await response.json()) as {
          items: { product_id: string }[];
        };
        expect(body.items.map((item) => item.product_id)).toEqual([s.cover]);
      }
      expect(
        (
          await json(
            await v3.detail(s.phone, readerA.token),
            productResponseSchemaV3,
          )
        ).product.condition,
      ).toBe("used");
      expect(
        await json(
          await v3.stock(s.phone, readerA.token),
          productStockResponseSchemaV3,
        ),
      ).toStrictEqual({
        contract_version: "3",
        product_id: s.phone,
        quantity_on_hand: "2",
        quantity_reserved: "0",
        quantity_available: "2",
        unit: "unidad",
        stock_status: "disponible",
      });
    });

    it("4. AC-2: las unidades disponibles, de menor a mayor precio, sin el IMEI, el costo ni la dada de baja", async () => {
      const response = await v3.units(s.phone, readerA.token);
      const raw = await response.clone().text();
      const body = await json(response, unitListResponseSchemaV3);
      expect(body).toStrictEqual({
        contract_version: "3",
        product_id: s.phone,
        items: [
          {
            unit_id: s.inherited,
            grade: "B",
            battery_health: 81,
            price: { amount: "400.00", currency: "USD" },
            price_converted: CONVERTED("480000.00", "ARS"),
          },
          {
            unit_id: s.own,
            grade: "A",
            battery_health: 87,
            price: { amount: "420.00", currency: "USD" },
            price_converted: CONVERTED("504000.00", "ARS"),
          },
        ],
      });
      // El cuerpo crudo: ningún IMEI ni el costo de ninguna unidad (D-8).
      for (const hidden of [...SERIALS, COST, s.gone]) {
        expect(raw).not.toContain(hidden);
      }
      // Un producto por cantidad: la lista vacía.
      expect(
        (
          await json(
            await v3.units(s.cover, readerA.token),
            unitListResponseSchemaV3,
          )
        ).items,
      ).toEqual([]);
    });

    it("5. AC-4: el convertido va null con la cotización vencida y sin configuración", async () => {
      const later = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000);
      const detail = await json(
        await v3.detail(s.phone, readerA.token, later),
        productResponseSchemaV3,
      );
      expect(detail.product.price).toEqual({
        amount: "400.00",
        currency: "USD",
      });
      expect(detail.product.price_converted).toBeNull();
      const units = await json(
        await v3.units(s.phone, readerA.token, later),
        unitListResponseSchemaV3,
      );
      expect(units.items.map((unit) => unit.price_converted)).toEqual([
        null,
        null,
      ]);
      expect(
        (
          await json(
            await v3.detail(s.kiosk, readerB.token),
            productResponseSchemaV3,
          )
        ).product.price_converted,
      ).toBeNull();
    });

    it("6. AC-3: las capacidades activas, en el orden del enum; sin ninguna, vacías", async () => {
      expect(
        await json(
          await v3.capabilities(readerA.token),
          capabilityListResponseSchemaV3,
        ),
      ).toStrictEqual({
        contract_version: "3",
        capabilities: ["variants", "serialized_units"],
      });
      expect(
        await json(
          await v3.capabilities(readerB.token),
          capabilityListResponseSchemaV3,
        ),
      ).toStrictEqual({ contract_version: "3", capabilities: [] });
    });

    it("7. un producto inactivo, de servicio, de otra organización o inexistente da el mismo 404 en las tres rutas con id", async () => {
      const service = await getDb().execute<{ id: string }>(
        sql`insert into products (organization_id, sku, name, is_service)
          values (${s.orgA}, 'REPARACION', 'Reparación', true) returning id`,
      );
      const inactive = await getDb().execute<{ id: string }>(
        sql`insert into products (organization_id, sku, name, is_active)
          values (${s.orgA}, 'INA-01', 'Inactivo', false) returning id`,
      );
      for (const id of [
        service.rows[0]!.id,
        inactive.rows[0]!.id,
        s.kiosk,
        UNKNOWN_ID,
      ]) {
        for (const read of [v3.detail, v3.stock, v3.units]) {
          expect(
            (await rejected(await read(id, readerA.token), 404)).code,
          ).toBe("NOT_FOUND");
        }
      }
      for (const read of [v3.detail, v3.stock, v3.units]) {
        expect(
          await rejected(await read("no-es-un-id", readerA.token), 400),
        ).toMatchObject({ code: "VALIDATION_ERROR", fields: ["product_id"] });
      }
      // Y la búsqueda tampoco lo trae.
      expect(
        (
          await json(
            await v3.search("q=reparacion", readerA.token),
            productListResponseSchemaV3,
          )
        ).items,
      ).toEqual([]);
    });

    it("8. AC-9: solo una credencial read en la allowlist; sin credencial, 401; apagada, 404 sin cuerpo; el límite y la correlación", async () => {
      for (const other of [contextA, ingestA]) {
        expect(
          (await rejected(await v3.capabilities(other.token), 403)).code,
        ).toBe("FORBIDDEN");
        expect(
          (await rejected(await v3.units(s.phone, other.token), 403)).code,
        ).toBe("FORBIDDEN");
      }
      allow(readerB);
      expect(
        (await rejected(await v3.units(s.phone, readerA.token), 403)).code,
      ).toBe("FORBIDDEN");
      const unauthenticated = await v3.capabilities(null);
      await rejected(unauthenticated, 401);
      expect(unauthenticated.headers.get("www-authenticate")).toBe("Bearer");

      process.env.READ_API_ENABLED = "false";
      const off = await v3.units(s.phone, readerB.token);
      expect(off.status).toBe(404);
      expect(await off.text()).toBe("");

      // El límite es el de v1 y v2: una lectura de v3 cuenta igual.
      allow(readerA);
      // Al principio de un minuto: la ventana es de un minuto fijo, y Retry-After cuenta lo que falta.
      const now = new Date(Math.floor(Date.now() / 60_000) * 60_000);
      for (let i = 0; i < INGESTION_RATE_LIMIT; i++) {
        expect((await v3.capabilities(readerA.token, now)).status).toBe(200);
      }
      const limited = await v3.units(s.phone, readerA.token, now);
      expect((await rejected(limited, 429)).code).toBe("RATE_LIMITED");
      expect(limited.headers.get("retry-after")).toBe("60");

      allow(readerB);
      const correlated = await v3.units(UNKNOWN_ID, readerB.token, new Date(), {
        "x-correlation-id": "turno-0029",
      });
      expect(correlated.status).toBe(404);
      expect(correlated.headers.get("x-correlation-id")).toBe("turno-0029");
      expect(correlated.headers.get("cache-control")).toBe("no-store");
    });

    // Revisión independiente de la 29.8, H-2. La aplicación no desactiva una capacidad: el test borra
    // sus filas como dueño de la base de prueba, para que una comprobación borrada haga fallar algo.
    it("10. con cada capacidad apagada, su parte no aparece aunque los datos sigan", async () => {
      await getDb().execute(
        sql`delete from organization_capabilities
            where organization_id = ${s.orgA} and capability = 'variants'`,
      );
      const withoutVariants = await json(
        await v3.detail(s.phone, readerA.token),
        productResponseSchemaV3,
      );
      expect(withoutVariants.product.model).toBeNull();
      expect(withoutVariants.product.attributes).toEqual([]);
      expect(
        (
          await json(
            await v3.search(`q=iphone&model_id=${s.modelId}`, readerA.token),
            productListResponseSchemaV3,
          )
        ).items,
      ).toEqual([]);
      expect(
        (
          await json(
            await v3.units(s.phone, readerA.token),
            unitListResponseSchemaV3,
          )
        ).items,
      ).toHaveLength(2);

      await getDb().execute(
        sql`delete from organization_capabilities
            where organization_id = ${s.orgA} and capability = 'serialized_units'`,
      );
      expect(
        (
          await json(
            await v3.units(s.phone, readerA.token),
            unitListResponseSchemaV3,
          )
        ).items,
      ).toEqual([]);
      expect(
        await json(
          await v3.capabilities(readerA.token),
          capabilityListResponseSchemaV3,
        ),
      ).toStrictEqual({ contract_version: "3", capabilities: [] });
    });

    it("9. el log lleva las rutas fijas de v3, nunca el id, la búsqueda ni el token", async () => {
      const lines: string[] = [];
      const capture = (...args: unknown[]) => void lines.push(args.join(" "));
      const spies: MockInstance[] = [
        vi.spyOn(console, "log").mockImplementation(capture),
        vi.spyOn(console, "error").mockImplementation(capture),
        vi.spyOn(console, "warn").mockImplementation(capture),
      ];
      await v3.search("q=iphone-secreto", readerA.token);
      await v3.detail(s.phone, readerA.token);
      await v3.stock(s.phone, readerA.token);
      await v3.units(s.phone, readerA.token);
      await v3.capabilities(readerA.token);
      for (const spy of spies) spy.mockRestore();

      const output = lines.join("\n");
      for (const hidden of [
        s.phone,
        "iphone-secreto",
        readerA.token.slice("crm_read_".length),
      ]) {
        expect(output).not.toContain(hidden);
      }
      expect(lines.map((line) => JSON.parse(line).route)).toEqual([
        "/api/read/v3/products",
        "/api/read/v3/products/{product_id}",
        "/api/read/v3/products/{product_id}/stock",
        "/api/read/v3/products/{product_id}/units",
        "/api/read/v3/capabilities",
      ]);
    });
  },
);

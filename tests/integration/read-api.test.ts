import { createHash, randomBytes } from "node:crypto";
import { sql } from "drizzle-orm";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type MockInstance,
} from "vitest";
import type { z } from "zod";
import {
  businessHoursResponseSchema,
  clientTagListResponseSchema,
  errorResponseSchema,
  knowledgeListResponseSchema,
  productListResponseSchema,
  productResponseSchema,
} from "@/app/api/read/v1/contract";
import { handleBusinessHours } from "@/app/api/read/v1/business-hours/handler";
import { handleClientTagList } from "@/app/api/read/v1/client-tags/handler";
import { handleKnowledgeList } from "@/app/api/read/v1/knowledge/handler";
import {
  handleProductDetail,
  handleProductSearch,
} from "@/app/api/read/v1/products/handler";
import { validateSession } from "@/modules/auth";
import {
  createIngestionCredential,
  INGESTION_RATE_LIMIT,
  revokeIngestionCredential,
} from "@/modules/ingestion";
import { getDb } from "@/shared/db";
import { resetDatabase } from "./reset-database";

// API de lectura v1 contra PostgreSQL real (brief-11.3): el borde (modo de prueba, credencial con
// alcance, allowlist, límite, correlación y log), las lecturas de productos y la de información
// del negocio vigente, con el plan de sus consultas. Los requests son
// sintéticos: no hay consumidor real, y nada de esto es evidencia de integración con el agente.

const BASE = "http://localhost/api/read/v1";
const NOW = new Date("2026-09-24T15:00:00.000Z");
const TEST_TIMEOUT = 30000;
const SOURCE = "agente-whatsapp";

type Credential = { id: string; token: string };

async function credential(
  organizationId: string,
  scope: "ingest" | "read",
  source = SOURCE,
): Promise<Credential> {
  const created = await createIngestionCredential(
    organizationId,
    source,
    scope,
  );
  if (!created.ok) throw new Error("credencial inválida");
  return { id: created.credentialId, token: created.token };
}

function request(
  path: string,
  token: string | null,
  headers: Record<string, string> = {},
): Request {
  return new Request(`${BASE}${path}`, {
    headers: {
      ...(token === null ? {} : { authorization: `Bearer ${token}` }),
      ...headers,
    },
  });
}

function search(
  query: string,
  token: string | null,
  options: { headers?: Record<string, string>; now?: Date } = {},
) {
  return handleProductSearch(
    request(`/products${query}`, token, options.headers),
    options.now ?? NOW,
  );
}

function knowledge(
  query: string,
  token: string | null,
  headers: Record<string, string> = {},
) {
  return handleKnowledgeList(
    request(`/knowledge${query}`, token, headers),
    NOW,
  );
}

function detail(
  productId: string,
  token: string | null,
  headers: Record<string, string> = {},
) {
  return handleProductDetail(
    request(`/products/${productId}`, token, headers),
    productId,
    NOW,
  );
}

// Toda respuesta de éxito pasa el validador estricto del contrato (AC-6).
async function valid<T extends z.ZodType>(
  response: Response,
  schema: T,
): Promise<z.infer<T>> {
  expect(response.status).toBe(200);
  const body = await response.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    throw new Error(`respuesta fuera del contrato: ${parsed.error.message}`);
  }
  return parsed.data;
}

async function rejected(response: Response, status: number) {
  expect(response.status).toBe(status);
  const body = await response.json();
  expect(errorResponseSchema.safeParse(body).success).toBe(true);
  return body as { code: string; fields?: string[] };
}

async function createOrganization(name: string, timezone?: string) {
  const result = await getDb().execute<{ id: string }>(
    timezone
      ? sql`insert into organizations (name, timezone) values (${name}, ${timezone}) returning id`
      : sql`insert into organizations (name) values (${name}) returning id`,
  );
  return result.rows[0]!.id;
}

// El día de hoy en una zona, más un corrimiento, calculado por PostgreSQL como la vigencia.
async function dayIn(timezone: string, offset = 0): Promise<string> {
  const result = await getDb().execute<{ day: string }>(
    sql`select ((now() at time zone ${timezone})::date + ${offset}::int)::text as day`,
  );
  return result.rows[0]!.day;
}

type EntrySeed = {
  title: string;
  category?: string;
  content?: string;
  isActive?: boolean;
  validFrom?: string | null;
  validUntil?: string | null;
};

async function entry(organizationId: string, seed: EntrySeed): Promise<string> {
  const result = await getDb().execute<{ id: string }>(
    sql`insert into knowledge_entries (organization_id, title, category, content, is_active,
          valid_from, valid_until)
        values (${organizationId}, ${seed.title}, ${seed.category ?? "General"},
          ${seed.content ?? "Contenido"}, ${seed.isActive ?? true}, ${seed.validFrom ?? null},
          ${seed.validUntil ?? null})
        returning id`,
  );
  return result.rows[0]!.id;
}

async function createUser(organizationId: string) {
  const user = await getDb().execute<{ id: string }>(
    sql`insert into users (email, password_hash, name)
        values (${`admin-${organizationId}@example.com`}, 'x', 'Admin') returning id`,
  );
  const userId = user.rows[0]!.id;
  await getDb().execute(
    sql`insert into organization_members (organization_id, user_id, role)
        values (${organizationId}, ${userId}, 'admin')`,
  );
  return userId;
}

type ProductSeed = {
  sku: string;
  name: string;
  brand?: string | null;
  category?: string | null;
  description?: string | null;
  condition?: "new" | "refurbished";
  reorderPoint?: string;
  isActive?: boolean;
  quantity?: string | null;
  prices?: [string, string][];
};

async function product(
  organizationId: string,
  userId: string,
  seed: ProductSeed,
): Promise<string> {
  const result = await getDb().execute<{ id: string }>(
    sql`insert into products (organization_id, sku, name, brand, category, description,
          condition, reorder_point, is_active)
        values (${organizationId}, ${seed.sku}, ${seed.name}, ${seed.brand ?? null},
          ${seed.category ?? null}, ${seed.description ?? null}, ${seed.condition ?? "new"},
          ${seed.reorderPoint ?? "0"}, ${seed.isActive ?? true})
        returning id`,
  );
  const id = result.rows[0]!.id;
  if (seed.quantity !== null && seed.quantity !== undefined) {
    await getDb().execute(
      sql`insert into inventories (organization_id, product_id, quantity_on_hand)
          values (${organizationId}, ${id}, ${seed.quantity})`,
    );
  }
  for (const [amount, currency] of seed.prices ?? []) {
    await getDb().execute(
      sql`insert into product_prices (organization_id, product_id, amount, currency, created_by)
          values (${organizationId}, ${id}, ${amount}, ${currency}, ${userId})`,
    );
  }
  return id;
}

// El usuario admin de una organización, autor de los precios sembrados.
async function memberOf(organizationId: string): Promise<string> {
  const users = await getDb().execute<{ id: string }>(
    sql`select user_id as id from organization_members where organization_id = ${organizationId}`,
  );
  return users.rows[0]!.id;
}

async function rateWindows() {
  const result = await getDb().execute<{ total: number }>(
    sql`select coalesce(sum(request_count), 0)::int as total from ingestion_rate_windows`,
  );
  return result.rows[0]!.total;
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

let orgA: string;
let orgB: string;
let readerA: Credential;
let readerB: Credential;
let ingestA: Credential;
let auriculares: string;
let parlante: string;
let inactivo: string;
let deB: string;

beforeEach(async () => {
  await resetDatabase(getDb());
  orgA = await createOrganization("Organización A");
  orgB = await createOrganization("Organización B");
  const userA = await createUser(orgA);
  const userB = await createUser(orgB);

  auriculares = await product(orgA, userA, {
    sku: "AUR-01",
    name: "Auriculares inalámbricos",
    brand: "Sonora",
    category: "Audio",
    description: "Con estuche <b>de carga</b>",
    quantity: "8.000",
    reorderPoint: "2",
    prices: [
      ["1000.00", "ARS"],
      ["1234.50", "ARS"],
    ],
  });
  parlante = await product(orgA, userA, {
    sku: "PAR-02",
    name: "Parlante portátil",
    brand: "Sonora",
    category: "Audio",
    condition: "refurbished",
    quantity: "1.000",
    reorderPoint: "2",
  });
  inactivo = await product(orgA, userA, {
    sku: "AUR-99",
    name: "Auriculares viejos",
    brand: "Sonora",
    isActive: false,
    quantity: "5.000",
  });
  deB = await product(orgB, userB, {
    sku: "AUR-01",
    name: "Auriculares de B",
    brand: "Sonora",
    quantity: "3.000",
    prices: [["300000.00", "CLP"]],
  });

  readerA = await credential(orgA, "read");
  readerB = await credential(orgB, "read");
  ingestA = await credential(orgA, "ingest");
  allow(readerA, readerB, ingestA);
});

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

describe("API de lectura: productos", { timeout: TEST_TIMEOUT }, () => {
  it("1. FR-API-01: busca activos de la organización de la credencial, con precio vigente y estado, sin la cantidad", async () => {
    const body = await valid(
      await search("?q=sonora", readerA.token),
      productListResponseSchema,
    );
    expect(body.items.map((item) => item.sku).sort()).toEqual([
      "AUR-01",
      "PAR-02",
    ]);
    const first = body.items.find((item) => item.sku === "AUR-01")!;
    expect(first).toStrictEqual({
      product_id: auriculares,
      sku: "AUR-01",
      name: "Auriculares inalámbricos",
      description: "Con estuche <b>de carga</b>",
      unit: "unidad",
      brand: "Sonora",
      category: "Audio",
      condition: "new",
      price: { amount: "1234.50", currency: "ARS" },
      stock_status: "disponible",
    });
    const second = body.items.find((item) => item.sku === "PAR-02")!;
    expect(second).toMatchObject({
      product_id: parlante,
      condition: "refurbished",
      price: null,
      stock_status: "bajo_stock",
    });

    // La otra organización ve lo suyo, con el monto en los decimales de su moneda.
    const fromB = await valid(
      await search("?q=auriculares", readerB.token),
      productListResponseSchema,
    );
    expect(fromB.items).toHaveLength(1);
    expect(fromB.items[0]).toMatchObject({
      product_id: deB,
      price: { amount: "300000", currency: "CLP" },
      stock_status: "disponible",
    });
  });

  it("2. FR-API-01: por palabras sin acentos, por SKU exacto primero, por relevancia y con limit", async () => {
    const byWords = await valid(
      await search("?q=INALAMBRICOS%20aur", readerA.token),
      productListResponseSchema,
    );
    expect(byWords.items.map((item) => item.sku)).toEqual(["AUR-01"]);

    // El SKU exacto sale primero aunque otro producto coincida por palabras.
    await product(orgA, await memberOf(orgA), {
      sku: "par-02-b",
      name: "Parlante par-02 repuesto",
      quantity: "0",
    });
    const bySku = await valid(
      await search("?q=par-02", readerA.token),
      productListResponseSchema,
    );
    expect(bySku.items[0]!.sku).toBe("PAR-02");

    // Sin stock registrado ni saldo, sin_stock.
    const repuesto = bySku.items.find((item) => item.sku === "par-02-b");
    expect(repuesto?.stock_status).toBe("sin_stock");

    const limited = await valid(
      await search("?q=sonora&limit=1", readerA.token),
      productListResponseSchema,
    );
    expect(limited.items).toHaveLength(1);
  });

  it("3. FR-API-01: un producto inactivo nunca sale, ni en la búsqueda ni en el detalle", async () => {
    const body = await valid(
      await search("?q=viejos", readerA.token),
      productListResponseSchema,
    );
    expect(body.items).toEqual([]);
    const bySku = await valid(
      await search("?q=AUR-99", readerA.token),
      productListResponseSchema,
    );
    expect(bySku.items).toEqual([]);
  });

  it("4. FR-API-01: el detalle da el producto activo, y 404 igual para inactivo, ajeno o inexistente", async () => {
    const found = await valid(
      await detail(auriculares, readerA.token),
      productResponseSchema,
    );
    expect(found.product).toMatchObject({
      product_id: auriculares,
      price: { amount: "1234.50", currency: "ARS" },
    });
    // Con otras mayúsculas, el id es el mismo.
    const upper = await valid(
      await detail(auriculares.toUpperCase(), readerA.token),
      productResponseSchema,
    );
    expect(upper.product.product_id).toBe(auriculares);

    for (const id of [inactivo, deB, "0b6f3c2e-5a4d-4e8f-9c1b-2a3d4e5f6a7b"]) {
      expect((await rejected(await detail(id, readerA.token), 404)).code).toBe(
        "NOT_FOUND",
      );
    }
    expect(
      await rejected(await detail("no-es-uuid", readerA.token), 400),
    ).toEqual(
      expect.objectContaining({
        code: "VALIDATION_ERROR",
        fields: ["product_id"],
      }),
    );
  });

  it("5. FR-API-01: valida q y limit con 400, y un NUL nunca llega a PostgreSQL", async () => {
    const cases: [string, string[]][] = [
      ["", ["q"]],
      ["?q=", ["q"]],
      ["?q=%20%20", ["q"]],
      [`?q=${"a".repeat(201)}`, ["q"]],
      ["?q=auri%00culares", ["q"]],
      ["?q=auri%0Aculares", ["q"]],
      ["?q=sonora&limit=0", ["limit"]],
      ["?q=sonora&limit=26", ["limit"]],
      ["?q=sonora&limit=diez", ["limit"]],
      ["?limit=0", ["q", "limit"]],
    ];
    for (const [query, fields] of cases) {
      const body = await rejected(await search(query, readerA.token), 400);
      expect(body, query).toStrictEqual({
        code: "VALIDATION_ERROR",
        request_id: expect.any(String),
        fields,
      });
    }
  });

  it("6. FR-API-01: los caracteres de tsquery no producen errores", async () => {
    for (const text of [
      "!sonora",
      "sonora & | :*",
      "'",
      "\\",
      "(",
      "sonora:*A",
    ]) {
      const response = await search(
        `?q=${encodeURIComponent(text)}`,
        readerA.token,
      );
      await valid(response, productListResponseSchema);
    }
  });

  // brief-17.2, D-10 (invariante 1): los campos de operación no llegan al agente, y su búsqueda no
  // encuentra por código de barras. La respuesta con los campos cargados es la misma que sin ellos.
  it("6b. brief-17.2 D-10: los campos de operación no cambian la búsqueda ni el detalle", async () => {
    const before = await valid(
      await search("?q=AUR-01", readerA.token),
      productListResponseSchema,
    );
    const detailBefore = await valid(
      await detail(auriculares, readerA.token),
      productResponseSchema,
    );
    await getDb().execute(
      sql`update products set barcode = ${"7790001000017"}, weight_kg = 0.25, length_cm = 10,
            width_cm = 8, height_cm = 12.5, location = ${"Depósito"}, shelf = ${"A-3"}
          where id = ${auriculares}`,
    );
    expect(
      await valid(
        await search("?q=AUR-01", readerA.token),
        productListResponseSchema,
      ),
    ).toStrictEqual(before);
    expect(
      await valid(
        await detail(auriculares, readerA.token),
        productResponseSchema,
      ),
    ).toStrictEqual(detailBefore);
    const byBarcode = await valid(
      await search("?q=7790001000017", readerA.token),
      productListResponseSchema,
    );
    expect(byBarcode.items).toEqual([]);
  });
});

describe("API de lectura: el borde", { timeout: TEST_TIMEOUT }, () => {
  it("7. FR-API-03: responde 404 sin cuerpo con la API apagada o mal configurada", async () => {
    for (const [enabled, allowed] of [
      [undefined, readerA.id],
      ["false", readerA.id],
      ["si", readerA.id],
      ["true", "no-es-un-uuid"],
    ] as const) {
      if (enabled === undefined) delete process.env.READ_API_ENABLED;
      else process.env.READ_API_ENABLED = enabled;
      process.env.READ_API_ALLOWED_CREDENTIALS = allowed;
      const response = await search("?q=sonora", readerA.token);
      expect(response.status, String(enabled)).toBe(404);
      expect(await response.text()).toBe("");
    }
    // Encender la ingestión no enciende la lectura (D-7).
    delete process.env.READ_API_ENABLED;
    process.env.INGESTION_ENABLED = "true";
    try {
      expect((await search("?q=sonora", readerA.token)).status).toBe(404);
    } finally {
      delete process.env.INGESTION_ENABLED;
    }
    expect(await rateWindows()).toBe(0);
  });

  it("8. FR-API-03: rechaza con 401 a quien no se autentica, sin consumir el límite", async () => {
    const unknown = `crm_read_${randomBytes(32).toString("base64url")}`;
    for (const [name, headers] of [
      ["sin encabezado", {}],
      ["otro esquema", { authorization: `Basic ${readerA.token}` }],
      ["token desconocido", { authorization: `Bearer ${unknown}` }],
      ["token mal formado", { authorization: "Bearer crm_read_x" }],
    ] as const) {
      const response = await search("?q=sonora", null, { headers });
      const body = await rejected(response, 401);
      expect(body.code, name).toBe("UNAUTHENTICATED");
      expect(response.headers.get("www-authenticate"), name).toBe("Bearer");
    }
    expect(await rateWindows()).toBe(0);
  });

  it("9. FR-API-03: rechaza con 403 una credencial revocada, de ingestión o fuera de la allowlist", async () => {
    expect(
      (await rejected(await search("?q=sonora", ingestA.token), 403)).code,
    ).toBe("FORBIDDEN");

    expect(await revokeIngestionCredential(readerA.id)).toBe(true);
    await rejected(await search("?q=sonora", readerA.token), 403);

    allow(readerB);
    const other = await credential(orgA, "read", "otro-emisor");
    await rejected(await search("?q=sonora", other.token), 403);

    expect(await rateWindows()).toBe(0);
  });

  it("10. FR-API-03: una sesión válida del CRM no autentica la API", async () => {
    const token = randomBytes(32).toString("base64url");
    await getDb().execute(
      sql`insert into sessions (id, user_id, expires_at)
          values (${createHash("sha256").update(token).digest("hex")}, ${await memberOf(orgA)},
            now() + interval '1 hour')`,
    );
    expect(await validateSession(token)).not.toBeNull();
    for (const cookie of [
      `crm_session=${token}`,
      `__Host-crm_session=${token}`,
    ]) {
      await rejected(
        await search("?q=sonora", null, { headers: { cookie } }),
        401,
      );
    }
  });

  it("11. FR-API-03: aplica el límite por credencial, con Retry-After, y cada credencial tiene su presupuesto", async () => {
    for (let i = 0; i < INGESTION_RATE_LIMIT; i++) {
      await valid(
        await search("?q=sonora", readerA.token),
        productListResponseSchema,
      );
    }
    const limited = await search("?q=sonora", readerA.token);
    const body = await rejected(limited, 429);
    expect(body.code).toBe("RATE_LIMITED");
    expect(limited.headers.get("retry-after")).toBe("60");

    // Otra credencial no comparte el presupuesto, y la ventana siguiente lo reinicia.
    await valid(
      await search("?q=sonora", readerB.token),
      productListResponseSchema,
    );
    const next = new Date(NOW.getTime() + 60_000);
    await valid(
      await search("?q=sonora", readerA.token, { now: next }),
      productListResponseSchema,
    );
  });

  it("12. FR-API-03: toda respuesta lleva no-store y X-Request-Id, y la correlación vuelve", async () => {
    const responses = [
      await search("?q=sonora", readerA.token),
      await search("?q=", readerA.token),
      await search("?q=sonora", null),
      await detail(deB, readerA.token),
    ];
    for (const response of responses) {
      expect(response.headers.get("cache-control")).toBe("no-store");
      expect(response.headers.get("x-request-id")).toMatch(/^[0-9a-f-]{36}$/);
    }

    const correlated = await search("?q=sonora", readerA.token, {
      headers: { "x-correlation-id": "turno-0001" },
    });
    await valid(correlated, productListResponseSchema);
    expect(correlated.headers.get("x-correlation-id")).toBe("turno-0001");

    // Los espacios de los bordes no llegan: HTTP los recorta del valor de un encabezado, y
    // `Headers` también. Otros caracteres de control no se pueden mandar en un encabezado. Lo
    // que sí llega y se rechaza: una tabulación interna y el largo.
    for (const bad of ["turno\t1", "a".repeat(201)]) {
      const response = await search("?q=sonora", readerA.token, {
        headers: { "x-correlation-id": bad },
      });
      expect(await rejected(response, 400), JSON.stringify(bad)).toEqual(
        expect.objectContaining({ fields: ["correlation_id"] }),
      );
      expect(response.headers.get("x-correlation-id")).toBeNull();
    }
  });

  it("13. FR-API-03: el log registra cada respuesta con ruta fija y correlación, sin token, texto ni id buscados", async () => {
    const lines: string[] = [];
    const capture = (...args: unknown[]) => void lines.push(args.join(" "));
    const spies: MockInstance[] = [
      vi.spyOn(console, "log").mockImplementation(capture),
      vi.spyOn(console, "error").mockImplementation(capture),
      vi.spyOn(console, "warn").mockImplementation(capture),
    ];
    const secret = "cliente-busca-algo-privado";
    const correlation = { "x-correlation-id": "turno-0042" };

    await valid(
      await search(`?q=${secret}`, readerA.token, { headers: correlation }),
      productListResponseSchema,
    );
    await search(`?q=${secret}&limit=99`, readerA.token);
    await valid(
      await detail(auriculares, readerA.token, correlation),
      productResponseSchema,
    );
    await detail(inactivo, readerA.token);
    await search(`?q=${secret}`, ingestA.token);
    await search(`?q=${secret}`, `crm_read_${"a".repeat(43)}`);
    for (const spy of spies) spy.mockRestore();

    const output = lines.join("\n");
    for (const hidden of [
      readerA.token.slice("crm_read_".length),
      ingestA.token.slice("crm_ing_".length),
      "a".repeat(43),
      secret,
      auriculares,
      inactivo,
    ]) {
      expect(output).not.toContain(hidden);
    }
    const events = lines.map((line) => JSON.parse(line));
    expect(
      events.map((e) => [e.route, e.code, e.correlation_id ?? null]),
    ).toEqual([
      ["/api/read/v1/products", "OK", "turno-0042"],
      ["/api/read/v1/products", "VALIDATION_ERROR", null],
      ["/api/read/v1/products/{product_id}", "OK", "turno-0042"],
      ["/api/read/v1/products/{product_id}", "NOT_FOUND", null],
      ["/api/read/v1/products", "FORBIDDEN", null],
      ["/api/read/v1/products", "UNAUTHENTICATED", null],
    ]);
    expect(events[0]).toMatchObject({
      level: "info",
      organization_id: orgA,
      source: SOURCE,
      duration_ms: expect.any(Number),
      request_id: expect.any(String),
    });
  });

  it("14. FR-API-03: un error inesperado responde 500 sin detalles y queda en el log", async () => {
    // Un precio que la escritura nunca deja guardar: centavos en una moneda sin decimales.
    await product(orgA, await memberOf(orgA), {
      sku: "ROTO-1",
      name: "Producto roto",
      prices: [["10.50", "CLP"]],
    });
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});

    const response = await search("?q=roto", readerA.token);
    expect(await rejected(response, 500)).toStrictEqual({
      code: "INTERNAL",
      request_id: expect.any(String),
    });
    expect(errors).toHaveBeenCalledTimes(1);
    expect(JSON.parse(String(errors.mock.calls[0]?.[0]))).toMatchObject({
      route: "/api/read/v1/products",
      code: "INTERNAL",
      error: { name: "Error" },
    });
  });
});

describe(
  "API de lectura: información del negocio",
  { timeout: TEST_TIMEOUT },
  () => {
    const ZONE = "America/Argentina/Buenos_Aires";

    it("15. FR-API-02: devuelve solo las vigentes de la organización, por categoría y título, con las fechas", async () => {
      const today = await dayIn(ZONE);
      await entry(orgA, { title: "Horarios", category: "Atención" });
      const envios = await entry(orgA, {
        title: "Envíos",
        category: "Logística",
        content: "Por correo, en <b>48 h</b>",
        validFrom: today,
        validUntil: today,
      });
      await entry(orgA, {
        title: "Promo de primavera",
        category: "Promociones",
        validFrom: await dayIn(ZONE, 1),
      });
      await entry(orgA, {
        title: "Promo de invierno",
        category: "Promociones",
        validUntil: await dayIn(ZONE, -1),
      });
      await entry(orgA, { title: "Feriado viejo", isActive: false });
      await entry(orgB, { title: "Horarios de B", category: "Atención" });

      const body = await valid(
        await knowledge("", readerA.token),
        knowledgeListResponseSchema,
      );
      expect(body.items.map((item) => item.title)).toEqual([
        "Horarios",
        "Envíos",
      ]);
      // Las dos fechas son inclusivas: una entrada de solo hoy es vigente.
      expect(body.items[1]).toStrictEqual({
        entry_id: envios,
        title: "Envíos",
        category: "Logística",
        content: "Por correo, en <b>48 h</b>",
        valid_from: today,
        valid_until: today,
      });
      expect(body.items[0]).toMatchObject({
        valid_from: null,
        valid_until: null,
      });

      const fromB = await valid(
        await knowledge("", readerB.token),
        knowledgeListResponseSchema,
      );
      expect(fromB.items.map((item) => item.title)).toEqual(["Horarios de B"]);
    });

    it("16. FR-API-02: «hoy» es el de la zona de la organización de la credencial, no el de UTC", async () => {
      // Kiritimati va 14 horas adelante de UTC y Pago Pago, 11 atrás: a cualquier hora, el día de al
      // menos una difiere del de UTC (brief-11.2, AC-3).
      const ahead = await createOrganization("Adelante", "Pacific/Kiritimati");
      const behind = await createOrganization("Atrás", "Pacific/Pago_Pago");
      await entry(ahead, {
        title: "Empieza hoy allá",
        validFrom: await dayIn("Pacific/Kiritimati"),
      });
      await entry(ahead, {
        title: "Empieza mañana allá",
        validFrom: await dayIn("Pacific/Kiritimati", 1),
      });
      await entry(behind, {
        title: "Termina hoy allá",
        validUntil: await dayIn("Pacific/Pago_Pago"),
      });
      await entry(behind, {
        title: "Terminó ayer allá",
        validUntil: await dayIn("Pacific/Pago_Pago", -1),
      });
      const readerAhead = await credential(ahead, "read");
      const readerBehind = await credential(behind, "read");
      allow(readerAhead, readerBehind);

      for (const [reader, expected] of [
        [readerAhead, ["Empieza hoy allá"]],
        [readerBehind, ["Termina hoy allá"]],
      ] as const) {
        const body = await valid(
          await knowledge("", reader.token),
          knowledgeListResponseSchema,
        );
        expect(body.items.map((item) => item.title)).toEqual(expected);
      }
    });

    it("17. FR-API-02: con texto busca por palabras sin acentos, el título primero, solo entre vigentes y con limit", async () => {
      await entry(orgA, {
        title: "Horarios",
        content: "Los domingos no hacemos envíos",
      });
      await entry(orgA, {
        title: "Envíos a domicilio",
        category: "Logística",
        content: "Por correo",
      });
      await entry(orgA, {
        title: "Envíos gratis",
        category: "Promociones",
        validFrom: await dayIn(ZONE, 1),
      });
      await entry(orgA, { title: "Medios de pago" });

      const found = await valid(
        await knowledge("?q=ENVIOS", readerA.token),
        knowledgeListResponseSchema,
      );
      expect(found.items.map((item) => item.title)).toEqual([
        "Envíos a domicilio",
        "Horarios",
      ]);

      const limited = await valid(
        await knowledge("?q=envios&limit=1", readerA.token),
        knowledgeListResponseSchema,
      );
      expect(limited.items.map((item) => item.title)).toEqual([
        "Envíos a domicilio",
      ]);

      const none = await valid(
        await knowledge("?q=garantia", readerA.token),
        knowledgeListResponseSchema,
      );
      expect(none.items).toEqual([]);

      // Un q vacío o de espacios es sin búsqueda, no un error.
      for (const query of ["?q=", "?q=%20%20", "?limit=50"]) {
        const all = await valid(
          await knowledge(query, readerA.token),
          knowledgeListResponseSchema,
        );
        expect(all.items, query).toHaveLength(3);
      }

      for (const text of ["!envios", "envios & | :*", "'", "\\", "("]) {
        await valid(
          await knowledge(`?q=${encodeURIComponent(text)}`, readerA.token),
          knowledgeListResponseSchema,
        );
      }
    });

    it("18. FR-API-02: valida q y limit con 400, y un NUL nunca llega a PostgreSQL", async () => {
      const cases: [string, string[]][] = [
        [`?q=${"a".repeat(201)}`, ["q"]],
        ["?q=env%00ios", ["q"]],
        ["?q=env%0Dios", ["q"]],
        ["?limit=0", ["limit"]],
        ["?limit=51", ["limit"]],
        ["?limit=05", ["limit"]],
        ["?limit=veinte", ["limit"]],
        ["?q=%00&limit=0", ["q", "limit"]],
      ];
      for (const [query, fields] of cases) {
        const body = await rejected(await knowledge(query, readerA.token), 400);
        expect(body, query).toStrictEqual({
          code: "VALIDATION_ERROR",
          request_id: expect.any(String),
          fields,
        });
      }
    });

    it("19. FR-API-03: la ruta tiene el mismo borde, y el log su ruta fija sin el texto buscado", async () => {
      await entry(orgA, { title: "Horarios" });
      const lines: string[] = [];
      const capture = (...args: unknown[]) => void lines.push(args.join(" "));
      const spies: MockInstance[] = [
        vi.spyOn(console, "log").mockImplementation(capture),
        vi.spyOn(console, "error").mockImplementation(capture),
        vi.spyOn(console, "warn").mockImplementation(capture),
      ];
      const secret = "cliente-pregunta-algo-privado";

      const correlated = await knowledge(`?q=${secret}`, readerA.token, {
        "x-correlation-id": "turno-0077",
      });
      await valid(correlated, knowledgeListResponseSchema);
      expect(correlated.headers.get("x-correlation-id")).toBe("turno-0077");
      expect(correlated.headers.get("cache-control")).toBe("no-store");
      await rejected(await knowledge(`?q=${secret}`, ingestA.token), 403);
      await rejected(await knowledge(`?q=${secret}`, null), 401);
      for (const spy of spies) spy.mockRestore();

      const output = lines.join("\n");
      expect(output).not.toContain(secret);
      expect(output).not.toContain(readerA.token.slice("crm_read_".length));
      expect(
        lines.map((line) => {
          const event = JSON.parse(line);
          return [event.route, event.code, event.correlation_id ?? null];
        }),
      ).toEqual([
        ["/api/read/v1/knowledge", "OK", "turno-0077"],
        ["/api/read/v1/knowledge", "FORBIDDEN", null],
        ["/api/read/v1/knowledge", "UNAUTHENTICATED", null],
      ]);

      delete process.env.READ_API_ENABLED;
      const off = await knowledge("", readerA.token);
      expect(off.status).toBe(404);
      expect(await off.text()).toBe("");
    });
  },
);

// El plan de las tres consultas de la API (brief-11.3, D-10; herencia M-6 de la 11.1 y de la
// 11.2). Se captura el SQL que la lectura ejecuta de verdad, con sus parámetros, y se le pide el
// plan a PostgreSQL: así el test mira la consulta del repositorio y no una copia. Las aserciones
// van sobre la condición del índice, no sobre su nombre (vault, «A Mutation Run Must Change What
// the Query Returns», adenda 3).
async function planOf(
  matches: RegExp,
  run: () => Promise<unknown>,
): Promise<string> {
  const client = getDb().$client;
  const spy = vi.spyOn(client, "query");
  let recorded: unknown[][];
  try {
    await run();
  } finally {
    // mockRestore borra las llamadas registradas: se copian antes.
    recorded = spy.mock.calls.map((call) => [...call]);
    spy.mockRestore();
  }
  // drizzle llama query(config, params), con el texto en config.text.
  const calls = recorded.map(([first, second]) => ({
    text: typeof first === "string" ? first : (first as { text: string }).text,
    values: (second as unknown[] | undefined) ?? [],
  }));
  const target = calls.filter((call) => matches.test(call.text));
  expect(target, String(matches)).toHaveLength(1);
  const result = await client.query<{ "QUERY PLAN": string }>(
    `explain ${target[0]!.text}`,
    target[0]!.values,
  );
  return result.rows.map((row) => row["QUERY PLAN"]).join("\n");
}

describe(
  "API de lectura: planes de consulta",
  { timeout: TEST_TIMEOUT },
  () => {
    // Con pocas filas el planificador recorre la tabla sin mirar ningún índice. Los fixtures son
    // sintéticos y su único fin es que el planificador tenga con qué decidir.
    async function volume() {
      const userA = await memberOf(orgA);
      await getDb().execute(
        sql`insert into products (organization_id, sku, name, brand, category)
          select ${orgA}, 'VOL-'||g,
            case when g % 500 = 0 then 'Café molido '||g else 'Producto '||g end,
            'Marca '||(g % 50), 'Categoría '||(g % 20)
          from generate_series(1, 5000) g`,
      );
      await getDb().execute(
        sql`insert into product_prices (organization_id, product_id, amount, currency, created_by)
          select organization_id, id, 100 + k, 'ARS', ${userA}
          from products, generate_series(1, 3) k
          where organization_id = ${orgA}`,
      );
      await getDb().execute(
        sql`insert into knowledge_entries (organization_id, title, category, content)
          select ${orgA}, 'Entrada '||g, 'Categoría '||(g % 20), 'Contenido número '||g
          from generate_series(1, 5000) g`,
      );
      // La lista pendiente de GIN encarece el índice hasta un vacuum (brief-11.1, §Resultados).
      for (const index of [
        "products_search_idx",
        "knowledge_entries_search_idx",
      ]) {
        await getDb().execute(
          sql`select gin_clean_pending_list(${index}::regclass)`,
        );
      }
      for (const table of ["products", "product_prices", "knowledge_entries"]) {
        await getDb().execute(sql.raw(`analyze ${table}`));
      }
    }

    it("20. la búsqueda de productos usa el índice GIN para las palabras y el del SKU para el código", async () => {
      await volume();
      const plan = await planOf(/ts_rank/, async () =>
        valid(
          await search("?q=cafe%20molido", readerA.token),
          productListResponseSchema,
        ),
      );
      expect(plan).toMatch(/Index Cond: \(search @@/);
      expect(plan).toMatch(
        /Index Cond: \(\(organization_id = .*\) AND \(lower\(sku\) = /,
      );
    });

    it("21. el precio vigente de varios productos usa el índice del historial de precios", async () => {
      await volume();
      const plan = await planOf(/distinct on/i, async () =>
        valid(
          await search("?q=cafe%20molido", readerA.token),
          productListResponseSchema,
        ),
      );
      expect(plan).toMatch(
        /Index Cond: \(\(organization_id = .*\) AND \(product_id = ANY /,
      );
    });

    it("22. la búsqueda de información vigente usa el índice GIN", async () => {
      await volume();
      const plan = await planOf(/knowledge_entries/, async () =>
        valid(
          await knowledge("?q=horario%20feriado", readerA.token),
          knowledgeListResponseSchema,
        ),
      );
      expect(plan).toMatch(/Index Cond: \(search @@/);
    });
  },
);

describe(
  "API de lectura: catálogo de etiquetas (brief-16.2, D-7)",
  { timeout: TEST_TIMEOUT },
  () => {
    function clientTags(token: string | null) {
      return handleClientTagList(request("/client-tags", token), NOW);
    }

    async function tag(organizationId: string, name: string, active = true) {
      const result = await getDb().execute<{ id: string }>(
        sql`insert into client_tags (organization_id, name, is_active)
            values (${organizationId}, ${name}, ${active}) returning id`,
      );
      return result.rows[0]!.id;
    }

    it("FR-CLI-11: devuelve las activas de la organización, por nombre, con id y nombre y nada más", async () => {
      const reclamo = await tag(orgA, "Reclamo");
      const interesado = await tag(orgA, "interesado");
      await tag(orgA, "Vieja", false);
      await tag(orgB, "De B");
      // Un cliente con una etiqueta: la respuesta no lo nombra (invariante 6).
      const client = await getDb().execute<{ id: string }>(
        sql`insert into clients (organization_id, display_name, phone_e164)
            values (${orgA}, 'Ana Etiquetada', '+5491155550001') returning id`,
      );
      await getDb().execute(
        sql`insert into client_tag_assignments (organization_id, client_id, tag_id)
            values (${orgA}, ${client.rows[0]!.id}, ${reclamo})`,
      );

      const body = await valid(
        await clientTags(readerA.token),
        clientTagListResponseSchema,
      );
      expect(body).toEqual({
        contract_version: "1",
        items: [
          { tag_id: interesado, name: "interesado" },
          { tag_id: reclamo, name: "Reclamo" },
        ],
      });
      expect(JSON.stringify(body)).not.toMatch(/Ana|5491155550001/);

      const fromB = await valid(
        await clientTags(readerB.token),
        clientTagListResponseSchema,
      );
      expect(fromB.items.map((item) => item.name)).toEqual(["De B"]);
    });

    it("FR-CLI-11: un catálogo vacío es una lista vacía", async () => {
      const body = await valid(
        await clientTags(readerA.token),
        clientTagListResponseSchema,
      );
      expect(body.items).toEqual([]);
    });

    it("FR-CLI-11: exige alcance read: 401 sin token y 403 con ingest o context", async () => {
      await tag(orgA, "Reclamo");
      expect((await rejected(await clientTags(null), 401)).code).toBe(
        "UNAUTHENTICATED",
      );
      expect((await rejected(await clientTags(ingestA.token), 403)).code).toBe(
        "FORBIDDEN",
      );
      const created = await createIngestionCredential(orgA, SOURCE, "context");
      if (!created.ok) throw new Error("credencial inválida");
      allow(readerA, readerB, ingestA, {
        id: created.credentialId,
        token: created.token,
      });
      expect((await rejected(await clientTags(created.token), 403)).code).toBe(
        "FORBIDDEN",
      );
    });

    // Revisión independiente de la 16.2.1, hallazgo 11.
    it("FR-CLI-11: una sesión válida del CRM no autentica la ruta", async () => {
      const token = randomBytes(32).toString("base64url");
      await getDb().execute(
        sql`insert into sessions (id, user_id, expires_at)
            values (${createHash("sha256").update(token).digest("hex")}, ${await memberOf(orgA)},
              now() + interval '1 hour')`,
      );
      expect(await validateSession(token)).not.toBeNull();
      const response = await handleClientTagList(
        request("/client-tags", null, {
          cookie: `__Host-crm_session=${token}`,
        }),
        NOW,
      );
      await rejected(response, 401);
    });

    it("FR-CLI-11: con la API apagada responde 404 sin cuerpo", async () => {
      process.env.READ_API_ENABLED = "false";
      const response = await clientTags(readerA.token);
      expect(response.status).toBe(404);
      expect(await response.text()).toBe("");
    });
  },
);

describe(
  "API de lectura: horario de atención (brief-17.4, D-6; FR-API-10)",
  { timeout: TEST_TIMEOUT },
  () => {
    // Lunes 12/10/2026 a las 09:00 en Buenos Aires (UTC-3): justo en la apertura.
    const MONDAY_OPENING = new Date("2026-10-12T12:00:00.000Z");
    const SPLIT = [
      { opens: "09:00", closes: "13:00" },
      { opens: "16:00", closes: "20:00" },
    ];
    const MORNING = [{ opens: "09:00", closes: "13:00" }];

    function businessHours(
      token: string | null,
      at: Date | null = MONDAY_OPENING,
      headers: Record<string, string> = {},
    ) {
      return handleBusinessHours(
        request("/business-hours", token, headers),
        NOW,
        at,
      );
    }

    // Lunes a viernes cortado, sábado a la mañana, domingo cerrado.
    async function week(organizationId: string) {
      for (const weekday of [1, 2, 3, 4, 5, 6, 7]) {
        const [opens1, closes1, opens2, closes2] =
          weekday <= 5
            ? ["09:00", "13:00", "16:00", "20:00"]
            : weekday === 6
              ? ["09:00", "13:00", null, null]
              : [null, null, null, null];
        await getDb().execute(
          sql`insert into business_hours
                (organization_id, weekday, opens_1, closes_1, opens_2, closes_2)
              values (${organizationId}, ${weekday}, ${opens1}, ${closes1},
                      ${opens2}, ${closes2})`,
        );
      }
    }

    async function exception(
      organizationId: string,
      date: string,
      slot: [string, string] | null,
      reason: string | null,
    ) {
      await getDb().execute(
        sql`insert into business_hour_exceptions
              (organization_id, date, opens_1, closes_1, reason)
            values (${organizationId}, ${date}::date, ${slot?.[0] ?? null},
                    ${slot?.[1] ?? null}, ${reason})`,
      );
    }

    it("FR-API-10: abierto en la apertura, el cierre siguiente, los 7 días con el día especial aplicado, el semanal y los días especiales de 30 días", async () => {
      await week(orgA);
      await exception(orgA, "2026-10-11", null, "Ayer");
      await exception(orgA, "2026-10-14", null, "Feriado");
      await exception(orgA, "2026-10-15", ["10:00", "12:00"], null);
      await exception(orgA, "2026-11-11", null, "A 30 días");
      await exception(orgA, "2026-11-12", null, "A 31 días");

      const body = await valid(
        await businessHours(readerA.token),
        businessHoursResponseSchema,
      );
      expect(body).toEqual({
        contract_version: "1",
        configured: true,
        timezone: "America/Argentina/Buenos_Aires",
        now_local: { date: "2026-10-12", time: "09:00", weekday: 1 },
        open_now: true,
        next_change: { kind: "closes", date: "2026-10-12", time: "13:00" },
        weekly: [
          { weekday: 1, slots: SPLIT },
          { weekday: 2, slots: SPLIT },
          { weekday: 3, slots: SPLIT },
          { weekday: 4, slots: SPLIT },
          { weekday: 5, slots: SPLIT },
          { weekday: 6, slots: MORNING },
          { weekday: 7, slots: [] },
        ],
        days: [
          { date: "2026-10-12", weekday: 1, slots: SPLIT, reason: null },
          { date: "2026-10-13", weekday: 2, slots: SPLIT, reason: null },
          { date: "2026-10-14", weekday: 3, slots: [], reason: "Feriado" },
          {
            date: "2026-10-15",
            weekday: 4,
            slots: [{ opens: "10:00", closes: "12:00" }],
            reason: null,
          },
          { date: "2026-10-16", weekday: 5, slots: SPLIT, reason: null },
          { date: "2026-10-17", weekday: 6, slots: MORNING, reason: null },
          { date: "2026-10-18", weekday: 7, slots: [], reason: null },
        ],
        exceptions: [
          { date: "2026-10-14", slots: [], reason: "Feriado" },
          {
            date: "2026-10-15",
            slots: [{ opens: "10:00", closes: "12:00" }],
            reason: null,
          },
          { date: "2026-11-11", slots: [], reason: "A 30 días" },
        ],
      });
    });

    it("FR-API-10: el sábado después del cierre, cerrado hasta el lunes, y days arranca el sábado", async () => {
      await week(orgA);
      // Sábado 17/10 a las 13:00: el tramo cierra a las 13:00 y el cierre no es inclusivo.
      const body = await valid(
        await businessHours(readerA.token, new Date("2026-10-17T16:00:00Z")),
        businessHoursResponseSchema,
      );
      expect(body).toMatchObject({
        now_local: { date: "2026-10-17", time: "13:00", weekday: 6 },
        open_now: false,
        next_change: { kind: "opens", date: "2026-10-19", time: "09:00" },
      });
      expect(body.days.map((day) => [day.date, day.weekday])).toEqual([
        ["2026-10-17", 6],
        ["2026-10-18", 7],
        ["2026-10-19", 1],
        ["2026-10-20", 2],
        ["2026-10-21", 3],
        ["2026-10-22", 4],
        ["2026-10-23", 5],
      ]);
    });

    it("FR-API-10: sin horario, configured false con la hora del negocio y nada más, aunque haya un día especial; cada organización ve el suyo (invariante 4)", async () => {
      await week(orgA);
      // Un día especial abierto hoy: sin el semanal, igual no afirma que esté abierto.
      await exception(orgB, "2026-10-12", ["08:00", "12:00"], "De B");
      const tokyo = await createOrganization("Organización T", "Asia/Tokyo");
      const readerT = await credential(tokyo, "read");
      allow(readerA, readerB, ingestA, readerT);

      const fromB = await valid(
        await businessHours(readerB.token),
        businessHoursResponseSchema,
      );
      expect(fromB).toEqual({
        contract_version: "1",
        configured: false,
        timezone: "America/Argentina/Buenos_Aires",
        now_local: { date: "2026-10-12", time: "09:00", weekday: 1 },
        open_now: false,
        next_change: null,
        weekly: [],
        days: [],
        exceptions: [],
      });

      // El mismo instante en Tokio son las 21:00 del lunes.
      await week(tokyo);
      const fromT = await valid(
        await businessHours(readerT.token),
        businessHoursResponseSchema,
      );
      expect(fromT).toMatchObject({
        configured: true,
        timezone: "Asia/Tokyo",
        now_local: { date: "2026-10-12", time: "21:00", weekday: 1 },
        open_now: false,
        next_change: { kind: "opens", date: "2026-10-13", time: "09:00" },
      });
      // El día especial de B es el mismo lunes: Tokio no lo ve ni en days ni en exceptions
      // (revisión independiente de la 17.4.1, H-1).
      expect(fromT.days[0]).toEqual({
        date: "2026-10-12",
        weekday: 1,
        slots: SPLIT,
        reason: null,
      });
      expect(fromT.exceptions).toEqual([]);
      expect(JSON.stringify([fromB, fromT])).not.toContain("De B");
    });

    it("FR-API-10: sin el instante fijo, calcula con now() de PostgreSQL en la zona de la organización", async () => {
      await week(orgA);
      const body = await valid(
        await businessHours(readerA.token, null),
        businessHoursResponseSchema,
      );
      expect(body.now_local.date).toBe(
        await dayIn("America/Argentina/Buenos_Aires"),
      );
      expect(body.days[0]!.date).toBe(body.now_local.date);
    });

    it("FR-API-10: exige alcance read: 401 sin token y 403 con ingest o context; la ruta del log es fija", async () => {
      const lines: string[] = [];
      const capture = (...args: unknown[]) => void lines.push(args.join(" "));
      const spies: MockInstance[] = [
        vi.spyOn(console, "log").mockImplementation(capture),
        vi.spyOn(console, "warn").mockImplementation(capture),
      ];
      expect((await rejected(await businessHours(null), 401)).code).toBe(
        "UNAUTHENTICATED",
      );
      expect(
        (await rejected(await businessHours(ingestA.token), 403)).code,
      ).toBe("FORBIDDEN");
      const created = await createIngestionCredential(orgA, SOURCE, "context");
      if (!created.ok) throw new Error("credencial inválida");
      allow(readerA, readerB, ingestA, {
        id: created.credentialId,
        token: created.token,
      });
      expect(
        (await rejected(await businessHours(created.token), 403)).code,
      ).toBe("FORBIDDEN");
      await valid(
        await businessHours(readerA.token, MONDAY_OPENING, {
          "x-correlation-id": "turno-0042:r1:i2",
        }),
        businessHoursResponseSchema,
      );
      for (const spy of spies) spy.mockRestore();
      expect(
        lines
          .map((line) => JSON.parse(line))
          .map((e) => [e.route, e.code, e.correlation_id ?? null]),
      ).toEqual([
        ["/api/read/v1/business-hours", "UNAUTHENTICATED", null],
        ["/api/read/v1/business-hours", "FORBIDDEN", null],
        ["/api/read/v1/business-hours", "FORBIDDEN", null],
        ["/api/read/v1/business-hours", "OK", "turno-0042:r1:i2"],
      ]);
    });

    it("FR-API-10: con la API apagada responde 404 sin cuerpo", async () => {
      process.env.READ_API_ENABLED = "false";
      const response = await businessHours(readerA.token);
      expect(response.status).toBe(404);
      expect(await response.text()).toBe("");
    });
  },
);

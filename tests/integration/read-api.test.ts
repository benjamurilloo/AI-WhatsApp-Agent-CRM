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
  errorResponseSchema,
  productListResponseSchema,
  productResponseSchema,
} from "@/app/api/read/v1/contract";
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
// alcance, allowlist, límite, correlación y log) y las lecturas de productos. Los requests son
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

async function createOrganization(name: string) {
  const result = await getDb().execute<{ id: string }>(
    sql`insert into organizations (name) values (${name}) returning id`,
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

  it("5. valida q y limit con 400, y un NUL nunca llega a PostgreSQL", async () => {
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

  it("6. los caracteres de tsquery no producen errores", async () => {
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

  it("10. una sesión válida del CRM no autentica la API", async () => {
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
      expect((await search("?q=sonora", readerA.token)).status).toBe(200);
    }
    const limited = await search("?q=sonora", readerA.token);
    const body = await rejected(limited, 429);
    expect(body.code).toBe("RATE_LIMITED");
    expect(limited.headers.get("retry-after")).toBe("60");

    // Otra credencial no comparte el presupuesto, y la ventana siguiente lo reinicia.
    expect((await search("?q=sonora", readerB.token)).status).toBe(200);
    const next = new Date(NOW.getTime() + 60_000);
    expect(
      (await search("?q=sonora", readerA.token, { now: next })).status,
    ).toBe(200);
  });

  it("12. toda respuesta lleva no-store y X-Request-Id, y la correlación vuelve", async () => {
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
    expect(correlated.status).toBe(200);
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

    await search(`?q=${secret}`, readerA.token, { headers: correlation });
    await search(`?q=${secret}&limit=99`, readerA.token);
    await detail(auriculares, readerA.token, correlation);
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

  it("14. un error inesperado responde 500 sin detalles y queda en el log", async () => {
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

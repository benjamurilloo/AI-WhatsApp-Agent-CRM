import { createHash, randomBytes } from "node:crypto";
import { sql } from "drizzle-orm";
import {
  afterAll,
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
  productResponseSchema,
  productStockResponseSchema,
} from "@/app/api/read/v1/contract";
import {
  handleProductDetail,
  handleProductSearch,
} from "@/app/api/read/v1/products/handler";
import { handleProductStock } from "@/app/api/read/v1/products/[productId]/stock/handler";
import { validateSession } from "@/modules/auth";
import {
  createIngestionCredential,
  INGESTION_RATE_LIMIT,
  revokeIngestionCredential,
} from "@/modules/ingestion";
import { getDb } from "@/shared/db";
import { resetDatabase } from "./reset-database";

// Cantidad disponible de la API de lectura v1 contra PostgreSQL real (brief-16.6, D-2 a D-5;
// FR-API-09): la cantidad en forma canónica, con su unidad y su estado; el mismo 404 para
// inactivo, ajeno e inexistente; el alcance `read`; el borde; el log sin el id; que no escribe; y
// que las rutas de productos siguen sin la cantidad. Los requests son sintéticos: nada de esto es
// evidencia de integración con el agente.

const BASE = "http://localhost/api/read/v1";
const NOW = new Date("2026-10-08T15:00:00.000Z");
const TEST_TIMEOUT = 30000;
const SOURCE = "agente-whatsapp";
const UNKNOWN_ID = "9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d";

type Credential = { id: string; token: string };

async function credential(
  organizationId: string,
  scope: "ingest" | "read" | "context",
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
) {
  return new Request(`${BASE}${path}`, {
    headers: {
      ...(token === null ? {} : { authorization: `Bearer ${token}` }),
      ...headers,
    },
  });
}

function stock(
  productId: string,
  token: string | null,
  headers: Record<string, string> = {},
) {
  return handleProductStock(
    request(`/products/${productId}/stock`, token, headers),
    productId,
    NOW,
  );
}

// Toda respuesta de éxito pasa el validador estricto del contrato (AC-5).
async function valid(
  response: Response,
): Promise<z.infer<typeof productStockResponseSchema>> {
  expect(response.status).toBe(200);
  const parsed = productStockResponseSchema.safeParse(await response.json());
  if (!parsed.success) {
    throw new Error(`respuesta fuera del contrato: ${parsed.error.message}`);
  }
  return parsed.data;
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

// Sin quantity no hay fila en inventories: el saldo es 0 (D-7 de la 4.3).
async function product(
  organizationId: string,
  seed: {
    sku: string;
    unit?: string;
    reorderPoint?: string;
    isActive?: boolean;
    quantity?: string;
  },
): Promise<string> {
  const result = await getDb().execute<{ id: string }>(
    sql`insert into products (organization_id, sku, name, unit, reorder_point, is_active)
        values (${organizationId}, ${seed.sku}, ${`Producto ${seed.sku}`}, ${seed.unit ?? "unidad"},
          ${seed.reorderPoint ?? "0"}, ${seed.isActive ?? true})
        returning id`,
  );
  const id = result.rows[0]!.id;
  if (seed.quantity !== undefined) {
    await getDb().execute(
      sql`insert into inventories (organization_id, product_id, quantity_on_hand)
          values (${organizationId}, ${id}, ${seed.quantity})`,
    );
  }
  return id;
}

async function writes() {
  const result = await getDb().execute<{
    audit: number;
    events: number;
    movements: number;
    inventories: string;
  }>(
    sql`select (select count(*) from audit_logs)::int as audit,
          (select count(*) from ingestion_events)::int as events,
          (select count(*) from inventory_movements)::int as movements,
          (select string_agg(product_id::text || quantity_on_hand::text, ',' order by product_id)
            from inventories) as inventories`,
  );
  return result.rows[0]!;
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
let contextA: Credential;
let ingestA: Credential;
let auriculares: string;

beforeEach(async () => {
  await resetDatabase(getDb());
  orgA = await createOrganization("Organización A");
  orgB = await createOrganization("Organización B");
  auriculares = await product(orgA, {
    sku: "AUR-01",
    reorderPoint: "3",
    quantity: "12.000",
  });
  readerA = await credential(orgA, "read");
  readerB = await credential(orgB, "read");
  contextA = await credential(orgA, "context");
  ingestA = await credential(orgA, "ingest");
  allow(readerA, readerB, contextA, ingestA);
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

afterAll(async () => {
  await getDb().$client.end();
});

describe(
  "API de lectura: cantidad disponible",
  { timeout: TEST_TIMEOUT },
  () => {
    it("1. FR-API-09: devuelve la cantidad en forma canónica, con su unidad y su estado, y no escribe nada", async () => {
      const before = await writes();
      expect(
        await valid(await stock(auriculares, readerA.token)),
      ).toStrictEqual({
        contract_version: "1",
        product_id: auriculares,
        quantity_available: "12",
        unit: "unidad",
        stock_status: "disponible",
      });
      expect(await writes()).toEqual(before);
    });

    it("2. FR-API-09: decimales, el cero sin fila de inventario y el estado en cada valor, derivado de la misma cantidad", async () => {
      const queso = await product(orgA, {
        sku: "QUE-01",
        unit: "kg",
        reorderPoint: "3",
        quantity: "2.500",
      });
      const cable = await product(orgA, {
        sku: "CAB-01",
        unit: "metro",
        reorderPoint: "1",
        quantity: "0.050",
      });
      const umbral = await product(orgA, {
        sku: "UMB-01",
        reorderPoint: "5",
        quantity: "5.000",
      });
      const agotado = await product(orgA, { sku: "AGO-01", quantity: "0.000" });
      const sinFila = await product(orgA, { sku: "NUE-01", reorderPoint: "2" });

      const read = async (id: string) => {
        const body = await valid(await stock(id, readerA.token));
        return [body.quantity_available, body.unit, body.stock_status];
      };
      expect(await read(queso)).toEqual(["2.5", "kg", "bajo_stock"]);
      expect(await read(cable)).toEqual(["0.05", "metro", "bajo_stock"]);
      expect(await read(umbral)).toEqual(["5", "unidad", "bajo_stock"]);
      expect(await read(agotado)).toEqual(["0", "unidad", "sin_stock"]);
      expect(await read(sinFila)).toEqual(["0", "unidad", "sin_stock"]);
    });

    it("3. FR-API-09: un producto inactivo, de otra organización o inexistente da el mismo 404; un id inválido, 400", async () => {
      const inactivo = await product(orgA, {
        sku: "INA-01",
        isActive: false,
        quantity: "4.000",
      });
      const deB = await product(orgB, { sku: "AUR-01", quantity: "7.000" });

      const bodies = [];
      for (const id of [inactivo, deB, UNKNOWN_ID]) {
        const body = await rejected(await stock(id, readerA.token), 404);
        bodies.push({ ...body, request_id: null });
      }
      expect(bodies).toStrictEqual(
        Array(3).fill({ code: "NOT_FOUND", request_id: null }),
      );

      // Con el mismo SKU, cada organización lee el suyo.
      expect(
        (await valid(await stock(deB, readerB.token))).quantity_available,
      ).toBe("7");
      await rejected(await stock(auriculares, readerB.token), 404);

      for (const id of ["no-es-un-id", `${auriculares}x`, ""]) {
        expect(
          await rejected(await stock(id, readerA.token), 400),
        ).toMatchObject({ code: "VALIDATION_ERROR", fields: ["product_id"] });
      }
    });

    it("4. FR-API-09: solo una credencial read la lee; sin credencial o con un token desconocido, 401", async () => {
      for (const other of [contextA, ingestA]) {
        expect(
          (await rejected(await stock(auriculares, other.token), 403)).code,
        ).toBe("FORBIDDEN");
      }
      // Revocada, o fuera de la allowlist: 403. Ninguno de estos rechazos consume el límite.
      const otra = await credential(orgA, "read", "otro-emisor");
      await rejected(await stock(auriculares, otra.token), 403);
      expect(await revokeIngestionCredential(readerA.id)).toBe(true);
      await rejected(await stock(auriculares, readerA.token), 403);
      expect(await rateWindows()).toBe(0);

      const unauthenticated = await stock(auriculares, null);
      await rejected(unauthenticated, 401);
      expect(unauthenticated.headers.get("www-authenticate")).toBe("Bearer");
      await rejected(
        await stock(auriculares, `crm_read_${"a".repeat(43)}`),
        401,
      );
    });

    it("5. FR-API-09: tiene el borde de la lectura: apagada, límite compartido con los productos, Retry-After y correlación", async () => {
      process.env.READ_API_ENABLED = "false";
      const off = await stock(auriculares, readerA.token);
      expect(off.status).toBe(404);
      expect(await off.text()).toBe("");
      expect(off.headers.get("cache-control")).toBe("no-store");

      allow(readerA, readerB);
      // La mitad del límite por la búsqueda de productos y el resto por esta ruta: es uno solo.
      const half = INGESTION_RATE_LIMIT / 2;
      for (let i = 0; i < half; i++) {
        const searched = await handleProductSearch(
          request("/products?q=producto", readerA.token),
          NOW,
        );
        expect(searched.status).toBe(200);
      }
      for (let i = half; i < INGESTION_RATE_LIMIT; i++) {
        await valid(await stock(auriculares, readerA.token));
      }
      const limited = await stock(auriculares, readerA.token);
      expect((await rejected(limited, 429)).code).toBe("RATE_LIMITED");
      expect(limited.headers.get("retry-after")).toBe("60");

      const correlated = await stock(UNKNOWN_ID, readerB.token, {
        "x-correlation-id": "turno-0007",
      });
      expect(correlated.status).toBe(404);
      expect(correlated.headers.get("x-correlation-id")).toBe("turno-0007");
      expect(correlated.headers.get("cache-control")).toBe("no-store");
      expect(correlated.headers.get("x-request-id")).toMatch(/^[0-9a-f-]{36}$/);
    });

    it("6. FR-API-09: el log lleva la ruta fija y la correlación, nunca el id ni el token", async () => {
      const lines: string[] = [];
      const capture = (...args: unknown[]) => void lines.push(args.join(" "));
      const spies: MockInstance[] = [
        vi.spyOn(console, "log").mockImplementation(capture),
        vi.spyOn(console, "error").mockImplementation(capture),
        vi.spyOn(console, "warn").mockImplementation(capture),
      ];

      await valid(
        await stock(auriculares, readerA.token, {
          "x-correlation-id": "turno-0042",
        }),
      );
      await stock("no-es-un-id", readerA.token);
      await stock(UNKNOWN_ID, readerA.token);
      await stock(auriculares, contextA.token);
      await stock(auriculares, `crm_read_${"a".repeat(43)}`);
      for (const spy of spies) spy.mockRestore();

      const output = lines.join("\n");
      for (const hidden of [
        auriculares,
        UNKNOWN_ID,
        "no-es-un-id",
        readerA.token.slice("crm_read_".length),
        contextA.token.slice("crm_ctx_".length),
        "a".repeat(43),
      ]) {
        expect(output).not.toContain(hidden);
      }
      const events = lines.map((line) => JSON.parse(line));
      const route = "/api/read/v1/products/{product_id}/stock";
      expect(
        events.map((e) => [e.route, e.code, e.correlation_id ?? null]),
      ).toEqual([
        [route, "OK", "turno-0042"],
        [route, "VALIDATION_ERROR", null],
        [route, "NOT_FOUND", null],
        [route, "FORBIDDEN", null],
        [route, "UNAUTHENTICATED", null],
      ]);
      expect(events[0]).toMatchObject({
        level: "info",
        organization_id: orgA,
        source: SOURCE,
        request_id: expect.any(String),
      });
    });

    it("7. FR-API-09: una sesión válida del CRM no autentica la ruta", async () => {
      const user = await getDb().execute<{ id: string }>(
        sql`insert into users (email, password_hash, name)
            values ('admin-a@example.com', 'x', 'Admin') returning id`,
      );
      await getDb().execute(
        sql`insert into organization_members (organization_id, user_id, role)
            values (${orgA}, ${user.rows[0]!.id}, 'admin')`,
      );
      const token = randomBytes(32).toString("base64url");
      await getDb().execute(
        sql`insert into sessions (id, user_id, expires_at)
            values (${createHash("sha256").update(token).digest("hex")}, ${user.rows[0]!.id},
              now() + interval '1 hour')`,
      );
      expect(await validateSession(token)).not.toBeNull();
      for (const cookie of [
        `crm_session=${token}`,
        `__Host-crm_session=${token}`,
      ]) {
        const response = await stock(auriculares, null, { cookie });
        expect((await rejected(response, 401)).code).toBe("UNAUTHENTICATED");
      }
    });

    it("8. FR-API-09, invariante 1: las rutas de productos siguen sin la cantidad", async () => {
      const detail = await handleProductDetail(
        request(`/products/${auriculares}`, readerA.token),
        auriculares,
        NOW,
      );
      expect(detail.status).toBe(200);
      const body = await detail.json();
      expect(productResponseSchema.safeParse(body).success).toBe(true);
      expect(JSON.stringify(body)).not.toContain("quantity");
      expect(JSON.stringify(body)).not.toMatch(/"12(\.0+)?"/);

      const searched = await handleProductSearch(
        request("/products?q=AUR-01", readerA.token),
        NOW,
      );
      expect(JSON.stringify(await searched.json())).not.toContain("quantity");
    });
  },
);

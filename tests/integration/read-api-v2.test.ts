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
import {
  productListResponseSchemaV2,
  productResponseSchemaV2,
  productStockResponseSchemaV2,
} from "@/app/api/read/v2/contract";
import {
  handleProductDetailV2,
  handleProductSearchV2,
} from "@/app/api/read/v2/products/handler";
import { handleProductStockV2 } from "@/app/api/read/v2/products/[productId]/stock/handler";
import {
  createIngestionCredential,
  INGESTION_RATE_LIMIT,
} from "@/modules/ingestion";
import { getDb } from "@/shared/db";
import { resetDatabase } from "./reset-database";

// Lectura v2 de productos contra PostgreSQL real (brief-19.4, D-12; AC-7): el estado de stock sale de
// lo disponible (el saldo físico menos lo reservado) en las tres rutas, y la del stock entrega los
// tres números; el producto tiene la forma de v1; el mismo 404 para inactivo, ajeno e inexistente;
// el alcance read; el borde de v1, con el límite compartido; el log con la ruta fija; y la v1 sigue
// con el saldo físico. Los requests son sintéticos: nada de esto es evidencia de integración.

const BASE = "http://localhost/api/read";
const NOW = new Date("2026-10-11T15:00:00.000Z");
const TEST_TIMEOUT = 30000;
const SOURCE = "agente-whatsapp";
const UNKNOWN_ID = "9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d";

type Credential = { id: string; token: string };

async function credential(
  organizationId: string,
  scope: "ingest" | "read" | "context",
): Promise<Credential> {
  const created = await createIngestionCredential(
    organizationId,
    SOURCE,
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

const v2 = {
  stock: (id: string, token: string | null, headers = {}) =>
    handleProductStockV2(
      request(`/v2/products/${id}/stock`, token, headers),
      id,
      NOW,
    ),
  detail: (id: string, token: string | null) =>
    handleProductDetailV2(request(`/v2/products/${id}`, token), id, NOW),
  search: (q: string, token: string | null) =>
    handleProductSearchV2(
      request(`/v2/products?q=${encodeURIComponent(q)}`, token),
      NOW,
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

async function createOrganization(name: string) {
  const result = await getDb().execute<{ id: string }>(
    sql`insert into organizations (name) values (${name}) returning id`,
  );
  return result.rows[0]!.id;
}

async function product(
  organizationId: string,
  seed: {
    sku: string;
    unit?: string;
    reorderPoint?: string;
    isActive?: boolean;
    onHand?: string;
    reserved?: string;
  },
): Promise<string> {
  const result = await getDb().execute<{ id: string }>(
    sql`insert into products (organization_id, sku, name, unit, reorder_point, is_active)
        values (${organizationId}, ${seed.sku}, ${`Producto ${seed.sku}`}, ${seed.unit ?? "unidad"},
          ${seed.reorderPoint ?? "0"}, ${seed.isActive ?? true})
        returning id`,
  );
  const id = result.rows[0]!.id;
  if (seed.onHand !== undefined) {
    await getDb().execute(
      sql`insert into inventories (organization_id, product_id, quantity_on_hand, quantity_reserved)
          values (${organizationId}, ${id}, ${seed.onHand}, ${seed.reserved ?? "0"})`,
    );
  }
  return id;
}

async function writes() {
  const result = await getDb().execute<{ audit: number; snapshot: string }>(
    sql`select (select count(*) from audit_logs)::int as audit,
          (select string_agg(product_id::text || quantity_on_hand::text || quantity_reserved::text,
             ',' order by product_id) from inventories) as snapshot`,
  );
  return result.rows[0]!;
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
  // 10 físicas, 8 reservadas y punto de reposición 5: el físico dice disponible y lo disponible,
  // bajo_stock.
  auriculares = await product(orgA, {
    sku: "AUR-01",
    reorderPoint: "5",
    onHand: "10.000",
    reserved: "8.000",
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
  "API de lectura v2: productos con lo disponible",
  { timeout: TEST_TIMEOUT },
  () => {
    it("1. D-12: el stock trae el físico, lo reservado y lo disponible, con el estado de lo disponible, y no escribe nada", async () => {
      const before = await writes();
      expect(
        await json(
          await v2.stock(auriculares, readerA.token),
          productStockResponseSchemaV2,
        ),
      ).toStrictEqual({
        contract_version: "2",
        product_id: auriculares,
        quantity_on_hand: "10",
        quantity_reserved: "8",
        quantity_available: "2",
        unit: "unidad",
        stock_status: "bajo_stock",
      });
      expect(await writes()).toEqual(before);
    });

    it("2. D-12: decimales, todo reservado, sin reservas y sin fila de inventario", async () => {
      const queso = await product(orgA, {
        sku: "QUE-01",
        unit: "kg",
        reorderPoint: "1",
        onHand: "2.500",
        reserved: "0.250",
      });
      const todo = await product(orgA, {
        sku: "TOD-01",
        onHand: "3.000",
        reserved: "3.000",
      });
      const libre = await product(orgA, { sku: "LIB-01", onHand: "4.000" });
      const sinFila = await product(orgA, { sku: "NUE-01" });

      const read = async (id: string) => {
        const body = await json(
          await v2.stock(id, readerA.token),
          productStockResponseSchemaV2,
        );
        return [
          body.quantity_on_hand,
          body.quantity_reserved,
          body.quantity_available,
          body.unit,
          body.stock_status,
        ];
      };
      expect(await read(queso)).toEqual([
        "2.5",
        "0.25",
        "2.25",
        "kg",
        "disponible",
      ]);
      expect(await read(todo)).toEqual(["3", "3", "0", "unidad", "sin_stock"]);
      expect(await read(libre)).toEqual([
        "4",
        "0",
        "4",
        "unidad",
        "disponible",
      ]);
      expect(await read(sinFila)).toEqual([
        "0",
        "0",
        "0",
        "unidad",
        "sin_stock",
      ]);
    });

    it("3. D-12: la búsqueda y el detalle tienen la forma de v1, con el estado de lo disponible; la v1 sigue con el físico", async () => {
      const detailV2 = await json(
        await v2.detail(auriculares, readerA.token),
        productResponseSchemaV2,
      );
      const searchV2 = await json(
        await v2.search("AUR-01", readerA.token),
        productListResponseSchemaV2,
      );
      expect(detailV2.product.stock_status).toBe("bajo_stock");
      expect(searchV2.items).toEqual([detailV2.product]);
      expect(JSON.stringify(detailV2)).not.toContain("quantity");

      const detailV1 = await handleProductDetail(
        request(`/v1/products/${auriculares}`, readerA.token),
        auriculares,
        NOW,
      );
      const bodyV1 = await detailV1.json();
      expect(productResponseSchema.safeParse(bodyV1).success).toBe(true);
      expect(bodyV1).toEqual({
        contract_version: "1",
        product: { ...detailV2.product, stock_status: "disponible" },
      });
      const stockV1 = await handleProductStock(
        request(`/v1/products/${auriculares}/stock`, readerA.token),
        auriculares,
        NOW,
      );
      const stockBodyV1 = await stockV1.json();
      expect(productStockResponseSchema.safeParse(stockBodyV1).success).toBe(
        true,
      );
      expect(stockBodyV1).toMatchObject({
        quantity_available: "10",
        stock_status: "disponible",
      });
    });

    it("4. un producto inactivo, de otra organización o inexistente da el mismo 404; un id o una búsqueda inválidos, 400", async () => {
      const inactivo = await product(orgA, {
        sku: "INA-01",
        isActive: false,
        onHand: "4.000",
      });
      const deB = await product(orgB, { sku: "AUR-01", onHand: "7.000" });
      for (const id of [inactivo, deB, UNKNOWN_ID]) {
        for (const read of [v2.stock, v2.detail]) {
          expect({
            ...(await rejected(await read(id, readerA.token), 404)),
            request_id: null,
          }).toStrictEqual({ code: "NOT_FOUND", request_id: null });
        }
      }
      for (const read of [v2.stock, v2.detail]) {
        expect(
          await rejected(await read("no-es-un-id", readerA.token), 400),
        ).toMatchObject({ code: "VALIDATION_ERROR", fields: ["product_id"] });
      }
      expect(
        await rejected(await v2.search("", readerA.token), 400),
      ).toMatchObject({
        code: "VALIDATION_ERROR",
        fields: ["q"],
      });
    });

    it("5. solo una credencial read lee la v2; sin credencial, 401", async () => {
      for (const other of [contextA, ingestA]) {
        for (const read of [v2.stock, v2.detail]) {
          expect(
            (await rejected(await read(auriculares, other.token), 403)).code,
          ).toBe("FORBIDDEN");
        }
      }
      // Revisión independiente, R-4: una credencial read fuera de la allowlist, en las tres rutas.
      allow(readerB);
      expect(
        (await rejected(await v2.stock(auriculares, readerA.token), 403)).code,
      ).toBe("FORBIDDEN");
      expect(
        (await rejected(await v2.detail(auriculares, readerA.token), 403)).code,
      ).toBe("FORBIDDEN");
      expect(
        (await rejected(await v2.search("AUR-01", readerA.token), 403)).code,
      ).toBe("FORBIDDEN");
      const unauthenticated = await v2.stock(auriculares, null);
      await rejected(unauthenticated, 401);
      expect(unauthenticated.headers.get("www-authenticate")).toBe("Bearer");
    });

    it("6. el borde de v1: apagada, límite compartido entre v1 y v2, Retry-After y correlación", async () => {
      process.env.READ_API_ENABLED = "false";
      const off = await v2.stock(auriculares, readerA.token);
      expect(off.status).toBe(404);
      expect(await off.text()).toBe("");

      allow(readerA, readerB);
      const half = INGESTION_RATE_LIMIT / 2;
      for (let i = 0; i < half; i++) {
        const searched = await handleProductSearch(
          request("/v1/products?q=producto", readerA.token),
          NOW,
        );
        expect(searched.status).toBe(200);
      }
      for (let i = half; i < INGESTION_RATE_LIMIT; i++) {
        expect((await v2.stock(auriculares, readerA.token)).status).toBe(200);
      }
      const limited = await v2.detail(auriculares, readerA.token);
      expect((await rejected(limited, 429)).code).toBe("RATE_LIMITED");
      expect(limited.headers.get("retry-after")).toBe("60");

      const correlated = await v2.stock(UNKNOWN_ID, readerB.token, {
        "x-correlation-id": "turno-0019",
      });
      expect(correlated.status).toBe(404);
      expect(correlated.headers.get("x-correlation-id")).toBe("turno-0019");
      expect(correlated.headers.get("cache-control")).toBe("no-store");
    });

    it("7. el log lleva las rutas fijas de v2, nunca el id, la búsqueda ni el token", async () => {
      const lines: string[] = [];
      const capture = (...args: unknown[]) => void lines.push(args.join(" "));
      const spies: MockInstance[] = [
        vi.spyOn(console, "log").mockImplementation(capture),
        vi.spyOn(console, "error").mockImplementation(capture),
        vi.spyOn(console, "warn").mockImplementation(capture),
      ];
      await v2.stock(auriculares, readerA.token);
      await v2.detail(UNKNOWN_ID, readerA.token);
      await v2.search("auriculares-secretos", readerA.token);
      for (const spy of spies) spy.mockRestore();

      const output = lines.join("\n");
      for (const hidden of [
        auriculares,
        UNKNOWN_ID,
        "auriculares-secretos",
        readerA.token.slice("crm_read_".length),
      ]) {
        expect(output).not.toContain(hidden);
      }
      expect(lines.map((line) => JSON.parse(line).route)).toEqual([
        "/api/read/v2/products/{product_id}/stock",
        "/api/read/v2/products/{product_id}",
        "/api/read/v2/products",
      ]);
    });
  },
);

import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { isReadCredentialAllowed, readReadApiConfig } from "./config";
import {
  contractAmount,
  errorResponseSchema,
  parseLimit,
  parseQuery,
  productListResponseSchema,
  productResponseSchema,
  productSchema,
} from "./contract";

// Partes puras de la API de lectura v1 (brief-11.3): parámetros, montos, validador y modo de
// prueba. Las respuestas reales se validan en tests/integration/read-api.test.ts.

const CREDENTIAL = "3f1c8a52-7d3e-4b61-9a0f-2c4d5e6f7a8b";

const PRODUCT = {
  product_id: "0b6f3c2e-5a4d-4e8f-9c1b-2a3d4e5f6a7b",
  sku: "AUR-01",
  name: "Auriculares",
  description: null,
  unit: "unidad",
  brand: "Sonora",
  category: "Audio",
  condition: "new",
  price: { amount: "1234.50", currency: "ARS" },
  stock_status: "disponible",
};

describe("q (FR-API-01)", () => {
  it("recorta, exige texto donde es obligatorio y admite ausencia donde no", () => {
    expect(parseQuery("  auriculares  ", { required: true })).toEqual({
      ok: true,
      value: "auriculares",
    });
    for (const raw of [null, "", "   "]) {
      expect(parseQuery(raw, { required: true }), String(raw)).toEqual({
        ok: false,
        field: "q",
      });
      expect(parseQuery(raw, { required: false }), String(raw)).toEqual({
        ok: true,
        value: null,
      });
    }
  });

  it("rechaza más de 200 caracteres, un NUL, otros caracteres de control y un surrogate suelto", () => {
    expect(parseQuery("a".repeat(200), { required: true }).ok).toBe(true);
    for (const raw of [
      "a".repeat(201),
      "auri\u0000culares",
      "auri\nculares",
      "auri\u007fculares",
      "auri\ud800culares",
    ]) {
      expect(parseQuery(raw, { required: true }), JSON.stringify(raw)).toEqual({
        ok: false,
        field: "q",
      });
    }
  });

  it("deja pasar los caracteres de tsquery: el escape es de la búsqueda compartida", () => {
    expect(parseQuery("!pago & 'x' | y:*", { required: true }).ok).toBe(true);
  });
});

describe("limit", () => {
  const range = { defaultLimit: 10, maxLimit: 25 };

  it("usa el valor por defecto sin parámetro y acepta de 1 al máximo", () => {
    expect(parseLimit(null, range)).toEqual({ ok: true, value: 10 });
    expect(parseLimit("1", range)).toEqual({ ok: true, value: 1 });
    expect(parseLimit("25", range)).toEqual({ ok: true, value: 25 });
  });

  it("rechaza cero, el máximo más uno, signos, decimales, ceros de relleno y texto", () => {
    for (const raw of ["", "0", "26", "-1", "+5", "5.0", "05", "1e1", "diez"]) {
      expect(parseLimit(raw, range), raw).toEqual({
        ok: false,
        field: "limit",
      });
    }
  });
});

describe("monto del contrato", () => {
  it("escribe los decimales de la moneda, nunca los de la base", () => {
    expect(contractAmount("1234.50", "ARS")).toBe("1234.50");
    expect(contractAmount("300000.00", "CLP")).toBe("300000");
    expect(contractAmount("5.00", "USD")).toBe("5.00");
  });

  it("falla si una moneda sin decimales trae centavos, en vez de redondear", () => {
    expect(() => contractAmount("300000.50", "CLP")).toThrow();
  });
});

describe("validador estricto (D-8)", () => {
  it("acepta un producto del contrato, con o sin precio", () => {
    expect(productSchema.safeParse(PRODUCT).success).toBe(true);
    expect(productSchema.safeParse({ ...PRODUCT, price: null }).success).toBe(
      true,
    );
  });

  it("rechaza un campo de más, la cantidad en stock y un monto como número", () => {
    for (const product of [
      { ...PRODUCT, is_active: true },
      { ...PRODUCT, quantity_on_hand: "3.000" },
      { ...PRODUCT, price: { amount: 1234.5, currency: "ARS" } },
      { ...PRODUCT, price: { ...PRODUCT.price, id: "x" } },
      { ...PRODUCT, stock_status: "available" },
    ]) {
      expect(
        productSchema.safeParse(product).success,
        JSON.stringify(product),
      ).toBe(false);
    }
    expect(
      productListResponseSchema.safeParse({
        contract_version: "1",
        items: [PRODUCT],
        total: 1,
      }).success,
    ).toBe(false);
  });
});

describe("modo de prueba de la lectura (D-7)", () => {
  it("está apagado por defecto, con false, y no lo encienden las variables de ingestión", () => {
    for (const env of [
      {},
      { READ_API_ENABLED: "false" },
      {
        INGESTION_ENABLED: "true",
        INGESTION_ALLOWED_CREDENTIALS: CREDENTIAL,
      },
    ]) {
      expect(readReadApiConfig(env), JSON.stringify(env)).toEqual({
        enabled: false,
        invalid: false,
      });
    }
  });

  it("se apaga y se marca inválido con un valor desconocido o un id que no es UUID", () => {
    for (const env of [
      { READ_API_ENABLED: "1" },
      { READ_API_ENABLED: "TRUE" },
      {
        READ_API_ENABLED: "true",
        READ_API_ALLOWED_CREDENTIALS: `${CREDENTIAL},otro`,
      },
    ]) {
      expect(readReadApiConfig(env), JSON.stringify(env)).toEqual({
        enabled: false,
        invalid: true,
      });
    }
  });

  it("encendida, solo acepta las credenciales listadas, sin distinguir mayúsculas", () => {
    const config = readReadApiConfig({
      READ_API_ENABLED: "true",
      READ_API_ALLOWED_CREDENTIALS: ` ${CREDENTIAL.toUpperCase()} ,`,
    });
    if (!config.enabled) throw new Error("debería estar encendida");
    expect(isReadCredentialAllowed(config, CREDENTIAL)).toBe(true);
    expect(
      isReadCredentialAllowed(config, "0b6f3c2e-5a4d-4e8f-9c1b-2a3d4e5f6a7b"),
    ).toBe(false);
  });
});

describe("fixtures del contrato (D-8)", () => {
  const dir = path.join(process.cwd(), "tests/fixtures/read/v1");
  const files = readdirSync(dir).filter((file) => file.endsWith(".json"));

  it("existen", () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it.each(files)("%s tiene forma asumida y pasa el validador", (file) => {
    const data = JSON.parse(readFileSync(path.join(dir, file), "utf8"));
    expect(data.shape).toBe("assumed");
    const { status, body } = data.response;
    const schema =
      status !== 200
        ? errorResponseSchema
        : "items" in body
          ? productListResponseSchema
          : productResponseSchema;
    const parsed = schema.safeParse(body);
    expect(parsed.success, parsed.error?.message).toBe(true);
  });
});

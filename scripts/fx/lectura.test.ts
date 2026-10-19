import { describe, expect, it } from "vitest";
import {
  DOLARAPI_BLUE_URL,
  extractVenta,
  fetchReading,
  runReader,
  type FetchLike,
  type ReaderDatabase,
} from "./lectura.ts";

// La lectura de DolarAPI sin red ni base (brief-29.4.2, D-6 y D-13): la venta se toma del texto
// crudo, la respuesta se valida, y el código de salida dice si algo falló.

const body = (venta: string, extra = "") =>
  `{"moneda":"USD","casa":"blue","nombre":"Blue","compra":1535,"venta":${venta},"fechaActualizacion":"2026-10-19T12:57:00.000Z"${extra}}`;

function respond(
  text: string | null,
  status = 200,
  seen: { url?: string; init?: Parameters<FetchLike>[1] } = {},
): FetchLike {
  return async (url, init) => {
    seen.url = url;
    seen.init = init;
    if (text === null) throw new TypeError("fetch failed");
    return {
      ok: status >= 200 && status < 300,
      status,
      body: new Response(text).body,
    };
  };
}

describe("extractVenta", () => {
  it.each([
    ["1555", "1555"],
    ["1555.5", "1555.5"],
    ["1555.123456", "1555.123456"],
  ])("toma %s del texto, sin pasar por number", (venta, expected) => {
    expect(extractVenta(body(venta))).toBe(expected);
  });

  it.each([
    ["con siete decimales", body("1555.1234567")],
    ["negativa", body("-1555")],
    ["con exponente", body("1.555e3")],
    ["como texto", body('"1555"')],
    ["con diez dígitos", body("1234567890")],
    ["ausente", `{"moneda":"USD","casa":"blue"}`],
    ["repetida", body("1555", ',"otra":{"venta":1600}')],
    // B-6 de la revisión: JSON.parse leería la segunda, y el texto muestra una sola.
    ["repetida con una clave escapada", body("1555", ',"v\\u0065nta":99999')],
  ])("rechaza una venta %s", (_case, text) => {
    expect(extractVenta(text)).toBeNull();
  });

  it("tolera espacios alrededor de los dos puntos", () => {
    expect(extractVenta(`{"venta" :  1555 }`)).toBe("1555");
  });
});

describe("fetchReading", () => {
  it("consulta solo la URL fija, con GET, sin redirecciones y sin datos del CRM", async () => {
    const seen: { url?: string; init?: Parameters<FetchLike>[1] } = {};
    const result = await fetchReading(respond(body("1555"), 200, seen));
    expect(result).toEqual({
      ok: true,
      reading: { venta: "1555", observedAt: "2026-10-19T12:57:00.000Z" },
    });
    expect(seen.url).toBe(DOLARAPI_BLUE_URL);
    expect(DOLARAPI_BLUE_URL).toBe("https://dolarapi.com/v1/dolares/blue");
    expect(seen.init?.method).toBe("GET");
    expect(seen.init?.redirect).toBe("error");
    expect(seen.init?.headers).toEqual({ accept: "application/json" });
  });

  it.each([
    ["network", respond(null)],
    ["http_status", respond(body("1555"), 503)],
    ["too_large", respond(body("1555", `,"relleno":"${"x".repeat(5000)}"`))],
    ["not_json", respond("<html>")],
    ["schema", respond(body("1555").replace('"blue"', '"oficial"'))],
    ["schema", respond(body("1555").replace('"USD"', '"EUR"'))],
    [
      "schema",
      respond(body("1555").replace("2026-10-19T12:57:00.000Z", "ayer")),
    ],
    ["schema", respond(body('"1555"'))],
    ["venta", respond(body("1.555e3"))],
    ["venta", respond(body("1555.1234567"))],
  ])("falla por %s", async (reason, fetchLike) => {
    expect(await fetchReading(fetchLike)).toEqual({ ok: false, reason });
  });
});

function database(results: Record<string, string>): ReaderDatabase & {
  recorded: string[];
} {
  const recorded: string[] = [];
  return {
    recorded,
    async targets() {
      return Object.keys(results);
    },
    async record(organizationId, venta) {
      recorded.push(`${organizationId}:${venta}`);
      const result = results[organizationId]!;
      if (result === "throw") throw new Error("conexión cortada");
      return result;
    },
  };
}

describe("runReader", () => {
  it("sale con 0 si todo se guardó o se confirmó", async () => {
    const db = database({ a: "inserted", b: "confirmed", c: "not_a_target" });
    const lines: string[] = [];
    expect(
      await runReader({
        fetch: respond(body("1555")),
        database: db,
        log: (line) => lines.push(line),
      }),
    ).toBe(0);
    expect(db.recorded).toEqual(["a:1555", "b:1555", "c:1555"]);
    expect(lines.some((line) => line.startsWith("FALLA"))).toBe(false);
  });

  it.each([
    ["rejected_large_change"],
    ["rejected_below_one"],
    ["rejected_invalid"],
    ["algo_nuevo"],
    ["throw"],
  ])(
    "sale con 1 si una organización termina en %s, y sigue con las otras",
    async (result) => {
      const db = database({ a: result, b: "inserted" });
      expect(
        await runReader({
          fetch: respond(body("1555")),
          database: db,
          log: () => undefined,
        }),
      ).toBe(1);
      expect(db.recorded).toEqual(["a:1555", "b:1555"]);
    },
  );

  it("sale con 1 sin tocar la base si la consulta falla", async () => {
    const db = database({ a: "inserted" });
    expect(
      await runReader({
        fetch: respond(null),
        database: db,
        log: () => undefined,
      }),
    ).toBe(1);
    expect(db.recorded).toEqual([]);
  });

  it("sin objetivos, no consulta y sale con 0", async () => {
    const seen: { url?: string } = {};
    expect(
      await runReader({
        fetch: respond(body("1555"), 200, seen),
        database: database({}),
        log: () => undefined,
      }),
    ).toBe(0);
    expect(seen.url).toBeUndefined();
  });
});

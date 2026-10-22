import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import * as readV1 from "@/app/api/read/v1/contract";
import * as readV2 from "@/app/api/read/v2/contract";
import * as readV3 from "@/app/api/read/v3/contract";

// Guarda de lo que el agente nunca lee (ADR 0024, punto 14; brief-29.8, D-8 y AC-7). El agente nunca
// recibe un IMEI, un costo, un margen, un DNI ni un Instagram. Hasta la 29.8 solo lo verificaba, para
// el costo, un test de integración (read-api.test.ts, caso 6c).
//
// Dos reglas:
// 1. Ningún esquema de respuesta exportado por los contratos de lectura (read/v1, v2 y v3) tiene una
//    clave que nombre un campo prohibido, a cualquier profundidad: dentro de objetos, arreglos,
//    nulables, opcionales y uniones.
// 2. Las respuestas de la ingestión, que no tienen esquema, se arman en los handler.ts de
//    src/app/api/ingestion/: ninguna clave de un objeto literal de esos archivos nombra un campo
//    prohibido.
//
// Una clave nombra un campo prohibido si alguno de sus segmentos es serial, imei, cost, margin, dni o
// instagram, o si contiene national_id. Los segmentos se separan por guion bajo y, desde la revisión
// independiente de la 29.8 (H-3), también por camelCase: cost_amount, unit_serial, costAmount y
// nationalId fallan, y costumer no.
//
// Lo que NO ve: un campo armado en tiempo de ejecución con un nombre calculado, un esquema que no se
// exporta, y el valor de un campo con otro nombre (un IMEI dentro de description). Lo último lo cubren
// los tests de integración de v3, que buscan el IMEI y el costo de cada unidad en el cuerpo crudo. Un
// tipo de zod que contiene otros y el recorrido no conoce (un Map, un Set, una promesa) lanza: la guarda
// falla en lugar de pasar sin mirarlo.

const FORBIDDEN_SEGMENTS = new Set([
  "serial",
  "imei",
  "cost",
  "margin",
  "dni",
  "instagram",
]);

export function isForbiddenKey(key: string): boolean {
  const snake = key.replace(/([a-z0-9])([A-Z])/g, "$1_$2").toLowerCase();
  if (snake.includes("national_id")) return true;
  return snake.split("_").some((segment) => FORBIDDEN_SEGMENTS.has(segment));
}

type Def = {
  type: string;
  shape?: Record<string, z.ZodType>;
  element?: z.ZodType;
  innerType?: z.ZodType;
  options?: z.ZodType[];
  in?: z.ZodType;
  out?: z.ZodType;
  left?: z.ZodType;
  right?: z.ZodType;
  getter?: () => z.ZodType;
  valueType?: z.ZodType;
  items?: z.ZodType[];
  rest?: z.ZodType | null;
};

const UNSUPPORTED = new Set(["map", "set", "promise", "function"]);

// Las claves de un esquema de zod, a cualquier profundidad, con su ruta. Recorre por la definición
// interna de zod 4: objetos, arreglos, envoltorios (nulable, opcional, default, catch, readonly),
// uniones, pipes y transformaciones, intersecciones, lazy, records y tuplas (revisión independiente de
// la 29.8, H-3). Un objeto refinado sigue siendo un objeto.
export function schemaKeys(schema: z.ZodType, path = ""): string[] {
  const def = (schema as unknown as { _zod: { def: Def } })._zod.def;
  const walk = (child: z.ZodType | null | undefined, at = path) =>
    child ? schemaKeys(child, at) : [];
  switch (def.type) {
    case "object":
      return Object.entries(def.shape ?? {}).flatMap(([key, child]) => [
        `${path}${key}`,
        ...walk(child, `${path}${key}.`),
      ]);
    case "array":
      return walk(def.element, `${path}[].`);
    case "nullable":
    case "optional":
    case "nonoptional":
    case "default":
    case "prefault":
    case "catch":
    case "readonly":
      return walk(def.innerType);
    case "union":
      return (def.options ?? []).flatMap((option) => walk(option));
    case "pipe":
      return [...walk(def.in), ...walk(def.out)];
    case "intersection":
      return [...walk(def.left), ...walk(def.right)];
    case "lazy":
      return walk(def.getter?.());
    case "record":
      return walk(def.valueType, `${path}{}.`);
    case "tuple":
      return [
        ...(def.items ?? []).flatMap((item, index) =>
          walk(item, `${path}[${index}].`),
        ),
        ...walk(def.rest, `${path}[].`),
      ];
    default:
      if (UNSUPPORTED.has(def.type)) {
        throw new Error(`${path || "raíz"}: tipo ${def.type} sin recorrer`);
      }
      return [];
  }
}

function lastSegment(path: string): string {
  return path.split(".").at(-1)!;
}

function schemaViolations(name: string, schema: z.ZodType): string[] {
  return schemaKeys(schema)
    .filter((path) => isForbiddenKey(lastSegment(path)))
    .map((path) => `${name}: ${path}`);
}

// Las claves de los objetos literales de un archivo: «clave:» en cualquier lugar de la línea, también
// entre comillas y anidada en la misma línea (`order: x && { cost: y }`, revisión independiente de la
// 29.8, H-3). Una abreviatura ({ cost }) se ve suelta en su línea o entre llaves y comas. Ve de más: una
// anotación de tipo o un ternario con un nombre prohibido también fallan, y se renombran.
const LITERAL_KEY = /["']?\b([A-Za-z_]\w*)["']?\s*:(?!:)/g;
const SHORTHAND_KEY = /(?:^|[{,])\s*([A-Za-z_]\w*)\s*(?=[,}]|$)/gm;

export function textViolations(file: string, code: string): string[] {
  const keys = [
    ...[...code.matchAll(LITERAL_KEY)].map((match) => match[1]!),
    ...[...code.matchAll(SHORTHAND_KEY)].map((match) => match[1]!),
  ];
  return keys.filter(isForbiddenKey).map((key) => `${file}: ${key}`);
}

const FORBIDDEN_KEYS = [
  "serial",
  "imei",
  "cost",
  "margin",
  "dni",
  "national_id",
  "instagram",
];

describe("detección", () => {
  // Un caso de mutación por cada clave prohibida (Version the Failing Case of Every Project Guard),
  // en cada forma que el recorrido tiene que atravesar.
  it.each(FORBIDDEN_KEYS)("un esquema con %s falla", (key) => {
    const shapes: z.ZodType[] = [
      z.strictObject({ [key]: z.string() }),
      z.strictObject({ items: z.array(z.strictObject({ [key]: z.string() })) }),
      z.strictObject({
        unit: z.strictObject({ [key]: z.string() }).nullable(),
      }),
      z.strictObject({
        unit: z.strictObject({ [key]: z.string() }).optional(),
      }),
      z.strictObject({
        line: z.union([
          z.strictObject({ quantity: z.string() }),
          z.strictObject({ [key]: z.string() }),
        ]),
      }),
      z.strictObject({ [`unit_${key}`]: z.string() }),
      // Desde la revisión independiente de la 29.8 (H-3): camelCase y los tipos que contienen otros.
      z.strictObject({
        [`unit${key[0]!.toUpperCase()}${key.slice(1).replace(/_(\w)/g, (_, c: string) => c.toUpperCase())}`]:
          z.string(),
      }),
      z.strictObject({ [key]: z.string() }).refine(() => true),
      z.strictObject({ [key]: z.string() }).transform((value) => value),
      z.strictObject({
        unit: z.strictObject({ [key]: z.string() }).default({ [key]: "x" }),
      }),
      z.intersection(
        z.strictObject({ id: z.string() }),
        z.strictObject({ [key]: z.string() }),
      ),
      z.strictObject({
        unit: z.lazy(() => z.strictObject({ [key]: z.string() })),
      }),
      z.record(z.string(), z.strictObject({ [key]: z.string() })),
      z.tuple([z.string(), z.strictObject({ [key]: z.string() })]),
    ];
    for (const schema of shapes) {
      expect(schemaViolations("mutado", schema)).not.toEqual([]);
    }
  });

  it("un tipo que contiene otros y el recorrido no conoce hace fallar la guarda", () => {
    expect(() =>
      schemaKeys(z.strictObject({ units: z.map(z.string(), z.string()) })),
    ).toThrow(/map/);
  });

  it.each(FORBIDDEN_KEYS)(
    "una respuesta de la ingestión con %s falla",
    (key) => {
      expect(
        textViolations("mutado", `Response.json({\n  ${key}: unit.x,\n});`),
      ).not.toEqual([]);
      expect(
        textViolations("mutado", `Response.json({\n  "${key}": unit.x,\n});`),
      ).not.toEqual([]);
      expect(
        textViolations("mutado", `Response.json({\n  id,\n  ${key},\n});`),
      ).not.toEqual([]);
      // Anidada en la misma línea y abreviada entre llaves (revisión independiente de la 29.8, H-3).
      expect(
        textViolations("mutado", `  order: x && { ${key}: y.z },`),
      ).not.toEqual([]);
      expect(textViolations("mutado", `  unit: { id, ${key} },`)).not.toEqual(
        [],
      );
    },
  );

  it("las claves vecinas no fallan", () => {
    for (const key of [
      "product_id",
      "unit_id",
      "battery_health",
      "price_converted",
      "costumer",
      "grade",
    ]) {
      expect(isForbiddenKey(key)).toBe(false);
    }
  });
});

function exportedSchemas(
  name: string,
  contract: Record<string, unknown>,
): [string, z.ZodType][] {
  return Object.entries(contract)
    .filter(
      // productSchema, productStockResponseSchemaV2, unitSchemaV3…
      ([exported, value]) =>
        /Schema(?:V\d+)?$/.test(exported) && value instanceof z.ZodType,
    )
    .map(([exported, value]) => [`${name}.${exported}`, value as z.ZodType]);
}

const READ_SCHEMAS = [
  ...exportedSchemas("read/v1", readV1),
  ...exportedSchemas("read/v2", readV2),
  ...exportedSchemas("read/v3", readV3),
];

function handlerFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) return handlerFiles(path);
    return entry === "handler.ts" ? [path.replaceAll("\\", "/")] : [];
  });
}

describe("los contratos del agente", () => {
  it("el recorrido ve los esquemas de las tres versiones", () => {
    // Si un cambio de zod rompiera el recorrido, la guarda pasaría sin ver nada: se fijan claves que
    // tienen que aparecer.
    const keys = new Set(
      READ_SCHEMAS.flatMap(([, schema]) => schemaKeys(schema)).map(lastSegment),
    );
    for (const key of [
      "product_id",
      "stock_status",
      "quantity_reserved",
      "battery_health",
      "price_converted",
      "capabilities",
      "rate_as_of",
      // De esquemas con .refine(): el historial, el estado de la conversación y el horario (revisión
      // independiente de la 29.8, H-3).
      "sent_by",
      "configured",
    ]) {
      expect(keys).toContain(key);
    }
  });

  it("ningún esquema de respuesta de la lectura nombra un campo prohibido", () => {
    expect(
      READ_SCHEMAS.flatMap(([name, schema]) => schemaViolations(name, schema)),
    ).toEqual([]);
  });

  it("ninguna respuesta de la ingestión nombra un campo prohibido", () => {
    const files = handlerFiles("src/app/api/ingestion");
    expect(files.length).toBeGreaterThan(0);
    expect(
      files.flatMap((file) => textViolations(file, readFileSync(file, "utf8"))),
    ).toEqual([]);
  });
});

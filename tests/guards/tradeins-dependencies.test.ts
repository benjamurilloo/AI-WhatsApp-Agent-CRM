import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Guarda del módulo tradeins (brief-29.7, D-1, D-4, D-5, U-3 y U-4; ADR 0024, punto 16), con el molde de
// service-dependencies. Tres reglas:
//
// 1. src/modules/tradeins/ importa solo de catalog, crm, inventory, numbering, organizations y audit,
//    los esquemas que nombra schema.ts por sus claves foráneas, src/shared, sus propios archivos y
//    paquetes. No importa cash. Desde la 29.7.3 (brief-29.7.3, D-4; ADR 0024, punto 16) importa service
//    solo para la cotización: getRepairCostsForQuote y listRepairTypes, con import nombrado, y de su
//    esquema solo repairTypes, por las claves foráneas. Desde la 29.8.3 (brief-29.8.3, D-6), también
//    getRepairCostsForQuoteForService, para la cotización del agente. Nada más de service, ni un
//    re-export;
// 2. entre los módulos, solo cash importa tradeins, por la anulación (U-4). Las pantallas y los scripts
//    lo usan, y no cuentan. Un import de tradeins en inventory o en crm cerraría un ciclo que ni
//    eslint.config.mjs ni module-boundary ven;
// 3. las cuatro tablas de tradeins se escriben solo desde las funciones de su repositorio, y cada una
//    tiene un llamador fijo: el comprobante y su resultado, desde la recepción; la anulación, desde
//    voidTradeInInCash, que llama solo cash; el checklist, desde sus casos de uso y la copia del perfil.
//    Desde la 29.7.3, los valores sueltos y los márgenes de la cotización, desde sus casos de uso, y los
//    valores también desde la copia del perfil.
//
// Lee el texto: import y export con from, el import de efecto y el import dinámico con un literal; las
// escrituras con Drizzle o SQL literal; y las llamadas al repositorio por su espacio de nombres. No ve
// un especificador armado en tiempo de ejecución ni SQL escrito a mano contra la base.

const TRADEINS_ALLOWED = new Set([
  "catalog",
  "crm",
  "inventory",
  "numbering",
  "organizations",
  "audit",
]);

// Los esquemas que nombra schema.ts por sus claves foráneas.
const SCHEMAS_ALLOWED = new Set([
  "auth",
  "catalog",
  "crm",
  "inventory",
  "organizations",
]);

// Lo único que tradeins toma de service (desde la 29.7.3), por nombre. Desde la 29.8.3, también la
// lectura de los costos para la cotización del agente (brief-29.8.3, D-6).
const SERVICE_NAMES = new Set([
  "getRepairCostsForQuote",
  "getRepairCostsForQuoteForService",
  "listRepairTypes",
]);
const SERVICE_SCHEMA_NAMES = new Set(["repairTypes"]);

const SERVICE_IMPORT =
  /\bimport\s+(?:type\s+)?\{([^}]*)\}\s*from\s*["']@\/modules\/service(\/schema)?["']/g;

// Los import nombrados de service que respetan la lista: cada nombre, en su lista.
function allowedServiceImports(code: string): number {
  return [...code.matchAll(SERVICE_IMPORT)].filter((match) => {
    const allowed = match[2] ? SERVICE_SCHEMA_NAMES : SERVICE_NAMES;
    return match[1]!
      .split(",")
      .map(
        (name) =>
          name
            .trim()
            .replace(/^type\s+/, "")
            .split(/\s+as\s+/)[0]!,
      )
      .filter((name) => name !== "")
      .every((name) => allowed.has(name));
  }).length;
}

const SPECIFIER = /(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s+)["']([^"']+)["']/g;

function specifiers(code: string): string[] {
  return [...code.matchAll(SPECIFIER)].map((match) => match[1]!);
}

function moduleOf(
  specifier: string,
): { name: string; schemaOnly: boolean } | null {
  const match = /^@\/modules\/([^/]+)(\/.*)?$/.exec(specifier);
  if (!match) return null;
  return { name: match[1]!, schemaOnly: match[2] === "/schema" };
}

function tradeInsViolations(file: string, code: string): string[] {
  // Cada referencia a service cuenta contra los import nombrados que respetan la lista.
  let serviceAllowance = allowedServiceImports(code);
  return specifiers(code)
    .filter((specifier) => {
      const target = moduleOf(specifier);
      if (target === null) return false;
      if (target.name === "tradeins") return false;
      if (target.name === "service") {
        if (serviceAllowance > 0) {
          serviceAllowance -= 1;
          return false;
        }
        return true;
      }
      if (target.schemaOnly) return !SCHEMAS_ALLOWED.has(target.name);
      return !TRADEINS_ALLOWED.has(target.name);
    })
    .map((specifier) => `${file} importa ${specifier}`);
}

function importerViolations(file: string, code: string): string[] {
  const owner = /^src\/modules\/([^/]+)\//.exec(file)?.[1];
  if (!owner || owner === "cash" || owner === "tradeins") return [];
  return specifiers(code)
    .filter((specifier) => moduleOf(specifier)?.name === "tradeins")
    .map((specifier) => `${file} importa ${specifier}`);
}

// Regla 3: las escrituras.

const REPOSITORY = "src/modules/tradeins/repository.ts";
const CHECKLIST = "src/modules/tradeins/checklist.ts";
const TRADE_INS = "src/modules/tradeins/trade-ins.ts";
const QUOTE = "src/modules/tradeins/quote.ts";

const AUTHORIZED = new Map([
  ["insertChecklistItem", ["insert trade_in_checklist_items"]],
  ["updateChecklistItem", ["update trade_in_checklist_items"]],
  ["insertTradeIn", ["insert trade_ins"]],
  ["insertChecklistResults", ["insert trade_in_checklist_results"]],
  ["insertTradeInVoid", ["insert trade_in_voids"]],
  ["insertQuoteSettings", ["insert trade_in_settings"]],
  ["updateQuoteSettings", ["update trade_in_settings"]],
  ["insertMargin", ["insert trade_in_margins"]],
  ["updateMargin", ["update trade_in_margins"]],
]);

const TABLES = new Map([
  ["tradeinchecklistitems", "trade_in_checklist_items"],
  ["trade_in_checklist_items", "trade_in_checklist_items"],
  ["tradeins", "trade_ins"],
  ["trade_ins", "trade_ins"],
  ["tradeinchecklistresults", "trade_in_checklist_results"],
  ["trade_in_checklist_results", "trade_in_checklist_results"],
  ["tradeinvoids", "trade_in_voids"],
  ["trade_in_voids", "trade_in_voids"],
  ["tradeinsettings", "trade_in_settings"],
  ["trade_in_settings", "trade_in_settings"],
  ["tradeinmargins", "trade_in_margins"],
  ["trade_in_margins", "trade_in_margins"],
]);

const SQL_TABLE = String.raw`(?:"?public"?\s*\.\s*)?"?(trade_in_checklist_items|trade_in_checklist_results|trade_in_voids|trade_in_settings|trade_in_margins|trade_ins)"?\b|\$\{\s*(?:\w+\.)?(tradeInChecklistItems|tradeInChecklistResults|tradeInVoids|tradeInSettings|tradeInMargins|tradeIns)\s*\}`;

const WRITE_PATTERNS = [
  /\.(insert|update|delete)\(\s*(?:\w+\.)?(tradeInChecklistItems|tradeInChecklistResults|tradeInVoids|tradeInSettings|tradeInMargins|tradeIns)\s*\)/g,
  new RegExp(
    String.raw`\b(insert\s+into|update|delete\s+from|truncate(?:\s+table)?)(?:\s+only)?\s+(?:${SQL_TABLE})`,
    "gi",
  ),
];

const FUNCTION_PATTERN =
  /^(?:export\s+)?(?:async\s+)?function\s+(\w+)[\s\S]*?^\}/gm;

function functionsOf(code: string) {
  return [...code.matchAll(FUNCTION_PATTERN)].map((match) => ({
    name: match[1]!,
    start: match.index,
    end: match.index + match[0].length,
  }));
}

function enclosing(
  functions: ReturnType<typeof functionsOf>,
  index: number,
): string | null {
  return functions.find((f) => index >= f.start && index < f.end)?.name ?? null;
}

function findWrites(code: string) {
  const functions = functionsOf(code);
  return WRITE_PATTERNS.flatMap((pattern) =>
    [...code.matchAll(pattern)].map((match) => ({
      line: code.slice(0, match.index).split("\n").length,
      operation: `${match[1]!.toLowerCase().split(/\s+/)[0]} ${TABLES.get((match[2] ?? match[3])!.toLowerCase())}`,
      fn: enclosing(functions, match.index),
    })),
  ).sort((a, b) => a.line - b.line);
}

function writeViolations(file: string, code: string): string[] {
  return findWrites(code)
    .filter(
      ({ operation, fn }) =>
        !(
          file === REPOSITORY &&
          fn !== null &&
          AUTHORIZED.get(fn)?.includes(operation)
        ),
    )
    .map(({ line, operation }) => `${file}:${line} ${operation}`);
}

// Los llamadores de cada escritura del repositorio, por su espacio de nombres: los casos de uso del
// checklist se llaman igual que sus escrituras.
const CALLERS = new Map<string, { file: string; from: string[] }[]>([
  [
    "insertChecklistItem",
    [
      {
        file: CHECKLIST,
        from: ["createChecklistItem", "applyChecklistTemplate"],
      },
    ],
  ],
  [
    "updateChecklistItem",
    [
      {
        file: CHECKLIST,
        from: [
          "updateChecklistItem",
          "setChecklistItemActive",
          "moveChecklistItem",
          "setChecklistItemRepairType",
        ],
      },
      { file: QUOTE, from: ["applyQuoteTemplate"] },
    ],
  ],
  ["insertTradeIn", [{ file: TRADE_INS, from: ["createTradeIn"] }]],
  ["insertChecklistResults", [{ file: TRADE_INS, from: ["createTradeIn"] }]],
  ["insertTradeInVoid", [{ file: TRADE_INS, from: ["voidTradeInInCash"] }]],
  [
    "insertQuoteSettings",
    [{ file: QUOTE, from: ["writeSettings", "applyQuoteTemplate"] }],
  ],
  ["updateQuoteSettings", [{ file: QUOTE, from: ["writeSettings"] }]],
  ["insertMargin", [{ file: QUOTE, from: ["setTradeInMargin"] }]],
  ["updateMargin", [{ file: QUOTE, from: ["setTradeInMargin"] }]],
]);

const CALL_PATTERN = new RegExp(
  String.raw`\brepository\.(${[...CALLERS.keys()].join("|")})\s*\(`,
  "g",
);

function callViolations(file: string, code: string): string[] {
  const functions = functionsOf(code);
  return [...code.matchAll(CALL_PATTERN)].flatMap((match) => {
    const callee = match[1]!;
    const fn = enclosing(functions, match.index);
    const line = code.slice(0, match.index).split("\n").length;
    return CALLERS.get(callee)!.some(
      (rule) => rule.file === file && fn !== null && rule.from.includes(fn),
    )
      ? []
      : [`${file}:${line} ${callee} desde ${fn ?? "fuera de una función"}`];
  });
}

describe("detección", () => {
  it.each([
    ["cash", 'import { voidTradeIn } from "@/modules/cash";'],
    [
      "service con un re-export",
      'export { listRepairTypes } from "@/modules/service";',
    ],
    [
      "service fuera de la lista",
      'import { createServiceOrder } from "@/modules/service";',
    ],
    [
      "service con un nombre de la lista y otro que no",
      'import { listRepairTypes, setRepairPrice } from "@/modules/service";',
    ],
    [
      "service con un espacio de nombres",
      'import * as service from "@/modules/service";',
    ],
    ["sales", 'import { issueSale } from "@/modules/sales";'],
    [
      "service por su esquema",
      'import { serviceOrders } from "@/modules/service/schema";',
    ],
    [
      "cash con un import dinámico",
      'const c = await import("@/modules/cash");',
    ],
  ])("regla 1, detecta que tradeins importe %s", (_name, code) => {
    expect(
      tradeInsViolations("src/modules/tradeins/trade-ins.ts", code),
    ).not.toEqual([]);
  });

  it("regla 1, permite su lista, los esquemas de sus claves, src/shared, lo propio y paquetes", () => {
    const code = [
      'import { recordAudit } from "@/modules/audit";',
      'import { users } from "@/modules/auth/schema";',
      'import { searchProducts } from "@/modules/catalog";',
      'import { clients } from "@/modules/crm/schema";',
      'import { registerTradeInUnit } from "@/modules/inventory";',
      'import { stockUnits } from "@/modules/inventory/schema";',
      'import { nextDocumentNumber } from "@/modules/numbering";',
      'import { getRepairCostsForQuote, listRepairTypes } from "@/modules/service";',
      'import { repairTypes } from "@/modules/service/schema";',
      'import { failure } from "@/shared/errors";',
      'import * as repository from "./repository";',
      'import { z } from "zod";',
    ].join("\n");
    expect(tradeInsViolations("src/modules/tradeins/x.ts", code)).toEqual([]);
  });

  it.each([
    ["inventory", 'import { getUnitTradeIns } from "@/modules/tradeins";'],
    ["crm", 'import { tradeIns } from "@/modules/tradeins/schema";'],
    ["service", 'const t = await import("@/modules/tradeins");'],
  ])("regla 2, detecta que %s importe tradeins", (owner, code) => {
    expect(
      importerViolations(`src/modules/${owner}/service.ts`, code),
    ).not.toEqual([]);
  });

  it("regla 2, permite cash, las pantallas y los scripts", () => {
    const code = 'import { voidTradeInInCash } from "@/modules/tradeins";';
    expect(
      importerViolations("src/modules/cash/trade-in-voids.ts", code),
    ).toEqual([]);
    expect(
      importerViolations("src/app/(autenticado)/usados/page.tsx", code),
    ).toEqual([]);
  });

  it.each([
    {
      name: "insert de una recepción fuera de la función autorizada",
      file: REPOSITORY,
      code: "export async function other(tx) {\n  await tx.insert(tradeIns).values(v);\n}",
    },
    {
      name: "update de una recepción",
      file: REPOSITORY,
      code: "export async function insertTradeIn(tx) {\n  await tx.update(tradeIns).set(v);\n}",
    },
    {
      name: "SQL literal sobre la anulación desde otro módulo",
      file: "src/modules/cash/trade-in-voids.ts",
      code: "await tx.execute(sql`insert into trade_in_voids values (1)`);",
    },
    {
      name: "delete de un punto del checklist con la tabla interpolada",
      file: CHECKLIST,
      code: "await tx.execute(sql`delete from ${tradeInChecklistItems}`);",
    },
  ])("regla 3, detecta: $name", ({ file, code }) => {
    expect(writeViolations(file, code)).not.toEqual([]);
  });

  it.each([
    {
      name: "la anulación escrita desde la recepción",
      file: TRADE_INS,
      code: "export async function createTradeIn(c) {\n  await repository.insertTradeInVoid(tx, v);\n}",
    },
    {
      name: "la recepción escrita desde la anulación",
      file: TRADE_INS,
      code: "export async function voidTradeInInCash(tx) {\n  await repository.insertTradeIn(tx, v);\n}",
    },
    {
      name: "un punto del checklist escrito desde una pantalla",
      file: "src/app/(autenticado)/usados/actions.ts",
      code: "export async function createItemAction() {\n  await repository.insertChecklistItem(tx, o, v);\n}",
    },
  ])("regla 3, detecta el llamador: $name", ({ file, code }) => {
    expect(callViolations(file, code)).not.toEqual([]);
  });
});

describe("el código", () => {
  const files = readdirSync("src", { recursive: true, encoding: "utf8" })
    .map((file) => join("src", file).replaceAll("\\", "/"))
    .filter((file) => /\.tsx?$/.test(file) && !/\.test\.tsx?$/.test(file));

  it("tradeins importa solo de su lista", () => {
    const own = files.filter((file) =>
      file.startsWith("src/modules/tradeins/"),
    );
    expect(own.length).toBeGreaterThan(0);
    expect(
      own.flatMap((file) =>
        tradeInsViolations(file, readFileSync(file, "utf8")),
      ),
    ).toEqual([]);
  });

  it("entre los módulos, solo cash importa tradeins, y cash sí lo importa", () => {
    expect(
      files.flatMap((file) =>
        importerViolations(file, readFileSync(file, "utf8")),
      ),
    ).toEqual([]);
    // Si cash dejara de importarlo, la regla quedaría sin objeto y esta guarda habría que revisarla.
    const cashImports = files
      .filter((file) => file.startsWith("src/modules/cash/"))
      .some((file) =>
        specifiers(readFileSync(file, "utf8")).some(
          (specifier) => moduleOf(specifier)?.name === "tradeins",
        ),
      );
    expect(cashImports).toBe(true);
  });

  it("ningún archivo de src/ escribe las tablas de tradeins fuera de las funciones autorizadas", () => {
    const violations = files.flatMap((file) =>
      writeViolations(file, readFileSync(file, "utf8")),
    );
    expect(
      violations,
      `Escrituras no autorizadas:\n${violations.join("\n")}`,
    ).toEqual([]);
  });

  // Si el repositorio cambiara de patrón, la guarda quedaría vacía y seguiría en verde.
  it("el repositorio tiene exactamente las escrituras autorizadas", () => {
    expect(
      findWrites(readFileSync(REPOSITORY, "utf8")).map(
        ({ operation, fn }) => `${fn}: ${operation}`,
      ),
    ).toEqual([
      "insertChecklistItem: insert trade_in_checklist_items",
      "updateChecklistItem: update trade_in_checklist_items",
      "insertTradeIn: insert trade_ins",
      "insertChecklistResults: insert trade_in_checklist_results",
      "insertTradeInVoid: insert trade_in_voids",
      "insertQuoteSettings: insert trade_in_settings",
      "updateQuoteSettings: update trade_in_settings",
      "insertMargin: insert trade_in_margins",
      "updateMargin: update trade_in_margins",
    ]);
  });

  it("cada escritura se llama solo desde su llamador, y cada una tiene su llamada", () => {
    const violations = files.flatMap((file) =>
      callViolations(file, readFileSync(file, "utf8")),
    );
    expect(
      violations,
      `Llamadas no autorizadas:\n${violations.join("\n")}`,
    ).toEqual([]);
    const called = new Set(
      files.flatMap((file) =>
        [...readFileSync(file, "utf8").matchAll(CALL_PATTERN)].map(
          (match) => match[1]!,
        ),
      ),
    );
    expect([...CALLERS.keys()].filter((name) => !called.has(name))).toEqual([]);
  });
});

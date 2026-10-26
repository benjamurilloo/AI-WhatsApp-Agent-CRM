import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Guarda de las escrituras de service (brief-29.6, D-8), con el molde de unit-writes. Dos reglas:
//
// 1. repair_types, repair_prices, service_orders y service_order_lines se escriben solo desde las
//    funciones autorizadas de src/modules/service/repository.ts, y nada borra ninguna. Es la tercera
//    defensa, después de los privilegios de crm_app (sin DELETE en ninguna, sin UPDATE en las líneas)
//    y de los triggers de la 0058.
// 2. Cada escritura del repositorio y cada caso de uso tiene **un llamador fijo por función**: la
//    función del servicio que la usa, y cada caso de uso, su Server Action. Una orden que cambia de
//    estado desde otro lugar no toma la cabecera FOR UPDATE ni audita.
//
// Ve: Drizzle (.insert/.update/.delete con la tabla, también por un espacio de nombres) y SQL literal
// con INSERT INTO, UPDATE, DELETE FROM o TRUNCATE sobre el nombre o la tabla interpolada; y las
// llamadas por nombre, también con espacio de nombres. No ve: un alias en el import, una referencia
// guardada en una variable, el nombre armado en tiempo de ejecución, ni SQL escrito a mano contra la
// base. El vaciado de datos de un cliente (scripts/client-data-delete.ts) y los tests quedan fuera: no
// son src/.
//
// Desde la 29.6.2 (brief-29.6.2, D-5): la orden de una unidad propia, con su alta, su paso a reparada
// con las líneas, y sus casos de uso desde su Server Action. Mandar a reparar se llama desde la
// pantalla de unidades del producto.
//
// Desde la 29.9.2 (brief-29.9.2, D-7): el reclamo de garantía, con su alta y su paso a reparado con las
// líneas, desde sus Server Actions.

const REPOSITORY = "src/modules/service/repository.ts";
const REPAIR_LIST = "src/modules/service/repair-list.ts";
const ORDERS = "src/modules/service/service-orders.ts";
const OWN_UNIT_ORDERS = "src/modules/service/own-unit-orders.ts";
const CLAIMS = "src/modules/service/warranty-claims.ts";
const ACTIONS = "src/app/(autenticado)/reparaciones/actions.ts";
const UNIT_ACTIONS =
  "src/app/(autenticado)/productos/[productId]/unidades/actions.ts";

const AUTHORIZED = new Map([
  ["insertRepairType", ["insert repair_types"]],
  ["updateRepairType", ["update repair_types"]],
  ["insertRepairPrice", ["insert repair_prices"]],
  ["updateRepairPrice", ["update repair_prices"]],
  ["insertServiceOrder", ["insert service_orders"]],
  ["insertOwnUnitServiceOrder", ["insert service_orders"]],
  ["insertWarrantyClaim", ["insert service_orders"]],
  ["updateServiceOrder", ["update service_orders"]],
  ["insertServiceOrderLines", ["insert service_order_lines"]],
]);

const TABLES = new Map([
  ["repairtypes", "repair_types"],
  ["repair_types", "repair_types"],
  ["repairprices", "repair_prices"],
  ["repair_prices", "repair_prices"],
  ["serviceorders", "service_orders"],
  ["service_orders", "service_orders"],
  ["serviceorderlines", "service_order_lines"],
  ["service_order_lines", "service_order_lines"],
]);

const SQL_TABLE = String.raw`(?:"?public"?\s*\.\s*)?"?(repair_types|repair_prices|service_orders|service_order_lines)"?\b|\$\{\s*(?:\w+\.)?(repairTypes|repairPrices|serviceOrders|serviceOrderLines)\s*\}`;

const WRITE_PATTERNS = [
  /\.(insert|update|delete)\(\s*(?:\w+\.)?(repairTypes|repairPrices|serviceOrders|serviceOrderLines)\s*\)/g,
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

type Write = { line: number; operation: string; fn: string | null };

function findServiceWrites(code: string): Write[] {
  const functions = functionsOf(code);
  return WRITE_PATTERNS.flatMap((pattern) =>
    [...code.matchAll(pattern)].map((match) => ({
      line: code.slice(0, match.index).split("\n").length,
      operation: `${match[1]!.toLowerCase().split(/\s+/)[0]} ${TABLES.get((match[2] ?? match[3])!.toLowerCase())}`,
      fn: enclosing(functions, match.index),
    })),
  ).sort((a, b) => a.line - b.line);
}

function findWriteViolations(file: string, code: string): string[] {
  return findServiceWrites(code)
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

// El único llamador de cada función: el archivo y las funciones desde las que se la llama.
const CALLERS = new Map<string, { file: string; from: string[] }[]>([
  // Las escrituras del repositorio.
  [
    "insertRepairType",
    [
      {
        file: REPAIR_LIST,
        from: ["createRepairType", "applyRepairTypeTemplate"],
      },
    ],
  ],
  [
    "updateRepairType",
    [
      {
        file: REPAIR_LIST,
        from: ["renameRepairType", "setRepairTypeActive", "moveRepairType"],
      },
    ],
  ],
  ["insertRepairPrice", [{ file: REPAIR_LIST, from: ["writeRepairPrice"] }]],
  ["updateRepairPrice", [{ file: REPAIR_LIST, from: ["writeRepairPrice"] }]],
  ["writeRepairPrice", [{ file: REPAIR_LIST, from: ["setRepairPrice"] }]],
  ["insertServiceOrder", [{ file: ORDERS, from: ["createServiceOrder"] }]],
  [
    "insertOwnUnitServiceOrder",
    [{ file: OWN_UNIT_ORDERS, from: ["createOwnUnitServiceOrder"] }],
  ],
  ["insertWarrantyClaim", [{ file: CLAIMS, from: ["createWarrantyClaim"] }]],
  [
    "updateServiceOrder",
    [
      {
        file: ORDERS,
        from: [
          "sendServiceOrder",
          "quoteServiceOrder",
          "simpleTransition",
          "deliverServiceOrder",
          "cancelServiceOrder",
        ],
      },
      { file: OWN_UNIT_ORDERS, from: ["markOwnUnitRepaired"] },
      { file: CLAIMS, from: ["markWarrantyClaimRepaired"] },
    ],
  ],
  [
    "insertServiceOrderLines",
    [
      { file: ORDERS, from: ["quoteServiceOrder"] },
      { file: OWN_UNIT_ORDERS, from: ["markOwnUnitRepaired"] },
      { file: CLAIMS, from: ["markWarrantyClaimRepaired"] },
    ],
  ],
  [
    "simpleTransition",
    [
      {
        file: ORDERS,
        from: [
          "approveServiceOrder",
          "rejectServiceOrder",
          "markServiceOrderRepaired",
        ],
      },
    ],
  ],
  // Los casos de uso, cada uno desde su Server Action. Aprobar, rechazar y marcarla reparada van por
  // una sola acción, que llama a cada uno por su nombre.
  [
    "approveServiceOrder",
    [{ file: ACTIONS, from: ["changeServiceOrderAction"] }],
  ],
  [
    "rejectServiceOrder",
    [{ file: ACTIONS, from: ["changeServiceOrderAction"] }],
  ],
  [
    "markServiceOrderRepaired",
    [{ file: ACTIONS, from: ["changeServiceOrderAction"] }],
  ],
  ["createRepairType", [{ file: ACTIONS, from: ["createRepairTypeAction"] }]],
  ["renameRepairType", [{ file: ACTIONS, from: ["renameRepairTypeAction"] }]],
  [
    "setRepairTypeActive",
    [{ file: ACTIONS, from: ["setRepairTypeActiveAction"] }],
  ],
  ["moveRepairType", [{ file: ACTIONS, from: ["moveRepairTypeAction"] }]],
  ["setRepairPrice", [{ file: ACTIONS, from: ["setRepairPriceAction"] }]],
  [
    "createServiceOrder",
    [{ file: ACTIONS, from: ["createServiceOrderAction"] }],
  ],
  ["sendServiceOrder", [{ file: ACTIONS, from: ["sendServiceOrderAction"] }]],
  ["quoteServiceOrder", [{ file: ACTIONS, from: ["quoteServiceOrderAction"] }]],
  [
    "deliverServiceOrder",
    [{ file: ACTIONS, from: ["deliverServiceOrderAction"] }],
  ],
  [
    "cancelServiceOrder",
    [{ file: ACTIONS, from: ["cancelServiceOrderAction"] }],
  ],
  [
    "createOwnUnitServiceOrder",
    [{ file: UNIT_ACTIONS, from: ["sendUnitToRepairAction"] }],
  ],
  [
    "markOwnUnitRepaired",
    [{ file: ACTIONS, from: ["markOwnUnitRepairedAction"] }],
  ],
  [
    "createWarrantyClaim",
    [{ file: ACTIONS, from: ["createWarrantyClaimAction"] }],
  ],
  [
    "markWarrantyClaimRepaired",
    [{ file: ACTIONS, from: ["markWarrantyClaimRepairedAction"] }],
  ],
]);

const CALL_PATTERN = new RegExp(
  String.raw`(?<!function\s)\b(?:\w+\.)?(${[...CALLERS.keys()].join("|")})\s*\(`,
  "g",
);

function findCallViolations(file: string, code: string): string[] {
  const functions = functionsOf(code);
  return [...code.matchAll(CALL_PATTERN)].flatMap((match) => {
    const callee = match[1]!;
    const fn = enclosing(functions, match.index);
    const line = code.slice(0, match.index).split("\n").length;
    const allowed = CALLERS.get(callee)!;
    return allowed.some(
      (rule) => rule.file === file && fn !== null && rule.from.includes(fn),
    )
      ? []
      : [`${file}:${line} ${callee} desde ${fn ?? "fuera de una función"}`];
  });
}

describe("detección de escrituras de service", () => {
  it.each([
    {
      name: "insert de una orden fuera de su función",
      file: REPOSITORY,
      code: "export async function other(tx) {\n  await tx.insert(serviceOrders).values(v);\n}",
    },
    {
      name: "update de una orden desde el servicio",
      file: ORDERS,
      code: "export async function approveServiceOrder(tx) {\n  await tx.update(serviceOrders).set(v);\n}",
    },
    {
      name: "delete de las líneas, aun desde su función",
      file: REPOSITORY,
      code: "export async function insertServiceOrderLines(tx) {\n  await tx.delete(serviceOrderLines);\n}",
    },
    {
      name: "update de las líneas",
      file: REPOSITORY,
      code: "export async function insertServiceOrderLines(tx) {\n  await tx.update(serviceOrderLines).set(v);\n}",
    },
    {
      name: "SQL literal con esquema",
      file: "src/modules/sales/repository.ts",
      code: 'await db.execute(sql`update "public"."service_orders" set status = 1`);',
    },
    {
      name: "SQL con la tabla interpolada",
      file: "src/modules/cash/service.ts",
      code: "await db.execute(sql`insert into ${repairPrices} values (1)`);",
    },
    {
      name: "delete de un tipo en SQL",
      file: REPAIR_LIST,
      code: "await tx.execute(sql`delete from repair_types`);",
    },
  ])("detecta: $name", ({ file, code }) => {
    expect(findWriteViolations(file, code)).not.toEqual([]);
  });

  it("permite las escrituras autorizadas y una lectura con subconsulta", () => {
    const code = [
      "export async function insertServiceOrder(tx, v) {",
      "  const rows = await tx\n    .insert(serviceOrders)\n    .values(v);",
      "}",
      "export function countLines() {",
      "  return db.select({ n: sql`(select count(*) from service_order_lines l where l.service_order_id = x)` });",
      "}",
    ].join("\n");
    expect(findWriteViolations(REPOSITORY, code)).toEqual([]);
  });

  it("detecta un llamador fuera de su lugar, y permite el suyo", () => {
    expect(
      findCallViolations(
        ORDERS,
        "export async function getServiceOrder(tx) {\n  await repository.updateServiceOrder(tx, o, i, t);\n}",
      ),
    ).not.toEqual([]);
    expect(
      findCallViolations(
        "src/app/(autenticado)/ventas/actions.ts",
        "export async function sellAction() {\n  await deliverServiceOrder(context, id);\n}",
      ),
    ).not.toEqual([]);
    expect(
      findCallViolations(
        ACTIONS,
        "export async function deliverServiceOrderAction() {\n  return run((context) => deliverServiceOrder(context, id));\n}",
      ),
    ).toEqual([]);
  });
});

describe("repositorio", () => {
  const files = readdirSync("src", { recursive: true, encoding: "utf8" })
    .map((file) => join("src", file).replaceAll("\\", "/"))
    .filter((file) => /\.tsx?$/.test(file) && !/\.test\.tsx?$/.test(file));

  it("ningún archivo de src/ escribe las tablas de service fuera de las funciones autorizadas", () => {
    const violations = files.flatMap((file) =>
      findWriteViolations(file, readFileSync(file, "utf8")),
    );
    expect(files.length).toBeGreaterThan(0);
    expect(
      violations,
      `Escrituras no autorizadas:\n${violations.join("\n")}`,
    ).toEqual([]);
  });

  // Si el repositorio cambiara de patrón, la guarda quedaría vacía y seguiría en verde.
  it("el repositorio tiene exactamente las escrituras autorizadas", () => {
    const writes = findServiceWrites(readFileSync(REPOSITORY, "utf8")).map(
      ({ operation, fn }) => `${fn}: ${operation}`,
    );
    expect(writes).toEqual([
      "insertRepairType: insert repair_types",
      "updateRepairType: update repair_types",
      "insertRepairPrice: insert repair_prices",
      "updateRepairPrice: update repair_prices",
      "insertServiceOrder: insert service_orders",
      "insertOwnUnitServiceOrder: insert service_orders",
      "insertWarrantyClaim: insert service_orders",
      "updateServiceOrder: update service_orders",
      "insertServiceOrderLines: insert service_order_lines",
    ]);
  });

  it("cada escritura y cada caso de uso se llama solo desde su lugar", () => {
    const violations = files.flatMap((file) =>
      findCallViolations(file, readFileSync(file, "utf8")),
    );
    expect(
      violations,
      `Llamadas fuera de su lugar:\n${violations.join("\n")}`,
    ).toEqual([]);
  });

  // Cada función de la lista tiene que tener su llamador: si alguno se renombra, la regla queda sin
  // objeto.
  it("cada función de la lista tiene su llamador", () => {
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

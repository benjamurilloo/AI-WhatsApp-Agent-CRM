import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Guarda de las unidades (ADR 0024, punto 6; brief-29.5, D-4 y D-10). Dos reglas:
//
// 1. stock_units y unit_grades se escriben solo desde las funciones autorizadas de
//    src/modules/inventory/unit-repository.ts.
// 2. Cada escritura de una unidad, del seguimiento de un producto y de un grado tiene **un llamador
//    fijo por función**, como pide el ADR: «stock-writes fija cada función y su único llamador». Las
//    reglas de la 19.3 a la 22.5, en stock-writes.test.ts, fijan el archivo o la carpeta (brief-29.5,
//    H-2); las de esta subfase fijan la función, y endurecer aquellas queda fuera (D-4).
//
// Ve: Drizzle (.insert/.update/.delete con la tabla, también por un espacio de nombres) y SQL literal
// con INSERT INTO, UPDATE, DELETE FROM o TRUNCATE sobre el nombre o la tabla interpolada; y las
// llamadas por nombre, también con espacio de nombres. No ve: un alias en el import, una referencia
// guardada en una variable, el nombre armado en tiempo de ejecución, ni SQL escrito a mano contra la
// base. Los seeds y los tests quedan fuera: no son src/.
//
// Desde la 29.5.2 (brief-29.5.2, D-3 y D-9): setUnitsStatus, el cambio de estado de pedidos y ventas,
// con sus cinco llamadores en inventory, y las funciones de inventory que mueven unidades en pedidos y
// ventas, cada una desde su único caso de uso en orders o sales.
//
// Desde la 29.6.2 (brief-29.6.2, D-2 y D-5): la reparación de una unidad propia. sendUnitToRepair,
// returnUnitFromRepair y cancelUnitRepair, cada una desde su único caso de uso en service, y
// releaseUnit desde su Server Action. setUnitRepaired, la única escritura que cambia el costo, la llama
// solo returnUnitFromRepair.

const UNIT_REPOSITORY = "src/modules/inventory/unit-repository.ts";
const SERVICE = "src/modules/inventory/service.ts";
const UNITS = "src/modules/inventory/units.ts";
const GRADES = "src/modules/inventory/grades.ts";
const CATALOG_SERVICE = "src/modules/catalog/service.ts";
const ORDERS_SERVICE = "src/modules/orders/service.ts";
const SALES_SERVICE = "src/modules/sales/service.ts";
const UNIT_REPAIRS = "src/modules/inventory/unit-repairs.ts";
const OWN_UNIT_ORDERS = "src/modules/service/own-unit-orders.ts";
const SERVICE_ORDERS = "src/modules/service/service-orders.ts";
const UNIT_ACTIONS =
  "src/app/(autenticado)/productos/[productId]/unidades/actions.ts";
const GRADE_ACTIONS = "src/app/(autenticado)/grados/actions.ts";

const AUTHORIZED = new Map([
  ["insertStockUnit", ["insert stock_units"]],
  ["setUnitsStatus", ["update stock_units"]],
  ["setUnitsWrittenOff", ["update stock_units"]],
  ["setUnitRepaired", ["update stock_units"]],
  ["updateUnitDetails", ["update stock_units"]],
  ["insertGrade", ["insert unit_grades"]],
  ["updateGrade", ["update unit_grades"]],
]);

const TABLES = new Map([
  ["stockunits", "stock_units"],
  ["stock_units", "stock_units"],
  ["unitgrades", "unit_grades"],
  ["unit_grades", "unit_grades"],
]);

const SQL_TABLE = String.raw`(?:"?public"?\s*\.\s*)?"?(stock_units|unit_grades)"?\b|\$\{\s*(?:\w+\.)?(stockUnits|unitGrades)\s*\}`;

const WRITE_PATTERNS = [
  /\.(insert|update|delete)\(\s*(?:\w+\.)?(stockUnits|unitGrades)\s*\)/g,
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

function findUnitWrites(code: string): Write[] {
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
  return findUnitWrites(code)
    .filter(
      ({ operation, fn }) =>
        !(
          file === UNIT_REPOSITORY &&
          fn !== null &&
          AUTHORIZED.get(fn)?.includes(operation)
        ),
    )
    .map(({ line, operation }) => `${file}:${line} ${operation}`);
}

// El único llamador de cada función: el archivo y las funciones desde las que se la llama.
const CALLERS = new Map<string, { file: string; from: string[] }[]>([
  // Las escrituras del repositorio de unidades.
  [
    "insertStockUnit",
    [
      { file: SERVICE, from: ["receiveStock"] },
      { file: UNITS, from: ["registerUnit"] },
    ],
  ],
  [
    "setUnitsWrittenOff",
    [
      { file: SERVICE, from: ["removeReceivedStock"] },
      { file: UNITS, from: ["writeOffUnit"] },
    ],
  ],
  ["updateUnitDetails", [{ file: UNITS, from: ["correctUnit"] }]],
  // Los estados de pedidos y ventas (brief-29.5.2, D-3): cada función de inventory, y cada una desde
  // su caso de uso.
  [
    "setUnitsStatus",
    [
      {
        file: SERVICE,
        from: [
          "reserveStock",
          "releaseStock",
          "deliverStock",
          "sellStock",
          "restoreSaleStock",
        ],
      },
      {
        file: UNIT_REPAIRS,
        from: ["sendUnitToRepair", "cancelUnitRepair", "releaseUnit"],
      },
    ],
  ],
  ["setUnitRepaired", [{ file: UNIT_REPAIRS, from: ["returnUnitFromRepair"] }]],
  // La reparación de una unidad propia (brief-29.6.2, D-2).
  [
    "sendUnitToRepair",
    [{ file: OWN_UNIT_ORDERS, from: ["createOwnUnitServiceOrder"] }],
  ],
  [
    "returnUnitFromRepair",
    [{ file: OWN_UNIT_ORDERS, from: ["markOwnUnitRepaired"] }],
  ],
  [
    "cancelUnitRepair",
    [{ file: SERVICE_ORDERS, from: ["cancelServiceOrder"] }],
  ],
  ["reserveStock", [{ file: ORDERS_SERVICE, from: ["transitionOrder"] }]],
  ["releaseStock", [{ file: ORDERS_SERVICE, from: ["transitionOrder"] }]],
  ["deliverStock", [{ file: ORDERS_SERVICE, from: ["transitionOrder"] }]],
  ["sellStock", [{ file: SALES_SERVICE, from: ["issueSale"] }]],
  ["restoreSaleStock", [{ file: SALES_SERVICE, from: ["voidSale"] }]],
  ["resolveLineUnits", [{ file: ORDERS_SERVICE, from: ["resolveLinesUnits"] }]],
  [
    "resolveLinesUnits",
    [
      { file: ORDERS_SERVICE, from: ["createOrder"] },
      { file: SALES_SERVICE, from: ["issueSale"] },
    ],
  ],
  [
    "insertGrade",
    [{ file: GRADES, from: ["createUnitGrade", "applyGradeTemplate"] }],
  ],
  [
    "updateGrade",
    [
      {
        file: GRADES,
        from: ["updateUnitGrade", "setUnitGradeActive", "moveUnitGrade"],
      },
    ],
  ],
  // El saldo de un alta o una baja manual: el ajuste, y desde la 29.5 la unidad.
  [
    "applyStockChange",
    [
      { file: SERVICE, from: ["adjustStock"] },
      { file: UNITS, from: ["registerUnit", "writeOffUnit"] },
      { file: UNIT_REPAIRS, from: ["sendUnitToRepair", "releaseUnit"] },
    ],
  ],
  // El seguimiento: inventory comprueba, catalog escribe (ADR 0024, R-16; brief-29.5, D-3).
  [
    "lockProductForTrackingChange",
    [{ file: UNITS, from: ["changeProductTracking"] }],
  ],
  ["writeProductTracking", [{ file: UNITS, from: ["changeProductTracking"] }]],
  [
    "updateProductTracking",
    [{ file: CATALOG_SERVICE, from: ["writeProductTracking"] }],
  ],
  // Los casos de uso, cada uno desde su Server Action.
  [
    "changeProductTracking",
    [{ file: UNIT_ACTIONS, from: ["changeTrackingAction"] }],
  ],
  ["registerUnit", [{ file: UNIT_ACTIONS, from: ["registerUnitAction"] }]],
  ["writeOffUnit", [{ file: UNIT_ACTIONS, from: ["writeOffUnitAction"] }]],
  ["correctUnit", [{ file: UNIT_ACTIONS, from: ["correctUnitAction"] }]],
  ["releaseUnit", [{ file: UNIT_ACTIONS, from: ["releaseUnitAction"] }]],
  ["createUnitGrade", [{ file: GRADE_ACTIONS, from: ["createGradeAction"] }]],
  ["updateUnitGrade", [{ file: GRADE_ACTIONS, from: ["updateGradeAction"] }]],
  [
    "setUnitGradeActive",
    [{ file: GRADE_ACTIONS, from: ["setGradeActiveAction"] }],
  ],
  ["moveUnitGrade", [{ file: GRADE_ACTIONS, from: ["moveGradeAction"] }]],
]);

const CALL_PATTERN = new RegExp(
  String.raw`(?<!function\s)\b(?:\w+\.)?(${[...CALLERS.keys()].join("|")})\s*\(`,
  "g",
);

// Una línea de Server Action que pasa la función como valor, sin llamarla, no es una llamada: la
// guarda mira llamadas. Dentro de una flecha, la función que la encierra es la acción.
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

// La copia de los grados de un perfil no autoriza nada: la llama solo el script de capacidades.
// Dentro de src/, solo inventory la nombra.
const TEMPLATE_COPY = /\bapplyGradeTemplate\b/;

function usesTemplateCopy(file: string, code: string): boolean {
  return !file.startsWith("src/modules/inventory/") && TEMPLATE_COPY.test(code);
}

describe("detección de escrituras de las unidades", () => {
  it.each([
    {
      name: "insert de una unidad fuera de la función autorizada",
      file: UNIT_REPOSITORY,
      code: "export async function other(tx) {\n  await tx.insert(stockUnits).values(v);\n}",
    },
    {
      name: "update de una unidad desde el servicio",
      file: UNITS,
      code: "export async function writeOffUnit(tx) {\n  await tx.update(stockUnits).set(v);\n}",
    },
    {
      name: "delete de un grado",
      file: UNIT_REPOSITORY,
      code: "export async function updateGrade(tx) {\n  await tx.delete(unitGrades);\n}",
    },
    {
      name: "SQL literal con esquema",
      file: "src/modules/catalog/repository.ts",
      code: 'await db.execute(sql`update "public"."stock_units" set status = 1`);',
    },
    {
      name: "SQL con la tabla interpolada",
      file: "src/modules/purchasing/goods-receipts.ts",
      code: "await db.execute(sql`insert into ${stockUnits} values (1)`);",
    },
  ])("detecta: $name", ({ file, code }) => {
    expect(findWriteViolations(file, code)).not.toEqual([]);
  });

  it("permite las escrituras autorizadas", () => {
    expect(
      findWriteViolations(
        UNIT_REPOSITORY,
        "export async function insertStockUnit(tx) {\n  await tx.insert(stockUnits).values(v);\n}\nexport async function updateGrade(tx) {\n  await savepoint.update(unitGrades).set(v);\n}",
      ),
    ).toEqual([]);
  });
});

describe("detección de llamadores de las unidades", () => {
  it.each([
    {
      name: "el ajuste creando una unidad",
      file: SERVICE,
      code: "export async function adjustStock(tx) {\n  await unitRepository.insertStockUnit(tx, u);\n}",
    },
    {
      name: "la venta dando de baja unidades",
      file: SERVICE,
      code: "export async function sellStock(tx) {\n  await unitRepository.setUnitsWrittenOff(tx, o, ids);\n}",
    },
    {
      name: "el alta de una unidad desde otra acción",
      file: "src/app/(autenticado)/productos/actions.ts",
      code: "export async function adjustStockAction() {\n  await registerUnit(c, p, i);\n}",
    },
    {
      name: "la baja desde la acción del alta",
      file: UNIT_ACTIONS,
      code: "export async function registerUnitAction() {\n  await writeOffUnit(c, u, r);\n}",
    },
    {
      name: "el seguimiento escrito desde catalog",
      file: CATALOG_SERVICE,
      code: "export async function updateProduct(tx) {\n  await writeProductTracking(tx, o, p, 'unit');\n}",
    },
    {
      name: "el seguimiento escrito por el repositorio desde otra función",
      file: CATALOG_SERVICE,
      code: "export async function updateProduct(tx) {\n  await repository.updateProductTracking(tx, o, p, 'unit');\n}",
    },
    {
      name: "applyStockChange desde la recepción",
      file: SERVICE,
      code: "export async function receiveStock(tx) {\n  await repository.applyStockChange(tx, c);\n}",
    },
    {
      name: "el ajuste reservando unidades",
      file: SERVICE,
      code: "export async function adjustStock(tx) {\n  await unitRepository.setUnitsStatus(tx, o, ids, 'available', 'reserved');\n}",
    },
    {
      name: "la venta vendiendo unidades desde la venta de un pedido",
      file: SALES_SERVICE,
      code: "export async function issueSaleFromOrder(c) {\n  await sellStock(tx, s);\n}",
    },
    {
      name: "la reserva desde la emisión de una venta",
      file: SALES_SERVICE,
      code: "export async function issueSale(c) {\n  await reserveStock(tx, o, l);\n}",
    },
    {
      name: "un grado creado desde la corrección de una unidad",
      file: UNITS,
      code: "export async function correctUnit(tx) {\n  await unitRepository.insertGrade(tx, o, v);\n}",
    },
  ])("detecta: $name", ({ file, code }) => {
    expect(findCallViolations(file, code)).not.toEqual([]);
  });

  it.each([
    {
      name: "la recepción creando unidades",
      file: SERVICE,
      code: "export async function receiveStock(tx) {\n  await unitRepository.insertStockUnit(tx, u);\n}",
    },
    {
      name: "el alta desde su acción, dentro de una flecha",
      file: UNIT_ACTIONS,
      code: "export async function registerUnitAction() {\n  return runForm(r, v, (context) => registerUnit(context, p, v));\n}",
    },
    {
      name: "la venta sin pedido vendiendo sus unidades",
      file: SERVICE,
      code: "export async function sellStock(tx) {\n  await unitRepository.setUnitsStatus(tx, o, ids, 'available', 'sold');\n}",
    },
    {
      name: "el cambio del seguimiento",
      file: UNITS,
      code: "export async function changeProductTracking(tx) {\n  await lockProductForTrackingChange(tx, o, p);\n  await writeProductTracking(tx, o, p, t);\n}",
    },
  ])("permite: $name", ({ file, code }) => {
    expect(findCallViolations(file, code)).toEqual([]);
  });

  it("detecta la copia de los grados fuera de inventory", () => {
    expect(
      usesTemplateCopy(
        "src/app/(autenticado)/grados/actions.ts",
        "await applyGradeTemplate(tx, input);",
      ),
    ).toBe(true);
    expect(
      usesTemplateCopy(
        "src/modules/inventory/index.ts",
        "export { applyGradeTemplate } from './grades';",
      ),
    ).toBe(false);
  });
});

describe("repositorio", () => {
  const files = readdirSync("src", { recursive: true, encoding: "utf8" })
    .map((file) => join("src", file).replaceAll("\\", "/"))
    .filter((file) => /\.tsx?$/.test(file) && !/\.test\.tsx?$/.test(file));

  it("ningún archivo de src/ escribe stock_units ni unit_grades fuera de las funciones autorizadas", () => {
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
  it("el repositorio de unidades tiene exactamente las escrituras autorizadas", () => {
    const writes = findUnitWrites(readFileSync(UNIT_REPOSITORY, "utf8")).map(
      ({ operation, fn }) => `${fn}: ${operation}`,
    );
    expect(writes).toEqual([
      "insertStockUnit: insert stock_units",
      "setUnitsStatus: update stock_units",
      "setUnitsWrittenOff: update stock_units",
      "setUnitRepaired: update stock_units",
      "updateUnitDetails: update stock_units",
      "insertGrade: insert unit_grades",
      "updateGrade: update unit_grades",
    ]);
  });

  it("cada escritura de las unidades se llama solo desde su llamador", () => {
    const violations = files.flatMap((file) =>
      findCallViolations(file, readFileSync(file, "utf8")),
    );
    expect(
      violations,
      `Llamadas no autorizadas:\n${violations.join("\n")}`,
    ).toEqual([]);
  });

  // Que cada regla de llamador tenga al menos una llamada real: una regla sin llamadas es una guarda
  // que no mira nada.
  it("cada función vigilada tiene su llamada en src/", () => {
    const called = new Set(
      files.flatMap((file) =>
        [...readFileSync(file, "utf8").matchAll(CALL_PATTERN)].map(
          (match) => match[1]!,
        ),
      ),
    );
    expect([...CALLERS.keys()].filter((name) => !called.has(name))).toEqual([]);
  });

  it("solo inventory nombra applyGradeTemplate dentro de src/", () => {
    const users = files.filter((file) =>
      usesTemplateCopy(file, readFileSync(file, "utf8")),
    );
    expect(users).toEqual([]);
  });
});

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Guarda de FR-PROD-07 (brief-4.3.1, D-6): en src/, inventories e inventory_movements solo se
// escriben desde las funciones autorizadas de src/modules/inventory/repository.ts.
// Límite: no ve SQL escrito a mano contra la base ni una tabla que llega por un alias.

const REPOSITORY = "src/modules/inventory/repository.ts";

// lockBalance crea la fila en 0 sin tocar un saldo existente; applyStockChange es la única
// que cambia quantity_on_hand, siempre junto con su movimiento.
const AUTHORIZED = new Map([
  ["lockBalance", ["insert inventories"]],
  ["applyStockChange", ["insert inventory_movements", "update inventories"]],
]);

const TABLES = new Map([
  ["inventories", "inventories"],
  ["inventorymovements", "inventory_movements"],
  ["inventory_movements", "inventory_movements"],
]);

// Escrituras con Drizzle y con SQL literal.
const WRITE_PATTERNS = [
  /\.(insert|update|delete)\(\s*(inventories|inventoryMovements)\s*\)/g,
  /\b(insert\s+into|update|delete\s+from)\s+"?(inventories|inventory_movements)\b/gi,
];

const FUNCTION_PATTERN =
  /^(?:export\s+)?(?:async\s+)?function\s+(\w+)[\s\S]*?^\}/gm;

type Write = { line: number; operation: string; fn: string | null };

function findStockWrites(code: string): Write[] {
  const functions = [...code.matchAll(FUNCTION_PATTERN)].map((match) => ({
    name: match[1]!,
    start: match.index,
    end: match.index + match[0].length,
  }));
  return WRITE_PATTERNS.flatMap((pattern) =>
    [...code.matchAll(pattern)].map((match) => ({
      line: code.slice(0, match.index).split("\n").length,
      operation: `${match[1]!.toLowerCase().split(/\s+/)[0]} ${TABLES.get(match[2]!.toLowerCase())}`,
      fn:
        functions.find((f) => match.index >= f.start && match.index < f.end)
          ?.name ?? null,
    })),
  ).sort((a, b) => a.line - b.line);
}

function findViolations(file: string, code: string): string[] {
  return findStockWrites(code)
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

describe("detección de escrituras del saldo", () => {
  it.each([
    {
      name: "update fuera de la función autorizada",
      file: REPOSITORY,
      code: "export async function resetBalance(tx) {\n  await tx.update(inventories).set({ quantityOnHand: '0' });\n}",
    },
    {
      name: "lockBalance insertando un movimiento",
      file: REPOSITORY,
      code: "export async function lockBalance(tx) {\n  await tx.insert(inventoryMovements).values(x);\n}",
    },
    {
      name: "escritura fuera de toda función",
      file: REPOSITORY,
      code: "const reset = (tx) => tx\n  .update(inventories)\n  .set(v);",
    },
    {
      name: "Drizzle en otro archivo",
      file: "src/modules/inventory/service.ts",
      code: "export async function applyStockChange(tx) {\n  await tx.update(inventories).set(v);\n}",
    },
    {
      name: "SQL literal en otro módulo",
      file: "src/modules/catalog/repository.ts",
      code: "await db.execute(sql`UPDATE inventories SET quantity_on_hand = 0`);",
    },
    {
      name: "borrado de movimientos",
      file: "src/app/accion.ts",
      code: 'await db.execute(sql`delete from "inventory_movements"`);',
    },
  ])("detecta: $name", ({ file, code }) => {
    expect(findViolations(file, code)).not.toEqual([]);
  });

  it.each([
    {
      name: "las escrituras de applyStockChange",
      code: "export async function applyStockChange(tx, change) {\n  await tx.insert(inventoryMovements).values(change);\n  await tx\n    .update(inventories)\n    .set(v);\n}",
    },
    {
      name: "la creación de la fila en lockBalance",
      code: "export async function lockBalance(tx) {\n  await tx\n    .insert(inventories)\n    .values(v);\n}",
    },
    {
      name: "una lectura",
      code: "export async function findBalances() {\n  return db.select().from(inventories);\n}",
    },
  ])("permite: $name", ({ code }) => {
    expect(findViolations(REPOSITORY, code)).toEqual([]);
  });
});

describe("repositorio", () => {
  const files = readdirSync("src", { recursive: true, encoding: "utf8" })
    .map((file) => join("src", file).replaceAll("\\", "/"))
    .filter((file) => /\.tsx?$/.test(file));

  it("ningún archivo de src/ escribe el saldo fuera de las funciones autorizadas", () => {
    const violations = files.flatMap((file) =>
      findViolations(file, readFileSync(file, "utf8")),
    );
    expect(files.length).toBeGreaterThan(0);
    expect(
      violations,
      `Escrituras no autorizadas:\n${violations.join("\n")}`,
    ).toEqual([]);
  });

  it("el repositorio tiene exactamente las escrituras autorizadas", () => {
    const writes = findStockWrites(readFileSync(REPOSITORY, "utf8")).map(
      ({ operation, fn }) => `${fn}: ${operation}`,
    );
    expect(writes).toEqual([
      "lockBalance: insert inventories",
      "applyStockChange: insert inventory_movements",
      "applyStockChange: update inventories",
    ]);
  });
});

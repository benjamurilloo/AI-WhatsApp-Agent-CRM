import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Guarda de FR-PROD-07 (brief-4.3.1, D-6): en src/, inventories e inventory_movements solo se
// escriben desde las funciones autorizadas de src/modules/inventory/repository.ts.
//
// Ve: Drizzle (.insert/.update/.delete con la tabla, también por un espacio de nombres), y SQL
// literal con INSERT INTO, UPDATE, DELETE FROM o TRUNCATE sobre el nombre de la tabla (con o sin
// esquema y comillas) o sobre la tabla interpolada (`${inventories}`). Las formas que no son el
// nombre desnudo se sumaron en la 11.3.2 (brief-11.3, D-10): son las que M-2 de la 11.1 encontró
// en price-writes.
// No ve: SQL escrito a mano contra la base; la tabla bajo otro nombre (un alias en el import, una
// variable que la guarda); el nombre armado en tiempo de ejecución; ni una escritura en una CTE o
// en un trigger nuevo.

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

// La tabla en SQL: su nombre, con o sin esquema y comillas, o el objeto de Drizzle interpolado.
// El nombre queda en el grupo 2 o en el 3.
const SQL_TABLE = String.raw`(?:"?public"?\s*\.\s*)?"?(inventories|inventory_movements)"?\b|\$\{\s*(?:\w+\.)?(inventories|inventoryMovements)\s*\}`;

// Escrituras con Drizzle y con SQL literal.
const WRITE_PATTERNS = [
  /\.(insert|update|delete)\(\s*(?:\w+\.)?(inventories|inventoryMovements)\s*\)/g,
  new RegExp(
    String.raw`\b(insert\s+into|update|delete\s+from|truncate(?:\s+table)?)(?:\s+only)?\s+(?:${SQL_TABLE})`,
    "gi",
  ),
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
      operation: `${match[1]!.toLowerCase().split(/\s+/)[0]} ${TABLES.get((match[2] ?? match[3])!.toLowerCase())}`,
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
    // Las formas de M-2 de la 11.1, sumadas en la 11.3.2.
    {
      name: "update con la tabla interpolada en sql",
      file: "src/modules/inventory/service.ts",
      code: "await tx.execute(sql`update ${inventories} set quantity_on_hand = 0`);",
    },
    {
      name: "insert de movimientos con la tabla interpolada",
      file: "src/modules/inventory/service.ts",
      code: "await tx.execute(sql`insert into ${inventoryMovements} (quantity) values (1)`);",
    },
    {
      name: "delete con la tabla interpolada por espacio de nombres",
      file: "src/app/accion.ts",
      code: "await db.execute(sql`delete from ${schema.inventories}`);",
    },
    {
      name: "nombre con esquema",
      file: "src/app/accion.ts",
      code: "await db.execute(sql`UPDATE public.inventories SET quantity_on_hand = 0`);",
    },
    {
      name: "nombre con esquema entre comillas",
      file: "src/app/accion.ts",
      code: 'await db.execute(sql`delete from "public"."inventory_movements"`);',
    },
    {
      name: "Drizzle con import de espacio de nombres",
      file: "src/modules/inventory/service.ts",
      code: "await tx.update(stockSchema.inventories).set(v);",
    },
    {
      name: "TRUNCATE",
      file: "src/app/accion.ts",
      code: "await db.execute(sql`TRUNCATE inventories`);",
    },
    {
      name: "TRUNCATE TABLE ONLY",
      file: "src/app/accion.ts",
      code: "await db.execute(sql`truncate table only inventory_movements`);",
    },
    {
      name: "UPDATE ONLY",
      file: "src/app/accion.ts",
      code: "await db.execute(sql`UPDATE ONLY inventories SET quantity_on_hand = 0`);",
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
    {
      name: "una lectura con la tabla interpolada",
      code: "export async function countBalances() {\n  return db.execute(sql`select count(*) from ${inventories}`);\n}",
    },
    {
      name: "la escritura de otra tabla de nombre parecido",
      code: "export async function touch() {\n  await db.execute(sql`update products set name = 1`);\n  await db.execute(sql`delete from inventories_archive`);\n}",
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

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Guarda de las ventas (brief-20.2, D-3 y AC-9): en src/, sales y sale_lines solo se escriben
// desde las funciones autorizadas de src/modules/sales/repository.ts, y nada las actualiza ni las
// borra. Es la tercera defensa, después de los privilegios de crm_app y del trigger de la migración
// 0039: crm_app tiene INSERT en las dos, así que la base no rechaza una venta escrita fuera de
// sales, sin el pedido bloqueado, sin número y sin auditoría. Desde la 20.4 (brief-20.4), también
// sale_voids, la anulación, que solo escribe insertSaleVoid y que el trigger de la 0041 defiende.
//
// Ve: Drizzle (.insert/.update/.delete con la tabla, también por un espacio de nombres), y SQL
// literal con INSERT INTO, UPDATE, DELETE FROM o TRUNCATE sobre el nombre de la tabla (con o sin
// esquema y comillas) o sobre la tabla interpolada (`${sales}`), como order-writes.
// No ve: SQL escrito a mano contra la base; la tabla bajo otro nombre (un alias en el import, una
// variable que la guarda); el nombre armado en tiempo de ejecución; ni una escritura en una CTE, en
// un MERGE INTO o en un trigger nuevo.

const REPOSITORY = "src/modules/sales/repository.ts";

// La emisión inserta la cabecera, sus líneas y, desde la 29.5.2, las unidades de sus líneas
// (brief-29.5.2, D-4), y la anulación, su comprobante. Nada más escribe: ni la venta ni la anulación
// cambian nunca.
const AUTHORIZED = new Map([
  ["insertSale", ["insert sales"]],
  ["insertSaleLines", ["insert sale_lines"]],
  ["insertSaleLineUnits", ["insert sale_line_units"]],
  ["insertSaleVoid", ["insert sale_voids"]],
]);

const TABLES = new Map([
  ["sales", "sales"],
  ["salelines", "sale_lines"],
  ["sale_lines", "sale_lines"],
  ["salelineunits", "sale_line_units"],
  ["sale_line_units", "sale_line_units"],
  ["salevoids", "sale_voids"],
  ["sale_voids", "sale_voids"],
]);

// La tabla en SQL: su nombre, con o sin esquema y comillas, o el objeto de Drizzle interpolado.
// El nombre queda en el grupo 2 o en el 3.
const SQL_TABLE = String.raw`(?:"?public"?\s*\.\s*)?"?(sales|sale_lines|sale_line_units|sale_voids)"?\b|\$\{\s*(?:\w+\.)?(sales|saleLines|saleLineUnits|saleVoids)\s*\}`;

const WRITE_PATTERNS = [
  /\.(insert|update|delete)\(\s*(?:\w+\.)?(sales|saleLines|saleLineUnits|saleVoids)\s*\)/g,
  new RegExp(
    String.raw`\b(insert\s+into|update|delete\s+from|truncate(?:\s+table)?)(?:\s+only)?\s+(?:${SQL_TABLE})`,
    "gi",
  ),
];

const FUNCTION_PATTERN =
  /^(?:export\s+)?(?:async\s+)?function\s+(\w+)[\s\S]*?^\}/gm;

type Write = { line: number; operation: string; fn: string | null };

function findSaleWrites(code: string): Write[] {
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
  return findSaleWrites(code)
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

describe("detección de escrituras de ventas", () => {
  it.each([
    {
      name: "insert fuera de la función autorizada",
      file: REPOSITORY,
      code: "export async function seedSale(tx) {\n  await tx.insert(sales).values(v);\n}",
    },
    {
      name: "update de una venta, aun desde la función autorizada",
      file: REPOSITORY,
      code: "export async function insertSale(tx) {\n  await tx\n    .update(sales)\n    .set({ total: '1' });\n}",
    },
    {
      name: "delete de las líneas con Drizzle",
      file: REPOSITORY,
      code: "export async function insertSaleLines(tx) {\n  await tx.delete(saleLines);\n}",
    },
    {
      name: "la cabecera insertada desde la función de las líneas",
      file: REPOSITORY,
      code: "export async function insertSaleLines(tx) {\n  await tx.insert(sales).values(v);\n}",
    },
    {
      name: "escritura fuera de toda función",
      file: REPOSITORY,
      code: "const add = (tx) => tx\n  .insert(sales)\n  .values(v);",
    },
    {
      name: "la función autorizada en otro archivo",
      file: "src/modules/orders/service.ts",
      code: "export async function insertSale(tx) {\n  await tx.insert(sales).values(v);\n}",
    },
    {
      name: "SQL literal de insert en otro módulo",
      file: "src/modules/orders/repository.ts",
      code: "await tx.execute(sql`INSERT INTO sales (number) VALUES (1)`);",
    },
    {
      name: "SQL literal de delete de líneas en la aplicación",
      file: "src/app/accion.ts",
      code: 'await db.execute(sql`delete from "sale_lines"`);',
    },
    {
      name: "insert con la tabla interpolada",
      file: "src/modules/sales/service.ts",
      code: "await tx.execute(sql`insert into ${saleLines} (quantity) values (1)`);",
    },
    {
      name: "update con la tabla interpolada por espacio de nombres",
      file: "src/app/accion.ts",
      code: "await db.execute(sql`update ${schema.sales} set total = 1`);",
    },
    {
      name: "nombre con esquema entre comillas",
      file: "src/app/accion.ts",
      code: 'await db.execute(sql`update "public"."sales" set total = 1`);',
    },
    {
      name: "Drizzle con import de espacio de nombres",
      file: "src/modules/sales/service.ts",
      code: "await tx.insert(saleSchema.saleLines).values(v);",
    },
    {
      name: "TRUNCATE TABLE ONLY",
      file: "src/app/accion.ts",
      code: "await db.execute(sql`truncate table only sales`);",
    },
    // Desde la 20.4 (brief-20.4, AC-9): la anulación.
    {
      name: "la anulación insertada fuera de su función",
      file: REPOSITORY,
      code: "export async function insertSale(tx) {\n  await tx.insert(saleVoids).values(v);\n}",
    },
    {
      name: "update de una anulación desde su función",
      file: REPOSITORY,
      code: "export async function insertSaleVoid(tx) {\n  await tx.update(saleVoids).set({ reason: 'other' });\n}",
    },
    {
      name: "delete de anulaciones por SQL literal en sales",
      file: "src/modules/sales/service.ts",
      code: "await tx.execute(sql`delete from sale_voids where sale_id = ${id}`);",
    },
    {
      name: "una anulación insertada desde inventory",
      file: "src/modules/inventory/repository.ts",
      code: 'await tx.execute(sql`insert into "sale_voids" (number) values (1)`);',
    },
    // Desde la 29.5.2 (brief-29.5.2, D-4): las unidades de cada línea.
    {
      name: "las unidades de una línea insertadas desde la función de las líneas",
      file: REPOSITORY,
      code: "export async function insertSaleLines(tx) {\n  await tx.insert(saleLineUnits).values(v);\n}",
    },
    {
      name: "delete de las unidades de una línea en SQL",
      file: "src/modules/sales/service.ts",
      code: "await tx.execute(sql`delete from sale_line_units`);",
    },
  ])("detecta: $name", ({ file, code }) => {
    expect(findViolations(file, code)).not.toEqual([]);
  });

  it.each([
    {
      name: "las escrituras autorizadas",
      code: "export async function insertSale(tx, sale) {\n  const rows = await tx.insert(sales).values(sale).returning(c);\n}\nexport async function insertSaleLines(tx) {\n  await tx\n    .insert(saleLines)\n    .values(v);\n}",
    },
    {
      name: "una lectura con una subconsulta de las líneas",
      code: 'export function findSales() {\n  return db.select({ n: sql`(select count(*) from sale_lines l where l.sale_id = "sales"."id")` }).from(sales);\n}',
    },
    {
      name: "una lectura con una subconsulta de las anulaciones",
      code: 'export function findSales() {\n  return db.select({ n: sql`(select v.number from sale_voids v where v.sale_id = "sales"."id")` }).from(sales);\n}',
    },
    {
      name: "la escritura de otra tabla de nombre parecido",
      code: "export async function touch() {\n  await db.execute(sql`update sales_archive set x = 1`);\n  await db.execute(sql`delete from sale_lines_old`);\n}",
    },
  ])("permite: $name", ({ code }) => {
    expect(findViolations(REPOSITORY, code)).toEqual([]);
  });
});

describe("repositorio", () => {
  const files = readdirSync("src", { recursive: true, encoding: "utf8" })
    .map((file) => join("src", file).replaceAll("\\", "/"))
    .filter((file) => /\.tsx?$/.test(file));

  it("ningún archivo de src/ escribe ventas fuera de las funciones autorizadas", () => {
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
    const writes = findSaleWrites(readFileSync(REPOSITORY, "utf8")).map(
      ({ operation, fn }) => `${fn}: ${operation}`,
    );
    expect(writes).toEqual([
      "insertSale: insert sales",
      "insertSaleLines: insert sale_lines",
      "insertSaleLineUnits: insert sale_line_units",
      "insertSaleVoid: insert sale_voids",
    ]);
  });
});

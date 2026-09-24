import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Guarda de FR-PROD-13 (brief-11.1, AC-10): en src/, product_prices solo se escribe desde
// insertProductPrice de src/modules/catalog/repository.ts, y nunca con update ni delete. Es la
// tercera defensa, después de los privilegios de crm_app y del trigger de la migración 0017, y la
// única frente a un INSERT: crm_app lo tiene, así que la base no rechaza un precio escrito fuera
// de insertProductPrice, sin bloqueo, sin CONFLICT y sin auditoría.
//
// Ve: Drizzle (.insert/.update/.delete con la tabla, también por un espacio de nombres), y SQL
// literal con INSERT INTO, UPDATE, DELETE FROM o TRUNCATE sobre el nombre de la tabla (con o sin
// esquema y comillas) o sobre la tabla interpolada (`${productPrices}`).
// No ve: SQL escrito a mano contra la base; la tabla bajo otro nombre (un alias en el import, una
// variable que la guarda); el nombre armado en tiempo de ejecución (sql.raw con texto
// concatenado); ni una escritura en una CTE o en un trigger nuevo. Esos límites los cubren, para
// UPDATE, DELETE y TRUNCATE de crm_app, los privilegios; para el INSERT, nada más que esta guarda.

const REPOSITORY = "src/modules/catalog/repository.ts";

// Un precio se agrega; el anterior queda en el historial.
const AUTHORIZED = new Map([["insertProductPrice", ["insert product_prices"]]]);

// La tabla en SQL: su nombre, con o sin esquema y comillas, o el objeto de Drizzle interpolado.
const SQL_TABLE = String.raw`(?:"?public"?\s*\.\s*)?"?product_prices"?\b|\$\{\s*(?:\w+\.)?productPrices\s*\}`;

// Escrituras con Drizzle y con SQL literal (revisión independiente de la 11.1, M-2).
const WRITE_PATTERNS = [
  /\.(insert|update|delete)\(\s*(?:\w+\.)?productPrices\s*\)/g,
  new RegExp(
    String.raw`\b(insert\s+into|update|delete\s+from|truncate(?:\s+table)?)(?:\s+only)?\s+(?:${SQL_TABLE})`,
    "gi",
  ),
];

const FUNCTION_PATTERN =
  /^(?:export\s+)?(?:async\s+)?function\s+(\w+)[\s\S]*?^\}/gm;

type Write = { line: number; operation: string; fn: string | null };

function findPriceWrites(code: string): Write[] {
  const functions = [...code.matchAll(FUNCTION_PATTERN)].map((match) => ({
    name: match[1]!,
    start: match.index,
    end: match.index + match[0].length,
  }));
  return WRITE_PATTERNS.flatMap((pattern) =>
    [...code.matchAll(pattern)].map((match) => ({
      line: code.slice(0, match.index).split("\n").length,
      operation: `${match[1]!.toLowerCase().split(/\s+/)[0]} product_prices`,
      fn:
        functions.find((f) => match.index >= f.start && match.index < f.end)
          ?.name ?? null,
    })),
  ).sort((a, b) => a.line - b.line);
}

function findViolations(file: string, code: string): string[] {
  return findPriceWrites(code)
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

describe("detección de escrituras de precios", () => {
  it.each([
    {
      name: "insert fuera de la función autorizada",
      file: REPOSITORY,
      code: "export async function seedPrice(tx) {\n  await tx.insert(productPrices).values(v);\n}",
    },
    {
      name: "update dentro de la función autorizada",
      file: REPOSITORY,
      code: "export async function insertProductPrice(tx) {\n  await tx\n    .update(productPrices)\n    .set({ amount: '1' });\n}",
    },
    {
      name: "delete con Drizzle",
      file: REPOSITORY,
      code: "export async function clearPrices(tx) {\n  await tx.delete(productPrices);\n}",
    },
    {
      name: "escritura fuera de toda función",
      file: REPOSITORY,
      code: "const add = (tx) => tx\n  .insert(productPrices)\n  .values(v);",
    },
    {
      name: "la función autorizada en otro archivo",
      file: "src/modules/catalog/service.ts",
      code: "export async function insertProductPrice(tx) {\n  await tx.insert(productPrices).values(v);\n}",
    },
    {
      name: "SQL literal de update en otro módulo",
      file: "src/modules/inventory/repository.ts",
      code: "await db.execute(sql`UPDATE product_prices SET amount = 1`);",
    },
    {
      name: "SQL literal de delete en la aplicación",
      file: "src/app/accion.ts",
      code: 'await db.execute(sql`delete from "product_prices"`);',
    },
    // Revisión independiente de la 11.1, M-2: formas que la primera versión no veía.
    {
      name: "delete con la tabla interpolada en sql",
      file: "src/modules/catalog/service.ts",
      code: "await tx.execute(sql`delete from ${productPrices} where id = ${id}`);",
    },
    {
      name: "insert con la tabla interpolada en sql",
      file: "src/modules/catalog/service.ts",
      code: "await tx.execute(sql`insert into ${productPrices} (amount) values (1)`);",
    },
    {
      name: "update con la tabla interpolada por espacio de nombres",
      file: "src/app/accion.ts",
      code: "await db.execute(sql`update ${schema.productPrices} set amount = 1`);",
    },
    {
      name: "nombre con esquema",
      file: "src/app/accion.ts",
      code: "await db.execute(sql`DELETE FROM public.product_prices`);",
    },
    {
      name: "nombre con esquema entre comillas",
      file: "src/app/accion.ts",
      code: 'await db.execute(sql`update "public"."product_prices" set amount = 1`);',
    },
    {
      name: "Drizzle con import de espacio de nombres",
      file: "src/modules/catalog/service.ts",
      code: "await tx.insert(catalogSchema.productPrices).values(v);",
    },
    {
      name: "TRUNCATE",
      file: "src/app/accion.ts",
      code: "await db.execute(sql`TRUNCATE product_prices`);",
    },
    {
      name: "TRUNCATE TABLE ONLY",
      file: "src/app/accion.ts",
      code: "await db.execute(sql`truncate table only product_prices`);",
    },
    {
      name: "UPDATE ONLY",
      file: "src/app/accion.ts",
      code: "await db.execute(sql`UPDATE ONLY product_prices SET amount = 1`);",
    },
  ])("detecta: $name", ({ file, code }) => {
    expect(findViolations(file, code)).not.toEqual([]);
  });

  it.each([
    {
      name: "el insert de insertProductPrice",
      code: "export async function insertProductPrice(tx, price) {\n  const rows = await tx\n    .insert(productPrices)\n    .values(price)\n    .returning(c);\n}",
    },
    {
      name: "una lectura",
      code: "export async function findPrices() {\n  return db.select().from(productPrices);\n}",
    },
    {
      name: "una lectura con la tabla interpolada",
      code: "export async function countPrices() {\n  return db.execute(sql`select count(*) from ${productPrices}`);\n}",
    },
    {
      name: "la escritura de otra tabla de nombre parecido",
      code: "export async function touch() {\n  await db.execute(sql`update products set name = 1`);\n  await db.execute(sql`delete from product_prices_archive`);\n}",
    },
  ])("permite: $name", ({ code }) => {
    expect(findViolations(REPOSITORY, code)).toEqual([]);
  });
});

describe("repositorio", () => {
  const files = readdirSync("src", { recursive: true, encoding: "utf8" })
    .map((file) => join("src", file).replaceAll("\\", "/"))
    .filter((file) => /\.tsx?$/.test(file));

  it("ningún archivo de src/ escribe precios fuera de la función autorizada", () => {
    const violations = files.flatMap((file) =>
      findViolations(file, readFileSync(file, "utf8")),
    );
    expect(files.length).toBeGreaterThan(0);
    expect(
      violations,
      `Escrituras no autorizadas:\n${violations.join("\n")}`,
    ).toEqual([]);
  });

  // Si el repositorio cambiara de patrón, la guarda quedaría vacía y seguiría en verde: este caso
  // exige encontrar la escritura autorizada.
  it("el repositorio tiene exactamente la escritura autorizada", () => {
    const writes = findPriceWrites(readFileSync(REPOSITORY, "utf8")).map(
      ({ operation, fn }) => `${fn}: ${operation}`,
    );
    expect(writes).toEqual(["insertProductPrice: insert product_prices"]);
  });
});

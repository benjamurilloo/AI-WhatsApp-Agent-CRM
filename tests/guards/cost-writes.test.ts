import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Guarda de FR-PROD-20 (brief-18.2, AC-7; desde la 22.4, también sus llamadores, al pie), copia de
// price-writes con la tabla de costos: en src/, product_costs solo se escribe desde
// insertProductCost de src/modules/catalog/repository.ts, y nunca con update ni delete. Es la
// tercera defensa, después de los privilegios de crm_app y del trigger de la migración 0035, y la
// única frente a un INSERT: crm_app lo tiene, así que la base no rechaza un costo escrito fuera de
// insertProductCost, sin bloqueo, sin CONFLICT y sin auditoría.
//
// Ve: Drizzle (.insert/.update/.delete con la tabla, también por un espacio de nombres), y SQL
// literal con INSERT INTO, UPDATE, DELETE FROM o TRUNCATE sobre el nombre de la tabla (con o sin
// esquema y comillas) o sobre la tabla interpolada (`${productCosts}`).
// No ve: SQL escrito a mano contra la base; la tabla bajo otro nombre (un alias en el import, una
// variable que la guarda); el nombre armado en tiempo de ejecución (sql.raw con texto
// concatenado); ni una escritura en una CTE o en un trigger nuevo. Esos límites los cubren, para
// UPDATE, DELETE y TRUNCATE de crm_app, los privilegios; para el INSERT, nada más que esta guarda.

const REPOSITORY = "src/modules/catalog/repository.ts";

// Un costo se agrega; el anterior queda en el historial.
const AUTHORIZED = new Map([["insertProductCost", ["insert product_costs"]]]);

// La tabla en SQL: su nombre, con o sin esquema y comillas, o el objeto de Drizzle interpolado.
const SQL_TABLE = String.raw`(?:"?public"?\s*\.\s*)?"?product_costs"?\b|\$\{\s*(?:\w+\.)?productCosts\s*\}`;

// Escrituras con Drizzle y con SQL literal (heredadas de price-writes: revisión independiente de la 11.1, M-2).
const WRITE_PATTERNS = [
  /\.(insert|update|delete)\(\s*(?:\w+\.)?productCosts\s*\)/g,
  new RegExp(
    String.raw`\b(insert\s+into|update|delete\s+from|truncate(?:\s+table)?)(?:\s+only)?\s+(?:${SQL_TABLE})`,
    "gi",
  ),
];

const FUNCTION_PATTERN =
  /^(?:export\s+)?(?:async\s+)?function\s+(\w+)[\s\S]*?^\}/gm;

type Write = { line: number; operation: string; fn: string | null };

function findCostWrites(code: string): Write[] {
  const functions = [...code.matchAll(FUNCTION_PATTERN)].map((match) => ({
    name: match[1]!,
    start: match.index,
    end: match.index + match[0].length,
  }));
  return WRITE_PATTERNS.flatMap((pattern) =>
    [...code.matchAll(pattern)].map((match) => ({
      line: code.slice(0, match.index).split("\n").length,
      operation: `${match[1]!.toLowerCase().split(/\s+/)[0]} product_costs`,
      fn:
        functions.find((f) => match.index >= f.start && match.index < f.end)
          ?.name ?? null,
    })),
  ).sort((a, b) => a.line - b.line);
}

function findViolations(file: string, code: string): string[] {
  return findCostWrites(code)
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

describe("detección de escrituras de costos", () => {
  it.each([
    {
      name: "insert fuera de la función autorizada",
      file: REPOSITORY,
      code: "export async function seedCost(tx) {\n  await tx.insert(productCosts).values(v);\n}",
    },
    {
      name: "update dentro de la función autorizada",
      file: REPOSITORY,
      code: "export async function insertProductCost(tx) {\n  await tx\n    .update(productCosts)\n    .set({ amount: '1' });\n}",
    },
    {
      name: "delete con Drizzle",
      file: REPOSITORY,
      code: "export async function clearCosts(tx) {\n  await tx.delete(productCosts);\n}",
    },
    {
      name: "escritura fuera de toda función",
      file: REPOSITORY,
      code: "const add = (tx) => tx\n  .insert(productCosts)\n  .values(v);",
    },
    {
      name: "la función autorizada en otro archivo",
      file: "src/modules/catalog/service.ts",
      code: "export async function insertProductCost(tx) {\n  await tx.insert(productCosts).values(v);\n}",
    },
    {
      name: "SQL literal de update en otro módulo",
      file: "src/modules/inventory/repository.ts",
      code: "await db.execute(sql`UPDATE product_costs SET amount = 1`);",
    },
    {
      name: "SQL literal de delete en la aplicación",
      file: "src/app/accion.ts",
      code: 'await db.execute(sql`delete from "product_costs"`);',
    },
    // Las formas que la revisión independiente de la 11.1 (M-2) agregó a price-writes.
    {
      name: "delete con la tabla interpolada en sql",
      file: "src/modules/catalog/service.ts",
      code: "await tx.execute(sql`delete from ${productCosts} where id = ${id}`);",
    },
    {
      name: "insert con la tabla interpolada en sql",
      file: "src/modules/catalog/service.ts",
      code: "await tx.execute(sql`insert into ${productCosts} (amount) values (1)`);",
    },
    {
      name: "update con la tabla interpolada por espacio de nombres",
      file: "src/app/accion.ts",
      code: "await db.execute(sql`update ${schema.productCosts} set amount = 1`);",
    },
    {
      name: "nombre con esquema",
      file: "src/app/accion.ts",
      code: "await db.execute(sql`DELETE FROM public.product_costs`);",
    },
    {
      name: "nombre con esquema entre comillas",
      file: "src/app/accion.ts",
      code: 'await db.execute(sql`update "public"."product_costs" set amount = 1`);',
    },
    {
      name: "Drizzle con import de espacio de nombres",
      file: "src/modules/catalog/service.ts",
      code: "await tx.insert(catalogSchema.productCosts).values(v);",
    },
    {
      name: "TRUNCATE",
      file: "src/app/accion.ts",
      code: "await db.execute(sql`TRUNCATE product_costs`);",
    },
    {
      name: "TRUNCATE TABLE ONLY",
      file: "src/app/accion.ts",
      code: "await db.execute(sql`truncate table only product_costs`);",
    },
    {
      name: "UPDATE ONLY",
      file: "src/app/accion.ts",
      code: "await db.execute(sql`UPDATE ONLY product_costs SET amount = 1`);",
    },
  ])("detecta: $name", ({ file, code }) => {
    expect(findViolations(file, code)).not.toEqual([]);
  });

  it.each([
    {
      name: "el insert de insertProductCost",
      code: "export async function insertProductCost(tx, cost) {\n  const rows = await tx\n    .insert(productCosts)\n    .values(cost)\n    .returning(c);\n}",
    },
    {
      name: "una lectura",
      code: "export async function findCosts() {\n  return db.select().from(productCosts);\n}",
    },
    {
      name: "una lectura con la tabla interpolada",
      code: "export async function countCosts() {\n  return db.execute(sql`select count(*) from ${productCosts}`);\n}",
    },
    {
      name: "la escritura de otra tabla de nombre parecido",
      code: "export async function touch() {\n  await db.execute(sql`update products set name = 1`);\n  await db.execute(sql`delete from product_costs_archive`);\n}",
    },
  ])("permite: $name", ({ code }) => {
    expect(findViolations(REPOSITORY, code)).toEqual([]);
  });
});

describe("repositorio", () => {
  const files = readdirSync("src", { recursive: true, encoding: "utf8" })
    .map((file) => join("src", file).replaceAll("\\", "/"))
    .filter((file) => /\.tsx?$/.test(file));

  it("ningún archivo de src/ escribe costos fuera de la función autorizada", () => {
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
    const writes = findCostWrites(readFileSync(REPOSITORY, "utf8")).map(
      ({ operation, fn }) => `${fn}: ${operation}`,
    );
    expect(writes).toEqual(["insertProductCost: insert product_costs"]);
  });
});

// Quién llama a la escritura del costo (brief-22.4, D-4). La guarda de arriba autoriza la función del
// repositorio, pero no ve quién la llama. Desde la 22.4 hay dos llamadores: setProductCost, la ficha
// del producto, que bloquea el producto y compara con el costo que vio quien edita; y
// recordReceivedCosts, el costo de una recepción, que no compara porque purchasing ya bloqueó los
// productos y los saldos (H-2). insertProductCost se llama solo desde esas dos funciones del
// servicio de catalog, y recordReceivedCosts, fuera de catalog, solo desde src/modules/purchasing/.
// Ve llamadas por nombre (también con espacio de nombres); no ve un alias ni una referencia guardada
// en una variable, y fija la carpeta de purchasing, no la función.

const SERVICE = "src/modules/catalog/service.ts";
const PURCHASING = "src/modules/purchasing/";

const CALL_PATTERN =
  /(?<!function\s)\b(?:\w+\.)?(insertProductCost|recordReceivedCosts)\s*\(/g;

function findCallViolations(file: string, code: string): string[] {
  const functions = [...code.matchAll(FUNCTION_PATTERN)].map((match) => ({
    name: match[1]!,
    start: match.index,
    end: match.index + match[0].length,
  }));
  return [...code.matchAll(CALL_PATTERN)].flatMap((match) => {
    const callee = match[1]!;
    const fn =
      functions.find((f) => match.index >= f.start && match.index < f.end)
        ?.name ?? null;
    const line = code.slice(0, match.index).split("\n").length;
    if (file === REPOSITORY) return [];
    if (callee === "insertProductCost") {
      return file === SERVICE &&
        fn !== null &&
        ["setProductCost", "recordReceivedCosts"].includes(fn)
        ? []
        : [`${file}:${line} ${callee} desde ${fn ?? "fuera de una función"}`];
    }
    if (file === SERVICE || file.startsWith(PURCHASING)) return [];
    return [`${file}:${line} ${callee}`];
  });
}

describe("llamadores de la escritura del costo", () => {
  it.each([
    {
      name: "otra función del servicio llamando a insertProductCost",
      file: SERVICE,
      code: "export async function setProductPrice(tx) {\n  await repository.insertProductCost(tx, c);\n}",
    },
    {
      name: "insertProductCost desde purchasing",
      file: "src/modules/purchasing/goods-receipts.ts",
      code: "export async function createGoodsReceipt(tx) {\n  await insertProductCost(tx, c);\n}",
    },
    {
      name: "insertProductCost fuera de una función",
      file: SERVICE,
      code: "const add = (tx) => repository.insertProductCost(tx, c);",
    },
    {
      name: "recordReceivedCosts desde sales",
      file: "src/modules/sales/service.ts",
      code: "export async function issueSale(tx) {\n  await recordReceivedCosts(tx, r);\n}",
    },
    {
      name: "recordReceivedCosts desde una Server Action",
      file: "src/app/(autenticado)/productos/[productId]/costos/actions.ts",
      code: "export async function setCostAction() {\n  await catalog.recordReceivedCosts(tx, r);\n}",
    },
  ])("detecta: $name", ({ file, code }) => {
    expect(findCallViolations(file, code)).not.toEqual([]);
  });

  it.each([
    {
      name: "setProductCost escribiendo",
      file: SERVICE,
      code: "export async function setProductCost(tx) {\n  await repository.insertProductCost(tx, c);\n}",
    },
    {
      name: "recordReceivedCosts escribiendo",
      file: SERVICE,
      code: "export async function recordReceivedCosts(tx) {\n  await repository.insertProductCost(tx, c);\n}",
    },
    {
      name: "purchasing llamando a recordReceivedCosts",
      file: "src/modules/purchasing/goods-receipts.ts",
      code: "export async function createGoodsReceipt() {\n  await recordReceivedCosts(tx, r);\n}",
    },
    {
      name: "la definición de la función no es una llamada",
      file: "src/modules/sales/service.ts",
      code: "export async function recordReceivedCosts(tx) {\n  return 1;\n}",
    },
  ])("permite: $name", ({ file, code }) => {
    expect(findCallViolations(file, code)).toEqual([]);
  });

  it("en src/, la escritura del costo se llama solo desde donde se autoriza", () => {
    const files = readdirSync("src", { recursive: true, encoding: "utf8" })
      .map((file) => join("src", file).replaceAll("\\", "/"))
      .filter((file) => /\.tsx?$/.test(file));
    const violations = files.flatMap((file) =>
      findCallViolations(file, readFileSync(file, "utf8")),
    );
    expect(
      violations,
      `Llamadas no autorizadas:\n${violations.join("\n")}`,
    ).toEqual([]);
  });

  // Si alguno de los dos llamadores dejara de llamar, la guarda seguiría en verde sin probar nada.
  it("el servicio de catalog tiene exactamente las dos llamadas autorizadas", () => {
    const code = readFileSync(SERVICE, "utf8");
    const functions = [...code.matchAll(FUNCTION_PATTERN)].map((match) => ({
      name: match[1]!,
      start: match.index,
      end: match.index + match[0].length,
    }));
    const callers = [...code.matchAll(CALL_PATTERN)]
      .filter((match) => match[1] === "insertProductCost")
      .map(
        (match) =>
          functions.find((f) => match.index >= f.start && match.index < f.end)
            ?.name,
      );
    expect(callers).toEqual(["setProductCost", "recordReceivedCosts"]);
  });
});

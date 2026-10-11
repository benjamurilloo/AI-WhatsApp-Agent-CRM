import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Guarda de los pedidos (brief-19.2, D-4 y AC-11): en src/, orders y order_lines solo se escriben
// desde las funciones autorizadas de src/modules/orders/repository.ts, y nada los borra. Es la
// tercera defensa, después de los privilegios de crm_app y del trigger de la migración 0036: crm_app
// tiene INSERT en las dos y UPDATE en orders, así que la base no rechaza un pedido escrito fuera de
// orders, sin número, sin bloqueos y sin auditoría.
//
// Ve: Drizzle (.insert/.update/.delete con la tabla, también por un espacio de nombres), y SQL
// literal con INSERT INTO, UPDATE, DELETE FROM o TRUNCATE sobre el nombre de la tabla (con o sin
// esquema y comillas) o sobre la tabla interpolada (`${orders}`), como price-writes.
// No ve: SQL escrito a mano contra la base; la tabla bajo otro nombre (un alias en el import, una
// variable que la guarda); el nombre armado en tiempo de ejecución; ni una escritura en una CTE o en
// un trigger nuevo.

const REPOSITORY = "src/modules/orders/repository.ts";

// El alta inserta la cabecera y sus líneas; una transición cambia el estado y su fecha.
const AUTHORIZED = new Map([
  ["insertOrder", ["insert orders"]],
  ["insertOrderLines", ["insert order_lines"]],
  ["updateOrderStatus", ["update orders"]],
]);

const TABLES = new Map([
  ["orders", "orders"],
  ["orderlines", "order_lines"],
  ["order_lines", "order_lines"],
]);

// La tabla en SQL: su nombre, con o sin esquema y comillas, o el objeto de Drizzle interpolado.
// El nombre queda en el grupo 2 o en el 3.
const SQL_TABLE = String.raw`(?:"?public"?\s*\.\s*)?"?(orders|order_lines)"?\b|\$\{\s*(?:\w+\.)?(orders|orderLines)\s*\}`;

const WRITE_PATTERNS = [
  /\.(insert|update|delete)\(\s*(?:\w+\.)?(orders|orderLines)\s*\)/g,
  new RegExp(
    String.raw`\b(insert\s+into|update|delete\s+from|truncate(?:\s+table)?)(?:\s+only)?\s+(?:${SQL_TABLE})`,
    "gi",
  ),
];

const FUNCTION_PATTERN =
  /^(?:export\s+)?(?:async\s+)?function\s+(\w+)[\s\S]*?^\}/gm;

type Write = { line: number; operation: string; fn: string | null };

function findOrderWrites(code: string): Write[] {
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
  return findOrderWrites(code)
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

describe("detección de escrituras de pedidos", () => {
  it.each([
    {
      name: "insert fuera de la función autorizada",
      file: REPOSITORY,
      code: "export async function seedOrder(tx) {\n  await tx.insert(orders).values(v);\n}",
    },
    {
      name: "update de las líneas",
      file: REPOSITORY,
      code: "export async function insertOrderLines(tx) {\n  await tx\n    .update(orderLines)\n    .set({ quantity: '1' });\n}",
    },
    {
      name: "delete de un pedido con Drizzle",
      file: REPOSITORY,
      code: "export async function updateOrderStatus(tx) {\n  await tx.delete(orders);\n}",
    },
    {
      name: "la cabecera insertada desde la función de las líneas",
      file: REPOSITORY,
      code: "export async function insertOrderLines(tx) {\n  await tx.insert(orders).values(v);\n}",
    },
    {
      name: "escritura fuera de toda función",
      file: REPOSITORY,
      code: "const add = (tx) => tx\n  .update(orders)\n  .set(v);",
    },
    {
      name: "la función autorizada en otro archivo",
      file: "src/modules/orders/service.ts",
      code: "export async function updateOrderStatus(tx) {\n  await tx.update(orders).set(v);\n}",
    },
    {
      name: "SQL literal de update en otro módulo",
      file: "src/modules/crm/repository.ts",
      code: "await db.execute(sql`UPDATE orders SET status = 'cancelled'`);",
    },
    {
      name: "SQL literal de delete de líneas en la aplicación",
      file: "src/app/accion.ts",
      code: 'await db.execute(sql`delete from "order_lines"`);',
    },
    {
      name: "insert con la tabla interpolada",
      file: "src/modules/orders/service.ts",
      code: "await tx.execute(sql`insert into ${orderLines} (quantity) values (1)`);",
    },
    {
      name: "update con la tabla interpolada por espacio de nombres",
      file: "src/app/accion.ts",
      code: "await db.execute(sql`update ${schema.orders} set total = 1`);",
    },
    {
      name: "nombre con esquema entre comillas",
      file: "src/app/accion.ts",
      code: 'await db.execute(sql`update "public"."orders" set total = 1`);',
    },
    {
      name: "Drizzle con import de espacio de nombres",
      file: "src/modules/orders/service.ts",
      code: "await tx.insert(orderSchema.orderLines).values(v);",
    },
    {
      name: "TRUNCATE TABLE ONLY",
      file: "src/app/accion.ts",
      code: "await db.execute(sql`truncate table only orders`);",
    },
    {
      name: "UPDATE ONLY",
      file: "src/app/accion.ts",
      code: "await db.execute(sql`UPDATE ONLY order_lines SET quantity = 1`);",
    },
  ])("detecta: $name", ({ file, code }) => {
    expect(findViolations(file, code)).not.toEqual([]);
  });

  it.each([
    {
      name: "las escrituras autorizadas",
      code: "export async function insertOrder(tx, order) {\n  const rows = await tx.insert(orders).values(order).returning(c);\n}\nexport async function insertOrderLines(tx) {\n  await tx\n    .insert(orderLines)\n    .values(v);\n}\nexport async function updateOrderStatus(tx) {\n  await tx\n    .update(orders)\n    .set(v);\n}",
    },
    {
      name: "una lectura con una subconsulta de las líneas",
      code: 'export function findOrders() {\n  return db.select({ n: sql`(select count(*) from order_lines l where l.order_id = "orders"."id")` }).from(orders);\n}',
    },
    {
      name: "la escritura de otra tabla de nombre parecido",
      code: "export async function touch() {\n  await db.execute(sql`update orders_archive set x = 1`);\n  await db.execute(sql`delete from order_lines_old`);\n}",
    },
  ])("permite: $name", ({ code }) => {
    expect(findViolations(REPOSITORY, code)).toEqual([]);
  });
});

describe("repositorio", () => {
  const files = readdirSync("src", { recursive: true, encoding: "utf8" })
    .map((file) => join("src", file).replaceAll("\\", "/"))
    .filter((file) => /\.tsx?$/.test(file));

  it("ningún archivo de src/ escribe pedidos fuera de las funciones autorizadas", () => {
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
    const writes = findOrderWrites(readFileSync(REPOSITORY, "utf8")).map(
      ({ operation, fn }) => `${fn}: ${operation}`,
    );
    expect(writes).toEqual([
      "insertOrder: insert orders",
      "insertOrderLines: insert order_lines",
      "updateOrderStatus: update orders",
    ]);
  });
});

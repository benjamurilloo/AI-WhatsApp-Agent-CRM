import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Guarda del contador de numeración (ADR 0019, punto 2; brief-19.2, AC-11): en src/,
// document_counters solo se escribe desde takeNextNumber de src/modules/numbering/repository.ts.
// Es la defensa frente a un número tomado sin el bloqueo, o fuera de la transacción del documento:
// el trigger de la 0036 rechaza que el contador retroceda o salte, pero no que otro código lo
// incremente sin crear el documento, que dejaría un hueco.
//
// Ve y no ve lo mismo que price-writes.

const REPOSITORY = "src/modules/numbering/repository.ts";

// La fila nace en 0 y se incrementa, en la misma función.
const AUTHORIZED = new Map([
  ["takeNextNumber", ["insert document_counters", "update document_counters"]],
]);

const SQL_TABLE = String.raw`(?:"?public"?\s*\.\s*)?"?document_counters"?\b|\$\{\s*(?:\w+\.)?documentCounters\s*\}`;

const WRITE_PATTERNS = [
  /\.(insert|update|delete)\(\s*(?:\w+\.)?documentCounters\s*\)/g,
  new RegExp(
    String.raw`\b(insert\s+into|update|delete\s+from|truncate(?:\s+table)?)(?:\s+only)?\s+(?:${SQL_TABLE})`,
    "gi",
  ),
];

const FUNCTION_PATTERN =
  /^(?:export\s+)?(?:async\s+)?function\s+(\w+)[\s\S]*?^\}/gm;

type Write = { line: number; operation: string; fn: string | null };

function findCounterWrites(code: string): Write[] {
  const functions = [...code.matchAll(FUNCTION_PATTERN)].map((match) => ({
    name: match[1]!,
    start: match.index,
    end: match.index + match[0].length,
  }));
  return WRITE_PATTERNS.flatMap((pattern) =>
    [...code.matchAll(pattern)].map((match) => ({
      line: code.slice(0, match.index).split("\n").length,
      operation: `${match[1]!.toLowerCase().split(/\s+/)[0]} document_counters`,
      fn:
        functions.find((f) => match.index >= f.start && match.index < f.end)
          ?.name ?? null,
    })),
  ).sort((a, b) => a.line - b.line);
}

function findViolations(file: string, code: string): string[] {
  return findCounterWrites(code)
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

describe("detección de escrituras del contador", () => {
  it.each([
    {
      name: "update fuera de la función autorizada",
      file: REPOSITORY,
      code: "export async function bump(tx) {\n  await tx.update(documentCounters).set(v);\n}",
    },
    {
      name: "delete dentro de la función autorizada",
      file: REPOSITORY,
      code: "export async function takeNextNumber(tx) {\n  await tx.delete(documentCounters);\n}",
    },
    {
      name: "escritura fuera de toda función",
      file: REPOSITORY,
      code: "const bump = (tx) => tx\n  .update(documentCounters)\n  .set(v);",
    },
    {
      name: "la función autorizada en otro archivo",
      file: "src/modules/orders/repository.ts",
      code: "export async function takeNextNumber(tx) {\n  await tx.insert(documentCounters).values(v);\n}",
    },
    {
      name: "SQL literal en la aplicación",
      file: "src/app/accion.ts",
      code: "await db.execute(sql`UPDATE document_counters SET last_number = last_number + 1`);",
    },
    {
      name: "la tabla interpolada por espacio de nombres",
      file: "src/modules/orders/service.ts",
      code: "await tx.execute(sql`insert into ${schema.documentCounters} values (1)`);",
    },
    {
      name: "nombre con esquema entre comillas",
      file: "src/app/accion.ts",
      code: 'await db.execute(sql`delete from "public"."document_counters"`);',
    },
    {
      name: "TRUNCATE",
      file: "src/app/accion.ts",
      code: "await db.execute(sql`TRUNCATE document_counters`);",
    },
  ])("detecta: $name", ({ file, code }) => {
    expect(findViolations(file, code)).not.toEqual([]);
  });

  it.each([
    {
      name: "las escrituras de takeNextNumber",
      code: "export async function takeNextNumber(tx) {\n  await tx\n    .insert(documentCounters)\n    .values(v);\n  await tx\n    .update(documentCounters)\n    .set(v);\n}",
    },
    {
      name: "una lectura",
      code: "export async function find() {\n  return db.select().from(documentCounters);\n}",
    },
  ])("permite: $name", ({ code }) => {
    expect(findViolations(REPOSITORY, code)).toEqual([]);
  });
});

describe("repositorio", () => {
  const files = readdirSync("src", { recursive: true, encoding: "utf8" })
    .map((file) => join("src", file).replaceAll("\\", "/"))
    .filter((file) => /\.tsx?$/.test(file));

  it("ningún archivo de src/ escribe el contador fuera de la función autorizada", () => {
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
    const writes = findCounterWrites(readFileSync(REPOSITORY, "utf8")).map(
      ({ operation, fn }) => `${fn}: ${operation}`,
    );
    expect(writes).toEqual([
      "takeNextNumber: insert document_counters",
      "takeNextNumber: update document_counters",
    ]);
  });
});

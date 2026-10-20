import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Guarda de las capacidades (ADR 0024, punto 3; brief-29.2, D-2). Dos reglas:
//
// 1. organization_capabilities se lee y se escribe solo desde dos funciones del repositorio de
//    organizations: findCapabilities (la lectura, detrás de hasCapability y getAppFrame) e
//    insertCapability (la activación del script). Un módulo que leyera la tabla por su cuenta podría
//    decidir distinto que hasCapability; uno que la escribiera activaría una capacidad sin autor ni
//    auditoría. crm_app no tiene UPDATE ni DELETE, así que la base rechaza esas dos; el INSERT y la
//    lectura solo los vigila esta guarda.
// 2. getAdminContextForScript arma un contexto de admin sin sesión: solo lo llaman los scripts de
//    operador (scripts/), nunca la aplicación. En src/ aparece solo en organizations, que lo define y
//    lo exporta.
//
// Ve: Drizzle (.select().from, .insert, .update, .delete con la tabla, también por un espacio de
// nombres) y SQL literal (FROM, JOIN, INSERT INTO, UPDATE, DELETE FROM, TRUNCATE) con el nombre de
// la tabla o la tabla interpolada. No ve: la tabla bajo otro nombre (un alias o una variable), el
// nombre armado en tiempo de ejecución, ni un import dinámico del contexto de script. Los seeds
// escriben la tabla directo y quedan fuera: corren solo contra bases de prueba.

const REPOSITORY = "src/modules/organizations/repository.ts";

const AUTHORIZED = new Map([
  ["findCapabilities", ["from organization_capabilities"]],
  ["insertCapability", ["insert organization_capabilities"]],
]);

const SQL_TABLE = String.raw`(?:"?public"?\s*\.\s*)?"?organization_capabilities"?\b|\$\{\s*(?:\w+\.)?organizationCapabilities\s*\}`;

const ACCESS_PATTERNS = [
  /\.(from|insert|update|delete|innerJoin|leftJoin)\(\s*(?:\w+\.)?organizationCapabilities\s*[,)]/g,
  new RegExp(
    String.raw`\b(from|join|insert\s+into|update|delete\s+from|truncate(?:\s+table)?)(?:\s+only)?\s+(?:${SQL_TABLE})`,
    "gi",
  ),
];

const FUNCTION_PATTERN =
  /^(?:export\s+)?(?:async\s+)?function\s+(\w+)[\s\S]*?^\}/gm;

type Access = { line: number; operation: string; fn: string | null };

function findAccesses(code: string): Access[] {
  const functions = [...code.matchAll(FUNCTION_PATTERN)].map((match) => ({
    name: match[1]!,
    start: match.index,
    end: match.index + match[0].length,
  }));
  return ACCESS_PATTERNS.flatMap((pattern) =>
    [...code.matchAll(pattern)].map((match) => {
      const verb = match[1]!.toLowerCase().split(/\s+/)[0]!;
      const operation = /join$/.test(verb) || verb === "join" ? "from" : verb;
      return {
        line: code.slice(0, match.index).split("\n").length,
        operation: `${operation} organization_capabilities`,
        fn:
          functions.find((f) => match.index >= f.start && match.index < f.end)
            ?.name ?? null,
      };
    }),
  ).sort((a, b) => a.line - b.line);
}

function findViolations(file: string, code: string): string[] {
  return findAccesses(code)
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

const SCRIPT_CONTEXT = /\bgetAdminContextForScript\b/;

function usesScriptContext(file: string, code: string): boolean {
  return (
    !file.startsWith("src/modules/organizations/") && SCRIPT_CONTEXT.test(code)
  );
}

// La copia de una plantilla no autoriza nada: la llama el script de capacidades, con el admin que
// nombró, dentro de su transacción. Nada de src/ fuera de catalog la nombra (revisión
// independiente de la 29.2, H-13).
const TEMPLATE_COPY = /\bapplyAttributeTemplate\b/;

function usesTemplateCopy(file: string, code: string): boolean {
  return !file.startsWith("src/modules/catalog/") && TEMPLATE_COPY.test(code);
}

// Desde la 29.6 (brief-29.6, D-1), lo que copia el perfil al activar repairs, con el mismo molde: la
// copia de los tipos de reparación, que solo nombra service, y el alta del producto de servicio, que
// solo nombra catalog. Ninguna autoriza nada: las llama el script de capacidades.
const SCRIPT_ONLY_COPIES = [
  { name: "applyRepairTypeTemplate", owner: "src/modules/service/" },
  { name: "createServiceProduct", owner: "src/modules/catalog/" },
];

function scriptOnlyViolations(file: string, code: string): string[] {
  return SCRIPT_ONLY_COPIES.filter(
    ({ name, owner }) =>
      !file.startsWith(owner) && new RegExp(`\\b${name}\\b`).test(code),
  ).map(({ name }) => `${file} nombra ${name}`);
}

describe("detección de accesos a las capacidades", () => {
  it.each([
    {
      name: "lectura desde otro módulo",
      file: "src/modules/catalog/repository.ts",
      code: "export async function f() {\n  return db.select().from(organizationCapabilities);\n}",
    },
    {
      name: "lectura fuera de la función autorizada",
      file: REPOSITORY,
      code: "export async function other() {\n  return db.select().from(organizationCapabilities);\n}",
    },
    {
      name: "insert desde la aplicación",
      file: "src/app/accion.ts",
      code: "await db.insert(organizationCapabilities).values(v);",
    },
    {
      name: "delete con Drizzle",
      file: REPOSITORY,
      code: "export async function drop(tx) {\n  await tx.delete(organizationCapabilities);\n}",
    },
    {
      name: "join",
      file: "src/modules/catalog/repository.ts",
      code: "export async function f() {\n  return db.select().from(products).innerJoin(organizationCapabilities, on);\n}",
    },
    {
      name: "SQL literal",
      file: "src/modules/catalog/repository.ts",
      code: "await db.execute(sql`select 1 from organization_capabilities`);",
    },
    {
      name: "SQL con la tabla interpolada",
      file: "src/modules/catalog/repository.ts",
      code: "await db.execute(sql`select 1 from ${organizationCapabilities}`);",
    },
    {
      name: "SQL con esquema y join",
      file: "src/app/accion.ts",
      code: 'await db.execute(sql`select * from x join "public"."organization_capabilities" c on true`);',
    },
    {
      name: "update con SQL",
      file: REPOSITORY,
      code: "export async function findCapabilities() {\n  await db.execute(sql`update organization_capabilities set capability = 1`);\n}",
    },
  ])("detecta: $name", ({ file, code }) => {
    expect(findViolations(file, code)).not.toEqual([]);
  });

  it.each([
    {
      name: "la lectura de findCapabilities",
      code: "export async function findCapabilities(id) {\n  const rows = await executor\n    .select(c)\n    .from(organizationCapabilities)\n    .where(w);\n}",
    },
    {
      name: "el insert de insertCapability",
      code: "export async function insertCapability(tx, row) {\n  const rows = await tx\n    .insert(organizationCapabilities)\n    .values(row);\n}",
    },
    {
      name: "una tabla de nombre parecido",
      code: "export async function f() {\n  await db.execute(sql`select 1 from organization_capabilities_archive`);\n}",
    },
  ])("permite: $name", ({ code }) => {
    expect(findViolations(REPOSITORY, code)).toEqual([]);
  });

  it("detecta la copia de una plantilla fuera de catalog", () => {
    expect(
      usesTemplateCopy(
        "src/app/(autenticado)/modelos/actions.ts",
        "await applyAttributeTemplate(tx, input);",
      ),
    ).toBe(true);
    expect(
      usesTemplateCopy(
        "src/modules/catalog/index.ts",
        "export { applyAttributeTemplate } from './variants';",
      ),
    ).toBe(false);
  });

  it("detecta la copia de los tipos de reparación y el alta del producto de servicio fuera de su módulo", () => {
    expect(
      scriptOnlyViolations(
        "src/app/(autenticado)/reparaciones/actions.ts",
        "await applyRepairTypeTemplate(tx, input);",
      ),
    ).not.toEqual([]);
    expect(
      scriptOnlyViolations(
        "src/modules/service/service-orders.ts",
        "await createServiceProduct(tx, input);",
      ),
    ).not.toEqual([]);
    expect(
      scriptOnlyViolations(
        "src/modules/service/index.ts",
        "export { applyRepairTypeTemplate } from './repair-list';",
      ),
    ).toEqual([]);
    expect(
      scriptOnlyViolations(
        "src/modules/catalog/index.ts",
        "export { createServiceProduct } from './service';",
      ),
    ).toEqual([]);
  });

  it("detecta el contexto de script fuera de organizations", () => {
    expect(
      usesScriptContext(
        "src/app/accion.ts",
        "const c = await getAdminContextForScript(x);",
      ),
    ).toBe(true);
    expect(
      usesScriptContext(
        "src/modules/organizations/service.ts",
        "export async function getAdminContextForScript() {}",
      ),
    ).toBe(false);
  });
});

describe("repositorio", () => {
  const files = readdirSync("src", { recursive: true, encoding: "utf8" })
    .map((file) => join("src", file).replaceAll("\\", "/"))
    .filter((file) => /\.tsx?$/.test(file));

  it("ningún archivo de src/ toca organization_capabilities fuera de las dos funciones", () => {
    const violations = files.flatMap((file) =>
      findViolations(file, readFileSync(file, "utf8")),
    );
    expect(files.length).toBeGreaterThan(0);
    expect(
      violations,
      `Accesos no autorizados:\n${violations.join("\n")}`,
    ).toEqual([]);
  });

  // Si el repositorio cambiara de patrón, la guarda quedaría vacía y seguiría en verde.
  it("el repositorio tiene exactamente los dos accesos autorizados", () => {
    const accesses = findAccesses(readFileSync(REPOSITORY, "utf8")).map(
      ({ operation, fn }) => `${fn}: ${operation}`,
    );
    expect(accesses).toEqual([
      "findCapabilities: from organization_capabilities",
      "insertCapability: insert organization_capabilities",
    ]);
  });

  it("solo catalog nombra applyAttributeTemplate dentro de src/", () => {
    const users = files.filter((file) =>
      usesTemplateCopy(file, readFileSync(file, "utf8")),
    );
    expect(users).toEqual([]);
  });

  it("solo service nombra applyRepairTypeTemplate, y solo catalog createServiceProduct, dentro de src/", () => {
    expect(
      files.flatMap((file) =>
        scriptOnlyViolations(file, readFileSync(file, "utf8")),
      ),
    ).toEqual([]);
  });

  it("solo organizations nombra getAdminContextForScript dentro de src/", () => {
    const users = files.filter((file) =>
      usesScriptContext(file, readFileSync(file, "utf8")),
    );
    expect(users).toEqual([]);
  });
});

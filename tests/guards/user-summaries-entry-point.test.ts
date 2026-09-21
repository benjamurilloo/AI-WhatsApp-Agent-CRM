import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Guarda del punto de entrada único de los resúmenes de usuario (9.0.1, D-3; H-1 de la 8.4).
// `auth.getUserSummaries` lee users por lista de ids SIN filtro de organización. El filtro vive
// en `organizations.getMemberSummaries`, que interseca contra organization_members antes de leer.
// Esta guarda fija que nadie esquive ese punto de entrada: solo `auth` (que la define y la
// reexporta) y `organizations` (que la envuelve) pueden importarla.
//
// Lo que esta guarda NO comprueba, y hay que saberlo antes de confiar en ella:
// - no comprueba que `getMemberSummaries` filtre bien; eso lo prueban los tests de integración;
// - no ve una reexportación intermedia que le cambie el nombre, ni una llamada armada
//   dinámicamente (`auth["get" + "UserSummaries"]`);
// - no ve SQL escrito a mano contra la tabla users;
// - **no cubre la vía de `analytics`**: `eslint.config.mjs` le permite importar
//   `@/modules/*/schema`, así que podría leer `users` directo, sin organización y sin pasar por
//   ningún punto de entrada. Hoy no lo hace, y cerrar esa frontera es la subfase 9.0.3;
// - lee `src/` como texto, así que no entiende el grafo de módulos, solo los accesos literales.
//
// El agujero que esta guarda tuvo al nacer, y por qué está escrito acá: la primera versión solo
// reconocía `import { … }` y no veía `import * as auth` —forma que el propio test de integración
// de esta subfase usa—, ni `export { … } from`. Lo encontró la revisión independiente de la
// 9.0.1. Es la misma clase de agujero que la revisión de la 8.4 encontró en `exposed-surface`,
// que solo veía `export function` y no `export const`.

const ENTRY_POINT = "getUserSummaries";

// `auth` la define y la reexporta; `organizations` es el único envoltorio autorizado.
const ALLOWED = [/^src\/modules\/auth\//, /^src\/modules\/organizations\//];

// Import o reexport con nombres, en una o varias líneas, con o sin `type`.
const NAMED_PATTERN =
  /(?:import|export)\s+(?:type\s+)?\{([^}]*)\}\s*from\s*["']@\/modules\/auth["']/g;

// `import * as auth from "@/modules/auth"`: hay que mirar si después usa auth.getUserSummaries.
const NAMESPACE_PATTERN =
  /import\s+\*\s+as\s+(\w+)\s+from\s*["']@\/modules\/auth["']/g;

// `export * from "@/modules/auth"` reexporta el punto de entrada sin nombrarlo.
const STAR_REEXPORT_PATTERN = /export\s+\*\s+from\s*["']@\/modules\/auth["']/;

function importsEntryPoint(code: string): boolean {
  const named = [...code.matchAll(NAMED_PATTERN)].some((match) =>
    match[1]!
      .split(",")
      .map((name) =>
        name
          .trim()
          .split(/\s+as\s+/)[0]!
          .trim(),
      )
      .includes(ENTRY_POINT),
  );
  if (named) return true;

  const viaNamespace = [...code.matchAll(NAMESPACE_PATTERN)].some((match) =>
    new RegExp(`\\b${match[1]!}\\s*\\.\\s*${ENTRY_POINT}\\b`).test(code),
  );
  if (viaNamespace) return true;

  return STAR_REEXPORT_PATTERN.test(code);
}

function findViolations(file: string, code: string): string[] {
  if (ALLOWED.some((allowed) => allowed.test(file))) return [];
  return importsEntryPoint(code) ? [`${file} importa ${ENTRY_POINT}`] : [];
}

describe("detección del acceso directo", () => {
  it.each([
    {
      name: "un módulo de negocio lo importa",
      file: "src/modules/catalog/service.ts",
      code: 'import { getUserSummaries } from "@/modules/auth";',
    },
    {
      name: "una pantalla lo importa",
      file: "src/app/(autenticado)/usuarios/page.tsx",
      code: 'import { getUserSummaries } from "@/modules/auth";',
    },
    {
      name: "en un import de varias líneas",
      file: "src/modules/crm/service.ts",
      code: 'import {\n  getUserSummaries,\n  validateSession,\n} from "@/modules/auth";',
    },
    {
      name: "renombrado con as",
      file: "src/modules/inventory/service.ts",
      code: 'import { getUserSummaries as summaries } from "@/modules/auth";',
    },
    {
      name: "junto a otro import del mismo módulo",
      file: "src/modules/conversations/service.ts",
      code: 'import { validateSession } from "@/modules/auth";\nimport { getUserSummaries } from "@/modules/auth";',
    },
    {
      name: "por namespace, la forma que la primera versión no veía",
      file: "src/modules/catalog/service.ts",
      code: 'import * as auth from "@/modules/auth";\nconst users = await auth.getUserSummaries(ids);',
    },
    {
      name: "por namespace con otro alias y espacios alrededor del punto",
      file: "src/modules/crm/service.ts",
      code: 'import * as identidad from "@/modules/auth";\nawait identidad . getUserSummaries(ids);',
    },
    {
      name: "reexportado con nombre desde otro módulo",
      file: "src/modules/catalog/index.ts",
      code: 'export { getUserSummaries } from "@/modules/auth";',
    },
    {
      name: "reexportado con estrella, sin nombrarlo",
      file: "src/modules/catalog/index.ts",
      code: 'export * from "@/modules/auth";',
    },
  ])("detecta: $name", ({ file, code }) => {
    expect(findViolations(file, code)).not.toEqual([]);
  });

  it.each([
    {
      name: "organizations, que es el envoltorio autorizado",
      file: "src/modules/organizations/service.ts",
      code: 'import { getUserSummaries } from "@/modules/auth";',
    },
    {
      name: "auth, que la define",
      file: "src/modules/auth/index.ts",
      code: "export { getUserSummaries } from './service';",
    },
    {
      name: "otra función de auth en un módulo de negocio",
      file: "src/modules/catalog/service.ts",
      code: 'import { validateSession } from "@/modules/auth";',
    },
    {
      name: "el punto de entrada envuelto",
      file: "src/modules/catalog/service.ts",
      code: 'import { getMemberSummaries } from "@/modules/organizations";',
    },
    {
      name: "namespace de auth sin tocar el punto de entrada",
      file: "src/modules/catalog/service.ts",
      code: 'import * as auth from "@/modules/auth";\nawait auth.validateSession(token);',
    },
  ])("permite: $name", ({ file, code }) => {
    expect(findViolations(file, code)).toEqual([]);
  });
});

describe("repositorio", () => {
  const files = readdirSync("src", { recursive: true, encoding: "utf8" })
    .map((file) => join("src", file).replaceAll("\\", "/"))
    .filter((file) => /\.tsx?$/.test(file));

  it(`ningún archivo fuera de auth y organizations importa ${ENTRY_POINT}`, () => {
    const violations = files.flatMap((file) =>
      findViolations(file, readFileSync(file, "utf8")),
    );
    expect(files.length).toBeGreaterThan(0);
    expect(
      violations,
      `Acceso directo a la lectura sin filtro de organización:\n${violations.join("\n")}`,
    ).toEqual([]);
  });

  it("organizations sigue siendo el único envoltorio, y lo importa de verdad", () => {
    const wrapper = readFileSync(
      "src/modules/organizations/service.ts",
      "utf8",
    );
    expect(importsEntryPoint(wrapper)).toBe(true);
    expect(wrapper).toContain("getMemberSummaries");
  });
});

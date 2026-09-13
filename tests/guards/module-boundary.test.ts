import { ESLint } from "eslint";
import { describe, expect, it } from "vitest";

// Aplica eslint.config.mjs real a archivos virtuales: no crea nada en disco
// (docs/architecture/RepositoryStructure.md, "Frontera entre módulos").
const eslint = new ESLint();

const cases = [
  {
    file: "src/app/interno.ts",
    code: 'import { x } from "@/modules/catalog/service"; export const a = x;',
    forbidden: true,
  },
  {
    file: "src/app/publico.ts",
    code: 'import { j } from "@/modules/crm"; export const k = j;',
    forbidden: false,
  },
  {
    file: "src/modules/catalog/http.ts",
    code: 'import { NextResponse } from "next/server"; export const b = NextResponse;',
    forbidden: true,
  },
  {
    file: "src/modules/catalog/relativa.ts",
    code: 'import { y } from "../crm/service"; export const c = y;',
    forbidden: true,
  },
  {
    file: "src/modules/crm/schema.ts",
    code: 'import { organizations } from "@/modules/organizations/schema"; export const d = organizations;',
    forbidden: false,
  },
  {
    file: "src/modules/crm/service.ts",
    code: 'import { organizations } from "@/modules/organizations/schema"; export const e = organizations;',
    forbidden: true,
  },
  {
    file: "src/modules/analytics/lectura.ts",
    code: 'import { clients } from "@/modules/crm/schema"; export const f = clients;',
    forbidden: false,
  },
  {
    file: "src/modules/analytics/repositorio.ts",
    code: 'import { repo } from "@/modules/crm/repository"; export const g = repo;',
    forbidden: true,
  },
  {
    file: "src/shared/db/modulo.ts",
    code: 'import { h } from "@/modules/crm"; export const i = h;',
    forbidden: true,
  },
];

describe("frontera entre módulos", () => {
  it.each(cases)(
    "$file → prohibido: $forbidden",
    async ({ file, code, forbidden }) => {
      const [result] = await eslint.lintText(code, { filePath: file });
      const violations =
        result?.messages.filter(
          (message) => message.ruleId === "no-restricted-imports",
        ) ?? [];
      expect(violations.length > 0).toBe(forbidden);
    },
  );
});

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Guarda de las dependencias de fx (ADR 0025, punto 13, R-M8; brief-29.4, D-10). fx es un módulo del
// núcleo que depende solo de organizations y audit; cash depende de fx para convertir y para los
// totales de referencia, y catalog y purchasing no, aunque propongan la moneda principal: la leen de
// organizations (ADR 0025, punto 2). Ni eslint.config.mjs ni module-boundary ven la dirección: solo
// prohíben entrar a un módulo por fuera de su index.ts. Como purchasing-dependencies, es una guarda
// acotada a este módulo.
//
// Dos reglas:
// 1. src/modules/fx/ importa solo de organizations, audit, el esquema de auth, src/shared, sus
//    propios archivos y paquetes;
// 2. entre los módulos, solo cash importa fx. Las pantallas lo usan, y no cuentan.
//
// Lee el texto: import y export con from, el import de efecto y el import dinámico con un literal.
// No ve un especificador armado en tiempo de ejecución.

const FX_ALLOWED = new Set(["organizations", "audit"]);

const SPECIFIER = /(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s+)["']([^"']+)["']/g;

function specifiers(code: string): string[] {
  return [...code.matchAll(SPECIFIER)].map((match) => match[1]!);
}

function moduleOf(
  specifier: string,
): { name: string; schemaOnly: boolean } | null {
  const match = /^@\/modules\/([^/]+)(\/.*)?$/.exec(specifier);
  if (!match) return null;
  return { name: match[1]!, schemaOnly: match[2] === "/schema" };
}

function fxViolations(file: string, code: string): string[] {
  return specifiers(code)
    .filter((specifier) => {
      const target = moduleOf(specifier);
      if (target === null) return false;
      if (target.name === "fx") return false;
      if (FX_ALLOWED.has(target.name)) return false;
      if (target.name === "auth" && target.schemaOnly) return false;
      return true;
    })
    .map((specifier) => `${file} importa ${specifier}`);
}

function importerViolations(file: string, code: string): string[] {
  const owner = /^src\/modules\/([^/]+)\//.exec(file)?.[1];
  if (!owner || owner === "cash" || owner === "fx") return [];
  return specifiers(code)
    .filter((specifier) => moduleOf(specifier)?.name === "fx")
    .map((specifier) => `${file} importa ${specifier}`);
}

describe("detección", () => {
  it.each([
    {
      name: "fx importa cash",
      code: 'import { readTotals } from "@/modules/cash";',
    },
    {
      name: "fx reexporta algo de catalog",
      code: 'export { getProduct } from "@/modules/catalog";',
    },
    {
      name: "fx importa sales con un import dinámico",
      code: 'const sales = await import("@/modules/sales");',
    },
    {
      name: "fx importa auth más allá del esquema",
      code: 'import { login } from "@/modules/auth";',
    },
  ])("regla 1, detecta: $name", ({ code }) => {
    expect(fxViolations("src/modules/fx/service.ts", code)).not.toEqual([]);
  });

  it("regla 1, permite: organizations, audit, el esquema de auth, src/shared, lo propio y paquetes", () => {
    const code = [
      'import { recordAudit } from "@/modules/audit";',
      'import { users } from "@/modules/auth/schema";',
      'import { getMainCurrency } from "@/modules/organizations";',
      'import { organizations } from "@/modules/organizations/schema";',
      'import { convertMoney } from "@/shared/money";',
      'import * as repository from "./repository";',
      'import { z } from "zod";',
    ].join("\n");
    expect(fxViolations("src/modules/fx/service.ts", code)).toEqual([]);
  });

  it.each([
    ["catalog", 'import { getExchangeSetup } from "@/modules/fx";'],
    ["purchasing", 'import { exchangeRates } from "@/modules/fx/schema";'],
    ["sales", 'const fx = await import("@/modules/fx");'],
  ])("regla 2, detecta que %s importe fx", (owner, code) => {
    expect(
      importerViolations(`src/modules/${owner}/service.ts`, code),
    ).not.toEqual([]);
  });

  it("regla 2, permite cash y las pantallas", () => {
    const code = 'import { getExchangeSetup } from "@/modules/fx";';
    expect(importerViolations("src/modules/cash/service.ts", code)).toEqual([]);
    expect(
      importerViolations(
        "src/app/(autenticado)/caja/cotizacion/page.tsx",
        code,
      ),
    ).toEqual([]);
  });
});

describe("el código", () => {
  const files = readdirSync("src", { recursive: true, encoding: "utf8" })
    .map((file) => join("src", file).replaceAll("\\", "/"))
    .filter((file) => /\.tsx?$/.test(file));

  it("fx importa solo organizations, audit y el esquema de auth", () => {
    const own = files.filter((file) => file.startsWith("src/modules/fx/"));
    expect(own.length).toBeGreaterThan(0);
    expect(
      own.flatMap((file) => fxViolations(file, readFileSync(file, "utf8"))),
    ).toEqual([]);
  });

  it("entre los módulos, solo cash importa fx, y cash sí lo importa", () => {
    expect(
      files.flatMap((file) =>
        importerViolations(file, readFileSync(file, "utf8")),
      ),
    ).toEqual([]);
    // Si cash dejara de importarlo, la regla quedaría sin objeto y esta guarda habría que revisarla.
    const cashImports = files
      .filter((file) => file.startsWith("src/modules/cash/"))
      .some((file) =>
        specifiers(readFileSync(file, "utf8")).some(
          (specifier) => moduleOf(specifier)?.name === "fx",
        ),
      );
    expect(cashImports).toBe(true);
  });
});

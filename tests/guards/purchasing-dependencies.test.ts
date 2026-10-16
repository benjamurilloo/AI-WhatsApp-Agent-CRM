import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Guarda de la dirección de las dependencias de purchasing (brief-22.6, D-5 y AC-10; ADR 0023,
// punto 11). Desde la 22.6, cash depende de purchasing para leer y bloquear al proveedor y leer las
// recepciones; purchasing no depende de cash. Un import de cash en purchasing cerraría un ciclo que
// ni eslint.config.mjs ni module-boundary ven: los dos solo prohíben entrar a un módulo por fuera de
// su index.ts. Es una guarda acotada a esta dirección, no la guarda general de dependencias entre
// módulos, que sigue siendo una tarea aparte.
//
// Dos reglas:
// 1. src/modules/purchasing/ importa solo de catalog, inventory, numbering, organizations, audit,
//    el esquema de auth, src/shared, sus propios archivos y paquetes;
// 2. entre los módulos, solo cash importa purchasing. Las pantallas lo usan, y no cuentan.
//
// Lee el texto: import y export con from, el import de efecto y el import dinámico con un literal.
// No ve un especificador armado en tiempo de ejecución.

const PURCHASING_ALLOWED = new Set([
  "catalog",
  "inventory",
  "numbering",
  "organizations",
  "audit",
]);

const SPECIFIER = /(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s+)["']([^"']+)["']/g;

function specifiers(code: string): string[] {
  return [...code.matchAll(SPECIFIER)].map((match) => match[1]!);
}

// El módulo de un especificador con alias, y si apunta a su esquema.
function moduleOf(
  specifier: string,
): { name: string; schemaOnly: boolean } | null {
  const match = /^@\/modules\/([^/]+)(\/.*)?$/.exec(specifier);
  if (!match) return null;
  return { name: match[1]!, schemaOnly: match[2] === "/schema" };
}

function purchasingViolations(file: string, code: string): string[] {
  return specifiers(code)
    .filter((specifier) => {
      const target = moduleOf(specifier);
      if (target === null) return false;
      if (target.name === "purchasing") return false;
      if (PURCHASING_ALLOWED.has(target.name)) return false;
      if (target.name === "auth" && target.schemaOnly) return false;
      return true;
    })
    .map((specifier) => `${file} importa ${specifier}`);
}

function importerViolations(file: string, code: string): string[] {
  const owner = /^src\/modules\/([^/]+)\//.exec(file)?.[1];
  if (!owner || owner === "cash" || owner === "purchasing") return [];
  return specifiers(code)
    .filter((specifier) => moduleOf(specifier)?.name === "purchasing")
    .map((specifier) => `${file} importa ${specifier}`);
}

describe("detección", () => {
  it.each([
    {
      name: "purchasing importa cash por su interfaz",
      code: 'import { lockCash } from "@/modules/cash";',
    },
    {
      name: "purchasing reexporta algo de cash",
      code: 'export { createSupplierPayment } from "@/modules/cash";',
    },
    {
      name: "purchasing importa cash por dentro",
      code: 'import * as r from "@/modules/cash/repository";',
    },
    {
      name: "purchasing importa cash con un import dinámico",
      code: 'const cash = await import("@/modules/cash");',
    },
    {
      name: "purchasing importa sales",
      code: "import { issueSale } from '@/modules/sales';",
    },
    {
      name: "purchasing importa auth más allá del esquema",
      code: 'import { login } from "@/modules/auth";',
    },
  ])("regla 1, detecta: $name", ({ code }) => {
    expect(
      purchasingViolations("src/modules/purchasing/x.ts", code),
    ).not.toEqual([]);
  });

  it("regla 1, permite: lo de su lista, el esquema de auth, src/shared, lo propio y paquetes", () => {
    const code = [
      'import { recordAudit } from "@/modules/audit";',
      'import { users } from "@/modules/auth/schema";',
      'import { products } from "@/modules/catalog/schema";',
      'import { receiveStock } from "@/modules/inventory";',
      'import { nextDocumentNumber } from "@/modules/numbering";',
      'import { authorize } from "@/modules/organizations";',
      'import { failure } from "@/shared/errors";',
      'import * as repository from "./repository";',
      'import { z } from "zod";',
    ].join("\n");
    expect(purchasingViolations("src/modules/purchasing/x.ts", code)).toEqual(
      [],
    );
  });

  it.each([
    ["catalog", 'import { suppliers } from "@/modules/purchasing/schema";'],
    [
      "inventory",
      'import { lockSupplierForPayment } from "@/modules/purchasing";',
    ],
    ["sales", 'const p = await import("@/modules/purchasing");'],
  ])("regla 2, detecta que %s importe purchasing", (owner, code) => {
    expect(
      importerViolations(`src/modules/${owner}/service.ts`, code),
    ).not.toEqual([]);
  });

  it("regla 2, permite cash y las pantallas", () => {
    const code =
      'import { getGoodsReceiptForPayment } from "@/modules/purchasing";';
    expect(importerViolations("src/modules/cash/service.ts", code)).toEqual([]);
    expect(
      importerViolations("src/app/(autenticado)/compras/page.tsx", code),
    ).toEqual([]);
  });
});

describe("el código", () => {
  const files = readdirSync("src", { recursive: true, encoding: "utf8" })
    .map((file) => join("src", file).replaceAll("\\", "/"))
    .filter((file) => /\.tsx?$/.test(file));

  it("purchasing no importa cash ni nada fuera de su lista", () => {
    const own = files.filter((file) =>
      file.startsWith("src/modules/purchasing/"),
    );
    expect(own.length).toBeGreaterThan(0);
    expect(
      own.flatMap((file) =>
        purchasingViolations(file, readFileSync(file, "utf8")),
      ),
    ).toEqual([]);
  });

  it("entre los módulos, solo cash importa purchasing, y cash sí lo importa", () => {
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
          (specifier) => moduleOf(specifier)?.name === "purchasing",
        ),
      );
    expect(cashImports).toBe(true);
  });
});

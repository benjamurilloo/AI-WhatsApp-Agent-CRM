import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Guarda de la dirección de las dependencias de service (brief-29.6, D-8; ADR 0024, punto 16), con el
// molde de purchasing-dependencies. service depende de catalog, crm, purchasing, sales, numbering,
// organizations y audit, y desde la 29.6.2 de inventory (brief-29.6.2, D-5), y ningún módulo depende de service salvo cash, que lee las deudas de los
// técnicos (D-7). Un import de service en sales o en inventory cerraría un ciclo que ni
// eslint.config.mjs ni module-boundary ven: los dos solo prohíben entrar a un módulo por fuera de su
// index.ts.
//
// Dos reglas:
// 1. src/modules/service/ importa solo de su lista, los esquemas de los módulos que nombra en
//    schema.ts, src/shared, sus propios archivos y paquetes. No importa cash ni orders;
// 2. entre los módulos, solo cash importa service. Las pantallas y los scripts lo usan, y no cuentan.
//
// Lee el texto: import y export con from, el import de efecto y el import dinámico con un literal. No
// ve un especificador armado en tiempo de ejecución.

const SERVICE_ALLOWED = new Set([
  "catalog",
  "crm",
  "inventory",
  "purchasing",
  "sales",
  "numbering",
  "organizations",
  "audit",
]);

// Los esquemas que nombra schema.ts por sus claves foráneas.
const SCHEMAS_ALLOWED = new Set([
  "auth",
  "catalog",
  "crm",
  "inventory",
  "organizations",
  "purchasing",
  "sales",
]);

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

function serviceViolations(file: string, code: string): string[] {
  return specifiers(code)
    .filter((specifier) => {
      const target = moduleOf(specifier);
      if (target === null) return false;
      if (target.name === "service") return false;
      if (target.schemaOnly) return !SCHEMAS_ALLOWED.has(target.name);
      return !SERVICE_ALLOWED.has(target.name);
    })
    .map((specifier) => `${file} importa ${specifier}`);
}

function importerViolations(file: string, code: string): string[] {
  const owner = /^src\/modules\/([^/]+)\//.exec(file)?.[1];
  if (!owner || owner === "cash" || owner === "service") return [];
  return specifiers(code)
    .filter((specifier) => moduleOf(specifier)?.name === "service")
    .map((specifier) => `${file} importa ${specifier}`);
}

describe("detección", () => {
  it.each([
    ["cash", 'import { createSupplierPayment } from "@/modules/cash";'],
    ["orders", 'export { createOrder } from "@/modules/orders";'],
    ["tradeins", 'import { registerTradeIn } from "@/modules/tradeins";'],
    [
      "orders por su esquema",
      'import { orders } from "@/modules/orders/schema";',
    ],
    [
      "cash con un import dinámico",
      'const c = await import("@/modules/cash");',
    ],
  ])("regla 1, detecta que service importe %s", (_name, code) => {
    expect(
      serviceViolations("src/modules/service/service-orders.ts", code),
    ).not.toEqual([]);
  });

  it("regla 1, permite su lista, los esquemas de sus claves, src/shared, lo propio y paquetes", () => {
    const code = [
      'import { recordAudit } from "@/modules/audit";',
      'import { users } from "@/modules/auth/schema";',
      'import { findServiceProduct } from "@/modules/catalog";',
      'import { clients } from "@/modules/crm/schema";',
      'import { issueServiceSale } from "@/modules/sales";',
      'import { sendUnitToRepair } from "@/modules/inventory";',
      'import { stockUnits } from "@/modules/inventory/schema";',
      'import { sales } from "@/modules/sales/schema";',
      'import { lockTechnicianForServiceOrder } from "@/modules/purchasing";',
      'import { failure } from "@/shared/errors";',
      'import * as repository from "./repository";',
      'import { z } from "zod";',
    ].join("\n");
    expect(serviceViolations("src/modules/service/x.ts", code)).toEqual([]);
  });

  it.each([
    ["sales", 'import { deliverServiceOrder } from "@/modules/service";'],
    ["inventory", 'import { serviceOrders } from "@/modules/service/schema";'],
    ["purchasing", 'const s = await import("@/modules/service");'],
  ])("regla 2, detecta que %s importe service", (owner, code) => {
    expect(
      importerViolations(`src/modules/${owner}/service.ts`, code),
    ).not.toEqual([]);
  });

  it("regla 2, permite cash, las pantallas y los scripts", () => {
    const code =
      'import { listTechnicianChargesForAccount } from "@/modules/service";';
    expect(
      importerViolations("src/modules/cash/supplier-payments.ts", code),
    ).toEqual([]);
    expect(
      importerViolations("src/app/(autenticado)/reparaciones/page.tsx", code),
    ).toEqual([]);
  });
});

describe("el código", () => {
  const files = readdirSync("src", { recursive: true, encoding: "utf8" })
    .map((file) => join("src", file).replaceAll("\\", "/"))
    .filter((file) => /\.tsx?$/.test(file));

  it("service importa solo de su lista", () => {
    const own = files.filter((file) => file.startsWith("src/modules/service/"));
    expect(own.length).toBeGreaterThan(0);
    expect(
      own.flatMap((file) =>
        serviceViolations(file, readFileSync(file, "utf8")),
      ),
    ).toEqual([]);
  });

  it("entre los módulos, solo cash importa service, y cash sí lo importa", () => {
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
          (specifier) => moduleOf(specifier)?.name === "service",
        ),
      );
    expect(cashImports).toBe(true);
  });
});

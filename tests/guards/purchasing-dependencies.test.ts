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
//
// Desde la 22.7 (brief-22.7, D-6 y D-10), una tercera regla, por texto: las lecturas de la cuenta del
// proveedor que no escriben leen en una sola foto, con withSnapshot y nunca con withTransaction. Sin el
// bloqueo de cobros, un pago confirmado entre dos lecturas podría apuntar a una recepción que la
// primera no vio, e imputeAccount lanzaría. No hay test de la carrera: depende de un intervalo entre
// dos sentencias que un test no puede fijar sin un gancho en el código.

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

// Las lecturas de D-6, por archivo y por función. La lista de proveedores lee en readOwed.
const SNAPSHOT_READS: Record<string, string[]> = {
  "src/modules/cash/supplier-payments.ts": [
    "getGoodsReceiptPayments",
    "getGoodsReceiptPaymentForm",
    "getSupplierAccountPaymentForm",
  ],
  "src/modules/cash/supplier-accounts.ts": [
    "getSupplierAccountSummary",
    "getSupplierStatement",
    "readOwed",
  ],
};

// El cuerpo de una función de primer nivel: desde su declaración hasta la llave que la cierra en la
// columna cero.
function functionBody(source: string, name: string): string | null {
  // Una copia de trabajo de Windows puede tener CRLF.
  const code = source.replaceAll("\r\n", "\n");
  const start = code.search(new RegExp(`\\bfunction ${name}\\(`));
  if (start < 0) return null;
  const end = code.indexOf("\n}\n", start);
  return code.slice(start, end < 0 ? undefined : end);
}

function snapshotViolations(
  file: string,
  code: string,
  names: string[],
): string[] {
  return names.flatMap((name) => {
    const body = functionBody(code, name);
    if (body === null) return [`${file}: no está ${name}`];
    if (/\bwithTransaction\(/.test(body) || !/\bwithSnapshot\(/.test(body)) {
      return [`${file}: ${name} no lee en una sola foto`];
    }
    return [];
  });
}

// Quién lee la cuenta del proveedor (revisión independiente de la 22.7, R8): toda llamada a
// supplierLedger y a las dos lecturas de la organización está en una lectura de SNAPSHOT_READS o en
// el pago, que la hace detrás del bloqueo de cobros. Una lectura nueva fuera de la lista no pasa.
const LEDGER_READ =
  /\b(?:supplierLedger|listGoodsReceiptsForAccounts|findAccountsSupplierPayments)\(/g;
const LOCKED_LEDGER_CALLERS = new Set(["createSupplierPayment"]);
const SNAPSHOT_NAMES = new Set(Object.values(SNAPSHOT_READS).flat());

// La función de primer nivel que contiene una posición del código.
function enclosingFunction(code: string, index: number): string | null {
  const declarations = [
    ...code
      .slice(0, index)
      .matchAll(/^(?:export )?(?:async )?function (\w+)\(/gm),
  ];
  return declarations.at(-1)?.[1] ?? null;
}

function ledgerCallerViolations(file: string, source: string): string[] {
  const code = source.replaceAll("\r\n", "\n");
  return [...code.matchAll(LEDGER_READ)]
    .filter((match) => !/function\s+$/.test(code.slice(0, match.index)))
    .flatMap((match) => {
      const caller = enclosingFunction(code, match.index);
      if (
        caller !== null &&
        (SNAPSHOT_NAMES.has(caller) || LOCKED_LEDGER_CALLERS.has(caller))
      ) {
        return [];
      }
      return [`${file}: ${caller ?? "?"} lee la cuenta del proveedor`];
    });
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

describe("regla 3, la detección", () => {
  it("detecta una lectura que vuelve a withTransaction, y una que ya no está", () => {
    const code = [
      "export async function getSupplierStatement(context) {",
      "  const ledger = await repository.withTransaction((tx) => read(tx));",
      "}",
      "",
    ].join("\n");
    expect(
      snapshotViolations("x.ts", code, ["getSupplierStatement", "readOwed"]),
    ).toEqual([
      "x.ts: getSupplierStatement no lee en una sola foto",
      "x.ts: no está readOwed",
    ]);
  });

  it("permite withSnapshot", () => {
    const code = [
      "async function readOwed(organizationId) {",
      "  const rows = await repository.withSnapshot(async (tx) => read(tx));",
      "}",
      "",
    ].join("\n");
    expect(snapshotViolations("x.ts", code, ["readOwed"])).toEqual([]);
  });

  it("detecta una lectura de la cuenta fuera de la lista, y permite el pago y las de la lista", () => {
    const code = [
      "export async function supplierLedger(tx, organizationId, supplierId) {",
      "}",
      "export async function getSupplierDebt(context, id) {",
      "  const ledger = await supplierLedger(tx, context.organizationId, id);",
      "}",
      "export async function createSupplierPayment(context, input) {",
      "  const ledger = await supplierLedger(tx, organizationId, supplierId);",
      "}",
      "async function readOwed(organizationId) {",
      "  const receipts = await listGoodsReceiptsForAccounts(tx, organizationId);",
      "}",
      "",
    ].join("\n");
    expect(ledgerCallerViolations("x.ts", code)).toEqual([
      "x.ts: getSupplierDebt lee la cuenta del proveedor",
    ]);
  });
});

describe("el código", () => {
  it("las lecturas de la cuenta del proveedor leen en una sola foto (regla 3)", () => {
    expect(
      Object.entries(SNAPSHOT_READS).flatMap(([file, names]) =>
        snapshotViolations(file, readFileSync(file, "utf8"), names),
      ),
    ).toEqual([]);
  });

  it("solo las lecturas de la lista y el pago leen la cuenta del proveedor (regla 3)", () => {
    const cashFiles = readdirSync("src/modules/cash", { encoding: "utf8" })
      .filter((file) => /\.ts$/.test(file) && !/\.test\.ts$/.test(file))
      .map((file) => `src/modules/cash/${file}`);
    expect(
      cashFiles.flatMap((file) =>
        ledgerCallerViolations(file, readFileSync(file, "utf8")),
      ),
    ).toEqual([]);
  });

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

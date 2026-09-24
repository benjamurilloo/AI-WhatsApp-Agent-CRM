import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Guarda de las lecturas de servicio (brief-11.3, D-3). Las funciones `…ForService` de los
// módulos reciben la organización de una credencial de servicio y **no pasan por `authorize`**:
// no hay persona ni rol. Solo las puede llamar la API de lectura, que ya autenticó una credencial
// de alcance `read`. Una pantalla o una Server Action que las usara se saltearía el rol del
// usuario y la contraseña pendiente.
//
// Regla: en src/, fuera de src/modules/ (que las define y las compone) y de src/app/api/read/
// (que las expone), ningún archivo nombra una función `…ForService`, reexporta un módulo entero
// ni importa desde la API de lectura (que podría reexportarlas con otro nombre).
//
// Formas sintácticas que reconoce, cada una con su caso abajo. Se escribieron antes de la
// mutación, contra la lección de la 8.4 y la 9.0.1 (dos guardas que nacieron viendo una sola):
//   1. import con nombre, en una o varias líneas;
//   2. import con nombre renombrado (`x as y`);
//   3. import de namespace y uso como propiedad (`inventory.searchCatalogForService`);
//   4. reexport con nombre (`export { x } from`);
//   5. reexport de todo el módulo (`export * from`, `export * as m from`);
//   6. import dinámico con desestructuración o propiedad;
//   7. import desde la API de lectura, por alias o por ruta relativa.
//
// Lo que NO ve, y hay que saberlo: un nombre armado en tiempo de ejecución
// (`m["search" + "CatalogForService"]`), y cualquier cosa fuera de src/ (scripts/ y tests/ las
// llaman a propósito: el operador mide y los tests prueban). Lee el texto, no el grafo de módulos.
// Tampoco ve un envoltorio con otro nombre dentro de un módulo (`const x = aForService`).
//
// Segunda regla, en todo src/, módulos incluidos: ningún archivo renombra una `…ForService` a un
// nombre que no termine igual (`export { searchCatalogForService as searchCatalog }`). Sin ella,
// un index.ts de módulo podría exportarla con otro nombre y una página la importaría sin que la
// primera regla la viera (R-8 de la revisión independiente de la 11.3).

const ALLOWED = [/^src\/modules\//, /^src\/app\/api\/read\//];

const SERVICE_RENAME = /\b\w+ForService\s+as\s+(?!\w*ForService\b)\w+/;

const SERVICE_NAME = /\b\w+ForService\b/;
const MODULE_STAR_REEXPORT =
  /export\s*\*\s*(?:as\s+\w+\s+)?from\s*["']@\/modules\//;
const READ_API_IMPORT =
  /(?:from\s*|import\s*\(\s*)["'](?:@\/app\/api\/read|(?:\.\.?\/)+(?:[\w[\]-]+\/)*api\/read)(?:\/|["'])/;

export function reachesServiceReads(text: string): boolean {
  return (
    SERVICE_NAME.test(text) ||
    MODULE_STAR_REEXPORT.test(text) ||
    READ_API_IMPORT.test(text)
  );
}

const SELF = "tests/guards/service-read-entry-points.test.ts";

describe("detección de las lecturas de servicio", () => {
  it.each([
    [
      "1. import con nombre",
      'import { searchCatalogForService } from "@/modules/inventory";',
    ],
    [
      "1. import con nombre en varias líneas",
      'import {\n  listProductStock,\n  getCatalogProductForService,\n} from "@/modules/inventory";',
    ],
    [
      "2. import renombrado",
      'import { searchActiveProductsForService as buscar } from "@/modules/catalog";',
    ],
    [
      "3. namespace",
      'import * as inventory from "@/modules/inventory";\nawait inventory.searchCatalogForService(id, q);',
    ],
    [
      "4. reexport con nombre",
      'export { searchCatalogForService } from "@/modules/inventory";',
    ],
    ["5. reexport de todo", 'export * from "@/modules/inventory";'],
    [
      "5. reexport de todo con nombre",
      "export * as m from '@/modules/catalog';",
    ],
    [
      "6. import dinámico",
      'const { getCatalogProductForService } = await import("@/modules/inventory");',
    ],
    [
      "7. desde la API por alias",
      'import { handleProductSearch } from "@/app/api/read/v1/products/handler";',
    ],
    [
      "7. desde la API por ruta relativa",
      'import { toContractProduct } from "../../api/read/v1/contract";',
    ],
    ["7. dinámico desde la API", 'await import("@/app/api/read/v1/serve");'],
  ])("detecta %s", (_, text) => {
    expect(reachesServiceReads(text)).toBe(true);
  });

  it.each([
    'import { listProductStock } from "@/modules/inventory";',
    'import * as inventory from "@/modules/inventory";\nawait inventory.listProductStock(ctx, f);',
    'export { getProduct } from "@/modules/catalog";',
    'import { handleIngestionEvent } from "@/app/api/ingestion/v1/events/handler";',
    'const x = "api/reader";',
  ])("no detecta: %j", (text) => {
    expect(reachesServiceReads(text)).toBe(false);
  });

  it.each([
    'export { searchCatalogForService as searchCatalog } from "./service";',
    "export {\n  listCurrentEntriesForService as listCurrent,\n} from './service';",
    'import { getCatalogProductForService as leer } from "@/modules/inventory";',
  ])("detecta el renombre: %j", (text) => {
    expect(SERVICE_RENAME.test(text)).toBe(true);
  });

  it.each([
    'export { searchCatalogForService } from "./service";',
    'import { searchActiveProductsForService as searchForService } from "./x";',
  ])("no detecta como renombre: %j", (text) => {
    expect(SERVICE_RENAME.test(text)).toBe(false);
  });
});

describe("repositorio", () => {
  const files = execFileSync("git", ["ls-files", "-z", "src"], {
    encoding: "utf8",
  })
    .split("\0")
    .filter((file) => /\.(ts|tsx)$/.test(file))
    .filter((file) => file !== SELF);

  it("encuentra los archivos que definen y exponen las lecturas", () => {
    const defining = files.filter(
      (file) =>
        ALLOWED.some((pattern) => pattern.test(file)) &&
        SERVICE_NAME.test(readFileSync(file, "utf8")),
    );
    expect(defining).toEqual(
      expect.arrayContaining([
        "src/modules/catalog/service.ts",
        "src/modules/inventory/service.ts",
        "src/modules/knowledge/service.ts",
        "src/modules/organizations/service.ts",
        "src/app/api/read/v1/products/handler.ts",
        "src/app/api/read/v1/knowledge/handler.ts",
      ]),
    );
  });

  it("fuera de los módulos y de la API de lectura, nadie llega a las lecturas de servicio", () => {
    const reaching = files
      .filter((file) => !ALLOWED.some((pattern) => pattern.test(file)))
      .filter((file) => reachesServiceReads(readFileSync(file, "utf8")));
    expect(
      reaching,
      `estas lecturas no pasan por authorize; solo las llama src/app/api/read/ (brief-11.3, D-3):\n${reaching.join("\n")}`,
    ).toEqual([]);
  });

  it("ningún archivo de src/, módulos incluidos, renombra una lectura de servicio", () => {
    const renaming = files.filter((file) =>
      SERVICE_RENAME.test(readFileSync(file, "utf8")),
    );
    expect(
      renaming,
      `un renombre saca la función de la vista de esta guarda:\n${renaming.join("\n")}`,
    ).toEqual([]);
  });
});

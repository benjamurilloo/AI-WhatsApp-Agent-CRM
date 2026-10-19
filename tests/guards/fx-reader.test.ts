import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Guarda del lector de la cotización (ADR 0025, punto 9; brief-29.4.2, D-10 y AC-5).
//
// El lector es el primer proceso del CRM con red y credencial de la base juntas. La red no puede
// fijar adónde sale (DolarAPI está detrás de Cloudflare: brief-29.4.2, H-7), así que lo fija el
// código, y esta guarda fija el código:
//   1. en scripts/fx/, la única URL absoluta es la de DolarAPI, blue;
//   2. scripts/fx/ no importa src/ (ni @/ ni una ruta relativa que salga de la carpeta), y solo
//      importa zod, pg, módulos de node y sus propios archivos; los tests, además, vitest;
//   3. la unidad de systemd corre con un usuario efímero, recibe la contraseña por LoadCredential=,
//      niega las redes privadas y la de metadatos, y avisa solo al terminar bien;
//   4. el timer corre a las 9, 12, 15, 18 y 21 de Córdoba.
//
// Lee todos los archivos de la carpeta, versionados o no. Como las otras guardas de hosts, el
// análisis es literal: no ve una URL armada por partes.

const DIRECTORY = "scripts/fx";
const ALLOWED_URL = "https://dolarapi.com/v1/dolares/blue";

const URL_PATTERN = /https?:\/\/[^\s"'`<>)]+/g;
const SPECIFIER = /(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s+)["']([^"']+)["']/g;

function files(): { path: string; code: string }[] {
  return readdirSync(DIRECTORY, { recursive: true, encoding: "utf8" })
    .filter((name) => /\.(?:ts|mts|js|mjs|json)$/.test(name))
    .map((name) => {
      const path = join(DIRECTORY, name);
      return { path, code: readFileSync(path, "utf8") };
    });
}

export function urlViolations(code: string): string[] {
  return [...code.matchAll(URL_PATTERN)]
    .map((match) => match[0])
    .filter((url) => url !== ALLOWED_URL);
}

export function importViolations(path: string, code: string): string[] {
  const isTest = path.endsWith(".test.ts");
  return [...code.matchAll(SPECIFIER)]
    .map((match) => match[1]!)
    .filter((specifier) => {
      if (specifier === "zod" || specifier === "pg") return false;
      if (specifier.startsWith("node:")) return false;
      if (isTest && specifier === "vitest") return false;
      // Un archivo propio de la carpeta: ./algo.ts, sin subir.
      if (/^\.\/[^/]+\.ts$/.test(specifier)) return false;
      return true;
    });
}

describe("el código del lector (AC-5)", () => {
  it("la carpeta existe y tiene el lector", () => {
    const names = files().map((file) => file.path.replace(/\\/g, "/"));
    expect(names).toContain("scripts/fx/lectura.ts");
    expect(names).toContain("scripts/fx/leer-cotizacion.ts");
  });

  it("la única URL absoluta es la de DolarAPI, blue", () => {
    const found = files().flatMap((file) =>
      urlViolations(file.code).map((url) => `${file.path}: ${url}`),
    );
    expect(found).toEqual([]);
  });

  it("no importa src/ ni nada fuera de zod, pg, node y sus archivos", () => {
    const found = files().flatMap((file) =>
      importViolations(file.path, file.code).map(
        (specifier) => `${file.path}: ${specifier}`,
      ),
    );
    expect(found).toEqual([]);
  });

  it("las reglas detectan lo que tienen que detectar", () => {
    expect(urlViolations(`fetch("https://evil.example/x")`)).toEqual([
      "https://evil.example/x",
    ]);
    expect(urlViolations(`fetch("${ALLOWED_URL}?a=1")`)).toEqual([
      `${ALLOWED_URL}?a=1`,
    ]);
    expect(urlViolations(`fetch("${ALLOWED_URL}")`)).toEqual([]);
    expect(
      importViolations(
        "scripts/fx/x.ts",
        [
          `import { getDb } from "@/shared/db";`,
          `import x from "../../src/modules/fx";`,
          `import y from "../otro.ts";`,
          `import "axios";`,
          `const z = await import("undici");`,
          `import { describe } from "vitest";`,
        ].join("\n"),
      ),
    ).toEqual([
      "@/shared/db",
      "../../src/modules/fx",
      "../otro.ts",
      "axios",
      "undici",
      "vitest",
    ]);
    expect(
      importViolations(
        "scripts/fx/x.test.ts",
        `import { describe } from "vitest";\nimport { a } from "./lectura.ts";`,
      ),
    ).toEqual([]);
  });
});

describe("la unidad y el timer (D-7)", () => {
  const service = readFileSync(
    "deploy/production/crm-fx-reader.service",
    "utf8",
  );
  const timer = readFileSync("deploy/production/crm-fx-reader.timer", "utf8");
  const lines = (text: string) =>
    text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line !== "" && !line.startsWith("#"));

  it("usuario efímero, contraseña por LoadCredential= y ningún secreto en la unidad", () => {
    const directives = lines(service);
    expect(directives).toContain("DynamicUser=true");
    expect(directives).toContain(
      "LoadCredential=fx-reader-db:/etc/crm-production/fx-reader-db",
    );
    expect(directives).toContain(
      "ExecStart=/usr/bin/node /srv/crm-production/scripts/fx/leer-cotizacion.ts",
    );
    expect(directives).toContain("OnSuccess=crm-heartbeat@fx-reader.service");
    expect(directives.join("\n")).not.toMatch(
      /PGPASSWORD|EnvironmentFile|\.pgpass/,
    );
    expect(directives).not.toContainEqual(expect.stringMatching(/^User=/));
  });

  it("niega las redes privadas, de enlace local (metadatos) y CGNAT; permite solo loopback", () => {
    const directives = lines(service);
    expect(directives).toContain("IPAddressAllow=localhost");
    const deny = directives
      .find((line) => line.startsWith("IPAddressDeny="))
      ?.slice("IPAddressDeny=".length)
      .split(/\s+/);
    expect(deny).toEqual(
      expect.arrayContaining([
        "10.0.0.0/8",
        "172.16.0.0/12",
        "192.168.0.0/16",
        "169.254.0.0/16",
        "100.64.0.0/10",
        "fc00::/7",
        "fe80::/10",
      ]),
    );
    expect(directives).toContain(
      "RestrictAddressFamilies=AF_UNIX AF_INET AF_INET6",
    );
  });

  it("el timer corre en el horario del local, en la hora de Córdoba", () => {
    expect(lines(timer)).toContain(
      "OnCalendar=*-*-* 09,12,15,18,21:00:00 America/Argentina/Cordoba",
    );
    expect(lines(timer)).toContain("Unit=crm-fx-reader.service");
  });

  it("el aviso de vida conoce el trabajo fx-reader", () => {
    const script = readFileSync("deploy/production/crm-heartbeat.sh", "utf8");
    expect(script).toMatch(/fx-reader\) variable=HEARTBEAT_URL_FX_READER ;;/);
  });
});

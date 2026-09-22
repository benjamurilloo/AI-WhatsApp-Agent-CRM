import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Guarda de los nombres de despliegue (brief-9.1, D-3 y AC-8).
//
// Un hostname o una IP de un entorno escritos en src/ convierten un cambio de dominio o de
// servidor en una búsqueda por todo el repositorio, y el primer despliegue es exactamente
// cuando aparecen: se prueba algo "solo para ver si anda" y queda. Con el nombre en una
// variable de entorno, mudar el entorno es una línea de configuración.
//
// **Reescrita el 2026-09-22** por el hallazgo H-8 de la revisión independiente. La primera
// versión buscaba la marca actual (`vixora…`) con una lista cerrada de TLD, así que no
// detectaba `.ai` ni `.net`, y **dejaba de servir el día que cambiara el dominio** — que es
// justo lo que la D-3 quiere sobrevivir. Ahora el criterio no es la marca: es cualquier URL
// absoluta hacia un host que no sea local. También le faltaba IPv6, y el droplet tiene una.
//
// Lo que esta guarda comprueba, sobre todo archivo versionado de src/ que no sea un test:
//   1. URLs absolutas (`http://` o `https://`) hacia un host que no sea local ni de ejemplo;
//   2. IPv4 públicas;
//   3. IPv6 públicas.
//
// Lo que NO comprueba, y conviene no confundirlo con cobertura:
//   - **Un nombre armado por partes**: `"vixoraai" + ".app"`, `` `${HOST}.app` `` o un dominio
//     que el formateador parta en dos líneas. El análisis es línea por línea y literal.
//     Detectarlo exigiría evaluar expresiones, y una guarda que lo simule da falsa confianza.
//   - **Un host sin esquema**: `staging.ejemplo.app` suelto, sin `https://` delante. Buscarlo
//     por forma marcaría `next.config`, `package.json` y cualquier llamada con punto.
//   - **Que la variable de entorno se use bien** donde sí hace falta el host.
//
// Falso positivo conocido y aceptado: una versión de cuatro segmentos numéricos es
// indistinguible de una IPv4 por su forma. Se acepta en vez de agregar excepciones, porque
// esas cadenas viven en package.json y en los archivos de bloqueo, no en src/, y porque una
// excepción escrita hoy es la que mañana deja pasar la IP de verdad.
//
// Límite heredado de las otras guardas: recorre `git ls-files`, así que un archivo sin
// versionar no lo ve.

const IPV4 = /\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/g;
const IPV4_LOCAL =
  /^(?:127\.|0\.0\.0\.0|10\.|192\.168\.|172\.(?:1[6-9]|2\d|3[01])\.)/;

// Al menos tres grupos hexadecimales separados por `:`, o una forma comprimida con `::`.
// Pedir tres evita marcar `08:30` y los rangos de línea tipo `12:34`.
const IPV6 =
  /\b(?:[0-9a-f]{1,4}:){2,7}[0-9a-f]{1,4}\b|\b(?:[0-9a-f]{1,4}:){1,6}:[0-9a-f]{1,4}\b/gi;
// Loopback, enlace local y direcciones únicas locales: no identifican un entorno.
const IPV6_LOCAL = /^(?:::1?$|fe80:|f[cd][0-9a-f]{2}:)/i;

// Host de una URL absoluta. `[...]` cubre la forma con corchetes de IPv6.
const URL_ABSOLUTA = /https?:\/\/(\[[0-9a-f:]+\]|[a-z0-9._-]+)/gi;
// Hosts que no identifican ningún entorno: desarrollo, y los dominios que la RFC 2606
// reserva para documentación y ejemplos.
const HOST_LOCAL =
  /^(?:localhost|127\.\d+\.\d+\.\d+|\[::1\]|0\.0\.0\.0|.*\.?example\.(?:com|net|org|test)|.*\.?(?:test|invalid|localhost)|schemas?\..*|www\.w3\.org)$/i;

export type Finding = { readonly line: number; readonly match: string };

export function findDeploymentHostnames(content: string): Finding[] {
  const findings: Finding[] = [];
  content.split("\n").forEach((text, index) => {
    const line = index + 1;

    for (const match of text.matchAll(URL_ABSOLUTA)) {
      const host = match[1] ?? "";
      if (!HOST_LOCAL.test(host)) findings.push({ line, match: host });
    }
    for (const match of text.matchAll(IPV4)) {
      if (!IPV4_LOCAL.test(match[0])) findings.push({ line, match: match[0] });
    }
    for (const match of text.matchAll(IPV6)) {
      if (!IPV6_LOCAL.test(match[0])) findings.push({ line, match: match[0] });
    }
  });
  // Una IPv4 dentro de una URL absoluta la encuentran las dos primeras pasadas.
  return findings.filter(
    (finding, i, todos) =>
      todos.findIndex(
        (otro) => otro.line === finding.line && otro.match === finding.match,
      ) === i,
  );
}

describe("findDeploymentHostnames", () => {
  // Los casos van en pares. Sin los que esperan "no encuentra nada", el detector podría
  // marcar todo y los casos de arriba pasarían igual.

  it("encuentra una URL absoluta a un dominio de despliegue", () => {
    const found = findDeploymentHostnames(
      'const base = "https://staging.vixoraai.app";',
    );
    expect(found).toHaveLength(1);
    expect(found[0]?.match).toBe("staging.vixoraai.app");
  });

  // El motivo de la reescritura: la versión anterior tenía una lista cerrada de TLD y
  // buscaba la marca actual, así que estos dos se le escapaban enteros.
  it("encuentra un TLD que ninguna lista cerrada habría previsto", () => {
    expect(
      findDeploymentHostnames('fetch("https://crm.vixora.ai/api")'),
    ).toHaveLength(1);
  });

  it("encuentra un dominio de otra marca: la guarda sobrevive a un cambio de dominio", () => {
    const found = findDeploymentHostnames('"https://app.otracosa.net"');
    expect(found[0]?.match).toBe("app.otracosa.net");
  });

  it("encuentra una IP pública", () => {
    const found = findDeploymentHostnames(
      'fetch("http://134.209.70.162:3000");',
    );
    expect(found.some((f) => f.match === "134.209.70.162")).toBe(true);
  });

  it("encuentra una IPv6 pública, que el droplet tiene", () => {
    const found = findDeploymentHostnames('const ip = "2604:a880:400:d0::1";');
    expect(found).toHaveLength(1);
  });

  it("informa el número de línea", () => {
    const found = findDeploymentHostnames(
      "const a = 1;\nconst b = 2;\n// ver https://staging.vixoraai.app",
    );
    expect(found[0]?.line).toBe(3);
  });

  it("no marca loopback", () => {
    expect(
      findDeploymentHostnames('const db = "127.0.0.1:5432";'),
    ).toHaveLength(0);
  });

  it("no marca redes privadas", () => {
    expect(
      findDeploymentHostnames("10.0.0.5 192.168.1.1 172.16.0.1"),
    ).toHaveLength(0);
  });

  // Este caso tiene poder discriminante y el anterior "localhost" pelado no lo tenía: la
  // cadena trae una URL absoluta de verdad, así que si el filtro de hosts locales se rompe,
  // falla. Lo señaló la revisión independiente (H-8).
  it("no marca una URL absoluta a localhost", () => {
    expect(
      findDeploymentHostnames(
        'await page.goto("http://localhost:3100/login");',
      ),
    ).toHaveLength(0);
  });

  it("no marca los dominios de ejemplo de la RFC 2606", () => {
    expect(
      findDeploymentHostnames(
        '"https://example.com" "https://api.example.test"',
      ),
    ).toHaveLength(0);
  });

  it("no marca una IPv6 de loopback ni de enlace local", () => {
    expect(findDeploymentHostnames('"::1" "fe80::1234:5678"')).toHaveLength(0);
  });

  it("no marca una hora ni un rango de líneas, que también tienen dos puntos", () => {
    expect(
      findDeploymentHostnames("a las 08:30, ver líneas 12:34"),
    ).toHaveLength(0);
  });

  it("marca una versión de cuatro segmentos, y eso es sabido", () => {
    expect(findDeploymentHostnames('const v = "18.6.1.2";')).toHaveLength(1);
  });
});

describe("src/ no contiene nombres de despliegue", () => {
  it("ningún archivo versionado de src/ trae un host de entorno ni una IP pública", () => {
    // Todos los archivos de src/, sin filtrar por extensión: el AC-8 habla de `src/`, no de
    // un conjunto de extensiones, y un host puede quedar igual en un .json o en un .sql.
    // Los archivos de test quedan fuera, y el detector NO se afloja para conseguirlo: un
    // fixture con una IP del rango que la RFC 5737 reserva para documentación es justo lo
    // que un test de x-forwarded-for tiene que tener. Aflojar el detector sería el error,
    // porque mañana dejaría pasar la IP real en un archivo que sí corre.
    const files = execFileSync("git", ["ls-files", "src"], { encoding: "utf8" })
      .split("\n")
      .filter(
        (file) =>
          file &&
          !/\.test\.tsx?$/.test(file) &&
          // Activos de terceros con su licencia: `OFL.txt` trae las URL de SIL y de
          // GitHub, que no son nombres de entorno y que además no se editan acá.
          !file.startsWith("src/app/_fonts/"),
      );

    expect(files.length).toBeGreaterThan(0);

    const offenders = files.flatMap((file) =>
      findDeploymentHostnames(readFileSync(file, "utf8")).map(
        (finding) => `${file}:${finding.line} → ${finding.match}`,
      ),
    );

    expect(offenders).toEqual([]);
  });
});

describe("falsos positivos que aparecieron al ampliar el barrido", () => {
  // Los dos casos de abajo salieron de correr la guarda sobre el repositorio real, no de
  // imaginarlos. Quedan versionados para que la corrección no se pierda.
  it("no marca un cast de PostgreSQL, que parece una IPv6 comprimida", () => {
    expect(findDeploymentHostnames("select d::date as day")).toHaveLength(0);
  });

  it("sí marca una IPv6 comprimida de verdad, que es lo que el cast no es", () => {
    expect(findDeploymentHostnames('"2604:a880::1"')).toHaveLength(1);
  });
});

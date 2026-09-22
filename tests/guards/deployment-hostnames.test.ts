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
// Lo que esta guarda comprueba: que ningún archivo de src/ contenga un dominio de despliegue
// ni una IP pública literal.
//
// Lo que NO comprueba: que la variable de entorno se use bien donde sí se necesita el host.
// Eso no se puede leer de un patrón de texto.
//
// Límite heredado de las otras guardas: recorre `git ls-files`, así que un archivo sin
// versionar no lo ve.

// Loopback y las tres redes privadas quedan fuera: 127.0.0.1 aparece legítimamente en
// comentarios y en ejemplos de configuración local, y una IP privada no identifica un
// entorno desde afuera.
const PRIVATE_OR_LOOPBACK =
  /^(?:127\.|0\.0\.0\.0|10\.|192\.168\.|172\.(?:1[6-9]|2\d|3[01])\.)/;

const IPV4 = /\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/g;

// Dominios de despliegue del proyecto. `localhost` y `example.com` no entran: el primero es
// desarrollo y el segundo es el marcador convencional de un valor de ejemplo.
const DEPLOYMENT_DOMAIN = /\bvixora[a-z0-9-]*\.(?:app|com|io|dev|co)\b/gi;

export type Finding = { readonly line: number; readonly match: string };

export function findDeploymentHostnames(content: string): Finding[] {
  const findings: Finding[] = [];
  content.split("\n").forEach((text, index) => {
    for (const match of text.matchAll(DEPLOYMENT_DOMAIN)) {
      findings.push({ line: index + 1, match: match[0] });
    }
    for (const match of text.matchAll(IPV4)) {
      if (!PRIVATE_OR_LOOPBACK.test(match[0])) {
        findings.push({ line: index + 1, match: match[0] });
      }
    }
  });
  return findings;
}

describe("findDeploymentHostnames", () => {
  // Los casos van en pares. Sin los que esperan "no encuentra nada", el detector podría
  // marcar todo y los casos de arriba pasarían igual.

  it("encuentra el dominio de staging", () => {
    const found = findDeploymentHostnames(
      'const base = "https://staging.vixoraai.app";',
    );
    expect(found).toHaveLength(1);
    expect(found[0]?.match).toBe("vixoraai.app");
  });

  it("encuentra el dominio aunque esté en un comentario", () => {
    expect(
      findDeploymentHostnames("// probar contra vixoraai.app"),
    ).toHaveLength(1);
  });

  it("encuentra una IP pública", () => {
    const found = findDeploymentHostnames(
      'fetch("http://134.209.70.162:3000");',
    );
    expect(found[0]?.match).toBe("134.209.70.162");
  });

  it("informa el número de línea", () => {
    const found = findDeploymentHostnames(
      "const a = 1;\nconst b = 2;\n// vixoraai.app",
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

  it("no marca localhost", () => {
    expect(findDeploymentHostnames('"http://localhost:3000"')).toHaveLength(0);
  });

  // Falso positivo conocido y aceptado: una versión de cuatro segmentos numéricos es
  // indistinguible de una IP por su forma. Se acepta en vez de agregar excepciones porque
  // esas cadenas viven en package.json y en los archivos de bloqueo, no en src/, y porque
  // una excepción escrita hoy es la que mañana deja pasar la IP de verdad.
  it("marca una versión de cuatro segmentos, y eso es sabido", () => {
    expect(findDeploymentHostnames('const v = "18.6.1.2";')).toHaveLength(1);
  });
});

describe("src/ no contiene nombres de despliegue", () => {
  it("ningún archivo versionado de src/ trae un dominio de entorno ni una IP pública", () => {
    // Los archivos de test quedan fuera, y el detector NO se afloja para conseguirlo.
    // Lo que el AC-8 protege es el código que se despliega: un fixture con una IP falsa
    // —`203.0.113.9`, del rango que la RFC 5737 reserva para documentación— es exactamente
    // lo que un test de x-forwarded-for tiene que tener. Aflojar el detector para que no
    // los vea sería el error: mañana deja pasar la IP de verdad en un archivo que sí corre.
    const files = execFileSync("git", ["ls-files", "src"], { encoding: "utf8" })
      .split("\n")
      .filter(
        (file) =>
          /\.(ts|tsx|mts|js|mjs)$/.test(file) && !/\.test\.tsx?$/.test(file),
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

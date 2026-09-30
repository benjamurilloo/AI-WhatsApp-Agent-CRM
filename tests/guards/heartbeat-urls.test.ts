import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Guarda de las URLs de aviso de vida (brief-13.3, D-3 y AC-2).
//
// Una URL de aviso es una credencial sin forma de credencial. Quien la tenga puede
// pedirla a mano y marcar un trabajo como vivo, y entonces la alerta que tendría que sonar
// cuando el backup deja de correr no suena. Por eso viven en
// /etc/crm-production/heartbeat.env y nunca en el repositorio.
//
// Lo que esta guarda comprueba, sobre todo archivo del repositorio, versionado o nuevo:
//   1. una URL hacia un servicio de avisos conocido con un segmento de ruta que parece
//      un token: 8 caracteres de token o más, que no sea una palabra de la ruta del propio
//      servicio (`heartbeat`);
//   2. una URL de cualquier host cuya ruta tenga un segmento `ping` o `heartbeat`
//      seguido de un token de 8 caracteres o más.
//
// Lo que NO comprueba, declarado para no confundirlo con cobertura:
//   - **Un servicio que no está en la lista y no usa esas palabras en la ruta.** Si se
//     elige uno así, se agrega acá con su caso.
//   - **Una URL partida en dos cadenas**, o armada con variables. El análisis es
//     línea por línea y literal, como el de la guarda de hostnames.
//   - **Un token de menos de 8 caracteres**. Los de los servicios de la lista son más
//     largos; uno más corto se trataría como una palabra de la ruta.
//   - **Un archivo que `.gitignore` excluye.**
//
// Los marcadores de la documentación (`https://hc-ping.com/<uuid>`) no son URLs de aviso:
// empiezan con `<`, que no es un carácter de token. La primera versión marcaba cualquier
// cosa después del host de un servicio conocido, y marcó la evidencia de la 13.3 por un
// marcador en una ruta profunda: `/api/v1/heartbeat/<token inventado>`.

const SERVICIOS_DE_AVISO =
  /https?:\/\/(?:hc-ping\.com|heartbeat\.uptimerobot\.com|uptime\.betterstack\.com|cronitor\.link|nosnch\.in)(\/[^\s"'<>`]*)/gi;
// Healthchecks.io, UptimeRobot, Better Stack, Cronitor y Dead Man's Snitch.

// Segmentos de ruta de esos servicios que no son tokens aunque tengan 8 caracteres o más.
const PALABRAS_DE_RUTA = new Set(["heartbeat", "heartbeats"]);

const RUTA_DE_AVISO =
  /https?:\/\/[a-z0-9.-]+\/(?:[^\s"'<>]*\/)?(?:ping|heartbeat)s?\/[A-Za-z0-9_-]{8,}/i;

function tieneAvisoDeServicioConocido(texto: string): boolean {
  return [...texto.matchAll(SERVICIOS_DE_AVISO)].some((m) =>
    (m[1] ?? "").split("/").some((segmento) => {
      // Lo que viene pegado al token (`}` de una expansión de shell, `»`, `)`) no es
      // parte de él: se mira solo el prefijo de caracteres de token.
      const token = /^[A-Za-z0-9_-]+/.exec(segmento)?.[0] ?? "";
      return token.length >= 8 && !PALABRAS_DE_RUTA.has(token.toLowerCase());
    }),
  );
}

export type Hallazgo = { readonly linea: number; readonly texto: string };

export function urlsDeAviso(contenido: string): Hallazgo[] {
  return contenido
    .split("\n")
    .flatMap((texto, i) =>
      tieneAvisoDeServicioConocido(texto) || RUTA_DE_AVISO.test(texto)
        ? [{ linea: i + 1, texto: texto.trim().slice(0, 120) }]
        : [],
    );
}

describe("urlsDeAviso", () => {
  // En pares, como en la guarda de hostnames: sin los casos que esperan cero, el detector
  // podría marcarlo todo y los de arriba pasarían igual.

  it("encuentra una URL de Healthchecks con su uuid", () => {
    expect(
      urlsDeAviso(
        "HEARTBEAT_URL_BACKUP=https://hc-ping.com/0f3c2a1e-9b7d-4c1a-8e2f-5d6b7a8c9e01",
      ),
    ).toHaveLength(1);
  });

  it("encuentra una URL de Healthchecks con clave de ping y nombre", () => {
    expect(
      urlsDeAviso("https://hc-ping.com/abcDEF123456ghij/crm-backup"),
    ).toHaveLength(1);
  });

  it("encuentra un aviso de Better Stack", () => {
    expect(
      urlsDeAviso(
        '"https://uptime.betterstack.com/api/v1/heartbeat/Ab12Cd34Ef56Gh78"',
      ),
    ).toHaveLength(1);
  });

  it("encuentra un aviso de un servicio que no está en la lista, por su ruta", () => {
    expect(
      urlsDeAviso("curl https://avisos.otracosa.net/ping/Zx9Yw8Vu7Ts6"),
    ).toHaveLength(1);
  });

  it("informa el número de línea", () => {
    expect(
      urlsDeAviso("a\nb\nhttps://hc-ping.com/0f3c2a1e-9b7d")[0]?.linea,
    ).toBe(3);
  });

  it("no marca el marcador de la documentación", () => {
    expect(urlsDeAviso("`https://hc-ping.com/<uuid>`")).toHaveLength(0);
  });

  // El falso positivo que encontró la suite al correr sobre la evidencia de la 13.3: un
  // marcador en una ruta profunda de un servicio conocido. `heartbeat` tiene 9 caracteres
  // de token y no es un token.
  it("no marca un marcador en una ruta profunda de un servicio conocido", () => {
    expect(
      urlsDeAviso(
        "https://uptime.betterstack.com/api/v1/heartbeat/<token inventado>",
      ),
    ).toHaveLength(0);
  });

  it("sí marca un token pegado a lo que lo rodea, como en una expansión de shell", () => {
    expect(
      urlsDeAviso(
        "${HEARTBEAT_URL_BACKUP:-https://hc-ping.com/0f3c2a1e-9b7d-4c1a-8e2f-5d6b7a8c9e01}",
      ),
    ).toHaveLength(1);
  });

  it("no marca el host solo, sin token", () => {
    expect(
      urlsDeAviso("el servicio es https://hc-ping.com, gratuito"),
    ).toHaveLength(0);
  });

  it("no marca una ruta con ping pero sin token", () => {
    expect(urlsDeAviso("https://example.com/docs/ping/")).toHaveLength(0);
  });

  it("no marca el nombre de la variable", () => {
    expect(urlsDeAviso("HEARTBEAT_URL_BACKUP=")).toHaveLength(0);
  });
});

describe("ningún archivo versionado trae una URL de aviso", () => {
  it("el repositorio no tiene URLs de aviso", () => {
    // `--others --exclude-standard` suma los archivos nuevos que todavía no están en el
    // índice: una URL pegada en un archivo recién creado es justo el caso a atrapar antes
    // del commit. Lo que `.gitignore` excluye sigue fuera.
    const archivos = execFileSync(
      "git",
      ["ls-files", "--cached", "--others", "--exclude-standard"],
      { encoding: "utf8" },
    )
      .split("\n")
      .filter(Boolean)
      // Binarios: las fuentes tipográficas no se leen como texto.
      .filter(
        (archivo) => !/\.(woff2?|ttf|otf|png|jpe?g|ico|gif)$/i.test(archivo),
      )
      // Este archivo: sus casos traen URLs con forma de aviso a propósito. Es la única
      // exención, y los tokens de sus casos son inventados.
      .filter((archivo) => archivo !== "tests/guards/heartbeat-urls.test.ts");

    expect(archivos.length).toBeGreaterThan(0);
    expect(archivos).toContain("deploy/production/crm-heartbeat.sh");

    const hallazgos = archivos.flatMap((archivo) =>
      urlsDeAviso(readFileSync(archivo, "utf8")).map(
        (h) => `${archivo}:${h.linea} → ${h.texto}`,
      ),
    );

    expect(hallazgos).toEqual([]);
  });
});

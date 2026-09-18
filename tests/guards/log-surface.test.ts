import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Guarda de la superficie de log (brief-8.2, D-1). El módulo de log escribe por lista blanca:
// arma el JSON campo por campo, así que un dato que no esté en LogEvent no puede salir. Esa
// garantía vale mientras todo lo que escribe pase por ahí, y nada la sostenía hasta ahora.
//
// Dos reglas:
//   1. En src/, solo el módulo de log usa console.*, con dos excepciones declaradas.
//   2. El `route` de un evento es un valor fijo: nunca se interpola ni se concatena, porque una
//      ruta armada con datos (un teléfono buscado, el id de un cliente) los mete en el log.

const LOG_MODULE = "src/shared/log/index.ts";

// Las dos excepciones son anteriores a esta guarda y están revisadas: las dos reducen el error a
// `code ?? name` a propósito, porque el mensaje del driver de pg puede traer host, usuario o
// contraseña — el defecto real que se encontró en la 2.4. Si alguna cambia, esta lista se revisa
// en la subfase que la cambie, no se amplía por comodidad.
const DECLARED_EXCEPTIONS = [
  "src/shared/db/client.ts",
  "src/shared/db/health.ts",
];

// Este archivo contiene los patrones como casos de prueba.
const SELF = "tests/guards/log-surface.test.ts";

const CONSOLE_CALL =
  /\bconsole\s*\.\s*(log|error|warn|info|debug|trace|dir)\s*\(/;

export function findConsoleCalls(text: string): number[] {
  return text
    .split(/\r?\n/)
    .flatMap((content, index) =>
      CONSOLE_CALL.test(content) ? [index + 1] : [],
    );
}

// Un `route:` seguido de una plantilla con ${...} o de una concatenación con +. No pretende
// entender TypeScript: reconoce las dos formas con las que un dato entra en un valor de texto.
// `route: string` (una anotación de tipo) y `route: "literal"` no son ninguna de las dos.
const INTERPOLATED_ROUTE =
  /\broute\s*:\s*(`[^`]*\$\{|["'][^"']*["']\s*\+|[A-Za-z_$][\w$]*\s*\+)/;

export function findComposedRoutes(text: string): number[] {
  return text
    .split(/\r?\n/)
    .flatMap((content, index) =>
      INTERPOLATED_ROUTE.test(content) ? [index + 1] : [],
    );
}

describe("detección de console.* ", () => {
  it.each([
    "console.log(error);",
    "  console.error(`[db] ${error.message}`);",
    "console . warn(x)",
    "if (x) console.debug(y);",
  ])("detecta: %s", (text) => {
    expect(findConsoleCalls(text)).not.toEqual([]);
  });

  it.each([
    "logEvent({ level: 'info', requestId, route: 'login', code: 'OK' });",
    "// console.log quedó comentado a propósito",
    "const consoleLike = { log: () => {} };",
  ])("permite: %s", (text) => {
    expect(findConsoleCalls(text)).toEqual([]);
  });

  it("informa la línea de cada llamada", () => {
    expect(findConsoleCalls("ok\nconsole.error(e);")).toEqual([2]);
  });
});

describe("detección de route compuesto", () => {
  it.each([
    "logEvent({ route: `clientes/${clientId}`, code: 'OK' });",
    'logEvent({ route: "clientes/" + clientId, code: "OK" });',
    "logEvent({ route: prefijo + sufijo, code: 'OK' });",
  ])("detecta: %s", (text) => {
    expect(findComposedRoutes(text)).not.toEqual([]);
  });

  it.each([
    'logEvent({ route: "clientes.crear", code: "OK" });',
    "logEvent({ route: INGESTION_ROUTE, code: 'OK' });",
    "  route: string,",
    "logEvent({ route, code: 'OK' });",
  ])("permite: %s", (text) => {
    expect(findComposedRoutes(text)).toEqual([]);
  });
});

describe("repositorio", () => {
  const sources = execFileSync("git", ["ls-files", "-z", "src"], {
    encoding: "utf8",
  })
    .split("\0")
    .filter((file) => file.endsWith(".ts") || file.endsWith(".tsx"));

  it("encuentra archivos para revisar", () => {
    expect(sources.length).toBeGreaterThan(0);
  });

  it("en src/, solo el módulo de log usa console.*", () => {
    const allowed = new Set([LOG_MODULE, ...DECLARED_EXCEPTIONS]);
    const hits = sources
      .filter((file) => !allowed.has(file))
      .flatMap((file) =>
        findConsoleCalls(readFileSync(file, "utf8")).map(
          (line) => `${file}:${line}`,
        ),
      );

    expect(
      hits,
      `console.* fuera de la lista blanca de log:\n${hits.join("\n")}`,
    ).toEqual([]);
  });

  it("las dos excepciones declaradas siguen existiendo y siguen usando console.*", () => {
    // Si una deja de usarlo, sale de la lista; si desaparece, la lista miente. Las dos cosas
    // son un cambio que alguien tiene que mirar, no un detalle.
    for (const file of DECLARED_EXCEPTIONS) {
      expect(sources, `${file} ya no existe`).toContain(file);
      expect(
        findConsoleCalls(readFileSync(file, "utf8")),
        `${file} ya no usa console.*: sacalo de DECLARED_EXCEPTIONS`,
      ).not.toEqual([]);
    }
  });

  it("ningún route de un evento se arma con datos", () => {
    const hits = sources
      .filter((file) => file !== SELF)
      .flatMap((file) =>
        findComposedRoutes(readFileSync(file, "utf8")).map(
          (line) => `${file}:${line}`,
        ),
      );

    expect(hits, `route compuesto:\n${hits.join("\n")}`).toEqual([]);
  });
});

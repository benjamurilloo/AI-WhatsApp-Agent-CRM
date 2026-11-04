import { readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

// **La guarda del build viejo** (2026-11-04, pedida por el usuario al cerrar la 24.6.2-d).
//
// `npx playwright test` **no construye**: el `webServer` corre `next start`, que sirve el `.next`
// que haya, sea de cuándo sea. Una corrida que sigue a un cambio de código y no reconstruye prueba
// **la versión anterior**, y el síntoma engaña en las dos direcciones:
//
// - en rojo, un caso que no encuentra un texto nuevo **parece un defecto del cambio**;
// - en verde —el caso peor—, **nadie investiga**: la corrida se informa como evidencia de un código
//   que ninguna prueba ejecutó.
//
// Esto ocurrió **cuatro veces** en este proyecto. Las tres primeras fueron en rojo y se
// diagnosticaron en minutos. La cuarta, el 2026-11-04, fue en verde: tres corridas —32, 35 y 19
// casos— pasaron contra un build de dos horas antes y se informaron al usuario como evidencia del
// código corregido. Se descubrió **por casualidad**, al cambiar después un control que sí tenía una
// prueba que lo buscaba.
//
// La nota del vault existía desde la segunda vez y **no evitó la cuarta**, porque describe la
// solución y no la impone. Por eso esto es código y no documentación: lo único que evita un
// descuido es que el paso no se pueda saltear.
//
// **Qué compara**: la fecha de `.next/BUILD_ID`, que `next build` reescribe en cada corrida, contra
// la del archivo más reciente de los que entran al build. `tests/` queda afuera a propósito: cambiar
// una prueba no pide reconstruir, y una guarda que obliga a reconstruir de más se desactiva sola.

// Lo que entra al build y, si cambia, lo invalida.
const SOURCE_DIRS = ["src"];
const SOURCE_FILES = [
  "next.config.ts",
  "next.config.mjs",
  "next.config.js",
  "postcss.config.mjs",
  "postcss.config.js",
];

// Lo que vive bajo `src/` y **no** entra al build: los tests colocados. Tocar uno no cambia lo que
// el servidor sirve, así que obligar a reconstruir ahí sería ruido.
const NOT_BUILT = /\.test\.(ts|tsx)$/;

// Carpetas que nunca se recorren.
const SKIP_DIRS = new Set(["node_modules", ".next", ".git"]);

export type BuildFreshness = {
  // Fecha de `.next/BUILD_ID` en milisegundos, o null si no hay build.
  buildAt: number | null;
  // El archivo del build más reciente, y su fecha. Null si no se encontró ninguno, que solo pasa
  // con un árbol roto.
  newestSourceAt: number | null;
  newestSourcePath: string | null;
};

// **La detección, pura**: recibe tres datos y decide. Se prueba sola, sin tocar el disco
// (`tests/guards/build-freshness.test.ts`).
export function describeStaleBuild(state: BuildFreshness): string | null {
  const { buildAt, newestSourceAt, newestSourcePath } = state;
  if (buildAt === null) {
    return [
      "No hay build: falta `.next/BUILD_ID`.",
      "",
      "`playwright test` levanta la aplicación con `next start`, que **no construye**.",
      "Corré `npm run build` antes.",
    ].join("\n");
  }
  if (newestSourceAt === null || newestSourcePath === null) return null;
  if (newestSourceAt <= buildAt) return null;
  return [
    "**El build es anterior al código.** La corrida probaría la versión anterior.",
    "",
    `  build  (.next/BUILD_ID)  ${new Date(buildAt).toISOString()}`,
    `  código (${newestSourcePath})  ${new Date(newestSourceAt).toISOString()}`,
    "",
    "`playwright test` levanta la aplicación con `next start`, que **no construye**: sirve el",
    "`.next` que haya. Corré `npm run build` y repetí la corrida.",
    "",
    "Esto ya pasó cuatro veces en este proyecto, y la cuarta **pasó en verde**: tres corridas",
    "dieron 32, 35 y 19 casos en verde contra un build de dos horas antes, y se informaron como",
    "evidencia de un código que ninguna prueba había ejecutado.",
    "",
    "Si de verdad querés correr contra este build, `E2E_ALLOW_STALE_BUILD=1`. El resultado no es",
    "evidencia del árbol de trabajo y no se informa como tal.",
  ].join("\n");
}

// **La aplicación**: el recorrido del árbol. Es la mitad que un test de la función pura no prueba,
// y la que falla cuando el alcance de archivos está mal.
export function readBuildFreshness(root = process.cwd()): BuildFreshness {
  let buildAt: number | null;
  try {
    buildAt = statSync(join(root, ".next", "BUILD_ID")).mtimeMs;
  } catch {
    buildAt = null;
  }

  let newestSourceAt: number | null = null;
  let newestSourcePath: string | null = null;
  const consider = (absolute: string) => {
    let mtime: number;
    try {
      mtime = statSync(absolute).mtimeMs;
    } catch {
      return;
    }
    if (newestSourceAt !== null && mtime <= newestSourceAt) return;
    newestSourceAt = mtime;
    newestSourcePath = relative(root, absolute).split(sep).join("/");
  };

  const walk = (dir: string) => {
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.isDirectory()) {
        if (SKIP_DIRS.has(entry.name)) continue;
        walk(join(dir, entry.name));
      } else if (entry.isFile() && !NOT_BUILT.test(entry.name)) {
        consider(join(dir, entry.name));
      }
    }
  };

  for (const dir of SOURCE_DIRS) walk(join(root, dir));
  for (const file of SOURCE_FILES) consider(join(root, file));

  return { buildAt, newestSourceAt, newestSourcePath };
}

// Lo que corre el `globalSetup`. **Imprime la fecha del build también cuando pasa**: la otra mitad
// de la lección es que una corrida de extremo a extremo se declara con la hora de su build, porque
// «pasó» sin esa hora no dice qué se probó.
export function assertFreshBuild(root = process.cwd()): void {
  const state = readBuildFreshness(root);
  const problema = describeStaleBuild(state);
  if (problema === null) {
    const cuando =
      state.buildAt === null
        ? "sin build"
        : new Date(state.buildAt).toISOString();
    console.log(`Build de la corrida: ${cuando}`);
    return;
  }
  if (process.env.E2E_ALLOW_STALE_BUILD === "1") {
    console.warn(
      `\nE2E_ALLOW_STALE_BUILD=1: se corre igual contra un build viejo.\n${problema}\n`,
    );
    return;
  }
  throw new Error(`\n\n${problema}\n`);
}

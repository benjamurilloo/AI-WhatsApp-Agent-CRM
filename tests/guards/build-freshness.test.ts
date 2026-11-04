import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { describeStaleBuild, readBuildFreshness } from "../e2e/build-freshness";

// Los casos versionados de la guarda del build viejo (tests/e2e/build-freshness.ts). Un check en
// verde no prueba nada: lo que lo valida es que **falle cuando tiene que fallar** y que deje pasar
// los casos cercanos al prohibido.
//
// Se prueban las dos mitades por separado, porque son dos cosas:
//
// - **la detección**, una función pura sobre tres datos;
// - **la aplicación**, el recorrido del árbol, que es donde falla un alcance de archivos mal puesto
//   y que un test de la función pura no toca ni de casualidad.

const HORA = 3_600_000;
const BUILD = Date.parse("2026-11-04T10:00:00.000Z");

describe("la detección: describeStaleBuild", () => {
  it("un build posterior al código pasa", () => {
    expect(
      describeStaleBuild({
        buildAt: BUILD,
        newestSourceAt: BUILD - HORA,
        newestSourcePath: "src/app/page.tsx",
      }),
    ).toBeNull();
  });

  it("un build anterior al código falla, y dice cuál archivo y las dos horas", () => {
    const mensaje = describeStaleBuild({
      buildAt: BUILD,
      newestSourceAt: BUILD + HORA,
      newestSourcePath: "src/modules/cash/service.ts",
    });
    expect(mensaje).toContain("El build es anterior al código");
    expect(mensaje).toContain("src/modules/cash/service.ts");
    expect(mensaje).toContain("2026-11-04T10:00:00.000Z");
    expect(mensaje).toContain("2026-11-04T11:00:00.000Z");
    // El mensaje tiene que decir qué hacer, no solo que algo está mal.
    expect(mensaje).toContain("npm run build");
  });

  it("sin build falla con otro mensaje: no es lo mismo que un build viejo", () => {
    const mensaje = describeStaleBuild({
      buildAt: null,
      newestSourceAt: BUILD,
      newestSourcePath: "src/app/page.tsx",
    });
    expect(mensaje).toContain("No hay build");
    expect(mensaje).not.toContain("El build es anterior");
  });

  // **El borde exacto**: iguales pasa. `next build` lee las fuentes y después escribe BUILD_ID, así
  // que la igualdad al milisegundo es el caso de un sistema de archivos de poca resolución, no el
  // de un cambio posterior.
  it("la misma hora exacta pasa", () => {
    expect(
      describeStaleBuild({
        buildAt: BUILD,
        newestSourceAt: BUILD,
        newestSourcePath: "src/app/page.tsx",
      }),
    ).toBeNull();
  });

  it("un milisegundo después ya falla", () => {
    expect(
      describeStaleBuild({
        buildAt: BUILD,
        newestSourceAt: BUILD + 1,
        newestSourcePath: "src/app/page.tsx",
      }),
    ).not.toBeNull();
  });

  it("un árbol sin fuentes no inventa un problema", () => {
    expect(
      describeStaleBuild({
        buildAt: BUILD,
        newestSourceAt: null,
        newestSourcePath: null,
      }),
    ).toBeNull();
  });
});

describe("la aplicación: readBuildFreshness recorre el árbol", () => {
  const creados: string[] = [];

  afterEach(() => {
    for (const dir of creados.splice(0))
      rmSync(dir, { recursive: true, force: true });
  });

  // Un árbol de mentira con la forma del real. `fecha` en segundos desde la época.
  function arbol(archivos: Record<string, number>, buildAt: number | null) {
    const raiz = mkdtempSync(join(tmpdir(), "guarda-build-"));
    creados.push(raiz);
    if (buildAt !== null) {
      mkdirSync(join(raiz, ".next"), { recursive: true });
      const build = join(raiz, ".next", "BUILD_ID");
      writeFileSync(build, "abc");
      utimesSync(build, buildAt, buildAt);
    }
    for (const [ruta, fecha] of Object.entries(archivos)) {
      const absoluta = join(raiz, ruta);
      mkdirSync(join(absoluta, ".."), { recursive: true });
      writeFileSync(absoluta, "contenido");
      utimesSync(absoluta, fecha, fecha);
    }
    return raiz;
  }

  const T0 = 1_762_250_000; // una fecha fija cualquiera, en segundos
  const DESPUES = T0 + 3600;

  it("encuentra el archivo más reciente de src/, por profundo que esté", () => {
    const raiz = arbol(
      {
        "src/app/page.tsx": T0,
        "src/modules/cash/service.ts": DESPUES,
        "src/shared/db.ts": T0,
      },
      T0,
    );
    const estado = readBuildFreshness(raiz);
    expect(estado.newestSourcePath).toBe("src/modules/cash/service.ts");
    expect(describeStaleBuild(estado)).toContain("El build es anterior");
  });

  // **El negativo cercano que más importa**: un test colocado bajo `src/` es casi idéntico al caso
  // prohibido —misma carpeta, misma extensión— y **no entra al build**. Si la guarda lo contara,
  // obligaría a reconstruir por cambios que no cambian nada, y una guarda que molesta de más se
  // termina desactivando.
  it("un *.test.ts bajo src/ no cuenta, aunque sea el más reciente", () => {
    const raiz = arbol(
      {
        "src/app/page.tsx": T0,
        "src/modules/cash/service.test.ts": DESPUES,
      },
      T0,
    );
    const estado = readBuildFreshness(raiz);
    expect(estado.newestSourcePath).toBe("src/app/page.tsx");
    expect(describeStaleBuild(estado)).toBeNull();
  });

  // El otro negativo cercano: cambiar una prueba de extremo a extremo no pide reconstruir.
  it("tests/ queda fuera del recorrido", () => {
    const raiz = arbol(
      { "src/app/page.tsx": T0, "tests/e2e/sales.spec.ts": DESPUES },
      T0,
    );
    expect(describeStaleBuild(readBuildFreshness(raiz))).toBeNull();
  });

  it("next.config.ts sí cuenta: cambia lo que el build produce", () => {
    const raiz = arbol(
      { "src/app/page.tsx": T0, "next.config.ts": DESPUES },
      T0,
    );
    const estado = readBuildFreshness(raiz);
    expect(estado.newestSourcePath).toBe("next.config.ts");
    expect(describeStaleBuild(estado)).toContain("El build es anterior");
  });

  it("node_modules no se recorre, por lento y por irrelevante", () => {
    const raiz = arbol(
      { "src/app/page.tsx": T0, "src/node_modules/paquete/index.js": DESPUES },
      T0,
    );
    expect(readBuildFreshness(raiz).newestSourcePath).toBe("src/app/page.tsx");
  });

  it("sin .next, lo informa como «no hay build» y no como build viejo", () => {
    const raiz = arbol({ "src/app/page.tsx": T0 }, null);
    const estado = readBuildFreshness(raiz);
    expect(estado.buildAt).toBeNull();
    expect(describeStaleBuild(estado)).toContain("No hay build");
  });

  // El árbol de verdad, para que el alcance no se quede en el de mentira: `src/` existe y la guarda
  // lo encuentra. Es lo que falla si alguien renombra la carpeta y nadie toca esta guarda.
  it("sobre el repositorio real encuentra fuentes bajo src/", () => {
    const estado = readBuildFreshness(process.cwd());
    expect(estado.newestSourcePath).toMatch(
      /^(src\/|next\.config|postcss\.config)/,
    );
    expect(estado.newestSourceAt).not.toBeNull();
  });
});

import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { archivosDelRepositorio } from "./archivos-del-repositorio";

// Esta prueba existe por una razón precisa: seis veces en este proyecto una guarda pasó en
// verde sin haber leído los archivos nuevos de la subfase, porque enumeraba con
// `git ls-files` sin `--others`. El verde no probaba nada. Lo que sigue es la prueba de
// que la enumeración **puede fallar**: si alguien le saca `--others`, el caso «ve un
// archivo sin versionar» se pone rojo acá y no seis meses después.
//
// Se hace sobre un repositorio de juguete en un directorio temporal, no sobre el árbol
// real, por dos motivos. Uno: crear y borrar un archivo de verdad mientras las otras
// guardas corren en paralelo sobre `src` y sobre el repositorio entero provoca `ENOENT`
// intermitentes. Dos: una evidencia que depende de un archivo temporal creado a mano es
// de las que no se vuelven a correr nunca, y entonces no es evidencia.

let raiz: string;

const git = (...args: string[]) =>
  execFileSync("git", args, { cwd: raiz, encoding: "utf8" });

beforeAll(() => {
  raiz = mkdtempSync(join(tmpdir(), "guarda-enumeracion-"));

  // `-q` y sin hooks ni plantillas: un repositorio mínimo y predecible.
  git("init", "-q", "--template=");

  writeFileSync(join(raiz, "rastreado.ts"), "export const a = 1;\n");
  // Se agrega al índice. No hace falta commitear: `--cached` lee el índice, y commitear
  // exigiría configurar un autor.
  git("add", "rastreado.ts");

  // El caso que importa: existe en el disco y NO está en el índice.
  writeFileSync(join(raiz, "sin-versionar.ts"), "export const b = 2;\n");

  // Negativo cercano: lo que `.gitignore` excluye tiene que seguir afuera. Si entrara,
  // la enumeración se llenaría de dependencias y nadie volvería a mirar una guarda.
  writeFileSync(join(raiz, ".gitignore"), "ignorado/\n");
  mkdirSync(join(raiz, "ignorado"));
  writeFileSync(
    join(raiz, "ignorado", "dependencia.ts"),
    "export const c = 3;\n",
  );

  // Para comprobar que el pathspec acota.
  mkdirSync(join(raiz, "sub"));
  writeFileSync(join(raiz, "sub", "adentro.ts"), "export const d = 4;\n");
});

afterAll(() => {
  if (raiz) rmSync(raiz, { recursive: true, force: true });
});

describe("la enumeración que usan las guardas", () => {
  it("ve los archivos versionados", () => {
    expect(archivosDelRepositorio([], { cwd: raiz })).toContain("rastreado.ts");
  });

  it("VE un archivo sin versionar, que es el falso verde que esta guarda evita", () => {
    expect(archivosDelRepositorio([], { cwd: raiz })).toContain(
      "sin-versionar.ts",
    );
  });

  it("no ve lo que .gitignore excluye", () => {
    const archivos = archivosDelRepositorio([], { cwd: raiz });

    expect(archivos).not.toContain("ignorado/dependencia.ts");
    expect(archivos.some((a) => a.startsWith("ignorado/"))).toBe(false);
  });

  it("acota al pathspec, y adentro del pathspec sigue viendo lo nuevo", () => {
    expect(archivosDelRepositorio(["sub"], { cwd: raiz })).toEqual([
      "sub/adentro.ts",
    ]);

    writeFileSync(join(raiz, "sub", "nuevo.ts"), "export const e = 5;\n");
    expect(archivosDelRepositorio(["sub"], { cwd: raiz })).toContain(
      "sub/nuevo.ts",
    );
  });

  it("no parte un nombre con espacios ni con acentos", () => {
    writeFileSync(
      join(raiz, "con espacio y ácento.ts"),
      "export const f = 6;\n",
    );

    expect(archivosDelRepositorio([], { cwd: raiz })).toContain(
      "con espacio y ácento.ts",
    );
  });
});

describe("la enumeración sobre este repositorio", () => {
  // Que funcione en el repositorio de juguete no prueba que el `cwd` por omisión sea el
  // correcto cuando corre la guarda de verdad.
  it("devuelve archivos de este repositorio", () => {
    const archivos = archivosDelRepositorio();

    expect(archivos.length).toBeGreaterThan(0);
    expect(archivos).toContain("tests/guards/archivos-del-repositorio.ts");
  });

  it("acota a src/ cuando se le pide src/", () => {
    const archivos = archivosDelRepositorio(["src"]);

    expect(archivos.length).toBeGreaterThan(0);
    expect(archivos.every((a) => a.startsWith("src/"))).toBe(true);
  });

  it("no trae nada de node_modules/", () => {
    expect(
      archivosDelRepositorio().some((a) => a.startsWith("node_modules/")),
    ).toBe(false);
  });
});

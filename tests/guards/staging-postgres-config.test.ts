import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Guarda de los parámetros de costo del planificador en staging (9.3, D-2 y AC-5).
//
// Lo que protege: el entregable principal de la 9.3 es **la forma del plan**, y la forma del plan
// la elige el planificador a partir de estos números. Si vuelven a describir una máquina que no
// existe, todos los planes medidos dejan de significar lo que dicen — y no falla nada, porque un
// planificador mal informado sigue devolviendo resultados correctos, solo que por otro camino.
//
// **No busca subcadenas: parsea el archivo, convierte las unidades y compara contra la RAM de la
// máquina.** Es la lección de la 9.2, donde una guarda que comprobaba la presencia de un texto
// era ciega a un `sort -r` de cinco caracteres al lado. Acá el equivalente sería comprobar que
// dice `effective_cache_size` y no cuánto: `4GB` y `600MB` contienen los dos esa cadena.
//
// Límite declarado: esta guarda lee el archivo **versionado**, no el del servidor, y la RAM de la
// máquina está escrita acá abajo como constante. Que el servidor tenga este archivo y que la
// máquina siga teniendo esta memoria son dos cosas que ningún test del repositorio puede ver; se
// comprueban con el paso manual de `deploy/staging/README.md`. Es una mitigación de H-1, no su
// desaparición.

const ARCHIVO = "deploy/staging/postgresql-crm-staging.conf";
const CONFIGURACION = readFileSync(ARCHIVO, "utf8");

// Memoria total del droplet, medida con `free -m` el 2026-09-23: 961 MB.
const RAM_BYTES = 961 * 1024 * 1024;

const UNIDADES: Record<string, number> = {
  "": 1,
  kB: 1024,
  MB: 1024 * 1024,
  GB: 1024 * 1024 * 1024,
  TB: 1024 * 1024 * 1024 * 1024,
};

export function parsear(texto: string): Map<string, string> {
  const valores = new Map<string, string>();
  for (const cruda of texto.split("\n")) {
    // El comentario empieza en `#` y llega hasta el fin de línea, también a mitad de una clave.
    const linea = cruda.split("#")[0]!.trim();
    if (linea === "") continue;
    const igual = linea.indexOf("=");
    if (igual === -1) continue;
    valores.set(
      linea.slice(0, igual).trim(),
      linea
        .slice(igual + 1)
        .trim()
        .replace(/^'|'$/g, ""),
    );
  }
  return valores;
}

// Convierte `600MB`, `1.1`, `4GB` a un número comparable. Una unidad desconocida **lanza** en vez
// de devolver algo aproximado: el simulador de la 9.2 enseñó que lo que un instrumento no entiende
// tiene que hacerlo fallar, no ignorarlo.
export function aBytes(valor: string): number {
  const coincidencia = /^([0-9]+(?:\.[0-9]+)?)\s*([A-Za-z]*)$/.exec(valor);
  if (!coincidencia) throw new Error(`no entiendo el valor '${valor}'`);
  const unidad = coincidencia[2] ?? "";
  const factor = UNIDADES[unidad];
  if (factor === undefined) {
    throw new Error(`no conozco la unidad '${unidad}' en '${valor}'`);
  }
  return Number(coincidencia[1]) * factor;
}

describe("el parser", () => {
  it("lee claves, ignora comentarios y corta el comentario de media línea", () => {
    const valores = parsear(
      "# entero\na = 1\n\nb = 2MB # al costado\n  c = 'texto'\n",
    );
    expect(valores.get("a")).toBe("1");
    expect(valores.get("b")).toBe("2MB");
    expect(valores.get("c")).toBe("texto");
    expect(valores.size).toBe(3);
  });

  it("convierte las unidades que PostgreSQL escribe", () => {
    expect(aBytes("1.1")).toBe(1.1);
    expect(aBytes("600MB")).toBe(600 * 1024 * 1024);
    expect(aBytes("4GB")).toBe(4 * 1024 * 1024 * 1024);
    expect(aBytes("16384kB")).toBe(16384 * 1024);
  });

  it("falla ante una unidad que no conoce, en vez de aproximar", () => {
    expect(() => aBytes("600 petabytes")).toThrow(/no conozco la unidad/);
    expect(() => aBytes("mucho")).toThrow(/no entiendo el valor/);
  });
});

describe("los parámetros de costo describen la máquina real", () => {
  const valores = parsear(CONFIGURACION);

  it("fija los dos parámetros que estaban mal", () => {
    expect(valores.has("effective_cache_size")).toBe(true);
    expect(valores.has("random_page_cost")).toBe(true);
  });

  it("effective_cache_size no supera la memoria de la máquina", () => {
    const declarado = aBytes(valores.get("effective_cache_size")!);
    expect(declarado).toBeLessThanOrEqual(RAM_BYTES);
    // Y tampoco es absurdamente chico: por debajo de shared_buffers el planificador creería que
    // no hay caché y volvería a elegir mal, en la dirección contraria.
    expect(declarado).toBeGreaterThan(128 * 1024 * 1024);
  });

  // La mutación: el valor que tenía el servidor antes de la 9.3. Sin este caso, el anterior
  // pasaría igual si alguien restaurara el valor por defecto de PostgreSQL.
  //
  // El ancla `^` con `m` no es cosmética. La primera versión de esta mutación usaba
  // `/effective_cache_size = \S+/` sin anclar y **reemplazaba el comentario de la cabecera**,
  // donde el archivo cita `effective_cache_size = 4GB` justamente para explicar el defecto: el
  // parámetro real quedaba intacto y la mutación no mutaba nada. Es la misma forma del hallazgo
  // que la 9.2 ya tuvo una vez, cuando una aserción sobre `--no-owner` se cumplía contra el
  // comentario que advertía sobre `--no-owner`.
  it("con effective_cache_size en su valor anterior, el caso anterior falla", () => {
    const mutada = CONFIGURACION.replace(
      /^effective_cache_size = \S+/m,
      "effective_cache_size = 4GB",
    );
    const declarado = aBytes(parsear(mutada).get("effective_cache_size")!);
    expect(declarado).toBeGreaterThan(RAM_BYTES);
  });

  it("random_page_cost es el de un SSD, no el de un disco con cabezal", () => {
    const costo = aBytes(valores.get("random_page_cost")!);
    expect(costo).toBeLessThan(4);
    expect(costo).toBeGreaterThanOrEqual(1);
  });

  it("con random_page_cost en su valor anterior, el caso anterior falla", () => {
    const mutada = CONFIGURACION.replace(
      /^random_page_cost = \S+/m,
      "random_page_cost = 4",
    );
    expect(aBytes(parsear(mutada).get("random_page_cost")!)).toBe(4);
  });

  // Control de que las dos mutaciones de arriba muerden el parámetro y no el comentario: si el
  // ancla se perdiera, el valor efectivo seguiría siendo el bueno y estos dos casos lo dirían.
  it("las mutaciones cambian el parámetro efectivo, no la cabecera", () => {
    const efectivo = (texto: string, clave: string) =>
      aBytes(parsear(texto).get(clave)!);
    expect(efectivo(CONFIGURACION, "effective_cache_size")).not.toBe(
      efectivo(
        CONFIGURACION.replace(
          /^effective_cache_size = \S+/m,
          "effective_cache_size = 4GB",
        ),
        "effective_cache_size",
      ),
    );
    expect(efectivo(CONFIGURACION, "random_page_cost")).not.toBe(
      efectivo(
        CONFIGURACION.replace(
          /^random_page_cost = \S+/m,
          "random_page_cost = 4",
        ),
        "random_page_cost",
      ),
    );
  });

  // Cambiar estos dos en silencio movería los tiempos y las comparaciones contra la 8.5 dejarían
  // de medir lo que dicen medir, sin que nada falle.
  it("no toca shared_buffers ni work_mem, que quedan declarados fuera de alcance", () => {
    expect(valores.has("shared_buffers")).toBe(false);
    expect(valores.has("work_mem")).toBe(false);
  });

  it("declara en su cabecera por qué existe y qué no toca", () => {
    expect(CONFIGURACION).toMatch(/961 MB/);
    expect(CONFIGURACION).toMatch(/NO toca/);
    // El archivo dice a dónde va: sin eso, versionarlo no sirve para desplegarlo.
    expect(CONFIGURACION).toMatch(
      /\/etc\/postgresql\/18\/main\/conf\.d\/crm-staging\.conf/,
    );
  });
});

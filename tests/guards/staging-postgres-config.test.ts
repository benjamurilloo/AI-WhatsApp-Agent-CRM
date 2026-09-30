import { readdirSync, readFileSync } from "node:fs";
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

// Un archivo por entorno (brief-13.1, D-12). La RAM de cada máquina es una constante porque ningún
// test puede medirla.
//   - staging: medida con `free -m` el 2026-09-23, 961 MB.
//   - production: medida con `free -m` el 2026-09-29 (13.1.2), 1967 MB. Reemplaza los 2048 MB
//     provisionales de la 13.1.1.
const ENTORNOS_POSTGRES = [
  {
    nombre: "staging",
    archivo: "deploy/staging/postgresql-crm-staging.conf",
    destino: /\/etc\/postgresql\/18\/main\/conf\.d\/crm-staging\.conf/,
    ramMb: 961,
    ramTexto: /961 MB/,
  },
  {
    nombre: "production",
    archivo: "deploy/production/postgresql-crm-production.conf",
    destino: /\/etc\/postgresql\/18\/main\/conf\.d\/crm-production\.conf/,
    ramMb: 1967,
    ramTexto: /1967 MB/,
  },
] as const;

// Esta guarda tiene su propia lista, así que la cobertura de `deploy/` se comprueba acá contra
// ella, no contra la de la guarda del proxy. Hasta la revisión independiente de la 13.1 solo la
// del proxy lo hacía, y un entorno agregado solo a su lista quedaba sin guarda de PostgreSQL.
/** Directorios de `deploy/` que ninguna entrada de ENTORNOS_POSTGRES cubre. */
export function directoriosSinPostgres(
  directorios: readonly string[],
): string[] {
  const cubiertos = new Set<string>(
    ENTORNOS_POSTGRES.map((e) => e.archivo.split("/").slice(0, 2).join("/")),
  );
  return directorios
    .map((nombre) => `deploy/${nombre}`)
    .filter((directorio) => !cubiertos.has(directorio));
}

describe("todo directorio de deploy/ tiene su guarda de PostgreSQL", () => {
  const presentes = readdirSync("deploy", { withFileTypes: true })
    .filter((entrada) => entrada.isDirectory())
    .map((entrada) => entrada.name);

  it("no hay ningún directorio de despliegue sin su entorno en ENTORNOS_POSTGRES", () => {
    expect(directoriosSinPostgres(presentes)).toEqual([]);
  });

  it("un directorio nuevo sin guarda de PostgreSQL se detecta", () => {
    expect(directoriosSinPostgres([...presentes, "demo"])).toEqual([
      "deploy/demo",
    ]);
  });
});

const UNIDADES: Record<string, number> = {
  "": 1,
  kB: 1024,
  MB: 1024 * 1024,
  GB: 1024 * 1024 * 1024,
  TB: 1024 * 1024 * 1024 * 1024,
};

// Corta el comentario: `#` hasta el fin de línea, salvo dentro de un valor entre comillas simples.
function sinComentario(linea: string): string {
  let entreComillas = false;
  for (let i = 0; i < linea.length; i++) {
    const c = linea[i];
    // Una comilla escapada con barra invertida no abre ni cierra el valor.
    if (c === "\\" && entreComillas) i++;
    else if (c === "'") entreComillas = !entreComillas;
    else if (c === "#" && !entreComillas) return linea.slice(0, i);
  }
  return linea;
}

// Sigue la sintaxis de PostgreSQL 18 (docs, §19.1.2): un parámetro por línea, `=` opcional, nombre
// sin distinguir mayúsculas y, con entradas repetidas, gana la última. Las claves salen en
// minúsculas. Lo que no reconoce **lanza**: con la versión de la 9.3, que salteaba toda línea sin
// `=`, `effective_cache_size 4GB` al final del archivo cambiaba el servidor con la guarda en verde
// (R-12 de la revisión de la 9.3).
export function parsear(texto: string): Map<string, string> {
  const valores = new Map<string, string>();
  for (const cruda of texto.split("\n")) {
    const linea = sinComentario(cruda).trim();
    if (linea === "") continue;
    const partes = /^([A-Za-z_][A-Za-z0-9_.]*)\s*(?:=\s*|\s+)(\S.*)$/.exec(
      linea,
    );
    if (!partes) throw new Error(`no entiendo la línea '${linea}'`);
    const nombre = partes[1]!.toLowerCase();
    // Un include trae otro archivo que esta guarda no puede leer: aceptarlo sería no mirar.
    if (nombre === "include" || nombre.startsWith("include_")) {
      throw new Error(`la guarda no sigue un ${nombre}: '${linea}'`);
    }
    valores.set(nombre, valor(partes[2]!.trim(), linea));
  }
  return valores;
}

// «Parameter values that are not simple identifiers or numbers must be single-quoted» (§19.1.2).
// Sin comillas, el valor es una sola palabra: `600 MB` es un error de sintaxis para PostgreSQL, y
// la guarda lo aceptaba (M-3 de la revisión independiente de la 11.0). Entre comillas, la comilla
// se escapa duplicándola o con barra invertida, y solo ahí se desescapa.
function valor(crudo: string, linea: string): string {
  const entreComillas = /^'((?:[^'\\]|''|\\.)*)'$/.exec(crudo);
  if (entreComillas) {
    return entreComillas[1]!.replace(/''/g, "'").replace(/\\(.)/g, "$1");
  }
  if (/^[A-Za-z0-9_.+-]+$/.test(crudo)) return crudo;
  throw new Error(`no entiendo la línea '${linea}'`);
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

// effective_cache_size sin unidad está en bloques de 8 kB: «If this value is specified without
// units, it is taken as blocks, that is BLCKSZ bytes, typically 8kB» (§19.7.2). Leerlo con
// `aBytes` lo tomaba como bytes, y `500000000` —unos 3,7 TB para PostgreSQL— pasaba por 477 MB
// (M-3 de la revisión independiente de la 11.0). BLCKSZ es 8 kB en el paquete de PostgreSQL de
// staging; es una premisa de compilación que ningún test puede ver.
const BLOQUE = 8 * 1024;
export function cacheEnBytes(texto: string): number {
  return /^[0-9]+$/.test(texto.trim()) ? Number(texto) * BLOQUE : aBytes(texto);
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

  // Las formas que acepta PostgreSQL 18 (docs, §19.1.2 y §19.1.1): «The equal sign between name
  // and value is optional», «All parameter names are case-insensitive» y «If the file contains
  // multiple entries for the same parameter, all but the last one are ignored». La versión de la
  // 9.3 salteaba la línea sin `=` y distinguía mayúsculas (R-12 de la revisión de la 9.3).
  it("lee la línea sin signo igual, como PostgreSQL", () => {
    expect(
      parsear("effective_cache_size 4GB\n").get("effective_cache_size"),
    ).toBe("4GB");
  });

  it("no distingue mayúsculas en el nombre del parámetro", () => {
    expect(
      parsear("Effective_Cache_Size = 4GB\n").get("effective_cache_size"),
    ).toBe("4GB");
  });

  it("con el parámetro repetido, gana la última entrada", () => {
    expect(parsear("a = 1\nA 2\n").get("a")).toBe("2");
  });

  it("no corta en un `#` después de una comilla escapada", () => {
    expect(parsear("c = 'a\\'b # c' # comentario\n").get("c")).toBe("a'b # c");
  });

  it("no corta un valor entre comillas en un `#`", () => {
    expect(parsear("c = 'uno # dos' # comentario\n").get("c")).toBe(
      "uno # dos",
    );
  });

  // Lo que no entiende lo hace fallar: una línea ignorada es un parámetro que el servidor sí lee.
  it("falla ante una línea que no reconoce, en vez de saltearla", () => {
    expect(() => parsear("= 4GB\n")).toThrow(/no entiendo la línea/);
    expect(() => parsear("effective_cache_size\n")).toThrow(
      /no entiendo la línea/,
    );
  });

  // Revisión independiente de la 11.0 (M-3): un valor sin comillas que no es un identificador ni
  // un número es un error de sintaxis para PostgreSQL, y la guarda lo aceptaba.
  it("falla ante un valor sin comillas con espacios, como PostgreSQL", () => {
    expect(() => parsear("effective_cache_size = 600 MB\n")).toThrow(
      /no entiendo la línea/,
    );
  });

  it("desescapa las comillas solo dentro de un valor entre comillas", () => {
    expect(parsear("c = 'a''b'\n").get("c")).toBe("a'b");
    expect(parsear("c = 'a\\'b'\n").get("c")).toBe("a'b");
    expect(() => parsear("c = a''b\n")).toThrow(/no entiendo la línea/);
  });

  // Sin unidad, PostgreSQL lee effective_cache_size en bloques de 8 kB, no en bytes (docs,
  // §19.7.2: «If this value is specified without units, it is taken as blocks»).
  it("lee effective_cache_size sin unidad en bloques de 8 kB", () => {
    expect(cacheEnBytes("76800")).toBe(600 * 1024 * 1024);
    expect(cacheEnBytes("600MB")).toBe(600 * 1024 * 1024);
  });

  it("falla ante un include, porque no puede leer el archivo que trae", () => {
    expect(() => parsear("include 'otro.conf'\n")).toThrow(/include/);
    expect(() => parsear("include_dir 'conf.d'\n")).toThrow(/include/);
  });
});

describe.each(ENTORNOS_POSTGRES)(
  "$nombre: los parámetros de costo describen la máquina real",
  (entorno) => {
    const CONFIGURACION = readFileSync(entorno.archivo, "utf8");
    const RAM_BYTES = entorno.ramMb * 1024 * 1024;
    const valores = parsear(CONFIGURACION);

    it("fija los dos parámetros que estaban mal", () => {
      expect(valores.has("effective_cache_size")).toBe(true);
      expect(valores.has("random_page_cost")).toBe(true);
    });

    it("effective_cache_size no supera la memoria de la máquina", () => {
      const declarado = cacheEnBytes(valores.get("effective_cache_size")!);
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
      const declarado = cacheEnBytes(
        parsear(mutada).get("effective_cache_size")!,
      );
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

    // R-12: las dos formas que la guarda de la 9.3 no veía, agregadas al final del archivo. En los
    // dos casos PostgreSQL toma el valor agregado, porque la última entrada gana.
    it.each([
      ["sin signo igual", "effective_cache_size 4GB"],
      ["con otras mayúsculas", "Effective_Cache_Size = 4GB"],
      // M-3 de la revisión independiente de la 11.0: 500.000.000 leído como bytes son unos 477 MB y
      // pasaba las dos cotas; PostgreSQL lo lee como bloques de 8 kB, unos 3,7 TB.
      ["sin unidad", "effective_cache_size = 500000000"],
    ])(
      "con un effective_cache_size mayor que la RAM agregado %s, el caso anterior falla",
      (_, linea) => {
        const mutada = `${CONFIGURACION}\n${linea}\n`;
        const declarado = cacheEnBytes(
          parsear(mutada).get("effective_cache_size")!,
        );
        expect(declarado).toBeGreaterThan(RAM_BYTES);
      },
    );

    // Control de que las dos mutaciones de arriba muerden el parámetro y no el comentario: si el
    // ancla se perdiera, el valor efectivo seguiría siendo el bueno y estos dos casos lo dirían.
    it("las mutaciones cambian el parámetro efectivo, no la cabecera", () => {
      const efectivo = (texto: string, clave: string) =>
        (clave === "effective_cache_size" ? cacheEnBytes : aBytes)(
          parsear(texto).get(clave)!,
        );
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
      expect(CONFIGURACION).toMatch(entorno.ramTexto);
      expect(CONFIGURACION).toMatch(/NO toca/);
      // El archivo dice a dónde va: sin eso, versionarlo no sirve para desplegarlo.
      expect(CONFIGURACION).toMatch(entorno.destino);
    });
  },
);

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Guarda de las sentencias preparadas con nombre (13.2, AC-2; O-2 de la evaluación 10.1).
//
// Los planes del proyecto se midieron como planes *custom*: PostgreSQL planifica cada ejecución
// con los valores de sus parámetros. Eso vale mientras la aplicación no use sentencias preparadas
// **con nombre**: con ellas, después de cinco ejecuciones PostgreSQL puede pasar a un plan
// *genérico*, que no mira los valores, y una consulta medida con un plan termina corriendo con
// otro sin que cambie una línea de SQL.
//
// Hoy no hay ninguna. Leído en los paquetes instalados (brief-13.2, H-1): `pg` 8.23.0 prepara con
// nombre solo si la configuración de la consulta trae `name` (`lib/query.js:35-58`), y
// `drizzle-orm` 0.45.2 solo le pasa un nombre cuando se llama a `.prepare("nombre")`
// (`node-postgres/session.js:21-23`). Esta guarda fija ese estado.
//
// Lo que esta guarda NO comprueba, y hay que saberlo antes de confiar en ella:
// - no ve una configuración de consulta armada en una variable y pasada después a `.query(`;
// - no ve un nombre de método armado dinámicamente (`db["pre" + "pare"]`);
// - no mira el servidor: `plan_cache_mode = force_generic_plan` en un rol da planes genéricos
//   sin ninguna sentencia con nombre. Eso se lee en el servidor (AC-1), no acá;
// - lee el código como texto, así que una mención dentro de un comentario de bloque también la
//   dispara. Es deliberado: prefiere un falso positivo a un agujero.
//
// Por qué `pg` solo se importa desde dos archivos: una consulta con nombre necesita llegar a
// `pg`, y la forma que el patrón de `.query(` no ve es la de la variable. Con el import acotado,
// esa forma solo puede aparecer en dos archivos, que se leen enteros en una revisión.

const RAICES = ["src", "scripts", "seeds"];
const IMPORTA_PG = ["src/shared/db/client.ts", "scripts/migrar.ts"];

type Forma = { nombre: string; patron: RegExp };

const FORMAS: Forma[] = [
  // `.prepare(`, `?.prepare(`, con espacios o saltos de línea antes del paréntesis.
  { nombre: ".prepare(", patron: /\??\.\s*prepare\s*\(/ },
  // `db["prepare"](` y `db['prepare'](`.
  { nombre: '["prepare"]', patron: /\[\s*["'`]prepare["'`]\s*\]/ },
  // `.query({ name: …` y la forma abreviada `.query({ name, text })`.
  {
    nombre: ".query({ name })",
    patron: /\.\s*query\s*\(\s*\{[^}]*\bname\b\s*[:,}]/,
  },
  // `queryMode: "extended"` no da nombre, pero es la otra puerta de `pg` a la preparación.
  { nombre: "queryMode", patron: /\bqueryMode\b/ },
  // SQL escrito a mano: `PREPARE plan AS …` o `PREPARE plan (tipos) AS …`.
  {
    nombre: "PREPARE … AS",
    patron: /\bprepare\s+\w+\s*(?:\([^)]*\)\s*)?as\b/i,
  },
  // Fijar el modo de plan desde el código. Leerlo (`show plan_cache_mode`) no cuenta: el script
  // de medición lo lee para comprobar que es el de fábrica. La primera versión marcaba cualquier
  // mención, y falló contra ese script.
  {
    nombre: "fijar plan_cache_mode",
    patron:
      /\bset\s+(?:local\s+|session\s+)?plan_cache_mode\b|plan_cache_mode\s*(?:=|\bto\b)\s*["']?force_/i,
  },
];

const IMPORT_PG =
  /(?:from\s*["']pg["']|require\(\s*["']pg["']\s*\)|import\(\s*["']pg["']\s*\))/;

export function violaciones(file: string, code: string): string[] {
  const halladas = FORMAS.filter((forma) => forma.patron.test(code)).map(
    (forma) => `${file}: ${forma.nombre}`,
  );
  if (IMPORT_PG.test(code) && !IMPORTA_PG.includes(file)) {
    halladas.push(`${file}: importa pg`);
  }
  return halladas;
}

function archivos(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const ruta = `${dir}/${entry.name}`;
    if (entry.isDirectory()) return archivos(ruta);
    return /\.(?:ts|tsx|mts|cts|js|mjs|cjs)$/.test(entry.name) ? [ruta] : [];
  });
}

describe("detección de una sentencia preparada con nombre", () => {
  it.each([
    {
      name: "un select de Drizzle preparado",
      code: 'const q = db.select().from(clients).prepare("clientes");',
    },
    {
      name: "con el paréntesis en la línea siguiente",
      code: "const q = db.select().from(clients)\n  .prepare\n  (nombre);",
    },
    {
      name: "con encadenamiento opcional",
      code: 'const q = consulta?.prepare("x");',
    },
    {
      name: "con espacios alrededor del punto",
      code: 'const q = consulta . prepare ("x");',
    },
    {
      name: "por corchetes",
      code: 'const q = consulta["prepare"]("x");',
    },
    {
      name: "una configuración de pg con nombre",
      code: 'await pool.query({ name: "cliente-por-id", text, values });',
    },
    {
      name: "la configuración en varias líneas, con el nombre al final",
      code: "await client.query({\n  text: consulta,\n  values: [id],\n  name: nombre,\n});",
    },
    {
      name: "la forma abreviada",
      code: "await client.query({ name, text });",
    },
    {
      name: "queryMode extendido",
      code: 'await pool.query({ text, queryMode: "extended" });',
    },
    {
      name: "PREPARE escrito a mano",
      code: "await db.execute(sql`prepare vigente as select 1`);",
    },
    {
      name: "PREPARE con tipos, en mayúsculas",
      code: "await db.execute(sql`PREPARE vigente (uuid, text) AS select 1`);",
    },
    {
      name: "el modo de plan forzado",
      code: "await db.execute(sql`set plan_cache_mode = force_generic_plan`);",
    },
    {
      name: "el modo de plan forzado en un rol",
      code: "await db.execute(sql`alter role crm_app set plan_cache_mode to force_generic_plan`);",
    },
    {
      name: "el modo de plan forzado en las opciones de la conexión",
      code: 'const url = base + "?options=-c%20plan_cache_mode=force_custom_plan";',
    },
  ])("detecta $name", ({ code }) => {
    expect(violaciones("src/modules/crm/repository.ts", code)).not.toEqual([]);
  });

  it.each([
    { name: "un import con nombre", code: 'import { Pool } from "pg";' },
    { name: "un import por defecto", code: 'import pg from "pg";' },
    { name: "un require", code: 'const { Client } = require("pg");' },
    { name: "un import dinámico", code: 'const pg = await import("pg");' },
  ])("detecta $name de pg fuera de los dos archivos", ({ code }) => {
    expect(violaciones("src/modules/crm/repository.ts", code)).toEqual([
      "src/modules/crm/repository.ts: importa pg",
    ]);
    expect(violaciones("src/shared/db/client.ts", code)).toEqual([]);
  });

  it.each([
    {
      name: "una consulta normal de Drizzle",
      code: "const rows = await db.select().from(clients).where(eq(clients.id, id));",
    },
    {
      name: "db.execute con parámetros",
      code: "await db.execute(sql`select 1 where id = ${id}`);",
    },
    {
      name: "una columna que se llama name",
      code: "await tx.insert(users).values({ name: user.name, email });",
    },
    {
      name: "una función propia que prepara otra cosa",
      code: "const hash = await prepareInitialPassword(password);",
    },
    {
      name: "leer el modo de plan",
      code: "const modo = await db.execute(sql`show plan_cache_mode`);",
    },
    {
      name: "cerrar el pool",
      code: "await db.$client.end();",
    },
    {
      name: "un import de un paquete que empieza con pg",
      code: 'import { pgTable } from "drizzle-orm/pg-core";',
    },
  ])("no marca $name", ({ code }) => {
    expect(violaciones("src/modules/crm/repository.ts", code)).toEqual([]);
  });
});

describe("el código de la aplicación no prepara sentencias con nombre", () => {
  const todos = RAICES.flatMap(archivos);

  it("recorre archivos de las tres raíces", () => {
    for (const raiz of RAICES) {
      expect(todos.some((file) => file.startsWith(`${raiz}/`))).toBe(true);
    }
    for (const file of IMPORTA_PG) expect(todos).toContain(file);
  });

  it("ningún archivo usa ninguna de las formas", () => {
    const halladas = todos.flatMap((file) =>
      violaciones(file, readFileSync(join(process.cwd(), file), "utf8")),
    );
    expect(halladas).toEqual([]);
  });

  it("los dos archivos que importan pg lo siguen importando", () => {
    // Si dejaran de hacerlo, la lista de excepciones quedaría vieja y nadie lo notaría.
    for (const file of IMPORTA_PG) {
      expect(
        IMPORT_PG.test(readFileSync(join(process.cwd(), file), "utf8")),
      ).toBe(true);
    }
  });
});

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
// Por qué `pg` solo se importa desde dos archivos y el pool crudo solo se usa en otros dos: una
// consulta con nombre necesita llegar a `pg`, y la forma que el patrón de `.query(` no ve es la
// de la variable. Acotar el `import` no alcanza: `Db` expone el pool como `$client`, así que
// `getDb().$client.query(config)` llega a `pg` sin importarlo (revisión independiente de la
// 13.2, H-2). Por eso `$client` solo puede aparecer para cerrar el pool, salvo en los archivos
// de `USA_POOL`, que se leen enteros en una revisión.
//
// Las migraciones se miran aparte, solo por las dos formas que son SQL: un `ALTER ROLE … SET
// plan_cache_mode` en `drizzle/` cambiaría los planes sin tocar una línea de TypeScript.

const RAICES = ["src", "scripts", "seeds"];
const IMPORTA_PG = ["src/shared/db/client.ts", "scripts/migrar.ts"];
const USA_POOL = ["src/shared/db/client.ts", "scripts/medir-caminos.ts"];
const MIGRACIONES = "drizzle";

type Forma = { nombre: string; patron: RegExp };

const FORMAS: Forma[] = [
  // `.prepare(`, `?.prepare(`, con espacios o saltos de línea antes del paréntesis.
  { nombre: ".prepare(", patron: /\??\.\s*prepare\s*\(/ },
  // `db["prepare"](` y `db['prepare'](`.
  { nombre: '["prepare"]', patron: /\[\s*["'`]prepare["'`]\s*\]/ },
  // `.query({ name: …` y la forma abreviada `.query({ name, text })`.
  {
    nombre: ".query({ name })",
    // Hasta 4000 caracteres y no hasta la primera llave: un `${x}` en `text` o un objeto en
    // `values` cortaban el patrón anterior antes de llegar a `name` (H-2).
    patron: /\.\s*query\s*\(\s*\{[\s\S]{0,4000}?\bname\b\s*[:,}]/,
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
      /\bset\s+(?:local\s+|session\s+)?plan_cache_mode\b|plan_cache_mode\s*(?:=|\bto\b)\s*["']?force_|set_config\s*\(\s*["']plan_cache_mode/i,
  },
];

// Las formas que pueden escribirse en una migración.
const FORMAS_SQL = FORMAS.filter((forma) =>
  ["PREPARE … AS", "fijar plan_cache_mode"].includes(forma.nombre),
);

// `$client` fuera de `$client.end(`: el pool crudo, con el que se llega a `pg` sin importarlo.
const POOL_CRUDO = /\$client(?!\s*\.\s*end\s*\()/;

const IMPORT_PG =
  /(?:from\s*["']pg["']|require\(\s*["']pg["']\s*\)|import\(\s*["']pg["']\s*\))/;

export function violaciones(file: string, code: string): string[] {
  const halladas = FORMAS.filter((forma) => forma.patron.test(code)).map(
    (forma) => `${file}: ${forma.nombre}`,
  );
  if (IMPORT_PG.test(code) && !IMPORTA_PG.includes(file)) {
    halladas.push(`${file}: importa pg`);
  }
  if (POOL_CRUDO.test(code) && !USA_POOL.includes(file)) {
    halladas.push(`${file}: usa el pool crudo`);
  }
  return halladas;
}

export function violacionesSql(file: string, code: string): string[] {
  return FORMAS_SQL.filter((forma) => forma.patron.test(code)).map(
    (forma) => `${file}: ${forma.nombre}`,
  );
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
      name: "la configuración con un template antes del nombre",
      code: "await pool.query({ text: `select ${columna} from t`, name: nombre });",
    },
    {
      name: "la configuración con un objeto antes del nombre",
      code: "await pool.query({ values: [{ a: 1 }], text, name: nombre });",
    },
    {
      name: "el modo de plan fijado con set_config",
      code: "await db.execute(sql`select set_config('plan_cache_mode', 'force_generic_plan', false)`);",
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
      name: "una consulta por el pool crudo, con la configuración en una variable",
      code: "await getDb().$client.query(config);",
    },
    {
      name: "una conexión tomada del pool crudo",
      code: "const cliente = await db.$client.connect();",
    },
    {
      name: "el pool crudo guardado en una variable",
      code: "const pool = getDb().$client;",
    },
    {
      name: "el pool crudo por corchetes",
      code: 'const pool = db["$client"];',
    },
  ])("detecta $name fuera de los dos archivos", ({ code }) => {
    expect(violaciones("src/modules/crm/repository.ts", code)).toEqual([
      "src/modules/crm/repository.ts: usa el pool crudo",
    ]);
    expect(violaciones("scripts/medir-caminos.ts", code)).toEqual([]);
  });

  it.each([
    {
      name: "fijar el modo de plan en un rol",
      code: "ALTER ROLE crm_app SET plan_cache_mode = force_generic_plan;",
    },
    {
      name: "fijar el modo de plan en la base",
      code: "alter database crm set plan_cache_mode to force_custom_plan;",
    },
    { name: "un PREPARE", code: "PREPARE vigente (uuid) AS SELECT 1;" },
  ])("detecta $name en una migración", ({ code }) => {
    expect(violacionesSql("drizzle/0099_x.sql", code)).not.toEqual([]);
  });

  it("no marca una migración corriente", () => {
    expect(
      violacionesSql(
        "drizzle/0099_x.sql",
        'CREATE INDEX "clients_name_idx" ON "clients" ("name");',
      ),
    ).toEqual([]);
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

  it("ninguna migración prepara una sentencia ni fija el modo de plan", () => {
    const migraciones = readdirSync(MIGRACIONES).filter((name) =>
      name.endsWith(".sql"),
    );
    expect(migraciones.length).toBeGreaterThan(0);
    const halladas = migraciones.flatMap((name) =>
      violacionesSql(
        `${MIGRACIONES}/${name}`,
        readFileSync(join(process.cwd(), MIGRACIONES, name), "utf8"),
      ),
    );
    expect(halladas).toEqual([]);
  });

  it("el script de medición sigue usando el pool crudo", () => {
    // Si dejara de hacerlo, la excepción quedaría vieja y nadie lo notaría.
    expect(
      POOL_CRUDO.test(
        readFileSync(join(process.cwd(), "scripts/medir-caminos.ts"), "utf8"),
      ),
    ).toBe(true);
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

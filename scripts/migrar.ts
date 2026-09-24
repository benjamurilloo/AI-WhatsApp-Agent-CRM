// Aplica las migraciones pendientes de `drizzle/` (11.0, D-2). Es lo que corre `npm run db:migrate`,
// en local y en staging.
//
// Por qué no `drizzle-kit migrate`: ante un error de PostgreSQL sale con código 1 **sin imprimir
// el error**. Verificado en drizzle-kit@0.31.10: `renderWithTask` captura la excepción y hace
// `process.exit(1)` (bin.cjs:1457-1469), y lo único que muestra es el spinner, porque
// `MigrateProgress` ignora el error en el estado `rejected` (bin.cjs:7714-7718). Reproducido en la
// 11.0 con un rol sin permiso de crear tablas: código 1, stderr vacío y en stdout solo
// «applying migrations...». En la 9.1 ese silencio escondió que la migración 0003 necesitaba
// `CREATEROLE` (O-8).
//
// Usa el mismo migrador que los tests (`tests/integration/global-setup.ts`), así que la CI prueba
// la librería que despliega. **No** ejecuta este script: lo que la CI no cubre es este envoltorio,
// que se probó a mano en la 11.0 (brief-11.0, AC-9). Conducta verificada en drizzle-orm@0.45.2
// (pg-core/dialect.js:60-71 y pg-core/session.js:36-42): todas las migraciones pendientes se
// aplican en **una sola transacción**, así que si falla una no queda aplicada ninguna del lote, y
// el error llega como `DrizzleQueryError` con el de PostgreSQL en `cause`.

import { existsSync } from "node:fs";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";

// El error de PostgreSQL con lo que hace falta para diagnosticarlo. No se imprime el objeto
// entero: `DrizzleQueryError` lleva los parámetros de la consulta.
function describirError(error: unknown): string {
  const causa =
    error instanceof Error && error.cause instanceof Error
      ? error.cause
      : error;
  if (!(causa instanceof Error)) return String(causa);
  const pg = causa as Error & { code?: string; detail?: string; hint?: string };
  const lineas = [`Error de PostgreSQL: ${pg.message}`];
  if (pg.code) lineas.push(`SQLSTATE: ${pg.code}`);
  if (pg.detail) lineas.push(`Detalle: ${pg.detail}`);
  if (pg.hint) lineas.push(`Sugerencia: ${pg.hint}`);
  if (error instanceof Error && error !== causa) {
    // La primera línea del mensaje de Drizzle es «Failed query: <sentencia>», que dice en qué
    // migración falló. Se recorta: una sentencia de migración puede ocupar muchas líneas.
    lineas.push(error.message.split("\n")[0]!.slice(0, 300));
  }
  return lineas.join("\n");
}

async function main(): Promise<void> {
  // Igual que drizzle.config.ts: en local se lee .env; en CI y en staging las variables llegan del
  // entorno, y `loadEnvFile` no pisa una variable que ya existe.
  if (existsSync(".env")) process.loadEnvFile(".env");
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("Falta DATABASE_URL.");

  const pool = new Pool({ connectionString: url });
  try {
    await migrate(drizzle({ client: pool }), { migrationsFolder: "drizzle" });
  } catch (error) {
    // Si cerrar el pool también falla, ese error no puede reemplazar al de la migración, que es
    // el que hay que ver (n-1 de la revisión independiente de la 11.0).
    await pool.end().catch(() => undefined);
    throw error;
  }
  await pool.end();
  console.log("Migraciones aplicadas.");
}

main().catch((error: unknown) => {
  console.error("Las migraciones NO se aplicaron.");
  console.error(describirError(error));
  process.exitCode = 1;
});

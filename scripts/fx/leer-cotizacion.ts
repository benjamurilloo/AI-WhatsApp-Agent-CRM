import { readFileSync } from "node:fs";
import { join } from "node:path";
import pg from "pg";
import { readerDatabase, runReader } from "./lectura.ts";

// El lector de la cotización, crm-fx-reader (ADR 0025, punto 9; brief-29.4.2, D-6 y D-7). Lo corre
// su timer cinco veces por día, con Node quitando los tipos:
//
//   node scripts/fx/leer-cotizacion.ts
//
// La conexión sale de las variables PG* que fija la unidad, sin secretos. La contraseña la entrega
// systemd en $CREDENTIALS_DIRECTORY/fx-reader-db (LoadCredential=): nunca va en el entorno, en los
// argumentos ni en el journal. Fuera de systemd, para una prueba local, se usan PGPASSWORD o el
// .pgpass del usuario, como psql.

function credentialPassword(): string | undefined {
  const directory = process.env.CREDENTIALS_DIRECTORY;
  if (!directory) return undefined;
  return readFileSync(join(directory, "fx-reader-db"), "utf8").replace(
    /\r?\n$/,
    "",
  );
}

const log = (line: string) => console.log(line);

const client = new pg.Client({
  password: credentialPassword(),
  application_name: "crm-fx-reader",
  connectionTimeoutMillis: 10_000,
  statement_timeout: 10_000,
});

let exitCode = 1;
try {
  await client.connect();
  exitCode = await runReader({
    fetch: (url, init) => fetch(url, init),
    database: readerDatabase(client),
    log,
  });
} catch (error) {
  // El mensaje de pg no trae la contraseña; la cadena de conexión no existe, son variables PG*.
  const message = error instanceof Error ? error.message : "desconocido";
  log(`FALLA: el lector no terminó (${message}).`);
} finally {
  await client.end().catch(() => undefined);
}
process.exitCode = exitCode;

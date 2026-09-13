import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

export type Db = NodePgDatabase & { $client: Pool };

// Una sola instancia por proceso: next dev recarga módulos y abriría un pool por recarga.
const globalForDb = globalThis as typeof globalThis & { crmDb?: Db };

export function createDb(connectionString: string): Db {
  const pool = new Pool({ connectionString, connectionTimeoutMillis: 2000 });
  // Si la base corta una conexión inactiva (reinicio, parada), pg emite "error" en el pool.
  // Sin este manejador es un uncaughtException que tira el proceso y vuelca el cliente con la contraseña.
  pool.on("error", (error) => {
    const reason = (error as { code?: string }).code ?? error.name;
    console.error(`[db] conexión inactiva perdida: ${reason}`);
  });
  return drizzle({ client: pool });
}

// La conexión se crea en el primer uso, no al importar: next build no necesita la base.
export function getDb(): Db {
  if (!globalForDb.crmDb) {
    const url = process.env.DATABASE_URL;
    if (!url) {
      throw new Error("Falta DATABASE_URL: copiá .env.example a .env.");
    }
    globalForDb.crmDb = createDb(url);
  }
  return globalForDb.crmDb;
}

import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Client, Pool } from "pg";
import {
  maintenanceUrl,
  testDatabaseName,
  testDatabaseUrl,
} from "./test-database";

// Recrea la base de test y le aplica las migraciones desde cero en cada ejecución (brief-3.1, D-1).
// Usa el migrador de drizzle-orm, no drizzle-kit: no depende de esbuild.
export default async function setup() {
  const base = process.env.DATABASE_URL;
  if (!base) {
    throw new Error("Falta DATABASE_URL: copiá .env.example a .env.");
  }
  const name = testDatabaseName(base);

  const admin = new Client({ connectionString: maintenanceUrl(base) });
  await admin.connect();
  try {
    // El nombre ya pasó por la validación de test-database.ts.
    await admin.query(`drop database if exists "${name}" with (force)`);
    await admin.query(`create database "${name}"`);
  } finally {
    await admin.end();
  }

  const pool = new Pool({ connectionString: testDatabaseUrl(base) });
  try {
    await migrate(drizzle({ client: pool }), { migrationsFolder: "drizzle" });
  } finally {
    await pool.end();
  }
}

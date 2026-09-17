import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Client } from "pg";
import { createDb } from "@/shared/db";
import { seedBasic } from "../../seeds/basic";
import {
  e2eDatabaseName,
  e2eDatabaseUrl,
  maintenanceUrl,
} from "../integration/test-database";

// Contraseña sintética de los usuarios del seed en end-to-end.
export const E2E_PASSWORD = "contraseña-sintética-e2e";

// Credencial sintética de ingestión que el servidor de end-to-end acepta (brief-6.5.3, D-6).
// ingestion.spec.ts la inserta; ningún emisor real la conoce.
export const E2E_INGESTION_CREDENTIAL_ID =
  "5eed0000-0000-4000-8000-0000000000e1";

// Recrea la base _e2e, le aplica las migraciones y la siembra (brief-3.5, D-8).
export default async function globalSetup() {
  const base = process.env.DATABASE_URL;
  if (!base) {
    throw new Error("Falta DATABASE_URL: copiá .env.example a .env.");
  }
  const name = e2eDatabaseName(base);

  const admin = new Client({ connectionString: maintenanceUrl(base) });
  await admin.connect();
  try {
    // El nombre ya pasó por la validación de test-database.ts.
    await admin.query(`drop database if exists "${name}" with (force)`);
    await admin.query(`create database "${name}"`);
  } finally {
    await admin.end();
  }

  const db = createDb(e2eDatabaseUrl(base));
  try {
    await migrate(db, { migrationsFolder: "drizzle" });
    await seedBasic(db, E2E_PASSWORD);
  } finally {
    await db.$client.end();
  }
}

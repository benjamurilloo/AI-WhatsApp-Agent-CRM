import { sql } from "drizzle-orm";
import type { Db } from "@/shared/db";

// Vacía las tablas de dominio antes de cada test (brief-3.1, D-1).
// La tabla de control de migraciones vive en el esquema "drizzle" y no se toca.
export async function resetDatabase(db: Db): Promise<void> {
  const current = await db.execute<{ name: string }>(
    sql`select current_database() as name`,
  );
  const name = current.rows[0]?.name ?? "";
  if (!name.endsWith("_test")) {
    throw new Error(
      `resetDatabase solo corre contra una base de test, no contra "${name}".`,
    );
  }

  const tables = await db.execute<{ tablename: string }>(
    sql`select tablename from pg_tables where schemaname = 'public'`,
  );
  if (tables.rows.length === 0) return;

  const list = tables.rows
    .map((row) => `"public"."${row.tablename}"`)
    .join(", ");
  await db.execute(sql.raw(`truncate table ${list} restart identity cascade`));
}

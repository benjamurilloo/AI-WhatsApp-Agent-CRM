import { sql } from "drizzle-orm";
import { getDb, type Db } from "./client";

type CheckOptions = { db?: Db; timeoutMs?: number };

// Devuelve si la base responde. Nunca lanza ni expone el error (Overview.md).
export async function checkDatabase({
  db,
  timeoutMs = 2000,
}: CheckOptions = {}): Promise<boolean> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error("timeout")), timeoutMs);
  });

  try {
    await Promise.race([(db ?? getDb()).execute(sql`select 1`), timeout]);
    return true;
  } catch (error) {
    // Solo el código o el nombre: el mensaje del driver puede incluir host o usuario.
    const reason =
      (error as { code?: string }).code ?? (error as Error).name ?? "unknown";
    console.error(`[health] base no disponible: ${reason}`);
    return false;
  } finally {
    clearTimeout(timer);
  }
}

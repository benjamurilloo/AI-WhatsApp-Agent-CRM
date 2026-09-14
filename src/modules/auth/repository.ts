import { and, eq, gt, lte, or, sql } from "drizzle-orm";
import { getDb } from "@/shared/db";
import { loginAttempts, sessions, users } from "./schema";

// Acceso a las tablas propias de auth. Ninguna consulta toca tablas de otro módulo (brief-3.3, D-2).

export type LoginAttemptScope = "account" | "ip";

export async function findUserByEmail(normalizedEmail: string) {
  const rows = await getDb()
    .select({
      id: users.id,
      passwordHash: users.passwordHash,
      isActive: users.isActive,
    })
    .from(users)
    .where(sql`lower(${users.email}) = ${normalizedEmail}`)
    .limit(1);
  return rows[0];
}

export async function findUserById(userId: string) {
  const rows = await getDb()
    .select({
      id: users.id,
      passwordHash: users.passwordHash,
      isActive: users.isActive,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  return rows[0];
}

export async function insertSession(session: {
  id: string;
  userId: string;
  createdAt: Date;
  expiresAt: Date;
}): Promise<void> {
  await getDb().insert(sessions).values(session);
}

export async function findSessionWithUser(sessionId: string) {
  const rows = await getDb()
    .select({
      id: sessions.id,
      userId: sessions.userId,
      createdAt: sessions.createdAt,
      expiresAt: sessions.expiresAt,
      isActive: users.isActive,
      mustChangePassword: users.mustChangePassword,
    })
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .where(eq(sessions.id, sessionId))
    .limit(1);
  return rows[0];
}

export async function updateSessionExpiry(
  sessionId: string,
  expiresAt: Date,
): Promise<void> {
  await getDb()
    .update(sessions)
    .set({ expiresAt })
    .where(eq(sessions.id, sessionId));
}

export async function deleteSession(sessionId: string): Promise<void> {
  await getDb().delete(sessions).where(eq(sessions.id, sessionId));
}

export async function deleteUserSessions(userId: string): Promise<void> {
  await getDb().delete(sessions).where(eq(sessions.userId, userId));
}

export async function deleteExpiredUserSessions(
  userId: string,
  now: Date,
  createdBefore: Date,
): Promise<void> {
  await getDb()
    .delete(sessions)
    .where(
      and(
        eq(sessions.userId, userId),
        or(
          lte(sessions.expiresAt, now),
          lte(sessions.createdAt, createdBefore),
        ),
      ),
    );
}

// Cambia la contraseña y reemplaza todas las sesiones del usuario en una sola transacción.
// Con onlyIfMustChangePassword no toca nada si el flag ya está en false (brief-3.5, D-4).
export async function replacePasswordAndSessions(
  userId: string,
  passwordHash: string,
  session: { id: string; createdAt: Date; expiresAt: Date },
  options: { onlyIfMustChangePassword?: boolean } = {},
): Promise<boolean> {
  return getDb().transaction(async (tx) => {
    const updated = await tx
      .update(users)
      .set({ passwordHash, mustChangePassword: false })
      .where(
        options.onlyIfMustChangePassword
          ? and(eq(users.id, userId), eq(users.mustChangePassword, true))
          : eq(users.id, userId),
      )
      .returning({ id: users.id });
    if (updated.length === 0) return false;
    await tx.delete(sessions).where(eq(sessions.userId, userId));
    await tx.insert(sessions).values({ ...session, userId });
    return true;
  });
}

export async function recentFailures(
  scope: LoginAttemptScope,
  keyHash: string,
  windowStart: Date,
): Promise<{ count: number; oldest: Date | null }> {
  const db = getDb();
  // Los registros vencidos de esta clave ya no cuentan: se borran en cada intento.
  await db
    .delete(loginAttempts)
    .where(
      and(
        eq(loginAttempts.scope, scope),
        eq(loginAttempts.keyHash, keyHash),
        lte(loginAttempts.attemptedAt, windowStart),
      ),
    );
  const rows = await db
    .select({
      count: sql`count(*)`.mapWith(Number),
      oldest: sql`min(${loginAttempts.attemptedAt})`.mapWith(
        loginAttempts.attemptedAt,
      ),
    })
    .from(loginAttempts)
    .where(
      and(
        eq(loginAttempts.scope, scope),
        eq(loginAttempts.keyHash, keyHash),
        gt(loginAttempts.attemptedAt, windowStart),
      ),
    );
  return { count: rows[0]?.count ?? 0, oldest: rows[0]?.oldest ?? null };
}

export async function recordFailures(
  keys: { scope: LoginAttemptScope; keyHash: string }[],
  attemptedAt: Date,
): Promise<void> {
  await getDb()
    .insert(loginAttempts)
    .values(keys.map((key) => ({ ...key, attemptedAt })));
}

export async function clearFailures(
  scope: LoginAttemptScope,
  keyHash: string,
): Promise<void> {
  await getDb()
    .delete(loginAttempts)
    .where(
      and(eq(loginAttempts.scope, scope), eq(loginAttempts.keyHash, keyHash)),
    );
}

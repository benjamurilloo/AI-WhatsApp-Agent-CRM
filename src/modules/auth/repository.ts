import { and, eq, gt, inArray, lte, or, sql } from "drizzle-orm";
import { getDb, type Db, type DbTransaction } from "@/shared/db";
import { loginAttempts, sessions, users } from "./schema";

// Acceso a las tablas propias de auth. Ninguna consulta toca tablas de otro módulo (brief-3.3, D-2).

export type LoginAttemptScope = "account" | "ip";

// Nombre, email y estado de varios usuarios en una consulta, para componer la lista de
// miembros sin JOIN (brief-3.7, D-3). Dentro de una transacción ve lo que esa transacción escribió.
export async function findUserSummaries(
  userIds: string[],
  executor: Db | DbTransaction = getDb(),
) {
  if (userIds.length === 0) return [];
  return executor
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      isActive: users.isActive,
    })
    .from(users)
    .where(inArray(users.id, userIds));
}

// Alta con contraseña inicial pendiente de cambio (brief-3.7). Corre en un savepoint: un email
// repetido (23505) deshace solo este insert y la transacción del llamador sigue usable.
export async function insertUserWithInitialPassword(
  tx: DbTransaction,
  user: { name: string; email: string; passwordHash: string },
): Promise<{ id: string } | "email_taken"> {
  try {
    return await tx.transaction(async (savepoint) => {
      const rows = await savepoint
        .insert(users)
        .values({ ...user, mustChangePassword: true, isActive: true })
        .returning({ id: users.id });
      return rows[0]!;
    });
  } catch (error) {
    if (isEmailUniqueViolation(error)) return "email_taken";
    throw error;
  }
}

// drizzle-orm envuelve el error de pg; el código y la constraint quedan en la causa.
function isEmailUniqueViolation(error: unknown): boolean {
  const e = error as {
    code?: string;
    constraint?: string;
    cause?: { code?: string; constraint?: string };
  } | null;
  const source = e?.cause ?? e;
  return (
    source?.code === "23505" && source.constraint === "users_email_lower_unique"
  );
}

export async function updateUserActive(
  tx: DbTransaction,
  userId: string,
  isActive: boolean,
): Promise<void> {
  await tx.update(users).set({ isActive }).where(eq(users.id, userId));
}

export async function deleteUserSessionsInTransaction(
  tx: DbTransaction,
  userId: string,
): Promise<void> {
  await tx.delete(sessions).where(eq(sessions.userId, userId));
}

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
  // Los registros vencidos ya no cuentan: se borran en cada intento, los de todas las claves. Si
  // solo se borraran los de esta, el hash de una IP que no vuelve quedaría para siempre, y un hash
  // sin sal de una IP es la IP (brief-13.4, D-7). La ventana es la misma para los dos alcances.
  await db
    .delete(loginAttempts)
    .where(lte(loginAttempts.attemptedAt, windowStart));
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

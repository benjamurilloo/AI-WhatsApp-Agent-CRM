import { createHash, randomBytes } from "node:crypto";
import { z } from "zod";
import type { Failure } from "@/shared/errors";
import {
  hashPassword,
  passwordSchema,
  verifyAgainstDummy,
  verifyPassword,
} from "./password";
import * as repository from "./repository";

// Sesiones del ADR 0012 y límite de intentos del brief-3.3 (D-3).

const MINUTE_MS = 60 * 1000;
const DAY_MS = 24 * 60 * MINUTE_MS;

export const SESSION_TTL_MS = 7 * DAY_MS;
export const SESSION_MAX_AGE_MS = 30 * DAY_MS;
export const LOGIN_WINDOW_MS = 15 * MINUTE_MS;
export const ACCOUNT_FAILURE_LIMIT = 5;
export const IP_FAILURE_LIMIT = 20;

// 32 bytes en base64url, sin relleno.
const tokenPattern = /^[A-Za-z0-9_-]{43}$/;

// Códigos de la taxonomía compartida (brief-3.4, D-1).
export type AuthFailure =
  | Failure<"UNAUTHENTICATED">
  | Failure<"VALIDATION_ERROR">
  | Failure<"RATE_LIMITED", { retryAfterSeconds: number }>;

export type SessionIssued = { ok: true; token: string; expiresAt: Date };

export type AuthenticatedUser = {
  userId: string;
  mustChangePassword: boolean;
  expiresAt: Date;
};

const unauthenticated = { ok: false, code: "UNAUTHENTICATED" } as const;
const validationError = { ok: false, code: "VALIDATION_ERROR" } as const;

const loginInput = z.object({
  email: z.email().max(254),
  password: passwordSchema,
});

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

async function issueSession(userId: string, now: Date): Promise<SessionIssued> {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(now.getTime() + SESSION_TTL_MS);
  await repository.insertSession({ id: sha256(token), userId, expiresAt });
  return { ok: true, token, expiresAt };
}

async function rateLimited(
  keys: {
    scope: repository.LoginAttemptScope;
    keyHash: string;
    limit: number;
  }[],
  now: Date,
): Promise<AuthFailure | null> {
  const windowStart = new Date(now.getTime() - LOGIN_WINDOW_MS);
  let retryAfterMs = 0;
  for (const key of keys) {
    const { count, oldest } = await repository.recentFailures(
      key.scope,
      key.keyHash,
      windowStart,
    );
    if (count >= key.limit && oldest) {
      const waitMs = oldest.getTime() + LOGIN_WINDOW_MS - now.getTime();
      retryAfterMs = Math.max(retryAfterMs, waitMs);
    }
  }
  if (retryAfterMs <= 0) return null;
  return {
    ok: false,
    code: "RATE_LIMITED",
    retryAfterSeconds: Math.max(1, Math.ceil(retryAfterMs / 1000)),
  };
}

// ip es null cuando no hay proxy de confianza: todas las requests comparten una clave (D-4).
export async function login(input: {
  email: string;
  password: string;
  ip: string | null;
}): Promise<SessionIssued | AuthFailure> {
  const parsed = loginInput.safeParse(input);
  if (!parsed.success) return validationError;

  const now = new Date();
  const email = parsed.data.email.toLowerCase();
  const accountKey = sha256(email);
  const ipKey = sha256(input.ip ?? "sin-proxy");

  // El límite se evalúa antes de verificar la contraseña.
  const limited = await rateLimited(
    [
      { scope: "account", keyHash: accountKey, limit: ACCOUNT_FAILURE_LIMIT },
      { scope: "ip", keyHash: ipKey, limit: IP_FAILURE_LIMIT },
    ],
    now,
  );
  if (limited) return limited;

  const user = await repository.findUserByEmail(email);
  const valid = user
    ? await verifyPassword(user.passwordHash, parsed.data.password)
    : await verifyAgainstDummy(parsed.data.password);

  if (!user || !valid || !user.isActive) {
    await repository.recordFailures(
      [
        { scope: "account", keyHash: accountKey },
        { scope: "ip", keyHash: ipKey },
      ],
      now,
    );
    return unauthenticated;
  }

  await repository.clearFailures("account", accountKey);
  await repository.deleteExpiredUserSessions(
    user.id,
    now,
    new Date(now.getTime() - SESSION_MAX_AGE_MS),
  );
  return issueSession(user.id, now);
}

export async function validateSession(
  token: string | null | undefined,
): Promise<AuthenticatedUser | null> {
  if (!token || !tokenPattern.test(token)) return null;

  const session = await repository.findSessionWithUser(sha256(token));
  if (!session) return null;

  const now = new Date();
  const absoluteEnd = session.createdAt.getTime() + SESSION_MAX_AGE_MS;
  if (
    session.expiresAt.getTime() <= now.getTime() ||
    absoluteEnd <= now.getTime()
  ) {
    await repository.deleteSession(session.id);
    return null;
  }
  if (!session.isActive) return null;

  let expiresAt = session.expiresAt;
  // Renovación deslizante solo a mitad de ventana, sin pasar el tope absoluto.
  if (expiresAt.getTime() - now.getTime() < SESSION_TTL_MS / 2) {
    expiresAt = new Date(Math.min(now.getTime() + SESSION_TTL_MS, absoluteEnd));
    await repository.updateSessionExpiry(session.id, expiresAt);
  }

  return {
    userId: session.userId,
    mustChangePassword: session.mustChangePassword,
    expiresAt,
  };
}

export async function logout(token: string | null | undefined): Promise<void> {
  if (!token || !tokenPattern.test(token)) return;
  await repository.deleteSession(sha256(token));
}

export async function changePassword(input: {
  userId: string;
  currentPassword: string;
  newPassword: string;
}): Promise<SessionIssued | AuthFailure> {
  const parsedNew = passwordSchema.safeParse(input.newPassword);
  if (!parsedNew.success) return validationError;

  const user = await repository.findUserById(input.userId);
  if (!user || !user.isActive) return unauthenticated;
  if (!(await verifyPassword(user.passwordHash, input.currentPassword))) {
    return unauthenticated;
  }

  const now = new Date();
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(now.getTime() + SESSION_TTL_MS);
  await repository.replacePasswordAndSessions(
    user.id,
    await hashPassword(parsedNew.data),
    { id: sha256(token), expiresAt },
  );
  return { ok: true, token, expiresAt };
}

export async function revokeUserSessions(userId: string): Promise<void> {
  await repository.deleteUserSessions(userId);
}

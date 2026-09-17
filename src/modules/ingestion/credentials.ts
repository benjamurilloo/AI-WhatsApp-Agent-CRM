import { createHash, randomBytes } from "node:crypto";
import type { Failure } from "@/shared/errors";
import { isOpaqueReference } from "./contract";
import * as repository from "./repository";

// Credenciales de servicio de la ingestión (brief-6.5.3, D-1 y D-2). El token es aleatorio y se
// guarda solo su SHA-256, como el de la sesión (ADR 0012): con 32 bytes no hace falta un hash lento.

export const INGESTION_TOKEN_PREFIX = "crm_ing_";

// 32 bytes en base64url, sin relleno: 43 caracteres.
const tokenPattern = /^crm_ing_[A-Za-z0-9_-]{43}$/;
const bearerPattern = /^Bearer ([^\s]+)$/;
const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type IngestionCredential = {
  id: string;
  organizationId: string;
  source: string;
};

export function generateIngestionToken(): string {
  return INGESTION_TOKEN_PREFIX + randomBytes(32).toString("base64url");
}

export function hashIngestionToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

// Devuelve el token de un encabezado "Authorization: Bearer <token>" con el formato esperado.
export function tokenFromAuthorization(
  header: string | null | undefined,
): string | null {
  const match = header ? bearerPattern.exec(header) : null;
  const token = match?.[1];
  return token !== undefined && tokenPattern.test(token) ? token : null;
}

export type CreateIngestionCredentialResult =
  | { ok: true; credentialId: string; token: string }
  | Failure<"VALIDATION_ERROR", { fields: ("organizationId" | "source")[] }>;

// Solo la usa el script local: el token se devuelve una única vez (D-2).
export async function createIngestionCredential(
  organizationId: string,
  source: string,
): Promise<CreateIngestionCredentialResult> {
  const fields: ("organizationId" | "source")[] = [];
  if (!uuidPattern.test(organizationId)) fields.push("organizationId");
  if (!isOpaqueReference(source)) fields.push("source");
  if (fields.length > 0) return { ok: false, code: "VALIDATION_ERROR", fields };

  const token = generateIngestionToken();
  const credentialId = await repository.insertCredential({
    organizationId,
    source,
    tokenHash: hashIngestionToken(token),
  });
  return { ok: true, credentialId, token };
}

export async function revokeIngestionCredential(
  credentialId: string,
): Promise<boolean> {
  if (!uuidPattern.test(credentialId)) return false;
  return repository.revokeCredential(credentialId);
}

export type AuthenticateIngestionResult =
  | { ok: true; credential: IngestionCredential }
  | Failure<"UNAUTHENTICATED">
  | Failure<"FORBIDDEN">;

// Sin credencial reconocible: UNAUTHENTICATED. Revocada: FORBIDDEN (contrato v1, "Errores").
export async function authenticateIngestionRequest(
  authorization: string | null | undefined,
): Promise<AuthenticateIngestionResult> {
  const token = tokenFromAuthorization(authorization);
  if (token === null) return { ok: false, code: "UNAUTHENTICATED" };
  const stored = await repository.findCredentialByTokenHash(
    hashIngestionToken(token),
  );
  if (!stored) return { ok: false, code: "UNAUTHENTICATED" };
  if (stored.revokedAt !== null) return { ok: false, code: "FORBIDDEN" };
  return {
    ok: true,
    credential: {
      id: stored.id,
      organizationId: stored.organizationId,
      source: stored.source,
    },
  };
}

export function isUuid(value: string): boolean {
  return uuidPattern.test(value);
}

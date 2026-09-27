import { createHash, randomBytes } from "node:crypto";
import type { Failure } from "@/shared/errors";
import { isOpaqueReference } from "./contract";
import * as repository from "./repository";
import { CREDENTIAL_SCOPES } from "./schema";

// Credenciales de servicio de la ingestión (brief-6.5.3, D-1 y D-2). El token es aleatorio y se
// guarda solo su SHA-256, como el de la sesión (ADR 0012): con 32 bytes no hace falta un hash lento.
//
// Desde la 11.3 (D-2) cada credencial tiene un solo alcance, y el prefijo del token lo dice a la
// vista: `crm_ing_` escribe por la ingestión y `crm_read_` lee por la API de lectura. Desde la
// 12.4 (D-6), `crm_ctx_` lee el historial de las conversaciones. Una credencial presentada en la
// superficie de otro alcance da FORBIDDEN.

export type CredentialScope = (typeof CREDENTIAL_SCOPES)[number];

export const TOKEN_PREFIXES: Readonly<Record<CredentialScope, string>> = {
  ingest: "crm_ing_",
  read: "crm_read_",
  context: "crm_ctx_",
};

export const INGESTION_TOKEN_PREFIX = TOKEN_PREFIXES.ingest;

// Prefijo y 32 bytes en base64url, sin relleno: 43 caracteres.
const tokenPattern = /^crm_(ing|read|ctx)_[A-Za-z0-9_-]{43}$/;
const bearerPattern = /^Bearer ([^\s]+)$/;
const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type IngestionCredential = {
  id: string;
  organizationId: string;
  source: string;
  scope: CredentialScope;
};

export function generateServiceToken(scope: CredentialScope): string {
  return TOKEN_PREFIXES[scope] + randomBytes(32).toString("base64url");
}

export function generateIngestionToken(): string {
  return generateServiceToken("ingest");
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
  | Failure<
      "VALIDATION_ERROR",
      { fields: ("organizationId" | "source" | "scope")[] }
    >;

// Solo la usa el script local: el token se devuelve una única vez (D-2). Sin alcance, crea una de
// ingestión, como antes de la 11.3.
export async function createIngestionCredential(
  organizationId: string,
  source: string,
  scope: string = "ingest",
): Promise<CreateIngestionCredentialResult> {
  const fields: ("organizationId" | "source" | "scope")[] = [];
  if (!uuidPattern.test(organizationId)) fields.push("organizationId");
  if (!isOpaqueReference(source)) fields.push("source");
  if (!isCredentialScope(scope)) fields.push("scope");
  if (fields.length > 0 || !isCredentialScope(scope)) {
    return { ok: false, code: "VALIDATION_ERROR", fields };
  }

  const token = generateServiceToken(scope);
  const credentialId = await repository.insertCredential({
    organizationId,
    source,
    scope,
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

export function isCredentialScope(value: string): value is CredentialScope {
  return (CREDENTIAL_SCOPES as readonly string[]).includes(value);
}

// Sin credencial reconocible: UNAUTHENTICATED. Revocada, o de otro alcance: FORBIDDEN (contrato de
// ingestión v1 y de lectura v1, "Errores"). El alcance se compara con el guardado, no con el
// prefijo del token: el prefijo es para leerlo a la vista, la base es la que decide.
export async function authenticateServiceRequest(
  authorization: string | null | undefined,
  scope: CredentialScope,
): Promise<AuthenticateIngestionResult> {
  const token = tokenFromAuthorization(authorization);
  if (token === null) return { ok: false, code: "UNAUTHENTICATED" };
  const stored = await repository.findCredentialByTokenHash(
    hashIngestionToken(token),
  );
  if (!stored) return { ok: false, code: "UNAUTHENTICATED" };
  if (stored.revokedAt !== null) return { ok: false, code: "FORBIDDEN" };
  if (stored.scope !== scope) return { ok: false, code: "FORBIDDEN" };
  return {
    ok: true,
    credential: {
      id: stored.id,
      organizationId: stored.organizationId,
      source: stored.source,
      scope: stored.scope,
    },
  };
}

export function authenticateIngestionRequest(
  authorization: string | null | undefined,
): Promise<AuthenticateIngestionResult> {
  return authenticateServiceRequest(authorization, "ingest");
}

// El emisor de cada credencial, para mostrar el autor de servicio de la auditoría (brief-12.1, D-4).
// Solo las de la organización: un id ajeno o que no es uuid no aparece en el resultado.
export async function getCredentialSources(
  organizationId: string,
  credentialIds: string[],
): Promise<Map<string, string>> {
  const ids = [...new Set(credentialIds)].filter(isUuid);
  if (!isUuid(organizationId) || ids.length === 0) return new Map();
  const rows = await repository.findCredentialSources(organizationId, ids);
  return new Map(rows.map((row) => [row.id, row.source]));
}

export function isUuid(value: string): boolean {
  return uuidPattern.test(value);
}

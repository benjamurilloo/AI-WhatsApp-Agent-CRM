import { randomUUID } from "node:crypto";
import type { ErrorCode } from "@/shared/errors";

// Log estructurado en JSON (brief-3.5, D-9). Solo se escriben los campos de LogEvent:
// nunca contraseñas, tokens, hashes ni emails (SecurityModel.md, política de logs).

export type LogLevel = "info" | "warn" | "error";

export type LogEvent = {
  level: LogLevel;
  requestId: string;
  route: string;
  code: "OK" | ErrorCode;
  userId?: string;
  error?: unknown;
};

export function newRequestId(): string {
  return randomUUID();
}

// Códigos como un SQLSTATE o ECONNREFUSED; cualquier otro valor se descarta.
const errorCodePattern = /^[A-Z0-9_]{1,32}$/;

function errorCode(error: unknown): string | undefined {
  const code = (error as { code?: unknown } | null)?.code;
  return typeof code === "string" && errorCodePattern.test(code)
    ? code
    : undefined;
}

// Del error solo se registran el tipo y el código: el mensaje puede traer datos del usuario.
// Drizzle envuelve el error de pg, así que el código se busca también en la causa.
function describeError(error: unknown) {
  if (!(error instanceof Error)) return { name: typeof error };
  return {
    name: error.name,
    code: errorCode(error) ?? errorCode(error.cause),
  };
}

export function formatLogEvent(event: LogEvent, now = new Date()): string {
  return JSON.stringify({
    time: now.toISOString(),
    level: event.level,
    request_id: event.requestId,
    route: event.route,
    code: event.code,
    user_id: event.userId,
    error: event.error === undefined ? undefined : describeError(event.error),
  });
}

export function logEvent(event: LogEvent): void {
  const line = formatLogEvent(event);
  if (event.level === "error") console.error(line);
  else console.log(line);
}

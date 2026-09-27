import {
  authenticateServiceRequest,
  consumeIngestionRate,
  isOpaqueReference,
  type CredentialScope,
} from "@/modules/ingestion";
import { HTTP_STATUS, type ErrorCode } from "@/shared/errors";
import { logEvent, newRequestId, type LogEvent } from "@/shared/log";
import { isReadCredentialAllowed, readReadApiConfig } from "./config";
import type { ReadField } from "./contract";

// Borde común de la API de lectura v1 (brief-11.3, D-3). El orden es el de la ingestión: modo de
// prueba, credencial (con su alcance), allowlist, límite de tasa, validación del request, lectura
// y respuesta. Un rechazo anterior al límite no lo consume. No lee cookies: una sesión del CRM no
// autentica la API.
//
// Cada respuesta del borde encendido queda en el log con una ruta fija, nunca con la URL: la
// query trae lo que escribió un cliente (D-5). Tampoco el token ni un id buscado.

// Organización y emisor, tomados de la credencial.
export type ReadCaller = { organizationId: string; source: string };

// Alcance de la credencial que acepta cada ruta: `read` para el catálogo y la información del
// negocio, y `context` para el historial de conversaciones (brief-12.4, D-6). Una credencial de
// otro alcance da FORBIDDEN.
export type ReadScope = Extract<CredentialScope, "read" | "context">;

export type ReadResult =
  | { ok: true; status: 200; body: unknown }
  | { ok: false; code: ErrorCode; fields?: ReadField[] };

type Outcome = {
  response: Response;
  code: LogEvent["code"];
  caller?: ReadCaller;
  error?: unknown;
};

function headers(
  requestId: string,
  correlationId: string | undefined,
  extra: Record<string, string> = {},
): Record<string, string> {
  return {
    "Cache-Control": "no-store",
    "X-Request-Id": requestId,
    ...(correlationId === undefined
      ? {}
      : { "X-Correlation-Id": correlationId }),
    ...extra,
  };
}

function errorResponse(
  requestId: string,
  correlationId: string | undefined,
  code: ErrorCode,
  options: { fields?: ReadField[]; headers?: Record<string, string> } = {},
): Response {
  return Response.json(
    {
      code,
      request_id: requestId,
      ...(options.fields ? { fields: options.fields } : {}),
    },
    {
      status: HTTP_STATUS[code],
      headers: headers(requestId, correlationId, options.headers),
    },
  );
}

async function evaluate(
  request: Request,
  route: string,
  scope: ReadScope,
  requestId: string,
  now: Date,
  state: { correlationId?: string },
  read: (caller: ReadCaller, url: URL) => Promise<ReadResult>,
): Promise<Outcome | null> {
  const config = readReadApiConfig();
  if (!config.enabled) {
    if (config.invalid) {
      // La configuración inválida apaga la API y queda en el log (D-7).
      logEvent({ level: "error", requestId, route, code: "INTERNAL" });
    }
    return null;
  }

  const fail = (
    code: ErrorCode,
    options: { fields?: ReadField[]; headers?: Record<string, string> } = {},
    caller?: ReadCaller,
  ): Outcome => ({
    code,
    caller,
    response: errorResponse(requestId, state.correlationId, code, options),
  });

  const authenticated = await authenticateServiceRequest(
    request.headers.get("authorization"),
    scope,
  );
  if (!authenticated.ok) {
    return fail(authenticated.code, {
      headers:
        authenticated.code === "UNAUTHENTICATED"
          ? { "WWW-Authenticate": "Bearer" }
          : undefined,
    });
  }
  const { credential } = authenticated;
  const caller: ReadCaller = {
    organizationId: credential.organizationId,
    source: credential.source,
  };

  if (!isReadCredentialAllowed(config, credential.id)) {
    return fail("FORBIDDEN", {}, caller);
  }

  const rate = await consumeIngestionRate(credential.id, now);
  if (!rate.ok) {
    return fail(
      rate.code,
      { headers: { "Retry-After": String(rate.retryAfterSeconds) } },
      caller,
    );
  }

  // La correlación es opcional; si viene, tiene la forma de una referencia opaca (D-5).
  const correlation = request.headers.get("x-correlation-id");
  if (correlation !== null) {
    if (!isOpaqueReference(correlation)) {
      return fail("VALIDATION_ERROR", { fields: ["correlation_id"] }, caller);
    }
    state.correlationId = correlation;
  }

  const result = await read(caller, new URL(request.url));
  if (!result.ok) {
    return fail(result.code, { fields: result.fields }, caller);
  }
  return {
    code: "OK",
    caller,
    response: Response.json(result.body, {
      status: result.status,
      headers: headers(requestId, state.correlationId),
    }),
  };
}

export async function serveRead(
  request: Request,
  route: string,
  scope: ReadScope,
  now: Date,
  read: (caller: ReadCaller, url: URL) => Promise<ReadResult>,
): Promise<Response> {
  const started = performance.now();
  const requestId = newRequestId();
  const state: { correlationId?: string } = {};
  let outcome: Outcome;
  try {
    const evaluated = await evaluate(
      request,
      route,
      scope,
      requestId,
      now,
      state,
      read,
    );
    // Apagada, la API responde como una ruta que no existe (D-7).
    if (evaluated === null) {
      return new Response(null, {
        status: 404,
        headers: { "Cache-Control": "no-store" },
      });
    }
    outcome = evaluated;
  } catch (error) {
    outcome = {
      code: "INTERNAL",
      error,
      response: errorResponse(requestId, state.correlationId, "INTERNAL"),
    };
  }

  logEvent({
    level:
      outcome.code === "INTERNAL"
        ? "error"
        : outcome.code === "OK"
          ? "info"
          : "warn",
    requestId,
    route,
    code: outcome.code,
    organizationId: outcome.caller?.organizationId,
    source: outcome.caller?.source,
    correlationId: state.correlationId,
    durationMs: performance.now() - started,
    error: outcome.error,
  });
  return outcome.response;
}

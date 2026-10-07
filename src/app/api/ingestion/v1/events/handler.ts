import {
  authenticateIngestionRequest,
  consumeIngestionRate,
  INGESTION_CONTRACT_VERSION,
  isCredentialAllowed,
  isOpaqueReference,
  MAX_INGESTION_BODY_BYTES,
  readIngestionConfig,
  recordIngestionEvent,
  type IngestionAccepted,
  type IngestionContext,
  type RecordIngestionEventResult,
} from "@/modules/ingestion";
import { HTTP_STATUS, type ErrorCode } from "@/shared/errors";
import { isJsonContentType, readBodyWithLimit } from "@/shared/http";
import { logEvent, newRequestId, type LogEvent } from "@/shared/log";

// Endpoint del contrato de ingestión v1 (brief-6.5.3). Está fuera de route.ts para que los tests
// de integración le pasen la hora. Orden: modo de prueba, credencial, allowlist, límite de tasa,
// cuerpo y caso de uso. No lee cookies ni verifica Origin (D-5).
//
// Desde la 12.3 (D-1), el borde es compartido con v2 (serveIngestion): cambian la ruta, la versión
// de las respuestas, el caso de uso y dos cosas que solo tiene v2, la correlación antes del límite
// (D-6) y el motivo del CONFLICT (D-7). Con la especificación de v1, el comportamiento es el mismo.

export const INGESTION_ROUTE = "/api/ingestion/v1/events";

export type IngestionEdge = {
  route: string;
  contractVersion: string;
  record: (
    context: IngestionContext,
    body: string,
    now: Date,
  ) => Promise<RecordIngestionEventResult>;
  // Solo v2: X-Correlation-Id validado antes del límite y devuelto en cada respuesta (D-6), y el
  // reason del CONFLICT (D-7).
  correlation: boolean;
  conflictReason: boolean;
};

const V1: IngestionEdge = {
  route: INGESTION_ROUTE,
  contractVersion: INGESTION_CONTRACT_VERSION,
  record: recordIngestionEvent,
  correlation: false,
  conflictReason: false,
};

const baseHeaders = { "Cache-Control": "no-store" };

type Outcome = {
  response: Response;
  code: LogEvent["code"];
  organizationId?: string;
  source?: string;
  error?: unknown;
};

function errorResponse(
  requestId: string,
  code: ErrorCode,
  options: {
    fields?: string[];
    rule?: string;
    reason?: string;
    headers?: Record<string, string>;
  } = {},
): Response {
  return Response.json(
    {
      code,
      request_id: requestId,
      ...(options.fields ? { fields: options.fields } : {}),
      ...(options.rule ? { rule: options.rule } : {}),
      ...(options.reason ? { reason: options.reason } : {}),
    },
    {
      status: HTTP_STATUS[code],
      headers: { ...baseHeaders, ...options.headers },
    },
  );
}

function acceptedResponse(
  edge: IngestionEdge,
  requestId: string,
  accepted: IngestionAccepted,
  extra: Record<string, string>,
): Response {
  const headers = { ...baseHeaders, ...extra, "X-Request-Id": requestId };
  if ("client" in accepted) {
    // Siempre 200, con el cliente y sin su teléfono (brief-12.1, D-9).
    return Response.json(
      {
        contract_version: edge.contractVersion,
        event_id: accepted.eventId,
        result: accepted.result,
        client: accepted.client && {
          id: accepted.client.id,
          display_name: accepted.client.displayName,
          is_active: accepted.client.isActive,
        },
      },
      { status: 200, headers },
    );
  }
  if ("eventType" in accepted) {
    // Poner o quitar una etiqueta, solo en v2 (brief-16.2, D-5): siempre 200, sin datos del
    // cliente ni sus etiquetas. v1 nunca llega acá.
    return Response.json(
      {
        contract_version: edge.contractVersion,
        event_id: accepted.eventId,
        result: accepted.result,
      },
      { status: 200, headers },
    );
  }
  if ("conversation" in accepted) {
    // Siempre 200, con la referencia de la conversación y sin el id interno ni el teléfono
    // (brief-12.2, D-5).
    return Response.json(
      {
        contract_version: edge.contractVersion,
        event_id: accepted.eventId,
        result: accepted.result,
        conversation: accepted.conversation && {
          external_ref: accepted.conversation.externalRef,
          status: accepted.conversation.status,
        },
      },
      { status: 200, headers },
    );
  }
  return Response.json(
    {
      contract_version: edge.contractVersion,
      event_id: accepted.eventId,
      result: accepted.result,
      conversation_external_ref: accepted.conversationExternalRef,
      message_external_ref: accepted.messageExternalRef,
    },
    { status: accepted.result === "accepted" ? 201 : 200, headers },
  );
}

async function evaluate(
  edge: IngestionEdge,
  request: Request,
  requestId: string,
  now: Date,
  state: { correlationId?: string },
): Promise<Outcome | null> {
  const config = readIngestionConfig();
  if (!config.enabled) {
    if (config.invalid) {
      // La configuración inválida apaga el endpoint y queda en el log (D-4).
      logEvent({
        level: "error",
        requestId,
        route: edge.route,
        code: "INTERNAL",
      });
    }
    return null;
  }

  // La correlación viaja en toda respuesta desde que se valida (v2, D-6).
  const correlated = (): Record<string, string> =>
    state.correlationId === undefined
      ? {}
      : { "X-Correlation-Id": state.correlationId };

  const authenticated = await authenticateIngestionRequest(
    request.headers.get("authorization"),
  );
  if (!authenticated.ok) {
    return {
      code: authenticated.code,
      response: errorResponse(requestId, authenticated.code, {
        headers:
          authenticated.code === "UNAUTHENTICATED"
            ? { "WWW-Authenticate": "Bearer" }
            : undefined,
      }),
    };
  }
  const { credential } = authenticated;
  const who = {
    organizationId: credential.organizationId,
    source: credential.source,
  };

  if (!isCredentialAllowed(config, credential.id)) {
    return {
      ...who,
      code: "FORBIDDEN",
      response: errorResponse(requestId, "FORBIDDEN"),
    };
  }

  if (edge.correlation) {
    // Antes del límite, para que un 429 también la registre (brief-12.3, D-6 y C-4).
    const correlation = request.headers.get("x-correlation-id");
    if (correlation !== null) {
      if (!isOpaqueReference(correlation)) {
        return {
          ...who,
          code: "VALIDATION_ERROR",
          response: errorResponse(requestId, "VALIDATION_ERROR", {
            fields: ["correlation_id"],
          }),
        };
      }
      state.correlationId = correlation;
    }
  }

  const rate = await consumeIngestionRate(credential.id, now);
  if (!rate.ok) {
    return {
      ...who,
      code: rate.code,
      response: errorResponse(requestId, rate.code, {
        headers: {
          ...correlated(),
          "Retry-After": String(rate.retryAfterSeconds),
        },
      }),
    };
  }

  const invalidBody = () => ({
    ...who,
    code: "VALIDATION_ERROR" as const,
    response: errorResponse(requestId, "VALIDATION_ERROR", {
      fields: ["body"],
      headers: correlated(),
    }),
  });
  if (!isJsonContentType(request.headers.get("content-type"))) {
    return invalidBody();
  }
  const body = await readBodyWithLimit(request, MAX_INGESTION_BODY_BYTES);
  if (!body.ok) return invalidBody();

  const result = await edge.record(
    { ...who, credentialId: credential.id },
    body.text,
    now,
  );
  if (result.ok) {
    return {
      ...who,
      code: "OK",
      response: acceptedResponse(edge, requestId, result, correlated()),
    };
  }
  if (result.code === "VALIDATION_ERROR") {
    // El source sale de una credencial ya validada: si falla, es un error del servidor.
    if (result.fields.includes("source")) {
      throw new Error("credencial de ingestión con source inválido");
    }
    return {
      ...who,
      code: result.code,
      response: errorResponse(requestId, result.code, {
        fields: result.fields,
        headers: correlated(),
      }),
    };
  }
  if (result.code === "BUSINESS_RULE_VIOLATION") {
    // 422 con la regla, solo para los tipos nuevos (brief-12.2, C-2).
    return {
      ...who,
      code: result.code,
      response: errorResponse(requestId, result.code, {
        rule: result.rule,
        headers: correlated(),
      }),
    };
  }
  return {
    ...who,
    code: result.code,
    response: errorResponse(requestId, result.code, {
      reason: edge.conflictReason ? result.reason : undefined,
      headers: correlated(),
    }),
  };
}

export async function serveIngestion(
  edge: IngestionEdge,
  request: Request,
  now: Date,
): Promise<Response> {
  const started = performance.now();
  const requestId = newRequestId();
  const state: { correlationId?: string } = {};
  let outcome: Outcome;
  try {
    const processed = await evaluate(edge, request, requestId, now, state);
    if (processed === null) {
      return new Response(null, { status: 404, headers: baseHeaders });
    }
    outcome = processed;
  } catch (error) {
    outcome = {
      code: "INTERNAL",
      error,
      response: errorResponse(requestId, "INTERNAL", {
        headers:
          state.correlationId === undefined
            ? undefined
            : { "X-Correlation-Id": state.correlationId },
      }),
    };
  }

  // Nunca el token, el payload, el teléfono ni el cuerpo del mensaje.
  logEvent({
    level:
      outcome.code === "INTERNAL"
        ? "error"
        : outcome.code === "OK"
          ? "info"
          : "warn",
    requestId,
    route: edge.route,
    code: outcome.code,
    organizationId: outcome.organizationId,
    source: outcome.source,
    correlationId: state.correlationId,
    durationMs: performance.now() - started,
    error: outcome.error,
  });
  return outcome.response;
}

export function handleIngestionEvent(
  request: Request,
  now: Date = new Date(),
): Promise<Response> {
  return serveIngestion(V1, request, now);
}

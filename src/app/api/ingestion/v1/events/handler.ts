import {
  authenticateIngestionRequest,
  consumeIngestionRate,
  INGESTION_CONTRACT_VERSION,
  isCredentialAllowed,
  MAX_INGESTION_BODY_BYTES,
  readIngestionConfig,
  recordIngestionEvent,
  type IngestionAccepted,
} from "@/modules/ingestion";
import { HTTP_STATUS, type ErrorCode } from "@/shared/errors";
import { isJsonContentType, readBodyWithLimit } from "@/shared/http";
import { logEvent, newRequestId, type LogEvent } from "@/shared/log";

// Endpoint del contrato de ingestión v1 (brief-6.5.3). Está fuera de route.ts para que los tests
// de integración le pasen la hora. Orden: modo de prueba, credencial, allowlist, límite de tasa,
// cuerpo y caso de uso. No lee cookies ni verifica Origin (D-5).

export const INGESTION_ROUTE = "/api/ingestion/v1/events";

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
    headers?: Record<string, string>;
  } = {},
): Response {
  return Response.json(
    {
      code,
      request_id: requestId,
      ...(options.fields ? { fields: options.fields } : {}),
      ...(options.rule ? { rule: options.rule } : {}),
    },
    {
      status: HTTP_STATUS[code],
      headers: { ...baseHeaders, ...options.headers },
    },
  );
}

function acceptedResponse(
  requestId: string,
  accepted: IngestionAccepted,
): Response {
  const headers = { ...baseHeaders, "X-Request-Id": requestId };
  if ("client" in accepted) {
    // Siempre 200, con el cliente y sin su teléfono (brief-12.1, D-9).
    return Response.json(
      {
        contract_version: INGESTION_CONTRACT_VERSION,
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
  if ("conversation" in accepted) {
    // Siempre 200, con la referencia de la conversación y sin el id interno ni el teléfono
    // (brief-12.2, D-5).
    return Response.json(
      {
        contract_version: INGESTION_CONTRACT_VERSION,
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
      contract_version: INGESTION_CONTRACT_VERSION,
      event_id: accepted.eventId,
      result: accepted.result,
      conversation_external_ref: accepted.conversationExternalRef,
      message_external_ref: accepted.messageExternalRef,
    },
    { status: accepted.result === "accepted" ? 201 : 200, headers },
  );
}

async function evaluate(
  request: Request,
  requestId: string,
  now: Date,
): Promise<Outcome | null> {
  const config = readIngestionConfig();
  if (!config.enabled) {
    if (config.invalid) {
      // La configuración inválida apaga el endpoint y queda en el log (D-4).
      logEvent({
        level: "error",
        requestId,
        route: INGESTION_ROUTE,
        code: "INTERNAL",
      });
    }
    return null;
  }

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

  const rate = await consumeIngestionRate(credential.id, now);
  if (!rate.ok) {
    return {
      ...who,
      code: rate.code,
      response: errorResponse(requestId, rate.code, {
        headers: { "Retry-After": String(rate.retryAfterSeconds) },
      }),
    };
  }

  const invalidBody = () => ({
    ...who,
    code: "VALIDATION_ERROR" as const,
    response: errorResponse(requestId, "VALIDATION_ERROR", {
      fields: ["body"],
    }),
  });
  if (!isJsonContentType(request.headers.get("content-type"))) {
    return invalidBody();
  }
  const body = await readBodyWithLimit(request, MAX_INGESTION_BODY_BYTES);
  if (!body.ok) return invalidBody();

  const result = await recordIngestionEvent(
    { ...who, credentialId: credential.id },
    body.text,
    now,
  );
  if (result.ok) {
    return {
      ...who,
      code: "OK",
      response: acceptedResponse(requestId, result),
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
      }),
    };
  }
  if (result.code === "BUSINESS_RULE_VIOLATION") {
    // 422 con la regla, solo para los tipos nuevos (brief-12.2, C-2).
    return {
      ...who,
      code: result.code,
      response: errorResponse(requestId, result.code, { rule: result.rule }),
    };
  }
  return {
    ...who,
    code: result.code,
    response: errorResponse(requestId, result.code),
  };
}

export async function handleIngestionEvent(
  request: Request,
  now: Date = new Date(),
): Promise<Response> {
  const started = performance.now();
  const requestId = newRequestId();
  let outcome: Outcome;
  try {
    const processed = await evaluate(request, requestId, now);
    if (processed === null) {
      return new Response(null, { status: 404, headers: baseHeaders });
    }
    outcome = processed;
  } catch (error) {
    outcome = {
      code: "INTERNAL",
      error,
      response: errorResponse(requestId, "INTERNAL"),
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
    route: INGESTION_ROUTE,
    code: outcome.code,
    organizationId: outcome.organizationId,
    source: outcome.source,
    durationMs: performance.now() - started,
    error: outcome.error,
  });
  return outcome.response;
}

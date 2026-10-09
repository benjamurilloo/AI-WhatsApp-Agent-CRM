import {
  checkProductImageUpload,
  getProductImageFile,
  IMAGE_UPLOAD_MAX_BYTES,
  uploadProductImage,
  type ImageUploadRejection,
  type ProductImageVariant,
} from "@/modules/catalog";
import { getAuthContext, type AuthContext } from "@/modules/organizations";
import type { ErrorCode } from "@/shared/errors";
import { isSameOrigin, readBytesWithLimit } from "@/shared/http";
import { logEvent, newRequestId } from "@/shared/log";

// Rutas de la imagen principal de producto (ADR 0018, puntos 4 y 5; brief-17.5, D-2 y D-6). Son
// los primeros Route Handlers con sesión: la sesión no la resuelve ningún proxy (brief-3.5, D-6),
// así que cada handler la valida contra la base. El token llega como parámetro para que los tests
// de integración llamen al handler sin el runtime de Next; route.ts lo lee de la cookie.

export const UPLOAD_ROUTE = "productos.imagen.subir";
export const IMAGE_ROUTE = "productos.imagen.ver";

// La respuesta de la subida, que lee la pantalla. Sin datos del producto.
export type UploadResponseBody =
  | { ok: true; sha256: string; sizeKb: number }
  | {
      ok: false;
      error:
        | "unauthenticated"
        | "forbidden"
        | "not_found"
        | "rate_limited"
        | "busy"
        | "length_required"
        | ImageUploadRejection;
    };

function json(
  status: number,
  body: UploadResponseBody,
  headers: Record<string, string> = {},
): Response {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "no-store", ...headers },
  });
}

async function sessionContext(
  token: string | undefined,
): Promise<AuthContext | "unauthenticated" | "password_change"> {
  const result = await getAuthContext(token);
  if (!result.ok) return "unauthenticated";
  if (result.context.mustChangePassword) return "password_change";
  return result.context;
}

// PUT con el archivo como cuerpo (D-2). En este orden, y todo antes de leer el cuerpo
// (invariante 2): la sesión, el Origin, el rol, el producto de la organización, el límite de tasa y
// el tamaño declarado. Después lee con un tope que corta aunque Content-Length mienta.
// Límite declarado (brief-17.5, §Implementación): el código no lee el cuerpo antes de esas
// comprobaciones, pero Next ya lo recibió en memoria al pasárselo a proxy.ts, hasta el límite de
// nginx para esta dirección, 6 MB. Pasa con todo cuerpo desde la 8.1, hasta 1 MB en el resto.
export async function handleImageUpload(
  request: Request,
  productId: string,
  token: string | undefined,
): Promise<Response> {
  const requestId = newRequestId();
  const started = performance.now();
  // Quien hizo el pedido, para el log, en cuanto se conoce.
  const actor: { context?: AuthContext } = {};
  const done = (code: "OK" | ErrorCode, error?: unknown) =>
    logEvent({
      level: code === "OK" ? "info" : error ? "error" : "warn",
      requestId,
      route: UPLOAD_ROUTE,
      code,
      userId: actor.context?.userId,
      organizationId: actor.context?.organizationId,
      durationMs: performance.now() - started,
      error,
    });

  const session = await sessionContext(token);
  if (session === "unauthenticated") {
    done("UNAUTHENTICATED");
    return json(401, { ok: false, error: "unauthenticated" });
  }
  if (session === "password_change") {
    done("FORBIDDEN");
    return json(403, { ok: false, error: "forbidden" });
  }
  const context = session;
  actor.context = context;

  if (!isSameOrigin(request)) {
    done("FORBIDDEN");
    return json(403, { ok: false, error: "forbidden" });
  }

  const checked = await checkProductImageUpload(context, productId);
  if (!checked.ok) {
    done(checked.code);
    if (checked.code === "FORBIDDEN") {
      return json(403, { ok: false, error: "forbidden" });
    }
    if (checked.code === "RATE_LIMITED") {
      return json(
        429,
        { ok: false, error: "rate_limited" },
        { "Retry-After": String(checked.retryAfterSeconds) },
      );
    }
    return json(404, { ok: false, error: "not_found" });
  }

  const declared = request.headers.get("content-length");
  if (declared === null || !/^\d+$/.test(declared)) {
    done("VALIDATION_ERROR");
    return json(411, { ok: false, error: "length_required" });
  }
  if (Number(declared) > IMAGE_UPLOAD_MAX_BYTES) {
    done("VALIDATION_ERROR");
    return json(413, { ok: false, error: "too_large" });
  }

  try {
    const read = await readBytesWithLimit(request, IMAGE_UPLOAD_MAX_BYTES);
    if (!read.ok) {
      done("VALIDATION_ERROR");
      return json(413, { ok: false, error: "too_large" });
    }
    const result = await uploadProductImage(
      context,
      productId,
      Buffer.from(
        read.bytes.buffer,
        read.bytes.byteOffset,
        read.bytes.byteLength,
      ),
    );
    if (result.ok) {
      done("OK");
      return json(200, {
        ok: true,
        sha256: result.version.sha256,
        sizeKb: result.version.sizeKb,
      });
    }
    done(result.code);
    switch (result.code) {
      case "VALIDATION_ERROR":
        return json(400, {
          ok: false,
          error: "reason" in result ? result.reason : "unreadable",
        });
      case "RATE_LIMITED":
        return result.cause === "busy"
          ? json(
              503,
              { ok: false, error: "busy" },
              { "Retry-After": String(result.retryAfterSeconds) },
            )
          : json(
              429,
              { ok: false, error: "rate_limited" },
              { "Retry-After": String(result.retryAfterSeconds) },
            );
      case "FORBIDDEN":
        return json(403, { ok: false, error: "forbidden" });
      case "NOT_FOUND":
        return json(404, { ok: false, error: "not_found" });
    }
  } catch (error) {
    done("INTERNAL", error);
    return Response.json(
      { ok: false, error: "internal" },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}

// GET de la imagen o de su miniatura (D-6). La pantalla la pide con ?v=<sha256>: con la versión
// vigente, la respuesta se cachea un año en el navegador, porque reemplazar la imagen cambia la
// dirección; sin ella o con otra, se revalida con el ETag. Sin sesión, 401; sin imagen, ajena o
// inexistente, el mismo 404 sin cuerpo.
export async function handleImageFile(
  request: Request,
  productId: string,
  variant: ProductImageVariant,
  token: string | undefined,
): Promise<Response> {
  const requestId = newRequestId();
  const started = performance.now();
  // Quien hizo el pedido, para el log, en cuanto se conoce.
  const actor: { context?: AuthContext } = {};
  const done = (code: "OK" | ErrorCode, error?: unknown) =>
    logEvent({
      level: code === "OK" ? "info" : error ? "error" : "warn",
      requestId,
      route: IMAGE_ROUTE,
      code,
      userId: actor.context?.userId,
      organizationId: actor.context?.organizationId,
      durationMs: performance.now() - started,
      error,
    });
  const empty = (status: number) =>
    new Response(null, { status, headers: { "Cache-Control": "no-store" } });

  const session = await sessionContext(token);
  if (session === "unauthenticated") {
    done("UNAUTHENTICATED");
    return empty(401);
  }
  if (session === "password_change") {
    done("FORBIDDEN");
    return empty(403);
  }
  const context = session;
  actor.context = context;

  try {
    const file = await getProductImageFile(context, productId, variant);
    if (!file.ok) {
      done(file.code);
      return empty(file.code === "FORBIDDEN" ? 403 : 404);
    }
    const etag = `"${file.sha256}"`;
    const current = new URL(request.url).searchParams.get("v") === file.sha256;
    const headers = {
      "Content-Type": "image/jpeg",
      "Cache-Control": current
        ? "private, max-age=31536000, immutable"
        : "private, no-cache",
      ETag: etag,
      "X-Content-Type-Options": "nosniff",
    };
    done("OK");
    if (request.headers.get("if-none-match") === etag) {
      return new Response(null, { status: 304, headers });
    }
    return new Response(new Uint8Array(file.bytes), {
      status: 200,
      headers: { ...headers, "Content-Length": String(file.bytes.length) },
    });
  } catch (error) {
    done("INTERNAL", error);
    return empty(500);
  }
}

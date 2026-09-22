import { type NextRequest, NextResponse } from "next/server";

/*
 * Cabeceras de seguridad y Content-Security-Policy con nonce por request (brief-8.1, D-1 y D-2).
 *
 * Existe solo por el nonce. Next emite scripts inline con el payload RSC, así que una CSP sin
 * 'unsafe-inline' en script-src necesita un valor distinto en cada respuesta, y una cabecera
 * estática de next.config.ts no puede darlo.
 *
 * No valida la sesión, no lee la base y no redirige: eso sigue en cada página y cada acción
 * (brief-3.5, D-6). Si alguna vez hace falta algo de eso acá, es otra subfase con su brief.
 */

// Next extrae el nonce de la cabecera `content-security-policy` del request y se lo aplica a sus
// propios scripts (`getScriptNonceFromHeader`, verificado en next 16.3.5). Por eso la misma
// política viaja en el request y en la respuesta.
function buildPolicy(nonce: string): string {
  return [
    "default-src 'self'",
    // 'strict-dynamic' deja que el bootstrap de Next cargue sus chunks; los navegadores que lo
    // entienden ignoran 'self' para scripts, y los viejos caen en 'self'.
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'`,
    // Medido (brief-8.1, D-3): las diez pantallas no tienen ni un <style> inline — los estilos
    // viajan en el chunk .css, que 'self' cubre. El nonce está para la página de error de Next,
    // que sí trae uno. No hace falta 'unsafe-inline' en ningún caso.
    `style-src 'self' 'nonce-${nonce}'`,
    // Ninguna pantalla usa el atributo style: no hay un solo `style={...}` en src/.
    "style-src-attr 'none'",
    "img-src 'self'",
    // Manrope se sirve local desde _fonts/ (brief-4.0, D-3): no hay dominios de terceros.
    "font-src 'self'",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "frame-src 'none'",
    "manifest-src 'self'",
  ].join("; ");
}

// Sin report-uri: no hay receptor de reportes y crearlo está fuera de alcance (brief-8.1).
const SECURITY_HEADERS: ReadonlyArray<readonly [string, string]> = [
  ["X-Content-Type-Options", "nosniff"],
  ["Referrer-Policy", "same-origin"],
  ["Cross-Origin-Opener-Policy", "same-origin"],
  ["Permissions-Policy", "camera=(), microphone=(), geolocation=()"],
];

// Un año, sin `preload` (brief-9.1). `preload` es un compromiso que se pide una vez y se
// revierte con meses de demora: no se declara desde staging. `includeSubDomains` alcanza
// solo a los subdominios del host que responde, no al dominio padre.
export const HSTS_VALUE = "max-age=31536000; includeSubDomains";

/*
 * Se emite solo sobre HTTPS (brief-9.1). Dos motivos, y el segundo es el que importa:
 *
 * 1. Sobre texto plano la cabecera no hace nada: la especificación obliga al navegador a
 *    ignorarla, así que en http://localhost solo confunde a quien lee las respuestas.
 * 2. Emitirla siempre volvería la verificación del AC-3 incapaz de fallar. Si la cabecera
 *    saliera igual sin TLS, verla en la respuesta no probaría que el TLS está en su lugar.
 *
 * La condición se lee de `x-forwarded-proto`, que en este despliegue pone nginx y no el
 * cliente. Que un cliente la falsifique no logra nada: el navegador ignora un HSTS que
 * llega sobre texto plano, así que no hay forma de convertir esto en una denegación.
 */
export function isHttpsRequest(forwardedProto: string | null): boolean {
  // La PRIMERA entrada, no la última: acá la cadena describe el protocolo del cliente
  // original, al revés que x-forwarded-for, donde la última es la que agregó el proxy
  // de confianza (session-cookie.ts:27-38). Son dos cabeceras con dos convenciones y
  // confundirlas es un error silencioso.
  return forwardedProto?.split(",")[0]?.trim().toLowerCase() === "https";
}

function createNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes));
}

export default function proxy(request: NextRequest): NextResponse {
  const nonce = createNonce();
  const policy = buildPolicy(nonce);

  // El request lleva la política para que Next descubra el nonce; la respuesta la lleva para el
  // navegador. Si solo fuera en la respuesta, los scripts de Next saldrían sin nonce y la propia
  // política los bloquearía.
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("content-security-policy", policy);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", policy);
  for (const [name, value] of SECURITY_HEADERS) {
    response.headers.set(name, value);
  }
  if (isHttpsRequest(request.headers.get("x-forwarded-proto"))) {
    response.headers.set("Strict-Transport-Security", HSTS_VALUE);
  }
  return response;
}

export const config = {
  // Todas las respuestas, sin excepciones por ruta (brief-8.1, D-4). Se excluyen solo los
  // estáticos de Next, que no son documentos y se sirven con sus propias cabeceras.
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};

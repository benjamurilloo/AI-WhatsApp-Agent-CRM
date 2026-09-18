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
  // Strict-Transport-Security no se emite todavía: sin TLS no hace nada y en http://localhost
  // solo confunde. Llega con el entorno de staging (Fase 9, SecurityModel).
];

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
  return response;
}

export const config = {
  // Todas las respuestas, sin excepciones por ruta (brief-8.1, D-4). Se excluyen solo los
  // estáticos de Next, que no son documentos y se sirven con sus propias cabeceras.
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};

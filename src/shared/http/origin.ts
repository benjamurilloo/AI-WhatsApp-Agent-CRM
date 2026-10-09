// Verificación de origen para los Route Handlers que escriben con la sesión (SecurityModel, CSRF;
// brief-3.4, D-5; brief-17.5, D-2). Las Server Actions la tienen en Next; un Route Handler no.
//
// Exige Origin y que su host sea el Host de la petición, como Next con las acciones. No usa
// X-Forwarded-Host: nginx no la fija y pasa la del cliente tal cual. Sin Origin, rechaza: los
// navegadores lo mandan en todo PUT, y quien no lo manda no es la pantalla del CRM.
export function isSameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  const host = request.headers.get("host");
  if (!origin || !host) return false;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

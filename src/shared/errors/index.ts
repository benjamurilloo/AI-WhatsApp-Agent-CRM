// Taxonomía de errores de docs/architecture/Overview.md (brief-3.4, D-1).
// Los servicios devuelven resultados tipados; solo lo inesperado se lanza y termina en INTERNAL.

export const ERROR_CODES = [
  "VALIDATION_ERROR",
  "UNAUTHENTICATED",
  "FORBIDDEN",
  "NOT_FOUND",
  "CONFLICT",
  "BUSINESS_RULE_VIOLATION",
  "RATE_LIMITED",
  "INTERNAL",
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

export const HTTP_STATUS: Record<ErrorCode, number> = {
  VALIDATION_ERROR: 400,
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  BUSINESS_RULE_VIOLATION: 422,
  RATE_LIMITED: 429,
  INTERNAL: 500,
};

// Resultado fallido de un caso de uso, con datos propios del código cuando hacen falta.
export type Failure<
  C extends ErrorCode = ErrorCode,
  Data extends object = Record<never, never>,
> = {
  ok: false;
  code: C;
} & Data;

export function failure<C extends ErrorCode>(code: C): Failure<C> {
  return { ok: false, code };
}

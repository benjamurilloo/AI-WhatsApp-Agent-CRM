import { describe, expect, it } from "vitest";
import { ERROR_CODES, HTTP_STATUS, failure } from "./index";

describe("taxonomía de errores", () => {
  it("define exactamente los 8 códigos de Overview con su HTTP", () => {
    expect(HTTP_STATUS).toEqual({
      VALIDATION_ERROR: 400,
      UNAUTHENTICATED: 401,
      FORBIDDEN: 403,
      NOT_FOUND: 404,
      CONFLICT: 409,
      BUSINESS_RULE_VIOLATION: 422,
      RATE_LIMITED: 429,
      INTERNAL: 500,
    });
    expect([...ERROR_CODES].sort()).toEqual(Object.keys(HTTP_STATUS).sort());
  });

  it("failure construye un resultado fallido con el código", () => {
    expect(failure("NOT_FOUND")).toEqual({ ok: false, code: "NOT_FOUND" });
  });
});

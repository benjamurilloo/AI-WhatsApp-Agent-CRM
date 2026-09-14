import { describe, expect, it } from "vitest";
import {
  CREDENTIALS_MESSAGE,
  loginFailureState,
  PASSWORD_MISMATCH_MESSAGE,
  passwordChangeInputError,
  rateLimitedMessage,
  unexpectedErrorMessage,
} from "./messages";

const REQUEST_ID = "7f1d2c3b-0000-4000-8000-000000000001";
const policy = { min: 12, max: 128 };

describe("mensajes del ingreso", () => {
  it("credenciales incorrectas y contraseña fuera de política dan el mismo estado", () => {
    const unauthenticated = loginFailureState(
      { ok: false, code: "UNAUTHENTICATED" },
      REQUEST_ID,
      "ana@example.com",
    );
    const validation = loginFailureState(
      { ok: false, code: "VALIDATION_ERROR" },
      REQUEST_ID,
      "ana@example.com",
    );
    expect(unauthenticated).toEqual(validation);
    expect(unauthenticated).toMatchObject({
      status: "error",
      field: null,
      message: CREDENTIALS_MESSAGE,
      retryAfterSeconds: null,
    });
  });

  it("el límite de intentos avisa en minutos redondeados hacia arriba", () => {
    expect(rateLimitedMessage(900)).toBe(
      "Demasiados intentos. Probá de nuevo en 15 minutos.",
    );
    expect(rateLimitedMessage(61)).toBe(
      "Demasiados intentos. Probá de nuevo en 2 minutos.",
    );
    expect(rateLimitedMessage(1)).toBe(
      "Demasiados intentos. Probá de nuevo en 1 minuto.",
    );
  });

  it("el estado del límite conserva los segundos para deshabilitar el botón", () => {
    expect(
      loginFailureState(
        { ok: false, code: "RATE_LIMITED", retryAfterSeconds: 300 },
        REQUEST_ID,
        "ana@example.com",
      ),
    ).toMatchObject({ retryAfterSeconds: 300, field: null });
  });

  it("el error inesperado muestra el request_id", () => {
    expect(unexpectedErrorMessage("iniciar sesión", REQUEST_ID)).toBe(
      `No pudimos iniciar sesión. Código: ${REQUEST_ID}`,
    );
  });
});

describe("validación del cambio de contraseña", () => {
  it("una contraseña fuera de política se asocia al campo nuevo", () => {
    expect(passwordChangeInputError("corta", "corta", policy)).toMatchObject({
      field: "newPassword",
    });
    expect(
      passwordChangeInputError("x".repeat(129), "x".repeat(129), policy),
    ).toMatchObject({ field: "newPassword" });
  });

  it("contraseñas distintas se asocian a la confirmación", () => {
    expect(
      passwordChangeInputError(
        "contraseña-nueva-larga",
        "contraseña-otra-larga",
        policy,
      ),
    ).toEqual({ field: "confirmation", message: PASSWORD_MISMATCH_MESSAGE });
  });

  it("acepta contraseñas iguales dentro de la política", () => {
    expect(
      passwordChangeInputError("x".repeat(12), "x".repeat(12), policy),
    ).toBeNull();
  });
});

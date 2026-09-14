import { afterEach, describe, expect, it, vi } from "vitest";
import { formatLogEvent, logEvent, newRequestId, type LogEvent } from ".";

const EMAIL = "ana@example.com";
const PASSWORD = "contraseña-secreta-larga";
const TOKEN = "Zm9vYmFyYmF6cXV4Zm9vYmFyYmF6cXV4Zm9vYmFyYmF6";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("log estructurado", () => {
  it("escribe JSON con los campos del evento", () => {
    const requestId = newRequestId();
    const line = formatLogEvent(
      {
        level: "warn",
        requestId,
        route: "login",
        code: "UNAUTHENTICATED",
        userId: "b3c5b1f4-0000-4000-8000-000000000001",
      },
      new Date("2026-09-14T12:00:00Z"),
    );
    expect(JSON.parse(line)).toEqual({
      time: "2026-09-14T12:00:00.000Z",
      level: "warn",
      request_id: requestId,
      route: "login",
      code: "UNAUTHENTICATED",
      user_id: "b3c5b1f4-0000-4000-8000-000000000001",
    });
  });

  it("genera request_id únicos con formato UUID", () => {
    const first = newRequestId();
    expect(first).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
    expect(newRequestId()).not.toBe(first);
  });

  it("de un error registra el tipo y el código, nunca el mensaje", () => {
    const cause = Object.assign(new Error(`clave (email)=(${EMAIL})`), {
      code: "23505",
    });
    const error = new Error(`Failed query: ${EMAIL} ${PASSWORD} ${TOKEN}`, {
      cause,
    });
    const line = formatLogEvent({
      level: "error",
      requestId: newRequestId(),
      route: "login",
      code: "INTERNAL",
      error,
    });
    expect(JSON.parse(line).error).toEqual({ name: "Error", code: "23505" });
    for (const secret of [EMAIL, PASSWORD, TOKEN]) {
      expect(line).not.toContain(secret);
    }
  });

  it("descarta un código de error que no tiene forma de código", () => {
    const error = Object.assign(new Error("x"), { code: EMAIL });
    const line = formatLogEvent({
      level: "error",
      requestId: newRequestId(),
      route: "login",
      code: "INTERNAL",
      error,
    });
    expect(line).not.toContain(EMAIL);
  });

  it("ignora campos que no son del evento aunque lleguen en tiempo de ejecución", () => {
    const event = {
      level: "info",
      requestId: newRequestId(),
      route: "login",
      code: "OK",
      email: EMAIL,
      password: PASSWORD,
      token: TOKEN,
    } as LogEvent;
    const line = formatLogEvent(event);
    for (const secret of [EMAIL, PASSWORD, TOKEN]) {
      expect(line).not.toContain(secret);
    }
  });

  it("los errores van a console.error y el resto a console.log", () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const base = { requestId: newRequestId(), route: "login" } as const;
    logEvent({ ...base, level: "info", code: "OK" });
    logEvent({ ...base, level: "error", code: "INTERNAL" });
    expect(log).toHaveBeenCalledTimes(1);
    expect(error).toHaveBeenCalledTimes(1);
  });
});

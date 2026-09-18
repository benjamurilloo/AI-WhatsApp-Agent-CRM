import { afterEach, describe, expect, it, vi } from "vitest";
import { formatLogEvent, logEvent, newRequestId, type LogEvent } from ".";

const EMAIL = "ana@example.com";
const PASSWORD = "contraseña-secreta-larga";
const TOKEN = "Zm9vYmFyYmF6cXV4Zm9vYmFyYmF6cXV4Zm9vYmFyYmF6";

// Datos personales de un cliente y contenido de conversación (brief-8.2, D-1). El test de la 3.5
// cubría credenciales; estos son los que la política de logs de SecurityModel nombra aparte.
const PHONE = "+5491155550123";
const CLIENT_NAME = "Ana Pérez";
const NOTES = "Prefiere retirar por la tarde";
const MESSAGE_BODY = "Hola, ¿tenés stock del producto azul?";

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

  it("registra organización y duración redondeada cuando llegan (brief-4.4)", () => {
    const line = formatLogEvent({
      level: "info",
      requestId: newRequestId(),
      route: "productos.ajustar",
      code: "OK",
      userId: "b3c5b1f4-0000-4000-8000-000000000001",
      organizationId: "b3c5b1f4-0000-4000-8000-000000000002",
      durationMs: 12.6,
    });
    expect(JSON.parse(line)).toMatchObject({
      organization_id: "b3c5b1f4-0000-4000-8000-000000000002",
      duration_ms: 13,
    });
  });

  it("omite organización y duración cuando no llegan", () => {
    const line = formatLogEvent({
      level: "info",
      requestId: newRequestId(),
      route: "login",
      code: "OK",
    });
    const event = JSON.parse(line) as Record<string, unknown>;
    expect(Object.hasOwn(event, "organization_id")).toBe(false);
    expect(Object.hasOwn(event, "duration_ms")).toBe(false);
    expect(Object.hasOwn(event, "source")).toBe(false);
  });

  it("registra el source de un evento de ingestión cuando llega (brief-6.5.3)", () => {
    const line = formatLogEvent({
      level: "warn",
      requestId: newRequestId(),
      route: "/api/ingestion/v1/events",
      code: "RATE_LIMITED",
      source: "emisor-de-prueba",
    });
    expect(JSON.parse(line)).toMatchObject({ source: "emisor-de-prueba" });
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

  it("ignora datos personales de cliente y cuerpos de mensaje que lleguen de más", () => {
    const event = {
      level: "info",
      requestId: newRequestId(),
      route: "clientes.crear",
      code: "OK",
      organizationId: "5eed0000-0000-4000-8000-000000000001",
      phone: PHONE,
      displayName: CLIENT_NAME,
      notes: NOTES,
      bodyText: MESSAGE_BODY,
      client: { phoneE164: PHONE, notes: NOTES },
    } as unknown as LogEvent;
    const line = formatLogEvent(event);
    for (const personal of [PHONE, CLIENT_NAME, NOTES, MESSAGE_BODY]) {
      expect(line).not.toContain(personal);
    }
    // Lo que sí tiene que salir: identificadores y resultado.
    expect(JSON.parse(line)).toMatchObject({
      route: "clientes.crear",
      code: "OK",
      organization_id: "5eed0000-0000-4000-8000-000000000001",
    });
  });

  it("de un error con datos personales en el mensaje registra solo el tipo", () => {
    // El mensaje de un error de base puede traer el valor que violó una restricción: con un
    // teléfono único por organización, ese valor es el teléfono del cliente.
    const error = Object.assign(
      new Error(
        `duplicate key value violates unique constraint "clients_org_phone_unique" DETAIL: Key (phone_e164)=(${PHONE}) already exists.`,
      ),
      { code: "23505" },
    );
    const line = formatLogEvent({
      level: "error",
      requestId: newRequestId(),
      route: "clientes.crear",
      code: "CONFLICT",
      error,
    });
    expect(line).not.toContain(PHONE);
    expect(JSON.parse(line).error).toEqual({ name: "Error", code: "23505" });
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

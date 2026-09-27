import { describe, expect, it } from "vitest";
import { isCredentialAllowed, readIngestionConfig } from "./config";
import {
  generateIngestionToken,
  generateServiceToken,
  hashIngestionToken,
  isCredentialScope,
  tokenFromAuthorization,
} from "./credentials";
import { rateWindowStart, retryAfterSeconds } from "./rate-limit";

// Partes de la autenticación de servicio que no necesitan base (brief-6.5.3).

const CREDENTIAL = "3f1c8a52-7d3e-4b61-9a0f-2c4d5e6f7a8b";

describe("token de ingestión", () => {
  it("tiene prefijo, 32 bytes en base64url y es distinto cada vez", () => {
    const token = generateIngestionToken();
    expect(token).toMatch(/^crm_ing_[A-Za-z0-9_-]{43}$/);
    expect(generateIngestionToken()).not.toBe(token);
  });

  it("se guarda como SHA-256 en hexadecimal, sin el token", () => {
    const token = generateIngestionToken();
    const hash = hashIngestionToken(token);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hash).not.toContain(token.slice(8));
  });

  it("solo se lee de un encabezado Bearer con el formato esperado", () => {
    const token = generateIngestionToken();
    expect(tokenFromAuthorization(`Bearer ${token}`)).toBe(token);
    for (const header of [
      null,
      undefined,
      "",
      token,
      `bearer ${token}`,
      `Basic ${token}`,
      `Bearer  ${token}`,
      `Bearer ${token} extra`,
      `Bearer ${token}x`,
      "Bearer crm_ing_corto",
      `Bearer ${token.replace("crm_ing_", "crm_xxx_")}`,
    ]) {
      expect(tokenFromAuthorization(header), String(header)).toBeNull();
    }
  });
});

describe("alcance de la credencial (brief-11.3, D-2)", () => {
  it("el token de lectura lleva su propio prefijo y se lee del mismo encabezado", () => {
    const read = generateServiceToken("read");
    expect(read).toMatch(/^crm_read_[A-Za-z0-9_-]{43}$/);
    expect(generateServiceToken("ingest")).toMatch(
      /^crm_ing_[A-Za-z0-9_-]{43}$/,
    );
    expect(tokenFromAuthorization(`Bearer ${read}`)).toBe(read);
    for (const header of [
      "Bearer crm_read_corto",
      `Bearer ${read.replace("crm_read_", "crm_reads_")}`,
      `Bearer ${read.replace("crm_read_", "crm_Read_")}`,
    ]) {
      expect(tokenFromAuthorization(header), header).toBeNull();
    }
  });

  it("FR-API-08: el token del historial lleva su propio prefijo (brief-12.4, D-6)", () => {
    const context = generateServiceToken("context");
    expect(context).toMatch(/^crm_ctx_[A-Za-z0-9_-]{43}$/);
    expect(tokenFromAuthorization(`Bearer ${context}`)).toBe(context);
    for (const header of [
      "Bearer crm_ctx_corto",
      `Bearer ${context.replace("crm_ctx_", "crm_context_")}`,
      `Bearer ${context.replace("crm_ctx_", "crm_Ctx_")}`,
    ]) {
      expect(tokenFromAuthorization(header), header).toBeNull();
    }
  });

  it("FR-API-08: solo admite los tres alcances", () => {
    expect(isCredentialScope("ingest")).toBe(true);
    expect(isCredentialScope("read")).toBe(true);
    expect(isCredentialScope("context")).toBe(true);
    for (const value of ["", "READ", "write", "ingest,read", "ctx"]) {
      expect(isCredentialScope(value), value).toBe(false);
    }
  });
});

describe("modo de prueba", () => {
  it("está apagado por defecto y con false", () => {
    expect(readIngestionConfig({})).toEqual({ enabled: false, invalid: false });
    expect(readIngestionConfig({ INGESTION_ENABLED: "false" })).toEqual({
      enabled: false,
      invalid: false,
    });
  });

  it("se apaga y se marca inválido con un valor desconocido o un id que no es UUID", () => {
    for (const env of [
      { INGESTION_ENABLED: "1" },
      { INGESTION_ENABLED: "TRUE" },
      {
        INGESTION_ENABLED: "true",
        INGESTION_ALLOWED_CREDENTIALS: `${CREDENTIAL},otro`,
      },
    ]) {
      expect(readIngestionConfig(env), JSON.stringify(env)).toEqual({
        enabled: false,
        invalid: true,
      });
    }
  });

  it("encendido, solo acepta las credenciales listadas", () => {
    const config = readIngestionConfig({
      INGESTION_ENABLED: "true",
      INGESTION_ALLOWED_CREDENTIALS: ` ${CREDENTIAL.toUpperCase()} ,`,
    });
    if (!config.enabled) throw new Error("debería estar encendido");
    expect(isCredentialAllowed(config, CREDENTIAL)).toBe(true);
    expect(
      isCredentialAllowed(config, "00000000-0000-4000-8000-000000000000"),
    ).toBe(false);
  });

  it("encendido con la lista vacía, rechaza todo", () => {
    const config = readIngestionConfig({ INGESTION_ENABLED: "true" });
    if (!config.enabled) throw new Error("debería estar encendido");
    expect(isCredentialAllowed(config, CREDENTIAL)).toBe(false);
  });
});

describe("ventana del límite de tasa", () => {
  it("empieza en el minuto y pide esperar hasta el siguiente", () => {
    const now = new Date("2026-09-17T12:00:45.200Z");
    expect(rateWindowStart(now).toISOString()).toBe("2026-09-17T12:00:00.000Z");
    expect(retryAfterSeconds(now)).toBe(15);
    expect(retryAfterSeconds(new Date("2026-09-17T12:00:59.999Z"))).toBe(1);
    expect(retryAfterSeconds(new Date("2026-09-17T12:01:00.000Z"))).toBe(60);
  });
});

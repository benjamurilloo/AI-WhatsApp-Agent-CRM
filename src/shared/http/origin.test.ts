import { describe, expect, it } from "vitest";
import { isSameOrigin } from "./origin";

// Verificación de origen de los Route Handlers con sesión (brief-17.5, D-2).

function request(headers: Record<string, string>): Request {
  return new Request("http://localhost/x", { method: "PUT", headers });
}

describe("isSameOrigin", () => {
  it("acepta un Origin con el mismo host, con puerto o sin él", () => {
    expect(
      isSameOrigin(
        request({
          origin: "https://crm.vixoraai.app",
          host: "crm.vixoraai.app",
        }),
      ),
    ).toBe(true);
    expect(
      isSameOrigin(
        request({ origin: "http://localhost:3000", host: "localhost:3000" }),
      ),
    ).toBe(true);
  });

  it("rechaza otro host, otro puerto, un Origin vacío o mal formado y la falta de Origin", () => {
    const host = "crm.vixoraai.app";
    for (const origin of [
      "https://otro.example",
      "https://crm.vixoraai.app.otro.example",
      "https://crm.vixoraai.app:8443",
      "null",
      "",
      "no es una url",
    ]) {
      expect(isSameOrigin(request({ origin, host })), origin).toBe(false);
    }
    expect(isSameOrigin(request({ host }))).toBe(false);
  });

  it("no le cree a X-Forwarded-Host", () => {
    expect(
      isSameOrigin(
        request({
          origin: "https://otro.example",
          host: "crm.vixoraai.app",
          "x-forwarded-host": "otro.example",
        }),
      ),
    ).toBe(false);
  });
});

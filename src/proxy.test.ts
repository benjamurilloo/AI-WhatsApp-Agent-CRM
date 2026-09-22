import { describe, expect, it } from "vitest";

import { HSTS_VALUE, isHttpsRequest } from "./proxy";

// La cabecera Strict-Transport-Security se emite solo sobre HTTPS (brief-9.1, AC-3).
// Los casos van en pares: sin un caso que espere `false`, la condición podría ser
// `true` constante y estos tests no se enterarían.

describe("isHttpsRequest", () => {
  it("reconoce https", () => {
    expect(isHttpsRequest("https")).toBe(true);
  });

  it("rechaza http", () => {
    expect(isHttpsRequest("http")).toBe(false);
  });

  it("rechaza la cabecera ausente, que es el caso de desarrollo local", () => {
    expect(isHttpsRequest(null)).toBe(false);
  });

  it("rechaza la cadena vacía", () => {
    expect(isHttpsRequest("")).toBe(false);
  });

  it("ignora espacios alrededor", () => {
    expect(isHttpsRequest("  https  ")).toBe(true);
  });

  it("no distingue mayúsculas: un proxy puede mandar HTTPS", () => {
    expect(isHttpsRequest("HTTPS")).toBe(true);
  });

  // Estos dos son el motivo de que la función exista en vez de ser una comparación
  // directa: con varios proxies la cabecera es una lista, y acá la entrada que vale
  // es la PRIMERA —el protocolo del cliente original—, al revés que en
  // x-forwarded-for, donde vale la última.
  it("toma la primera entrada de una lista", () => {
    expect(isHttpsRequest("https, http")).toBe(true);
  });

  it("no se deja engañar por un https posterior en la lista", () => {
    expect(isHttpsRequest("http, https")).toBe(false);
  });
});

describe("HSTS_VALUE", () => {
  it("declara un año", () => {
    expect(HSTS_VALUE).toContain("max-age=31536000");
  });

  it("no declara preload: es un compromiso que no se toma desde staging", () => {
    expect(HSTS_VALUE).not.toContain("preload");
  });
});

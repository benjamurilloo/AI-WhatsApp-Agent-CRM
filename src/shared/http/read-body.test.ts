import { describe, expect, it } from "vitest";
import { isJsonContentType, readBodyWithLimit } from "./read-body";

// Lectura del cuerpo con límite (brief-6.5.3).

function streamed(chunks: Uint8Array[]): Request {
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(chunk);
      controller.close();
    },
  });
  return new Request("http://localhost/x", {
    method: "POST",
    body,
    duplex: "half",
  } as RequestInit);
}

describe("readBodyWithLimit", () => {
  it("devuelve el texto UTF-8 dentro del límite, incluido el límite exacto", async () => {
    const text = "ñ".repeat(5);
    const request = new Request("http://localhost/x", {
      method: "POST",
      body: text,
    });
    expect(await readBodyWithLimit(request, 10)).toEqual({ ok: true, text });
  });

  it("rechaza por Content-Length sin leer el cuerpo", async () => {
    const request = new Request("http://localhost/x", {
      method: "POST",
      body: "{}",
      headers: { "content-length": "11" },
    });
    expect(await readBodyWithLimit(request, 10)).toEqual({
      ok: false,
      reason: "too_large",
    });
  });

  it("rechaza un cuerpo real más grande aunque no declare su tamaño", async () => {
    const chunk = new Uint8Array(6).fill(97);
    expect(await readBodyWithLimit(streamed([chunk, chunk]), 10)).toEqual({
      ok: false,
      reason: "too_large",
    });
  });

  it("rechaza bytes que no son UTF-8", async () => {
    expect(
      await readBodyWithLimit(streamed([new Uint8Array([0x7b, 0xff])]), 10),
    ).toEqual({ ok: false, reason: "invalid_utf8" });
  });

  it("devuelve texto vacío sin cuerpo", async () => {
    const request = new Request("http://localhost/x", { method: "POST" });
    expect(await readBodyWithLimit(request, 10)).toEqual({
      ok: true,
      text: "",
    });
  });
});

describe("isJsonContentType", () => {
  it("acepta application/json con o sin charset utf-8", () => {
    for (const value of [
      "application/json",
      "Application/JSON",
      "application/json; charset=utf-8",
      "application/json;charset=UTF-8",
    ]) {
      expect(isJsonContentType(value), value).toBe(true);
    }
  });

  it("rechaza otros tipos y otros charset", () => {
    for (const value of [
      null,
      "",
      "text/plain",
      "application/jsonx",
      "application/json; charset=latin1",
      "multipart/form-data",
    ]) {
      expect(isJsonContentType(value), String(value)).toBe(false);
    }
  });
});

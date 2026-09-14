import { describe, expect, it } from "vitest";
import {
  hashPassword,
  passwordSchema,
  verifyAgainstDummy,
  verifyPassword,
} from "./password";

describe("hash de contraseñas", () => {
  it("usa argon2id con m=19456, t=2 y p=1 en formato PHC", async () => {
    const stored = await hashPassword("contraseña-de-prueba-larga");
    expect(stored).toMatch(/^\$argon2id\$v=19\$m=19456,t=2,p=1\$[^$]+\$[^$]+$/);
  });

  it("dos hashes de la misma contraseña difieren por la sal", async () => {
    const first = await hashPassword("contraseña-de-prueba-larga");
    const second = await hashPassword("contraseña-de-prueba-larga");
    expect(first).not.toBe(second);
  });

  it("verifica la contraseña correcta y rechaza otra", async () => {
    const stored = await hashPassword("contraseña-de-prueba-larga");
    await expect(
      verifyPassword(stored, "contraseña-de-prueba-larga"),
    ).resolves.toBe(true);
    await expect(
      verifyPassword(stored, "contraseña-de-prueba-largo"),
    ).resolves.toBe(false);
  });

  it("un hash almacenado ilegible no autentica", async () => {
    await expect(
      verifyPassword("no-es-un-hash", "cualquiera-larga"),
    ).resolves.toBe(false);
  });

  it("la verificación ficticia nunca autentica", async () => {
    await expect(
      verifyAgainstDummy("hash-ficticio-para-igualar-tiempos"),
    ).resolves.toBe(false);
  });
});

describe("política de contraseña", () => {
  it("acepta entre 12 y 128 caracteres, sin reglas de composición", () => {
    expect(passwordSchema.safeParse("a".repeat(12)).success).toBe(true);
    expect(passwordSchema.safeParse("a".repeat(128)).success).toBe(true);
  });

  it("rechaza menos de 12 o más de 128 caracteres", () => {
    expect(passwordSchema.safeParse("a".repeat(11)).success).toBe(false);
    expect(passwordSchema.safeParse("a".repeat(129)).success).toBe(false);
  });
});

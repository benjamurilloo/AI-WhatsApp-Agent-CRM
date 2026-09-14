import { describe, expect, it } from "vitest";
import {
  generateInitialPassword,
  INITIAL_PASSWORD_ALPHABET,
  passwordSchema,
} from "./password";

// Contraseña inicial del alta de miembros (brief-3.7, D-5).

describe("generateInitialPassword", () => {
  it("usa un alfabeto de 32 símbolos sin caracteres ambiguos", () => {
    expect(new Set(INITIAL_PASSWORD_ALPHABET).size).toBe(32);
    expect(INITIAL_PASSWORD_ALPHABET).not.toMatch(/[0O1lI]/);
  });

  it("da 4 grupos de 4 caracteres del alfabeto, 19 en total, dentro de la política", () => {
    const pattern = new RegExp(
      `^[${INITIAL_PASSWORD_ALPHABET}]{4}(-[${INITIAL_PASSWORD_ALPHABET}]{4}){3}$`,
    );
    for (let i = 0; i < 200; i++) {
      const password = generateInitialPassword();
      expect(password).toMatch(pattern);
      expect(password).toHaveLength(19);
      expect(passwordSchema.safeParse(password).success).toBe(true);
    }
  });

  it("dos llamadas dan contraseñas distintas", () => {
    expect(generateInitialPassword()).not.toBe(generateInitialPassword());
  });
});

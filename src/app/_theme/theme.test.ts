import { describe, expect, it } from "vitest";
import { THEMES, THEME_LABELS, parseTheme, themeCookieOptions } from "./theme";

describe("parseTheme", () => {
  it("lee los tres valores válidos", () => {
    expect(parseTheme("system")).toBe("system");
    expect(parseTheme("light")).toBe("light");
    expect(parseTheme("dark")).toBe("dark");
  });

  it("reemplaza valores ausentes o inválidos por system", () => {
    for (const value of [
      undefined,
      null,
      "",
      "Dark",
      "oscuro",
      "toString",
      " dark",
      42,
      ["dark"],
    ]) {
      expect(parseTheme(value)).toBe("system");
    }
  });
});

describe("THEME_LABELS", () => {
  it("tiene una etiqueta para cada tema, en el orden del selector", () => {
    expect(THEMES.map((theme) => THEME_LABELS[theme])).toEqual([
      "Sistema",
      "Claro",
      "Oscuro",
    ]);
  });
});

describe("themeCookieOptions", () => {
  it("es HttpOnly, Lax, de Path=/ y dura un año", () => {
    expect(themeCookieOptions(true)).toEqual({
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      secure: true,
      maxAge: 31_536_000,
    });
  });

  it("sin TLS no es Secure", () => {
    expect(themeCookieOptions(false).secure).toBe(false);
  });
});

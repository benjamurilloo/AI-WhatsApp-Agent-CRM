import { describe, expect, it } from "vitest";
import {
  cuitCheckDigit,
  cuitDigits,
  formatCuit,
  isValidCuit,
  parseCuitInput,
} from "./cuit";

// El CUIT del proveedor (brief-22.2, D-2 y AC-2). Las propiedades recorren CUITs generados con una
// semilla fija: el proyecto no tiene fast-check, y una semilla fija hace el caso repetible.

// Generador congruencial lineal: el mismo recorrido en cada corrida. El producto va en aritmética
// exacta de 32 bits (Math.imul): en coma flotante pasaba de 2^53, se redondeaba a par y casi no
// salían dígitos impares (revisión independiente, R-7). El dígito sale de los bits altos, porque
// los bajos de este generador tienen un período corto.
function* firstTens(count: number, seed = 222): Generator<string> {
  let state = seed;
  for (let produced = 0; produced < count; produced += 1) {
    let digits = "";
    for (let index = 0; index < 10; index += 1) {
      state = (Math.imul(state, 1_103_515_245) + 12_345) & 0x7fffffff;
      digits += String((state >>> 16) % 10);
    }
    yield digits;
  }
}

it("el generador recorre los diez dígitos", () => {
  const seen = new Set([...firstTens(50)].join(""));
  expect([...seen].sort().join("")).toBe("0123456789");
});

// Los CUITs válidos del recorrido: los que tienen dígito verificador.
function validCuits(count: number): string[] {
  const valid: string[] = [];
  for (const firstTen of firstTens(count)) {
    const digit = cuitCheckDigit(firstTen);
    if (digit !== null) valid.push(`${firstTen}${digit}`);
  }
  return valid;
}

describe("el dígito verificador", () => {
  it("cierra con CUITs conocidos", () => {
    expect(isValidCuit("20123456786")).toBe(true);
    expect(isValidCuit("30712345671")).toBe(true);
    expect(isValidCuit("20403780414")).toBe(true);
  });

  it("un resto de 0 da 0, y uno de 1 no tiene dígito", () => {
    // 2·5 + 0·4 + … + 1·2 = 12, resto 1: 11 − 1 = 10, sin dígito.
    expect(cuitCheckDigit("2000000001")).toBeNull();
    // 2·5 + 3·4 + 0 + … + 1·2 = 24, resto 2: 9.
    expect(cuitCheckDigit("2300000001")).toBe(9);
    // 1·3 + 4·2 = 11, resto 0: 11 − 0 = 11, que vale 0.
    expect(cuitCheckDigit("0000000014")).toBe(0);
  });

  it("propiedad: cada CUIT con dígito verificador es válido con cualquier separador", () => {
    const valid = validCuits(500);
    expect(valid.length).toBeGreaterThan(400);
    for (const cuit of valid) {
      const formatted = formatCuit(cuit);
      for (const text of [
        cuit,
        formatted,
        formatted.replaceAll("-", " "),
        formatted.replaceAll("-", "."),
        ` ${formatted} `,
      ]) {
        expect(parseCuitInput(text), text).toEqual({ ok: true, cuit });
      }
    }
  });

  // Desde la 22.3, el rechazo dice que es el verificador (brief-22.3, D-12).
  it("propiedad: cambiar un solo dígito de un CUIT válido lo hace inválido, por el verificador", () => {
    for (const cuit of validCuits(200)) {
      for (let index = 0; index < 11; index += 1) {
        for (let value = 0; value <= 9; value += 1) {
          if (String(value) === cuit[index]) continue;
          const changed = `${cuit.slice(0, index)}${value}${cuit.slice(index + 1)}`;
          expect(isValidCuit(changed), changed).toBe(false);
          expect(parseCuitInput(formatCuit(changed)), changed).toEqual({
            ok: false,
            reason: "check_digit",
          });
        }
      }
    }
  });
});

describe("la entrada", () => {
  it("vacía o ausente es sin CUIT", () => {
    for (const value of [undefined, null, "", "   "]) {
      expect(parseCuitInput(value)).toEqual({ ok: true, cuit: null });
    }
  });

  it("rechaza otra cantidad de dígitos, letras y otros separadores", () => {
    for (const text of [
      "2012345678",
      "201234567860",
      "20-12345678-X",
      "20/12345678/6",
      "20_12345678_6",
      "CUIT 20-12345678-6",
      "２0123456786",
    ]) {
      expect(parseCuitInput(text), text).toEqual({
        ok: false,
        reason: "format",
      });
    }
  });

  // El caso que vio el usuario en la 22.2: once dígitos bien escritos con el verificador mal.
  it("once dígitos con el verificador que no cierra es check_digit", () => {
    expect(parseCuitInput("20-12345679-2")).toEqual({
      ok: false,
      reason: "check_digit",
    });
  });

  it("los once dígitos sin mirar el verificador, para buscar", () => {
    expect(cuitDigits("20-12345678-0")).toBe("20123456780");
    expect(cuitDigits("Distribuidora")).toBeNull();
  });

  it("se muestra con sus dos guiones", () => {
    expect(formatCuit("20123456786")).toBe("20-12345678-6");
  });
});

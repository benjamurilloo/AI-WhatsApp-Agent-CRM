import { describe, expect, it } from "vitest";
import {
  attributeKeyFromName,
  validateAttributeInput,
  validateVariantValues,
  type AttributeDefinition,
} from "./variants";

// Reglas puras de la capacidad variants (brief-29.2, D-5): la validación de los valores de un
// producto contra sus definiciones, la clave derivada del nombre y la validación de un atributo.

const color: AttributeDefinition = {
  id: "00000000-0000-4000-8000-000000000001",
  key: "color",
  name: "Color",
  type: "option",
  isRequired: true,
  isVariant: true,
  position: 0,
  isActive: true,
  options: [
    {
      id: "00000000-0000-4000-8000-0000000000a1",
      definitionId: "00000000-0000-4000-8000-000000000001",
      label: "Azul",
      position: 0,
      isActive: true,
    },
    {
      id: "00000000-0000-4000-8000-0000000000a2",
      definitionId: "00000000-0000-4000-8000-000000000001",
      label: "Rojo",
      position: 1,
      isActive: false,
    },
  ],
};

const box: AttributeDefinition = {
  id: "00000000-0000-4000-8000-000000000002",
  key: "trae_caja",
  name: "Trae caja",
  type: "boolean",
  isRequired: false,
  isVariant: false,
  position: 1,
  isActive: true,
  options: [],
};

const weight: AttributeDefinition = {
  ...box,
  id: "00000000-0000-4000-8000-000000000003",
  key: "peso",
  name: "Peso",
  type: "number",
};

const note: AttributeDefinition = {
  ...box,
  id: "00000000-0000-4000-8000-000000000004",
  key: "nota",
  name: "Nota",
  type: "text",
};

const definitions = [color, box, weight, note];

const empty = {
  textValue: null,
  numberValue: null,
  booleanValue: null,
  optionId: null,
};

describe("validateVariantValues", () => {
  it("guarda cada valor en la columna de su tipo", () => {
    const result = validateVariantValues(
      definitions,
      {
        modelId: "",
        attributes: {
          [color.id]: color.options[0]!.id,
          [box.id]: "si",
          [weight.id]: "1,5",
          [note.id]: "  con funda  ",
        },
      },
      [],
      true,
    );
    expect(result).toEqual({
      ok: true,
      values: [
        { ...empty, definitionId: color.id, optionId: color.options[0]!.id },
        { ...empty, definitionId: box.id, booleanValue: true },
        { ...empty, definitionId: weight.id, numberValue: "1.500" },
        { ...empty, definitionId: note.id, textValue: "con funda" },
      ],
    });
  });

  it("exige los obligatorios solo con modelo: un accesorio no tiene color", () => {
    const input = { modelId: "", attributes: {} };
    expect(validateVariantValues(definitions, input, [], true)).toEqual({
      ok: false,
      fields: [`atributo:${color.id}`],
    });
    expect(validateVariantValues(definitions, input, [], false)).toEqual({
      ok: true,
      values: [],
    });
  });

  it("rechaza una opción de otra definición, un sí o no inválido y un número con letras", () => {
    const result = validateVariantValues(
      definitions,
      {
        modelId: "",
        attributes: {
          [color.id]: "00000000-0000-4000-8000-0000000000ff",
          [box.id]: "tal vez",
          [weight.id]: "12a",
        },
      },
      [],
      false,
    );
    expect(result).toEqual({
      ok: false,
      fields: [
        `atributo:${color.id}`,
        `atributo:${box.id}`,
        `atributo:${weight.id}`,
      ],
    });
  });

  it("una opción desactivada se acepta solo si el producto ya la tenía", () => {
    const inactive = color.options[1]!.id;
    const input = { modelId: "", attributes: { [color.id]: inactive } };
    expect(validateVariantValues([color], input, [], true).ok).toBe(false);
    const kept = { ...empty, definitionId: color.id, optionId: inactive };
    expect(validateVariantValues([color], input, [kept], true)).toEqual({
      ok: true,
      values: [kept],
    });
  });

  it("conserva el valor de una definición desactivada, sin leer el formulario", () => {
    const retired = { ...note, isActive: false };
    const stored = { ...empty, definitionId: note.id, textValue: "vieja" };
    expect(
      validateVariantValues(
        [retired],
        { modelId: "", attributes: { [note.id]: "nueva" } },
        [stored],
        false,
      ),
    ).toEqual({ ok: true, values: [stored] });
  });

  it("normaliza los números a la escala de la base, con signo y sin -0", () => {
    const parse = (raw: string) =>
      validateVariantValues(
        [weight],
        { modelId: "", attributes: { [weight.id]: raw } },
        [],
        false,
      );
    expect(parse("-2.25")).toEqual({
      ok: true,
      values: [{ ...empty, definitionId: weight.id, numberValue: "-2.250" }],
    });
    expect(parse("-0")).toEqual({
      ok: true,
      values: [{ ...empty, definitionId: weight.id, numberValue: "0.000" }],
    });
    expect(parse("1,2345").ok).toBe(false);
  });
});

describe("attributeKeyFromName", () => {
  it.each([
    ["Trae caja", "trae_caja"],
    ["Condición de batería", "condicion_de_bateria"],
    ["  Color  ", "color"],
    ["5G", "g"],
    ["¿?", ""],
  ])("«%s» → %s", (name, key) => {
    expect(attributeKeyFromName(name)).toBe(key);
  });
});

describe("validateAttributeInput", () => {
  const base = {
    name: "Origen",
    type: "option",
    isRequired: false,
    isVariant: false,
    options: ["Argentina", "Importado"],
  };

  it("acepta una lista de opciones y deriva la clave", () => {
    expect(validateAttributeInput(base)).toEqual({
      ok: true,
      values: {
        key: "origen",
        name: "Origen",
        type: "option",
        isRequired: false,
        isVariant: false,
        options: ["Argentina", "Importado"],
      },
    });
  });

  it("un atributo de variante es obligatorio y de opciones", () => {
    const variant = validateAttributeInput({ ...base, isVariant: true });
    expect(variant.ok && variant.values.isRequired).toBe(true);
    expect(
      validateAttributeInput({ ...base, type: "text", isVariant: true }),
    ).toMatchObject({ ok: false, fields: ["isVariant"] });
  });

  it("rechaza opciones repetidas sin distinguir mayúsculas, o ninguna", () => {
    expect(
      validateAttributeInput({ ...base, options: ["Azul", "azul"] }),
    ).toMatchObject({ ok: false, fields: ["options"] });
    expect(validateAttributeInput({ ...base, options: [" "] })).toMatchObject({
      ok: false,
      fields: ["options"],
    });
  });

  it("descarta las opciones de un tipo que no las usa", () => {
    const result = validateAttributeInput({ ...base, type: "boolean" });
    expect(result.ok && result.values.options).toEqual([]);
  });

  it("rechaza un nombre sin letras y un tipo desconocido", () => {
    expect(
      validateAttributeInput({ ...base, name: "¿?", type: "fecha" }),
    ).toMatchObject({ ok: false, fields: ["name", "type"] });
  });
});

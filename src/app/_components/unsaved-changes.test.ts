import { describe, expect, it } from "vitest";
import { formSnapshot, leavesPage } from "./unsaved-changes";

// brief-23.2, D-6: cuándo el formulario está modificado y qué clic saca de la pantalla.

const HERE = {
  origin: "https://crm.example",
  pathname: "/clientes/1",
  search: "?editar=1",
};
const PLAIN_CLICK = {
  button: 0,
  metaKey: false,
  ctrlKey: false,
  shiftKey: false,
  altKey: false,
};
const anchor = (href: string, target = "", hasDownload = false) => ({
  href,
  target,
  hasDownload,
});

describe("formSnapshot", () => {
  it("da lo mismo para los mismos valores y distinto si cambia uno", () => {
    const before = formSnapshot([
      ["nombre", "Ana"],
      ["telefono", "+54"],
    ]);
    expect(
      formSnapshot([
        ["nombre", "Ana"],
        ["telefono", "+54"],
      ]),
    ).toBe(before);
    expect(
      formSnapshot([
        ["nombre", "Ana María"],
        ["telefono", "+54"],
      ]),
    ).not.toBe(before);
  });

  it("cuenta un campo que aparece o desaparece, como una casilla", () => {
    expect(formSnapshot([["activo", "on"]])).not.toBe(formSnapshot([]));
  });

  it("compara un archivo por su nombre y su tamaño", () => {
    const file = new File(["abc"], "foto.jpg");
    expect(formSnapshot([["imagen", file]])).toBe('[["imagen","foto.jpg:3"]]');
  });
});

describe("leavesPage", () => {
  it("un enlace interno a otra pantalla saca", () => {
    expect(
      leavesPage(anchor("https://crm.example/clientes"), PLAIN_CLICK, HERE),
    ).toBe(true);
  });

  it("la misma pantalla con otros parámetros también saca", () => {
    expect(
      leavesPage(anchor("https://crm.example/clientes/1"), PLAIN_CLICK, HERE),
    ).toBe(true);
  });

  it("un ancla de la misma pantalla no saca", () => {
    expect(
      leavesPage(
        anchor("https://crm.example/clientes/1?editar=1#telefono"),
        PLAIN_CLICK,
        HERE,
      ),
    ).toBe(false);
  });

  it("un sitio externo lo cubre beforeunload, no el clic", () => {
    expect(leavesPage(anchor("https://otro.example/"), PLAIN_CLICK, HERE)).toBe(
      false,
    );
  });

  it("una pestaña nueva, una descarga o un clic con modificador no sacan", () => {
    const to = "https://crm.example/clientes";
    expect(leavesPage(anchor(to, "_blank"), PLAIN_CLICK, HERE)).toBe(false);
    expect(leavesPage(anchor(to, "", true), PLAIN_CLICK, HERE)).toBe(false);
    expect(
      leavesPage(anchor(to), { ...PLAIN_CLICK, ctrlKey: true }, HERE),
    ).toBe(false);
    expect(
      leavesPage(anchor(to), { ...PLAIN_CLICK, metaKey: true }, HERE),
    ).toBe(false);
    expect(leavesPage(anchor(to), { ...PLAIN_CLICK, button: 1 }, HERE)).toBe(
      false,
    );
  });

  it("target _self se trata como la misma pestaña", () => {
    expect(
      leavesPage(
        anchor("https://crm.example/clientes", "_self"),
        PLAIN_CLICK,
        HERE,
      ),
    ).toBe(true);
  });
});

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  BALANCE_UNAVAILABLE_TEXT,
  BalanceBox,
  BalanceCell,
  NO_BALANCE_TEXT,
  OpenWorkCell,
} from "./list-cells";

// Las celdas de la lista de clientes (brief-24.4.2, D-2 y D-3), renderizadas a texto. Fijan que un
// saldo que no se pudo leer dice «No disponible» y nunca un cero (AC-2), que las monedas no se
// suman y lo que dice «En curso».

const html = (element: Parameters<typeof renderToStaticMarkup>[0]) =>
  renderToStaticMarkup(element);

describe("el saldo (D-2)", () => {
  it("sin lectura dice «No disponible», sin ningún importe", () => {
    for (const out of [
      html(createElement(BalanceCell, { balances: null })),
      html(createElement(BalanceBox, { balances: null })),
    ]) {
      expect(out).toContain(BALANCE_UNAVAILABLE_TEXT);
      expect(out).not.toContain(NO_BALANCE_TEXT);
      // Ningún número en el texto: las clases sí tienen.
      expect(out.replace(/<[^>]*>/g, "")).not.toMatch(/\d/);
    }
  });

  it("sin filas dice «Sin saldo pendiente»", () => {
    expect(html(createElement(BalanceCell, { balances: [] }))).toContain(
      NO_BALANCE_TEXT,
    );
  });

  it("una línea por moneda, sin sumar: la deuda con «Pendiente» y lo que está a favor", () => {
    const out = html(
      createElement(BalanceCell, {
        balances: [
          { clientId: "c", currency: "ARS", owed: "35000.00", inFavor: "0.00" },
          { clientId: "c", currency: "USD", owed: "0.00", inFavor: "250.00" },
        ],
      }),
    );
    expect(out).toContain("35.000,00");
    expect(out).toContain("Pendiente");
    expect(out).toContain("A favor");
    expect(out).toContain("250,00");
    expect(out).not.toContain("35.250");
  });
});

describe("«En curso» (D-3)", () => {
  it("hasta dos líneas, «+N» con el detalle para un lector de pantalla, y el vacío", () => {
    const out = html(
      createElement(OpenWorkCell, {
        work: { repairs: 1, appointments: 2, orders: 1, conversations: 3 },
      }),
    );
    expect(out).toContain("1 reparación");
    expect(out).toContain("2 turnos");
    expect(out).toContain("+2");
    expect(out).toContain("1 pedido, 3 conversaciones");
    expect(html(createElement(OpenWorkCell, { work: {} }))).toContain(
      "Sin operaciones abiertas",
    );
  });
});

import { describe, expect, it } from "vitest";
import {
  byQuantity,
  cancelRejectionMessage,
  closeRejectionMessage,
  DISPLAY_STATUS_LABEL,
  purchaseOrderDisplayStatus,
  purchaseOrderNoticeMessage,
  purchaseOrderRejection,
  TRACKING_LABEL,
} from "./messages";

// Los textos de la orden de compra (brief-22.3, D-8): cada rechazo del alta en su lugar, el costo
// con los decimales de la moneda, la cancelación y los avisos.

const P = "11111111-1111-4111-8111-111111111111";

describe("los rechazos del alta", () => {
  it("el proveedor y la moneda van a su campo", () => {
    expect(
      purchaseOrderRejection(
        { ok: false, code: "VALIDATION_ERROR", reason: "supplier", lines: [] },
        "",
      ),
    ).toMatchObject({ supplierError: "Elegí un proveedor de la lista." });
    expect(
      purchaseOrderRejection(
        { ok: false, code: "VALIDATION_ERROR", reason: "currency", lines: [] },
        "",
      ),
    ).toMatchObject({ currencyError: "Elegí la moneda de la orden." });
    expect(
      purchaseOrderRejection(
        {
          ok: false,
          code: "BUSINESS_RULE_VIOLATION",
          rule: "inactive_supplier",
        },
        "ARS",
      ).supplierError,
    ).toMatch(/desactivado/);
  });

  it("el costo dice los decimales de la moneda elegida", () => {
    const result = purchaseOrderRejection(
      {
        ok: false,
        code: "VALIDATION_ERROR",
        reason: "lines",
        lines: [
          { position: 1, field: "unitCost", reason: "decimals" },
          { position: 2, field: "unitCost", reason: "separator" },
          { position: 3, field: "quantity" },
          { position: 4, field: "product" },
        ],
      },
      "CLP",
    );
    expect(result.message).toBe("Revisá las líneas marcadas.");
    expect(result.lineErrors).toEqual({
      1: "CLP no tiene decimales: escribí el costo sin puntos ni comas.",
      2: "CLP no tiene decimales: escribí el costo sin puntos ni comas.",
      3: "Escribí una cantidad mayor que cero, con hasta tres decimales.",
      4: "Elegí un producto de la lista.",
    });
    expect(
      purchaseOrderRejection(
        {
          ok: false,
          code: "VALIDATION_ERROR",
          reason: "lines",
          lines: [{ position: 1, field: "unitCost", reason: "decimals" }],
        },
        "ARS",
      ).lineErrors,
    ).toEqual({ 1: "Escribí el costo con hasta 2 decimales, en ARS." });
  });

  it("las reglas de línea y los productos que no existen, por línea", () => {
    expect(
      purchaseOrderRejection(
        {
          ok: false,
          code: "BUSINESS_RULE_VIOLATION",
          rule: "line_rules",
          lines: [
            { position: 2, productId: P, rule: "duplicate_product" },
            { position: 3, productId: P, rule: "inactive_product" },
          ],
        },
        "ARS",
      ).lineErrors,
    ).toEqual({
      2: "El producto ya está en otra línea: sumá la cantidad ahí.",
      3: "El producto está desactivado.",
    });
    expect(
      purchaseOrderRejection(
        {
          ok: false,
          code: "NOT_FOUND",
          target: "products",
          lines: [{ position: 1, productId: P }],
        },
        "ARS",
      ).lineErrors,
    ).toEqual({ 1: "El producto ya no existe." });
  });
});

describe("la cancelación y los avisos", () => {
  it("una orden que ya no está abierta lo dice con su estado", () => {
    expect(
      cancelRejectionMessage({
        ok: false,
        code: "BUSINESS_RULE_VIOLATION",
        rule: "not_open",
        status: "cancelled",
      }),
    ).toBe(
      "La orden ya está cancelada: no se puede cancelar. Recargá la página.",
    );
    expect(cancelRejectionMessage({ ok: false, code: "NOT_FOUND" })).toBe(
      "Esta orden de compra no existe.",
    );
  });

  // brief-22.4, D-9.
  it("una orden con recepciones no se cancela, y una sin recepciones no se cierra a mano", () => {
    expect(
      cancelRejectionMessage({
        ok: false,
        code: "BUSINESS_RULE_VIOLATION",
        rule: "has_receipts",
      }),
    ).toBe(
      "La orden ya recibió mercadería: no se puede cancelar. Cerrala con faltante.",
    );
    expect(
      closeRejectionMessage({
        ok: false,
        code: "BUSINESS_RULE_VIOLATION",
        rule: "no_receipts",
      }),
    ).toBe(
      "La orden todavía no recibió mercadería: si no va a llegar, cancelala.",
    );
    expect(
      closeRejectionMessage({
        ok: false,
        code: "BUSINESS_RULE_VIOLATION",
        rule: "not_open",
        status: "closed",
      }),
    ).toBe("La orden ya está cerrada: no se puede cerrar. Recargá la página.");
    expect(purchaseOrderNoticeMessage("cerrada")).toBe(
      "Orden de compra cerrada con faltante.",
    );
  });

  it("solo los avisos conocidos", () => {
    expect(purchaseOrderNoticeMessage("creada")).toBe(
      "Orden de compra creada.",
    );
    expect(purchaseOrderNoticeMessage(["cancelada", "x"])).toBe(
      "Orden de compra cancelada.",
    );
    expect(purchaseOrderNoticeMessage("toString")).toBeNull();
    expect(purchaseOrderNoticeMessage(undefined)).toBeNull();
  });
});

// El estado que se muestra (brief-24.8.1, D-2 y M-3). Es la única pieza nueva de la subfase con
// una regla adentro, y los dos casos que la lámina separó —completa y con faltante— son los que
// fallan si la condición se invierte: con `hasPending` al revés, las dos aserciones de abajo se
// ponen rojas. Lo demás es un mapa de palabras, y se afirma como tal.
describe("el estado que se muestra", () => {
  it("separa la cerrada completa de la cerrada con faltante", () => {
    expect(purchaseOrderDisplayStatus("closed", false)).toBe("closedComplete");
    expect(purchaseOrderDisplayStatus("closed", true)).toBe("closedShort");
  });

  it("una orden que no está cerrada no deriva nada, tenga o no faltante", () => {
    for (const hasPending of [true, false]) {
      expect(purchaseOrderDisplayStatus("open", hasPending)).toBe("open");
      expect(purchaseOrderDisplayStatus("cancelled", hasPending)).toBe(
        "cancelled",
      );
    }
  });

  it("cada estado mostrado tiene su palabra, y las dos cerradas se distinguen sin el color", () => {
    expect(DISPLAY_STATUS_LABEL).toEqual({
      open: "Abierta",
      closedComplete: "Cerrada · Completa",
      closedShort: "Cerrada · Con faltante",
      cancelled: "Cancelada",
    });
  });

  it("el seguimiento del producto se nombra en la columna del alta", () => {
    expect(TRACKING_LABEL).toEqual({
      quantity: "Por cantidad",
      unit: "Por unidad",
    });
  });

  // V-28: la cantidad llega en el formato de la base, y **solo** una unidad exacta va en singular.
  // El caso que importa es «1.000»: una orden de un equipo es corriente, y la frase entera de la
  // lámina está escrita en singular para él.
  it("una unidad exacta va en singular, y nada más", () => {
    expect(byQuantity("1.000", "unidad", "unidades")).toBe("unidad");
    for (const quantity of ["0.000", "1.500", "2.000", "10.000", "0.001"]) {
      expect(byQuantity(quantity, "unidad", "unidades")).toBe("unidades");
    }
  });
});

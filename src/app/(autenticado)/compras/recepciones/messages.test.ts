import { describe, expect, it } from "vitest";
import {
  currencyWarning,
  goodsReceiptNoticeMessage,
  goodsReceiptRejection,
} from "./messages";

// Los textos de la recepción (brief-22.4, D-7, D-10 y D-11): cada rechazo en su lugar, la
// advertencia de moneda y los avisos.

const P = "11111111-1111-4111-8111-111111111111";
const Q = "22222222-2222-4222-8222-222222222222";

describe("los rechazos del alta", () => {
  it("el proveedor, la moneda y la referencia, en su campo", () => {
    expect(
      goodsReceiptRejection(
        {
          ok: false,
          code: "VALIDATION_ERROR",
          reason: "supplier_reference",
          lines: [],
        },
        "ARS",
        [],
      ),
    ).toMatchObject({
      message: "Revisá la referencia del proveedor.",
      referenceError:
        "Escribí hasta 40 letras, números, espacios, guiones o barras.",
    });
    expect(
      goodsReceiptRejection(
        {
          ok: false,
          code: "BUSINESS_RULE_VIOLATION",
          rule: "inactive_supplier",
        },
        "ARS",
        [],
      ).supplierError,
    ).toBe(
      "El proveedor está desactivado: reactivalo para registrarle una recepción.",
    );
    expect(
      goodsReceiptRejection(
        { ok: false, code: "VALIDATION_ERROR", reason: "currency", lines: [] },
        "",
        [],
      ).currencyError,
    ).toBe("Elegí la moneda de la recepción.");
  });

  it("lo que falta recibir, con la cantidad", () => {
    expect(
      goodsReceiptRejection(
        {
          ok: false,
          code: "BUSINESS_RULE_VIOLATION",
          rule: "line_rules",
          lines: [
            {
              position: 2,
              productId: P,
              rule: "exceeds_pending",
              pending: "3.500",
            },
            { position: 3, productId: Q, rule: "inactive_product" },
          ],
        },
        "ARS",
        [],
      ).lineErrors,
    ).toEqual({
      2: "Falta recibir 3,5: no se puede recibir más que eso con esta orden.",
      3: "El producto está desactivado.",
    });
  });

  it("el stock que no cabe, en la línea de su producto", () => {
    expect(
      goodsReceiptRejection(
        {
          ok: false,
          code: "BUSINESS_RULE_VIOLATION",
          rule: "stock_limit",
          productIds: [Q],
        },
        "ARS",
        [P, Q],
      ).lineErrors,
    ).toEqual({
      2: "Con esta cantidad, el stock del producto pasaría el máximo que se puede guardar.",
    });
  });

  it("una orden que ya no está abierta, o que no existe", () => {
    expect(
      goodsReceiptRejection(
        {
          ok: false,
          code: "BUSINESS_RULE_VIOLATION",
          rule: "order_not_open",
          status: "cancelled",
        },
        "ARS",
        [],
      ).message,
    ).toBe("La orden ya está cancelada: no recibe más mercadería.");
    expect(
      goodsReceiptRejection(
        { ok: false, code: "NOT_FOUND", target: "purchase_order" },
        "ARS",
        [],
      ).message,
    ).toBe(
      "Esta orden de compra no existe o ya no está abierta: no recibe mercadería.",
    );
    expect(
      goodsReceiptRejection(
        {
          ok: false,
          code: "NOT_FOUND",
          target: "order_lines",
          lines: [{ position: 1, productId: "" }],
        },
        "ARS",
        [],
      ).lineErrors,
    ).toEqual({ 1: "Esta línea no es de la orden." });
  });
});

describe("la advertencia de moneda (D-7)", () => {
  it("solo si el producto se vende en otra moneda", () => {
    expect(currencyWarning("USD", "ARS")).toBe(
      "Este producto se vende en USD: con este costo queda sin margen.",
    );
    expect(currencyWarning("ARS", "ARS")).toBeNull();
    expect(currencyWarning(null, "ARS")).toBeNull();
    expect(currencyWarning("USD", "")).toBeNull();
  });
});

describe("los avisos", () => {
  it("solo los conocidos", () => {
    expect(goodsReceiptNoticeMessage("creada")).toBe(
      "Recepción registrada: el stock y el costo ya están actualizados.",
    );
    expect(goodsReceiptNoticeMessage(["orden-cerrada"])).toMatch(
      /la orden quedó completa y se cerró\.$/,
    );
    expect(goodsReceiptNoticeMessage("toString")).toBeNull();
    expect(goodsReceiptNoticeMessage(undefined)).toBeNull();
  });
});

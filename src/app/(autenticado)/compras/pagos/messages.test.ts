import { describe, expect, it } from "vitest";
import {
  paymentNoticeMessage,
  paymentRejection,
  voidCashNote,
  voidPaymentRejection,
} from "./messages";

describe("los textos del pago (brief-22.6, D-10 y D-13)", () => {
  it("cada regla tiene su texto, y marca el campo que corresponde", () => {
    expect(
      paymentRejection({
        ok: false,
        code: "BUSINESS_RULE_VIOLATION",
        rule: "exceeds_outstanding",
        currency: "ARS",
        outstanding: "150.00",
      }),
    ).toMatchObject({
      fields: ["amount"],
      message: expect.stringContaining("supera lo que falta"),
    });
    expect(
      paymentRejection({
        ok: false,
        code: "BUSINESS_RULE_VIOLATION",
        rule: "exceeds_outstanding",
        currency: "ARS",
        outstanding: "0.00",
      }).message,
    ).toBe("A esta recepción ya no le falta nada por pagar.");
    expect(
      paymentRejection({
        ok: false,
        code: "BUSINESS_RULE_VIOLATION",
        rule: "insufficient_cash",
        currency: "ARS",
        expected: "10.00",
      }),
    ).toMatchObject({
      fields: ["amount"],
      message: expect.stringContaining("No hay tanto efectivo"),
    });
    expect(
      paymentRejection({
        ok: false,
        code: "BUSINESS_RULE_VIOLATION",
        rule: "no_open_session",
      }),
    ).toMatchObject({ openCash: true, fields: ["paymentMethod"] });
    expect(
      paymentRejection({
        ok: false,
        code: "BUSINESS_RULE_VIOLATION",
        rule: "goods_receipt_voided",
      }).message,
    ).toContain("está anulada");
  });

  it("los rechazos de los campos nombran cada uno", () => {
    const result = paymentRejection({
      ok: false,
      code: "VALIDATION_ERROR",
      fields: ["paymentMethod", "currency", "amount"],
      amount: "zero",
    });
    expect(result.fields).toEqual(["paymentMethod", "currency", "amount"]);
    expect(result.message).toContain("Medio de pago");
    expect(result.message).toContain("Moneda");
    expect(result.message).toContain("mayor que cero");
  });

  it("los NOT_FOUND distinguen el medio, el proveedor y la recepción", () => {
    expect(
      paymentRejection({
        ok: false,
        code: "NOT_FOUND",
        entity: "payment_method",
      }).fields,
    ).toEqual(["paymentMethod"]);
    expect(
      paymentRejection({ ok: false, code: "NOT_FOUND", entity: "supplier" })
        .message,
    ).toBe("Este proveedor no existe.");
    expect(
      paymentRejection({
        ok: false,
        code: "NOT_FOUND",
        entity: "goods_receipt",
      }).message,
    ).toBe("Esta recepción no existe.");
  });
});

describe("los textos de la anulación", () => {
  it("ya anulado enlaza la anulación; el tope y el motivo tienen su texto", () => {
    expect(
      voidPaymentRejection({
        ok: false,
        code: "BUSINESS_RULE_VIOLATION",
        rule: "already_voided",
        void: { id: "x", number: 1, displayNumber: "APP-000001" },
      }),
    ).toEqual({
      message: "Este pago ya está anulado, por APP-000001.",
      existing: { displayNumber: "APP-000001" },
    });
    expect(
      voidPaymentRejection({
        ok: false,
        code: "VALIDATION_ERROR",
        fields: ["amount"],
        amount: "limit",
      }).message,
    ).toContain("máximo");
    expect(
      voidPaymentRejection({
        ok: false,
        code: "VALIDATION_ERROR",
        fields: ["reason"],
      }).message,
    ).toBe("Elegí el motivo de la anulación.");
  });

  it("lo que pasa con la caja depende de la sesión del pago", () => {
    expect(voidCashNote(null)).toContain("no fue en efectivo");
    expect(voidCashNote({ displayNumber: "C-000003", open: true })).toContain(
      "sesión abierta C-000003",
    );
    expect(voidCashNote({ displayNumber: "C-000003", open: false })).toContain(
      "ya cerró",
    );
  });

  it("solo los avisos conocidos", () => {
    expect(paymentNoticeMessage("creado")).toBe("Pago registrado.");
    expect(paymentNoticeMessage("otro")).toBeNull();
    expect(paymentNoticeMessage(undefined)).toBeNull();
  });
});

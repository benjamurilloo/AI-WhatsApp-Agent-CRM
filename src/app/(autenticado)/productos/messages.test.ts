import { describe, expect, it } from "vitest";
import {
  adjustmentFieldError,
  adjustmentRejectionMessage,
  BARCODE_TAKEN_MESSAGE,
  formatMeasure,
  HEIGHT_MESSAGE,
  FORBIDDEN_ACTION_MESSAGE,
  IMAGE_TOO_LARGE_MESSAGE,
  imageUploadMessage,
  type ImageUploadError,
  INACTIVE_PRODUCT_NOTICE,
  noticeMessage,
  productChangeMessage,
  productConflictError,
  productFieldError,
  PRODUCT_NOT_FOUND_MESSAGE,
  SKU_TAKEN_MESSAGE,
  type AdjustmentRejection,
} from "./messages";

const REQUEST_ID = "b3c5b1f4-0000-4000-8000-000000000001";

describe("productFieldError", () => {
  it("elige el primer campo inválido en el orden del formulario", () => {
    expect(productFieldError(["unit", "sku"]).field).toBe("sku");
    expect(productFieldError(["reorderPoint", "name"]).field).toBe("name");
    expect(productFieldError(["reorderPoint"]).message).toContain("2,5");
  });
});

describe("adjustmentFieldError", () => {
  it("prioriza tipo, cantidad y motivo sobre el saldo esperado", () => {
    expect(adjustmentFieldError(["quantity", "type"]).field).toBe("type");
    expect(
      adjustmentFieldError(["expectedQuantityOnHand", "reason"]).field,
    ).toBe("reason");
  });
});

describe("adjustmentRejectionMessage", () => {
  it("el saldo negativo muestra saldo actual y cantidad, en formato local", () => {
    const rejection: AdjustmentRejection = {
      ok: false,
      code: "BUSINESS_RULE_VIOLATION",
      rule: "negative_stock",
      currentQuantityOnHand: "6.000",
      requestedQuantity: "9.500",
    };
    const result = adjustmentRejectionMessage(rejection, REQUEST_ID);
    expect(result.field).toBe("quantity");
    expect(result.message).toContain("Saldo actual: 6");
    expect(result.message).toContain("cantidad solicitada: 9,5");
    expect(result.message).toContain("No se registró ningún movimiento.");
  });

  it("el máximo de stock también explica el saldo y la cantidad", () => {
    const result = adjustmentRejectionMessage(
      {
        ok: false,
        code: "BUSINESS_RULE_VIOLATION",
        rule: "stock_limit",
        currentQuantityOnHand: "99999999999.999",
        requestedQuantity: "1.000",
      },
      REQUEST_ID,
    );
    expect(result.message).toContain("supera el máximo");
    expect(result.message).toContain("99999999999,999");
  });

  it("un producto desactivado no señala ningún campo", () => {
    expect(
      adjustmentRejectionMessage(
        {
          ok: false,
          code: "BUSINESS_RULE_VIOLATION",
          rule: "inactive_product",
        },
        REQUEST_ID,
      ),
    ).toEqual({ field: null, message: INACTIVE_PRODUCT_NOTICE });
  });

  it("un cambio concurrente muestra el saldo actualizado y pide confirmar de nuevo", () => {
    const result = adjustmentRejectionMessage(
      { ok: false, code: "CONFLICT", currentQuantityOnHand: "4.250" },
      REQUEST_ID,
    );
    expect(result.field).toBeNull();
    expect(result.message).toContain("Saldo actualizado: 4,25");
    expect(result.message).toContain("confirmá de nuevo");
  });

  it("distingue la validación del formulario de la del id", () => {
    expect(
      adjustmentRejectionMessage(
        { ok: false, code: "VALIDATION_ERROR", fields: ["reason"] },
        REQUEST_ID,
      ).field,
    ).toBe("reason");
    expect(
      adjustmentRejectionMessage(
        { ok: false, code: "VALIDATION_ERROR" },
        REQUEST_ID,
      ),
    ).toEqual({ field: null, message: PRODUCT_NOT_FOUND_MESSAGE });
  });

  it("traduce los códigos generales", () => {
    expect(
      adjustmentRejectionMessage({ ok: false, code: "NOT_FOUND" }, REQUEST_ID)
        .message,
    ).toBe(PRODUCT_NOT_FOUND_MESSAGE);
    expect(
      adjustmentRejectionMessage({ ok: false, code: "FORBIDDEN" }, REQUEST_ID)
        .message,
    ).toBe(FORBIDDEN_ACTION_MESSAGE);
  });
});

describe("productChangeMessage", () => {
  it("traduce cada código a su mensaje", () => {
    expect(productChangeMessage("FORBIDDEN", REQUEST_ID)).toBe(
      FORBIDDEN_ACTION_MESSAGE,
    );
    expect(productChangeMessage("NOT_FOUND", REQUEST_ID)).toBe(
      PRODUCT_NOT_FOUND_MESSAGE,
    );
    expect(productChangeMessage("VALIDATION_ERROR", REQUEST_ID)).toBe(
      PRODUCT_NOT_FOUND_MESSAGE,
    );
    expect(productChangeMessage("CONFLICT", REQUEST_ID)).toBe(
      SKU_TAKEN_MESSAGE,
    );
    expect(productChangeMessage("INTERNAL", REQUEST_ID)).toContain(REQUEST_ID);
  });
});

describe("noticeMessage", () => {
  it("solo acepta avisos conocidos", () => {
    expect(noticeMessage("creado")).toBe("Producto creado.");
    expect(noticeMessage("ajustado")).toBe("Ajuste registrado.");
    expect(noticeMessage(["desactivado", "creado"])).toBe(
      "Producto desactivado.",
    );
    expect(noticeMessage("inventado")).toBeNull();
    expect(noticeMessage(undefined)).toBeNull();
  });
});

// brief-17.2: los campos de operación en el orden del formulario, el CONFLICT en su campo y las
// medidas como se leen.
describe("campos de operación (brief-17.2)", () => {
  it("el código de barras va después del SKU; las dimensiones, después del stock", () => {
    expect(productFieldError(["name", "barcode"]).field).toBe("barcode");
    expect(productFieldError(["shelf", "heightCm", "reorderPoint"]).field).toBe(
      "reorderPoint",
    );
    expect(productFieldError(["shelf", "heightCm"])).toEqual({
      field: "heightCm",
      message: HEIGHT_MESSAGE,
    });
  });

  it("FR-PROD-14: el CONFLICT señala el campo repetido con su mensaje", () => {
    expect(productConflictError("barcode")).toEqual({
      field: "barcode",
      message: BARCODE_TAKEN_MESSAGE,
    });
    expect(productConflictError("sku")).toEqual({
      field: "sku",
      message: SKU_TAKEN_MESSAGE,
    });
  });

  it("formatMeasure quita los ceros finales y usa coma decimal, en cualquier escala", () => {
    expect(formatMeasure("1.500")).toBe("1,5");
    expect(formatMeasure("10.0")).toBe("10");
    expect(formatMeasure("20.5")).toBe("20,5");
    expect(formatMeasure("0.005")).toBe("0,005");
    expect(formatMeasure("9999999.999")).toBe("9999999,999");
  });
});

describe("imageUploadMessage (brief-17.5, D-7)", () => {
  it("traduce cada respuesta de la subida, sin dejar ninguna en blanco", () => {
    const errors: ImageUploadError[] = [
      "unauthenticated",
      "forbidden",
      "not_found",
      "rate_limited",
      "busy",
      "length_required",
      "too_large",
      "empty",
      "unsupported_format",
      "too_many_pixels",
      "animated",
      "unreadable",
      "internal",
    ];
    for (const error of errors) {
      expect(imageUploadMessage(error), error).toMatch(/\S/);
    }
    expect(imageUploadMessage("forbidden")).toBe(FORBIDDEN_ACTION_MESSAGE);
    expect(imageUploadMessage("not_found")).toBe(PRODUCT_NOT_FOUND_MESSAGE);
    expect(imageUploadMessage("too_large")).toBe(IMAGE_TOO_LARGE_MESSAGE);
    expect(imageUploadMessage("unsupported_format")).toContain(
      "JPEG, PNG o WebP",
    );
  });

  it("los avisos de la ficha cubren subir y quitar la imagen", () => {
    expect(noticeMessage("imagen-subida")).toBe("Imagen guardada.");
    expect(noticeMessage("imagen-quitada")).toBe("Imagen quitada.");
  });
});

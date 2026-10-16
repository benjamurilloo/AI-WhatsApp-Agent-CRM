import { describe, expect, it } from "vitest";
import { isGoodsReceiptAlreadyVoided } from "./goods-receipt-repository";

// El rescate del 23505 de la anulación por el nombre de la restricción (brief-22.5, D-5): solo la que
// impide anular dos veces una recepción es «ya anulada»; el número repetido u otro error se relanzan.

// drizzle-orm envuelve el error de pg y lo deja en la causa; a veces llega sin envolver.
const wrapped = (code: string, constraint: string) => ({
  message: "Failed query",
  cause: { code, constraint },
});

describe("isGoodsReceiptAlreadyVoided", () => {
  it("la recepción anulada dos veces, envuelta o no", () => {
    expect(
      isGoodsReceiptAlreadyVoided(
        wrapped("23505", "goods_receipt_voids_goods_receipt_unique"),
      ),
    ).toBe(true);
    expect(
      isGoodsReceiptAlreadyVoided({
        code: "23505",
        constraint: "goods_receipt_voids_goods_receipt_unique",
      }),
    ).toBe(true);
  });

  it("el número repetido, otro código o algo que no es un error de pg no son esta regla", () => {
    expect(
      isGoodsReceiptAlreadyVoided(
        wrapped("23505", "goods_receipt_voids_organization_number_unique"),
      ),
    ).toBe(false);
    expect(
      isGoodsReceiptAlreadyVoided(
        wrapped("23503", "goods_receipt_voids_goods_receipt_unique"),
      ),
    ).toBe(false);
    expect(isGoodsReceiptAlreadyVoided(null)).toBe(false);
    expect(isGoodsReceiptAlreadyVoided(new Error("otro"))).toBe(false);
  });
});

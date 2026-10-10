import type {
  MarginNoneReason,
  ProductCost,
  SetCostResult,
} from "@/modules/catalog";
import type { AmountRejection, CurrencyRejection } from "@/shared/money";
import { formatMoney } from "@/shared/money";
import {
  FORBIDDEN_ACTION_MESSAGE,
  PRODUCT_NOT_FOUND_MESSAGE,
  unexpectedErrorMessage,
} from "../../messages";

// Textos de la pantalla de costos (brief-18.2, FR-PROD-19 a 21). Los del formulario repiten los
// del precio, con «costo» donde dicen «precio» (D-5).

export const NO_COSTS_MESSAGE = "Este producto todavía no tiene costo.";
export const INACTIVE_PRODUCT_COST_NOTICE =
  "Este producto está desactivado y no admite un costo nuevo.";
export const STALE_COST_MESSAGE = "El costo cambió mientras fijabas uno nuevo.";
export const COST_SAVED_NOTICE = "Costo fijado.";
export const COST_UNCHANGED_NOTICE =
  "Ese ya es el costo vigente: no se registró ningún cambio.";
export const COST_DESCRIPTION =
  "Lo que el negocio paga por una unidad, con el IVA incluido, lo recupere o no.";

// La base del margen, siempre a la vista (D-6; ADR 0019, §Consecuencias).
export const MARGIN_BASE_NOTE =
  "Calculado sobre el precio final y el costo, los dos con impuestos incluidos. Si el negocio recupera el IVA de sus compras, el monto incluye IVA.";
export const NEGATIVE_MARGIN_NOTICE = "El costo supera el precio.";

export const MARGIN_NONE_MESSAGES: Record<MarginNoneReason, string> = {
  no_price: "Sin margen: el producto no tiene precio.",
  no_cost: "Sin margen: el producto no tiene costo.",
  currency_mismatch:
    "Sin margen: el precio y el costo están en monedas distintas.",
};

const AMOUNT_MESSAGES: Record<AmountRejection, string> = {
  separator:
    "Esta moneda no usa decimales: escribí el monto sin puntos ni comas, por ejemplo 300000.",
  decimals:
    "El monto tiene más decimales de los que usa esta moneda. Si usás separador de miles, escribí también los decimales, por ejemplo 1.234,50.",
  too_large: "El monto no puede superar los doce dígitos enteros.",
  zero: "El costo tiene que ser mayor que cero.",
  invalid:
    "Escribí el monto solo con números y, si la moneda usa decimales, una coma o un punto, por ejemplo 1234,50.",
};

const CURRENCY_MESSAGES: Record<CurrencyRejection, string> = {
  unknown: "Elegí la moneda del costo.",
  too_many_decimals:
    "Esta moneda usa tres decimales y el CRM guarda costos con dos como máximo.",
};

export function costText(cost: ProductCost | null): string {
  return cost ? formatMoney(cost.amount, cost.currency) : "Sin costo";
}

export type CostField = "amount" | "currency";

export type CostRejection = Exclude<SetCostResult, { ok: true }>;

// Mensaje de un costo rechazado, con el campo al que va el foco.
export function costRejectionMessage(
  rejection: CostRejection,
  requestId: string,
): { field: CostField | null; message: string } {
  switch (rejection.code) {
    case "VALIDATION_ERROR":
      if (!("fields" in rejection)) {
        return { field: null, message: PRODUCT_NOT_FOUND_MESSAGE };
      }
      if (rejection.currencyReason) {
        return {
          field: "currency",
          message: CURRENCY_MESSAGES[rejection.currencyReason],
        };
      }
      return {
        field: "amount",
        message: AMOUNT_MESSAGES[rejection.amountReason ?? "invalid"],
      };
    case "CONFLICT":
      return {
        field: null,
        message: `${STALE_COST_MESSAGE} Costo vigente: ${costText(
          rejection.currentCost,
        )}. Revisá y confirmá de nuevo.`,
      };
    case "BUSINESS_RULE_VIOLATION":
      return { field: null, message: INACTIVE_PRODUCT_COST_NOTICE };
    case "NOT_FOUND":
      return { field: null, message: PRODUCT_NOT_FOUND_MESSAGE };
    case "FORBIDDEN":
      return { field: null, message: FORBIDDEN_ACTION_MESSAGE };
    default:
      return { field: null, message: unexpectedErrorMessage(requestId) };
  }
}

// Lo que se envió, para que el formulario lo conserve al reiniciarse. expectedCostId viaja en el
// estado, como expectedPriceId en el precio (revisión independiente de la 11.1, M-1).
export type CostFormValues = {
  amount: string;
  currency: string;
  expectedCostId: string;
};

export type CostFormState =
  | { status: "idle" }
  | { status: "unchanged"; requestId: string; values: CostFormValues }
  | {
      status: "error";
      requestId: string;
      field: CostField | null;
      message: string;
      values: CostFormValues;
      // Tras un CONFLICT, el costo vigente que hay que volver a confirmar.
      currentCost?: ProductCost | null;
    };

// Aviso tras fijar un costo; solo un valor conocido llega a la página.
export function costNoticeMessage(
  value: string | string[] | undefined,
): string | null {
  const key = Array.isArray(value) ? value[0] : value;
  return key === "fijado" ? COST_SAVED_NOTICE : null;
}

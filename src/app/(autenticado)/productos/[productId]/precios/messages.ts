import type {
  PriceField,
  ProductPrice,
  SetPriceResult,
} from "@/modules/catalog";
import type { AmountRejection, CurrencyRejection } from "@/shared/money";
import { formatMoney } from "@/shared/money";
import {
  FORBIDDEN_ACTION_MESSAGE,
  PRODUCT_NOT_FOUND_MESSAGE,
  unexpectedErrorMessage,
} from "../../messages";

// Textos de la pantalla de precios (brief-11.1, FR-PROD-12), derivados de la taxonomía de errores.
// Cada motivo de rechazo del monto tiene su mensaje (D-6).

export const NO_PRICES_MESSAGE = "Este producto todavía no tiene precio.";
export const INACTIVE_PRODUCT_PRICE_NOTICE =
  "Este producto está desactivado y no admite un precio nuevo.";
export const STALE_PRICE_MESSAGE =
  "El precio cambió mientras fijabas uno nuevo.";
export const PRICE_SAVED_NOTICE = "Precio fijado.";
export const PRICE_UNCHANGED_NOTICE =
  "Ese ya es el precio vigente: no se registró ningún cambio.";

const AMOUNT_MESSAGES: Record<AmountRejection, string> = {
  separator:
    "Esta moneda no usa decimales: escribí el monto sin puntos ni comas, por ejemplo 300000.",
  decimals:
    "El monto tiene más decimales de los que usa esta moneda. Si usás separador de miles, escribí también los decimales, por ejemplo 1.234,50.",
  too_large: "El monto no puede superar los doce dígitos enteros.",
  zero: "El precio tiene que ser mayor que cero.",
  invalid:
    "Escribí el monto solo con números y, si la moneda usa decimales, una coma o un punto, por ejemplo 1234,50.",
};

const CURRENCY_MESSAGES: Record<CurrencyRejection, string> = {
  unknown: "Elegí la moneda del precio.",
  too_many_decimals:
    "Esta moneda usa tres decimales y el CRM guarda precios con dos como máximo.",
};

export function priceText(price: ProductPrice | null): string {
  return price ? formatMoney(price.amount, price.currency) : "Sin precio";
}

export type PriceRejection = Exclude<SetPriceResult, { ok: true }>;

// Mensaje de un precio rechazado, con el campo al que va el foco.
export function priceRejectionMessage(
  rejection: PriceRejection,
  requestId: string,
): { field: PriceField | null; message: string } {
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
        message: `${STALE_PRICE_MESSAGE} Precio vigente: ${priceText(
          rejection.currentPrice,
        )}. Revisá y confirmá de nuevo.`,
      };
    case "BUSINESS_RULE_VIOLATION":
      return { field: null, message: INACTIVE_PRODUCT_PRICE_NOTICE };
    case "NOT_FOUND":
      return { field: null, message: PRODUCT_NOT_FOUND_MESSAGE };
    case "FORBIDDEN":
      return { field: null, message: FORBIDDEN_ACTION_MESSAGE };
    default:
      return { field: null, message: unexpectedErrorMessage(requestId) };
  }
}

// Lo que se envió, para que el formulario lo conserve al reiniciarse. expectedPriceId es el id
// del precio que vio quien completa el formulario: viaja en el estado y no se toma de la página,
// que el servidor puede volver a renderizar con otro vigente (revisión independiente, M-1).
export type PriceFormValues = {
  amount: string;
  currency: string;
  expectedPriceId: string;
};

export type PriceFormState =
  | { status: "idle" }
  // Ya era el precio vigente: no se escribió nada (D-7), y se dice en el formulario.
  | { status: "unchanged"; requestId: string; values: PriceFormValues }
  | {
      status: "error";
      requestId: string;
      field: PriceField | null;
      message: string;
      values: PriceFormValues;
      // Tras un CONFLICT, el precio vigente que la pantalla tiene que volver a confirmar. undefined:
      // el rechazo no cambió lo que se sabe del vigente.
      currentPrice?: ProductPrice | null;
    };

// Aviso tras fijar un precio; solo un valor conocido llega a la página.
export function priceNoticeMessage(
  value: string | string[] | undefined,
): string | null {
  const key = Array.isArray(value) ? value[0] : value;
  return key === "fijado" ? PRICE_SAVED_NOTICE : null;
}

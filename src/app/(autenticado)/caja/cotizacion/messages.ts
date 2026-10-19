import type { RecordExchangeRateResult } from "@/modules/fx";
import { RATE_TEXT } from "@/app/(autenticado)/ventas/[saleId]/cobrar/messages";

// Textos de la cotización (ADR 0025, punto 4; brief-29.4, D-4).

export const RATE_TITLE = "Cotización";
export const RATE_FORBIDDEN_MESSAGE =
  "Tenés que cambiar tu contraseña antes de seguir.";
export const RATE_ADMIN_ONLY_MESSAGE =
  "Solo un administrador puede cargar una cotización.";
export const NO_RATE_YET_MESSAGE =
  "Todavía no hay una cotización cargada. Sin ella, no se cobra en la otra moneda.";
export const MANUAL_SOURCE_TEXT = "Carga manual";
export const RATE_HELP =
  "La cotización que cargues pasa a ser la vigente: la usan los cobros en la otra moneda y los totales de referencia. Las anteriores quedan en el historial.";

export const RATE_NOTICE: Record<string, string> = {
  cargada: "Cotización cargada: es la vigente.",
};

export type RateFormValues = { rate: string };

export type RateFormState =
  | { status: "idle" }
  | {
      status: "error";
      requestId: string;
      values: RateFormValues;
      message: string;
      field: "rate" | null;
    }
  // Se mueve más de un 10 % contra la vigente: se pide confirmarla (D-4), sin bloquear.
  | {
      status: "confirm";
      requestId: string;
      values: RateFormValues;
      current: string;
    };

export function unexpectedRateMessage(requestId: string): string {
  return `No pudimos cargar la cotización. Código: ${requestId}`;
}

export function largeChangeMessage(current: string, next: string): string {
  return `La cotización nueva (${next}) se mueve más de un 10 % contra la vigente (${current}). Revisala y confirmala si es correcta.`;
}

export function rateRejection(
  result: Exclude<RecordExchangeRateResult, { ok: true }>,
): { message: string; field: "rate" | null } {
  switch (result.code) {
    case "FORBIDDEN":
      return { message: RATE_ADMIN_ONLY_MESSAGE, field: null };
    case "NOT_FOUND":
      return {
        message: "Esta organización no tiene moneda principal.",
        field: null,
      };
    case "VALIDATION_ERROR":
      return {
        message: `Cotización: ${RATE_TEXT[result.reason] ?? RATE_TEXT.invalid}`,
        field: "rate",
      };
    // La acción pide la confirmación antes de llegar acá.
    case "BUSINESS_RULE_VIOLATION":
      return {
        message: `Se mueve más de un 10 % contra la vigente (${result.current}).`,
        field: "rate",
      };
  }
}

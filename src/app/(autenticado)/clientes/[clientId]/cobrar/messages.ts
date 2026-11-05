import type {
  AccountReceiptField,
  AccountReceiptPreview,
  CreateAccountReceiptResult,
  TenderField,
} from "@/modules/cash";
import {
  receiptRejection,
  RECEIPT_ADMIN_ONLY_MESSAGE,
} from "@/app/(autenticado)/ventas/[saleId]/cobrar/messages";
import { CLIENT_NOT_FOUND_MESSAGE } from "../cuenta/messages";

// Textos del cobro a cuenta (brief-21.6, D-5 y D-10). Los del medio, el monto y la caja son los del
// cobro de una venta.

export const ACCOUNT_RECEIPT_TITLE = "Cobrar a cuenta";
export const ACCOUNT_RECEIPT_ADMIN_ONLY_MESSAGE = RECEIPT_ADMIN_ONLY_MESSAGE;
export const ACCOUNT_RECEIPT_NOTICE = "Cobro a cuenta registrado.";
export const ACCOUNT_RECEIPT_HELP =
  "El cobro a cuenta no elige una venta: se aplica a las ventas con saldo, de la más vieja a la más nueva, y lo que sobra queda a favor del cliente.";

export function unexpectedAccountReceiptMessage(requestId: string): string {
  return `No pudimos registrar el cobro. Código: ${requestId}`;
}

// Desde la 29.4, la moneda que entra, la cotización acordada y la vigente que se mostró (brief-29.4,
// D-6): viajan también en la confirmación.
// Los textos de la revisión, con la forma de la lámina 03 del lote V2-10 (brief-24.7.2).

export const STEP_DATA_LABEL = "Paso 1 de 2: Datos del cobro";
export const STEP_REVIEW_LABEL = "Paso 2 de 2: Revisión";

export const REVIEW_TITLE = "Revisión de la aplicación";
export const REVIEW_SUBTITLE =
  "Verificá cómo se va a aplicar este cobro en la cuenta del cliente.";

// La imputación **se deriva**, no se elige. Decirlo acá evita que alguien busque las casillas que
// la lámina a propósito no tiene (README del lote V2-10, §Saldo e imputación).
export const REVIEW_AUTOMATIC_NOTE =
  "No es una selección manual de ventas: se aplica de la más antigua a la más reciente.";

// El aviso que la lámina pinta en ámbar. Es la misma garantía que el ADR 0022 da y no más: lo que
// se ve es la cuenta de ahora, y al registrar se vuelve a calcular con los saldos de ese momento.
export const REVIEW_FORECAST_TITLE = "Es una previsión de la cuenta actual.";
export const REVIEW_FORECAST_DETAIL =
  "La aplicación se vuelve a calcular al registrar, y una anulación posterior puede cambiarla.";

export const REVIEW_CONTEXT_TITLE = "Contexto de la cuenta";
export const REVIEW_ENTERED_TITLE = "Datos del cobro (ingresados)";

// Transferencia registra un ingreso recibido; no mueve plata (README del lote, §Cobrar a cuenta).
export const REVIEW_NO_TRANSFER_NOTE =
  "Registrar no ejecuta una transferencia.";

// Una deuda en otra moneda no se toca: el cobro no cruza monedas y el equivalente no compensa.
export function otherCurrenciesNote(parts: string[]): string {
  return `${parts.join(" y ")} siguen pendientes; este cobro no cruza monedas.`;
}
export type AccountReceiptFormValues = {
  currency: string;
  paymentMethodId: string;
  amount: string;
  tenderedCurrency: string;
  exchangeRate: string;
  exchangeRateId: string;
};

export type AccountReceiptFormField = AccountReceiptField | TenderField;

// Dos pasos, sin JavaScript también: los datos, la vista previa de la regla y la confirmación.
export type AccountReceiptFormState =
  | { status: "idle"; values?: AccountReceiptFormValues }
  | {
      status: "preview";
      values: AccountReceiptFormValues;
      preview: AccountReceiptPreview;
      paymentMethodName: string;
    }
  | {
      status: "error";
      requestId: string;
      values: AccountReceiptFormValues;
      message: string;
      fields: AccountReceiptFormField[];
      openCash: boolean;
    };

export function accountReceiptRejection(
  result: Exclude<CreateAccountReceiptResult, { ok: true }>,
): { message: string; fields: AccountReceiptFormField[]; openCash: boolean } {
  const plain = (message: string, fields: AccountReceiptFormField[] = []) => ({
    message,
    fields,
    openCash: false,
  });
  if (result.code === "FORBIDDEN") {
    return plain(ACCOUNT_RECEIPT_ADMIN_ONLY_MESSAGE);
  }
  if (result.code === "NOT_FOUND" && "entity" in result) {
    if (result.entity === "client") return plain(CLIENT_NOT_FOUND_MESSAGE);
  }
  if (result.code === "VALIDATION_ERROR") {
    if (!("fields" in result)) return plain(CLIENT_NOT_FOUND_MESSAGE);
    const fields = result.fields as AccountReceiptFormField[];
    if (fields.includes("currency")) {
      const others = fields.filter((field) => field !== "currency");
      const rest =
        others.length === 0
          ? ""
          : ` ${
              receiptRejection({
                ...result,
                fields: others,
              } as Parameters<typeof receiptRejection>[0]).message
            }`;
      // Con moneda principal, la moneda aplicada es la principal o una con saldo del cliente
      // (brief-29.4, D-6): la lista del formulario ya ofrece solo esas.
      return plain(`Moneda: elegí una de la lista.${rest}`, fields);
    }
  }
  // El medio, el monto y la caja: los mismos rechazos y textos que el cobro de una venta. Un cobro a
  // cuenta no lleva usado (brief-29.7.2, U-1): ese campo no existe en su formulario.
  const rejected = receiptRejection(
    result as Parameters<typeof receiptRejection>[0],
  );
  return {
    ...rejected,
    fields: rejected.fields.filter(
      (field): field is Exclude<typeof field, "tradeIn"> => field !== "tradeIn",
    ),
  };
}

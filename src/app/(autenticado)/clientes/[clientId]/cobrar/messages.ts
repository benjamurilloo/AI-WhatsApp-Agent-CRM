import type {
  AccountReceiptField,
  AccountReceiptPreview,
  CreateAccountReceiptResult,
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

export type AccountReceiptFormValues = {
  currency: string;
  paymentMethodId: string;
  amount: string;
};

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
      fields: AccountReceiptField[];
      openCash: boolean;
    };

export function accountReceiptRejection(
  result: Exclude<CreateAccountReceiptResult, { ok: true }>,
): { message: string; fields: AccountReceiptField[]; openCash: boolean } {
  const plain = (message: string, fields: AccountReceiptField[] = []) => ({
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
    const fields = result.fields as AccountReceiptField[];
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
      return plain(
        `Moneda: escribí un código de tres letras, como ARS o USD.${rest}`,
        fields,
      );
    }
  }
  // El medio, el monto y la caja: los mismos rechazos y textos que el cobro de una venta.
  return receiptRejection(result as Parameters<typeof receiptRejection>[0]);
}

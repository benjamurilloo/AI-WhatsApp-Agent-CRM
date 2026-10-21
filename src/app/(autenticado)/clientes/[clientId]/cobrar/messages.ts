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

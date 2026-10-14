import type {
  CashClosingPreviewRow,
  CashMovementKind,
  CashMovementReason,
  CashRowIssue,
  CloseCashSessionResult,
  CreatePaymentMethodResult,
  OpenCashSessionResult,
  PaymentMethodActiveResult,
  PreviewCashClosingResult,
  RecordCashMovementResult,
  RenamePaymentMethodResult,
} from "@/modules/cash";
import { formatMoney } from "@/shared/money";

// Textos de la caja y de los medios de pago (brief-21.2, D-8 y D-10; Screens.md §21 a §25).

export const FORBIDDEN_PAGE_MESSAGE = "No tenés permiso para ver esta página.";
export const ADMIN_ONLY_MESSAGE = "Solo un administrador puede operar la caja.";
export const SESSION_NOT_FOUND_MESSAGE = "Esta sesión de caja no existe.";
export const NO_SESSIONS_MESSAGE = "Todavía no se abrió la caja.";
export const NO_SESSION_RESULTS_MESSAGE =
  "Ninguna sesión coincide con ese número.";
export const NO_PAYMENT_METHODS_MESSAGE =
  "Todavía no hay medios de pago. Un administrador puede crear la lista inicial.";
// ADR 0019, punto 6, como en la venta.
export const NOT_AN_INVOICE_LEGEND = "Documento no válido como factura";
export const UNKNOWN_MEMBER_TEXT = "Usuario no disponible";

export const KIND_LABEL: Record<CashMovementKind, string> = {
  contribution: "Aporte",
  withdrawal: "Retiro",
};

// Los motivos de la lista cerrada (brief-21.2, D-2). «Corrección de caja» y «Otro» valen para los
// dos tipos.
export const REASON_LABEL: Record<CashMovementReason, string> = {
  change_fund: "Cambio para la caja",
  owner_contribution: "Aporte del dueño",
  bank_deposit: "Depósito en el banco",
  owner_withdrawal: "Retiro del dueño",
  correction: "Corrección de caja",
  other: "Otro",
};

// El tipo del movimiento en la URL: ?tipo=aporte o ?tipo=retiro.
export const KIND_BY_PARAM: Record<string, CashMovementKind> = {
  aporte: "contribution",
  retiro: "withdrawal",
};

export const CASH_NOTICE: Record<string, string> = {
  abierta: "Caja abierta.",
  aporte: "Aporte registrado.",
  retiro: "Retiro registrado.",
  cerrada: "Caja cerrada. Este es su arqueo.",
};

export const PAYMENT_METHOD_NOTICE: Record<string, string> = {
  inicial: "Lista inicial creada.",
  creado: "Medio de pago creado.",
  editado: "Medio de pago renombrado.",
  desactivado: "Medio de pago desactivado.",
  reactivado: "Medio de pago reactivado.",
};

export function noticeMessage(
  notices: Record<string, string>,
  value: string | string[] | undefined,
): string | null {
  const key = Array.isArray(value) ? value[0] : value;
  return key && Object.hasOwn(notices, key) ? notices[key]! : null;
}

export function unexpectedErrorMessage(requestId: string): string {
  return `No pudimos guardar el cambio. Código: ${requestId}`;
}

// La diferencia de un arqueo, con su signo: «sobrante», «faltante» o «sin diferencia».
export function differenceText(
  difference: { sign: "positive" | "negative" | "zero"; amount: string },
  currency: string,
): string {
  if (difference.sign === "zero") return "Sin diferencia";
  const amount = formatMoney(difference.amount, currency);
  return difference.sign === "positive"
    ? `Sobrante de ${amount}`
    : `Faltante de ${amount}`;
}

// Las filas por moneda de la apertura y del cierre, como las escribió quien opera.

export type CurrencyRow = { currency: string; amount: string };

export type CurrencyRowsState =
  | { status: "idle" }
  | {
      status: "error";
      requestId: string;
      rows: CurrencyRow[];
      message: string;
      // Errores por fila, por su posición entre las enviadas (desde 1).
      rowErrors: Record<number, string>;
    };

const ROW_PROBLEM_TEXT: Record<CashRowIssue["problem"], string> = {
  required: "Completá este campo.",
  duplicate: "Esta moneda ya está en otra fila.",
  currency: "Elegí una moneda de la lista, con su código de tres letras.",
  invalid: "Escribí el monto con números, por ejemplo 1500 o 1.500,50.",
  separator:
    "Esta moneda no tiene decimales: escribí el monto sin punto ni coma.",
  decimals: "El monto tiene más decimales de los que admite la moneda.",
  too_large: "El monto es demasiado grande.",
  zero: "El monto tiene que ser mayor que cero.",
};

function rowErrors(issues: CashRowIssue[]): Record<number, string> {
  const errors: Record<number, string> = {};
  for (const issue of issues) {
    errors[issue.position] ??=
      `${issue.field === "currency" ? "Moneda" : "Monto"}: ${ROW_PROBLEM_TEXT[issue.problem]}`;
  }
  return errors;
}

type RowsRejection = { message: string; rowErrors: Record<number, string> };

function rowsRejection(
  result: Exclude<
    OpenCashSessionResult | CloseCashSessionResult | PreviewCashClosingResult,
    { ok: true }
  >,
): RowsRejection {
  // Sin reason, el id de la sesión no era válido.
  if (!("reason" in result)) {
    return { message: SESSION_NOT_FOUND_MESSAGE, rowErrors: {} };
  }
  switch (result.reason) {
    case "no_rows":
      return {
        message: "Cargá al menos una moneda, aunque su monto sea cero.",
        rowErrors: {},
      };
    case "too_many_rows":
      return { message: "Se aceptan hasta 10 monedas.", rowErrors: {} };
    case "missing":
      return {
        message: `Falta contar ${result.missing.join(", ")}: tuvo inicial o movimientos en esta sesión.`,
        rowErrors: {},
      };
    case "rows":
      return {
        message: "Revisá las filas marcadas.",
        rowErrors: rowErrors(result.issues),
      };
  }
}

export function openRejection(
  result: Exclude<OpenCashSessionResult, { ok: true }>,
): RowsRejection {
  switch (result.code) {
    case "FORBIDDEN":
      return { message: ADMIN_ONLY_MESSAGE, rowErrors: {} };
    case "VALIDATION_ERROR":
      return rowsRejection(result);
    case "BUSINESS_RULE_VIOLATION":
      return {
        message: `La caja ya está abierta, con la sesión ${result.session.displayNumber}.`,
        rowErrors: {},
      };
  }
}

type SessionStateRejection = Extract<
  Exclude<CloseCashSessionResult, { ok: true }>,
  { code: "BUSINESS_RULE_VIOLATION" }
>;

function sessionStateMessage(result: SessionStateRejection): string {
  return result.rule === "already_closed"
    ? `La sesión ${result.session.displayNumber} ya está cerrada.`
    : EXPECTED_CHANGED_MESSAGE;
}

// Lo esperado cambió entre la confirmación y el cierre: otro admin registró un movimiento
// (revisión independiente de la 21.2, R-5).
export const EXPECTED_CHANGED_MESSAGE =
  "Lo esperado cambió mientras confirmabas: hubo un movimiento nuevo. Revisá la diferencia otra vez.";

export function closeRejection(
  result: Exclude<
    CloseCashSessionResult | PreviewCashClosingResult,
    { ok: true }
  >,
): RowsRejection {
  switch (result.code) {
    case "FORBIDDEN":
      return { message: ADMIN_ONLY_MESSAGE, rowErrors: {} };
    case "NOT_FOUND":
      return { message: SESSION_NOT_FOUND_MESSAGE, rowErrors: {} };
    case "VALIDATION_ERROR":
      return rowsRejection(result);
    case "BUSINESS_RULE_VIOLATION":
      return { message: sessionStateMessage(result), rowErrors: {} };
  }
}

// El movimiento manual (brief-21.2, D-5).

export type MovementFormValues = {
  currency: string;
  amount: string;
  reason: string;
};

export type MovementFormState =
  | { status: "idle" }
  | {
      status: "error";
      requestId: string;
      values: MovementFormValues;
      message: string;
      fields: ("currency" | "amount" | "reason")[];
    };

const AMOUNT_TEXT: Record<string, string> = {
  ...ROW_PROBLEM_TEXT,
  limit: "Con este aporte, lo esperado pasaría el máximo que se puede guardar.",
};

export function movementRejection(
  result: Exclude<RecordCashMovementResult, { ok: true }>,
): {
  message: string;
  fields: ("currency" | "amount" | "reason")[];
} {
  switch (result.code) {
    case "FORBIDDEN":
      return { message: ADMIN_ONLY_MESSAGE, fields: [] };
    case "NOT_FOUND":
      return { message: SESSION_NOT_FOUND_MESSAGE, fields: [] };
    case "VALIDATION_ERROR": {
      if (!("fields" in result)) {
        return { message: SESSION_NOT_FOUND_MESSAGE, fields: [] };
      }
      const fields = result.fields.filter(
        (field): field is "currency" | "amount" | "reason" => field !== "kind",
      );
      const parts = [];
      if (fields.includes("currency")) {
        parts.push(`Moneda: ${ROW_PROBLEM_TEXT.currency}`);
      }
      if (fields.includes("amount")) {
        parts.push(
          `Monto: ${result.amount ? AMOUNT_TEXT[result.amount] : ROW_PROBLEM_TEXT.required}`,
        );
      }
      if (fields.includes("reason")) parts.push("Elegí un motivo de la lista.");
      return { message: parts.join(" ") || "Revisá los datos.", fields };
    }
    case "BUSINESS_RULE_VIOLATION":
      if (result.rule === "insufficient_cash") {
        return {
          message: `No alcanza: lo esperado en ${result.currency} es ${formatMoney(
            result.expected,
            result.currency,
          )}, y un retiro no puede dejarlo por debajo de cero.`,
          fields: ["amount"],
        };
      }
      return { message: sessionStateMessage(result), fields: [] };
  }
}

// Los medios de pago (brief-21.2, D-6).

export type PaymentMethodFormValues = { name: string; isCash: boolean };

export type PaymentMethodFormState =
  | { status: "idle" }
  | {
      status: "error";
      requestId: string;
      values: PaymentMethodFormValues;
      message: string;
      field: "name" | null;
    };

export type PaymentMethodChangeState =
  { status: "idle" } | { status: "error"; requestId: string; message: string };

export function paymentMethodRejection(
  result: Exclude<
    | CreatePaymentMethodResult
    | RenamePaymentMethodResult
    | PaymentMethodActiveResult
    | { ok: false; code: "BUSINESS_RULE_VIOLATION"; rule: "list_not_empty" }
    | { ok: false; code: "FORBIDDEN" },
    { ok: true }
  >,
): { message: string; field: "name" | null } {
  switch (result.code) {
    case "FORBIDDEN":
      return {
        message: "Solo un administrador puede editar los medios de pago.",
        field: null,
      };
    case "NOT_FOUND":
      return { message: "Este medio de pago no existe.", field: null };
    case "VALIDATION_ERROR":
      return "fields" in result
        ? {
            message: "Escribí un nombre de hasta 40 caracteres.",
            field: "name",
          }
        : { message: "Este medio de pago no existe.", field: null };
    case "BUSINESS_RULE_VIOLATION":
      switch (result.rule) {
        case "duplicate_name":
          return {
            message:
              "Ya hay un medio de pago con ese nombre, activo o inactivo. Si está inactivo, reactivalo.",
            field: "name",
          };
        case "limit_reached":
          return {
            message:
              "Se aceptan hasta 20 medios de pago activos. Desactivá uno que no uses.",
            field: null,
          };
        case "list_not_empty":
          return {
            message: "La lista inicial se crea solo con la lista vacía.",
            field: null,
          };
      }
  }
}

// El cierre, en dos pasos (brief-21.2, D-10): lo contado y, antes de cerrar, la diferencia de cada
// moneda con lo esperado.
export type CloseFormState =
  | CurrencyRowsState
  | {
      status: "review";
      requestId: string;
      rows: CurrencyRow[];
      preview: CashClosingPreviewRow[];
      // Si se volvió a revisar porque lo esperado cambió (R-5).
      message: string | null;
    }
  // «Corregir lo contado» desde la confirmación: vuelve a las filas, con lo escrito.
  | { status: "edit"; requestId: string; rows: CurrencyRow[] };

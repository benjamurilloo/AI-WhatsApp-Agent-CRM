"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  closeCashSession,
  createInitialPaymentMethods,
  createPaymentMethod,
  deactivatePaymentMethod,
  openCashSession,
  previewCashClosing,
  reactivatePaymentMethod,
  recordCashMovement,
  renamePaymentMethod,
  type PaymentMethodActiveResult,
} from "@/modules/cash";
import type { AuthContext } from "@/modules/organizations";
import { requireSession } from "@/app/_auth/session";
import { logEvent, newRequestId } from "@/shared/log";
import {
  closeRejection,
  EXPECTED_CHANGED_MESSAGE,
  movementRejection,
  openRejection,
  paymentMethodRejection,
  unexpectedErrorMessage,
  type CloseFormState,
  type CurrencyRow,
  type CurrencyRowsState,
  type MovementFormState,
  type MovementFormValues,
  type PaymentMethodChangeState,
  type PaymentMethodFormState,
  type PaymentMethodFormValues,
} from "./messages";
import { getOrganizationTimezone } from "@/modules/organizations";
import { referenceText } from "./exchange";

// Server Actions de la caja y de los medios de pago (brief-21.2, D-10). La sesión se verifica acá;
// el rol y la organización, en cash. El log lleva actor, organización, código y duración, nunca
// montos, monedas ni nombres.

type LogCode = Parameters<typeof logEvent>[0]["code"];

function logger(context: AuthContext, route: string) {
  const requestId = newRequestId();
  const started = performance.now();
  const log = (code: LogCode, error?: unknown) =>
    logEvent({
      level: code === "OK" ? "info" : error ? "error" : "warn",
      requestId,
      route,
      code,
      userId: context.userId,
      organizationId: context.organizationId,
      durationMs: performance.now() - started,
      error,
    });
  return { requestId, log };
}

// Las filas por moneda llegan como campos repetidos, en orden; una fila vacía del todo no se envía.
function readRows(formData: FormData): CurrencyRow[] {
  const all = (name: string) =>
    formData.getAll(name).map((value) => String(value).slice(0, 40));
  const currencies = all("currency");
  const amounts = all("amount");
  const rows: CurrencyRow[] = [];
  for (let index = 0; index < currencies.length; index++) {
    const row = {
      currency: (currencies[index] ?? "").trim().toUpperCase(),
      amount: (amounts[index] ?? "").trim(),
    };
    if (row.currency || row.amount) rows.push(row);
  }
  return rows;
}

// Lo esperado de la confirmación del cierre, en campos repetidos como las filas.
function readExpected(formData: FormData): CurrencyRow[] {
  const currencies = formData
    .getAll("expectedCurrency")
    .map((value) => String(value).slice(0, 40));
  const amounts = formData
    .getAll("expectedAmount")
    .map((value) => String(value).slice(0, 40));
  return currencies.map((currency, index) => ({
    currency,
    amount: amounts[index] ?? "",
  }));
}

export async function openCashSessionAction(
  _previous: CurrencyRowsState,
  formData: FormData,
): Promise<CurrencyRowsState> {
  // redirect lanza: la sesión se resuelve fuera del try.
  const context = await requireSession();
  const { requestId, log } = logger(context, "caja.abrir");
  const rows = readRows(formData);

  try {
    const result = await openCashSession(context, { rows });
    if (!result.ok) {
      log(result.code);
      return { status: "error", requestId, rows, ...openRejection(result) };
    }
    log("OK");
  } catch (error) {
    log("INTERNAL", error);
    return {
      status: "error",
      requestId,
      rows,
      message: unexpectedErrorMessage(requestId),
      rowErrors: {},
    };
  }
  revalidatePath("/caja");
  redirect("/caja?aviso=abierta");
}

export async function recordCashMovementAction(
  _previous: MovementFormState,
  formData: FormData,
): Promise<MovementFormState> {
  const context = await requireSession();
  const { requestId, log } = logger(context, "caja.movimiento");
  const sessionId = String(formData.get("sessionId") ?? "").slice(0, 64);
  const kind = String(formData.get("kind") ?? "").slice(0, 32);
  const values: MovementFormValues = {
    currency: String(formData.get("currency") ?? "")
      .trim()
      .toUpperCase()
      .slice(0, 40),
    amount: String(formData.get("amount") ?? "")
      .trim()
      .slice(0, 40),
    reason: String(formData.get("reason") ?? "").slice(0, 32),
  };

  try {
    const result = await recordCashMovement(context, {
      sessionId,
      kind,
      ...values,
    });
    if (!result.ok) {
      log(result.code);
      return {
        status: "error",
        requestId,
        values,
        ...movementRejection(result),
      };
    }
    log("OK");
  } catch (error) {
    log("INTERNAL", error);
    return {
      status: "error",
      requestId,
      values,
      message: unexpectedErrorMessage(requestId),
      fields: [],
    };
  }
  revalidatePath("/caja");
  redirect(`/caja?aviso=${kind === "withdrawal" ? "retiro" : "aporte"}`);
}

// El cierre en dos pasos (D-10): sin «confirm», la vista previa con la diferencia; con él, el
// cierre, que vuelve a calcular todo con el bloqueo tomado.
export async function closeCashSessionAction(
  _previous: CloseFormState,
  formData: FormData,
): Promise<CloseFormState> {
  const context = await requireSession();
  const confirmed = formData.get("confirm") === "1";
  const { requestId, log } = logger(
    context,
    confirmed ? "caja.cerrar" : "caja.revisar-cierre",
  );
  const sessionId = String(formData.get("sessionId") ?? "").slice(0, 64);
  const rows = readRows(formData);
  if (formData.get("edit") === "1") return { status: "edit", requestId, rows };

  // La vista previa, para el primer paso y para volver a mostrar la diferencia si cambió.
  const review = async (message: string | null): Promise<CloseFormState> => {
    const preview = await previewCashClosing(context, { sessionId, rows });
    if (!preview.ok) {
      log(preview.code);
      return { status: "error", requestId, rows, ...closeRejection(preview) };
    }
    log("OK");
    const reference = preview.reference;
    return {
      status: "review",
      requestId,
      rows,
      preview: preview.rows,
      reference: reference
        ? {
            ...referenceText(reference, await getOrganizationTimezone(context)),
            stale: reference.stale,
          }
        : null,
      message,
    };
  };

  let destination: string;
  try {
    if (!confirmed) return await review(null);
    // Lo esperado que mostró la confirmación: el cierre no guarda otro sin avisar (R-5).
    const confirmedExpected = readExpected(formData);
    const result = await closeCashSession(context, {
      sessionId,
      rows,
      confirmedExpected,
    });
    if (!result.ok) {
      if (
        result.code === "BUSINESS_RULE_VIOLATION" &&
        result.rule === "expected_changed"
      ) {
        log(result.code);
        return await review(EXPECTED_CHANGED_MESSAGE);
      }
      log(result.code);
      return { status: "error", requestId, rows, ...closeRejection(result) };
    }
    log("OK");
    destination = `/caja/sesiones/${result.session.id}?aviso=cerrada`;
  } catch (error) {
    log("INTERNAL", error);
    return {
      status: "error",
      requestId,
      rows,
      message: unexpectedErrorMessage(requestId),
      rowErrors: {},
    };
  }
  revalidatePath("/caja");
  redirect(destination);
}

// Los medios de pago (D-6).

const METHODS = "/caja/medios-de-pago";

function paymentMethodValues(formData: FormData): PaymentMethodFormValues {
  return {
    name: String(formData.get("name") ?? "").slice(0, 200),
    isCash: formData.get("isCash") === "1",
  };
}

export async function createPaymentMethodAction(
  _previous: PaymentMethodFormState,
  formData: FormData,
): Promise<PaymentMethodFormState> {
  const context = await requireSession();
  const { requestId, log } = logger(context, "medios-de-pago.crear");
  const values = paymentMethodValues(formData);
  try {
    const result = await createPaymentMethod(context, values);
    if (!result.ok) {
      log(result.code);
      return {
        status: "error",
        requestId,
        values,
        ...paymentMethodRejection(result),
      };
    }
    log("OK");
  } catch (error) {
    log("INTERNAL", error);
    return {
      status: "error",
      requestId,
      values,
      message: unexpectedErrorMessage(requestId),
      field: null,
    };
  }
  revalidatePath(METHODS);
  redirect(`${METHODS}?aviso=creado`);
}

export async function renamePaymentMethodAction(
  _previous: PaymentMethodFormState,
  formData: FormData,
): Promise<PaymentMethodFormState> {
  const context = await requireSession();
  const { requestId, log } = logger(context, "medios-de-pago.editar");
  const paymentMethodId = String(formData.get("paymentMethodId") ?? "").slice(
    0,
    64,
  );
  const values = paymentMethodValues(formData);
  let changed: boolean;
  try {
    const result = await renamePaymentMethod(context, paymentMethodId, values);
    if (!result.ok) {
      log(result.code);
      return {
        status: "error",
        requestId,
        values,
        ...paymentMethodRejection(result),
      };
    }
    log("OK");
    changed = result.changed;
  } catch (error) {
    log("INTERNAL", error);
    return {
      status: "error",
      requestId,
      values,
      message: unexpectedErrorMessage(requestId),
      field: null,
    };
  }
  revalidatePath(METHODS);
  // Sin diferencias no hay aviso: nada cambió.
  redirect(changed ? `${METHODS}?aviso=editado` : METHODS);
}

type ChangeResult =
  | { ok: true; changed: boolean }
  | Exclude<PaymentMethodActiveResult, { ok: true }>
  | { ok: false; code: "BUSINESS_RULE_VIOLATION"; rule: "list_not_empty" }
  | { ok: false; code: "FORBIDDEN" };

// La lista inicial, desactivar y reactivar: sin campos, con el mensaje del rechazo.
async function runPaymentMethodChange(
  route: string,
  notice: string,
  operation: (context: AuthContext) => Promise<ChangeResult>,
): Promise<PaymentMethodChangeState> {
  const context = await requireSession();
  const { requestId, log } = logger(context, route);
  let changed: boolean;
  try {
    const result = await operation(context);
    if (!result.ok) {
      log(result.code);
      return {
        status: "error",
        requestId,
        message: paymentMethodRejection(result).message,
      };
    }
    log("OK");
    changed = result.changed;
  } catch (error) {
    log("INTERNAL", error);
    return {
      status: "error",
      requestId,
      message: unexpectedErrorMessage(requestId),
    };
  }
  revalidatePath(METHODS);
  redirect(changed ? `${METHODS}?aviso=${notice}` : METHODS);
}

// No lee el formulario: useActionState la llama igual con el estado y los datos, que ignora.
export async function createInitialPaymentMethodsAction(): Promise<PaymentMethodChangeState> {
  return runPaymentMethodChange(
    "medios-de-pago.inicial",
    "inicial",
    async (context) => {
      const result = await createInitialPaymentMethods(context);
      return result.ok ? { ok: true, changed: true } : result;
    },
  );
}

export async function deactivatePaymentMethodAction(
  _previous: PaymentMethodChangeState,
  formData: FormData,
): Promise<PaymentMethodChangeState> {
  const paymentMethodId = String(formData.get("paymentMethodId") ?? "").slice(
    0,
    64,
  );
  return runPaymentMethodChange(
    "medios-de-pago.desactivar",
    "desactivado",
    (context) => deactivatePaymentMethod(context, paymentMethodId),
  );
}

export async function reactivatePaymentMethodAction(
  _previous: PaymentMethodChangeState,
  formData: FormData,
): Promise<PaymentMethodChangeState> {
  const paymentMethodId = String(formData.get("paymentMethodId") ?? "").slice(
    0,
    64,
  );
  return runPaymentMethodChange(
    "medios-de-pago.reactivar",
    "reactivado",
    (context) => reactivatePaymentMethod(context, paymentMethodId),
  );
}

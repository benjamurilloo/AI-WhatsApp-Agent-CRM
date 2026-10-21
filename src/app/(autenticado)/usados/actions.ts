"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  createTradeInPayment,
  voidTradeIn,
  voidTradeInPayment,
} from "@/modules/cash";
import { suggestClients } from "@/modules/crm";
import type { AuthContext } from "@/modules/organizations";
import {
  createChecklistItem,
  createTradeIn,
  moveChecklistItem,
  setChecklistItemActive,
  updateChecklistItem,
  type ChecklistItemWriteResult,
  type MoveDirection,
} from "@/modules/tradeins";
import { requireSession } from "@/app/_auth/session";
import { logEvent, newRequestId } from "@/shared/log";
import {
  changeMessage,
  checklistItemRejection,
  createTradeInRejection,
  paymentUnexpectedErrorMessage,
  tradeInPaymentRejection,
  unexpectedErrorMessage,
  voidTradeInMessage,
  voidTradeInPaymentMessage,
  type ChangeState,
  type FormState,
  type PaymentFormState,
  type PaymentFormValues,
} from "./messages";

// Server Actions de los usados (brief-29.7, D-7). Next.js compara Origin con Host; la sesión se
// verifica acá, y el rol, la organización y la capacidad, en tradeins y en cash. El log lleva actor,
// organización, código y duración, nunca el cliente, el IMEI ni el valor. Desde la 29.7.2, el pago de un
// usado comprado y su anulación (brief-29.7.2, D-6), que escribe cash: tampoco el medio ni los montos.

const TRADE_INS = "/usados";
const CHECKLIST = "/usados/checklist";

type LogCode = Parameters<typeof logEvent>[0]["code"];

function logger(route: string, context: AuthContext) {
  const requestId = newRequestId();
  const started = performance.now();
  return {
    requestId,
    log(code: LogCode, error?: unknown) {
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
    },
  };
}

function text(formData: FormData, name: string, max = 200): string {
  return String(formData.get(name) ?? "").slice(0, max);
}

// Sin JavaScript, el buscador del cliente es un campo de texto con su nombre exacto, como en el alta de
// una orden de servicio.
async function resolveClient(
  context: AuthContext,
  clientId: string,
  clientText: string,
): Promise<string> {
  if (clientId || !clientText) return clientId;
  const found = await suggestClients(context, clientText);
  const exact = found.ok
    ? found.clients.filter(
        (client) => client.name.toLowerCase() === clientText.toLowerCase(),
      )
    : [];
  return exact.length === 1 ? exact[0]!.id : "";
}

// La recepción (D-4): los puntos del checklist llegan como casillas «passed» con el id del punto.
export async function createTradeInAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const context = await requireSession();
  const { requestId, log } = logger("usados.recibir", context);
  const values = {
    clientId: text(formData, "clientId", 64).trim(),
    clientText: text(formData, "clientText", 200).trim(),
    productId: text(formData, "productId", 64),
    serial: text(formData, "serial", 64),
    batteryHealth: text(formData, "batteryHealth", 8),
    gradeId: text(formData, "gradeId", 64),
    value: text(formData, "value", 40),
    currency: text(formData, "currency", 3),
    destination: text(formData, "destination", 20),
  };
  const passed = formData
    .getAll("passed")
    .slice(0, 100)
    .map((value) => String(value).slice(0, 64));
  let destination: string;
  try {
    const clientId = await resolveClient(
      context,
      values.clientId,
      values.clientText,
    );
    const result = await createTradeIn(context, {
      ...values,
      clientId,
      passed,
    });
    if (!result.ok) {
      log(result.code);
      return {
        status: "error",
        requestId,
        values,
        passed,
        ...createTradeInRejection(result, requestId),
      };
    }
    log("OK");
    revalidatePath(TRADE_INS);
    // La unidad nace en el producto (D-2).
    revalidatePath("/productos", "layout");
    destination = `${TRADE_INS}/${result.tradeIn.id}?aviso=usado-recibido`;
  } catch (error) {
    log("INTERNAL", error);
    return {
      status: "error",
      requestId,
      values,
      passed,
      field: null,
      message: unexpectedErrorMessage(requestId),
    };
  }
  redirect(destination);
}

// La anulación (D-5), que orquesta cash.
export async function voidTradeInAction(
  _previous: ChangeState,
  formData: FormData,
): Promise<ChangeState> {
  const context = await requireSession();
  const { requestId, log } = logger("usados.anular", context);
  const tradeInId = text(formData, "tradeInId", 64);
  const reason = text(formData, "reason", 40);
  let destination: string;
  try {
    const result = await voidTradeIn(context, { tradeInId, reason });
    if (!result.ok) {
      log(result.code);
      return {
        status: "error",
        requestId,
        message: voidTradeInMessage(result, requestId),
      };
    }
    log("OK");
    revalidatePath(TRADE_INS);
    revalidatePath("/productos", "layout");
    destination = `${TRADE_INS}/${result.tradeIn.id}?aviso=usado-anulado`;
  } catch (error) {
    log("INTERNAL", error);
    return {
      status: "error",
      requestId,
      message: unexpectedErrorMessage(requestId),
    };
  }
  redirect(destination);
}

// El pago de un usado comprado (brief-29.7.2, D-3 y D-6): el usado viaja en un campo oculto.
export async function createTradeInPaymentAction(
  _previous: PaymentFormState,
  formData: FormData,
): Promise<PaymentFormState> {
  const context = await requireSession();
  const { requestId, log } = logger("usados.pagar", context);
  const tradeInId = text(formData, "tradeInId", 64);
  const values: PaymentFormValues = {
    paymentMethodId: text(formData, "paymentMethodId", 64),
    amount: text(formData, "amount", 40).trim(),
    // La moneda que sale y la cotización acordada (ADR 0025, punto 5).
    tenderedCurrency: text(formData, "tenderedCurrency", 8),
    exchangeRate: text(formData, "exchangeRate", 40).trim(),
  };
  // La vigente que mostró el formulario: si cambió, el pago se rechaza.
  const exchangeRateId = text(formData, "exchangeRateId", 64);
  let paymentId: string;
  try {
    const result = await createTradeInPayment(context, {
      tradeInId,
      ...values,
      exchangeRateId,
    });
    if (!result.ok) {
      log(result.code);
      if ("rule" in result && result.rule === "exchange_rate_changed") {
        revalidatePath(`${TRADE_INS}/${tradeInId}/pago`);
      }
      return {
        status: "error",
        requestId,
        values,
        ...tradeInPaymentRejection(result),
      };
    }
    log("OK");
    paymentId = result.payment.id;
  } catch (error) {
    log("INTERNAL", error);
    return {
      status: "error",
      requestId,
      values,
      message: paymentUnexpectedErrorMessage(requestId),
      fields: [],
      openCash: false,
    };
  }
  revalidatePath(TRADE_INS);
  revalidatePath(`${TRADE_INS}/${tradeInId}`);
  revalidatePath("/caja");
  redirect(`${TRADE_INS}/pagos/${paymentId}?aviso=pago-registrado`);
}

export async function voidTradeInPaymentAction(
  _previous: ChangeState,
  formData: FormData,
): Promise<ChangeState> {
  const context = await requireSession();
  const { requestId, log } = logger("usados.pagos.anular", context);
  const paymentId = text(formData, "paymentId", 64);
  const reason = text(formData, "reason", 40);
  try {
    const result = await voidTradeInPayment(context, { paymentId, reason });
    if (!result.ok) {
      log(result.code);
      return {
        status: "error",
        requestId,
        message: voidTradeInPaymentMessage(result, requestId),
      };
    }
    log("OK");
  } catch (error) {
    log("INTERNAL", error);
    return {
      status: "error",
      requestId,
      message: unexpectedErrorMessage(requestId),
    };
  }
  revalidatePath(TRADE_INS, "layout");
  revalidatePath("/caja");
  redirect(`${TRADE_INS}/pagos/${paymentId}?aviso=pago-anulado`);
}

// El checklist (D-3).

async function runItemForm(
  route: string,
  formData: FormData,
  save: (
    context: AuthContext,
    input: { name: string; isMandatory: boolean },
  ) => Promise<ChecklistItemWriteResult>,
  notice: string,
): Promise<FormState> {
  const context = await requireSession();
  const { requestId, log } = logger(route, context);
  const values = {
    name: text(formData, "name", 120),
    isMandatory: text(formData, "isMandatory", 1),
  };
  let destination: string;
  try {
    const result = await save(context, {
      name: values.name,
      isMandatory: values.isMandatory === "1",
    });
    if (!result.ok) {
      log(result.code);
      return {
        status: "error",
        requestId,
        values,
        ...checklistItemRejection(result, requestId),
      };
    }
    log("OK");
    revalidatePath(CHECKLIST);
    destination = result.changed ? `${CHECKLIST}?aviso=${notice}` : CHECKLIST;
  } catch (error) {
    log("INTERNAL", error);
    return {
      status: "error",
      requestId,
      values,
      field: null,
      message: unexpectedErrorMessage(requestId),
    };
  }
  redirect(destination);
}

export async function createChecklistItemAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  return runItemForm(
    "usados.checklist.crear",
    formData,
    (context, input) => createChecklistItem(context, input),
    "punto-creado",
  );
}

export async function updateChecklistItemAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const itemId = text(formData, "itemId", 64);
  return runItemForm(
    "usados.checklist.editar",
    formData,
    (context, input) => updateChecklistItem(context, itemId, input),
    "punto-guardado",
  );
}

async function runItemChange(
  route: string,
  save: (context: AuthContext) => Promise<ChecklistItemWriteResult>,
  notice: string | null,
): Promise<ChangeState> {
  const context = await requireSession();
  const { requestId, log } = logger(route, context);
  let destination: string;
  try {
    const result = await save(context);
    if (!result.ok) {
      log(result.code);
      return {
        status: "error",
        requestId,
        message: changeMessage(result.code, requestId),
      };
    }
    log("OK");
    revalidatePath(CHECKLIST);
    destination =
      result.changed && notice ? `${CHECKLIST}?aviso=${notice}` : CHECKLIST;
  } catch (error) {
    log("INTERNAL", error);
    return {
      status: "error",
      requestId,
      message: unexpectedErrorMessage(requestId),
    };
  }
  redirect(destination);
}

export async function setChecklistItemActiveAction(
  _previous: ChangeState,
  formData: FormData,
): Promise<ChangeState> {
  const itemId = text(formData, "itemId", 64);
  const isActive = text(formData, "isActive", 1) === "1";
  return runItemChange(
    "usados.checklist.activo",
    (context) => setChecklistItemActive(context, itemId, isActive),
    isActive ? "punto-reactivado" : "punto-desactivado",
  );
}

export async function moveChecklistItemAction(
  _previous: ChangeState,
  formData: FormData,
): Promise<ChangeState> {
  const itemId = text(formData, "itemId", 64);
  const direction = text(formData, "direction", 8);
  return runItemChange(
    "usados.checklist.mover",
    // tradeins valida la dirección.
    (context) => moveChecklistItem(context, itemId, direction as MoveDirection),
    null,
  );
}

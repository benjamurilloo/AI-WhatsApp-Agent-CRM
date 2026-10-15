"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createRefund, voidRefund } from "@/modules/cash";
import { requireSession } from "@/app/_auth/session";
import { logEvent, newRequestId } from "@/shared/log";
import {
  refundRejection,
  refundVoidRejection,
  unexpectedRefundMessage,
  unexpectedVoidMessage,
  type RefundFormState,
  type RefundFormValues,
  type VoidFormState,
} from "./messages";

// Server Actions de la devolución y de su anulación (brief-21.5, D-7 y D-9). La sesión se verifica
// acá; el rol y la organización, en cash. El log lleva actor, organización, código y duración, nunca
// montos, medios ni nombres.

type LogCode = Parameters<typeof logEvent>[0]["code"];

function logger(
  context: { userId: string; organizationId: string },
  route: string,
) {
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

async function refund(
  target: "account" | "sale",
  formData: FormData,
): Promise<RefundFormState> {
  const context = await requireSession();
  const { requestId, log } = logger(
    context,
    target === "account" ? "clientes.devolver" : "ventas.devolver",
  );
  const targetId = String(
    formData.get(target === "account" ? "clientId" : "saleId") ?? "",
  ).slice(0, 64);
  const values: RefundFormValues = {
    currency: String(formData.get("currency") ?? "").slice(0, 8),
    paymentMethodId: String(formData.get("paymentMethodId") ?? "").slice(0, 64),
    amount: String(formData.get("amount") ?? "")
      .trim()
      .slice(0, 40),
  };

  let refundId: string;
  try {
    const result = await createRefund(context, {
      target,
      ...(target === "account"
        ? { clientId: targetId, currency: values.currency }
        : { saleId: targetId }),
      paymentMethodId: values.paymentMethodId,
      amount: values.amount,
    });
    if (!result.ok) {
      log(result.code);
      return { status: "error", requestId, values, ...refundRejection(result) };
    }
    log("OK");
    refundId = result.refund.id;
  } catch (error) {
    log("INTERNAL", error);
    return {
      status: "error",
      requestId,
      values,
      message: unexpectedRefundMessage(requestId),
      fields: [],
      openCash: false,
    };
  }
  // Lo devuelto cambia lo que está a favor o a devolver, y en efectivo, la caja.
  revalidatePath("/ventas", "layout");
  revalidatePath("/pedidos", "layout");
  revalidatePath("/clientes", "layout");
  revalidatePath("/caja", "layout");
  redirect(`/devoluciones/${refundId}?registrada=1`);
}

// Desde lo que está a favor de la cuenta de un cliente.
export async function createAccountRefundAction(
  _previous: RefundFormState,
  formData: FormData,
): Promise<RefundFormState> {
  return refund("account", formData);
}

// Desde lo que queda a devolver de una venta sin cliente anulada.
export async function createSaleRefundAction(
  _previous: RefundFormState,
  formData: FormData,
): Promise<RefundFormState> {
  return refund("sale", formData);
}

export async function voidRefundAction(
  _previous: VoidFormState,
  formData: FormData,
): Promise<VoidFormState> {
  const context = await requireSession();
  const { requestId, log } = logger(context, "devoluciones.anular");
  const refundId = String(formData.get("refundId") ?? "").slice(0, 64);
  const reason = String(formData.get("reason") ?? "").slice(0, 40);

  try {
    const result = await voidRefund(context, { refundId, reason });
    if (!result.ok) {
      log(result.code);
      return { status: "error", requestId, ...refundVoidRejection(result) };
    }
    log("OK");
  } catch (error) {
    log("INTERNAL", error);
    return {
      status: "error",
      requestId,
      message: unexpectedVoidMessage(requestId),
      existing: null,
    };
  }
  revalidatePath("/ventas", "layout");
  revalidatePath("/pedidos", "layout");
  revalidatePath("/clientes", "layout");
  revalidatePath("/caja", "layout");
  redirect(`/devoluciones/${refundId}?anulada=1`);
}

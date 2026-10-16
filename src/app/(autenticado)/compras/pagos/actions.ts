"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createSupplierPayment, voidSupplierPayment } from "@/modules/cash";
import type { AuthContext } from "@/modules/organizations";
import { requireSession } from "@/app/_auth/session";
import { logEvent, newRequestId } from "@/shared/log";
import {
  paymentRejection,
  unexpectedErrorMessage,
  voidPaymentRejection,
  voidUnexpectedErrorMessage,
  type PaymentFormState,
  type PaymentFormValues,
  type VoidPaymentState,
} from "./messages";

// Server Actions de los pagos a proveedores (brief-22.6, D-7, D-8 y D-13). La sesión se verifica acá;
// el rol y la organización, en cash, que solo deja a un admin. El log lleva actor, organización, código
// y duración, nunca el proveedor, el medio ni los montos (SecurityModel; ADR 0023, punto 14).

type LogCode = Parameters<typeof logEvent>[0]["code"];

const LIST_PATH = "/compras/pagos";

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

// El pago, contra una recepción o a cuenta: el destino viaja en campos ocultos.
export async function createSupplierPaymentAction(
  _previous: PaymentFormState,
  formData: FormData,
): Promise<PaymentFormState> {
  const context = await requireSession();
  const { requestId, log } = logger("compras.pagos.registrar", context);
  const target = String(formData.get("target") ?? "").slice(0, 20);
  const goodsReceiptId = String(formData.get("goodsReceiptId") ?? "").slice(
    0,
    64,
  );
  const supplierId = String(formData.get("supplierId") ?? "").slice(0, 64);
  const values: PaymentFormValues = {
    paymentMethodId: String(formData.get("paymentMethodId") ?? "").slice(0, 64),
    amount: String(formData.get("amount") ?? "")
      .trim()
      .slice(0, 40),
    currency: String(formData.get("currency") ?? "")
      .trim()
      .slice(0, 8),
  };

  let paymentId: string;
  try {
    const result = await createSupplierPayment(context, {
      target,
      goodsReceiptId,
      supplierId,
      currency: values.currency,
      paymentMethodId: values.paymentMethodId,
      amount: values.amount,
    });
    if (!result.ok) {
      log(result.code);
      return {
        status: "error",
        requestId,
        values,
        ...paymentRejection(result),
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
      message: unexpectedErrorMessage(requestId),
      fields: [],
      openCash: false,
    };
  }
  revalidatePath(LIST_PATH);
  if (target === "goods_receipt") {
    revalidatePath(`/compras/recepciones/${goodsReceiptId}`);
  } else {
    revalidatePath(`/compras/proveedores/${supplierId}`);
  }
  revalidatePath("/caja");
  redirect(`${LIST_PATH}/${paymentId}?aviso=creado`);
}

export async function voidSupplierPaymentAction(
  _previous: VoidPaymentState,
  formData: FormData,
): Promise<VoidPaymentState> {
  const context = await requireSession();
  const { requestId, log } = logger("compras.pagos.anular", context);
  const paymentId = String(formData.get("paymentId") ?? "").slice(0, 64);
  const reason = String(formData.get("reason") ?? "").slice(0, 64);

  try {
    const result = await voidSupplierPayment(context, { paymentId, reason });
    if (!result.ok) {
      log(result.code);
      return { status: "error", requestId, ...voidPaymentRejection(result) };
    }
    log("OK");
  } catch (error) {
    log("INTERNAL", error);
    return {
      status: "error",
      requestId,
      message: voidUnexpectedErrorMessage(requestId),
      existing: null,
    };
  }
  revalidatePath(LIST_PATH);
  revalidatePath(`${LIST_PATH}/${paymentId}`);
  revalidatePath("/compras/recepciones");
  revalidatePath("/caja");
  redirect(`${LIST_PATH}/${paymentId}?aviso=anulado`);
}

"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createOrderReceipt } from "@/modules/cash";
import { requireSession } from "@/app/_auth/session";
import { logEvent, newRequestId } from "@/shared/log";
import type {
  ReceiptFormState,
  ReceiptFormValues,
} from "@/app/(autenticado)/ventas/[saleId]/cobrar/messages";
import {
  depositUnexpectedErrorMessage,
  orderReceiptRejection,
} from "./messages";

// Server Action de la seña (brief-21.4, D-4 y D-8). La sesión se verifica acá; el rol y la
// organización, en cash. El log lleva actor, organización, código y duración, nunca montos, medios
// ni nombres.

type LogCode = Parameters<typeof logEvent>[0]["code"];

// El rechazo de un cobro porque la cotización vigente cambió mientras se cargaba (brief-29.4, P-4).
function isRateChange(result: { code: string }): boolean {
  return "rule" in result && result.rule === "exchange_rate_changed";
}

export async function createOrderReceiptAction(
  _previous: ReceiptFormState,
  formData: FormData,
): Promise<ReceiptFormState> {
  const context = await requireSession();
  const requestId = newRequestId();
  const started = performance.now();
  const log = (code: LogCode, error?: unknown) =>
    logEvent({
      level: code === "OK" ? "info" : error ? "error" : "warn",
      requestId,
      route: "pedidos.senar",
      code,
      userId: context.userId,
      organizationId: context.organizationId,
      durationMs: performance.now() - started,
      error,
    });
  const orderId = String(formData.get("orderId") ?? "").slice(0, 64);
  const values: ReceiptFormValues = {
    paymentMethodId: String(formData.get("paymentMethodId") ?? "").slice(0, 64),
    amount: String(formData.get("amount") ?? "")
      .trim()
      .slice(0, 40),
    // La moneda que entra y la cotización acordada (brief-29.4, D-6).
    tenderedCurrency: String(formData.get("tenderedCurrency") ?? "").slice(
      0,
      8,
    ),
    exchangeRate: String(formData.get("exchangeRate") ?? "")
      .trim()
      .slice(0, 40),
  };
  // La vigente que mostró el formulario: si cambió, el cobro se rechaza.
  const exchangeRateId = String(formData.get("exchangeRateId") ?? "").slice(
    0,
    64,
  );

  let receiptId: string;
  try {
    const result = await createOrderReceipt(context, {
      orderId,
      ...values,
      exchangeRateId,
    });
    if (!result.ok) {
      log(result.code);
      // Si la vigente cambió mientras se cargaba, la página se vuelve a leer: el formulario muestra la
      // nueva equivalencia y manda su id (revisión independiente de la 29.4, R1-3).
      if (isRateChange(result)) revalidatePath(`/pedidos/${orderId}/senar`);
      return {
        status: "error",
        requestId,
        values,
        ...orderReceiptRejection(result),
      };
    }
    log("OK");
    receiptId = result.receipt.id;
  } catch (error) {
    log("INTERNAL", error);
    return {
      status: "error",
      requestId,
      values,
      message: depositUnexpectedErrorMessage(requestId),
      fields: [],
      openCash: false,
    };
  }
  revalidatePath(`/pedidos/${orderId}`);
  revalidatePath("/caja");
  redirect(`/pedidos/${orderId}?sena=${receiptId}`);
}

"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createSaleReceipt } from "@/modules/cash";
import { requireSession } from "@/app/_auth/session";
import { logEvent, newRequestId } from "@/shared/log";
import {
  receiptRejection,
  unexpectedErrorMessage,
  type ReceiptFormState,
  type ReceiptFormValues,
} from "./messages";

// Server Action del cobro de una venta (brief-21.3, D-3 y D-8). La sesión se verifica acá; el rol y
// la organización, en cash. El log lleva actor, organización, código y duración, nunca montos,
// medios ni nombres.

type LogCode = Parameters<typeof logEvent>[0]["code"];

export async function createSaleReceiptAction(
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
      route: "ventas.cobrar",
      code,
      userId: context.userId,
      organizationId: context.organizationId,
      durationMs: performance.now() - started,
      error,
    });
  const saleId = String(formData.get("saleId") ?? "").slice(0, 64);
  const values: ReceiptFormValues = {
    paymentMethodId: String(formData.get("paymentMethodId") ?? "").slice(0, 64),
    amount: String(formData.get("amount") ?? "")
      .trim()
      .slice(0, 40),
  };

  let receiptId: string;
  try {
    const result = await createSaleReceipt(context, { saleId, ...values });
    if (!result.ok) {
      log(result.code);
      return {
        status: "error",
        requestId,
        values,
        ...receiptRejection(result),
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
      message: unexpectedErrorMessage(requestId),
      fields: [],
      openCash: false,
    };
  }
  revalidatePath(`/ventas/${saleId}`);
  revalidatePath("/caja");
  redirect(`/ventas/${saleId}?cobro=${receiptId}`);
}

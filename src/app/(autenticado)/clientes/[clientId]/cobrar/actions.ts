"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  createAccountReceipt,
  listPaymentMethods,
  previewAccountReceipt,
} from "@/modules/cash";
import { requireSession } from "@/app/_auth/session";
import { logEvent, newRequestId } from "@/shared/log";
import {
  accountReceiptRejection,
  unexpectedAccountReceiptMessage,
  type AccountReceiptFormState,
  type AccountReceiptFormValues,
} from "./messages";

// Server Action del cobro a cuenta (brief-21.6, D-2 y D-5), en dos pasos: «preview» calcula con la
// regla a qué ventas va y cuánto queda a favor, sin escribir; «confirm» registra con los mismos datos,
// que cash vuelve a leer con el bloqueo tomado; «edit» vuelve a los datos. La sesión se verifica acá;
// el rol y la organización, en cash. El log lleva actor, organización, código y duración, nunca
// montos, medios ni nombres.

type LogCode = Parameters<typeof logEvent>[0]["code"];

export async function accountReceiptAction(
  _previous: AccountReceiptFormState,
  formData: FormData,
): Promise<AccountReceiptFormState> {
  const context = await requireSession();
  const requestId = newRequestId();
  const started = performance.now();
  const intent = String(formData.get("intent") ?? "");
  const log = (code: LogCode, error?: unknown) =>
    logEvent({
      level: code === "OK" ? "info" : error ? "error" : "warn",
      requestId,
      route:
        intent === "confirm" ? "clientes.cobrar" : "clientes.cobrar.revisar",
      code,
      userId: context.userId,
      organizationId: context.organizationId,
      durationMs: performance.now() - started,
      error,
    });
  const clientId = String(formData.get("clientId") ?? "").slice(0, 64);
  const values: AccountReceiptFormValues = {
    currency: String(formData.get("currency") ?? "")
      .trim()
      .toUpperCase()
      .slice(0, 8),
    paymentMethodId: String(formData.get("paymentMethodId") ?? "").slice(0, 64),
    amount: String(formData.get("amount") ?? "")
      .trim()
      .slice(0, 40),
  };
  if (intent === "edit") return { status: "idle", values };
  const input = { clientId, ...values };

  if (intent !== "confirm") {
    try {
      const result = await previewAccountReceipt(context, input);
      if (!result.ok) {
        log(result.code);
        return {
          status: "error",
          requestId,
          values,
          ...accountReceiptRejection(result),
        };
      }
      log("OK");
      const methods = await listPaymentMethods(context);
      const method = methods.ok
        ? methods.paymentMethods.find(
            (row) => row.id === values.paymentMethodId.toLowerCase(),
          )
        : undefined;
      return {
        status: "preview",
        values,
        preview: result.preview,
        paymentMethodName: method?.name ?? "",
      };
    } catch (error) {
      log("INTERNAL", error);
      return {
        status: "error",
        requestId,
        values,
        message: unexpectedAccountReceiptMessage(requestId),
        fields: [],
        openCash: false,
      };
    }
  }

  let receiptId: string;
  try {
    const result = await createAccountReceipt(context, input);
    if (!result.ok) {
      log(result.code);
      return {
        status: "error",
        requestId,
        values,
        ...accountReceiptRejection(result),
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
      message: unexpectedAccountReceiptMessage(requestId),
      fields: [],
      openCash: false,
    };
  }
  // El cobro cambia lo que falta de las ventas del cliente, lo que está a favor y, en efectivo, la caja.
  revalidatePath("/ventas", "layout");
  revalidatePath("/pedidos", "layout");
  revalidatePath("/clientes", "layout");
  revalidatePath("/caja", "layout");
  redirect(`/clientes/${clientId}/cuenta?cobro=${receiptId}`);
}

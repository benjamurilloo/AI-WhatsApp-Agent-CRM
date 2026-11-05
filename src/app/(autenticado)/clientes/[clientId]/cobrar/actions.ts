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

// El rechazo de un cobro porque la cotización vigente cambió mientras se cargaba (brief-29.4, P-4).
function isRateChange(result: { code: string }): boolean {
  return "rule" in result && result.rule === "exchange_rate_changed";
}

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
  // De dónde se vino, para volver a la misma entrada del estado de cuenta (brief-24.7.2, D-3).
  // **Se compara contra un literal y la ruta la arma esta acción**: el campo no es un destino,
  // así que no hay redirección abierta. `Screens.md` §37 afirma esta conducta; la revisión
  // independiente encontró que el texto la prometía y el código volvía siempre a la ficha.
  const fromFinance = String(formData.get("desde") ?? "") === "finanzas";
  const values: AccountReceiptFormValues = {
    currency: String(formData.get("currency") ?? "")
      .trim()
      .toUpperCase()
      .slice(0, 8),
    paymentMethodId: String(formData.get("paymentMethodId") ?? "").slice(0, 64),
    amount: String(formData.get("amount") ?? "")
      .trim()
      .slice(0, 40),
    // La moneda que entra, la cotización acordada y la vigente que se mostró (brief-29.4, D-6).
    tenderedCurrency: String(formData.get("tenderedCurrency") ?? "")
      .trim()
      .toUpperCase()
      .slice(0, 8),
    exchangeRate: String(formData.get("exchangeRate") ?? "")
      .trim()
      .slice(0, 40),
    exchangeRateId: String(formData.get("exchangeRateId") ?? "").slice(0, 64),
  };
  if (intent === "edit") return { status: "idle", values };
  const input = { clientId, ...values };

  if (intent !== "confirm") {
    try {
      const result = await previewAccountReceipt(context, input);
      if (!result.ok) {
        log(result.code);
        // Si la vigente cambió mientras se cargaba, la página se vuelve a leer: el formulario muestra la
        // nueva equivalencia y manda su id (revisión independiente de la 29.4, R1-3).
        if (isRateChange(result))
          revalidatePath(`/clientes/${clientId}/cobrar`);
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
      // Si la vigente cambió mientras se cargaba, la página se vuelve a leer: el formulario muestra la
      // nueva equivalencia y manda su id (revisión independiente de la 29.4, R1-3).
      if (isRateChange(result)) revalidatePath(`/clientes/${clientId}/cobrar`);
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
  // Las cuentas de clientes dejaron de vivir bajo /caja en la 24.7.2 (D-2): antes esta
  // misma línea las cubría por ser hijas del layout. Sin esto, la lista queda vieja.
  revalidatePath("/cuentas", "layout");
  redirect(
    fromFinance
      ? `/cuentas/${clientId}?cobro=${receiptId}`
      : `/clientes/${clientId}/cuenta?cobro=${receiptId}`,
  );
}

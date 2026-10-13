"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { issueSaleFromOrder } from "@/modules/sales";
import { requireSession } from "@/app/_auth/session";
import { logEvent, newRequestId } from "@/shared/log";
import {
  issueSaleRejection,
  unexpectedErrorMessage,
  type IssueSaleState,
} from "./messages";

// Server Action de la venta (brief-20.2, D-4): emitirla desde el detalle de un pedido entregado.
// La sesión se verifica acá; el rol y la organización, en sales. El log lleva actor, organización y
// duración, nunca el cliente, los productos ni los montos.

type LogCode = Parameters<typeof logEvent>[0]["code"];

export async function issueSaleAction(
  _previous: IssueSaleState,
  formData: FormData,
): Promise<IssueSaleState> {
  // redirect lanza: la sesión se resuelve fuera del try.
  const context = await requireSession();
  const requestId = newRequestId();
  const started = performance.now();
  const log = (code: LogCode, error?: unknown) =>
    logEvent({
      level: code === "OK" ? "info" : error ? "error" : "warn",
      requestId,
      route: "ventas.emitir",
      code,
      userId: context.userId,
      organizationId: context.organizationId,
      durationMs: performance.now() - started,
      error,
    });
  const orderId = String(formData.get("orderId") ?? "").slice(0, 64);

  let destination: string;
  try {
    const result = await issueSaleFromOrder(context, orderId);
    if (!result.ok) {
      log(result.code);
      // Sin revalidar: con la venta ya emitida, el detalle del pedido dejaría de mostrar la
      // confirmación, y con ella el mensaje que enlaza la venta existente.
      return { status: "error", requestId, ...issueSaleRejection(result) };
    }
    log("OK");
    revalidatePath("/ventas");
    revalidatePath(`/pedidos/${orderId}`);
    destination = `/ventas/${result.sale.id}?aviso=emitida`;
  } catch (error) {
    log("INTERNAL", error);
    return {
      status: "error",
      requestId,
      message: unexpectedErrorMessage(requestId),
      existing: null,
    };
  }

  redirect(destination);
}

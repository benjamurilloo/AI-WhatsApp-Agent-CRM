"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { voidReceipt } from "@/modules/cash";
import { requireSession } from "@/app/_auth/session";
import { logEvent, newRequestId } from "@/shared/log";
import {
  receiptVoidRejection,
  unexpectedVoidMessage,
  type VoidFormState,
} from "@/app/(autenticado)/devoluciones/messages";

// Server Action de la anulación de un cobro (brief-21.5, D-4 y D-9). La sesión se verifica acá; el
// rol y la organización, en cash. El log lleva actor, organización, código y duración, nunca montos,
// medios ni nombres.

type LogCode = Parameters<typeof logEvent>[0]["code"];

export async function voidReceiptAction(
  _previous: VoidFormState,
  formData: FormData,
): Promise<VoidFormState> {
  const context = await requireSession();
  const requestId = newRequestId();
  const started = performance.now();
  const log = (code: LogCode, error?: unknown) =>
    logEvent({
      level: code === "OK" ? "info" : error ? "error" : "warn",
      requestId,
      route: "cobros.anular",
      code,
      userId: context.userId,
      organizationId: context.organizationId,
      durationMs: performance.now() - started,
      error,
    });
  const receiptId = String(formData.get("receiptId") ?? "").slice(0, 64);
  const reason = String(formData.get("reason") ?? "").slice(0, 40);

  try {
    const result = await voidReceipt(context, { receiptId, reason });
    if (!result.ok) {
      log(result.code);
      return { status: "error", requestId, ...receiptVoidRejection(result) };
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
  // Lo anulado cambia lo que falta de su venta o su pedido, la cuenta y la caja.
  revalidatePath(`/cobros/${receiptId}`);
  revalidatePath("/ventas", "layout");
  revalidatePath("/pedidos", "layout");
  revalidatePath("/caja", "layout");
  redirect(`/cobros/${receiptId}?anulado=1`);
}

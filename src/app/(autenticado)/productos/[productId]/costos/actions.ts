"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { setProductCost } from "@/modules/catalog";
import { requireSession } from "@/app/_auth/session";
import { logEvent, newRequestId } from "@/shared/log";
import { unexpectedErrorMessage } from "../../messages";
import { costRejectionMessage, type CostFormState } from "./messages";

// Server Action de la pantalla de costos (brief-18.2, FR-PROD-19), con la forma de la del precio.
// La sesión, el rol (solo admin) y la organización se verifican en catalog. El log lleva actor,
// organización y duración, nunca el monto ni el producto.
export async function setCostAction(
  _previous: CostFormState,
  formData: FormData,
): Promise<CostFormState> {
  const requestId = newRequestId();
  const route = "productos.fijarCosto";
  const started = performance.now();
  const productId = String(formData.get("productId") ?? "");
  const input = {
    amount: String(formData.get("amount") ?? ""),
    currency: String(formData.get("currency") ?? ""),
    expectedCostId: String(formData.get("expectedCostId") ?? ""),
  };
  // redirect lanza: la sesión se resuelve fuera del try.
  const context = await requireSession();
  const log = (code: Parameters<typeof logEvent>[0]["code"], error?: unknown) =>
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

  let destination: string;
  try {
    const result = await setProductCost(context, productId, input);
    if (!result.ok) {
      log(result.code);
      // Un CONFLICT, un producto desactivado o inexistente significan que la pantalla quedó vieja:
      // se vuelve a renderizar para que el costo vigente y el historial sean los reales. Un error
      // de validación no: el formulario sigue comparando contra el costo que vio (M-1).
      if (
        result.code === "CONFLICT" ||
        result.code === "BUSINESS_RULE_VIOLATION" ||
        result.code === "NOT_FOUND"
      ) {
        revalidatePath(`/productos/${productId}/costos`);
      }
      return {
        status: "error",
        requestId,
        values: input,
        ...(result.code === "CONFLICT"
          ? { currentCost: result.currentCost }
          : {}),
        ...costRejectionMessage(result, requestId),
      };
    }
    log("OK");
    if (!result.changed) {
      return { status: "unchanged", requestId, values: input };
    }
    // La lista no muestra el costo (D-4): cambia la tarjeta del resumen.
    revalidatePath(`/productos/${productId}`);
    destination = `/productos/${productId}/costos?aviso=fijado`;
  } catch (error) {
    log("INTERNAL", error);
    return {
      status: "error",
      requestId,
      values: input,
      field: null,
      message: unexpectedErrorMessage(requestId),
    };
  }

  redirect(destination);
}

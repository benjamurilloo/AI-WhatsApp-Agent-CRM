"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { setProductPrice } from "@/modules/catalog";
import { requireSession } from "@/app/_auth/session";
import { logEvent, newRequestId } from "@/shared/log";
import { unexpectedErrorMessage } from "../../messages";
import { priceRejectionMessage, type PriceFormState } from "./messages";

// Server Action de la pantalla de precios (brief-11.1, FR-PROD-12). La sesión, el rol y la
// organización se verifican en catalog. El log lleva actor, organización y duración, nunca el
// monto ni el producto.
export async function setPriceAction(
  _previous: PriceFormState,
  formData: FormData,
): Promise<PriceFormState> {
  const requestId = newRequestId();
  const route = "productos.fijarPrecio";
  const started = performance.now();
  const productId = String(formData.get("productId") ?? "");
  const input = {
    amount: String(formData.get("amount") ?? ""),
    currency: String(formData.get("currency") ?? ""),
    expectedPriceId: String(formData.get("expectedPriceId") ?? ""),
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
    const result = await setProductPrice(context, productId, input);
    if (!result.ok) {
      log(result.code);
      // Un CONFLICT, un producto desactivado o inexistente significan que la pantalla quedó vieja:
      // se vuelve a renderizar para que el precio vigente y el historial sean los reales. Un error
      // de validación no: el formulario sigue comparando contra el precio que vio (M-1).
      if (
        result.code === "CONFLICT" ||
        result.code === "BUSINESS_RULE_VIOLATION" ||
        result.code === "NOT_FOUND"
      ) {
        revalidatePath(`/productos/${productId}/precios`);
      }
      return {
        status: "error",
        requestId,
        values: input,
        ...(result.code === "CONFLICT"
          ? { currentPrice: result.currentPrice }
          : {}),
        ...priceRejectionMessage(result, requestId),
      };
    }
    log("OK");
    if (!result.changed) {
      return { status: "unchanged", requestId, values: input };
    }
    revalidatePath("/productos");
    destination = `/productos/${productId}/precios?aviso=fijado`;
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

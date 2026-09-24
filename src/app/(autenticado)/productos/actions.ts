"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  createProduct,
  deactivateProduct,
  reactivateProduct,
  updateProduct,
  type ProductActiveResult,
} from "@/modules/catalog";
import { adjustStock } from "@/modules/inventory";
import type { AuthContext } from "@/modules/organizations";
import { requireSession } from "@/app/_auth/session";
import { logEvent, newRequestId } from "@/shared/log";
import {
  adjustmentRejectionMessage,
  productChangeMessage,
  productFieldError,
  SKU_TAKEN_MESSAGE,
  unexpectedErrorMessage,
  type AdjustmentState,
  type ProductChangeState,
  type ProductFormState,
  type ProductFormValues,
} from "./messages";

// Server Actions de las pantallas 3, 4 y 5 (brief-4.4). Next.js compara Origin con Host; la
// sesión, el rol y la organización se verifican en los módulos. El log lleva actor, organización
// y duración, nunca nombres ni datos del producto.

function productValues(formData: FormData): ProductFormValues {
  return {
    sku: String(formData.get("sku") ?? ""),
    name: String(formData.get("name") ?? ""),
    description: String(formData.get("description") ?? ""),
    unit: String(formData.get("unit") ?? ""),
    reorderPoint: String(formData.get("reorderPoint") ?? ""),
    brand: String(formData.get("brand") ?? ""),
    category: String(formData.get("category") ?? ""),
    condition: String(formData.get("condition") ?? ""),
  };
}

function logDone(
  started: number,
  requestId: string,
  route: string,
  code: Parameters<typeof logEvent>[0]["code"],
  context: AuthContext,
  error?: unknown,
) {
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
}

export async function createProductAction(
  _previous: ProductFormState,
  formData: FormData,
): Promise<ProductFormState> {
  const requestId = newRequestId();
  const route = "productos.crear";
  const started = performance.now();
  const values = productValues(formData);
  // redirect lanza: la sesión se resuelve fuera del try.
  const context = await requireSession();

  let destination: string;
  try {
    const result = await createProduct(context, values);
    if (!result.ok) {
      logDone(started, requestId, route, result.code, context);
      if (result.code === "VALIDATION_ERROR" && "fields" in result) {
        return {
          status: "error",
          requestId,
          values,
          ...productFieldError(result.fields),
        };
      }
      return {
        status: "error",
        requestId,
        values,
        field: result.code === "CONFLICT" ? "sku" : null,
        message:
          result.code === "CONFLICT"
            ? SKU_TAKEN_MESSAGE
            : productChangeMessage(result.code, requestId),
      };
    }
    logDone(started, requestId, route, "OK", context);
    revalidatePath("/productos");
    destination = `/productos/${result.productId}?aviso=creado`;
  } catch (error) {
    logDone(started, requestId, route, "INTERNAL", context, error);
    return {
      status: "error",
      requestId,
      values,
      field: null,
      message: unexpectedErrorMessage(requestId),
    };
  }

  redirect(destination);
}

export async function updateProductAction(
  _previous: ProductFormState,
  formData: FormData,
): Promise<ProductFormState> {
  const requestId = newRequestId();
  const route = "productos.editar";
  const started = performance.now();
  const values = productValues(formData);
  const productId = String(formData.get("productId") ?? "");
  const context = await requireSession();

  let destination: string;
  try {
    const result = await updateProduct(context, productId, values);
    if (!result.ok) {
      logDone(started, requestId, route, result.code, context);
      if (result.code === "VALIDATION_ERROR" && "fields" in result) {
        return {
          status: "error",
          requestId,
          values,
          ...productFieldError(result.fields),
        };
      }
      return {
        status: "error",
        requestId,
        values,
        field: result.code === "CONFLICT" ? "sku" : null,
        message:
          result.code === "CONFLICT"
            ? SKU_TAKEN_MESSAGE
            : productChangeMessage(result.code, requestId),
      };
    }
    logDone(started, requestId, route, "OK", context);
    revalidatePath("/productos");
    // Sin diferencias no hay aviso: nada cambió (brief-4.2, D-5).
    destination = result.changed
      ? `/productos/${productId}?aviso=editado`
      : `/productos/${productId}`;
  } catch (error) {
    logDone(started, requestId, route, "INTERNAL", context, error);
    return {
      status: "error",
      requestId,
      values,
      field: null,
      message: unexpectedErrorMessage(requestId),
    };
  }

  redirect(destination);
}

async function runProductChange(
  route: string,
  notice: string,
  formData: FormData,
  operation: (
    context: AuthContext,
    productId: string,
  ) => Promise<ProductActiveResult>,
): Promise<ProductChangeState> {
  const requestId = newRequestId();
  const started = performance.now();
  const productId = String(formData.get("productId") ?? "");
  const context = await requireSession();

  let destination: string;
  try {
    const result = await operation(context, productId);
    if (!result.ok) {
      logDone(started, requestId, route, result.code, context);
      return {
        status: "error",
        requestId,
        message: productChangeMessage(result.code, requestId),
      };
    }
    logDone(started, requestId, route, "OK", context);
    revalidatePath("/productos");
    destination = result.changed
      ? `/productos/${productId}?aviso=${notice}`
      : `/productos/${productId}`;
  } catch (error) {
    logDone(started, requestId, route, "INTERNAL", context, error);
    return {
      status: "error",
      requestId,
      message: unexpectedErrorMessage(requestId),
    };
  }

  redirect(destination);
}

export async function deactivateProductAction(
  _previous: ProductChangeState,
  formData: FormData,
): Promise<ProductChangeState> {
  return runProductChange(
    "productos.desactivar",
    "desactivado",
    formData,
    deactivateProduct,
  );
}

export async function reactivateProductAction(
  _previous: ProductChangeState,
  formData: FormData,
): Promise<ProductChangeState> {
  return runProductChange(
    "productos.reactivar",
    "reactivado",
    formData,
    reactivateProduct,
  );
}

// Ajuste de stock (pantalla 5). El saldo esperado viaja en el formulario: un reenvío del
// mismo formulario recibe CONFLICT en lugar de duplicar el movimiento (brief-4.4, D-4).
export async function adjustStockAction(
  _previous: AdjustmentState,
  formData: FormData,
): Promise<AdjustmentState> {
  const requestId = newRequestId();
  const route = "productos.ajustar";
  const started = performance.now();
  const productId = String(formData.get("productId") ?? "");
  const input = {
    type: String(formData.get("type") ?? ""),
    quantity: String(formData.get("quantity") ?? ""),
    expectedQuantityOnHand: String(
      formData.get("expectedQuantityOnHand") ?? "",
    ),
    reason: String(formData.get("reason") ?? ""),
  };
  const context = await requireSession();

  let destination: string;
  try {
    const result = await adjustStock(context, productId, input);
    if (!result.ok) {
      logDone(started, requestId, route, result.code, context);
      // Un rechazo suele significar que la pantalla quedó vieja (otro ajuste, o el producto
      // desactivado): se vuelve a renderizar para que el saldo y el historial sean los reales.
      revalidatePath(`/productos/${productId}/movimientos`);
      return {
        status: "error",
        requestId,
        quantityOnHand:
          result.code === "CONFLICT" ? result.currentQuantityOnHand : null,
        ...adjustmentRejectionMessage(result, requestId),
      };
    }
    logDone(started, requestId, route, "OK", context);
    revalidatePath(`/productos/${productId}`);
    destination = `/productos/${productId}/movimientos?aviso=ajustado`;
  } catch (error) {
    logDone(started, requestId, route, "INTERNAL", context, error);
    return {
      status: "error",
      requestId,
      field: null,
      quantityOnHand: null,
      message: unexpectedErrorMessage(requestId),
    };
  }

  redirect(destination);
}

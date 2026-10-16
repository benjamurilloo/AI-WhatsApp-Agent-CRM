"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { suggestProducts } from "@/modules/catalog";
import type { AuthContext } from "@/modules/organizations";
import {
  cancelPurchaseOrder,
  closePurchaseOrder,
  createPurchaseOrder,
  formatCuit,
  listSuppliers,
  type PurchaseOrderInput,
} from "@/modules/purchasing";
import { requireSession } from "@/app/_auth/session";
import { logEvent, newRequestId } from "@/shared/log";
import { resolveProductText, resolveSupplierText } from "../resolve-typed";
import {
  cancelRejectionMessage,
  closeRejectionMessage,
  purchaseOrderRejection,
  unexpectedErrorMessage,
  type CancelState,
  type PurchaseOrderFormLine,
  type PurchaseOrderFormState,
  type PurchaseOrderFormValues,
} from "./messages";

// Server Actions de las órdenes de compra (brief-22.3, D-8 y D-10). Next.js compara Origin con Host;
// la sesión se verifica acá y el rol y la organización, en purchasing, que solo deja a un admin. El
// log lleva actor, organización, código y duración, nunca el proveedor, los productos ni los montos
// (SecurityModel; ADR 0023, punto 14).

type LogCode = Parameters<typeof logEvent>[0]["code"];

const LIST_PATH = "/compras/ordenes";

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

// Lo que envió el formulario. Las líneas llegan como campos repetidos, en orden; una línea sin
// producto, sin texto, sin cantidad y sin costo es una fila vacía del formulario y no se envía.
function readForm(formData: FormData): PurchaseOrderFormValues {
  const all = (name: string) =>
    formData.getAll(name).map((value) => String(value).slice(0, 200));
  const productIds = all("productId");
  const productTexts = all("productText");
  const quantities = all("quantity");
  const costs = all("unitCost");
  const lines: PurchaseOrderFormLine[] = [];
  for (let index = 0; index < productTexts.length; index++) {
    const line = {
      productId: (productIds[index] ?? "").trim(),
      productText: (productTexts[index] ?? "").trim(),
      quantity: (quantities[index] ?? "").trim(),
      unitCost: (costs[index] ?? "").trim(),
    };
    if (line.productId || line.productText || line.quantity || line.unitCost) {
      lines.push(line);
    }
  }
  return {
    supplierId: String(formData.get("supplierId") ?? "").trim(),
    supplierText: String(formData.get("supplierText") ?? "")
      .trim()
      .slice(0, 200),
    currency: String(formData.get("currency") ?? "")
      .trim()
      .slice(0, 3),
    lines,
  };
}

// Sin JavaScript, el proveedor y los productos llegan como texto (resolve-typed.ts).
async function resolveTypedValues(
  context: AuthContext,
  values: PurchaseOrderFormValues,
): Promise<PurchaseOrderFormValues> {
  const supplierId =
    !values.supplierId && values.supplierText
      ? await resolveSupplierText(context, values.supplierText)
      : values.supplierId;
  const lines = await Promise.all(
    values.lines.map(async (line) => {
      if (line.productId || !line.productText) return line;
      const found = await resolveProductText(context, line.productText);
      return found ? { ...line, ...found } : line;
    }),
  );
  return { ...values, supplierId, lines };
}

export async function createPurchaseOrderAction(
  _previous: PurchaseOrderFormState,
  formData: FormData,
): Promise<PurchaseOrderFormState> {
  // redirect lanza: la sesión se resuelve fuera del try.
  const context = await requireSession();
  const { requestId, log } = logger("compras.ordenes.crear", context);
  let values = readForm(formData);

  let destination: string;
  try {
    values = await resolveTypedValues(context, values);
    const input: PurchaseOrderInput = {
      supplierId: values.supplierId,
      currency: values.currency,
      lines: values.lines.map((line) => ({
        productId: line.productId,
        quantity: line.quantity,
        unitCost: line.unitCost,
      })),
    };
    const result = await createPurchaseOrder(context, input);
    if (!result.ok) {
      log(result.code);
      return {
        status: "error",
        requestId,
        values,
        ...purchaseOrderRejection(result, values.currency),
      };
    }
    log("OK");
    revalidatePath(LIST_PATH);
    destination = `${LIST_PATH}/${result.order.id}?aviso=creada`;
  } catch (error) {
    log("INTERNAL", error);
    return {
      status: "error",
      requestId,
      values,
      message: unexpectedErrorMessage(requestId),
      lineErrors: {},
      supplierError: null,
      currencyError: null,
    };
  }

  redirect(destination);
}

export async function cancelPurchaseOrderAction(
  _previous: CancelState,
  formData: FormData,
): Promise<CancelState> {
  const context = await requireSession();
  const { requestId, log } = logger("compras.ordenes.cancelar", context);
  const orderId = String(formData.get("orderId") ?? "");

  let destination: string;
  try {
    const result = await cancelPurchaseOrder(context, orderId);
    if (!result.ok) {
      log(result.code);
      revalidatePath(`${LIST_PATH}/${orderId}`);
      return {
        status: "error",
        requestId,
        message: cancelRejectionMessage(result),
      };
    }
    log("OK");
    revalidatePath(LIST_PATH);
    destination = `${LIST_PATH}/${orderId}?aviso=cancelada`;
  } catch (error) {
    log("INTERNAL", error);
    return {
      status: "error",
      requestId,
      message: unexpectedErrorMessage(requestId),
    };
  }

  redirect(destination);
}

// El cierre a mano, con faltante (brief-22.4, D-9).
export async function closePurchaseOrderAction(
  _previous: CancelState,
  formData: FormData,
): Promise<CancelState> {
  const context = await requireSession();
  const { requestId, log } = logger("compras.ordenes.cerrar", context);
  const orderId = String(formData.get("orderId") ?? "");

  let destination: string;
  try {
    const result = await closePurchaseOrder(context, orderId);
    if (!result.ok) {
      log(result.code);
      revalidatePath(`${LIST_PATH}/${orderId}`);
      return {
        status: "error",
        requestId,
        message: closeRejectionMessage(result),
      };
    }
    log("OK");
    revalidatePath(LIST_PATH);
    destination = `${LIST_PATH}/${orderId}?aviso=cerrada`;
  } catch (error) {
    log("INTERNAL", error);
    return {
      status: "error",
      requestId,
      message: unexpectedErrorMessage(requestId),
    };
  }

  redirect(destination);
}

// Sugerencias de los buscadores del alta (D-6 y D-10): lecturas, sin mutar ni revalidar. El
// producto no trae precio ni costo: el costo lo escribe quien carga. Ante un error inesperado
// devuelven una lista vacía y registran el evento, sin el texto buscado.

export type PurchaseOrderOption = {
  id: string;
  label: string;
  detail?: string;
};

export async function searchPurchaseOrderProductsAction(
  text: string,
): Promise<PurchaseOrderOption[]> {
  const context = await requireSession();
  const { log } = logger("compras.ordenes.productos", context);
  try {
    if (typeof text !== "string") return [];
    const found = await suggestProducts(context, text.slice(0, 100));
    if (!found.ok) return [];
    return found.products.map((product) => ({
      id: product.id,
      label: product.name,
      detail: product.sku,
    }));
  } catch (error) {
    log("INTERNAL", error);
    return [];
  }
}

// Solo los proveedores activos, por parte del nombre o por CUIT; purchasing exige admin.
export async function searchPurchaseOrderSuppliersAction(
  text: string,
): Promise<PurchaseOrderOption[]> {
  const context = await requireSession();
  const { log } = logger("compras.ordenes.proveedores", context);
  try {
    if (typeof text !== "string") return [];
    const found = await listSuppliers(context, {
      text: text.slice(0, 100),
      status: "active",
      page: 1,
    });
    if (!found.ok) return [];
    return found.suppliers.slice(0, 10).map((supplier) => ({
      id: supplier.id,
      label: supplier.name,
      ...(supplier.cuit ? { detail: formatCuit(supplier.cuit) } : {}),
    }));
  } catch (error) {
    log("INTERNAL", error);
    return [];
  }
}

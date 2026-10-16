"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentPrices, suggestProducts } from "@/modules/catalog";
import type { AuthContext } from "@/modules/organizations";
import {
  createGoodsReceipt,
  type GoodsReceiptInput,
} from "@/modules/purchasing";
import { requireSession } from "@/app/_auth/session";
import { logEvent, newRequestId } from "@/shared/log";
import { parseQuantityInput } from "@/shared/quantity";
import { resolveProductText, resolveSupplierText } from "../resolve-typed";
import {
  goodsReceiptRejection,
  unexpectedErrorMessage,
  type GoodsReceiptFormLine,
  type GoodsReceiptFormState,
  type GoodsReceiptFormValues,
} from "./messages";

// Server Actions de las recepciones (brief-22.4, D-10 y D-11). Next.js compara Origin con Host; la
// sesión se verifica acá y el rol y la organización, en purchasing, que solo deja a un admin. El log
// lleva actor, organización, código y duración, nunca el proveedor, los productos ni los montos
// (SecurityModel; ADR 0023, punto 14).

type LogCode = Parameters<typeof logEvent>[0]["code"];

const LIST_PATH = "/compras/recepciones";

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

// Lo que envió el formulario, con todas sus filas, para volver a mostrarlas. Las líneas llegan como
// campos repetidos, en orden.
function readForm(formData: FormData): GoodsReceiptFormValues {
  const all = (name: string) =>
    formData.getAll(name).map((value) => String(value).slice(0, 200));
  const orderLineIds = all("orderLineId");
  const productIds = all("productId");
  const productTexts = all("productText");
  const quantities = all("quantity");
  const costs = all("unitCost");
  const priceCurrencies = all("priceCurrency");
  const lines: GoodsReceiptFormLine[] = productTexts.map((text, index) => ({
    orderLineId: (orderLineIds[index] ?? "").trim(),
    productId: (productIds[index] ?? "").trim(),
    productText: text.trim(),
    quantity: (quantities[index] ?? "").trim(),
    unitCost: (costs[index] ?? "").trim(),
    priceCurrency: (priceCurrencies[index] ?? "").trim().slice(0, 3),
  }));
  const text = (name: string, max: number) =>
    String(formData.get(name) ?? "")
      .trim()
      .slice(0, max);
  return {
    orderId: text("orderId", 64),
    supplierId: text("supplierId", 64),
    supplierText: text("supplierText", 200),
    currency: text("currency", 3),
    supplierReference: String(formData.get("supplierReference") ?? "").slice(
      0,
      100,
    ),
    lines,
  };
}

// Las filas que se envían (D-7): con orden, las que tienen una cantidad distinta de cero; sin orden,
// las que tienen algo escrito. Devuelve la posición de cada una en el formulario.
function sentRows(values: GoodsReceiptFormValues): number[] {
  return values.lines.flatMap((line, index) => {
    if (values.orderId) {
      return line.quantity && parseQuantityInput(line.quantity) !== 0n
        ? [index]
        : [];
    }
    return line.productId || line.productText || line.quantity || line.unitCost
      ? [index]
      : [];
  });
}

// Sin JavaScript, el proveedor y los productos llegan como texto (resolve-typed.ts).
async function resolveTypedValues(
  context: AuthContext,
  values: GoodsReceiptFormValues,
): Promise<GoodsReceiptFormValues> {
  if (values.orderId) return values;
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

export async function createGoodsReceiptAction(
  _previous: GoodsReceiptFormState,
  formData: FormData,
): Promise<GoodsReceiptFormState> {
  // redirect lanza: la sesión se resuelve fuera del try.
  const context = await requireSession();
  const { requestId, log } = logger("compras.recepciones.crear", context);
  let values = readForm(formData);

  let destination: string;
  try {
    values = await resolveTypedValues(context, values);
    const rows = sentRows(values);
    const sent = rows.map((index) => values.lines[index]!);
    const input: GoodsReceiptInput = {
      purchaseOrderId: values.orderId || null,
      supplierId: values.supplierId,
      currency: values.currency,
      supplierReference: values.supplierReference,
      lines: sent.map((line) => ({
        ...(values.orderId ? { purchaseOrderLineId: line.orderLineId } : {}),
        productId: line.productId,
        quantity: line.quantity,
        unitCost: line.unitCost,
      })),
    };
    const result = await createGoodsReceipt(context, input);
    if (!result.ok) {
      log(result.code);
      const rejection = goodsReceiptRejection(
        result,
        values.currency,
        sent.map((line) => line.productId),
      );
      // Las posiciones del rechazo son las de las líneas enviadas: se llevan a las del formulario.
      const lineErrors = Object.fromEntries(
        Object.entries(rejection.lineErrors).map(([position, message]) => [
          rows[Number(position) - 1]! + 1,
          message,
        ]),
      );
      return {
        status: "error",
        requestId,
        values,
        ...rejection,
        lineErrors,
      };
    }
    log("OK");
    revalidatePath(LIST_PATH);
    if (values.orderId) revalidatePath(`/compras/ordenes/${values.orderId}`);
    destination = `${LIST_PATH}/${result.receipt.id}?aviso=${result.closedOrder ? "orden-cerrada" : "creada"}`;
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
      referenceError: null,
    };
  }

  redirect(destination);
}

// El buscador de productos del alta sin orden: una lectura, sin mutar ni revalidar. Trae la moneda
// del precio vigente, para la advertencia de D-7; nunca el costo. Ante un error inesperado devuelve
// una lista vacía y registra el evento, sin el texto buscado.

export type GoodsReceiptProductOption = {
  id: string;
  label: string;
  detail?: string;
  priceCurrency: string;
};

export async function searchGoodsReceiptProductsAction(
  text: string,
): Promise<GoodsReceiptProductOption[]> {
  const context = await requireSession();
  const { log } = logger("compras.recepciones.productos", context);
  try {
    if (typeof text !== "string") return [];
    const found = await suggestProducts(context, text.slice(0, 100));
    if (!found.ok) return [];
    const prices = await getCurrentPrices(
      context,
      found.products.map((product) => product.id),
    );
    return found.products.map((product) => ({
      id: product.id,
      label: product.name,
      detail: product.sku,
      priceCurrency: prices.ok
        ? (prices.prices.get(product.id)?.currency ?? "")
        : "",
    }));
  } catch (error) {
    log("INTERNAL", error);
    return [];
  }
}

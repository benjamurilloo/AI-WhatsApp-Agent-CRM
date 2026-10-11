"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  getCurrentPrices,
  searchProducts,
  suggestProducts,
} from "@/modules/catalog";
import { suggestClients } from "@/modules/crm";
import { cancelOrder, createOrder, type OrderInput } from "@/modules/orders";
import type { AuthContext } from "@/modules/organizations";
import { requireSession } from "@/app/_auth/session";
import { logEvent, newRequestId } from "@/shared/log";
import {
  orderRejection,
  unexpectedErrorMessage,
  type CancelState,
  type OrderFormLine,
  type OrderFormState,
  type OrderFormValues,
} from "./messages";

// Server Actions de las pantallas de pedidos (brief-19.2). La sesión se verifica acá; el rol y la
// organización, en orders. El log lleva actor, organización y duración, nunca el cliente, los
// productos ni los montos.

type LogCode = Parameters<typeof logEvent>[0]["code"];

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
// producto, sin texto y sin cantidad es una fila vacía del formulario y no se envía a orders.
function readForm(formData: FormData): OrderFormValues {
  const all = (name: string) =>
    formData.getAll(name).map((value) => String(value).slice(0, 200));
  const productIds = all("productId");
  const productTexts = all("productText");
  const quantities = all("quantity");
  const expected = all("expectedPriceId");
  const amounts = all("priceAmount");
  const currencies = all("priceCurrency");
  const lines: OrderFormLine[] = [];
  for (let index = 0; index < productTexts.length; index++) {
    const line = {
      productId: (productIds[index] ?? "").trim(),
      productText: (productTexts[index] ?? "").trim(),
      quantity: (quantities[index] ?? "").trim(),
      expectedPriceId: (expected[index] ?? "").trim(),
      price:
        amounts[index] && currencies[index]
          ? { amount: amounts[index]!, currency: currencies[index]! }
          : null,
    };
    if (line.productId || line.productText || line.quantity) lines.push(line);
  }
  return {
    clientId: String(formData.get("clientId") ?? "").trim(),
    clientText: String(formData.get("clientText") ?? "")
      .trim()
      .slice(0, 200),
    lines,
  };
}

// Sin JavaScript, el buscador es un campo de texto (brief-19.2, D-7): el cliente se reconoce por su
// nombre exacto, y el producto por su SKU exacto. Como quien carga no vio el precio, el esperado
// es el vigente de ahora.
async function resolveTypedValues(
  context: AuthContext,
  values: OrderFormValues,
): Promise<OrderFormValues> {
  let { clientId } = values;
  if (!clientId && values.clientText) {
    const found = await suggestClients(context, values.clientText);
    const exact = found.ok
      ? found.clients.filter(
          (client) =>
            client.name.toLowerCase() === values.clientText.toLowerCase(),
        )
      : [];
    if (exact.length === 1) clientId = exact[0]!.id;
  }
  const lines = await Promise.all(
    values.lines.map(async (line) => {
      if (line.productId || !line.productText) return line;
      const found = await searchProducts(context, {
        text: line.productText,
        activity: "active",
      });
      const exact = found.ok
        ? found.products.filter(
            (product) =>
              product.sku.toLowerCase() === line.productText.toLowerCase(),
          )
        : [];
      if (exact.length !== 1) return line;
      const product = exact[0]!;
      const prices = await getCurrentPrices(context, [product.id]);
      const price = prices.ok ? prices.prices.get(product.id) : undefined;
      return {
        ...line,
        productId: product.id,
        productText: `${product.name} (${product.sku})`,
        expectedPriceId: price?.id ?? "",
        price: price
          ? { amount: price.amount, currency: price.currency }
          : null,
      };
    }),
  );
  return { ...values, clientId, lines };
}

export async function createOrderAction(
  _previous: OrderFormState,
  formData: FormData,
): Promise<OrderFormState> {
  // redirect lanza: la sesión se resuelve fuera del try.
  const context = await requireSession();
  const { requestId, log } = logger("pedidos.crear", context);
  let values = readForm(formData);

  let destination: string;
  try {
    values = await resolveTypedValues(context, values);
    const input: OrderInput = {
      clientId: values.clientId,
      lines: values.lines.map((line) => ({
        productId: line.productId,
        quantity: line.quantity,
        expectedPriceId: line.expectedPriceId,
      })),
    };
    const result = await createOrder(context, input);
    if (!result.ok) {
      log(result.code);
      // Tras un CONFLICT, el precio nuevo pasa a ser el que se muestra y el esperado.
      if (result.code === "CONFLICT") {
        for (const changed of result.prices) {
          const line = values.lines[changed.position - 1];
          if (!line) continue;
          line.expectedPriceId = changed.price?.id ?? "";
          line.price = changed.price
            ? { amount: changed.price.amount, currency: changed.price.currency }
            : null;
        }
      }
      const firstCurrency = values.lines[0]?.price?.currency ?? "";
      return {
        status: "error",
        requestId,
        values,
        ...orderRejection(result, firstCurrency),
      };
    }
    log("OK");
    revalidatePath("/pedidos");
    destination = `/pedidos/${result.order.id}?aviso=creado`;
  } catch (error) {
    log("INTERNAL", error);
    return {
      status: "error",
      requestId,
      values,
      message: unexpectedErrorMessage(requestId),
      lineErrors: {},
      clientError: null,
    };
  }

  redirect(destination);
}

export async function cancelOrderAction(
  _previous: CancelState,
  formData: FormData,
): Promise<CancelState> {
  const context = await requireSession();
  const { requestId, log } = logger("pedidos.cancelar", context);
  const orderId = String(formData.get("orderId") ?? "");

  let destination: string;
  try {
    const result = await cancelOrder(context, orderId);
    if (!result.ok) {
      log(result.code);
      revalidatePath(`/pedidos/${orderId}`);
      return {
        status: "error",
        requestId,
        message:
          result.code === "FORBIDDEN"
            ? "No tenés permiso para cancelar pedidos."
            : result.code === "BUSINESS_RULE_VIOLATION"
              ? "Este pedido ya no está pendiente: no se puede cancelar desde acá."
              : "Este pedido no existe.",
      };
    }
    log("OK");
    revalidatePath("/pedidos");
    destination = `/pedidos/${orderId}?aviso=cancelado`;
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

// Sugerencias de los buscadores del alta (brief-19.2, D-7): lecturas, sin mutar ni revalidar. El
// producto viene con su precio vigente, que el formulario muestra y envía como esperado. Ante un
// error inesperado devuelven una lista vacía y registran el evento, sin el texto buscado.

export type OrderProductOption = {
  id: string;
  label: string;
  detail: string;
  price: { id: string; amount: string; currency: string } | null;
};

export type OrderClientOption = { id: string; label: string };

export async function searchOrderProductsAction(
  text: string,
): Promise<OrderProductOption[]> {
  const context = await requireSession();
  const { log } = logger("pedidos.productos", context);
  try {
    if (typeof text !== "string") return [];
    const found = await suggestProducts(context, text.slice(0, 100));
    if (!found.ok || found.products.length === 0) return [];
    const prices = await getCurrentPrices(
      context,
      found.products.map((product) => product.id),
    );
    return found.products.map((product) => {
      const price = prices.ok ? prices.prices.get(product.id) : undefined;
      return {
        id: product.id,
        label: product.name,
        detail: product.sku,
        price: price
          ? { id: price.id, amount: price.amount, currency: price.currency }
          : null,
      };
    });
  } catch (error) {
    log("INTERNAL", error);
    return [];
  }
}

export async function searchOrderClientsAction(
  text: string,
): Promise<OrderClientOption[]> {
  const context = await requireSession();
  const { log } = logger("pedidos.clientes", context);
  try {
    if (typeof text !== "string") return [];
    const found = await suggestClients(context, text.slice(0, 100));
    if (!found.ok) return [];
    return found.clients.map((client) => ({
      id: client.id,
      label: client.name,
    }));
  } catch (error) {
    log("INTERNAL", error);
    return [];
  }
}

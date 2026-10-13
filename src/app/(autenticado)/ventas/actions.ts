"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentPrices, searchProducts } from "@/modules/catalog";
import { suggestClients } from "@/modules/crm";
import type { AuthContext } from "@/modules/organizations";
import {
  issueSale,
  issueSaleFromOrder,
  voidSale,
  type SaleInput,
} from "@/modules/sales";
import { requireSession } from "@/app/_auth/session";
import { logEvent, newRequestId } from "@/shared/log";
import {
  issueSaleRejection,
  saleRejection,
  unexpectedErrorMessage,
  voidSaleRejection,
  voidUnexpectedErrorMessage,
  type IssueSaleState,
  type SaleFormLine,
  type SaleFormState,
  type SaleFormValues,
  type VoidSaleState,
} from "./messages";

// Server Actions de la venta: emitirla desde el detalle de un pedido entregado (brief-20.2, D-4) y,
// desde la 20.3, la venta sin pedido de /ventas/nueva (brief-20.3, D-6); desde la 20.4, anularla
// desde su detalle (brief-20.4, D-7). La sesión se verifica acá;
// el rol y la organización, en sales. El log lleva actor, organización y duración, nunca el
// cliente, los productos ni los montos.

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

// La anulación desde el detalle de la venta (brief-20.4, D-6 y D-7). El log no lleva el motivo:
// alcanza con el resultado.
export async function voidSaleAction(
  _previous: VoidSaleState,
  formData: FormData,
): Promise<VoidSaleState> {
  const context = await requireSession();
  const requestId = newRequestId();
  const started = performance.now();
  const log = (code: LogCode, error?: unknown) =>
    logEvent({
      level: code === "OK" ? "info" : error ? "error" : "warn",
      requestId,
      route: "ventas.anular",
      code,
      userId: context.userId,
      organizationId: context.organizationId,
      durationMs: performance.now() - started,
      error,
    });
  const saleId = String(formData.get("saleId") ?? "").slice(0, 64);
  const reason = String(formData.get("reason") ?? "").slice(0, 64);

  let destination: string;
  try {
    const result = await voidSale(context, saleId, reason);
    if (!result.ok) {
      log(result.code);
      // Sin revalidar, como la emisión: el mensaje vive en la confirmación.
      return { status: "error", requestId, ...voidSaleRejection(result) };
    }
    log("OK");
    revalidatePath("/ventas");
    revalidatePath(`/ventas/${saleId}`);
    // La venta de un pedido deja libre el pedido; la sin pedido repone el stock (R-9 de la 20.4).
    if (result.orderId) revalidatePath(`/pedidos/${result.orderId}`);
    else revalidatePath("/productos");
    destination = `/ventas/${saleId}?aviso=anulada`;
  } catch (error) {
    log("INTERNAL", error);
    return {
      status: "error",
      requestId,
      message: voidUnexpectedErrorMessage(requestId),
      existing: null,
    };
  }

  redirect(destination);
}

// Lo que envió el formulario, con la misma forma que el del alta del pedido (pedidos/actions.ts):
// las líneas llegan como campos repetidos, en orden, y una fila vacía no se envía. Se repite acá
// porque un archivo "use server" solo exporta acciones.
function readSaleForm(formData: FormData): SaleFormValues {
  const all = (name: string) =>
    formData.getAll(name).map((value) => String(value).slice(0, 200));
  const productIds = all("productId");
  const productTexts = all("productText");
  const quantities = all("quantity");
  const expected = all("expectedPriceId");
  const amounts = all("priceAmount");
  const currencies = all("priceCurrency");
  const lines: SaleFormLine[] = [];
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

// Sin JavaScript, como en el alta del pedido: el cliente se reconoce por su nombre exacto y el
// producto por su SKU exacto, y el precio esperado es el vigente de ahora. Un cliente escrito que
// no se reconoce no se toma como «Consumidor final»: sales rechaza el id vacío solo si hay texto.
async function resolveTypedSaleValues(
  context: AuthContext,
  values: SaleFormValues,
): Promise<SaleFormValues> {
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

export async function createSaleAction(
  _previous: SaleFormState,
  formData: FormData,
): Promise<SaleFormState> {
  // redirect lanza: la sesión se resuelve fuera del try.
  const context = await requireSession();
  const requestId = newRequestId();
  const started = performance.now();
  const log = (code: LogCode, error?: unknown) =>
    logEvent({
      level: code === "OK" ? "info" : error ? "error" : "warn",
      requestId,
      route: "ventas.nueva",
      code,
      userId: context.userId,
      organizationId: context.organizationId,
      durationMs: performance.now() - started,
      error,
    });
  let values = readSaleForm(formData);

  let destination: string;
  try {
    values = await resolveTypedSaleValues(context, values);
    // Un texto de cliente que no se reconoció no es «Consumidor final»: se rechaza como cliente.
    const clientId =
      values.clientId || (values.clientText ? "no-reconocido" : "");
    const input: SaleInput = {
      clientId,
      lines: values.lines.map((line) => ({
        productId: line.productId,
        quantity: line.quantity,
        expectedPriceId: line.expectedPriceId,
      })),
    };
    const result = await issueSale(context, input);
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
        ...saleRejection(result, firstCurrency),
      };
    }
    log("OK");
    revalidatePath("/ventas");
    revalidatePath("/productos");
    destination = `/ventas/${result.sale.id}?aviso=emitida`;
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

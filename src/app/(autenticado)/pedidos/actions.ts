"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentPrices, suggestProducts } from "@/modules/catalog";
import { suggestClients } from "@/modules/crm";
import { listAvailableUnits } from "@/modules/inventory";
import {
  cancelOrder,
  confirmOrder,
  createOrder,
  deliverOrder,
  getOrder,
  type OrderInput,
  type OrderTransitionResult,
} from "@/modules/orders";
import type { AuthContext } from "@/modules/organizations";
import { requireSession } from "@/app/_auth/session";
import { logEvent, newRequestId } from "@/shared/log";
import {
  applyPriceConflicts,
  readFormLines,
  resolveTypedLine,
  toLineInput,
} from "./form-lines";
import {
  orderRejection,
  TRANSITION_NOTICE,
  transitionRejection,
  unexpectedErrorMessage,
  type OrderFormState,
  type OrderFormValues,
  type OrderTransitionName,
  type TransitionState,
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

// Lo que envió el formulario: el cliente y las líneas (form-lines.ts, compartido con la venta).
function readForm(formData: FormData): OrderFormValues {
  return {
    clientId: String(formData.get("clientId") ?? "").trim(),
    clientText: String(formData.get("clientText") ?? "")
      .trim()
      .slice(0, 200),
    lines: readFormLines(formData),
  };
}

// Sin JavaScript, el buscador es un campo de texto (brief-19.2, D-7): el cliente se reconoce por su
// nombre exacto, y el producto por su SKU exacto (resolveTypedLine). Como quien carga no vio el
// precio, el esperado es el vigente de ahora.
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
    values.lines.map((line) => resolveTypedLine(context, line)),
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
      lines: values.lines.map(toLineInput),
    };
    const result = await createOrder(context, input);
    if (!result.ok) {
      log(result.code);
      if (result.code === "CONFLICT") {
        applyPriceConflicts(values.lines, result.prices);
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

// Las transiciones del detalle (brief-19.2 la cancelación; brief-19.3 confirmar y entregar). Un
// rechazo nombra cada línea con el nombre de hoy del producto, leído con getOrder.

const TRANSITIONS: Record<
  OrderTransitionName,
  (context: AuthContext, orderId: string) => Promise<OrderTransitionResult>
> = {
  confirm: confirmOrder,
  deliver: deliverOrder,
  cancel: cancelOrder,
};

const ROUTES: Record<OrderTransitionName, string> = {
  confirm: "pedidos.confirmar",
  deliver: "pedidos.entregar",
  cancel: "pedidos.cancelar",
};

async function runTransition(
  transition: OrderTransitionName,
  formData: FormData,
): Promise<TransitionState> {
  const context = await requireSession();
  const { requestId, log } = logger(ROUTES[transition], context);
  const orderId = String(formData.get("orderId") ?? "");

  let destination: string;
  try {
    const result = await TRANSITIONS[transition](context, orderId);
    if (!result.ok) {
      log(result.code);
      const names = new Map<string, string>();
      if (result.code === "BUSINESS_RULE_VIOLATION") {
        const found = await getOrder(context, orderId);
        for (const line of found.ok ? found.order.lines : []) {
          if (line.product) names.set(line.productId, line.product.name);
        }
      }
      revalidatePath(`/pedidos/${orderId}`);
      return {
        status: "error",
        requestId,
        ...transitionRejection(transition, result, names),
      };
    }
    log("OK");
    revalidatePath("/pedidos");
    revalidatePath("/productos");
    destination = `/pedidos/${orderId}?aviso=${TRANSITION_NOTICE[transition]}`;
  } catch (error) {
    log("INTERNAL", error);
    return {
      status: "error",
      requestId,
      message: unexpectedErrorMessage(requestId),
      details: [],
    };
  }

  redirect(destination);
}

export async function confirmOrderAction(
  _previous: TransitionState,
  formData: FormData,
): Promise<TransitionState> {
  return runTransition("confirm", formData);
}

export async function deliverOrderAction(
  _previous: TransitionState,
  formData: FormData,
): Promise<TransitionState> {
  return runTransition("deliver", formData);
}

export async function cancelOrderAction(
  _previous: TransitionState,
  formData: FormData,
): Promise<TransitionState> {
  return runTransition("cancel", formData);
}

// Sugerencias de los buscadores del alta (brief-19.2, D-7): lecturas, sin mutar ni revalidar. El
// producto viene con su precio vigente, que el formulario muestra y envía como esperado. Ante un
// error inesperado devuelven una lista vacía y registran el evento, sin el texto buscado.

export type OrderProductOption = {
  id: string;
  label: string;
  detail: string;
  price: { id: string; amount: string; currency: string } | null;
  // Desde la 29.5.2: el formulario pide los IMEI en lugar de la cantidad (brief-29.5.2, D-5; H-8).
  unitTracked: boolean;
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
        unitTracked: product.tracking === "unit",
      };
    });
  } catch (error) {
    log("INTERNAL", error);
    return [];
  }
}

// Las unidades disponibles de un producto por unidad, para elegirlas en una línea (brief-29.5.2,
// D-5): el IMEI, el grado, la batería y el precio propio, sin el costo. Una lectura, como las
// sugerencias; ante un error, una lista vacía, y el IMEI se puede escribir igual.
export type OrderUnitOption = {
  serial: string;
  grade: string | null;
  batteryHealth: number | null;
  price: { amount: string; currency: string } | null;
};

export async function searchOrderUnitsAction(
  productId: string,
): Promise<OrderUnitOption[]> {
  const context = await requireSession();
  const { log } = logger("pedidos.unidades", context);
  try {
    if (typeof productId !== "string") return [];
    const found = await listAvailableUnits(context, productId.slice(0, 64));
    if (!found.ok) return [];
    return found.units.map((unit) => ({
      serial: unit.serial,
      grade: unit.grade,
      batteryHealth: unit.batteryHealth,
      price: unit.price,
    }));
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

"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { suggestClients } from "@/modules/crm";
import type { AuthContext } from "@/modules/organizations";
import {
  approveServiceOrder,
  cancelServiceOrder,
  createRepairType,
  createServiceOrder,
  deliverServiceOrder,
  markServiceOrderRepaired,
  moveRepairType,
  quoteServiceOrder,
  rejectServiceOrder,
  renameRepairType,
  sendServiceOrder,
  setRepairPrice,
  setRepairTypeActive,
  type MoveDirection,
  type RepairTypeWriteResult,
  type TransitionResult,
} from "@/modules/service";
import { requireSession } from "@/app/_auth/session";
import { logEvent, newRequestId } from "@/shared/log";
import {
  changeMessage,
  createOrderRejection,
  deliverMessage,
  priceRejection,
  quoteRejection,
  repairTypeRejection,
  sendMessage,
  transitionMessage,
  unexpectedErrorMessage,
  type ChangeState,
  type FormState,
} from "./messages";

// Server Actions de las reparaciones (brief-29.6, D-10). Next.js compara Origin con Host; la sesión se
// verifica acá, y el rol, la organización y la capacidad, en service. El log lleva actor, organización,
// código y duración, nunca el cliente, el IMEI, lo que reportó ni los montos.

const ORDERS = "/reparaciones";
const LIST = "/reparaciones/lista";

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

function text(formData: FormData, name: string, max = 200): string {
  return String(formData.get(name) ?? "").slice(0, max);
}

// La pantalla de la lista vuelve al modelo que se estaba mirando.
function listHref(modelId: string, notice: string | null): string {
  const params = new URLSearchParams();
  if (/^[0-9a-f-]{36}$/i.test(modelId)) params.set("modelo", modelId);
  if (notice) params.set("aviso", notice);
  const query = params.toString();
  return query ? `${LIST}?${query}` : LIST;
}

// Los tipos de reparación.

async function runTypeForm(
  route: string,
  formData: FormData,
  save: (context: AuthContext, name: string) => Promise<RepairTypeWriteResult>,
  notice: string,
): Promise<FormState> {
  const context = await requireSession();
  const { requestId, log } = logger(route, context);
  const values = { name: text(formData, "name", 100) };
  const modelId = text(formData, "modelId", 64);
  let destination: string;
  try {
    const result = await save(context, values.name);
    if (!result.ok) {
      log(result.code);
      return {
        status: "error",
        requestId,
        values,
        ...repairTypeRejection(result, requestId),
      };
    }
    log("OK");
    revalidatePath(LIST);
    destination = listHref(modelId, result.changed ? notice : null);
  } catch (error) {
    log("INTERNAL", error);
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

export async function createRepairTypeAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  return runTypeForm(
    "reparaciones.tipo.crear",
    formData,
    (context, name) => createRepairType(context, { name }),
    "tipo-creado",
  );
}

export async function renameRepairTypeAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const repairTypeId = text(formData, "repairTypeId", 64);
  return runTypeForm(
    "reparaciones.tipo.editar",
    formData,
    (context, name) => renameRepairType(context, repairTypeId, { name }),
    "tipo-editado",
  );
}

async function runTypeChange(
  route: string,
  formData: FormData,
  save: (context: AuthContext) => Promise<RepairTypeWriteResult>,
  notice: string | null,
): Promise<ChangeState> {
  const context = await requireSession();
  const { requestId, log } = logger(route, context);
  const modelId = text(formData, "modelId", 64);
  let destination: string;
  try {
    const result = await save(context);
    if (!result.ok) {
      log(result.code);
      return {
        status: "error",
        requestId,
        message: changeMessage(result.code, requestId),
      };
    }
    log("OK");
    revalidatePath(LIST);
    destination = listHref(modelId, result.changed ? notice : null);
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

export async function setRepairTypeActiveAction(
  _previous: ChangeState,
  formData: FormData,
): Promise<ChangeState> {
  const repairTypeId = text(formData, "repairTypeId", 64);
  const isActive = text(formData, "isActive", 1) === "1";
  return runTypeChange(
    "reparaciones.tipo.activo",
    formData,
    (context) => setRepairTypeActive(context, repairTypeId, isActive),
    isActive ? "tipo-reactivado" : "tipo-desactivado",
  );
}

export async function moveRepairTypeAction(
  _previous: ChangeState,
  formData: FormData,
): Promise<ChangeState> {
  const repairTypeId = text(formData, "repairTypeId", 64);
  const direction = text(formData, "direction", 8);
  return runTypeChange(
    "reparaciones.tipo.mover",
    formData,
    // service valida la dirección.
    (context) =>
      moveRepairType(context, repairTypeId, direction as MoveDirection),
    null,
  );
}

// El precio de un tipo para un modelo.
export async function setRepairPriceAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const context = await requireSession();
  const { requestId, log } = logger("reparaciones.precio", context);
  const values = {
    price: text(formData, "price", 40),
    priceCurrency: text(formData, "priceCurrency", 3),
    cost: text(formData, "cost", 40),
    costCurrency: text(formData, "costCurrency", 3),
  };
  const repairTypeId = text(formData, "repairTypeId", 64);
  const modelId = text(formData, "modelId", 64);
  let destination: string;
  try {
    const result = await setRepairPrice(context, {
      repairTypeId,
      modelId,
      ...values,
    });
    if (!result.ok) {
      log(result.code);
      return {
        status: "error",
        requestId,
        values,
        ...priceRejection(result, requestId),
      };
    }
    log("OK");
    revalidatePath(LIST);
    destination = listHref(modelId, result.changed ? "precio-guardado" : null);
  } catch (error) {
    log("INTERNAL", error);
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

// La orden de servicio.

// Sin JavaScript, el buscador es un campo de texto (brief-19.2, D-7): el cliente se reconoce por su
// nombre exacto.
async function resolveClient(
  context: AuthContext,
  clientId: string,
  clientText: string,
): Promise<string> {
  if (clientId || !clientText) return clientId;
  const found = await suggestClients(context, clientText);
  const exact = found.ok
    ? found.clients.filter(
        (client) => client.name.toLowerCase() === clientText.toLowerCase(),
      )
    : [];
  return exact.length === 1 ? exact[0]!.id : "";
}

export async function createServiceOrderAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const context = await requireSession();
  const { requestId, log } = logger("reparaciones.crear", context);
  const values = {
    clientId: text(formData, "clientId", 64).trim(),
    clientText: text(formData, "clientText", 200).trim(),
    modelId: text(formData, "modelId", 64),
    deviceSerial: text(formData, "deviceSerial", 64),
    reportedIssue: text(formData, "reportedIssue", 1100),
  };
  let destination: string;
  try {
    const clientId = await resolveClient(
      context,
      values.clientId,
      values.clientText,
    );
    const result = await createServiceOrder(context, {
      clientId,
      modelId: values.modelId,
      deviceSerial: values.deviceSerial,
      reportedIssue: values.reportedIssue,
    });
    if (!result.ok) {
      log(result.code);
      return {
        status: "error",
        requestId,
        values,
        ...createOrderRejection(result, requestId),
      };
    }
    log("OK");
    revalidatePath(ORDERS);
    destination = `${ORDERS}/${result.order.id}?aviso=orden-creada`;
  } catch (error) {
    log("INTERNAL", error);
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

// Una transición de la orden: ante un rechazo, solo el mensaje; con éxito, el detalle con su aviso.
async function runTransition<R extends { ok: boolean }>(
  route: string,
  serviceOrderId: string,
  save: (context: AuthContext) => Promise<R>,
  failure: (result: Exclude<R, { ok: true }>, requestId: string) => string,
  notice: (result: Extract<R, { ok: true }>) => string,
): Promise<ChangeState> {
  const context = await requireSession();
  const { requestId, log } = logger(route, context);
  let destination: string;
  try {
    const result = await save(context);
    if (!result.ok) {
      const rejected = result as Exclude<R, { ok: true }>;
      log((rejected as unknown as { code: LogCode }).code);
      return {
        status: "error",
        requestId,
        message: failure(rejected, requestId),
      };
    }
    log("OK");
    revalidatePath(ORDERS);
    destination = `${ORDERS}/${serviceOrderId}?aviso=${notice(result as Extract<R, { ok: true }>)}`;
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

export async function sendServiceOrderAction(
  _previous: ChangeState,
  formData: FormData,
): Promise<ChangeState> {
  const serviceOrderId = text(formData, "serviceOrderId", 64);
  const technicianId = text(formData, "technicianId", 64);
  return runTransition(
    "reparaciones.mandar",
    serviceOrderId,
    (context) => sendServiceOrder(context, serviceOrderId, technicianId),
    sendMessage,
    () => "orden-mandada",
  );
}

// El presupuesto: cada tipo de la lista llega con su casilla, su precio y su costo.
export type QuoteFormState =
  | { status: "idle" }
  | {
      status: "error";
      requestId: string;
      message: string;
      rows: Record<string, string>;
      values: Record<string, string>;
    };

export async function quoteServiceOrderAction(
  _previous: QuoteFormState,
  formData: FormData,
): Promise<QuoteFormState> {
  const context = await requireSession();
  const { requestId, log } = logger("reparaciones.presupuestar", context);
  const serviceOrderId = text(formData, "serviceOrderId", 64);
  const typeIds = formData
    .getAll("typeIds")
    .slice(0, 100)
    .map((value) => String(value).slice(0, 64));
  const values: Record<string, string> = {
    customerCurrency: text(formData, "customerCurrency", 3),
    technicianCurrency: text(formData, "technicianCurrency", 3),
  };
  for (const id of typeIds) {
    values[`include_${id}`] = text(formData, `include_${id}`, 1);
    values[`price_${id}`] = text(formData, `price_${id}`, 40);
    values[`cost_${id}`] = text(formData, `cost_${id}`, 40);
  }
  const chosen = typeIds.filter((id) => values[`include_${id}`] === "1");
  let destination: string;
  try {
    const result = await quoteServiceOrder(context, serviceOrderId, {
      customerCurrency: values.customerCurrency!,
      technicianCurrency: values.technicianCurrency!,
      lines: chosen.map((id) => ({
        repairTypeId: id,
        price: values[`price_${id}`]!,
        cost: values[`cost_${id}`]!,
      })),
    });
    if (!result.ok) {
      log(result.code);
      return {
        status: "error",
        requestId,
        values,
        ...quoteRejection(result, requestId, chosen),
      };
    }
    log("OK");
    revalidatePath(ORDERS);
    destination = `${ORDERS}/${serviceOrderId}?aviso=orden-presupuestada`;
  } catch (error) {
    log("INTERNAL", error);
    return {
      status: "error",
      requestId,
      values,
      rows: {},
      message: unexpectedErrorMessage(requestId),
    };
  }
  redirect(destination);
}

// Aprobar, rechazar y marcarla reparada: un botón cada una. Cada caso de uso se llama por su nombre
// en changeServiceOrderAction, para que la guarda service-writes fije su llamador.
const SIMPLE = {
  aprobar: { route: "reparaciones.aprobar", notice: "orden-aprobada" },
  rechazar: { route: "reparaciones.rechazar", notice: "orden-rechazada" },
  reparada: { route: "reparaciones.reparada", notice: "orden-reparada" },
} as const;

export async function changeServiceOrderAction(
  _previous: ChangeState,
  formData: FormData,
): Promise<ChangeState> {
  const serviceOrderId = text(formData, "serviceOrderId", 64);
  const step = text(formData, "step", 16);
  const chosen = Object.hasOwn(SIMPLE, step)
    ? SIMPLE[step as keyof typeof SIMPLE]
    : null;
  if (!chosen) {
    const requestId = newRequestId();
    return {
      status: "error",
      requestId,
      message: changeMessage("VALIDATION_ERROR", requestId),
    };
  }
  return runTransition<TransitionResult>(
    chosen.route,
    serviceOrderId,
    (context) =>
      step === "aprobar"
        ? approveServiceOrder(context, serviceOrderId)
        : step === "rechazar"
          ? rejectServiceOrder(context, serviceOrderId)
          : markServiceOrderRepaired(context, serviceOrderId),
    transitionMessage,
    () => chosen.notice,
  );
}

export async function deliverServiceOrderAction(
  _previous: ChangeState,
  formData: FormData,
): Promise<ChangeState> {
  const serviceOrderId = text(formData, "serviceOrderId", 64);
  return runTransition(
    "reparaciones.entregar",
    serviceOrderId,
    (context) => deliverServiceOrder(context, serviceOrderId),
    deliverMessage,
    (result) =>
      result.sale === null ? "orden-entregada" : "orden-entregada-venta",
  );
}

export async function cancelServiceOrderAction(
  _previous: ChangeState,
  formData: FormData,
): Promise<ChangeState> {
  const serviceOrderId = text(formData, "serviceOrderId", 64);
  const reason = text(formData, "reason", 32);
  return runTransition(
    "reparaciones.cancelar",
    serviceOrderId,
    (context) => cancelServiceOrder(context, serviceOrderId, reason),
    (result, requestId) =>
      result.code === "VALIDATION_ERROR"
        ? "Elegí el motivo de la cancelación."
        : transitionMessage(result, requestId),
    () => "orden-cancelada",
  );
}

"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  changeProductTracking,
  correctUnit,
  registerUnit,
  writeOffUnit,
} from "@/modules/inventory";
import type { AuthContext } from "@/modules/organizations";
import { requireSession } from "@/app/_auth/session";
import { logEvent, newRequestId } from "@/shared/log";
import {
  correctRejection,
  registerRejection,
  trackingRejection,
  unexpectedErrorMessage,
  writeOffRejection,
  type FormState,
  type Rejection,
} from "./messages";

// Server Actions de las unidades de un producto (brief-29.5, D-3, D-4 y D-6). Next.js compara Origin
// con Host; la sesión se verifica acá, y el rol, la organización y la capacidad, en inventory. El log
// lleva actor, organización, código y duración, nunca el IMEI ni el costo. Cada una es el único
// llamador de su servicio (tests/guards/unit-writes.test.ts).

type LogCode = Parameters<typeof logEvent>[0]["code"];

function logDone(
  started: number,
  requestId: string,
  route: string,
  code: LogCode,
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

function text(formData: FormData, name: string, max = 200): string {
  return String(formData.get(name) ?? "").slice(0, max);
}

function unitsPath(productId: string): string {
  return `/productos/${productId}/unidades`;
}

// Guarda, y ante un rechazo devuelve lo escrito con el mensaje. Al guardar, revalida los productos y
// lleva a la pantalla de unidades con el aviso.
async function runForm<R extends { ok: boolean; code?: string }>(
  route: string,
  values: Record<string, string>,
  save: (context: AuthContext) => Promise<R>,
  outcome: (result: R & { ok: true }) => string,
  reject: (result: R & { ok: false }, requestId: string) => Rejection,
): Promise<FormState> {
  const requestId = newRequestId();
  const started = performance.now();
  const context = await requireSession();
  let destination: string;
  try {
    const result = await save(context);
    if (!result.ok) {
      logDone(started, requestId, route, result.code as LogCode, context);
      return {
        status: "error",
        requestId,
        values,
        ...reject(result as R & { ok: false }, requestId),
      };
    }
    logDone(started, requestId, route, "OK", context);
    revalidatePath("/productos", "layout");
    destination = outcome(result as R & { ok: true });
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

export async function changeTrackingAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const productId = text(formData, "productId", 64);
  const values = { tracking: text(formData, "tracking", 16) };
  return runForm(
    "productos.unidades.seguimiento",
    values,
    (context) => changeProductTracking(context, productId, values.tracking),
    (result) =>
      result.changed
        ? `${unitsPath(productId)}?aviso=seguimiento-cambiado`
        : unitsPath(productId),
    trackingRejection,
  );
}

export async function registerUnitAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const productId = text(formData, "productId", 64);
  const values = {
    serial: text(formData, "serial", 64),
    cost: text(formData, "cost", 40),
    currency: text(formData, "currency", 3),
    gradeId: text(formData, "gradeId", 64),
    batteryHealth: text(formData, "batteryHealth", 8),
  };
  return runForm(
    "productos.unidades.cargar",
    values,
    (context) => registerUnit(context, productId, values),
    () => `${unitsPath(productId)}?aviso=unidad-cargada`,
    registerRejection,
  );
}

export async function writeOffUnitAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  // El producto sale de la unidad: el campo oculto solo lo usa el formulario.
  const unitId = text(formData, "unitId", 64);
  const values = { reason: text(formData, "reason", 600) };
  return runForm(
    "productos.unidades.baja",
    values,
    (context) => writeOffUnit(context, unitId, values.reason),
    (result) => `${unitsPath(result.productId)}?aviso=unidad-baja`,
    writeOffRejection,
  );
}

export async function correctUnitAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const productId = text(formData, "productId", 64);
  const unitId = text(formData, "unitId", 64);
  const values = {
    gradeId: text(formData, "gradeId", 64),
    batteryHealth: text(formData, "batteryHealth", 8),
  };
  return runForm(
    "productos.unidades.corregir",
    values,
    (context) => correctUnit(context, unitId, values),
    (result) =>
      result.changed
        ? `${unitsPath(result.productId)}?aviso=unidad-corregida`
        : unitsPath(productId),
    correctRejection,
  );
}

"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { AuthContext } from "@/modules/organizations";
import {
  createSupplier,
  deactivateSupplier,
  reactivateSupplier,
  setSupplierTechnician,
  updateSupplier,
  type SupplierActiveResult,
  type UpdateSupplierResult,
} from "@/modules/purchasing";
import { requireSession } from "@/app/_auth/session";
import { logEvent, newRequestId } from "@/shared/log";
import {
  supplierChangeMessage,
  supplierFieldError,
  supplierRuleError,
  unexpectedErrorMessage,
  type SupplierChangeState,
  type SupplierFormState,
  type SupplierFormValues,
} from "./messages";

// Server Actions de los proveedores (brief-22.2, D-5 y D-9). Next.js compara Origin con Host; la
// sesión se verifica acá y el rol y la organización, en purchasing, que solo deja a un admin. El
// log lleva actor, organización, código y duración, nunca el nombre, el teléfono, el email ni el
// CUIT del proveedor, que puede ser una persona física (SecurityModel; ADR 0023, punto 14).

const FORM_FIELDS: (keyof SupplierFormValues)[] = [
  "name",
  "phone",
  "email",
  "cuit",
];

const LIST_PATH = "/compras/proveedores";

function supplierValues(formData: FormData): SupplierFormValues {
  return Object.fromEntries(
    FORM_FIELDS.map((field) => [field, String(formData.get(field) ?? "")]),
  ) as SupplierFormValues;
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

// Alta y edición comparten el manejo de rechazos: el formulario conserva lo escrito.
async function runSupplierForm(
  route: string,
  formData: FormData,
  save: (
    context: AuthContext,
    values: SupplierFormValues,
  ) => Promise<
    | { ok: true; destination: string }
    | Exclude<UpdateSupplierResult, { ok: true }>
  >,
): Promise<SupplierFormState> {
  const requestId = newRequestId();
  const started = performance.now();
  const values = supplierValues(formData);
  // redirect lanza: la sesión se resuelve fuera del try.
  const context = await requireSession();

  let destination: string;
  try {
    const result = await save(context, values);
    if (!result.ok) {
      logDone(started, requestId, route, result.code, context);
      if (result.code === "VALIDATION_ERROR" && "fields" in result) {
        return {
          status: "error",
          requestId,
          values,
          ...supplierFieldError(result.fields, result.cuitReason),
        };
      }
      if (result.code === "BUSINESS_RULE_VIOLATION") {
        return {
          status: "error",
          requestId,
          values,
          ...supplierRuleError(result.rule),
        };
      }
      return {
        status: "error",
        requestId,
        values,
        field: null,
        message: supplierChangeMessage(result.code, requestId),
      };
    }
    logDone(started, requestId, route, "OK", context);
    revalidatePath(LIST_PATH);
    destination = result.destination;
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

export async function createSupplierAction(
  _previous: SupplierFormState,
  formData: FormData,
): Promise<SupplierFormState> {
  return runSupplierForm(
    "compras.proveedores.crear",
    formData,
    async (context, values) => {
      const result = await createSupplier(context, values);
      return result.ok
        ? {
            ok: true,
            destination: `${LIST_PATH}/${result.supplierId}?aviso=creado`,
          }
        : result;
    },
  );
}

export async function updateSupplierAction(
  _previous: SupplierFormState,
  formData: FormData,
): Promise<SupplierFormState> {
  const supplierId = String(formData.get("supplierId") ?? "");
  return runSupplierForm(
    "compras.proveedores.editar",
    formData,
    async (context, values) => {
      const result = await updateSupplier(context, supplierId, values);
      // Sin diferencias no hay aviso: nada cambió.
      return result.ok
        ? {
            ok: true,
            destination: result.changed
              ? `${LIST_PATH}/${supplierId}?aviso=editado`
              : `${LIST_PATH}/${supplierId}`,
          }
        : result;
    },
  );
}

async function runSupplierChange(
  route: string,
  notice: string,
  formData: FormData,
  operation: (
    context: AuthContext,
    supplierId: string,
  ) => Promise<SupplierActiveResult>,
): Promise<SupplierChangeState> {
  const requestId = newRequestId();
  const started = performance.now();
  const supplierId = String(formData.get("supplierId") ?? "");
  const context = await requireSession();

  let destination: string;
  try {
    const result = await operation(context, supplierId);
    if (!result.ok) {
      logDone(started, requestId, route, result.code, context);
      return {
        status: "error",
        requestId,
        message: supplierChangeMessage(result.code, requestId),
      };
    }
    logDone(started, requestId, route, "OK", context);
    revalidatePath(LIST_PATH);
    destination = result.changed
      ? `${LIST_PATH}/${supplierId}?aviso=${notice}`
      : `${LIST_PATH}/${supplierId}`;
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

export async function deactivateSupplierAction(
  _previous: SupplierChangeState,
  formData: FormData,
): Promise<SupplierChangeState> {
  return runSupplierChange(
    "compras.proveedores.desactivar",
    "desactivado",
    formData,
    deactivateSupplier,
  );
}

// La marca de técnico (brief-29.6, D-3): solo con la capacidad repairs, que exige purchasing.
export async function setTechnicianAction(
  _previous: SupplierChangeState,
  formData: FormData,
): Promise<SupplierChangeState> {
  const isTechnician = String(formData.get("isTechnician") ?? "") === "1";
  return runSupplierChange(
    "compras.proveedores.tecnico",
    isTechnician ? "tecnico-marcado" : "tecnico-desmarcado",
    formData,
    (context, supplierId) =>
      setSupplierTechnician(context, supplierId, isTechnician),
  );
}

export async function reactivateSupplierAction(
  _previous: SupplierChangeState,
  formData: FormData,
): Promise<SupplierChangeState> {
  return runSupplierChange(
    "compras.proveedores.reactivar",
    "reactivado",
    formData,
    reactivateSupplier,
  );
}

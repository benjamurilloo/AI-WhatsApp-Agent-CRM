"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  APPOINTMENT_TARGETS,
  changeAppointmentStatus,
  createAppointment,
  createAppointmentReason,
  moveAppointmentReason,
  renameAppointmentReason,
  saveAppointmentSettings,
  setAppointmentReasonActive,
  type AppointmentTarget,
  type MoveDirection,
  type ReasonWriteResult,
} from "@/modules/appointments";
import { suggestClients } from "@/modules/crm";
import type { AuthContext } from "@/modules/organizations";
import { requireSession } from "@/app/_auth/session";
import { logEvent, newRequestId } from "@/shared/log";
import {
  changeMessage,
  createRejection,
  reasonRejection,
  settingsRejection,
  TARGET_NOTICE,
  transitionRejection,
  unexpectedErrorMessage,
  type ChangeState,
  type FormState,
} from "./messages";

// Server Actions de los turnos (brief-29.10, D-4 y D-5). Next.js compara Origin con Host; la sesión se
// verifica acá, y el rol, la organización y la capacidad, en appointments. El log lleva actor,
// organización, código y duración, nunca el cliente ni la nota.

const CALENDAR = "/turnos";
const SETTINGS = "/turnos/configuracion";

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

// Sin JavaScript, el buscador de clientes es un campo de texto: vale el nombre exacto de un solo
// cliente, como en el alta de una orden de servicio.
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

export async function createAppointmentAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const context = await requireSession();
  const { requestId, log } = logger("turnos.crear", context);
  const values = {
    clientId: text(formData, "clientId", 64).trim(),
    clientText: text(formData, "clientText", 200).trim(),
    reasonId: text(formData, "reasonId", 64),
    date: text(formData, "date", 10),
    start: text(formData, "start", 5),
    productId: text(formData, "productId", 64),
    unitId: text(formData, "unitId", 64),
    note: text(formData, "note", 600),
  };
  let destination: string;
  try {
    const clientId = await resolveClient(
      context,
      values.clientId,
      values.clientText,
    );
    const result = await createAppointment(context, {
      clientId,
      reasonId: values.reasonId,
      date: values.date,
      start: values.start,
      productId: values.productId,
      unitId: values.unitId,
      note: values.note,
    });
    if (!result.ok) {
      log(result.code);
      return {
        status: "error",
        requestId,
        values,
        ...createRejection(result, requestId),
      };
    }
    log("OK");
    revalidatePath(CALENDAR, "layout");
    destination = `${CALENDAR}/${result.appointmentId}?aviso=turno-creado`;
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

// Un cambio de estado: ante un rechazo, solo el mensaje; con éxito, el detalle con su aviso.
export async function changeAppointmentStatusAction(
  _previous: ChangeState,
  formData: FormData,
): Promise<ChangeState> {
  const context = await requireSession();
  const { requestId, log } = logger("turnos.estado", context);
  const appointmentId = text(formData, "appointmentId", 64);
  const target = text(formData, "target", 16) as AppointmentTarget;
  let destination: string;
  try {
    // appointments valida el destino; acá solo se arma el aviso.
    const result = await changeAppointmentStatus(
      context,
      appointmentId,
      target,
    );
    if (!result.ok) {
      log(result.code);
      return {
        status: "error",
        requestId,
        message: transitionRejection(result, requestId),
      };
    }
    log("OK");
    revalidatePath(CALENDAR, "layout");
    const notice = APPOINTMENT_TARGETS.includes(target)
      ? TARGET_NOTICE[target]
      : null;
    destination = `${CALENDAR}/${appointmentId.toLowerCase()}${notice ? `?aviso=${notice}` : ""}`;
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

// La configuración (D-4): la duración, el cupo y los motivos.

export async function saveAppointmentSettingsAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const context = await requireSession();
  const { requestId, log } = logger("turnos.valores", context);
  const values = {
    slotMinutes: text(formData, "slotMinutes", 8),
    capacity: text(formData, "capacity", 8),
  };
  let destination: string;
  try {
    const result = await saveAppointmentSettings(context, values);
    if (!result.ok) {
      log(result.code);
      return {
        status: "error",
        requestId,
        values,
        ...(result.code === "VALIDATION_ERROR"
          ? settingsRejection(result.fields)
          : { field: null, message: changeMessage(result.code, requestId) }),
      };
    }
    log("OK");
    revalidatePath(CALENDAR, "layout");
    destination = `${SETTINGS}?aviso=valores-guardados`;
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

async function runReasonForm(
  route: string,
  formData: FormData,
  save: (context: AuthContext, name: string) => Promise<ReasonWriteResult>,
  notice: string,
): Promise<FormState> {
  const context = await requireSession();
  const { requestId, log } = logger(route, context);
  const values = { name: text(formData, "name", 100) };
  let destination: string;
  try {
    const result = await save(context, values.name);
    if (!result.ok) {
      log(result.code);
      return {
        status: "error",
        requestId,
        values,
        ...reasonRejection(result, requestId),
      };
    }
    log("OK");
    revalidatePath(SETTINGS);
    destination = result.changed ? `${SETTINGS}?aviso=${notice}` : SETTINGS;
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

export async function createAppointmentReasonAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  return runReasonForm(
    "turnos.motivo.crear",
    formData,
    (context, name) => createAppointmentReason(context, { name }),
    "motivo-creado",
  );
}

export async function renameAppointmentReasonAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const reasonId = text(formData, "reasonId", 64);
  return runReasonForm(
    "turnos.motivo.editar",
    formData,
    (context, name) => renameAppointmentReason(context, reasonId, { name }),
    "motivo-guardado",
  );
}

async function runReasonChange(
  route: string,
  save: (context: AuthContext) => Promise<ReasonWriteResult>,
  notice: string | null,
): Promise<ChangeState> {
  const context = await requireSession();
  const { requestId, log } = logger(route, context);
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
    revalidatePath(SETTINGS);
    destination =
      result.changed && notice ? `${SETTINGS}?aviso=${notice}` : SETTINGS;
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

export async function setAppointmentReasonActiveAction(
  _previous: ChangeState,
  formData: FormData,
): Promise<ChangeState> {
  const reasonId = text(formData, "reasonId", 64);
  const isActive = text(formData, "isActive", 1) === "1";
  return runReasonChange(
    "turnos.motivo.activo",
    (context) => setAppointmentReasonActive(context, reasonId, isActive),
    isActive ? "motivo-reactivado" : "motivo-desactivado",
  );
}

export async function moveAppointmentReasonAction(
  _previous: ChangeState,
  formData: FormData,
): Promise<ChangeState> {
  const reasonId = text(formData, "reasonId", 64);
  const direction = text(formData, "direction", 8);
  return runReasonChange(
    "turnos.motivo.mover",
    // appointments valida la dirección.
    (context) =>
      moveAppointmentReason(context, reasonId, direction as MoveDirection),
    null,
  );
}

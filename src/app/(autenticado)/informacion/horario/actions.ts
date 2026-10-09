"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  addBusinessHourException,
  removeBusinessHourException,
  saveBusinessWeek,
  WEEKDAYS,
  type WeekInput,
} from "@/modules/knowledge";
import type { AuthContext } from "@/modules/organizations";
import { requireSession } from "@/app/_auth/session";
import { logEvent, newRequestId } from "@/shared/log";
import {
  DATE_TAKEN_MESSAGE,
  exceptionFieldError,
  hoursChangeMessage,
  unexpectedErrorMessage,
  type ExceptionFormState,
  type ExceptionFormValues,
  type HoursChangeState,
  type WeekFormState,
  type WeekFormValues,
} from "./messages";

// Server Actions de la pantalla del horario (brief-17.4, D-4). Next.js compara Origin con Host;
// la sesión, el rol y la organización se verifican en el módulo. El log lleva actor, organización
// y duración, nunca el horario ni el motivo.

const PAGE = "/informacion/horario";

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

function text(formData: FormData, name: string): string {
  return String(formData.get(name) ?? "");
}

// Los campos de un día se llaman d{día}o1, d{día}c1, d{día}o2 y d{día}c2.
function weekValues(formData: FormData): WeekFormValues {
  const values: WeekFormValues = {};
  for (const weekday of WEEKDAYS) {
    for (const suffix of ["o1", "c1", "o2", "c2"]) {
      values[`d${weekday}${suffix}`] = text(formData, `d${weekday}${suffix}`);
    }
  }
  return values;
}

function weekInput(values: WeekFormValues): WeekInput {
  return Object.fromEntries(
    WEEKDAYS.map((weekday) => [
      weekday,
      {
        opens1: values[`d${weekday}o1`] ?? "",
        closes1: values[`d${weekday}c1`] ?? "",
        opens2: values[`d${weekday}o2`] ?? "",
        closes2: values[`d${weekday}c2`] ?? "",
      },
    ]),
  ) as WeekInput;
}

export async function saveWeekAction(
  _previous: WeekFormState,
  formData: FormData,
): Promise<WeekFormState> {
  const requestId = newRequestId();
  const route = "informacion.horario.guardar";
  const started = performance.now();
  const values = weekValues(formData);
  const context = await requireSession();

  let destination: string;
  try {
    const result = await saveBusinessWeek(context, weekInput(values));
    if (!result.ok) {
      logDone(started, requestId, route, result.code, context);
      return {
        status: "error",
        requestId,
        values,
        fields: "fields" in result ? result.fields : [],
        message:
          "fields" in result
            ? null
            : hoursChangeMessage(result.code, requestId),
      };
    }
    logDone(started, requestId, route, "OK", context);
    revalidatePath(PAGE);
    destination = result.changed ? `${PAGE}?aviso=guardado` : PAGE;
  } catch (error) {
    logDone(started, requestId, route, "INTERNAL", context, error);
    return {
      status: "error",
      requestId,
      values,
      fields: [],
      message: unexpectedErrorMessage(requestId),
    };
  }

  redirect(destination);
}

function exceptionValues(formData: FormData): ExceptionFormValues {
  return {
    date: text(formData, "date"),
    opens1: text(formData, "opens1"),
    closes1: text(formData, "closes1"),
    opens2: text(formData, "opens2"),
    closes2: text(formData, "closes2"),
    reason: text(formData, "reason"),
  };
}

export async function addExceptionAction(
  _previous: ExceptionFormState,
  formData: FormData,
): Promise<ExceptionFormState> {
  const requestId = newRequestId();
  const route = "informacion.horario.agregar";
  const started = performance.now();
  const values = exceptionValues(formData);
  const context = await requireSession();

  let destination: string;
  try {
    const result = await addBusinessHourException(context, values);
    if (!result.ok) {
      logDone(started, requestId, route, result.code, context);
      if (result.code === "VALIDATION_ERROR") {
        return {
          status: "error",
          requestId,
          values,
          ...exceptionFieldError(result.fields),
        };
      }
      return {
        status: "error",
        requestId,
        values,
        field: result.code === "CONFLICT" ? "date" : null,
        message:
          result.code === "CONFLICT"
            ? DATE_TAKEN_MESSAGE
            : hoursChangeMessage(result.code, requestId),
      };
    }
    logDone(started, requestId, route, "OK", context);
    revalidatePath(PAGE);
    destination = `${PAGE}?aviso=agregado`;
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

export async function removeExceptionAction(
  _previous: HoursChangeState,
  formData: FormData,
): Promise<HoursChangeState> {
  const requestId = newRequestId();
  const route = "informacion.horario.quitar";
  const started = performance.now();
  const exceptionId = text(formData, "exceptionId");
  const context = await requireSession();

  try {
    const result = await removeBusinessHourException(context, exceptionId);
    if (!result.ok) {
      logDone(started, requestId, route, result.code, context);
      return {
        status: "error",
        requestId,
        message: hoursChangeMessage(result.code, requestId),
      };
    }
    logDone(started, requestId, route, "OK", context);
    revalidatePath(PAGE);
  } catch (error) {
    logDone(started, requestId, route, "INTERNAL", context, error);
    return {
      status: "error",
      requestId,
      message: unexpectedErrorMessage(requestId),
    };
  }

  redirect(`${PAGE}?aviso=quitado`);
}

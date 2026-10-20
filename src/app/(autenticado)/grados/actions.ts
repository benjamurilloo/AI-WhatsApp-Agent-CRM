"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  createUnitGrade,
  moveUnitGrade,
  setUnitGradeActive,
  updateUnitGrade,
  type GradeWriteResult,
  type MoveDirection,
} from "@/modules/inventory";
import type { AuthContext } from "@/modules/organizations";
import { requireSession } from "@/app/_auth/session";
import { logEvent, newRequestId } from "@/shared/log";
import {
  changeMessage,
  gradeRejection,
  unexpectedErrorMessage,
  type ChangeState,
  type FormState,
} from "./messages";

// Server Actions de los grados (brief-29.5, D-5). Next.js compara Origin con Host; la sesión, el rol,
// la organización y la capacidad se verifican en inventory. El log lleva actor, organización, código
// y duración, nunca nombres.

const GRADES = "/grados";

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

async function runForm(
  route: string,
  values: Record<string, string>,
  save: (context: AuthContext) => Promise<GradeWriteResult>,
  notice: string,
): Promise<FormState> {
  const requestId = newRequestId();
  const started = performance.now();
  const context = await requireSession();
  let destination: string;
  try {
    const result = await save(context);
    if (!result.ok) {
      logDone(started, requestId, route, result.code, context);
      return {
        status: "error",
        requestId,
        values,
        ...gradeRejection(result, requestId),
      };
    }
    logDone(started, requestId, route, "OK", context);
    revalidatePath(GRADES);
    destination = result.changed ? `${GRADES}?aviso=${notice}` : GRADES;
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

// Un botón, sin campos: ante un rechazo, solo el mensaje.
async function runChange(
  route: string,
  save: (context: AuthContext) => Promise<GradeWriteResult>,
  notice: (result: GradeWriteResult & { ok: true }) => string | null,
): Promise<ChangeState> {
  const requestId = newRequestId();
  const started = performance.now();
  const context = await requireSession();
  let destination: string;
  try {
    const result = await save(context);
    if (!result.ok) {
      logDone(started, requestId, route, result.code, context);
      return {
        status: "error",
        requestId,
        message: changeMessage(result.code, requestId),
      };
    }
    logDone(started, requestId, route, "OK", context);
    revalidatePath(GRADES);
    const key = result.changed ? notice(result) : null;
    destination = key ? `${GRADES}?aviso=${key}` : GRADES;
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

export async function createGradeAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const values = {
    name: text(formData, "name", 80),
    description: text(formData, "description", 200),
  };
  return runForm(
    "grados.crear",
    values,
    (context) => createUnitGrade(context, values),
    "grado-creado",
  );
}

export async function updateGradeAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const gradeId = text(formData, "gradeId", 64);
  const values = {
    name: text(formData, "name", 80),
    description: text(formData, "description", 200),
  };
  return runForm(
    "grados.editar",
    values,
    (context) => updateUnitGrade(context, gradeId, values),
    "grado-editado",
  );
}

export async function setGradeActiveAction(
  _previous: ChangeState,
  formData: FormData,
): Promise<ChangeState> {
  const gradeId = text(formData, "gradeId", 64);
  const isActive = text(formData, "isActive", 1) === "1";
  return runChange(
    "grados.activo",
    (context) => setUnitGradeActive(context, gradeId, isActive),
    () => (isActive ? "grado-reactivado" : "grado-desactivado"),
  );
}

export async function moveGradeAction(
  _previous: ChangeState,
  formData: FormData,
): Promise<ChangeState> {
  const gradeId = text(formData, "gradeId", 64);
  const direction = text(formData, "direction", 8);
  return runChange(
    "grados.mover",
    // inventory valida la dirección.
    (context) => moveUnitGrade(context, gradeId, direction as MoveDirection),
    () => null,
  );
}

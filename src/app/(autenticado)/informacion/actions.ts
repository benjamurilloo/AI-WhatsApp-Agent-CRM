"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  createKnowledgeEntry,
  deactivateKnowledgeEntry,
  reactivateKnowledgeEntry,
  updateKnowledgeEntry,
  type CreateKnowledgeResult,
  type KnowledgeActiveResult,
  type UpdateKnowledgeResult,
} from "@/modules/knowledge";
import type { AuthContext } from "@/modules/organizations";
import { requireSession } from "@/app/_auth/session";
import { logEvent, newRequestId } from "@/shared/log";
import {
  knowledgeChangeMessage,
  knowledgeFieldError,
  TITLE_TAKEN_MESSAGE,
  unexpectedErrorMessage,
  type KnowledgeChangeState,
  type KnowledgeFormState,
  type KnowledgeFormValues,
} from "./messages";

// Server Actions de las pantallas 11 y 12 (brief-11.2). Next.js compara Origin con Host; la
// sesión, el rol y la organización se verifican en el módulo. El log lleva actor, organización y
// duración, nunca el título ni el contenido de una entrada.

function formValues(formData: FormData): KnowledgeFormValues {
  return {
    title: String(formData.get("title") ?? ""),
    category: String(formData.get("category") ?? ""),
    content: String(formData.get("content") ?? ""),
    validFrom: String(formData.get("validFrom") ?? ""),
    validUntil: String(formData.get("validUntil") ?? ""),
  };
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

// Un rechazo del formulario conserva lo escrito y apunta al campo, si lo hay.
function formRejection(
  result: Exclude<CreateKnowledgeResult | UpdateKnowledgeResult, { ok: true }>,
  requestId: string,
  values: KnowledgeFormValues,
): KnowledgeFormState {
  if (result.code === "VALIDATION_ERROR" && "fields" in result) {
    return {
      status: "error",
      requestId,
      values,
      ...knowledgeFieldError(result.fields),
    };
  }
  return {
    status: "error",
    requestId,
    values,
    field: result.code === "CONFLICT" ? "title" : null,
    message:
      result.code === "CONFLICT"
        ? TITLE_TAKEN_MESSAGE
        : knowledgeChangeMessage(result.code, requestId),
  };
}

export async function createKnowledgeAction(
  _previous: KnowledgeFormState,
  formData: FormData,
): Promise<KnowledgeFormState> {
  const requestId = newRequestId();
  const route = "informacion.crear";
  const started = performance.now();
  const values = formValues(formData);
  // redirect lanza: la sesión se resuelve fuera del try.
  const context = await requireSession();

  let destination: string;
  try {
    const result = await createKnowledgeEntry(context, values);
    if (!result.ok) {
      logDone(started, requestId, route, result.code, context);
      return formRejection(result, requestId, values);
    }
    logDone(started, requestId, route, "OK", context);
    revalidatePath("/informacion");
    destination = `/informacion/${result.entryId}?aviso=creada`;
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

export async function updateKnowledgeAction(
  _previous: KnowledgeFormState,
  formData: FormData,
): Promise<KnowledgeFormState> {
  const requestId = newRequestId();
  const route = "informacion.editar";
  const started = performance.now();
  const values = formValues(formData);
  const entryId = String(formData.get("entryId") ?? "");
  const context = await requireSession();

  let destination: string;
  try {
    const result = await updateKnowledgeEntry(context, entryId, values);
    if (!result.ok) {
      logDone(started, requestId, route, result.code, context);
      return formRejection(result, requestId, values);
    }
    logDone(started, requestId, route, "OK", context);
    revalidatePath("/informacion");
    // Sin diferencias no hay aviso: nada cambió (brief-4.2, D-5).
    destination = result.changed
      ? `/informacion/${entryId}?aviso=editada`
      : `/informacion/${entryId}`;
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

async function runKnowledgeChange(
  route: string,
  notice: string,
  formData: FormData,
  operation: (
    context: AuthContext,
    entryId: string,
  ) => Promise<KnowledgeActiveResult>,
): Promise<KnowledgeChangeState> {
  const requestId = newRequestId();
  const started = performance.now();
  const entryId = String(formData.get("entryId") ?? "");
  const context = await requireSession();

  let destination: string;
  try {
    const result = await operation(context, entryId);
    if (!result.ok) {
      logDone(started, requestId, route, result.code, context);
      return {
        status: "error",
        requestId,
        message: knowledgeChangeMessage(result.code, requestId),
      };
    }
    logDone(started, requestId, route, "OK", context);
    revalidatePath("/informacion");
    destination = result.changed
      ? `/informacion/${entryId}?aviso=${notice}`
      : `/informacion/${entryId}`;
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

export async function deactivateKnowledgeAction(
  _previous: KnowledgeChangeState,
  formData: FormData,
): Promise<KnowledgeChangeState> {
  return runKnowledgeChange(
    "informacion.desactivar",
    "desactivada",
    formData,
    deactivateKnowledgeEntry,
  );
}

export async function reactivateKnowledgeAction(
  _previous: KnowledgeChangeState,
  formData: FormData,
): Promise<KnowledgeChangeState> {
  return runKnowledgeChange(
    "informacion.reactivar",
    "reactivada",
    formData,
    reactivateKnowledgeEntry,
  );
}

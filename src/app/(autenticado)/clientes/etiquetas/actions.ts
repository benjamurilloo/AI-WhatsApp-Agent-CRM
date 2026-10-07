"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  createClientTag,
  createSuggestedClientTags,
  deactivateClientTag,
  reactivateClientTag,
  updateClientTag,
  type CreateTagResult,
  type TagActiveResult,
  type UpdateTagResult,
} from "@/modules/crm";
import type { AuthContext } from "@/modules/organizations";
import { requireSession } from "@/app/_auth/session";
import { logEvent, newRequestId } from "@/shared/log";
import {
  TAG_NAME_TAKEN_MESSAGE,
  tagChangeMessage,
  tagFieldError,
  unexpectedErrorMessage,
  type ClientChangeState,
  type TagFormState,
  type TagFormValues,
} from "../messages";

// Server Actions de la pantalla 13, el catálogo de etiquetas (brief-16.1, FR-CLI-08). Next.js
// compara Origin con Host; la sesión, el rol y la organización se verifican en crm. El log lleva
// actor, organización, código y duración, nunca el nombre de la etiqueta.

const CATALOG = "/clientes/etiquetas";

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

function tagValues(formData: FormData): TagFormValues {
  return {
    name: String(formData.get("name") ?? ""),
    color: String(formData.get("color") ?? ""),
  };
}

// Alta y edición comparten el manejo de rechazos: el formulario conserva lo escrito.
async function runTagForm(
  route: string,
  formData: FormData,
  save: (
    context: AuthContext,
    values: TagFormValues,
  ) => Promise<
    | { ok: true; notice: string | null }
    | Exclude<CreateTagResult | UpdateTagResult, { ok: true }>
  >,
): Promise<TagFormState> {
  const requestId = newRequestId();
  const started = performance.now();
  const values = tagValues(formData);
  const context = await requireSession();

  let destination: string;
  try {
    const result = await save(context, values);
    if (!result.ok) {
      logDone(started, requestId, route, result.code, context);
      revalidatePath(CATALOG);
      if (result.code === "VALIDATION_ERROR" && "fields" in result) {
        return {
          status: "error",
          requestId,
          values,
          ...tagFieldError(result.fields),
        };
      }
      if (result.code === "CONFLICT") {
        return {
          status: "error",
          requestId,
          values,
          field: "name",
          message: TAG_NAME_TAKEN_MESSAGE,
        };
      }
      return {
        status: "error",
        requestId,
        values,
        field: null,
        message: tagChangeMessage(result, requestId),
      };
    }
    logDone(started, requestId, route, "OK", context);
    revalidatePath("/clientes");
    destination = result.notice ? `${CATALOG}?aviso=${result.notice}` : CATALOG;
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

export async function createTagAction(
  _previous: TagFormState,
  formData: FormData,
): Promise<TagFormState> {
  return runTagForm("etiquetas.crear", formData, async (context, values) => {
    const result = await createClientTag(context, values);
    return result.ok ? { ok: true, notice: "creada" } : result;
  });
}

export async function updateTagAction(
  _previous: TagFormState,
  formData: FormData,
): Promise<TagFormState> {
  const tagId = String(formData.get("tagId") ?? "");
  return runTagForm("etiquetas.editar", formData, async (context, values) => {
    const result = await updateClientTag(context, tagId, values);
    // Sin diferencias no hay aviso: nada cambió.
    return result.ok
      ? { ok: true, notice: result.changed ? "editada" : null }
      : result;
  });
}

// Crear las sugeridas, desactivar y reactivar: sin campos, con el mensaje del rechazo.
async function runTagChange(
  route: string,
  notice: string,
  operation: (
    context: AuthContext,
  ) => Promise<
    | { ok: true; changed: boolean }
    | Exclude<TagActiveResult, { ok: true }>
    | { ok: false; code: "FORBIDDEN" | "CONFLICT" }
  >,
): Promise<ClientChangeState> {
  const requestId = newRequestId();
  const started = performance.now();
  const context = await requireSession();

  let destination: string;
  try {
    const result = await operation(context);
    if (!result.ok) {
      logDone(started, requestId, route, result.code, context);
      revalidatePath(CATALOG);
      return {
        status: "error",
        requestId,
        message: tagChangeMessage(result, requestId),
      };
    }
    logDone(started, requestId, route, "OK", context);
    revalidatePath("/clientes");
    destination = result.changed ? `${CATALOG}?aviso=${notice}` : CATALOG;
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

// No lee el formulario: useActionState la llama igual con el estado y los datos, que ignora.
export async function createSuggestedTagsAction(): Promise<ClientChangeState> {
  return runTagChange("etiquetas.sugeridas", "sugeridas", async (context) => {
    const result = await createSuggestedClientTags(context);
    return result.ok ? { ok: true, changed: true } : result;
  });
}

export async function deactivateTagAction(
  _previous: ClientChangeState,
  formData: FormData,
): Promise<ClientChangeState> {
  const tagId = String(formData.get("tagId") ?? "");
  return runTagChange("etiquetas.desactivar", "desactivada", (context) =>
    deactivateClientTag(context, tagId),
  );
}

export async function reactivateTagAction(
  _previous: ClientChangeState,
  formData: FormData,
): Promise<ClientChangeState> {
  const tagId = String(formData.get("tagId") ?? "");
  return runTagChange("etiquetas.reactivar", "reactivada", (context) =>
    reactivateClientTag(context, tagId),
  );
}

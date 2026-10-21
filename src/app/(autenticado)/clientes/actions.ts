"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  assignClientTag,
  createClient,
  deactivateClient,
  reactivateClient,
  removeClientTag,
  suggestClients,
  updateClient,
  type ClientActiveResult,
  type ClientTagChangeResult,
} from "@/modules/crm";
import type { AuthContext } from "@/modules/organizations";
import { requireSession } from "@/app/_auth/session";
import type { RemoteSuggestion } from "@/app/_components/suggest-filter";
import { logEvent, newRequestId } from "@/shared/log";
import {
  clientChangeMessage,
  clientFieldError,
  PHONE_TAKEN_MESSAGE,
  tagChangeMessage,
  unexpectedErrorMessage,
  type ClientChangeState,
  type ClientFormState,
  type ClientFormValues,
} from "./messages";

// Server Actions de las pantallas 6 y 7 (brief-5.3). Next.js compara Origin con Host; la sesión,
// el rol y la organización se verifican en crm. El log lleva actor, organización, código y
// duración, nunca el nombre, el teléfono, las notas ni ningún otro dato del cliente (SecurityModel).

const FORM_FIELDS: (keyof ClientFormValues)[] = [
  "displayName",
  "phone",
  "notes",
  "email",
  "kind",
  "companyName",
  "jobTitle",
  "addressLine",
  "city",
  "province",
  "postalCode",
  "segment",
  "documentNumber",
  "instagram",
];

function clientValues(formData: FormData): ClientFormValues {
  return Object.fromEntries(
    FORM_FIELDS.map((field) => [field, String(formData.get(field) ?? "")]),
  ) as ClientFormValues;
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
async function runClientForm(
  route: string,
  formData: FormData,
  save: (
    context: AuthContext,
    values: ClientFormValues,
  ) => Promise<
    | { ok: true; destination: string }
    | Exclude<Awaited<ReturnType<typeof updateClient>>, { ok: true }>
  >,
): Promise<ClientFormState> {
  const requestId = newRequestId();
  const started = performance.now();
  const values = clientValues(formData);
  // redirect lanza: la sesión se resuelve fuera del try.
  const context = await requireSession();

  let destination: string;
  try {
    const result = await save(context, values);
    if (!result.ok) {
      logDone(started, requestId, route, result.code, context);
      revalidatePath("/clientes");
      if (result.code === "VALIDATION_ERROR" && "fields" in result) {
        return {
          status: "error",
          requestId,
          values,
          ...clientFieldError(result.fields),
        };
      }
      return {
        status: "error",
        requestId,
        values,
        field: result.code === "CONFLICT" ? "phone" : null,
        message:
          result.code === "CONFLICT"
            ? PHONE_TAKEN_MESSAGE
            : clientChangeMessage(result.code, requestId),
      };
    }
    logDone(started, requestId, route, "OK", context);
    revalidatePath("/clientes");
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

export async function createClientAction(
  _previous: ClientFormState,
  formData: FormData,
): Promise<ClientFormState> {
  return runClientForm("clientes.crear", formData, async (context, values) => {
    const result = await createClient(context, values);
    return result.ok
      ? {
          ok: true,
          destination: `/clientes/${result.clientId}?aviso=creado`,
        }
      : result;
  });
}

export async function updateClientAction(
  _previous: ClientFormState,
  formData: FormData,
): Promise<ClientFormState> {
  const clientId = String(formData.get("clientId") ?? "");
  return runClientForm("clientes.editar", formData, async (context, values) => {
    const result = await updateClient(context, clientId, values);
    // Sin diferencias no hay aviso: nada cambió.
    return result.ok
      ? {
          ok: true,
          destination: result.changed
            ? `/clientes/${clientId}?aviso=editado`
            : `/clientes/${clientId}`,
        }
      : result;
  });
}

async function runClientChange(
  route: string,
  notice: string,
  formData: FormData,
  operation: (
    context: AuthContext,
    clientId: string,
  ) => Promise<ClientActiveResult>,
): Promise<ClientChangeState> {
  const requestId = newRequestId();
  const started = performance.now();
  const clientId = String(formData.get("clientId") ?? "");
  const context = await requireSession();

  let destination: string;
  try {
    const result = await operation(context, clientId);
    if (!result.ok) {
      logDone(started, requestId, route, result.code, context);
      revalidatePath(`/clientes/${clientId}`);
      return {
        status: "error",
        requestId,
        message: clientChangeMessage(result.code, requestId),
      };
    }
    logDone(started, requestId, route, "OK", context);
    revalidatePath("/clientes");
    destination = result.changed
      ? `/clientes/${clientId}?aviso=${notice}`
      : `/clientes/${clientId}`;
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

export async function deactivateClientAction(
  _previous: ClientChangeState,
  formData: FormData,
): Promise<ClientChangeState> {
  return runClientChange(
    "clientes.desactivar",
    "desactivado",
    formData,
    deactivateClient,
  );
}

export async function reactivateClientAction(
  _previous: ClientChangeState,
  formData: FormData,
): Promise<ClientChangeState> {
  return runClientChange(
    "clientes.reactivar",
    "reactivado",
    formData,
    reactivateClient,
  );
}

// Poner y quitar una etiqueta en la ficha (brief-16.1, FR-CLI-09). El log no lleva el nombre de la
// etiqueta: dice algo sobre la persona.
async function runClientTagChange(
  route: string,
  notice: string,
  formData: FormData,
  operation: (
    context: AuthContext,
    clientId: string,
    tagId: string,
  ) => Promise<ClientTagChangeResult>,
): Promise<ClientChangeState> {
  const requestId = newRequestId();
  const started = performance.now();
  const clientId = String(formData.get("clientId") ?? "");
  const tagId = String(formData.get("tagId") ?? "");
  const context = await requireSession();

  let destination: string;
  try {
    const result = await operation(context, clientId, tagId);
    if (!result.ok) {
      logDone(started, requestId, route, result.code, context);
      revalidatePath(`/clientes/${clientId}`);
      return {
        status: "error",
        requestId,
        message: tagChangeMessage(result, requestId),
      };
    }
    logDone(started, requestId, route, "OK", context);
    revalidatePath("/clientes");
    destination = result.changed
      ? `/clientes/${clientId}?aviso=${notice}`
      : `/clientes/${clientId}`;
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

export async function assignClientTagAction(
  _previous: ClientChangeState,
  formData: FormData,
): Promise<ClientChangeState> {
  return runClientTagChange(
    "clientes.etiqueta.poner",
    "etiqueta-agregada",
    formData,
    assignClientTag,
  );
}

export async function removeClientTagAction(
  _previous: ClientChangeState,
  formData: FormData,
): Promise<ClientChangeState> {
  return runClientTagChange(
    "clientes.etiqueta.quitar",
    "etiqueta-quitada",
    formData,
    removeClientTag,
  );
}

// Sugerencias del buscador (brief-15.2, D-6): solo el nombre, nunca el teléfono. Lectura, sin
// mutar ni revalidar. La sesión antes de cualquier lectura; el rol y la organización, en crm. Ante
// un error inesperado devuelve una lista vacía y registra el evento, sin el texto buscado.
export async function suggestClientsAction(
  text: string,
): Promise<RemoteSuggestion[]> {
  const requestId = newRequestId();
  const started = performance.now();
  const context = await requireSession();
  try {
    if (typeof text !== "string") return [];
    const result = await suggestClients(context, text.slice(0, 100));
    if (!result.ok) return [];
    return result.clients.map((client) => ({
      id: client.id,
      label: client.name,
      href: `/clientes/${client.id}`,
    }));
  } catch (error) {
    logEvent({
      level: "error",
      requestId,
      route: "clientes.sugerencias",
      code: "INTERNAL",
      userId: context.userId,
      organizationId: context.organizationId,
      durationMs: performance.now() - started,
      error,
    });
    return [];
  }
}

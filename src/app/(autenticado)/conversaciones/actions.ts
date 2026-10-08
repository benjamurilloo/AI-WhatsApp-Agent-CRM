"use server";

import { revalidatePath } from "next/cache";
import {
  addConversationNote,
  changeAgentPause,
  changeConversationStatus,
  listConversationMessages,
  listConversationNotes,
} from "@/modules/conversations";
import { requireSession } from "@/app/_auth/session";
import { logEvent, newRequestId } from "@/shared/log";
import { toTimelineItems } from "./[conversationId]/timeline-items";
import {
  agentPauseChangedMessage,
  agentPauseErrorMessage,
  agentPauseUnchangedMessage,
  CONVERSATION_NOT_FOUND_MESSAGE,
  FORBIDDEN_ACTION_MESSAGE,
  loadMessagesErrorMessage,
  loadNotesErrorMessage,
  NOTE_ADDED_MESSAGE,
  noteErrorMessage,
  statusChangedMessage,
  statusChangeErrorMessage,
  statusUnchangedMessage,
  toNoteItems,
  unexpectedErrorMessage,
  type NoteFormState,
  type OlderMessagesResult,
  type OlderNotesResult,
  type StatusChangeState,
} from "./messages";

// Server Actions de la pantalla 9 (brief-6.4). Next.js compara Origin con Host; la sesión, el rol
// y la organización se verifican en conversations. El log lleva actor, organización, código y
// duración, nunca el contenido de los mensajes (SecurityModel).

export async function changeConversationStatusAction(
  _previous: StatusChangeState,
  formData: FormData,
): Promise<StatusChangeState> {
  const requestId = newRequestId();
  const started = performance.now();
  const route = "conversaciones.cambiar_estado";
  const conversationId = String(formData.get("conversationId") ?? "");
  const status = String(formData.get("status") ?? "");
  const context = await requireSession();
  const log = (code: Parameters<typeof logEvent>[0]["code"], error?: unknown) =>
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

  try {
    const result = await changeConversationStatus(context, {
      conversationId,
      status,
    });
    // Ante un rechazo también se revalida, para mostrar el estado real. Salvo FORBIDDEN: nada
    // cambió, y la página regenerada sin el formulario se llevaría el mensaje.
    const refresh = result.ok ? result.changed : result.code !== "FORBIDDEN";
    if (refresh) revalidatePath(`/conversaciones/${conversationId}`);
    if (!result.ok) {
      log(result.code);
      return {
        status: "error",
        requestId,
        message: statusChangeErrorMessage(result.code, requestId),
      };
    }
    log("OK");
    if (result.changed) revalidatePath("/conversaciones");
    // El estado ya se validó en el servicio.
    const chosen = status as Parameters<typeof statusChangedMessage>[0];
    return {
      status: "done",
      message: result.changed
        ? statusChangedMessage(chosen)
        : statusUnchangedMessage(chosen),
    };
  } catch (error) {
    log("INTERNAL", error);
    return {
      status: "error",
      requestId,
      message: unexpectedErrorMessage(requestId),
    };
  }
}

// Pausar o reanudar al agente desde la pantalla 9 (brief-16.3, D-4). La acción viene del botón; el
// rol, la organización y el estado se verifican en conversations.
export async function changeAgentPauseAction(
  _previous: StatusChangeState,
  formData: FormData,
): Promise<StatusChangeState> {
  const requestId = newRequestId();
  const started = performance.now();
  const route = "conversaciones.pausar_agente";
  const conversationId = String(formData.get("conversationId") ?? "");
  const action = String(formData.get("action") ?? "");
  const context = await requireSession();
  const log = (code: Parameters<typeof logEvent>[0]["code"], error?: unknown) =>
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

  try {
    const result = await changeAgentPause(context, { conversationId, action });
    // Como el cambio de estado: ante un rechazo se revalida para mostrar la marca real, salvo
    // FORBIDDEN.
    const refresh = result.ok ? result.changed : result.code !== "FORBIDDEN";
    if (refresh) revalidatePath(`/conversaciones/${conversationId}`);
    if (!result.ok) {
      log(result.code);
      return {
        status: "error",
        requestId,
        message: agentPauseErrorMessage(result.code, requestId),
      };
    }
    log("OK");
    if (result.changed) revalidatePath("/conversaciones");
    // La acción ya se validó en el servicio.
    const chosen = action as Parameters<typeof agentPauseChangedMessage>[0];
    return {
      status: "done",
      message: result.changed
        ? agentPauseChangedMessage(chosen)
        : agentPauseUnchangedMessage(chosen),
    };
  } catch (error) {
    log("INTERNAL", error);
    return {
      status: "error",
      requestId,
      message: unexpectedErrorMessage(requestId),
    };
  }
}

// Agregar una nota desde la pantalla 9 (brief-16.4, D-6). El rol y la organización se verifican en
// conversations. El log lleva el código, nunca el texto de la nota (invariante 2).
export async function addConversationNoteAction(
  _previous: NoteFormState,
  formData: FormData,
): Promise<NoteFormState> {
  const requestId = newRequestId();
  const started = performance.now();
  const route = "conversaciones.agregar_nota";
  const conversationId = String(formData.get("conversationId") ?? "");
  const body = String(formData.get("body") ?? "");
  const context = await requireSession();
  const log = (code: Parameters<typeof logEvent>[0]["code"], error?: unknown) =>
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

  try {
    const result = await addConversationNote(context, { conversationId, body });
    if (!result.ok) {
      log(result.code);
      const fields: readonly string[] = "fields" in result ? result.fields : [];
      return {
        status: "error",
        requestId,
        message: noteErrorMessage(result.code, requestId, fields),
        body,
        invalidBody: fields.includes("body"),
      };
    }
    log("OK");
    revalidatePath(`/conversaciones/${conversationId}`);
    return { status: "done", message: NOTE_ADDED_MESSAGE };
  } catch (error) {
    log("INTERNAL", error);
    return {
      status: "error",
      requestId,
      message: unexpectedErrorMessage(requestId),
      body,
      invalidBody: false,
    };
  }
}

// Lectura de las 25 notas anteriores a un cursor (brief-16.4, D-3), como los mensajes anteriores.
export async function loadOlderNotesAction(
  conversationId: string,
  before: string,
): Promise<OlderNotesResult> {
  const requestId = newRequestId();
  const started = performance.now();
  const context = await requireSession();

  try {
    if (typeof before !== "string" || before.trim() === "") {
      return { ok: false, message: loadNotesErrorMessage(requestId) };
    }
    const result = await listConversationNotes(
      context,
      String(conversationId),
      { before },
    );
    if (!result.ok) {
      return {
        ok: false,
        message:
          result.code === "FORBIDDEN"
            ? FORBIDDEN_ACTION_MESSAGE
            : result.code === "NOT_FOUND"
              ? CONVERSATION_NOT_FOUND_MESSAGE
              : loadNotesErrorMessage(requestId),
      };
    }
    return {
      ok: true,
      items: toNoteItems(result.notes, result.timezone),
      before: result.before,
    };
  } catch (error) {
    logEvent({
      level: "error",
      requestId,
      route: "conversaciones.notas_anteriores",
      code: "INTERNAL",
      userId: context.userId,
      organizationId: context.organizationId,
      durationMs: performance.now() - started,
      error,
    });
    return { ok: false, message: loadNotesErrorMessage(requestId) };
  }
}

// Lectura de los 50 mensajes anteriores a un cursor (D-3). No muta ni revalida, y solo registra
// los errores inesperados, para que el código que ve el usuario tenga su evento.
export async function loadOlderMessagesAction(
  conversationId: string,
  before: string,
): Promise<OlderMessagesResult> {
  const requestId = newRequestId();
  const started = performance.now();
  const context = await requireSession();

  try {
    // Un cursor vacío pediría los más recientes, que ya están en pantalla.
    if (typeof before !== "string" || before.trim() === "") {
      return { ok: false, message: loadMessagesErrorMessage(requestId) };
    }
    const result = await listConversationMessages(
      context,
      String(conversationId),
      { before },
    );
    if (!result.ok) {
      return {
        ok: false,
        message:
          result.code === "FORBIDDEN"
            ? FORBIDDEN_ACTION_MESSAGE
            : result.code === "NOT_FOUND"
              ? CONVERSATION_NOT_FOUND_MESSAGE
              : loadMessagesErrorMessage(requestId),
      };
    }
    return {
      ok: true,
      items: toTimelineItems(result.messages, result.timezone),
      before: result.before,
    };
  } catch (error) {
    logEvent({
      level: "error",
      requestId,
      route: "conversaciones.mensajes_anteriores",
      code: "INTERNAL",
      userId: context.userId,
      organizationId: context.organizationId,
      durationMs: performance.now() - started,
      error,
    });
    return { ok: false, message: loadMessagesErrorMessage(requestId) };
  }
}

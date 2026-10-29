"use client";

import { useActionState, useEffect, useRef } from "react";
import { ActionNotice } from "@/app/_components/action-notice";
import {
  fieldErrorClass,
  inputClass,
  labelClass,
} from "@/app/_components/form-styles";
import { Icon } from "@/app/_components/icons";
import { addConversationNoteAction } from "../actions";
import {
  NOTE_FIELD_HINT,
  NOTE_FIELD_LABEL,
  NOTE_LABEL,
  NOTE_NOT_SENT_NOTICE,
  NOTE_ONLY_TEAM_NOTICE,
  type NoteFormState,
} from "../messages";

// La nota interna al pie del hilo, solo para admin (brief-24.3, D-8; antes en la tarjeta «Notas»
// de la 16.4). Sin pestaña para responder al cliente: el CRM no envía mensajes (ADR 0017). La nota
// guardada aparece al final del hilo. El resultado se anuncia con aria-live; tras un rechazo se
// conserva lo escrito y el campo recibe el foco. Desde la 24.3.1, la forma del mockup 05
// (brief-24.3.1): el encabezado con candado, el aviso ámbar de que solo la ve el equipo y no sale por
// WhatsApp, y «Guardar nota» ámbar con candado. Sin «Adjuntar»: no hay dónde guardar archivos.

// El ámbar del botón: los colores de la marca ámbar invertidos, que tienen contraste en claro y en
// oscuro sin sumar un color al tema.
const saveNoteButtonClass =
  "inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-xl bg-on-warning-soft px-4 py-2 text-sm font-semibold text-warning-soft hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus disabled:opacity-60";

const initialState: NoteFormState = { status: "idle" };

export function NoteForm({
  conversationId,
  maxLength,
}: {
  conversationId: string;
  maxLength: number;
}) {
  const [state, formAction, pending] = useActionState(
    addConversationNoteAction,
    initialState,
  );
  const fieldRef = useRef<HTMLTextAreaElement>(null);
  const failed = state.status === "error";

  useEffect(() => {
    if (state.status === "error") fieldRef.current?.focus();
  }, [state]);

  return (
    <section
      aria-labelledby="nota-titulo"
      className="mt-6 border-t border-border pt-4"
    >
      <h2
        id="nota-titulo"
        className="inline-flex items-center gap-2 border-b-2 border-on-warning-soft pb-2 text-base font-semibold text-on-warning-soft"
      >
        <Icon name="lock" className="size-4" />
        {NOTE_LABEL}
      </h2>
      <p className="mt-4 flex items-start gap-2 rounded-xl bg-warning-soft px-4 py-3 text-sm text-on-warning-soft">
        <Icon name="lock" className="mt-0.5 size-4" />
        <span>
          <strong>{NOTE_ONLY_TEAM_NOTICE}</strong> {NOTE_NOT_SENT_NOTICE}
        </span>
      </p>
      <form action={formAction} className="mt-3 flex flex-col gap-2">
        <input type="hidden" name="conversationId" value={conversationId} />
        <label htmlFor="nota-texto" className={labelClass}>
          {NOTE_FIELD_LABEL}
        </label>
        <textarea
          ref={fieldRef}
          id="nota-texto"
          name="body"
          rows={3}
          required
          maxLength={maxLength}
          // Tras un rechazo, React reinicia el formulario a este valor: lo escrito se conserva.
          defaultValue={failed ? state.body : ""}
          aria-invalid={failed && state.invalidBody ? true : undefined}
          aria-describedby={failed ? "nota-error nota-ayuda" : "nota-ayuda"}
          className={inputClass}
        />
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p id="nota-ayuda" className="text-sm text-muted">
            {NOTE_FIELD_HINT}
          </p>
          <button
            type="submit"
            disabled={pending}
            className={saveNoteButtonClass}
          >
            <Icon name="lock" className="size-4" />
            {pending ? "Guardando…" : "Guardar nota"}
          </button>
        </div>
        <div aria-live="polite" aria-atomic="true">
          {state.status === "done" ? (
            <ActionNotice>{state.message}</ActionNotice>
          ) : state.status === "error" ? (
            <p id="nota-error" className={fieldErrorClass}>
              {state.message}
            </p>
          ) : null}
        </div>
      </form>
    </section>
  );
}

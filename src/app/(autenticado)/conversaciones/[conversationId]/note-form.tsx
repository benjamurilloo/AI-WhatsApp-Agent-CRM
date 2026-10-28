"use client";

import { useActionState, useEffect, useRef } from "react";
import { ActionNotice } from "@/app/_components/action-notice";
import {
  fieldErrorClass,
  inlineButtonClass,
  inputClass,
  labelClass,
} from "@/app/_components/form-styles";
import { Icon } from "@/app/_components/icons";
import { addConversationNoteAction } from "../actions";
import {
  NOTE_FIELD_HINT,
  NOTE_FIELD_LABEL,
  NOTE_LABEL,
  type NoteFormState,
} from "../messages";

// La nota interna al pie del hilo, solo para admin (brief-24.3, D-8; antes en la tarjeta «Notas»
// de la 16.4). Sin pestaña para responder al cliente: el CRM no envía mensajes (ADR 0017). La nota
// guardada aparece al final del hilo. El resultado se anuncia con aria-live; tras un rechazo se
// conserva lo escrito y el campo recibe el foco.

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
      className="mt-6 border-t border-border pt-5"
    >
      <h2
        id="nota-titulo"
        className="flex items-center gap-2 text-base font-semibold"
      >
        <Icon name="lock" className="size-4" />
        {NOTE_LABEL}
      </h2>
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
        <p id="nota-ayuda" className="text-sm text-muted">
          {NOTE_FIELD_HINT}
        </p>
        <button
          type="submit"
          disabled={pending}
          className={`self-start ${inlineButtonClass}`}
        >
          {pending ? "Guardando…" : "Guardar nota"}
        </button>
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

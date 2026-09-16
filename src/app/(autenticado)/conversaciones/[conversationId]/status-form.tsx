"use client";

import { useActionState, useEffect, useRef } from "react";
import {
  formMessageClass,
  inlineButtonClass,
  labelClass,
  noticeClass,
  selectClass,
} from "@/app/_components/form-styles";
import { changeConversationStatusAction } from "../actions";
import type { StatusChangeState } from "../messages";

// Cambio de estado de la pantalla 9, solo para admin (wireframe 09). El resultado se anuncia con
// aria-live; un error recibe el foco.

const initialState: StatusChangeState = { status: "idle" };

export function StatusForm({
  conversationId,
  current,
  options,
}: {
  conversationId: string;
  current: string;
  options: { value: string; label: string }[];
}) {
  const [state, formAction, pending] = useActionState(
    changeConversationStatusAction,
    initialState,
  );
  const errorRef = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    if (state.status === "error") errorRef.current?.focus();
  }, [state]);

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <input type="hidden" name="conversationId" value={conversationId} />
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1">
          <label htmlFor="status" className={labelClass}>
            Estado
          </label>
          {/* La clave reinicia la selección cuando el servidor devuelve otro estado. */}
          <select
            key={current}
            id="status"
            name="status"
            defaultValue={current}
            className={selectClass}
          >
            {options.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
        <button type="submit" disabled={pending} className={inlineButtonClass}>
          {pending ? "Cambiando…" : "Cambiar estado"}
        </button>
      </div>
      <div aria-live="polite" aria-atomic="true">
        {state.status === "done" ? (
          <p className={noticeClass}>{state.message}</p>
        ) : state.status === "error" ? (
          <p ref={errorRef} tabIndex={-1} className={formMessageClass}>
            {state.message}
          </p>
        ) : null}
      </div>
    </form>
  );
}

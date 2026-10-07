"use client";

import { useActionState, useEffect, useRef } from "react";
import {
  formMessageClass,
  inlineButtonClass,
  noticeClass,
  secondaryButtonClass,
} from "@/app/_components/form-styles";
import { changeAgentPauseAction } from "../actions";
import { CLOSED_NOT_PAUSABLE_TEXT, type StatusChangeState } from "../messages";

// Pausar o reanudar al agente en la pantalla 9, solo para admin (brief-16.3, D-4 y D-5). Un botón
// según la marca actual; en una conversación cerrada sin pausa no se ofrece pausar. El resultado
// se anuncia con aria-live; un error recibe el foco.

const initialState: StatusChangeState = { status: "idle" };

export function AgentPauseForm({
  conversationId,
  paused,
  canPause,
}: {
  conversationId: string;
  paused: boolean;
  canPause: boolean;
}) {
  const [state, formAction, pending] = useActionState(
    changeAgentPauseAction,
    initialState,
  );
  const errorRef = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    if (state.status === "error") errorRef.current?.focus();
  }, [state]);

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <input type="hidden" name="conversationId" value={conversationId} />
      {paused ? (
        <button
          type="submit"
          name="action"
          value="resume"
          disabled={pending}
          className={`self-start ${inlineButtonClass}`}
        >
          {pending ? "Reanudando…" : "Reanudar al agente"}
        </button>
      ) : canPause ? (
        <button
          type="submit"
          name="action"
          value="pause"
          disabled={pending}
          className={`self-start ${secondaryButtonClass}`}
        >
          {pending ? "Pausando…" : "Pausar al agente"}
        </button>
      ) : (
        <p className="text-sm">{CLOSED_NOT_PAUSABLE_TEXT}</p>
      )}
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

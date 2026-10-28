"use client";

import { useActionState, useEffect, useRef } from "react";
import {
  formMessageClass,
  inlineButtonClass,
  secondaryButtonClass,
} from "@/app/_components/form-styles";
import { ActionNotice } from "@/app/_components/action-notice";
import { Icon } from "@/app/_components/icons";
import { changeAgentPauseAction } from "../actions";
import {
  AGENT_ACTIVE_LABEL,
  AGENT_ACTIVE_STRIP_TEXT,
  AGENT_PAUSE_HINT,
  AGENT_PAUSED_LABEL,
  CLOSED_NOT_PAUSABLE_TEXT,
  HUMAN_ATTENTION_LABEL,
  REACTIVATE_AGENT_LABEL,
  TAKE_CONVERSATION_LABEL,
  type StatusChangeState,
} from "../messages";

// La franja del agente de la pantalla 9 (brief-24.3, D-7), debajo del encabezado y para los dos
// roles: «Atención humana · Agente pausado» con desde cuándo, o «Agente activo». Para un admin,
// «Tomar conversación» pausa y «Reactivar agente» reanuda, con un clic, como la tarjeta de la 16.3;
// una cerrada sin pausa no se toma. Un viewer no recibe el formulario. El resultado se anuncia con
// aria-live; un error recibe el foco.

const initialState: StatusChangeState = { status: "idle" };

export function AgentStrip({
  conversationId,
  pausedSince,
  canPause,
  canChange,
}: {
  conversationId: string;
  // Texto ya formateado en el servidor; null: el agente está activo.
  pausedSince: string | null;
  canPause: boolean;
  canChange: boolean;
}) {
  const paused = pausedSince !== null;
  return (
    <section
      aria-labelledby="agente-titulo"
      className={`mt-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border px-4 py-3 ${
        paused
          ? "border-transparent bg-warning-soft text-on-warning-soft"
          : "border-border bg-surface"
      }`}
    >
      <div className="flex min-w-0 items-start gap-3">
        <Icon
          name={paused ? "circlePause" : "power"}
          className="mt-0.5 size-5 shrink-0"
        />
        <div className="min-w-0">
          <h2 id="agente-titulo" className="font-semibold">
            {paused
              ? `${HUMAN_ATTENTION_LABEL} · ${AGENT_PAUSED_LABEL}`
              : `${AGENT_ACTIVE_LABEL} · ${AGENT_ACTIVE_STRIP_TEXT}`}
          </h2>
          <p className={`text-sm ${paused ? "" : "text-muted"}`}>
            {paused ? `${pausedSince}. ${AGENT_PAUSE_HINT}` : null}
            {!paused && canChange && !canPause
              ? CLOSED_NOT_PAUSABLE_TEXT
              : null}
          </p>
        </div>
      </div>
      {canChange ? (
        <AgentPauseButton
          conversationId={conversationId}
          paused={paused}
          canPause={canPause}
        />
      ) : null}
    </section>
  );
}

function AgentPauseButton({
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
    <form action={formAction} className="flex flex-col items-start gap-2">
      <input type="hidden" name="conversationId" value={conversationId} />
      {paused ? (
        <button
          type="submit"
          name="action"
          value="resume"
          disabled={pending}
          className={inlineButtonClass}
        >
          <Icon name="power" className="size-4" />
          {pending ? "Reactivando…" : REACTIVATE_AGENT_LABEL}
        </button>
      ) : canPause ? (
        <button
          type="submit"
          name="action"
          value="pause"
          disabled={pending}
          className={secondaryButtonClass}
        >
          <Icon name="user" className="size-4" />
          {pending ? "Tomando…" : TAKE_CONVERSATION_LABEL}
        </button>
      ) : null}
      <div aria-live="polite" aria-atomic="true">
        {state.status === "done" ? (
          <ActionNotice>{state.message}</ActionNotice>
        ) : state.status === "error" ? (
          <p ref={errorRef} tabIndex={-1} className={formMessageClass}>
            {state.message}
          </p>
        ) : null}
      </div>
    </form>
  );
}

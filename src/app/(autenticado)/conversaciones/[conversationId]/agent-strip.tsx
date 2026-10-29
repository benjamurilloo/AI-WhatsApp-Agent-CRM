"use client";

import {
  useActionState,
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import {
  formMessageClass,
  inlineButtonClass,
  outlineButtonClass,
  secondaryButtonClass,
} from "@/app/_components/form-styles";
import { ActionNotice } from "@/app/_components/action-notice";
import { useHydrated } from "@/app/_components/disclosure";
import { Icon } from "@/app/_components/icons";
import { changeAgentPauseAction } from "../actions";
import {
  AGENT_ACTIVE_LABEL,
  AGENT_ACTIVE_STRIP_TEXT,
  AGENT_PAUSED_LABEL,
  AGENT_PAUSED_STRIP_TEXT,
  CANCEL_LABEL,
  CLOSED_NOT_PAUSABLE_TEXT,
  HUMAN_ATTENTION_LABEL,
  REACTIVATE_AGENT_LABEL,
  TAKE_CONFIRM_TEXT,
  TAKE_CONFIRM_TITLE,
  TAKE_CONVERSATION_LABEL,
  type StatusChangeState,
} from "../messages";

// La franja del agente de la pantalla 9 (brief-24.3, D-7), debajo del encabezado y para los dos
// roles: «Atención humana · Agente pausado» con desde cuándo, o «Agente activo». Para un admin,
// «Tomar conversación» pausa y «Reactivar agente» reanuda, como la tarjeta de la 16.3; una cerrada
// sin pausa no se toma. Un viewer no recibe el formulario. El resultado se anuncia con aria-live;
// un error recibe el foco. Desde la 24.3.1, la forma de los mockups 02 y 05 (brief-24.3.1): lila
// con el ícono del agente cuando está activo, ámbar con el de persona cuando está pausado, y tomar
// pide confirmar en un panel que se cierra con Escape o «Cancelar» y devuelve el foco. Sin
// JavaScript, «Tomar conversación» envía directo.

const initialState: StatusChangeState = { status: "idle" };

// «Reactivar» y «agente», para acortar el botón en el teléfono.
const [REACTIVATE_VERB, ...REACTIVATE_WORDS] =
  REACTIVATE_AGENT_LABEL.split(" ");
const REACTIVATE_REST = REACTIVATE_WORDS.join(" ");

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
      className={`flex flex-wrap items-center justify-between gap-3 rounded-xl border px-4 py-3 ${
        paused
          ? "border-on-warning-soft/20 bg-warning-soft text-on-warning-soft"
          : "border-primary/20 bg-primary-soft/60 text-on-primary-soft"
      }`}
    >
      <div className="flex min-w-0 flex-1 items-start gap-3">
        <span
          aria-hidden="true"
          className={`grid size-9 shrink-0 place-items-center rounded-full ${paused ? "bg-on-warning-soft/10" : "bg-surface"}`}
        >
          <Icon name={paused ? "user" : "bot"} className="size-5" />
        </span>
        <div className="min-w-0">
          <h2 id="agente-titulo" className="font-semibold">
            {paused ? (
              // En el teléfono, en dos renglones como en 04; el nombre de la región no cambia.
              <>
                {HUMAN_ATTENTION_LABEL}
                <span className="max-sm:sr-only"> · </span>
                <span className="max-sm:block max-sm:text-sm max-sm:font-normal">
                  {AGENT_PAUSED_LABEL}
                </span>
              </>
            ) : (
              AGENT_ACTIVE_LABEL
            )}
          </h2>
          {/* En el teléfono, solo el título, como en 04. */}
          <p className="text-sm max-sm:hidden">
            {paused
              ? `${pausedSince}. ${AGENT_PAUSED_STRIP_TEXT}`
              : canChange && !canPause
                ? CLOSED_NOT_PAUSABLE_TEXT
                : AGENT_ACTIVE_STRIP_TEXT}
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
  const hydrated = useHydrated();
  const [confirming, setConfirming] = useState(false);
  const errorRef = useRef<HTMLParagraphElement>(null);
  const takeRef = useRef<HTMLButtonElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);
  const panelId = useId();

  useEffect(() => {
    if (state.status === "error") errorRef.current?.focus();
  }, [state]);

  useEffect(() => {
    if (confirming) confirmRef.current?.focus();
  }, [confirming]);

  function close() {
    setConfirming(false);
    takeRef.current?.focus();
  }

  function onKeyDown(event: KeyboardEvent) {
    if (event.key === "Escape" && confirming) {
      event.stopPropagation();
      close();
    }
  }

  return (
    <form
      action={formAction}
      onSubmit={() => setConfirming(false)}
      onKeyDown={onKeyDown}
      // Para tomar, en el teléfono ocupa el ancho: la confirmación se alinea al borde de la franja y
      // no se sale de la pantalla aunque el botón baje de renglón.
      className={`relative flex shrink-0 flex-col items-start gap-2 sm:items-end ${paused ? "" : "max-sm:w-full"}`}
    >
      <input type="hidden" name="conversationId" value={conversationId} />
      {paused ? (
        <button
          type="submit"
          name="action"
          value="resume"
          disabled={pending}
          className={outlineButtonClass}
        >
          {pending ? (
            "Reactivando…"
          ) : (
            // En el teléfono se lee «Reactivar», como en 04; el nombre sigue completo.
            <>
              {REACTIVATE_VERB}
              <span className="max-sm:sr-only"> {REACTIVATE_REST}</span>
            </>
          )}
        </button>
      ) : canPause ? (
        <>
          <button
            ref={takeRef}
            // Antes de hidratar envía directo; después abre la confirmación.
            type={hydrated ? "button" : "submit"}
            name={hydrated ? undefined : "action"}
            value={hydrated ? undefined : "pause"}
            aria-expanded={hydrated ? confirming : undefined}
            aria-controls={hydrated ? panelId : undefined}
            onClick={hydrated ? () => setConfirming(!confirming) : undefined}
            disabled={pending}
            className={outlineButtonClass}
          >
            {pending ? "Tomando…" : TAKE_CONVERSATION_LABEL}
          </button>
          {hydrated ? (
            <div
              id={panelId}
              role="group"
              aria-labelledby={`${panelId}-titulo`}
              hidden={!confirming}
              className="absolute top-full right-0 z-30 mt-2 w-80 max-w-[calc(100vw-2rem)] rounded-xl border border-border bg-surface p-4 text-foreground shadow-lg"
            >
              <p id={`${panelId}-titulo`} className="font-semibold">
                {TAKE_CONFIRM_TITLE}
              </p>
              <p className="mt-1 text-sm text-muted">{TAKE_CONFIRM_TEXT}</p>
              <div className="mt-3 flex gap-2">
                <button
                  ref={confirmRef}
                  type="submit"
                  name="action"
                  value="pause"
                  className={inlineButtonClass}
                >
                  {TAKE_CONVERSATION_LABEL}
                </button>
                <button
                  type="button"
                  onClick={close}
                  className={secondaryButtonClass}
                >
                  {CANCEL_LABEL}
                </button>
              </div>
            </div>
          ) : null}
        </>
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

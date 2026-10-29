"use client";

import { useActionState, useEffect, useRef } from "react";
import type { ConversationStatus } from "@/modules/conversations";
import { ActionNotice } from "@/app/_components/action-notice";
import {
  formMessageClass,
  inlineButtonClass,
} from "@/app/_components/form-styles";
import { Icon } from "@/app/_components/icons";
import {
  MoreActions,
  moreActionItemClass,
} from "@/app/_components/more-actions";
import { changeConversationStatusAction } from "../actions";
import {
  REOPEN_LABEL,
  STATUS_ACTION_LABEL,
  type StatusChangeState,
} from "../messages";

// Las acciones de estado del encabezado de la pantalla 9, solo para admin (brief-24.3, D-7). La
// principal es «Cerrar conversación» en una abierta o pendiente, y «Reabrir» en una cerrada; el
// otro estado va en «Más acciones». Cerrar no toca la pausa del agente (H-4). Cada botón es su
// propio formulario sobre la misma acción, así el resultado se anuncia en un solo lugar, con
// aria-live, y un error recibe el foco. Desde la 24.3.1, «Más acciones» es el botón «···» del mockup
// 02 (brief-24.3.1).

const initialState: StatusChangeState = { status: "idle" };

// El estado que ofrece «Más acciones» según el actual.
const SECONDARY: Record<ConversationStatus, ConversationStatus> = {
  open: "pending",
  pending: "open",
  closed: "pending",
};

export function StatusActions({
  conversationId,
  current,
}: {
  conversationId: string;
  current: ConversationStatus;
}) {
  const [state, formAction, pending] = useActionState(
    changeConversationStatusAction,
    initialState,
  );
  const errorRef = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    if (state.status === "error") errorRef.current?.focus();
  }, [state]);

  const primary: ConversationStatus = current === "closed" ? "open" : "closed";
  const secondary = SECONDARY[current];
  const hidden = (
    <input type="hidden" name="conversationId" value={conversationId} />
  );

  return (
    <div className="flex flex-col items-start gap-2 sm:items-end">
      <div className="flex flex-wrap items-start gap-3">
        <form action={formAction}>
          {hidden}
          <button
            type="submit"
            name="status"
            value={primary}
            disabled={pending}
            // En el teléfono, solo el ícono junto a «···», como en 04; el nombre no cambia.
            className={`${inlineButtonClass} max-sm:size-11 max-sm:px-0`}
          >
            <Icon
              name={primary === "closed" ? "check" : "undo"}
              className="size-4"
            />
            <span className="max-sm:sr-only">
              {primary === "closed" ? STATUS_ACTION_LABEL.closed : REOPEN_LABEL}
            </span>
          </button>
        </form>
        <MoreActions
          id="mas-acciones-conversacion"
          label="Más acciones de la conversación"
          iconOnly
        >
          <li>
            <form action={formAction}>
              {hidden}
              <button
                type="submit"
                name="status"
                value={secondary}
                disabled={pending}
                className={moreActionItemClass}
              >
                <Icon
                  name={secondary === "pending" ? "clock" : "circleCheck"}
                  className="size-4"
                />
                {STATUS_ACTION_LABEL[secondary]}
              </button>
            </form>
          </li>
        </MoreActions>
      </div>
      <div aria-live="polite" aria-atomic="true">
        {state.status === "done" ? (
          <ActionNotice>{state.message}</ActionNotice>
        ) : state.status === "error" ? (
          <p ref={errorRef} tabIndex={-1} className={formMessageClass}>
            {state.message}
          </p>
        ) : null}
      </div>
    </div>
  );
}

"use client";

import { useActionState, useEffect, useRef } from "react";
import {
  dangerButtonClass,
  formMessageClass,
  labelClass,
  selectClass,
} from "@/app/_components/form-styles";
import { voidTradeInAction } from "../actions";
import { VOID_REASON_LABEL, type ChangeState } from "../messages";

// La anulación de una recepción (brief-29.7, D-5 y D-7): el motivo de la lista y la confirmación.
// Funciona sin JavaScript; ante un rechazo muestra el mensaje y lleva el foco a él.

const idle: ChangeState = { status: "idle" };

export function VoidForm({ tradeInId }: { tradeInId: string }) {
  const [state, formAction, pending] = useActionState(voidTradeInAction, idle);
  const errorRef = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    if (state.status === "error") errorRef.current?.focus();
  }, [state]);
  return (
    <form action={formAction} className="flex flex-col gap-3">
      <input type="hidden" name="tradeInId" value={tradeInId} />
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <label htmlFor="motivo" className={labelClass}>
            Motivo
          </label>
          <select
            id="motivo"
            name="reason"
            required
            defaultValue=""
            className={selectClass}
          >
            <option value="">Elegí un motivo</option>
            {Object.entries(VOID_REASON_LABEL).map(([reason, label]) => (
              <option key={reason} value={reason}>
                {label}
              </option>
            ))}
          </select>
        </div>
        <button type="submit" disabled={pending} className={dangerButtonClass}>
          {pending ? "Anulando…" : "Anular la recepción"}
        </button>
      </div>
      <div aria-live="polite" aria-atomic="true">
        {state.status === "error" ? (
          <p ref={errorRef} tabIndex={-1} className={formMessageClass}>
            {state.message}
          </p>
        ) : null}
      </div>
    </form>
  );
}

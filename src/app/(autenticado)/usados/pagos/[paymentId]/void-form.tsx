"use client";

import { useActionState, useEffect, useRef } from "react";
import {
  dangerButtonClass,
  formMessageClass,
  labelClass,
  selectClass,
} from "@/app/_components/form-styles";
import { voidTradeInPaymentAction } from "../../actions";
import { PAYMENT_VOID_REASON_LABEL, type ChangeState } from "../../messages";

// La anulación del pago de un usado (brief-29.7.2, D-3 y D-6): el motivo de la lista y qué pasa con la
// caja. Funciona sin JavaScript; ante un rechazo muestra el mensaje y lleva el foco a él.

const idle: ChangeState = { status: "idle" };

export function VoidTradeInPaymentForm({
  paymentId,
  cashNote,
}: {
  paymentId: string;
  cashNote: string;
}) {
  const [state, formAction, pending] = useActionState(
    voidTradeInPaymentAction,
    idle,
  );
  const errorRef = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    if (state.status === "error") errorRef.current?.focus();
  }, [state]);
  return (
    <form action={formAction} className="flex flex-col gap-3">
      <input type="hidden" name="paymentId" value={paymentId} />
      <p className="text-sm text-muted">
        No se deshace: emite el comprobante de anulación. {cashNote}
      </p>
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <label htmlFor="pago-motivo" className={labelClass}>
            Motivo
          </label>
          <select
            id="pago-motivo"
            name="reason"
            required
            defaultValue=""
            className={selectClass}
          >
            <option value="">Elegí un motivo</option>
            {Object.entries(PAYMENT_VOID_REASON_LABEL).map(
              ([reason, label]) => (
                <option key={reason} value={reason}>
                  {label}
                </option>
              ),
            )}
          </select>
        </div>
        <button type="submit" disabled={pending} className={dangerButtonClass}>
          {pending ? "Anulando…" : "Anular el pago"}
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

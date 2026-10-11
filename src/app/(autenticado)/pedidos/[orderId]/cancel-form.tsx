"use client";

import { useActionState, useState } from "react";
import {
  dangerButtonClass,
  dangerOutlineLinkClass,
  formMessageClass,
  secondaryButtonClass,
} from "@/app/_components/form-styles";
import { cancelOrderAction } from "../actions";
import type { CancelState } from "../messages";

// Cancelar un pedido pendiente (brief-19.2; ADR 0020, punto 4), con confirmación: es una
// transición final y no se deshace. Sin JavaScript, el botón envía directo.

const initialState: CancelState = { status: "idle" };

export function CancelOrderForm({
  orderId,
  displayNumber,
}: {
  orderId: string;
  displayNumber: string;
}) {
  const [state, formAction, pending] = useActionState(
    cancelOrderAction,
    initialState,
  );
  const [confirming, setConfirming] = useState(false);

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <input type="hidden" name="orderId" value={orderId} />
      {state.status === "error" ? (
        <p role="alert" className={formMessageClass}>
          {state.message}
        </p>
      ) : null}
      {confirming ? (
        <div
          role="group"
          aria-labelledby="cancelar-pregunta"
          className="flex flex-col gap-3"
        >
          <p id="cancelar-pregunta" className="text-sm">
            ¿Cancelar el pedido {displayNumber}? No se puede deshacer: para
            volver a pedirlo hay que crear otro.
          </p>
          <div className="flex flex-wrap gap-3">
            <button
              type="submit"
              className={dangerButtonClass}
              disabled={pending}
            >
              {pending ? "Cancelando…" : "Sí, cancelar el pedido"}
            </button>
            <button
              type="button"
              className={secondaryButtonClass}
              onClick={() => setConfirming(false)}
            >
              No, volver
            </button>
          </div>
        </div>
      ) : (
        <div>
          <button
            type="submit"
            className={dangerOutlineLinkClass}
            onClick={(event) => {
              // Con JavaScript, primero se confirma.
              event.preventDefault();
              setConfirming(true);
            }}
          >
            Cancelar pedido
          </button>
        </div>
      )}
    </form>
  );
}

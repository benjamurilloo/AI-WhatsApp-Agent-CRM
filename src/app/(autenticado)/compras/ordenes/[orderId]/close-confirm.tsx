"use client";

import Link from "next/link";
import { useActionState, useEffect, useRef } from "react";
import {
  formMessageClass,
  inlineButtonClass,
  secondaryLinkClass,
} from "@/app/_components/form-styles";
import { closePurchaseOrderAction } from "../actions";
import type { CancelState } from "../messages";

// El cierre a mano, «cerrar con faltante», con confirmación en un segundo paso de la URL
// (?confirmar=cerrar; brief-22.4, D-9 y D-11), con el patrón de la cancelación. El foco va a la
// pregunta al abrirse.

const initialState: CancelState = { status: "idle" };

export function ClosePurchaseOrderConfirm({
  orderId,
  displayNumber,
}: {
  orderId: string;
  displayNumber: string;
}) {
  const [state, formAction, pending] = useActionState(
    closePurchaseOrderAction,
    initialState,
  );
  const titleRef = useRef<HTMLParagraphElement>(null);
  const errorRef = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    titleRef.current?.focus();
  }, []);
  useEffect(() => {
    if (state.status === "error") errorRef.current?.focus();
  }, [state]);

  return (
    <div
      role="group"
      aria-labelledby="confirmar-cerrar"
      className="flex flex-col gap-3 rounded-lg border border-border bg-surface-muted p-4"
    >
      <p
        id="confirmar-cerrar"
        ref={titleRef}
        tabIndex={-1}
        className="font-semibold"
      >
        ¿Cerrar la orden de compra {displayNumber} con faltante?
      </p>
      <p className="text-sm">
        Lo que falta ya no se recibe con esta orden. No se puede deshacer: si
        llega más mercadería, se registra una recepción sin orden.
      </p>
      <div aria-live="polite" aria-atomic="true">
        {state.status === "error" ? (
          <p ref={errorRef} tabIndex={-1} className={formMessageClass}>
            {state.message}
          </p>
        ) : null}
      </div>
      <form action={formAction} className="flex flex-wrap justify-end gap-3">
        <input type="hidden" name="orderId" value={orderId} />
        <Link
          href={`/compras/ordenes/${orderId}`}
          className={secondaryLinkClass}
        >
          No, volver
        </Link>
        <button type="submit" disabled={pending} className={inlineButtonClass}>
          {pending ? "Cerrando…" : "Sí, cerrar con faltante"}
        </button>
      </form>
    </div>
  );
}

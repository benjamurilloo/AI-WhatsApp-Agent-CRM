"use client";

import Link from "next/link";
import { useActionState, useEffect, useRef } from "react";
import {
  dangerButtonClass,
  formMessageClass,
  secondaryLinkClass,
} from "@/app/_components/form-styles";
import { cancelPurchaseOrderAction } from "../actions";
import type { CancelState } from "../messages";

// La cancelación con confirmación en un segundo paso de la URL (?confirmar=cancelar; brief-22.3,
// D-10), con el patrón de la desactivación del proveedor. El foco va a la pregunta al abrirse.

const initialState: CancelState = { status: "idle" };

export function CancelPurchaseOrderConfirm({
  orderId,
  displayNumber,
}: {
  orderId: string;
  displayNumber: string;
}) {
  const [state, formAction, pending] = useActionState(
    cancelPurchaseOrderAction,
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
      aria-labelledby="confirmar-cancelar"
      className="flex flex-col gap-3 rounded-lg border border-danger bg-danger-soft p-4"
    >
      <p
        id="confirmar-cancelar"
        ref={titleRef}
        tabIndex={-1}
        className="font-semibold text-on-danger-soft"
      >
        ¿Cancelar la orden de compra {displayNumber}?
      </p>
      <p className="text-sm text-on-danger-soft">
        No se puede deshacer: si hay que volver a pedirlo, se hace otra orden.
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
        <button type="submit" disabled={pending} className={dangerButtonClass}>
          {pending ? "Cancelando…" : "Sí, cancelar la orden"}
        </button>
      </form>
    </div>
  );
}

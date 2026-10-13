"use client";

import { useActionState, useEffect, useRef } from "react";
import Link from "next/link";
import {
  dangerButtonClass,
  formMessageClass,
  labelClass,
  linkClass,
  radioClass,
  secondaryLinkClass,
} from "@/app/_components/form-styles";
import { voidSaleAction } from "../actions";
import {
  VOID_ORDER_NOTE,
  VOID_REASON_LABEL,
  VOID_RESTOCK_NOTE,
  type VoidSaleState,
} from "../messages";

// La confirmación de «Anular venta» (brief-20.4, D-7), en el paso ?confirmar=anular del detalle,
// como «Emitir venta» en el pedido: funciona sin JavaScript. El motivo es un grupo de opciones
// obligatorio, de la lista cerrada (D-2). Dice antes de confirmar qué pasa con el stock. El foco va
// a la pregunta al abrirse. Si la venta ya está anulada, el error enlaza la anulación (D-6).

const initialState: VoidSaleState = { status: "idle" };

const REASONS = Object.entries(VOID_REASON_LABEL);

export function VoidSaleConfirm({
  saleId,
  displayNumber,
  hasOrder,
}: {
  saleId: string;
  displayNumber: string;
  hasOrder: boolean;
}) {
  const [state, formAction, pending] = useActionState(
    voidSaleAction,
    initialState,
  );
  const titleRef = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    titleRef.current?.focus();
  }, []);

  return (
    <div
      role="group"
      aria-labelledby="confirmar-anulacion"
      className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4"
    >
      <p
        id="confirmar-anulacion"
        ref={titleRef}
        tabIndex={-1}
        className="font-semibold"
      >
        ¿Anular la venta {displayNumber}?
      </p>
      <p className="text-sm">
        La anulación es otro comprobante, con su propio número, y anula la venta
        entera. {hasOrder ? VOID_ORDER_NOTE : VOID_RESTOCK_NOTE} Una anulación
        no se deshace.
      </p>
      {state.status === "error" ? (
        <div role="alert" className={formMessageClass}>
          <p>{state.message}</p>
          {state.existing ? (
            <p className="mt-1">
              <Link href={`/ventas/${saleId}/anulacion`} className={linkClass}>
                Ver la anulación {state.existing.displayNumber}
              </Link>
            </p>
          ) : null}
        </div>
      ) : null}
      <form action={formAction} className="flex flex-col gap-3">
        <input type="hidden" name="saleId" value={saleId} />
        <fieldset className="flex flex-col gap-2">
          <legend className={`${labelClass} mb-1`}>Motivo</legend>
          {REASONS.map(([value, label]) => (
            <label key={value} className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="reason"
                value={value}
                required
                className={radioClass}
              />
              {label}
            </label>
          ))}
        </fieldset>
        <div className="flex flex-wrap justify-end gap-3">
          <Link href={`/ventas/${saleId}`} className={secondaryLinkClass}>
            No, volver
          </Link>
          <button
            type="submit"
            disabled={pending}
            className={dangerButtonClass}
          >
            {pending ? "Anulando…" : "Sí, anular la venta"}
          </button>
        </div>
      </form>
    </div>
  );
}

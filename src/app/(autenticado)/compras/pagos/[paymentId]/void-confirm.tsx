"use client";

import { useActionState, useEffect, useRef } from "react";
import Link from "next/link";
import { Icon } from "@/app/_components/icons";
import {
  dangerButtonClass,
  formMessageClass,
  labelClass,
  linkClass,
  radioClass,
  secondaryLinkClass,
} from "@/app/_components/form-styles";
import { voidSupplierPaymentAction } from "../actions";
import { PAYMENT_VOID_REASON_LABEL, type VoidPaymentState } from "../messages";

// La confirmación de «Anular el pago» (brief-22.6, D-13), en el paso ?confirmar=anular del
// comprobante, con el molde de la anulación de la recepción: funciona sin JavaScript. El motivo es un
// grupo de opciones obligatorio, de la lista cerrada (D-4). Dice antes de confirmar qué pasa con la
// caja. El foco va a la pregunta al abrirse. Si ya está anulado, enlaza la anulación.
//
// De la tarjeta 4 de la lámina 17 se adopta **lo que dice** y no su forma (brief-24.8.2, H-10, V-24
// a V-26): el ícono de aviso junto a la pregunta y el aviso de la caja en su propio recuadro. Sigue
// sin ser un diálogo modal —es el paso `?confirmar=anular`, que es lo único que anda sin
// JavaScript— y el motivo **no viene elegido**: elegir por quien anula, en algo que no se deshace,
// es justamente lo que no se hace.

const initialState: VoidPaymentState = { status: "idle" };

const REASONS = Object.entries(PAYMENT_VOID_REASON_LABEL);

export function VoidSupplierPaymentConfirm({
  paymentId,
  displayNumber,
  cashNote,
}: {
  paymentId: string;
  displayNumber: string;
  cashNote: string;
}) {
  const [state, formAction, pending] = useActionState(
    voidSupplierPaymentAction,
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
      <div className="flex items-start gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-full bg-danger-soft text-on-danger-soft">
          <Icon name="alert" className="size-5" />
        </span>
        <p
          id="confirmar-anulacion"
          ref={titleRef}
          tabIndex={-1}
          className="font-semibold"
        >
          Anular pago {displayNumber}
        </p>
      </div>
      <p className="text-sm">
        La anulación es otro comprobante, con su propio número, y anula el pago
        entero: lo que se le debe al proveedor vuelve a crecer. Una anulación no
        se deshace.
      </p>
      <p className="flex items-start gap-2 rounded-xl bg-primary-soft px-3 py-2 text-sm text-on-primary-soft">
        <Icon name="info" className="mt-0.5 size-4 shrink-0" />
        <span>{cashNote}</span>
      </p>
      {state.status === "error" ? (
        <div role="alert" className={formMessageClass}>
          <p>{state.message}</p>
          {state.existing ? (
            <p className="mt-1">
              <Link
                href={`/compras/pagos/${paymentId}/anulacion`}
                className={linkClass}
              >
                Ver la anulación {state.existing.displayNumber}
              </Link>
            </p>
          ) : null}
        </div>
      ) : null}
      <form action={formAction} className="flex flex-col gap-3">
        <input type="hidden" name="paymentId" value={paymentId} />
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
          <Link
            href={`/compras/pagos/${paymentId}`}
            className={secondaryLinkClass}
          >
            Volver
          </Link>
          <button
            type="submit"
            disabled={pending}
            className={dangerButtonClass}
          >
            {pending ? "Anulando…" : "Anular pago"}
          </button>
        </div>
      </form>
    </div>
  );
}

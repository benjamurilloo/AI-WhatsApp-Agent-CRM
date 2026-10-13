"use client";

import Link from "next/link";
import { useActionState, useEffect, useRef } from "react";
import {
  formMessageClass,
  inlineButtonClass,
  linkClass,
  secondaryLinkClass,
} from "@/app/_components/form-styles";
import { issueSaleAction } from "../../ventas/actions";
import type { IssueSaleState } from "../../ventas/messages";

// La confirmación de «Emitir venta» (brief-20.2, D-4), en el paso ?confirmar=venta del detalle de
// un pedido entregado, como «Desactivar» en productos: funciona sin JavaScript. El foco va a la
// pregunta al abrirse. Si el pedido ya tiene venta, el error la enlaza.

const initialState: IssueSaleState = { status: "idle" };

export function IssueSaleConfirm({
  orderId,
  displayNumber,
}: {
  orderId: string;
  displayNumber: string;
}) {
  const [state, formAction, pending] = useActionState(
    issueSaleAction,
    initialState,
  );
  const titleRef = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    titleRef.current?.focus();
  }, []);

  return (
    <div
      role="group"
      aria-labelledby="confirmar-venta"
      className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4"
    >
      <p
        id="confirmar-venta"
        ref={titleRef}
        tabIndex={-1}
        className="font-semibold"
      >
        ¿Emitir la venta del pedido {displayNumber}?
      </p>
      <p className="text-sm">
        La venta copia el cliente, las líneas y el total del pedido, y toma el
        número siguiente. No mueve el stock: ya bajó al entregar. Una venta
        emitida no se edita ni se borra.
      </p>
      {state.status === "error" ? (
        <div role="alert" className={formMessageClass}>
          <p>{state.message}</p>
          {state.existing ? (
            <p className="mt-1">
              <Link href={`/ventas/${state.existing.id}`} className={linkClass}>
                Ver la venta {state.existing.displayNumber}
              </Link>
            </p>
          ) : null}
        </div>
      ) : null}
      <form action={formAction} className="flex flex-wrap justify-end gap-3">
        <input type="hidden" name="orderId" value={orderId} />
        <Link href={`/pedidos/${orderId}`} className={secondaryLinkClass}>
          No, volver
        </Link>
        <button type="submit" disabled={pending} className={inlineButtonClass}>
          {pending ? "Emitiendo…" : "Sí, emitir la venta"}
        </button>
      </form>
    </div>
  );
}

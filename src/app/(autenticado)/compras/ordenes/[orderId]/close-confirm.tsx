"use client";

import Link from "next/link";
import { useActionState, useEffect, useRef } from "react";
import {
  dangerButtonClass,
  formMessageClass,
  secondaryLinkClass,
} from "@/app/_components/form-styles";
import { Icon } from "@/app/_components/icons";
import { formatQuantity } from "@/shared/quantity";
import { closePurchaseOrderAction } from "../actions";
import { byQuantity, type CancelState } from "../messages";

// El cierre a mano, «cerrar con faltante», con confirmación en un segundo paso de la URL
// (?confirmar=cerrar; brief-22.4, D-9 y D-11), con el patrón de la cancelación. El foco va a la
// pregunta al abrirse.
//
// Desde la 24.8.1 lleva el contenido de la tarjeta 1 de la lámina de estados (brief-24.8.1, D-3 y
// V-16): el aviso ámbar con lo que se recibió y lo que va a quedar pendiente, las dos frases sobre
// recepciones y pagos, el «Estado de recepción» y los botones «Volver» y «Cerrar con faltante».
// **Sigue siendo un paso de la URL y no un diálogo modal**: es lo único que anda sin JavaScript,
// que es criterio de aceptación desde la 22.3.
//
// El botón de confirmar es rojo y la insignia del estado es ámbar: el README del lote reserva el
// ámbar al **estado** y el rojo al **control que confirma algo irreversible** (H-8).
//
// La lámina dice «ítems»; acá dice «unidades», porque una línea puede pedir 2,5 de algo y «2,5
// ítems» no se entiende. Declarado en el brief.
//
// Las cinco frases concuerdan en singular cuando la cantidad es una (V-28): la lámina escribe
// «Quedará 1 pendiente», y una orden de una sola unidad es el caso corriente del rubro.

const initialState: CancelState = { status: "idle" };

export function ClosePurchaseOrderConfirm({
  orderId,
  displayNumber,
  ordered,
  received,
  pending,
  backHref,
}: {
  orderId: string;
  displayNumber: string;
  ordered: string;
  received: string;
  pending: string;
  // La ficha con la página de la actividad que se estaba mirando (AC-8).
  backHref: string;
}) {
  const [state, formAction, submitting] = useActionState(
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
      className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4"
    >
      <p
        id="confirmar-cerrar"
        ref={titleRef}
        tabIndex={-1}
        className="text-lg font-bold tracking-tight"
      >
        Cerrar {displayNumber} con faltante
      </p>

      <p className="flex items-start gap-2 rounded-xl bg-warning-soft px-3 py-2 text-sm text-on-warning-soft">
        <Icon name="alert" className="mt-0.5 size-4 shrink-0" />
        <span>
          <span className="block font-semibold">
            Se cerrará la orden con faltante.
          </span>
          {byQuantity(received, "Se recibió", "Se recibieron")}{" "}
          {formatQuantity(received)} de {formatQuantity(ordered)}{" "}
          {byQuantity(ordered, "unidad", "unidades")}.{" "}
          {byQuantity(pending, "Quedará", "Quedarán")} {formatQuantity(pending)}{" "}
          {byQuantity(pending, "pendiente", "pendientes")}.
        </span>
      </p>

      <p className="text-sm">
        No modifica las recepciones ni los pagos.
        <br />
        Una vez cerrada, no se admitirán nuevas recepciones para esta orden: si
        llega más mercadería, se registra una recepción sin orden.
      </p>

      <div className="rounded-xl border border-border p-3">
        <p className="flex flex-wrap items-baseline justify-between gap-2">
          <span className="font-semibold">Estado de recepción</span>
          <span className="text-sm text-muted tabular-nums">
            {formatQuantity(ordered)}{" "}
            {byQuantity(ordered, "unidad", "unidades")} en total
          </span>
        </p>
        <ul className="mt-2 flex flex-col gap-1 text-sm">
          <li className="flex items-center gap-2">
            <Icon name="circleCheck" className="size-4 shrink-0 text-success" />
            <span className="tabular-nums">
              {formatQuantity(received)}{" "}
              {byQuantity(received, "recibida", "recibidas")}
            </span>
          </li>
          <li className="flex items-center gap-2">
            <Icon name="circleMinus" className="size-4 shrink-0 text-muted" />
            <span className="tabular-nums">
              {formatQuantity(pending)}{" "}
              {byQuantity(pending, "pendiente", "pendientes")}
            </span>
          </li>
        </ul>
      </div>

      <div aria-live="polite" aria-atomic="true">
        {state.status === "error" ? (
          <p ref={errorRef} tabIndex={-1} className={formMessageClass}>
            {state.message}
          </p>
        ) : null}
      </div>
      <form action={formAction} className="flex flex-wrap justify-end gap-3">
        <input type="hidden" name="orderId" value={orderId} />
        <Link href={backHref} className={secondaryLinkClass}>
          Volver
        </Link>
        <button
          type="submit"
          disabled={submitting}
          className={dangerButtonClass}
        >
          {submitting ? "Cerrando…" : "Cerrar con faltante"}
        </button>
      </form>
    </div>
  );
}

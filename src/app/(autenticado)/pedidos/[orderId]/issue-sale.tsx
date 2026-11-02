"use client";

import Link from "next/link";
import { useActionState, useEffect, useRef } from "react";
import {
  formMessageClass,
  inlineButtonClass,
  linkClass,
  secondaryLinkClass,
} from "@/app/_components/form-styles";
import { Icon } from "@/app/_components/icons";
import { issueSaleAction } from "../../ventas/actions";
import type { IssueSaleState } from "../../ventas/messages";

// La confirmación de «Emitir venta» (brief-20.2, D-4). Desde la 24.6.1 (brief-24.6.1, D-5; lámina
// 06) es un panel por URL en vez del paso `?confirmar=venta` en línea, y muestra el resumen
// económico que la lámina dibuja: total, seña existente y lo que faltará cobrar.
//
// Las tres afirmaciones de la lámina son reglas del ADR 0021, no promesas de la pantalla: la
// venta copia el pedido, no vuelve a descontar stock y la seña cuenta en ella. Funciona sin
// JavaScript. Si el pedido ya tiene venta, el error la enlaza en vez de emitir otra.

const initialState: IssueSaleState = { status: "idle" };

export function IssueSaleConfirm({
  orderId,
  displayNumber,
  total,
  deposited,
  outstanding,
  cancelHref,
}: {
  orderId: string;
  displayNumber: string;
  total: string;
  // Ya formateados por la página con lo que entrega `cash`; null si no se pudieron leer.
  deposited: string | null;
  outstanding: string | null;
  cancelHref: string;
}) {
  const [state, formAction, pending] = useActionState(
    issueSaleAction,
    initialState,
  );
  const titleRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    titleRef.current?.focus();
  }, []);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="orderId" value={orderId} />
      <h2
        id="panel-titulo"
        ref={titleRef}
        tabIndex={-1}
        className="text-lg font-bold tracking-tight"
      >
        Emitir la venta del pedido {displayNumber}
      </h2>

      <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 text-sm">
        <dt className="text-muted">Total del pedido</dt>
        <dd className="text-right tabular-nums">{total}</dd>
        {deposited !== null ? (
          <>
            <dt className="text-muted">Seña existente</dt>
            <dd className="text-right tabular-nums">{deposited}</dd>
          </>
        ) : null}
      </dl>

      {outstanding !== null ? (
        <p className="flex items-center justify-between gap-4 rounded-xl bg-primary-soft px-3 py-3 text-on-primary-soft">
          <span className="text-sm">Faltará cobrar</span>
          <span className="text-lg font-extrabold tabular-nums">
            {outstanding}
          </span>
        </p>
      ) : null}

      <ul className="flex flex-col gap-2 text-sm">
        {[
          "Copia cliente, equipos y precios del pedido.",
          "No vuelve a descontar stock: ya bajó al entregar.",
          "La seña contará en la venta.",
        ].map((text) => (
          <li key={text} className="flex items-start gap-2">
            <Icon name="circleCheck" className="mt-0.5 size-4 shrink-0" />
            <span>{text}</span>
          </li>
        ))}
      </ul>

      <p className="rounded-xl border border-border bg-surface-muted p-3 text-sm">
        <span className="font-semibold">
          La venta emitida no se edita ni se borra.
        </span>{" "}
        El número se asigna al confirmar.
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

      <div className="mt-2 flex flex-wrap justify-end gap-3">
        <Link href={cancelHref} className={secondaryLinkClass}>
          Volver
        </Link>
        <button type="submit" disabled={pending} className={inlineButtonClass}>
          {pending ? "Emitiendo…" : "Emitir venta"}
        </button>
      </div>
    </form>
  );
}

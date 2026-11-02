"use client";

import Link from "next/link";
import { useActionState, useEffect, useRef } from "react";
import type { OrderLineUnit } from "@/modules/orders";
import {
  dangerButtonClass,
  formMessageClass,
  inlineButtonClass,
  linkClass,
  secondaryLinkClass,
} from "@/app/_components/form-styles";
import { Icon } from "@/app/_components/icons";
import { formatMoney } from "@/shared/money";
import {
  cancelOrderAction,
  confirmOrderAction,
  deliverOrderAction,
} from "../actions";
import type { OrderTransitionName, TransitionState } from "../messages";

// Las transiciones de un pedido (brief-19.2 la cancelación; brief-19.3, D-8, confirmar y
// entregar). Desde la 24.6.1 (brief-24.6.1, D-5; láminas 03, 05 y 08) **el panel es la
// confirmación**: ya no hay un botón que abre una pregunta en línea, porque el botón vive en el
// encabezado y abre este panel por la URL.
//
// Eso hace dos cosas que las láminas piden y el paso en dos no podía dar: el cuerpo de la página
// queda inerte mientras se decide, y **no quedan dos controles activos** que ejecuten la misma
// transición —el del encabezado se dibuja deshabilitado—.
//
// Sin JavaScript anda igual: el panel es una página servida y el botón envía el formulario
// directo. El foco va al título al abrirse, que es correcto acá porque llegar al panel fue una
// navegación que la persona pidió.

const initialState: TransitionState = { status: "idle" };

const ACTIONS = {
  confirm: confirmOrderAction,
  deliver: deliverOrderAction,
  cancel: cancelOrderAction,
};

type Texts = {
  title: (displayNumber: string) => string;
  effect: string;
  warning: string | null;
  submit: string;
  pending: string;
  submitClass: string;
  cancelLabel: string;
};

function texts(transition: OrderTransitionName, releasesStock: boolean): Texts {
  switch (transition) {
    case "confirm":
      return {
        title: (n) => `¿Confirmar el pedido ${n}?`,
        effect:
          "Reservará los equipos guardados. El stock físico no cambia y no se registra un cobro.",
        warning:
          "La reserva es íntegra: si una unidad dejó de estar disponible, el pedido sigue pendiente y no se reserva ninguna.",
        submit: "Confirmar reserva",
        pending: "Confirmando…",
        submitClass: inlineButtonClass,
        cancelLabel: "Volver",
      };
    case "deliver":
      return {
        title: (n) => `¿Marcar entregado el pedido ${n}?`,
        effect:
          "Registrará la salida de stock y liberará la reserva. La venta se emite después: la entrega no registra un cobro.",
        warning: "Este paso no se puede deshacer.",
        submit: "Confirmar entrega",
        pending: "Entregando…",
        submitClass: inlineButtonClass,
        cancelLabel: "Volver",
      };
    case "cancel":
      return {
        title: (n) => `¿Cancelar el pedido ${n}?`,
        effect: releasesStock
          ? "Liberará los equipos reservados. Lo señado pasa a la cuenta del cliente: se aplica primero a sus ventas con saldo y el resto queda a favor. No se devuelve dinero automáticamente."
          : "No había reserva que liberar. Lo señado pasa a la cuenta del cliente: se aplica primero a sus ventas con saldo y el resto queda a favor. No se devuelve dinero automáticamente.",
        warning:
          "No se puede deshacer: un pedido cancelado no se reabre ni se edita. Para volver a pedirlo hay que crear otro.",
        submit: "Cancelar pedido",
        pending: "Cancelando…",
        submitClass: dangerButtonClass,
        cancelLabel: "Conservar pedido",
      };
  }
}

export function OrderTransitionForm({
  orderId,
  displayNumber,
  transition,
  units,
  currency,
  outstanding,
  cancelHref,
  stockHref,
  releasesStock = false,
}: {
  orderId: string;
  displayNumber: string;
  transition: OrderTransitionName;
  units: OrderLineUnit[];
  currency: string;
  // Lo que falta cobrar, ya formateado por la página con lo que entrega `cash`. Null si no se
  // pudo leer: entonces no se muestra el resumen económico, en vez de mostrar un cero falso.
  outstanding: string | null;
  cancelHref: string;
  // Dónde está el estado de stock de cada equipo, para el «Ver disponibilidad» de la lámina 08.
  stockHref: string;
  releasesStock?: boolean;
}) {
  const [state, formAction, pending] = useActionState(
    ACTIONS[transition],
    initialState,
  );
  const titleRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    titleRef.current?.focus();
  }, []);
  const t = texts(transition, releasesStock);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="orderId" value={orderId} />
      <h2
        id="panel-titulo"
        ref={titleRef}
        tabIndex={-1}
        className="text-lg font-bold tracking-tight"
      >
        {t.title(displayNumber)}
      </h2>

      {/* Qué equipo, antes del cambio: la lámina 03 y la 05 lo ponen arriba de todo, porque es lo
          único que distingue este pedido de otro con el mismo número de unidades. */}
      {units.length > 0 ? (
        <ul className="flex flex-col gap-2" aria-label="Equipos del pedido">
          {units.map((unit) => (
            <li
              key={unit.unitId}
              className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-xl border border-border bg-surface-muted px-3 py-2 text-sm"
            >
              <span className="font-mono">IMEI {unit.serial}</span>
              <span className="text-muted tabular-nums">
                {formatMoney(unit.unitPrice, currency)}
              </span>
              {unit.gradeName === null ? null : (
                <span className="text-muted">Grado {unit.gradeName}</span>
              )}
            </li>
          ))}
        </ul>
      ) : null}

      <p className="text-sm">{t.effect}</p>
      {t.warning ? (
        <p className="flex items-start gap-2 rounded-xl border border-border-strong bg-warning-soft p-3 text-sm text-on-warning-soft">
          <Icon name="alert" className="mt-0.5 size-4 shrink-0" />
          <span>{t.warning}</span>
        </p>
      ) : null}

      {outstanding !== null ? (
        <p className="flex items-center justify-between gap-4 rounded-xl bg-surface-muted px-3 py-2 text-sm">
          <span className="text-muted">Falta por cobrar</span>
          <span className="font-semibold tabular-nums">{outstanding}</span>
        </p>
      ) : null}

      {state.status === "error" ? (
        <div role="alert" className={formMessageClass}>
          <p>{state.message}</p>
          {state.details.length > 0 ? (
            <>
              <ul className="mt-1 list-disc pl-5">
                {state.details.map((detail, index) => (
                  // Dos productos pueden llamarse igual (R-9): la clave lleva la posición.
                  <li key={`${index}-${detail}`}>{detail}</li>
                ))}
              </ul>
              {/* El «Ver disponibilidad» de la lámina 08. En esta aplicación el estado de stock
                  de cada equipo está en la pestaña Resumen, columna «Estado de stock», que esta
                  subfase agrega: el enlace lleva ahí en vez de a una pantalla propia. */}
              <p className="mt-2">
                <Link href={stockHref} className={linkClass}>
                  Ver el estado de stock de los equipos
                </Link>
              </p>
            </>
          ) : null}
        </div>
      ) : null}

      {/* En la cancelación, «Conservar pedido» va primero y es el que recibe el foco del teclado
          antes que el destructivo, como pide la v2. */}
      <div className="mt-2 flex flex-wrap justify-end gap-3">
        <Link href={cancelHref} className={secondaryLinkClass}>
          {t.cancelLabel}
        </Link>
        <button type="submit" disabled={pending} className={t.submitClass}>
          {pending ? t.pending : t.submit}
        </button>
      </div>
    </form>
  );
}

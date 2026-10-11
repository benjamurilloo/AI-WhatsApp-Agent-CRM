"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import {
  dangerButtonClass,
  dangerOutlineLinkClass,
  formMessageClass,
  inlineButtonClass,
  secondaryButtonClass,
} from "@/app/_components/form-styles";
import {
  cancelOrderAction,
  confirmOrderAction,
  deliverOrderAction,
} from "../actions";
import type { OrderTransitionName, TransitionState } from "../messages";

// Las transiciones de un pedido (brief-19.2 la cancelación; brief-19.3, D-8, confirmar y entregar),
// cada una con su confirmación, que dice qué pasa con el stock. Sin JavaScript, el botón envía
// directo. El foco acompaña al teclado (revisión independiente, R-6): al pedir la confirmación va a
// «Sí, …», que lleva la pregunta como descripción; con «No, volver», regresa al botón.

const initialState: TransitionState = { status: "idle" };

const ACTIONS = {
  confirm: confirmOrderAction,
  deliver: deliverOrderAction,
  cancel: cancelOrderAction,
};

type Texts = {
  button: string;
  question: (displayNumber: string) => string;
  yes: string;
  pending: string;
  buttonClass: string;
  yesClass: string;
};

function texts(transition: OrderTransitionName, releasesStock: boolean): Texts {
  switch (transition) {
    case "confirm":
      return {
        button: "Confirmar pedido",
        question: (n) =>
          `¿Confirmar el pedido ${n}? Reserva el stock de cada línea: lo disponible de esos productos baja hasta que se entregue o se cancele.`,
        yes: "Sí, confirmar el pedido",
        pending: "Confirmando…",
        buttonClass: inlineButtonClass,
        yesClass: inlineButtonClass,
      };
    case "deliver":
      return {
        button: "Marcar entregado",
        question: (n) =>
          `¿Marcar entregado el pedido ${n}? Descuenta el stock de cada línea con un movimiento y libera lo reservado. No se puede deshacer.`,
        yes: "Sí, marcar entregado",
        pending: "Entregando…",
        buttonClass: inlineButtonClass,
        yesClass: inlineButtonClass,
      };
    case "cancel":
      return {
        button: "Cancelar pedido",
        question: (n) =>
          releasesStock
            ? `¿Cancelar el pedido ${n}? Libera el stock reservado. No se puede deshacer: para volver a pedirlo hay que crear otro.`
            : `¿Cancelar el pedido ${n}? No se puede deshacer: para volver a pedirlo hay que crear otro.`,
        yes: "Sí, cancelar el pedido",
        pending: "Cancelando…",
        buttonClass: dangerOutlineLinkClass,
        yesClass: dangerButtonClass,
      };
  }
}

export function OrderTransitionForm({
  orderId,
  displayNumber,
  transition,
  releasesStock = false,
}: {
  orderId: string;
  displayNumber: string;
  transition: OrderTransitionName;
  releasesStock?: boolean;
}) {
  const [state, formAction, pending] = useActionState(
    ACTIONS[transition],
    initialState,
  );
  const [confirming, setConfirming] = useState(false);
  // Solo se mueve el foco después de que la persona tocó un botón, nunca al cargar la página.
  const toggled = useRef(false);
  const startRef = useRef<HTMLButtonElement>(null);
  const yesRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!toggled.current) return;
    (confirming ? yesRef : startRef).current?.focus();
  }, [confirming]);
  const t = texts(transition, releasesStock);
  const questionId = `${transition}-pregunta`;

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <input type="hidden" name="orderId" value={orderId} />
      {state.status === "error" ? (
        <div role="alert" className={formMessageClass}>
          <p>{state.message}</p>
          {state.details.length > 0 ? (
            <ul className="mt-1 list-disc pl-5">
              {state.details.map((detail, index) => (
                // Dos productos pueden llamarse igual (R-9): la clave lleva la posición.
                <li key={`${index}-${detail}`}>{detail}</li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
      {confirming ? (
        <div
          role="group"
          aria-labelledby={questionId}
          className="flex flex-col gap-3"
        >
          <p id={questionId} className="text-sm">
            {t.question(displayNumber)}
          </p>
          <div className="flex flex-wrap gap-3">
            <button
              ref={yesRef}
              type="submit"
              aria-describedby={questionId}
              className={t.yesClass}
              disabled={pending}
            >
              {pending ? t.pending : t.yes}
            </button>
            <button
              type="button"
              className={secondaryButtonClass}
              onClick={() => {
                toggled.current = true;
                setConfirming(false);
              }}
            >
              No, volver
            </button>
          </div>
        </div>
      ) : (
        <div>
          <button
            ref={startRef}
            type="submit"
            className={t.buttonClass}
            onClick={(event) => {
              // Con JavaScript, primero se confirma.
              event.preventDefault();
              toggled.current = true;
              setConfirming(true);
            }}
          >
            {t.button}
          </button>
        </div>
      )}
    </form>
  );
}

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
import type { VoidFormState } from "@/app/(autenticado)/devoluciones/messages";

// La confirmación de una anulación (brief-21.5, D-9): la del cobro y la de la devolución, como
// «Anular venta» (brief-20.4, D-7). Funciona sin JavaScript. El motivo es un grupo de opciones
// obligatorio, de la lista cerrada (D-3). Dice antes de confirmar qué pasa con la caja. El foco va a
// la pregunta al abrirse. Si ya estaba anulado, el error lo dice y vuelve al comprobante.

const initialState: VoidFormState = { status: "idle" };

export function VoidForm({
  action,
  field,
  id,
  question,
  explanation,
  reasons,
  cancelHref,
  submitLabel,
}: {
  action: (
    previous: VoidFormState,
    formData: FormData,
  ) => Promise<VoidFormState>;
  field: "receiptId" | "refundId";
  id: string;
  question: string;
  explanation: string;
  reasons: [string, string][];
  cancelHref: string;
  submitLabel: string;
}) {
  const [state, formAction, pending] = useActionState(action, initialState);
  const titleRef = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    titleRef.current?.focus();
  }, []);

  return (
    <div
      role="group"
      aria-labelledby="confirmar-anulacion"
      className="flex flex-col gap-3"
    >
      <p
        id="confirmar-anulacion"
        ref={titleRef}
        tabIndex={-1}
        className="font-semibold"
      >
        {question}
      </p>
      <p className="text-sm">{explanation}</p>
      {state.status === "error" ? (
        <div role="alert" className={formMessageClass}>
          <p>{state.message}</p>
          {state.existing ? (
            <p className="mt-1">
              <Link href={cancelHref} className={linkClass}>
                Volver al comprobante
              </Link>
            </p>
          ) : null}
        </div>
      ) : null}
      <form action={formAction} className="flex flex-col gap-3">
        <input type="hidden" name={field} value={id} />
        <fieldset className="flex flex-col gap-2">
          <legend className={`${labelClass} mb-1`}>Motivo *</legend>
          {reasons.map(([value, label]) => (
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
          <Link href={cancelHref} className={secondaryLinkClass}>
            No, volver
          </Link>
          <button
            type="submit"
            disabled={pending}
            className={dangerButtonClass}
          >
            {pending ? "Anulando…" : submitLabel}
          </button>
        </div>
      </form>
    </div>
  );
}

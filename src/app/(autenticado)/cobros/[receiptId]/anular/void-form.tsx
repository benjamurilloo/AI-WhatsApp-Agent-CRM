"use client";

import { useActionState, useEffect, useRef } from "react";
import Link from "next/link";
import {
  dangerButtonClass,
  formMessageClass,
  labelClass,
  linkClass,
  secondaryLinkClass,
  selectClass,
} from "@/app/_components/form-styles";
import { Icon } from "@/app/_components/icons";
import type { VoidFormState } from "@/app/(autenticado)/devoluciones/messages";

// La confirmación de una anulación (brief-21.5, D-9): la del cobro y la de la devolución, como
// «Anular venta» (brief-20.4, D-7). Funciona sin JavaScript. El motivo es obligatorio y de la lista
// cerrada (D-3). Dice antes de confirmar qué pasa con la caja. El foco va a la pregunta al abrirse.
// Si ya estaba anulado, el error lo dice y vuelve al comprobante.
//
// Desde la 24.7.2-b tiene la forma de la tarjeta «¿Anular R-000183?» de la lámina 09 (D-4): el
// ícono, la pregunta corta, los tres datos en filas, el motivo en un `<select>`, el aviso de qué
// deja de contar y qué resta de la caja, y los dos botones. **La usan las dos anulaciones**, la del
// recibo y la de la devolución: son la misma pantalla con otro sustantivo (`Screens.md` §36), y
// rediseñar una sola las habría separado.

const initialState: VoidFormState = { status: "idle" };

export function VoidForm({
  action,
  field,
  id,
  question,
  details,
  explanation,
  reasons,
  cancelHref,
  cancelLabel,
  submitLabel,
}: {
  action: (
    previous: VoidFormState,
    formData: FormData,
  ) => Promise<VoidFormState>;
  field: "receiptId" | "refundId";
  id: string;
  question: string;
  // Los tres datos de la tarjeta: qué se aplicó, qué se recibió y de qué caja salió.
  details: { label: string; value: string }[];
  explanation: string;
  reasons: [string, string][];
  cancelHref: string;
  cancelLabel: string;
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
      className="flex flex-col gap-4"
    >
      <div className="flex items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-full bg-danger-soft text-on-danger-soft">
          <Icon name="fileText" className="size-5" />
        </span>
        <div className="min-w-0">
          <p
            id="confirmar-anulacion"
            ref={titleRef}
            tabIndex={-1}
            className="text-lg font-bold tracking-tight"
          >
            {question}
          </p>
          <dl className="mt-2 flex flex-col gap-1 text-sm">
            {details.map((row) => (
              <div key={row.label} className="flex flex-wrap gap-x-3">
                <dt className="w-28 shrink-0 text-muted">{row.label}</dt>
                <dd className="min-w-0 font-semibold tabular-nums">
                  {row.value}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </div>

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

      <form action={formAction} className="flex flex-col gap-4">
        <input type="hidden" name={field} value={id} />
        {/* El `<select>` lleva `w-full min-w-0`: su ancho mínimo es el de su opción más larga
            —413 px medidos en la 24.7.1— y sin eso desborda a 320 px. */}
        <div className="flex min-w-0 flex-col gap-1">
          <label htmlFor="anulacion-motivo" className={labelClass}>
            Motivo *
          </label>
          <select
            id="anulacion-motivo"
            name="reason"
            required
            defaultValue=""
            className={`${selectClass} w-full min-w-0`}
          >
            <option value="" disabled>
              Elegí un motivo
            </option>
            {reasons.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>

        <p className="flex items-start gap-2 rounded-xl border border-border bg-surface-muted px-3 py-2 text-sm">
          <Icon name="info" className="mt-0.5 size-4 shrink-0 text-muted" />
          <span>{explanation}</span>
        </p>

        <div className="flex flex-wrap justify-end gap-3">
          <Link href={cancelHref} className={secondaryLinkClass}>
            {cancelLabel}
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

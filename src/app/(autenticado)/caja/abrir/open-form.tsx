"use client";

import Link from "next/link";
import { useActionState, useEffect, useRef } from "react";
import {
  formMessageClass,
  inlineButtonClass,
  secondaryLinkClass,
} from "@/app/_components/form-styles";
import { openCashSessionAction } from "../actions";
import { CurrencyRowsFields, rowsToShow } from "../currency-rows";
import type { CurrencyRow, CurrencyRowsState } from "../messages";

// La apertura (brief-21.2, D-3): el efectivo contado en cada moneda, que puede ser cero. Propone lo
// contado en el último cierre. El foco va al mensaje del rechazo.

const initialState: CurrencyRowsState = { status: "idle" };

export function OpenForm({
  proposal,
  currencies,
}: {
  proposal: CurrencyRow[];
  currencies: string[];
}) {
  const [state, formAction, pending] = useActionState(
    openCashSessionAction,
    initialState,
  );
  const errorRef = useRef<HTMLParagraphElement>(null);
  const failed = state.status === "error";

  useEffect(() => {
    if (state.status === "error") errorRef.current?.focus();
  }, [state]);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <div aria-live="polite" aria-atomic="true">
        {failed ? (
          <p ref={errorRef} tabIndex={-1} className={formMessageClass}>
            {state.message}
          </p>
        ) : null}
      </div>
      <CurrencyRowsFields
        // Tras un rechazo, las filas enviadas; la clave fuerza los valores por defecto nuevos.
        key={failed ? state.requestId : "propuesta"}
        prefix="apertura"
        rows={rowsToShow(failed ? state.rows : proposal)}
        currencies={currencies}
        amountLabel="Efectivo inicial"
        rowErrors={failed ? state.rowErrors : {}}
      />
      <p className="text-sm text-muted">
        Cargá cada moneda que hay en la caja, aunque sea cero. Las filas vacías
        no se guardan.
      </p>
      <div className="flex flex-wrap justify-end gap-3">
        <Link href="/caja" className={secondaryLinkClass}>
          Cancelar
        </Link>
        <button type="submit" disabled={pending} className={inlineButtonClass}>
          {pending ? "Abriendo…" : "Abrir caja"}
        </button>
      </div>
    </form>
  );
}

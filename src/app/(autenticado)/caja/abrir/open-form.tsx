"use client";

import Link from "next/link";
import { useActionState, useEffect, useRef } from "react";
import {
  cardClass,
  formMessageClass,
  inlineButtonClass,
  linkClass,
  secondaryLinkClass,
} from "@/app/_components/form-styles";
import { Icon } from "@/app/_components/icons";
import { formatMoney } from "@/shared/money";
import { openCashSessionAction } from "../actions";
import { CurrencyRowsFields, rowsToShow } from "../currency-rows";
import type { CurrencyRow, CurrencyRowsState } from "../messages";

// La apertura (brief-21.2, D-3): el efectivo contado en cada moneda, que puede ser cero. El foco
// va al mensaje del rechazo.
//
// **Desde la 24.7.1 (D-6) los campos arrancan vacíos** y lo contado al cerrar la última sesión se
// muestra como referencia, con «Usar estos valores». El motivo está en `abrir/page.tsx`.

const initialState: CurrencyRowsState = { status: "idle" };

export function OpenForm({
  proposal,
  lastCount,
  currencies,
}: {
  proposal: CurrencyRow[];
  // Lo contado al cerrar la última sesión, para mostrarlo al lado. Vacío cuando ya se usó.
  lastCount: CurrencyRow[];
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

  // La lámina 02 pone el conteo anterior **al costado**, no al pie: ahí se ve mientras contás,
  // que es justamente el punto de D-6. La tarjeta la pone el formulario, como en el movimiento y en
  // el cierre, porque la columna de al lado es parte de la pantalla y no de su envoltorio.
  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,20rem)] lg:items-start">
      <form
        action={formAction}
        className={`${cardClass} flex flex-col gap-4 p-5 sm:p-6`}
      >
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
          Cargá cada moneda que hay en la caja, aunque sea cero. Las filas
          vacías no se guardan.
        </p>
        <div className="flex flex-wrap justify-end gap-3">
          <Link href="/caja" className={secondaryLinkClass}>
            Cancelar
          </Link>
          <button
            type="submit"
            disabled={pending}
            className={inlineButtonClass}
          >
            {pending ? "Abriendo…" : "Abrir caja"}
          </button>
        </div>
      </form>
      <LastCount rows={lastCount} />
    </div>
  );
}

// Lo contado al cerrar la última sesión (D-6), en la tarjeta «Antes de abrir» de la lámina 02. Es
// **un dato, no un valor cargado**: se ve, se puede usar de un clic, y no se da por contado. Sin
// cierre anterior la tarjeta no se dibuja, porque no hay nada que mostrar.
function LastCount({ rows }: { rows: CurrencyRow[] }) {
  const conMonto = rows.filter((row) => row.amount !== "");
  if (conMonto.length === 0) return null;
  return (
    <aside className={`${cardClass} p-5 text-sm sm:p-6`}>
      <p className="flex items-center gap-2 text-base font-semibold">
        <Icon name="history" className="size-4 text-muted" />
        Antes de abrir
      </p>
      <p className="mt-3 text-muted">Al cerrar la última sesión se contó:</p>
      <ul className="mt-1 flex flex-col gap-1 tabular-nums">
        {conMonto.map((row) => (
          <li key={row.currency} className="flex justify-between gap-4">
            <span className="font-mono">{row.currency}</span>
            <span className="font-semibold">
              {formatMoney(row.amount, row.currency)}
            </span>
          </li>
        ))}
      </ul>
      <p className="mt-4">
        <Link href="/caja/abrir?proponer=1" className={linkClass}>
          Usar estos valores
        </Link>{" "}
        y corregí lo que haga falta.
      </p>
    </aside>
  );
}

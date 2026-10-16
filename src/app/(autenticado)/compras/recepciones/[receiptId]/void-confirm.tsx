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
  tableCellClass,
  tableHeadCellClass,
} from "@/app/_components/form-styles";
import { formatQuantity } from "@/shared/quantity";
import { voidGoodsReceiptAction } from "../actions";
import {
  shortageText,
  VOID_COST_NOTE,
  VOID_ORDER_NOTE,
  VOID_REASON_LABEL,
  VOID_STOCK_NOTE,
  type VoidGoodsReceiptState,
} from "../messages";

// La confirmación de «Anular la recepción» (brief-22.5, D-9), en el paso ?confirmar=anular del
// detalle, con el molde de la anulación de la venta: funciona sin JavaScript. El motivo es un grupo de
// opciones obligatorio, de la lista cerrada (D-2). Dice antes de confirmar qué sale del stock, con lo
// disponible hoy, y que el costo no vuelve. El foco va a la pregunta al abrirse. Si no alcanza el
// stock, el error nombra cada producto; si ya está anulada, enlaza la anulación.

export type VoidConfirmLine = {
  productId: string;
  name: string;
  unit: string;
  quantity: string;
  // Lo disponible hoy, leído al mostrar la página: puede cambiar antes de confirmar.
  available: string;
};

const initialState: VoidGoodsReceiptState = { status: "idle" };

const REASONS = Object.entries(VOID_REASON_LABEL);

export function VoidGoodsReceiptConfirm({
  receiptId,
  displayNumber,
  hasOrder,
  lines,
  paidNote = null,
}: {
  receiptId: string;
  displayNumber: string;
  hasOrder: boolean;
  lines: VoidConfirmLine[];
  // Desde la 22.6 (brief-22.6, D-13; ADR 0023, punto 6): lo pagado contra ella pasa a la cuenta del
  // proveedor. Lo compone la página con cash: purchasing no lo sabe.
  paidNote?: string | null;
}) {
  const [state, formAction, pending] = useActionState(
    voidGoodsReceiptAction,
    initialState,
  );
  const titleRef = useRef<HTMLParagraphElement>(null);
  const names = new Map(lines.map((line) => [line.productId, line.name]));

  useEffect(() => {
    titleRef.current?.focus();
  }, []);

  return (
    <div
      role="group"
      aria-labelledby="confirmar-anulacion"
      className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4"
    >
      <p
        id="confirmar-anulacion"
        ref={titleRef}
        tabIndex={-1}
        className="font-semibold"
      >
        ¿Anular la recepción {displayNumber}?
      </p>
      <p className="text-sm">
        La anulación es otro comprobante, con su propio número, y anula la
        recepción entera. {VOID_STOCK_NOTE} {hasOrder ? VOID_ORDER_NOTE : null}{" "}
        Una anulación no se deshace.
      </p>
      <p className="text-sm font-semibold">{VOID_COST_NOTE}</p>
      {paidNote ? <p className="text-sm">{paidNote}</p> : null}
      <div
        className="overflow-x-auto"
        tabIndex={0}
        role="region"
        aria-label="Lo que sale del stock"
      >
        <table className="w-full border-collapse text-left text-sm">
          <caption className="sr-only">Lo que sale del stock</caption>
          <thead>
            <tr>
              <th scope="col" className={tableHeadCellClass}>
                Producto
              </th>
              <th scope="col" className={`${tableHeadCellClass} text-right`}>
                Sale
              </th>
              <th scope="col" className={`${tableHeadCellClass} text-right`}>
                Disponible hoy
              </th>
            </tr>
          </thead>
          <tbody>
            {lines.map((line) => (
              <tr key={line.productId}>
                <td className={tableCellClass}>{line.name}</td>
                <td
                  className={`${tableCellClass} text-right whitespace-nowrap tabular-nums`}
                >
                  {formatQuantity(line.quantity)}
                  <span className="text-muted"> {line.unit}</span>
                </td>
                <td
                  className={`${tableCellClass} text-right whitespace-nowrap tabular-nums`}
                >
                  {formatQuantity(line.available)}
                  <span className="text-muted"> {line.unit}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {state.status === "error" ? (
        <div role="alert" className={formMessageClass}>
          <p>{state.message}</p>
          {state.shortages.length > 0 ? (
            <ul className="mt-1 list-disc pl-5">
              {state.shortages.map((shortage) => (
                <li key={shortage.productId}>
                  <span className="font-semibold">
                    {names.get(shortage.productId) ?? "Un producto"}
                  </span>
                  : {shortageText(shortage)}
                </li>
              ))}
            </ul>
          ) : null}
          {state.existing ? (
            <p className="mt-1">
              <Link
                href={`/compras/recepciones/${receiptId}/anulacion`}
                className={linkClass}
              >
                Ver la anulación {state.existing.displayNumber}
              </Link>
            </p>
          ) : null}
        </div>
      ) : null}
      <form action={formAction} className="flex flex-col gap-3">
        <input type="hidden" name="receiptId" value={receiptId} />
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
            href={`/compras/recepciones/${receiptId}`}
            className={secondaryLinkClass}
          >
            No, volver
          </Link>
          <button
            type="submit"
            disabled={pending}
            className={dangerButtonClass}
          >
            {pending ? "Anulando…" : "Sí, anular la recepción"}
          </button>
        </div>
      </form>
    </div>
  );
}

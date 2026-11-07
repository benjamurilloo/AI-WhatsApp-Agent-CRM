"use client";

import { useActionState, useEffect, useRef } from "react";
import Link from "next/link";
import type { GoodsReceiptLineUnit } from "@/modules/purchasing";
import {
  UNIT_STATUS_ICON,
  UNIT_STATUS_LABEL,
  UNIT_STATUS_TONE,
} from "@/app/(autenticado)/productos/[productId]/unidades/messages";
import {
  dangerButtonClass,
  formMessageClass,
  labelClass,
  linkClass,
  secondaryLinkClass,
  selectClass,
  tableCellClass,
  tableHeadCellClass,
} from "@/app/_components/form-styles";
import { Icon } from "@/app/_components/icons";
import { StatusBadge } from "@/app/_components/status-badge";
import { formatMoney } from "@/shared/money";
import { formatQuantity } from "@/shared/quantity";
import { voidGoodsReceiptAction } from "../actions";
import {
  shortageText,
  voidBlockedDetail,
  voidBlockedHeading,
  VOID_BLOCKED_NOTE,
  VOID_CONFIRM_SUBTITLE,
  VOID_COST_NOTE,
  VOID_ORDER_NOTE,
  VOID_REASON_LABEL,
  VOID_STOCK_NOTE,
  type VoidGoodsReceiptState,
} from "../messages";

// La confirmación de «Anular la recepción» (brief-22.5, D-9), en el paso ?confirmar=anular del
// detalle, con el molde de la anulación de la venta: funciona sin JavaScript. El motivo es
// obligatorio y de la lista cerrada (D-2). Dice antes de confirmar qué sale del stock, con lo
// disponible hoy, y que el costo no vuelve. El foco va a la pregunta al abrirse. Si no alcanza el
// stock, el error nombra cada producto; si ya está anulada, enlaza la anulación.
//
// Desde la 24.8.1-b tiene el contenido del diálogo de la lámina 04 **sin el diálogo**
// (brief-24.8.1-b, D-6 y V-32): el título y su bajada, el motivo en un `<select>`, «Unidades a
// anular (N)» con el estado de hoy de cada unidad, «Al confirmar:» en tres viñetas y el recuadro
// «Importante». El modal no se adopta: necesitaría JavaScript, y sin él la anulación tiene que
// seguir andando.

export type VoidConfirmLine = {
  productId: string;
  name: string;
  unit: string;
  quantity: string;
  // Las unidades que creó la línea, con su estado de hoy (brief-24.8.1-b, D-2). Vacía en un
  // producto que se lleva por cantidad.
  units: GoodsReceiptLineUnit[];
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
  total,
  currency,
  paidNote = null,
}: {
  receiptId: string;
  displayNumber: string;
  hasOrder: boolean;
  lines: VoidConfirmLine[];
  // El total de la recepción, para la viñeta de la deuda que se retira (V-32).
  total: string;
  currency: string;
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
  // Las unidades de todas las líneas, con el costo unitario de la suya: la tabla de la lámina es
  // una sola, aunque la recepción tenga varias líneas por unidad.
  const units = lines.flatMap((line) =>
    line.units.map((unit) => ({
      ...unit,
      productId: line.productId,
      productName: line.name,
    })),
  );
  // El estado que se muestra cuando la anulación se bloquea (V-38) es el de esta lectura: por eso
  // el texto dice «figura como» y no afirma el estado de ahora.
  const bySerial = new Map(units.map((unit) => [unit.serial, unit]));

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
        {/* En afirmación, como la titula la lámina 04, y con el mismo precedente que la 24.8.1
            cerró para «Cerrar {número} con faltante» (su D-3). Jubila la pregunta de la 22.5. */}
        Anular recepción {displayNumber}
      </p>
      <p className="text-sm">{VOID_CONFIRM_SUBTITLE}</p>
      <p className="text-sm">
        La anulación es otro comprobante, con su propio número, y anula la
        recepción entera. {VOID_STOCK_NOTE} Una anulación no se deshace.
      </p>

      {units.length > 0 ? (
        <>
          <p className="text-sm font-semibold">
            Unidades a anular ({units.length})
          </p>
          <div
            className="overflow-x-auto"
            tabIndex={0}
            role="region"
            aria-label="Unidades a anular"
          >
            <table className="w-full border-collapse text-left text-sm">
              <caption className="sr-only">
                Unidades a anular, con su estado de hoy
              </caption>
              <thead>
                <tr>
                  {/* Sin columna «Unidad»: a cada unidad la identifica su IMEI, que es el
                      identificador real del rubro (D-3). */}
                  <th scope="col" className={tableHeadCellClass}>
                    IMEI
                  </th>
                  <th scope="col" className={tableHeadCellClass}>
                    Producto
                  </th>
                  <th scope="col" className={tableHeadCellClass}>
                    Estado
                  </th>
                </tr>
              </thead>
              <tbody>
                {units.map((unit) => (
                  <tr key={unit.unitId}>
                    <td className={`${tableCellClass} font-mono break-all`}>
                      {unit.serial}
                    </td>
                    <td className={tableCellClass}>{unit.productName}</td>
                    <td className={tableCellClass}>
                      <StatusBadge
                        tone={UNIT_STATUS_TONE[unit.status]}
                        icon={UNIT_STATUS_ICON[unit.status]}
                      >
                        {UNIT_STATUS_LABEL[unit.status]}
                      </StatusBadge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : null}

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

      {/* «Al confirmar:» de la lámina, en tres viñetas (V-32). La tercera solo cuando hay un pago
          vigente contra la recepción: sin pago, afirmarla sería falso. */}
      <div className="flex items-start gap-2 rounded-xl bg-primary-soft px-3 py-2 text-sm text-on-primary-soft">
        <Icon name="info" className="mt-0.5 size-4 shrink-0" />
        <div>
          <p className="font-semibold">Al confirmar:</p>
          <ul className="mt-1 list-disc pl-5">
            {units.length > 0 ? (
              <li>
                {units.length === 1
                  ? "se da de baja la unidad"
                  : `se dan de baja las ${units.length} unidades`}
                ;
              </li>
            ) : (
              <li>sale del stock lo que la recepción sumó;</li>
            )}
            <li>
              se retira {formatMoney(total, currency)} de la deuda con el
              proveedor;
            </li>
            {paidNote ? (
              <li>el pago vigente pasa a la cuenta del proveedor.</li>
            ) : null}
          </ul>
        </div>
      </div>

      {/* El recuadro «Importante» de la lámina, en ámbar. */}
      <div className="flex items-start gap-2 rounded-xl bg-warning-soft px-3 py-2 text-sm text-on-warning-soft">
        <Icon name="alert" className="mt-0.5 size-4 shrink-0" />
        <div>
          <p className="font-semibold">Importante</p>
          <p className="mt-1">
            {VOID_COST_NOTE} {hasOrder ? VOID_ORDER_NOTE : null}
          </p>
          {paidNote ? <p className="mt-1">{paidNote}</p> : null}
        </div>
      </div>

      {state.status === "error" ? (
        <div role="alert" className={formMessageClass}>
          {/* El bloqueo por una unidad que ya no está disponible nombra la unidad y su estado,
              con la forma de la tarjeta 17-3 (V-38). «Entendido» no se dibuja: no hay diálogo que
              cerrar, la confirmación sigue en la página. */}
          {state.blockedSerials.length > 0 ? (
            <>
              <p className="font-semibold">
                {voidBlockedHeading(displayNumber, state.blockedSerials)}
              </p>
              <ul className="mt-1 flex flex-col gap-1">
                {state.blockedSerials.map((serial) => {
                  const unit = bySerial.get(serial);
                  return (
                    <li key={serial}>
                      <span className="font-mono break-all">{serial}</span>:{" "}
                      {voidBlockedDetail(
                        unit ? UNIT_STATUS_LABEL[unit.status] : null,
                      )}{" "}
                      {unit ? (
                        <Link
                          href={`/productos/${unit.productId}/unidades`}
                          className={linkClass}
                        >
                          Ver unidad
                        </Link>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
              <p className="mt-1">{VOID_BLOCKED_NOTE}</p>
            </>
          ) : (
            <p>{state.message}</p>
          )}
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
        <div className="flex max-w-sm min-w-0 flex-col gap-1">
          <label htmlFor="motivo-anulacion" className={labelClass}>
            Motivo de anulación
          </label>
          {/* El `<select>` de la lámina. **Sin motivo elegido de entrada**: la lámina dibuja
              «Error de carga» ya seleccionado, y elegir por quien anula un motivo en una acción
              que no se deshace es exactamente lo que no se hace. */}
          <select
            id="motivo-anulacion"
            name="reason"
            required
            defaultValue=""
            className={`${selectClass} w-full min-w-0`}
          >
            <option value="" disabled>
              Elegí el motivo
            </option>
            {REASONS.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-wrap justify-end gap-3">
          <Link
            href={`/compras/recepciones/${receiptId}`}
            className={secondaryLinkClass}
          >
            <Icon name="chevronLeft" className="size-4" />
            Volver
          </Link>
          <button
            type="submit"
            disabled={pending}
            className={dangerButtonClass}
          >
            <Icon name="close" className="size-4" />
            {pending ? "Anulando…" : "Anular recepción"}
          </button>
        </div>
      </form>
    </div>
  );
}

"use client";

import { useEffect } from "react";
import { useHydrated } from "@/app/_components/disclosure";
import {
  inputClass,
  labelClass,
  secondaryButtonClass,
} from "@/app/_components/form-styles";
import { splitLineSerials } from "@/shared/lines";
import { formatMoney } from "@/shared/money";
import { searchOrderUnitsAction, type OrderUnitOption } from "../actions";
import { estimateLineTotal, estimateUnitsTotal } from "../estimate";
import type { OrderFormLine } from "../messages";

// La cantidad de una línea o, en un producto por unidad, sus IMEI (brief-29.5.2, D-5), para el alta
// del pedido y la venta sin pedido. Sin la capacidad serialized_units, solo la cantidad, como antes.
// Con ella, y sin JavaScript, se muestran los dos campos: el servicio sabe cuál vale por el producto.
// Con JavaScript, el campo de IMEI reemplaza a la cantidad en un producto por unidad, y debajo se
// listan sus unidades disponibles; elegir una agrega su IMEI. Cada fila envía siempre un valor de
// cada campo, vacío si no se ve, porque las líneas se leen por posición.

export type LineRow = OrderFormLine & {
  key: number;
  // Las unidades disponibles del producto, cuando ya se leyeron.
  unitOptions?: OrderUnitOption[];
};

// Una fila vacía.
export function blankLine(key: number): LineRow {
  return {
    key,
    productId: "",
    productText: "",
    quantity: "",
    expectedPriceId: "",
    price: null,
    serials: "",
    expectedLineTotal: "",
    unitTracked: false,
  };
}

// El subtotal estimado de una fila y el monto que viaja como esperado. En una línea por unidad, con el
// precio de cada IMEI elegido de la lista; si alguno no es de la lista, el estimado usa el del producto
// y no viaja como esperado: el servicio usa el de ahora, como sin JavaScript. Mientras la lista no se
// leyó, viaja el que devolvió el servidor tras un rechazo.
export function estimateRow(row: LineRow): {
  estimate: string | null;
  expectedLineTotal: string;
} {
  if (!row.price) return { estimate: null, expectedLineTotal: "" };
  const serials = splitLineSerials(row.serials);
  if (!row.unitTracked || serials.length === 0) {
    return {
      estimate: estimateLineTotal(
        row.price.amount,
        row.price.currency,
        row.quantity,
      ),
      expectedLineTotal: "",
    };
  }
  const units = new Map(
    (row.unitOptions ?? []).map((unit) => [
      unit.serial.toLowerCase(),
      unit.price,
    ]),
  );
  const estimated = estimateUnitsTotal(row.price, units, serials);
  if (!row.unitOptions) {
    return {
      estimate: estimated?.total ?? null,
      expectedLineTotal: row.expectedLineTotal,
    };
  }
  return {
    estimate: estimated?.total ?? null,
    expectedLineTotal: estimated?.known ? estimated.total : "",
  };
}

export function LineQuantity({
  row,
  unitsEnabled,
  invalid,
  describedBy,
  onChange,
}: {
  row: LineRow;
  unitsEnabled: boolean;
  invalid: boolean;
  describedBy: string | undefined;
  onChange: (change: Partial<LineRow>) => void;
}) {
  const hydrated = useHydrated();
  const byUnit = unitsEnabled && hydrated && row.unitTracked;
  if (byUnit) {
    const count = splitLineSerials(row.serials).length;
    return (
      <div className="flex flex-col gap-1">
        <span className={labelClass}>Cantidad</span>
        <p className="py-2 text-sm tabular-nums" aria-live="polite">
          {count === 1 ? "1 unidad" : `${count} unidades`}
        </p>
        <input type="hidden" name="quantity" value="" />
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={`cantidad-${row.key}`} className={labelClass}>
        Cantidad
      </label>
      <input
        id={`cantidad-${row.key}`}
        name="quantity"
        inputMode="decimal"
        autoComplete="off"
        value={row.quantity}
        onChange={(event) => onChange({ quantity: event.currentTarget.value })}
        className={inputClass}
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
      />
    </div>
  );
}

export function LineSerials({
  row,
  unitsEnabled,
  expectedLineTotal,
  invalid,
  describedBy,
  onChange,
}: {
  row: LineRow;
  unitsEnabled: boolean;
  // El monto que se envía como esperado: el estimado, si todos los IMEI son de la lista.
  expectedLineTotal: string;
  invalid: boolean;
  describedBy: string | undefined;
  onChange: (change: Partial<LineRow>) => void;
}) {
  const hydrated = useHydrated();
  const { productId, unitTracked, unitOptions } = row;
  const loading = hydrated && unitTracked && productId !== "" && !unitOptions;

  useEffect(() => {
    if (!loading) return;
    let cancelled = false;
    searchOrderUnitsAction(productId).then((units) => {
      if (!cancelled) onChange({ unitOptions: units });
    });
    return () => {
      cancelled = true;
    };
    // onChange cambia en cada render del formulario; la lista se pide una vez por producto.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, productId]);

  const hidden = (
    <>
      <input type="hidden" name="expectedLineTotal" value={expectedLineTotal} />
      <input type="hidden" name="unitTracked" value={unitTracked ? "1" : ""} />
    </>
  );
  if (!unitsEnabled || (hydrated && !unitTracked)) {
    return (
      <>
        <input type="hidden" name="serials" value="" />
        {hidden}
      </>
    );
  }
  const chosen = new Set(
    splitLineSerials(row.serials).map((serial) => serial.toLowerCase()),
  );
  const offered = (unitOptions ?? []).filter(
    (unit) => !chosen.has(unit.serial.toLowerCase()),
  );
  const helpId = `imei-${row.key}-ayuda`;
  return (
    <div className="flex flex-col gap-2 sm:col-span-3">
      <label htmlFor={`imei-${row.key}`} className={labelClass}>
        IMEI de las unidades
      </label>
      <textarea
        id={`imei-${row.key}`}
        name="serials"
        rows={2}
        autoComplete="off"
        spellCheck={false}
        value={row.serials}
        onChange={(event) => onChange({ serials: event.currentTarget.value })}
        className={`${inputClass} font-mono`}
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy ? `${helpId} ${describedBy}` : helpId}
      />
      <p id={helpId} className="text-sm text-muted">
        {hydrated
          ? "Uno por renglón; sirve un lector de códigos. La cantidad es la cantidad de IMEI."
          : "Solo en un producto que se vende por unidad: uno por renglón, y dejá la cantidad vacía."}
      </p>
      {hydrated && unitTracked && productId ? (
        <div className="flex flex-col gap-1">
          <p className="text-sm font-semibold">Unidades disponibles</p>
          {loading ? (
            <p className="text-sm text-muted">Buscando unidades…</p>
          ) : offered.length === 0 ? (
            <p className="text-sm text-muted">
              No quedan otras unidades disponibles de este producto.
            </p>
          ) : (
            <ul className="flex flex-col gap-1">
              {offered.map((unit) => (
                <li
                  key={unit.serial}
                  className="flex flex-wrap items-center gap-2 text-sm"
                >
                  <span className="font-mono">{unit.serial}</span>
                  <span className="text-muted">{unitDetail(unit)}</span>
                  <button
                    type="button"
                    className={secondaryButtonClass}
                    onClick={() =>
                      onChange({
                        serials: [
                          ...splitLineSerials(row.serials),
                          unit.serial,
                        ].join("\n"),
                      })
                    }
                  >
                    Agregar
                    <span className="sr-only"> el IMEI {unit.serial}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
      {hidden}
    </div>
  );
}

function unitDetail(unit: OrderUnitOption): string {
  return [
    unit.grade ? `Grado ${unit.grade}` : null,
    unit.batteryHealth === null ? null : `batería ${unit.batteryHealth} %`,
    unit.price
      ? formatMoney(unit.price.amount, unit.price.currency)
      : "precio del producto",
  ]
    .filter((part) => part !== null)
    .join(" · ");
}

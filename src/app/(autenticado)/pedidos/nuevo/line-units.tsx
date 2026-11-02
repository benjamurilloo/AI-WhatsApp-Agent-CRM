"use client";

import { useEffect, useRef, useState } from "react";
import type { ProductImageVersion } from "@/modules/catalog";
import { useHydrated } from "@/app/_components/disclosure";
import {
  inputClass,
  labelClass,
  secondaryButtonClass,
} from "@/app/_components/form-styles";
import { Icon } from "@/app/_components/icons";
import { splitLineSerials } from "@/shared/lines";
import { formatMoney } from "@/shared/money";
import { searchOrderUnitsAction, type OrderUnitOption } from "../actions";
import { estimateLineTotal, estimateUnitsTotal } from "../estimate";
import type { OrderFormLine } from "../messages";
import { unitPriceText } from "./unit-dialog";

// La cantidad de una línea o, en un producto por unidad, sus IMEI (brief-29.5.2, D-5), para el alta
// del pedido y la venta sin pedido. Sin la capacidad serialized_units, solo la cantidad, como antes.
// Con ella, y sin JavaScript, se muestran los dos campos: el servicio sabe cuál vale por el producto.
// Con JavaScript, el campo de IMEI reemplaza a la cantidad en un producto por unidad, y debajo se
// listan sus unidades disponibles; elegir una agrega su IMEI. Cada fila envía siempre un valor de
// cada campo, vacío si no se ve, porque las líneas se leen por posición.
//
// Desde la 24.6.1-b (D-2), `LineSerials` tiene **dos formas**, y la elige quien lo usa con la
// propiedad `chooseUnits`:
//
//   - **sin `chooseUnits`** —como la usa `/ventas/nueva`— queda exactamente la de arriba: el
//     `textarea` de IMEI y la lista de disponibles en línea, sin un píxel de diferencia;
//   - **con `chooseUnits`** —solo `/pedidos/nuevo`— los equipos elegidos se ven como chips, al lado
//     hay un campo para escanear o escribir un IMEI, y la lista de disponibles se muda al panel
//     «Elegir unidades» de la lámina 02.
//
// La divergencia es **temporal y por diseño**: el README de la v2 dice que las líneas de Ventas se
// arman «con los mismos patrones de producto, cantidad o equipos de Pedidos», así que la 24.6.2
// enciende la propiedad en una línea. Hasta entonces conviven las dos, y las dos se prueban
// (AC-9).

export type LineRow = OrderFormLine & {
  key: number;
  // Las unidades disponibles del producto, cuando ya se leyeron.
  unitOptions?: OrderUnitOption[];
  // La versión de la imagen principal del producto, para la miniatura del panel (24.6.1-b, D-3).
  unitImage?: ProductImageVersion;
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
  unitNoun,
}: {
  row: LineRow;
  unitsEnabled: boolean;
  invalid: boolean;
  describedBy: string | undefined;
  onChange: (change: Partial<LineRow>) => void;
  // La forma de la 24.6.1-b (D-2), solo donde quien usa el componente la enciende: cómo se nombra
  // lo que se cuenta —las dos altas pasan «equipos», la palabra de la lámina 02— y el recuadro
  // de campo de solo lectura que la lámina le da. Sin esto queda exactamente lo anterior.
  // `/ventas/nueva` la enciende desde la 24.6.2.
  unitNoun?: { one: string; many: string };
}) {
  const hydrated = useHydrated();
  const byUnit = unitsEnabled && hydrated && row.unitTracked;
  if (byUnit) {
    const count = splitLineSerials(row.serials).length;
    const words = unitNoun ?? { one: "unidad", many: "unidades" };
    return (
      <div className="flex flex-col gap-1">
        <span className={labelClass}>Cantidad</span>
        <p
          className={
            unitNoun
              ? "rounded-lg border border-border bg-surface-muted px-3 py-2 text-sm tabular-nums"
              : "py-2 text-sm tabular-nums"
          }
          aria-live="polite"
        >
          {count === 1 ? `1 ${words.one}` : `${count} ${words.many}`}
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
  chooseUnits,
}: {
  row: LineRow;
  unitsEnabled: boolean;
  // El monto que se envía como esperado: el estimado, si todos los IMEI son de la lista.
  expectedLineTotal: string;
  invalid: boolean;
  describedBy: string | undefined;
  onChange: (change: Partial<LineRow>) => void;
  // La forma de la 24.6.1-b, solo donde quien usa el componente la enciende (D-2). Sin esto queda
  // la forma anterior. `/ventas/nueva` la enciende desde la 24.6.2.
  chooseUnits?: { open: boolean; onOpen: () => void };
}) {
  const hydrated = useHydrated();
  // Lo que se está escaneando o escribiendo, que no se envía: al confirmarlo pasa a `serials`.
  const [scan, setScan] = useState("");
  const { productId, unitTracked, unitOptions } = row;
  const loading = hydrated && unitTracked && productId !== "" && !unitOptions;

  // Al cerrar el panel el foco vuelve al disparador, como en el diálogo de búsqueda.
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelOpen = chooseUnits?.open ?? false;
  const wasOpen = useRef(false);
  useEffect(() => {
    if (wasOpen.current && !panelOpen) triggerRef.current?.focus();
    wasOpen.current = panelOpen;
  }, [panelOpen]);

  useEffect(() => {
    if (!loading) return;
    let cancelled = false;
    // La miniatura la pide solo quien tiene panel. Desde la 24.6.2 lo tienen las dos altas.
    searchOrderUnitsAction(productId, chooseUnits !== undefined).then(
      (result) => {
        if (!cancelled)
          onChange({ unitOptions: result.units, unitImage: result.image });
      },
    );
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

  // La forma de la lámina 02 (D-2): chips de lo elegido, campo de escaneo y el disparador del panel.
  // La lista de disponibles no está acá: vive en el panel. Sin hidratar queda el camino servido
  // —el `textarea` y la lista en línea—, que es el que sigue andando sin JavaScript (V-3, AC-8).
  if (chooseUnits && hydrated) {
    const serials = splitLineSerials(row.serials);
    const known = new Map(
      (unitOptions ?? []).map((unit) => [unit.serial.toLowerCase(), unit]),
    );
    const priceOf = (serial: string): string => {
      const unit = known.get(serial.toLowerCase());
      if (unit) return unitPriceText(unit, row.price);
      return row.price
        ? formatMoney(row.price.amount, row.price.currency)
        : "Sin precio";
    };
    const add = (value: string) => {
      const serial = value.trim();
      if (serial === "") return;
      if (chosen.has(serial.toLowerCase())) {
        setScan("");
        return;
      }
      onChange({ serials: [...serials, serial].join("\n") });
      setScan("");
    };
    return (
      <div className="flex flex-col gap-3 sm:col-span-3">
        <div className="flex flex-col gap-1">
          <span className={labelClass}>Equipos seleccionados</span>
          {serials.length === 0 ? (
            <p className="rounded-xl border border-dashed border-border-strong px-3 py-2 text-sm text-muted">
              Todavía no elegiste equipos.
            </p>
          ) : (
            <ul
              aria-label={`Equipos seleccionados de ${row.productText}`}
              className="flex flex-wrap gap-2 rounded-xl border border-border p-2"
            >
              {serials.map((serial) => (
                <li
                  key={serial}
                  className="flex items-center gap-2 rounded-lg border border-border bg-surface-muted py-1 pr-1 pl-3 text-sm"
                >
                  <span className="font-mono break-all">{serial}</span>
                  <span className="text-muted tabular-nums">
                    {priceOf(serial)}
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      onChange({
                        serials: serials
                          .filter(
                            (other) =>
                              other.toLowerCase() !== serial.toLowerCase(),
                          )
                          .join("\n"),
                      })
                    }
                    // 44 px de lado, que es el objetivo táctil que pide el README de la v2
                    // (§Móvil y accesibilidad). `secondaryButtonClass` solo da unos 38, y con
                    // `px-2` bajaba a ~30: lo midió la revisión independiente.
                    className={`${secondaryButtonClass} min-h-11 min-w-11 justify-center px-2`}
                  >
                    <Icon name="close" className="size-4" />
                    <span className="sr-only">Quitar el IMEI {serial}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <label htmlFor={`imei-${row.key}`} className={labelClass}>
              Escanear o agregar IMEI
            </label>
            <input
              id={`imei-${row.key}`}
              autoComplete="off"
              spellCheck={false}
              placeholder="Ingresá el IMEI completo"
              value={scan}
              aria-invalid={invalid || undefined}
              aria-describedby={
                describedBy ? `${helpId} ${describedBy}` : helpId
              }
              onChange={(event) => setScan(event.currentTarget.value)}
              // Enter agrega el IMEI y **no** envía el formulario: también es lo que manda un
              // lector de códigos al terminar de leer.
              onKeyDown={(event) => {
                if (event.key !== "Enter") return;
                event.preventDefault();
                add(event.currentTarget.value);
              }}
              // El IMEI se escribe en monoespaciada, como los chips y el textarea servido,
              // pero el marcador es prosa en castellano y va en la tipografía del sistema.
              className={`${inputClass} font-mono placeholder:font-sans`}
            />
          </div>
          <button
            ref={triggerRef}
            type="button"
            aria-haspopup="dialog"
            aria-disabled={chooseUnits.open || undefined}
            disabled={productId === "" || loading}
            onClick={chooseUnits.onOpen}
            className={secondaryButtonClass}
          >
            {loading ? "Buscando unidades…" : "Elegir unidades"}
          </button>
        </div>
        <p id={helpId} className="text-sm text-muted">
          Escribí o escaneá el IMEI completo y apretá Enter, o elegí las
          unidades de la lista. La cantidad es la cantidad de equipos.
        </p>
        <input type="hidden" name="serials" value={row.serials} />
        {hidden}
      </div>
    );
  }

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

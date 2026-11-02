"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { ProductImageVersion } from "@/modules/catalog";
import {
  inlineButtonClass,
  inputClass,
  secondaryButtonClass,
} from "@/app/_components/form-styles";
import { Icon } from "@/app/_components/icons";
import { formatMoney } from "@/shared/money";
import { ProductThumbnail } from "../../productos/product-image-view";
import type { OrderUnitOption } from "../actions";

// El panel «Elegir unidades» del alta (brief-24.6.1-b, D-1; v2, V2-09 lámina 02): cabecera con el
// producto, su miniatura y su precio; buscador por IMEI; el recuento; la lista con una casilla por
// unidad; y el pie con «Volver» y «Usar selección».
//
// **No es un `<dialog>` modal.** Es un `role="dialog"` al costado, con el cuerpo del formulario
// `inert`, igual que los cinco paneles de la 24.6.1: `inert` cubre el cuerpo de la pantalla y no el
// marco de la aplicación, así que declarar `aria-modal` diría que atrapa un foco que no atrapa
// (V-4). Y a diferencia de los de la 24.6.1 **no se abre por la URL** (D-1): el borrador del pedido
// vive en estado de cliente y una navegación lo perdería.
//
// La selección es local al panel y recién sale con «Usar selección»: «Volver» no cambia nada. El
// buscador filtra **en memoria** sobre la lista que ya se leyó, así que abrir el panel y buscar no
// agrega ninguna consulta (AC-3).
//
// Diferencias con la lámina, decididas en el brief: las unidades se identifican por su IMEI y no
// por un código `U-0101`, que el modelo no tiene (V-1), y el IMEI se muestra completo, no
// enmascarado (V-2).

export const UNIT_DIALOG_TITLE = "Elegir unidades";
export const UNIT_SEARCH_LABEL = "Buscar por IMEI";
export const BACK_LABEL = "Volver";
export const USE_LABEL = "Usar selección";

// «3 disponibles · 1 seleccionada», con la cantidad de la lista que se está viendo, para que el
// recuento siempre coincida con lo que hay debajo (AC-4).
export function unitCountText(listed: number, selected: number): string {
  return [
    listed === 1 ? "1 disponible" : `${listed} disponibles`,
    selected === 1 ? "1 seleccionada" : `${selected} seleccionadas`,
  ].join(" · ");
}

// El detalle de una unidad: grado, batería y precio, en ese orden, como la lámina.
export function unitDetailText(unit: OrderUnitOption): string {
  return [
    unit.grade ? `Grado ${unit.grade}` : null,
    unit.batteryHealth === null ? null : `Batería ${unit.batteryHealth} %`,
  ]
    .filter((part) => part !== null)
    .join(" · ");
}

export function unitPriceText(
  unit: OrderUnitOption,
  fallback: { amount: string; currency: string } | null,
): string {
  if (unit.price) return formatMoney(unit.price.amount, unit.price.currency);
  if (fallback) return formatMoney(fallback.amount, fallback.currency);
  return "Sin precio";
}

export function UnitDialog({
  titleId,
  productId,
  productText,
  price,
  image,
  units,
  chosen,
  onUse,
  onClose,
}: {
  titleId: string;
  productId: string;
  productText: string;
  // El precio del producto, para la cabecera y para la unidad que no tiene el suyo.
  price: { amount: string; currency: string } | null;
  image: ProductImageVersion | undefined;
  units: OrderUnitOption[];
  // Los IMEI que ya están elegidos en la línea.
  chosen: string[];
  onUse: (serials: string[]) => void;
  onClose: () => void;
}) {
  const searchId = useId();
  const countId = useId();
  const searchRef = useRef<HTMLInputElement>(null);
  const [text, setText] = useState("");
  // La selección arranca de lo que la línea ya tiene y no sale hasta «Usar selección».
  const [selected, setSelected] = useState<string[]>(chosen);

  // El foco entra al buscador, que es lo primero que la lámina pone bajo la cabecera.
  useEffect(() => {
    searchRef.current?.focus();
  }, []);

  const listed = useMemo(() => {
    const needle = text.trim().toLowerCase();
    if (needle === "") return units;
    return units.filter((unit) => unit.serial.toLowerCase().includes(needle));
  }, [units, text]);

  const picked = new Set(selected.map((serial) => serial.toLowerCase()));

  return (
    <aside
      role="dialog"
      aria-labelledby={titleId}
      // Escape cierra sin aplicar, como «Volver».
      onKeyDown={(event) => {
        if (event.key !== "Escape") return;
        event.preventDefault();
        onClose();
      }}
      className="mt-6 flex w-full shrink-0 flex-col gap-4 rounded-2xl border border-border bg-surface p-5 sm:p-6 lg:mt-0 lg:w-96"
    >
      <div className="flex items-start justify-between gap-4">
        <h2 id={titleId} className="text-lg font-bold tracking-tight">
          {UNIT_DIALOG_TITLE}
        </h2>
        <button
          type="button"
          aria-label="Cerrar el panel de unidades"
          onClick={onClose}
          className={secondaryButtonClass}
        >
          <Icon name="close" className="size-4" />
        </button>
      </div>

      <div className="flex items-center gap-3">
        <ProductThumbnail productId={productId} version={image} />
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{productText}</p>
          <p className="text-sm text-muted tabular-nums">
            {price ? formatMoney(price.amount, price.currency) : "Sin precio"}
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor={searchId} className="sr-only">
          {UNIT_SEARCH_LABEL}
        </label>
        <div className="relative">
          <Icon
            name="search"
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted"
          />
          <input
            ref={searchRef}
            id={searchId}
            type="search"
            autoComplete="off"
            spellCheck={false}
            placeholder={`${UNIT_SEARCH_LABEL}…`}
            value={text}
            aria-describedby={countId}
            onChange={(event) => setText(event.currentTarget.value)}
            // El panel vive dentro del formulario del alta: Enter acá no lo envía.
            onKeyDown={(event) => {
              if (event.key === "Enter") event.preventDefault();
            }}
            className={`${inputClass} pl-9`}
          />
        </div>
      </div>

      <p id={countId} aria-live="polite" className="text-sm text-muted">
        {unitCountText(listed.length, selected.length)}
      </p>

      {listed.length === 0 ? (
        <p className="text-sm text-muted">
          {units.length === 0
            ? "No hay unidades disponibles de este producto."
            : "Ninguna unidad coincide con lo buscado."}
        </p>
      ) : (
        <ul className="flex max-h-96 flex-col gap-2 overflow-y-auto">
          {listed.map((unit) => {
            const isPicked = picked.has(unit.serial.toLowerCase());
            return (
              <li key={unit.serial}>
                <label
                  className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 ${
                    isPicked
                      ? "border-primary bg-primary-soft text-on-primary-soft"
                      : "border-border bg-surface"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={isPicked}
                    onChange={() =>
                      setSelected((current) =>
                        isPicked
                          ? current.filter(
                              (serial) =>
                                serial.toLowerCase() !==
                                unit.serial.toLowerCase(),
                            )
                          : [...current, unit.serial],
                      )
                    }
                    className="mt-0.5 size-4 shrink-0 accent-primary"
                  />
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="flex flex-wrap items-baseline justify-between gap-2">
                      <span className="font-mono text-sm break-all">
                        {unit.serial}
                      </span>
                      <span className="text-sm font-semibold tabular-nums">
                        {unitPriceText(unit, price)}
                      </span>
                    </span>
                    {unitDetailText(unit) ? (
                      <span className="text-sm text-muted">
                        {unitDetailText(unit)}
                      </span>
                    ) : null}
                  </span>
                </label>
              </li>
            );
          })}
        </ul>
      )}

      <div className="mt-auto flex flex-wrap gap-2 pt-2">
        <button
          type="button"
          onClick={onClose}
          className={`${secondaryButtonClass} flex-1 justify-center`}
        >
          {BACK_LABEL}
        </button>
        <button
          type="button"
          onClick={() => onUse(selected)}
          className={`${inlineButtonClass} flex-1 justify-center`}
        >
          {USE_LABEL}
        </button>
      </div>
    </aside>
  );
}

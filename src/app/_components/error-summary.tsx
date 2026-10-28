"use client";

import type { MouseEvent, Ref } from "react";
import { Icon } from "./icons";

// Resumen de errores al comienzo de un formulario (brief-24.1, D-8; criterios v2, §Formularios):
// cuántos campos hay que revisar y un enlace a cada uno. Después de un envío rechazado el foco va
// al resumen, que se lee entero; no lleva una región viva para no leerse dos veces. Las acciones
// devuelven a lo sumo un campo (brief-24.1, H-6), así que hoy lista uno. Un error sin campo se
// muestra solo, con su mensaje.

export type SummaryError = { field: string | null; message: string };

export function errorSummaryTitle(fieldCount: number): string {
  if (fieldCount === 0) return "No se pudo guardar";
  return fieldCount === 1
    ? "Revisá 1 campo para guardar"
    : `Revisá ${fieldCount} campos para guardar`;
}

// El enlace lleva el foco al campo: un ancla sola mueve la vista, pero no siempre el foco.
function focusField(event: MouseEvent<HTMLAnchorElement>, field: string) {
  const target = document.getElementById(field);
  if (!target) return;
  event.preventDefault();
  target.focus();
  target.scrollIntoView({ block: "center" });
}

export function ErrorSummary({
  id,
  errors,
  ref,
}: {
  id: string;
  errors: readonly SummaryError[];
  ref?: Ref<HTMLDivElement>;
}) {
  const withField = errors.filter((error) => error.field !== null);
  const general = errors.filter((error) => error.field === null);
  const titleId = `${id}-titulo`;
  return (
    <div
      ref={ref}
      id={id}
      tabIndex={-1}
      role="group"
      aria-labelledby={titleId}
      className="flex gap-3 rounded-xl border border-danger bg-danger-soft px-4 py-3 text-on-danger-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
    >
      <Icon name="alert" className="mt-0.5 size-5" />
      <div className="min-w-0">
        <p id={titleId} className="font-semibold">
          {errorSummaryTitle(withField.length)}
        </p>
        {general.map((error) => (
          <p key={error.message} className="mt-1 text-sm">
            {error.message}
          </p>
        ))}
        {withField.length > 0 ? (
          <ul className="mt-1 flex flex-col gap-1 text-sm">
            {withField.map((error) => (
              <li key={error.field}>
                <a
                  href={`#${error.field}`}
                  onClick={(event) => focusField(event, error.field ?? "")}
                  className="rounded-sm font-semibold underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
                >
                  {error.message}
                </a>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </div>
  );
}

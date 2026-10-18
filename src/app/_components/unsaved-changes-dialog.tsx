"use client";

import { useEffect, useId, useRef } from "react";
import {
  dangerButtonClass,
  secondaryButtonClass,
  sectionTitleClass,
} from "./form-styles";
import type { UnsavedChangesDialogProps } from "./unsaved-changes";

// El diálogo de cambios sin guardar (brief-23.2, D-6; ajuste del recorrido del 2026-10-17, que
// reemplazó el `confirm` del navegador). Un `<dialog>` modal: atrapa el foco, Esc equivale a seguir
// editando y, al cerrar, el foco vuelve al enlace. El foco empieza en «Seguir editando», que no
// pierde nada.

export const UNSAVED_CHANGES_TITLE = "Tenés cambios sin guardar";
export const UNSAVED_CHANGES_MESSAGE = "Si salís ahora, se pierden.";
export const STAY_LABEL = "Seguir editando";
export const LEAVE_LABEL = "Salir sin guardar";

export function UnsavedChangesDialog({
  open,
  onLeave,
  onStay,
}: UnsavedChangesDialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const messageId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (dialog === null) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      aria-describedby={messageId}
      onCancel={(event) => {
        event.preventDefault();
        onStay();
      }}
      className="m-auto w-[calc(100%-2rem)] max-w-sm rounded-xl border border-border bg-surface p-5 text-foreground shadow-lg backdrop:bg-overlay"
    >
      <h2 id={titleId} className={sectionTitleClass}>
        {UNSAVED_CHANGES_TITLE}
      </h2>
      <p id={messageId} className="mt-2 text-sm text-muted">
        {UNSAVED_CHANGES_MESSAGE}
      </p>
      <div className="mt-5 flex flex-wrap justify-end gap-2">
        <button
          type="button"
          autoFocus
          onClick={onStay}
          className={secondaryButtonClass}
        >
          {STAY_LABEL}
        </button>
        <button
          type="button"
          onClick={onLeave}
          className={`${dangerButtonClass} text-sm`}
        >
          {LEAVE_LABEL}
        </button>
      </div>
    </dialog>
  );
}

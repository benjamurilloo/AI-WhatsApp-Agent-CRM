"use client";

import type { ReactNode } from "react";
import { useDisclosure } from "./disclosure";
import { secondaryButtonClass } from "./form-styles";
import { Icon } from "./icons";

// «Más acciones» de una ficha (brief-24.1, D-8): las acciones menos frecuentes y las destructivas,
// fuera de la fila principal. Es un botón de revelación, con el comportamiento del menú del usuario
// (disclosure.ts): Escape, el toque afuera y la navegación lo cierran, y el foco vuelve al botón.
// No es un menú de la APG con flechas: los criterios v2 piden no imponerlas a todos los controles.
// El nombre accesible empieza por el texto visible y dice de qué es («Más acciones de la entrada»),
// para que dos fichas no tengan tres controles llamados «Más». Sin JavaScript, la lista queda a la
// vista.

// Cada ítem es un enlace o un botón con esta clase; los destructivos suman moreActionDangerClass y
// van al final.
export const moreActionItemClass =
  "flex min-h-11 w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-semibold text-foreground hover:bg-surface-muted focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus";

export const moreActionDangerClass = "text-danger hover:bg-danger-soft";

// iconOnly: el botón muestra solo «···», como el hilo de la v2 (brief-24.3.1); el nombre accesible
// sigue siendo label.
export function MoreActions({
  id,
  label,
  children,
  iconOnly = false,
}: {
  id: string;
  label: string;
  children: ReactNode;
  iconOnly?: boolean;
}) {
  const menu = useDisclosure();
  return (
    <div ref={menu.container} onKeyDown={menu.onKeyDown} className="relative">
      <button
        ref={menu.button}
        type="button"
        hidden={!menu.hydrated}
        aria-expanded={menu.open}
        aria-controls={id}
        aria-label={label}
        onClick={menu.toggle}
        className={
          iconOnly
            ? `${secondaryButtonClass} size-11 px-0`
            : secondaryButtonClass
        }
      >
        <Icon name="ellipsis" className={iconOnly ? "size-5" : "size-4"} />
        {iconOnly ? null : "Más acciones"}
      </button>
      <div
        id={id}
        hidden={!menu.shown}
        className={
          menu.hydrated
            ? "absolute top-full right-0 z-40 mt-2 w-60 rounded-xl border border-border bg-surface p-1.5 shadow-lg"
            : undefined
        }
      >
        <ul className="flex flex-col gap-0.5">{children}</ul>
      </div>
    </div>
  );
}

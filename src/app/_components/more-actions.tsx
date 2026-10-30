"use client";

import { useLayoutEffect, useRef, type ReactNode } from "react";
import { useDisclosure } from "./disclosure";
import { inlineButtonClass, secondaryButtonClass } from "./form-styles";
import { Icon } from "./icons";

// «Más acciones» de una ficha (brief-24.1, D-8): las acciones menos frecuentes y las destructivas,
// fuera de la fila principal. Es un botón de revelación, con el comportamiento del menú del usuario
// (disclosure.ts): Escape, el toque afuera y la navegación lo cierran, y el foco vuelve al botón.
// No es un menú de la APG con flechas: los criterios v2 piden no imponerlas a todos los controles.
// El nombre accesible empieza por el texto visible y dice de qué es («Más acciones de la entrada»),
// para que dos fichas no tengan tres controles llamados «Más». Sin JavaScript, la lista queda a la
// vista.

// Las clases de los ítems están en more-action-styles.ts.

// iconOnly: el botón muestra solo «···», como el hilo de la v2 (brief-24.3.1); el nombre accesible
// sigue siendo label.
// floating: la lista se ubica respecto de la ventana, para que una tabla con desplazamiento no la
// recorte ni le agregue una barra (recorrido de la 24.4.2). Abre hacia abajo y, si no entra, hacia
// arriba. Sigue dentro del contenedor en el DOM: el foco y el toque afuera no cambian.
const FLOATING_GAP_PX = 8;

export function MoreActions({
  id,
  label,
  children,
  iconOnly = false,
  floating = false,
  primaryText,
}: {
  id: string;
  label: string;
  children: ReactNode;
  iconOnly?: boolean;
  floating?: boolean;
  // Opción de la 24.4.3 (D-4): la acción principal de una tarjeta, como «+ Nueva operación ⌄» de 04.
  primaryText?: string;
}) {
  const menu = useDisclosure();
  const { open, button } = menu;
  const panel = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (!floating || !open) return;
    const place = () => {
      if (!button.current || !panel.current) return;
      const anchor = button.current.getBoundingClientRect();
      const height = panel.current.offsetHeight;
      const above = anchor.top - FLOATING_GAP_PX - height;
      const fitsBelow =
        anchor.bottom + FLOATING_GAP_PX + height <= window.innerHeight;
      panel.current.style.top = `${fitsBelow || above < 0 ? anchor.bottom + FLOATING_GAP_PX : above}px`;
      panel.current.style.right = `${document.documentElement.clientWidth - anchor.right}px`;
    };
    place();
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    return () => {
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
    };
  }, [floating, open, button]);

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
          primaryText !== undefined
            ? inlineButtonClass
            : iconOnly
              ? `${secondaryButtonClass} size-11 px-0`
              : secondaryButtonClass
        }
      >
        {primaryText !== undefined ? (
          <>
            <Icon name="plus" className="size-4" />
            {primaryText}
            <Icon name="chevronDown" className="size-4" />
          </>
        ) : (
          <>
            <Icon name="ellipsis" className={iconOnly ? "size-5" : "size-4"} />
            {iconOnly ? null : "Más acciones"}
          </>
        )}
      </button>
      <div
        ref={panel}
        id={id}
        hidden={!menu.shown}
        className={
          menu.hydrated
            ? `${floating ? "fixed" : "absolute top-full right-0 mt-2"} z-40 w-60 rounded-xl border border-border bg-surface p-1.5 shadow-lg`
            : undefined
        }
      >
        <ul className="flex flex-col gap-0.5">{children}</ul>
      </div>
    </div>
  );
}

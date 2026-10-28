"use client";

import { useState, type ReactNode } from "react";
import { useHydrated } from "@/app/_components/disclosure";
import { secondaryButtonClass } from "@/app/_components/form-styles";
import { Icon } from "@/app/_components/icons";
import { SHOW_CONTEXT_LABEL } from "../messages";

// «Ver contexto» en el teléfono (brief-24.3, D-9): un botón con aria-expanded abre y cierra el
// contexto del cliente debajo del encabezado. En escritorio el contexto está siempre a la vista y
// el botón no aparece. Sin JavaScript, el contexto queda abierto y el botón oculto, como «Más
// acciones». Es una sola copia del contenido, la misma que se ve en escritorio: cerrado en el
// teléfono se oculta con CSS y no suma nombres que no estén ya en la página.
export function ContextDisclosure({ children }: { children: ReactNode }) {
  const hydrated = useHydrated();
  const [open, setOpen] = useState(false);
  const hiddenOnPhone = hydrated && !open;
  return (
    <div className="flex flex-col gap-3">
      <button
        type="button"
        hidden={!hydrated}
        aria-expanded={open}
        aria-controls="contexto-cliente"
        onClick={() => setOpen((value) => !value)}
        className={`self-start lg:hidden ${secondaryButtonClass}`}
      >
        <Icon name="user" className="size-4" />
        {SHOW_CONTEXT_LABEL}
        <Icon
          name="chevronDown"
          className={`size-4 transition-transform motion-reduce:transition-none ${open ? "rotate-180" : ""}`}
        />
      </button>
      <div
        id="contexto-cliente"
        className={hiddenOnPhone ? "max-lg:hidden" : undefined}
      >
        {children}
      </div>
    </div>
  );
}

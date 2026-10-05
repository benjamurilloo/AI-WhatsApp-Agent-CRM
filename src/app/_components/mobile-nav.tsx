"use client";

import {
  useRef,
  useState,
  useSyncExternalStore,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { usePathname } from "next/navigation";
import { Icon } from "./icons";

// Panel de navegación (brief-15.1, D-5). Desde lg está siempre abierto. Debajo de lg, el botón
// «Menú» lo despliega, Escape y la navegación lo cierran, y el foco vuelve al botón. Es el mismo
// <nav> en todos los tamaños: nunca hay dos navegaciones «Principal». Sin JavaScript el botón no
// aparece y la navegación queda visible.

const noSubscription = () => () => {};

export function CollapsiblePanel({
  brand,
  children,
}: {
  brand: ReactNode;
  children: ReactNode;
}) {
  const hydrated = useSyncExternalStore(
    noSubscription,
    () => true,
    () => false,
  );
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const [openedAt, setOpenedAt] = useState(pathname);
  const button = useRef<HTMLButtonElement>(null);

  // Navegar cierra el panel: se compara con la ruta en que se abrió, durante el render.
  if (openedAt !== pathname) {
    setOpenedAt(pathname);
    if (open) setOpen(false);
  }

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === "Escape" && open) {
      setOpen(false);
      button.current?.focus();
    }
  };

  const collapsed = hydrated && !open;
  return (
    <div onKeyDown={onKeyDown} className="flex flex-col gap-4 lg:gap-6">
      <div className="flex items-center justify-between gap-3">
        {brand}
        <button
          ref={button}
          type="button"
          hidden={!hydrated}
          aria-expanded={open}
          aria-controls="panel-navegacion"
          onClick={() => setOpen((value) => !value)}
          className="inline-flex items-center gap-2 rounded-md border border-border-strong bg-surface px-3 py-2 text-sm font-semibold text-foreground hover:bg-surface-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus lg:hidden"
        >
          <Icon name={open ? "close" : "menu"} className="size-4" />
          Menú
        </button>
      </div>
      <div
        id="panel-navegacion"
        className={collapsed ? "hidden lg:block" : undefined}
      >
        {children}
      </div>
    </div>
  );
}

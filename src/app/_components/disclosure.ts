"use client";

import {
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type KeyboardEvent,
} from "react";
import { usePathname } from "next/navigation";

// Desplegable del marco (brief-23.1, D-5 y D-7), con el comportamiento del «Menú» de la 15.1: un
// botón con aria-expanded lo abre; Escape lo cierra y devuelve el foco al botón; navegar y tocar
// fuera también lo cierran. Antes de hidratar, `hydrated` es false: quien lo usa deja el contenido
// visible y oculta el botón, así todo funciona sin JavaScript.

const noSubscription = () => () => {};

export function useHydrated(): boolean {
  return useSyncExternalStore(
    noSubscription,
    () => true,
    () => false,
  );
}

export function useDisclosure() {
  const hydrated = useHydrated();
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const [openedAt, setOpenedAt] = useState(pathname);
  const button = useRef<HTMLButtonElement>(null);
  const container = useRef<HTMLDivElement>(null);

  // Navegar cierra el desplegable: se compara con la ruta en que se abrió, durante el render.
  if (openedAt !== pathname) {
    setOpenedAt(pathname);
    if (open) setOpen(false);
  }

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!container.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === "Escape" && open) {
      setOpen(false);
      button.current?.focus();
    }
  };

  return {
    hydrated,
    open,
    toggle: () => setOpen((value) => !value),
    // Visible si está abierto o si todavía no hay JavaScript.
    shown: !hydrated || open,
    button,
    container,
    onKeyDown,
  };
}

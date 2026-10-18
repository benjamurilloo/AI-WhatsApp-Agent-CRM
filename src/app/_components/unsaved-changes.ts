"use client";

import { useEffect, useRef, useState, type RefObject } from "react";

// Cambios sin guardar en las fichas largas (brief-23.2, D-6). Cubre recargar, cerrar la pestaña y
// salir del sitio (`beforeunload`), con el aviso del navegador, que no se puede reemplazar, y un
// clic en un enlace interno, que pregunta con el diálogo del sistema (`unsaved-changes-dialog.tsx`;
// ajuste del recorrido del 2026-10-17: antes era `confirm`). El botón «Atrás» del navegador no se
// cubre: el App Router no deja frenar esa navegación. Sin JavaScript no hay aviso.

// Los valores del formulario como texto comparable. Un archivo cuenta por su nombre y su tamaño.
export function formSnapshot(
  entries: Iterable<[string, FormDataEntryValue]>,
): string {
  return JSON.stringify(
    Array.from(entries, ([name, value]) => [
      name,
      typeof value === "string" ? value : `${value.name}:${value.size}`,
    ]),
  );
}

type AnchorLike = { href: string; target: string; hasDownload: boolean };
type ClickLike = {
  button: number;
  metaKey: boolean;
  ctrlKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
};
type LocationLike = { origin: string; pathname: string; search: string };

// Si el clic en el enlace saca de la pantalla dentro del sitio. Una pestaña nueva, una descarga o
// un ancla de la misma página no sacan; un sitio externo lo cubre `beforeunload`.
export function leavesPage(
  anchor: AnchorLike,
  click: ClickLike,
  location: LocationLike,
): boolean {
  if (anchor.target !== "" && anchor.target !== "_self") return false;
  if (anchor.hasDownload) return false;
  if (click.button !== 0) return false;
  if (click.metaKey || click.ctrlKey || click.shiftKey || click.altKey) {
    return false;
  }
  const url = new URL(anchor.href, location.origin);
  if (url.origin !== location.origin) return false;
  return url.pathname !== location.pathname || url.search !== location.search;
}

export type UnsavedChangesDialogProps = {
  open: boolean;
  onLeave: () => void;
  onStay: () => void;
};

export function useUnsavedChanges(): {
  formRef: RefObject<HTMLFormElement | null>;
  dialog: UnsavedChangesDialogProps;
} {
  const formRef = useRef<HTMLFormElement>(null);
  const dirty = useRef(false);
  // El enlace que se frenó, para repetir el clic si se elige salir: así navega el enlace de Next,
  // con su barra de progreso.
  const [pending, setPending] = useState<HTMLAnchorElement | null>(null);

  useEffect(() => {
    const form = formRef.current;
    if (form === null) return;
    const initial = formSnapshot(new FormData(form));
    dirty.current = false;

    const update = () => {
      dirty.current = formSnapshot(new FormData(form)) !== initial;
    };
    // Al enviar deja de preguntar: la acción redirige al guardar. Si la rechaza, el próximo cambio
    // vuelve a comparar contra los valores iniciales.
    const submitted = () => {
      dirty.current = false;
    };
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (!dirty.current) return;
      event.preventDefault();
      event.returnValue = "";
    };
    // En la fase de captura del documento, antes de que el enlace de Next navegue.
    const click = (event: MouseEvent) => {
      if (!dirty.current || event.defaultPrevented) return;
      const target = event.target;
      if (!(target instanceof Element)) return;
      const anchor = target.closest("a[href]");
      if (!(anchor instanceof HTMLAnchorElement)) return;
      const leaving = leavesPage(
        {
          href: anchor.href,
          target: anchor.target,
          hasDownload: anchor.hasAttribute("download"),
        },
        event,
        window.location,
      );
      if (!leaving) return;
      event.preventDefault();
      event.stopPropagation();
      setPending(anchor);
    };

    form.addEventListener("input", update);
    form.addEventListener("change", update);
    form.addEventListener("submit", submitted);
    window.addEventListener("beforeunload", beforeUnload);
    document.addEventListener("click", click, true);
    // Desde acá los cambios cuentan: lo que se escribió antes de hidratar queda en `initial`.
    form.dataset.unsavedChanges = "watching";
    return () => {
      delete form.dataset.unsavedChanges;
      form.removeEventListener("input", update);
      form.removeEventListener("change", update);
      form.removeEventListener("submit", submitted);
      window.removeEventListener("beforeunload", beforeUnload);
      document.removeEventListener("click", click, true);
    };
  }, []);

  return {
    formRef,
    dialog: {
      open: pending !== null,
      onLeave: () => {
        dirty.current = false;
        setPending(null);
        pending?.click();
      },
      onStay: () => setPending(null),
    },
  };
}

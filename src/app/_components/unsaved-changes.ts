"use client";

import { useEffect, useRef, type RefObject } from "react";

// Cambios sin guardar en las fichas largas (brief-23.2, D-6). Cubre recargar, cerrar la pestaña y
// salir del sitio (`beforeunload`), y un clic en un enlace interno, que pregunta con `confirm`. El
// botón «Atrás» del navegador no se cubre: el App Router no deja frenar esa navegación. Sin
// JavaScript no hay aviso.

export const UNSAVED_CHANGES_MESSAGE =
  "Tenés cambios sin guardar. ¿Salir igual?";

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

export function useUnsavedChanges(): RefObject<HTMLFormElement | null> {
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    const form = formRef.current;
    if (form === null) return;
    const initial = formSnapshot(new FormData(form));
    let dirty = false;

    const update = () => {
      dirty = formSnapshot(new FormData(form)) !== initial;
    };
    // Al enviar deja de preguntar: la acción redirige al guardar. Si la rechaza, el próximo cambio
    // vuelve a comparar contra los valores iniciales.
    const submitted = () => {
      dirty = false;
    };
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (!dirty) return;
      event.preventDefault();
      event.returnValue = "";
    };
    // En la fase de captura del documento, antes de que el enlace de Next navegue.
    const click = (event: MouseEvent) => {
      if (!dirty || event.defaultPrevented) return;
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
      if (window.confirm(UNSAVED_CHANGES_MESSAGE)) {
        dirty = false;
        return;
      }
      event.preventDefault();
      event.stopPropagation();
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

  return formRef;
}

"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { LOADING_TEXT } from "./skeleton";
import { leavesPage } from "./unsaved-changes";

// La carga de una pantalla (brief-23.2, D-3, resuelta de nuevo el 2026-10-17): una barra fina
// arriba y «Cargando…» para un lector de pantalla, desde el clic en un enlace interno o el envío
// de un filtro hasta que cambia la URL. No usa `loading.tsx`: sin JavaScript, el contenido que
// llega por streaming queda oculto y la pantalla no pasaba del esqueleto. Sin JavaScript no hay
// barra, y todo funciona como antes.
export function NavigationProgress() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const url = `${pathname}?${searchParams.toString()}`;
  const [pendingFrom, setPendingFrom] = useState<string | null>(null);
  const pending = pendingFrom !== null && pendingFrom === url;

  useEffect(() => {
    // En la fase de burbujeo: si el aviso de cambios sin guardar frenó el clic, no llega acá.
    const click = (event: MouseEvent) => {
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
      if (leaving) setPendingFrom(currentUrl());
    };
    // Los filtros son formularios GET; los que guardan muestran su propio «Guardando…».
    const submit = (event: SubmitEvent) => {
      const form = event.target;
      if (!(form instanceof HTMLFormElement)) return;
      if (form.method.toLowerCase() !== "get" || event.defaultPrevented) return;
      setPendingFrom(currentUrl());
    };
    document.addEventListener("click", click);
    document.addEventListener("submit", submit);
    return () => {
      document.removeEventListener("click", click);
      document.removeEventListener("submit", submit);
    };
  }, []);

  // `aria-live` sin `role="status"`: la región está siempre en el marco, y un rol sumaría un
  // «status» vacío a cada pantalla junto a sus avisos.
  return (
    <>
      <div aria-live="polite" aria-atomic="true" className="sr-only">
        {pending ? LOADING_TEXT : ""}
      </div>
      {pending ? (
        <div
          aria-hidden="true"
          className="fixed inset-x-0 top-0 z-50 h-1 animate-pulse bg-primary motion-reduce:animate-none print:hidden"
        />
      ) : null}
    </>
  );
}

function currentUrl(): string {
  return `${window.location.pathname}?${new URLSearchParams(window.location.search).toString()}`;
}

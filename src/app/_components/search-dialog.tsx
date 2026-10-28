"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { looksLikeFullPhone, type RemoteSuggestion } from "./suggest-filter";
import { useHydrated } from "./disclosure";
import { inputClass, secondaryButtonClass } from "./form-styles";
import { Icon } from "./icons";
import { SuggestInput } from "./suggest-input";

// La búsqueda global en un diálogo (brief-24.2, D-1, D-2 y D-6; v2, V2-01 §05 y V2-13 §06). Un
// `<dialog>` modal: el navegador deja el fondo inerte (H-5); Tab y Escape se toman a mano, porque
// Chromium no los resuelve solo (ver onKeyDownCapture). Se abre con el botón de la barra, con la lupa del teléfono o con Ctrl/Cmd+K desde
// cualquier pantalla, y al cerrar el foco vuelve a quien lo abrió. Adentro, el combobox de la 23.3:
// Enter sin una opción elegida abre /buscar. Sin JavaScript, los disparadores son enlaces a /buscar.

export const SEARCH_LABEL = "Buscar en el sistema";
const OPEN_EVENT = "crm-abrir-busqueda";

function isMac(): boolean {
  return /Mac|iPhone|iPad/.test(navigator.userAgent);
}

function openSearch(from: HTMLElement) {
  window.dispatchEvent(new CustomEvent(OPEN_EVENT, { detail: from }));
}

// El disparador de la barra, desde lg: con forma de campo y la tecla al costado (D-1). El texto
// visible es el nombre accesible (WCAG 2.5.3).
export function SearchBarTrigger() {
  const hydrated = useHydrated();
  const className = `${inputClass} flex w-full items-center gap-2 text-left text-muted`;
  const content = (
    <>
      <Icon name="search" className="size-4 shrink-0" />
      <span className="flex-1 truncate">{SEARCH_LABEL}…</span>
    </>
  );
  if (!hydrated) {
    return (
      <Link href="/buscar" className={className}>
        {content}
      </Link>
    );
  }
  return (
    <button
      type="button"
      aria-haspopup="dialog"
      aria-keyshortcuts={isMac() ? "Meta+K" : "Control+K"}
      onClick={(event) => openSearch(event.currentTarget)}
      className={`${className} cursor-text`}
    >
      {content}
      <kbd
        aria-hidden="true"
        className="rounded border border-border px-1.5 py-0.5 font-sans text-xs"
      >
        {isMac() ? "⌘K" : "Ctrl K"}
      </kbd>
    </button>
  );
}

// La lupa, debajo de lg: abre el mismo diálogo, a pantalla completa (D-2).
export function SearchIconTrigger({ className }: { className: string }) {
  const hydrated = useHydrated();
  const icon = <Icon name="search" className="size-4" />;
  if (!hydrated) {
    return (
      <Link href="/buscar" aria-label={SEARCH_LABEL} className={className}>
        {icon}
      </Link>
    );
  }
  return (
    <button
      type="button"
      aria-label={SEARCH_LABEL}
      aria-haspopup="dialog"
      onClick={(event) => openSearch(event.currentTarget)}
      className={className}
    >
      {icon}
    </button>
  );
}

function countText(count: number | null): string {
  if (count === null) return "";
  if (count === 0) return "Sin resultados";
  return count === 1 ? "1 resultado" : `${count} resultados`;
}

export function SearchDialog({
  scope,
  load,
}: {
  // Lo que el rol y las capacidades dejan buscar, para el subtítulo (D-6).
  scope: string;
  load: (text: string) => Promise<RemoteSuggestion[]>;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const opener = useRef<HTMLElement | null>(null);
  const [open, setOpen] = useState(false);
  const [count, setCount] = useState<number | null>(null);
  const [phone, setPhone] = useState(false);
  const pathname = usePathname();
  const titleId = useId();
  const scopeId = useId();

  useEffect(() => {
    const mac = isMac();
    function openFrom(element: Element | null) {
      // Ya abierto, el foco vuelve al buscador y quien lo abrió sigue siendo el mismo.
      if (ref.current?.open) {
        ref.current
          .querySelector<HTMLInputElement>("#busqueda-global")
          ?.focus();
        return;
      }
      opener.current = element instanceof HTMLElement ? element : null;
      setCount(null);
      setPhone(false);
      setOpen(true);
    }
    function onKeyDown(event: KeyboardEvent) {
      // ⌘K en Mac y Ctrl+K en los demás, también con el foco en un campo: no escribe nada. Le gana al
      // atajo del navegador solo dentro de la página (H-7, R-2). En Mac, Ctrl+K queda para borrar
      // hasta el fin de la línea.
      if (
        (mac
          ? event.metaKey && !event.ctrlKey
          : event.ctrlKey && !event.metaKey) &&
        !event.altKey &&
        !event.shiftKey &&
        !event.repeat &&
        !event.isComposing &&
        event.key.toLowerCase() === "k"
      ) {
        // Otro modal abierto (los cambios sin guardar, una confirmación): no se apila encima.
        const other = document.querySelector("dialog[open]");
        if (other !== null && other !== ref.current) return;
        event.preventDefault();
        openFrom(document.activeElement);
      }
    }
    function onOpen(event: Event) {
      openFrom((event as CustomEvent<HTMLElement>).detail);
    }
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener(OPEN_EVENT, onOpen);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener(OPEN_EVENT, onOpen);
    };
  }, []);

  useEffect(() => {
    const dialog = ref.current;
    if (dialog === null) return;
    if (open && !dialog.open) {
      dialog.showModal();
      // El foco entra al buscador (V2-13 §06): el autoFocus de React no deja el atributo en el
      // HTML, y showModal enfocaría el primer botón.
      dialog.querySelector<HTMLInputElement>("#busqueda-global")?.focus();
    }
    if (!open && dialog.open) dialog.close();
  }, [open]);

  // Una navegación lo cierra: al elegir un resultado, o con el botón atrás.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      aria-describedby={scopeId}
      // Chromium no cumple lo de H-5 solo: el primer Escape en un campo de búsqueda con texto lo
      // borra sin cerrar el diálogo, y Tab desde el último control sale a la interfaz del navegador.
      // Se toman los dos acá, antes que el campo (los midió search.spec.ts).
      onKeyDownCapture={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          setOpen(false);
          return;
        }
        if (event.key !== "Tab") return;
        const focusable = Array.from(
          event.currentTarget.querySelectorAll<HTMLElement>(
            "input, button, a[href], [tabindex]:not([tabindex='-1'])",
          ),
        ).filter((element) => element.checkVisibility());
        const first = focusable[0];
        const last = focusable.at(-1);
        if (!first || !last) return;
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }}
      // Escape, el botón de cerrar o una navegación: el foco vuelve a quien lo abrió (R-4).
      onClose={() => {
        setOpen(false);
        const target = opener.current;
        if (target?.isConnected) target.focus();
      }}
      className="m-0 h-dvh max-h-none w-full max-w-none bg-surface p-0 text-foreground backdrop:bg-overlay sm:m-auto sm:mt-[10dvh] sm:h-auto sm:max-h-[80dvh] sm:w-[calc(100%-2rem)] sm:max-w-2xl sm:rounded-xl sm:border sm:border-border sm:shadow-lg"
    >
      {open ? (
        <div className="flex h-full flex-col gap-4 p-4 sm:max-h-[80dvh] sm:p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 id={titleId} className="text-lg font-bold">
                {SEARCH_LABEL}
              </h2>
              <p id={scopeId} className="text-sm text-muted">
                {scope}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <kbd
                aria-hidden="true"
                className="hidden rounded border border-border px-1.5 py-0.5 font-sans text-xs text-muted sm:inline"
              >
                Esc
              </kbd>
              <button
                type="button"
                aria-label="Cerrar la búsqueda"
                onClick={() => setOpen(false)}
                className={secondaryButtonClass}
              >
                <Icon name="close" className="size-4" />
              </button>
            </div>
          </div>
          <form
            method="get"
            action="/buscar"
            role="search"
            aria-label="Búsqueda global"
            className="flex min-h-0 flex-1 flex-col"
            onInput={(event) => {
              const target = event.target as HTMLInputElement;
              setPhone(looksLikeFullPhone(target.value));
            }}
          >
            <label htmlFor="busqueda-global" className="sr-only">
              {SEARCH_LABEL}
            </label>
            <div className="relative">
              <SuggestInput
                id="busqueda-global"
                name="q"
                type="search"
                inline
                placeholder="Cliente, IMEI o número de operación"
                className={`${inputClass} w-full pl-9`}
                listClassName="max-h-[min(28rem,60dvh)]"
                load={load}
                onResults={setCount}
                onNavigate={() => setOpen(false)}
              >
                <Icon
                  name="search"
                  className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted"
                />
              </SuggestInput>
            </div>
            {phone ? (
              <p className="mt-3 text-sm text-muted">
                Para buscar por teléfono, Enter abre la búsqueda completa.
              </p>
            ) : null}
          </form>
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3 text-sm text-muted">
            <p>
              {/* La cantidad se anuncia al terminar cada búsqueda (V2-13 §06). Sin rol: un
                  role="status" más rompería los getByRole("status") de las pantallas. */}
              <span aria-live="polite">{countText(count)}</span>
              {count === null ? "" : " · "}
              Solo contenido al que tenés acceso
            </p>
            <p aria-hidden="true" className="hidden gap-3 sm:flex">
              <span>↑ ↓ Navegar</span>
              <span>Enter Abrir</span>
              <span>Esc Cerrar</span>
            </p>
          </div>
        </div>
      ) : null}
    </dialog>
  );
}

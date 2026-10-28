"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSyncExternalStore } from "react";
import { useHydrated } from "./disclosure";
import { navLinkClass } from "./form-styles";
import { Icon } from "./icons";
import { currentLink, type NavGroup } from "./nav-links";

// Navegación del panel lateral, en grupos por tarea (brief-24.1, D-1 y D-2). Cada grupo es un
// botón de revelación con aria-expanded. La primera vez todos están abiertos; lo que el usuario
// cierra se recuerda en este navegador, y el grupo de la página actual se abre siempre. Sin
// JavaScript, todos quedan abiertos y sin botón.
//
// El ítem activo es el de los mockups (brief-23.1, D-4): fondo violeta suave, texto violeta y una
// barra a la izquierda. Lo distinguen la barra (6,21:1 contra el panel) y el texto, no el fondo,
// que contra el panel da 1,05:1. Lleva aria-current.

const STORAGE_KEY = "crm.menu.gruposCerrados";
const CHANGE_EVENT = "crm-menu-grupos";

// Lo guardado puede faltar o fallar (navegación privada, almacenamiento bloqueado): entonces todo
// queda abierto (brief-24.1, R-4).
function readClosed(): string {
  try {
    return window.localStorage.getItem(STORAGE_KEY) ?? "";
  } catch {
    return "";
  }
}

function writeClosed(ids: readonly string[]) {
  try {
    window.localStorage.setItem(STORAGE_KEY, ids.join(","));
  } catch {
    // Sin almacenamiento, el cambio vale solo hasta recargar.
  }
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

function subscribe(onChange: () => void) {
  window.addEventListener(CHANGE_EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(CHANGE_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

export function AppNav({ groups }: { groups: readonly NavGroup[] }) {
  const pathname = usePathname();
  const hydrated = useHydrated();
  const stored = useSyncExternalStore(subscribe, readClosed, () => "");
  const closed = stored.split(",").filter(Boolean);
  const current = currentLink(pathname, groups);

  const toggle = (id: string) => {
    writeClosed(
      closed.includes(id)
        ? closed.filter((closedId) => closedId !== id)
        : [...closed, id],
    );
  };

  return (
    <nav aria-label="Principal">
      <ul className="flex flex-col gap-4">
        {groups.map((group) => {
          const listId = `menu-grupo-${group.id}`;
          const open =
            !hydrated ||
            group.label === null ||
            current?.group.id === group.id ||
            !closed.includes(group.id);
          return (
            <li key={group.id}>
              {group.label === null ? null : hydrated ? (
                <button
                  type="button"
                  aria-expanded={open}
                  aria-controls={listId}
                  onClick={() => toggle(group.id)}
                  className={`${navLinkClass} min-h-11 w-full justify-between text-xs tracking-wide text-muted uppercase hover:bg-surface-muted hover:text-foreground`}
                >
                  {group.label}
                  <Icon
                    name="chevronDown"
                    className={`size-4 transition-transform motion-reduce:transition-none ${open ? "rotate-180" : ""}`}
                  />
                </button>
              ) : (
                <p className="px-3 py-2.5 text-xs font-semibold tracking-wide text-muted uppercase">
                  {group.label}
                </p>
              )}
              <ul
                id={listId}
                hidden={!open}
                className="mt-1 flex flex-col gap-1"
              >
                {group.links.map((link) => {
                  const active = current?.link.href === link.href;
                  return (
                    <li key={link.href}>
                      <Link
                        href={link.href}
                        aria-current={active ? "page" : undefined}
                        className={`${navLinkClass} ${active ? "bg-primary-soft text-primary before:absolute before:inset-y-2 before:left-0 before:w-[3px] before:rounded-full before:bg-primary before:content-['']" : "text-foreground hover:bg-surface-muted"}`}
                      >
                        <Icon name={link.icon} className="size-5" />
                        {link.label}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

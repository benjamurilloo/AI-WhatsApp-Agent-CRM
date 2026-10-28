"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import type { ReactNode } from "react";
import { useDisclosure, useHydrated } from "./disclosure";
import { navLinkClass } from "./form-styles";
import { Icon } from "./icons";
import {
  BOTTOM_BAR,
  currentLink,
  hidesBottomBar,
  moreGroups,
  type NavGroup,
} from "./nav-links";

// La navegación en el teléfono (brief-23.1, D-7). Debajo de lg, una barra inferior fija con
// Inicio, Chats, Clientes, Ventas y «Más», que despliega el resto de los destinos del rol bajo el
// título de su grupo (brief-24.1, D-3). El panel lateral y la barra son las dos únicas navegaciones
// «Principal», y nunca hay dos visibles: el panel se oculta debajo de lg y la barra desde lg. Sin
// JavaScript no hay barra, y el panel queda visible arriba. En el hilo y en los formularios la
// barra se retira, para que no compita con la tarea (brief-24.1, D-7).

const focusRing =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus";

// Columna del panel lateral: debajo de lg se oculta una vez que la barra inferior la reemplaza.
export function SidebarColumn({ children }: { children: ReactNode }) {
  const hydrated = useHydrated();
  return (
    <div
      className={`border-b border-border bg-sidebar lg:block lg:border-r lg:border-b-0 print:hidden ${hydrated ? "hidden" : ""}`}
    >
      {children}
    </div>
  );
}

// Columna del contenido: debajo de lg reserva el alto de la barra inferior, salvo donde la barra
// se retira.
export function ContentColumn({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const editing = useSearchParams().get("editar") === "1";
  return (
    <div
      className={`min-w-0 lg:pb-0 print:pb-0 ${hidesBottomBar(pathname, editing) ? "" : "pb-24"}`}
    >
      {children}
    </div>
  );
}

const barItemClass = `flex min-h-14 flex-col items-center justify-center gap-1 rounded-xl px-1 py-1.5 text-xs font-semibold ${focusRing}`;

function barItemState(current: boolean): string {
  return current
    ? "bg-primary-soft text-primary"
    : "text-muted hover:bg-surface-muted hover:text-foreground";
}

export function BottomNav({ groups }: { groups: readonly NavGroup[] }) {
  const pathname = usePathname();
  const editing = useSearchParams().get("editar") === "1";
  const more = useDisclosure();
  const extra = moreGroups(groups);
  const activeHref = currentLink(pathname, groups)?.link.href;
  const extraCurrent = extra.some((group) =>
    group.links.some((link) => link.href === activeHref),
  );

  // Sin JavaScript, la barra no se muestra: el panel lateral queda visible (SidebarColumn).
  if (!more.hydrated || hidesBottomBar(pathname, editing)) return null;

  return (
    <nav
      aria-label="Principal"
      className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-surface pb-[env(safe-area-inset-bottom)] lg:hidden print:hidden"
    >
      <div ref={more.container} onKeyDown={more.onKeyDown}>
        <div
          id="navegacion-mas"
          hidden={!more.open}
          className="absolute inset-x-2 bottom-full mb-2 max-h-[calc(100dvh-6rem)] overflow-y-auto rounded-xl border border-border bg-surface p-2 shadow-lg"
        >
          {/* Las listas existen solo con el panel abierto: cerrado, los títulos de grupo no quedan
              en el documento como rótulos ocultos que compiten con los de la página. */}
          {more.open ? (
            <div className="flex flex-col gap-3">
              {extra.map((group) => {
                const titleId = `navegacion-mas-${group.id}`;
                return (
                  <div key={group.id}>
                    {group.label === null ? null : (
                      <p
                        id={titleId}
                        className="px-3 pt-1 pb-1 text-xs font-semibold tracking-wide text-muted uppercase"
                      >
                        {group.label}
                      </p>
                    )}
                    <ul
                      aria-labelledby={
                        group.label === null ? undefined : titleId
                      }
                      className="flex flex-col gap-1"
                    >
                      {group.links.map((link) => {
                        const current = link.href === activeHref;
                        return (
                          <li key={link.href}>
                            <Link
                              href={link.href}
                              aria-current={current ? "page" : undefined}
                              className={`${navLinkClass} min-h-11 ${current ? "bg-primary-soft text-primary" : "text-foreground hover:bg-surface-muted"}`}
                            >
                              <Icon name={link.icon} className="size-5" />
                              {link.label}
                            </Link>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                );
              })}
            </div>
          ) : null}
        </div>
        <ul className="grid grid-cols-5 gap-1 px-2 py-1.5">
          {BOTTOM_BAR.map((link) => {
            const current = link.href === activeHref;
            return (
              <li key={link.href}>
                <Link
                  href={link.href}
                  aria-current={current ? "page" : undefined}
                  className={`${barItemClass} ${barItemState(current)}`}
                >
                  <Icon name={link.icon} className="size-5" />
                  {link.label}
                </Link>
              </li>
            );
          })}
          <li>
            {/* Si el destino actual vive dentro de «Más», el que se marca es «Más». */}
            <button
              ref={more.button}
              type="button"
              aria-expanded={more.open}
              aria-controls="navegacion-mas"
              onClick={more.toggle}
              className={`w-full ${barItemClass} ${barItemState(extraCurrent || more.open)}`}
            >
              <Icon name="ellipsis" className="size-5" />
              Más
            </button>
          </li>
        </ul>
      </div>
    </nav>
  );
}

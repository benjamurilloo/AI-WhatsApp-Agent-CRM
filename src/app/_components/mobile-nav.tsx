"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { useDisclosure, useHydrated } from "./disclosure";
import { navLinkClass } from "./form-styles";
import { Icon } from "./icons";
import { BOTTOM_BAR, isCurrent, moreLinks, type NavLink } from "./nav-links";

// La navegación en el teléfono (brief-23.1, D-7). Debajo de lg, una barra inferior fija con
// Inicio, Chats, Clientes, Ventas y «Más», que despliega el resto de las secciones del rol. El
// panel lateral y la barra son las dos únicas navegaciones «Principal», y nunca hay dos visibles:
// el panel se oculta debajo de lg y la barra desde lg. Sin JavaScript no hay barra, y el panel
// queda visible arriba, como antes de la 23.1.

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

const barItemClass = `flex min-h-14 flex-col items-center justify-center gap-1 rounded-xl px-1 py-1.5 text-xs font-semibold ${focusRing}`;

function barItemState(current: boolean): string {
  return current
    ? "bg-primary-soft text-primary"
    : "text-muted hover:bg-surface-muted hover:text-foreground";
}

export function BottomNav({ links }: { links: readonly NavLink[] }) {
  const pathname = usePathname();
  const more = useDisclosure();
  const extra = moreLinks(links);
  const extraCurrent = extra.some((link) => isCurrent(pathname, link.href));

  // Sin JavaScript, la barra no se muestra: el panel lateral queda visible (SidebarColumn).
  if (!more.hydrated) return null;

  return (
    <nav
      aria-label="Principal"
      className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-surface pb-[env(safe-area-inset-bottom)] lg:hidden print:hidden"
    >
      <div ref={more.container} onKeyDown={more.onKeyDown}>
        <div
          id="navegacion-mas"
          hidden={!more.open}
          className="absolute right-2 bottom-full mb-2 w-64 rounded-xl border border-border bg-surface p-2 shadow-lg"
        >
          <ul className="flex flex-col gap-1">
            {extra.map((link) => {
              const current = isCurrent(pathname, link.href);
              return (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    aria-current={current ? "page" : undefined}
                    className={`${navLinkClass} ${current ? "bg-primary-soft text-primary" : "text-foreground hover:bg-surface-muted"}`}
                  >
                    <Icon name={link.icon} className="size-5" />
                    {link.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
        <ul className="grid grid-cols-5 gap-1 px-2 py-1.5">
          {BOTTOM_BAR.map((link) => {
            const current = isCurrent(pathname, link.href);
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
            {/* Si la sección actual vive dentro de «Más», el que se marca es «Más». */}
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

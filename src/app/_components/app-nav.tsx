"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { navLinkClass } from "./form-styles";
import { Icon } from "./icons";
import { isCurrent, type NavLink } from "./nav-links";

// Navegación del panel lateral (brief-3.7, D-7; brief-15.1), como lista vertical con un ícono por
// sección. El ítem activo es el de los mockups (brief-23.1, D-4): fondo violeta suave, texto
// violeta y una barra a la izquierda. Lo distinguen la barra (6,21:1 contra el panel) y el texto,
// no el fondo, que contra el panel da 1,05:1. Lleva aria-current.
export function AppNav({ links }: { links: readonly NavLink[] }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Principal">
      <ul className="flex flex-col gap-1">
        {links.map((link) => {
          const current = isCurrent(pathname, link.href);
          return (
            <li key={link.href}>
              <Link
                href={link.href}
                aria-current={current ? "page" : undefined}
                className={`${navLinkClass} ${current ? "bg-primary-soft text-primary before:absolute before:inset-y-2 before:left-0 before:w-[3px] before:rounded-full before:bg-primary before:content-['']" : "text-foreground hover:bg-surface-muted"}`}
              >
                <Icon name={link.icon} className="size-5" />
                {link.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

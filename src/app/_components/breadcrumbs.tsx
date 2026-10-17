"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon } from "./icons";
import { crumbFor, type NavLink } from "./nav-links";

// Migas de la barra superior (brief-23.1, D-6): «‹organización› / ‹sección›». La organización ocupa
// el lugar de «CRM» de los mockups, así sigue dentro del banner (Screens.md, nota de la 15.1). La
// sección sale de la ruta. En su portada es la página actual; más adentro es un enlace a ella. Los
// niveles más profundos llegan con la Fase 24.
export function Breadcrumbs({
  organizationName,
  links,
}: {
  organizationName: string;
  links: readonly NavLink[];
}) {
  const pathname = usePathname();
  const crumb = crumbFor(pathname, links);
  return (
    <nav aria-label="Migas" className="min-w-0">
      <ol className="flex min-w-0 items-center gap-2 text-sm">
        <li className="flex min-w-0 items-center gap-2 text-muted">
          <Icon name="building" className="size-4" />
          <span className="sr-only">Organización: </span>
          <span className="truncate">{organizationName}</span>
        </li>
        {crumb ? (
          <li className="flex shrink-0 items-center gap-2">
            <span aria-hidden="true" className="text-muted">
              /
            </span>
            {crumb.exact ? (
              <span
                aria-current="page"
                className="font-semibold text-foreground"
              >
                {crumb.label}
              </span>
            ) : (
              <Link
                href={crumb.href}
                className="rounded-sm font-semibold text-foreground underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
              >
                {crumb.label}
              </Link>
            )}
          </li>
        ) : null}
      </ol>
    </nav>
  );
}

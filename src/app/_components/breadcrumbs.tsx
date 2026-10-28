"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon } from "./icons";
import { crumbFor, type NavGroup } from "./nav-links";

// Migas de la barra superior: «‹organización› / ‹grupo› / ‹sección›» (brief-24.1, D-4). La
// organización ocupa el lugar de «CRM» de los mockups, así sigue dentro del banner (Screens.md,
// nota de la 15.1), y es lo primero que se acorta en el teléfono. El grupo es texto, porque no
// tiene página. La sección sale de la ruta: en su portada es la página actual; más adentro es un
// enlace a ella. El nivel del detalle llega con la subfase de cada módulo.
export function Breadcrumbs({
  organizationName,
  groups,
}: {
  organizationName: string;
  groups: readonly NavGroup[];
}) {
  const pathname = usePathname();
  const crumb = crumbFor(pathname, groups);
  return (
    <nav aria-label="Migas" className="min-w-0">
      <ol className="flex min-w-0 items-center gap-2 text-sm">
        <li className="flex min-w-0 shrink-[3] items-center gap-2 text-muted">
          <Icon name="building" className="size-4" />
          <span className="sr-only">Organización: </span>
          <span className="truncate">{organizationName}</span>
        </li>
        {crumb?.group ? (
          <li className="flex min-w-0 items-center gap-2 text-muted">
            <span aria-hidden="true">/</span>
            <span className="truncate">{crumb.group}</span>
          </li>
        ) : null}
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

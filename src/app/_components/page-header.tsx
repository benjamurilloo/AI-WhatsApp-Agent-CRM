import Link from "next/link";
import {
  pageSubtitleClass,
  pageTitleClass,
  primaryLinkClass,
} from "./form-styles";
import { Icon } from "./icons";

// Encabezado de una pantalla (brief-15.1): título, subtítulo y, si corresponde, el botón de alta.
// El «+» del alta sigue siendo texto: forma parte del nombre del enlace desde la Fase 4.
export function PageHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle: string;
  action?: { href: string; label: string } | null;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div>
        <h1 className={pageTitleClass}>{title}</h1>
        <p className={pageSubtitleClass}>{subtitle}</p>
      </div>
      {action ? (
        <Link href={action.href} className={primaryLinkClass}>
          {action.label}
        </Link>
      ) : null}
    </div>
  );
}

// Lupa decorativa dentro de un campo de búsqueda: el campo conserva su etiqueta visible.
export function SearchIcon() {
  return (
    <Icon
      name="search"
      className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted"
    />
  );
}

// Lápiz de una fila (brief-15.1, D-1): lleva a la edición del detalle. Se llama «Editar» y el
// nombre de la fila lo describe, así el enlace del nombre sigue siendo el único con ese nombre.
export function EditLink({
  href,
  describedBy,
}: {
  href: string;
  describedBy: string;
}) {
  return (
    <Link
      href={href}
      aria-describedby={describedBy}
      className="grid size-9 place-items-center rounded-xl border border-border bg-surface text-foreground hover:bg-surface-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
    >
      <Icon name="pencil" className="size-4" />
      <span className="sr-only">Editar</span>
    </Link>
  );
}

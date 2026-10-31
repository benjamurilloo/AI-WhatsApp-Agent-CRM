import Link from "next/link";
import type { ReactNode } from "react";
import { linkClass, pageSubtitleClass, pageTitleClass } from "./form-styles";
import { Icon } from "./icons";

// Encabezado de las pantallas de detalle y de los formularios (brief-15.4): volver, una imagen a
// la izquierda (avatar o ícono), el título con sus estados, una línea debajo y las acciones.

export function BackLink({ href, label }: { href: string; label: string }) {
  return (
    <p>
      <Link
        href={href}
        className={`${linkClass} inline-flex items-center gap-1.5`}
      >
        <Icon name="arrowLeft" className="size-4" />
        {label}
      </Link>
    </p>
  );
}

// Las acciones de la ficha (brief-24.1, D-8; criterios v2, §Ubicación de botones): `primary` es la
// siguiente transición válida, una sola; `actions`, las secundarias visibles, como imprimir; y
// `more`, el «Más acciones» con lo menos frecuente y lo destructivo, al final.
export function DetailHeader({
  title,
  leading,
  badges,
  subtitle,
  primary,
  actions,
  more,
}: {
  title: string;
  leading?: ReactNode;
  badges?: ReactNode;
  subtitle?: ReactNode;
  primary?: ReactNode;
  actions?: ReactNode;
  more?: ReactNode;
}) {
  const hasActions = Boolean(primary || actions || more);
  return (
    <div className="mt-4 flex flex-wrap items-start justify-between gap-4">
      <div className="flex min-w-0 items-center gap-4">
        {leading}
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            {/* `min-w-0` porque el título es un ítem de un flex: sin él su ancho mínimo es el de
                su palabra más larga, y un nombre como «iPhone 13 128 GB Medianoche
                reacondicionado» desbordaba la página a 320 px. `break-words` sabe cortar la
                palabra, pero solo puede hacerlo cuando la caja ya puede encogerse
                (brief-24.5.1, AC-12). */}
            <h1 className={`${pageTitleClass} min-w-0 break-words`}>{title}</h1>
            {badges}
          </div>
          {subtitle ? (
            <div className={pageSubtitleClass}>{subtitle}</div>
          ) : null}
        </div>
      </div>
      {hasActions ? (
        <div className="flex flex-wrap items-start gap-3">
          {primary}
          {actions}
          {more}
        </div>
      ) : null}
    </div>
  );
}

// Ícono grande a la izquierda del título, cuando no hay avatar.
export function HeaderIcon({
  name,
}: {
  name: Parameters<typeof Icon>[0]["name"];
}) {
  return (
    <span className="grid size-14 shrink-0 place-items-center rounded-xl bg-primary-soft text-primary sm:size-16">
      <Icon name={name} className="size-7 sm:size-8" />
    </span>
  );
}

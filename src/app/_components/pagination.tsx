import Link from "next/link";
import { Icon } from "./icons";

// Paginación de los listados (brief-15.1, D-9): «Mostrando X a Y de Z» y enlaces a cada página,
// con el parámetro de página que cada listado ya tenía. Solo presentación: los números salen de lo
// que el listado ya devuelve (page, pageCount y total).

export type PageItem = number | "gap";

// Hasta `max` números alrededor de la página actual, siempre con la primera y la última, y «…»
// donde se saltean páginas.
export function pageItems(
  page: number,
  pageCount: number,
  max = 5,
): PageItem[] {
  if (pageCount <= max) {
    return Array.from({ length: pageCount }, (_, index) => index + 1);
  }
  const inner = max - 2;
  let start = Math.max(2, page - Math.floor(inner / 2));
  const end = Math.min(pageCount - 1, start + inner - 1);
  start = Math.max(2, end - inner + 1);
  const items: PageItem[] = [1];
  if (start > 2) items.push("gap");
  for (let value = start; value <= end; value += 1) items.push(value);
  if (end < pageCount - 1) items.push("gap");
  items.push(pageCount);
  return items;
}

// «Mostrando 11 a 20 de 26 conversaciones».
export function shownRangeText({
  page,
  pageSize,
  shown,
  total,
  singular,
  plural,
}: {
  page: number;
  pageSize: number;
  shown: number;
  total: number;
  singular: string;
  plural: string;
}): string {
  const first = (page - 1) * pageSize + 1;
  const last = first + shown - 1;
  return `Mostrando ${first} a ${last} de ${total} ${total === 1 ? singular : plural}`;
}

// Filas por página de los listados (brief-15.2, D-2), en ?filas=. Sin el parámetro, o con un valor
// que no está en la lista, el de siempre.
export const PAGE_SIZE_OPTIONS = [10, 25, 50] as const;
export const DEFAULT_PAGE_SIZE = 25;

export function parsePageSize(value: string | string[] | undefined): number {
  const raw = Array.isArray(value) ? value[0] : value;
  const size = Number(raw);
  return (PAGE_SIZE_OPTIONS as readonly number[]).includes(size)
    ? size
    : DEFAULT_PAGE_SIZE;
}

const pageLinkClass =
  "grid h-9 min-w-9 place-items-center rounded-lg px-2 text-sm font-semibold tabular-nums focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus";

// «Filas por página: 10 · 25 · 50», como enlaces: funcionan sin JavaScript y sin enviar el
// formulario de filtros. Cada enlace vuelve a la página 1 con los mismos filtros.
function PageSizeLinks({
  current,
  hrefFor,
}: {
  current: number;
  hrefFor: (size: number) => string;
}) {
  return (
    <div
      role="group"
      aria-label="Filas por página"
      className="flex flex-wrap items-center gap-1.5 text-sm"
    >
      <span aria-hidden="true" className="mr-1 text-muted">
        Filas por página
      </span>
      {PAGE_SIZE_OPTIONS.map((size) =>
        size === current ? (
          <span
            key={size}
            aria-current="true"
            className={`${pageLinkClass} bg-action text-on-action`}
          >
            {size}
            <span className="sr-only"> filas por página</span>
          </span>
        ) : (
          <Link
            key={size}
            href={hrefFor(size)}
            className={`${pageLinkClass} border border-border bg-surface text-foreground hover:bg-surface-muted`}
          >
            {size}
            <span className="sr-only"> filas por página</span>
          </Link>
        ),
      )}
    </div>
  );
}

export function Pagination({
  page,
  pageCount,
  rangeText,
  hrefFor,
  label = "Paginación",
  className = "mt-6",
  pageSize,
}: {
  page: number;
  pageCount: number;
  rangeText: string;
  hrefFor: (page: number) => string;
  // Una pantalla con dos paginaciones les da nombres distintos (brief-15.4).
  label?: string;
  className?: string;
  // Los enlaces de filas por página (brief-15.2, D-2), debajo de la paginación.
  pageSize?: { current: number; hrefFor: (size: number) => string };
}) {
  if (pageSize) {
    return (
      <div className={`${className} flex flex-col gap-3`}>
        <Pagination
          page={page}
          pageCount={pageCount}
          rangeText={rangeText}
          hrefFor={hrefFor}
          label={label}
          className=""
        />
        <PageSizeLinks current={pageSize.current} hrefFor={pageSize.hrefFor} />
      </div>
    );
  }
  const arrow = (
    target: number,
    arrowLabel: string,
    icon: "chevronLeft" | "chevronRight",
  ) =>
    target >= 1 && target <= pageCount ? (
      <Link
        href={hrefFor(target)}
        aria-label={arrowLabel}
        className={`${pageLinkClass} border border-border bg-surface text-foreground hover:bg-surface-muted`}
      >
        <Icon name={icon} className="size-4" />
      </Link>
    ) : (
      <span
        aria-hidden="true"
        className={`${pageLinkClass} border border-border text-muted opacity-50`}
      >
        <Icon name={icon} className="size-4" />
      </span>
    );

  const range = <p className="text-sm text-muted tabular-nums">{rangeText}</p>;
  if (pageCount <= 1) return <div className={className}>{range}</div>;
  // El rango va dentro de la navegación, como el «Página X de Y» que reemplaza.
  return (
    <nav
      aria-label={label}
      className={`${className} flex flex-wrap items-center justify-between gap-4`}
    >
      {range}
      <ul className="flex flex-wrap items-center gap-1.5">
        <li>{arrow(page - 1, "Página anterior", "chevronLeft")}</li>
        {pageItems(page, pageCount).map((item, index) =>
          item === "gap" ? (
            <li
              key={`gap-${index}`}
              aria-hidden="true"
              className="px-1 text-muted"
            >
              …
            </li>
          ) : (
            <li key={item}>
              {item === page ? (
                <span
                  aria-current="page"
                  className={`${pageLinkClass} bg-action text-on-action`}
                >
                  <span className="sr-only">Página </span>
                  {item}
                </span>
              ) : (
                <Link
                  href={hrefFor(item)}
                  className={`${pageLinkClass} border border-border bg-surface text-foreground hover:bg-surface-muted`}
                >
                  <span className="sr-only">Página </span>
                  {item}
                </Link>
              )}
            </li>
          ),
        )}
        <li>{arrow(page + 1, "Página siguiente", "chevronRight")}</li>
      </ul>
    </nav>
  );
}

import type { ReactNode } from "react";
import { tableCellClass, tableHeadCellClass } from "./form-styles";
import { Pagination, shownRangeText } from "./pagination";
import { SectionCard } from "./section-card";

// Historial de auditoría de un detalle (brief-15.4): la misma tabla en productos, clientes e
// información, con la paginación de la 15.1. Cada pantalla arma las filas con su propio texto
// de acción y de cambio; acá solo se presentan.

export type AuditRow = {
  id: string;
  when: string;
  actor: ReactNode;
  action: string;
  change: string;
};

export function AuditCard({
  caption,
  rows,
  page,
  pageCount,
  pageSize,
  total,
  hrefFor,
}: {
  caption: string;
  rows: AuditRow[];
  page: number;
  pageCount: number;
  pageSize: number;
  total: number;
  hrefFor: (page: number) => string;
}) {
  return (
    <SectionCard
      id="auditoria-titulo"
      title="Historial de auditoría"
      icon="history"
      className="mt-6"
    >
      {total === 0 ? (
        <p className="text-sm text-muted">Sin cambios registrados todavía.</p>
      ) : (
        // Se desplaza de costado en un teléfono: con foco y nombre, se recorre con el teclado
        // (axe, scrollable-region-focusable; revisión independiente de la 16.1.1).
        <div
          className="-mx-5 overflow-x-auto sm:-mx-6"
          tabIndex={0}
          role="region"
          aria-label={caption}
        >
          <table className="w-full border-collapse text-left text-sm">
            <caption className="sr-only">{caption}</caption>
            <thead>
              <tr>
                <th scope="col" className={tableHeadCellClass}>
                  Fecha
                </th>
                <th scope="col" className={tableHeadCellClass}>
                  Autor
                </th>
                <th scope="col" className={tableHeadCellClass}>
                  Acción
                </th>
                <th scope="col" className={tableHeadCellClass}>
                  Cambio
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <td className={`${tableCellClass} whitespace-nowrap`}>
                    {row.when}
                  </td>
                  <td className={tableCellClass}>{row.actor}</td>
                  <td className={tableCellClass}>{row.action}</td>
                  <td className={`${tableCellClass} text-muted`}>
                    {row.change}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {total > 0 ? (
        <Pagination
          label="Paginación de auditoría"
          className="mt-4"
          page={page}
          pageCount={pageCount}
          rangeText={shownRangeText({
            page,
            pageSize,
            shown: rows.length,
            total,
            singular: "cambio",
            plural: "cambios",
          })}
          hrefFor={hrefFor}
        />
      ) : null}
    </SectionCard>
  );
}

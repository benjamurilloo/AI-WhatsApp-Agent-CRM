import type { Metadata } from "next";
import Link from "next/link";
import {
  formatCuit,
  listSuppliers,
  SUPPLIERS_PAGE_SIZE,
} from "@/modules/purchasing";
import { requireSession } from "@/app/_auth/session";
import {
  activeBadgeClass,
  cardClass,
  inactiveBadgeClass,
  inlineButtonClass,
  inputClass,
  labelClass,
  linkClass,
  selectClass,
  tableCellClass,
  tableHeadCellClass,
} from "@/app/_components/form-styles";
import { Icon } from "@/app/_components/icons";
import {
  EditLink,
  PageHeader,
  SearchIcon,
} from "@/app/_components/page-header";
import { PageNotice } from "@/app/_components/page-notice";
import { Pagination, shownRangeText } from "@/app/_components/pagination";
import { PurchasingSubNav } from "../purchasing-sub-nav";
import {
  hasActiveFilters,
  parseSupplierFilters,
  statusParam,
  supplierFiltersHref,
  type SearchParams,
} from "./filters";
import {
  FORBIDDEN_PAGE_MESSAGE,
  NO_SUPPLIER_RESULTS_MESSAGE,
  NO_SUPPLIERS_MESSAGE,
} from "./messages";

export const metadata: Metadata = {
  title: "Proveedores — AI WhatsApp Agent CRM",
};

const TITLE = "Proveedores";

// La lista de proveedores (brief-22.2, D-9 y D-10): búsqueda por parte del nombre o por CUIT,
// filtro de estado y página en la URL. Orden alfabético. Tabla en escritorio y tarjetas en móvil,
// como clientes. Solo admin: a un viewer, purchasing le responde FORBIDDEN y la página lo dice.
// Desde la 22.3, con la navegación interna de Compras (brief-22.3, D-10).
export default async function SuppliersPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const context = await requireSession();
  const filters = parseSupplierFilters(await searchParams);
  const result = await listSuppliers(context, filters);
  if (!result.ok) {
    return <PageNotice title={TITLE} message={FORBIDDEN_PAGE_MESSAGE} />;
  }
  const filtered = hasActiveFilters(filters);

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <PageHeader
        title={TITLE}
        subtitle="A quién le comprás mercadería."
        action={{
          href: "/compras/proveedores/nuevo",
          label: "+ Nuevo proveedor",
        }}
      />
      <PurchasingSubNav current="proveedores" />

      <form
        key={supplierFiltersHref(filters)}
        method="get"
        action="/compras/proveedores"
        className="mt-6 flex flex-wrap items-end gap-3"
      >
        <div className="flex flex-col gap-1">
          <label htmlFor="q" className={labelClass}>
            Buscar
          </label>
          <div className="relative">
            <input
              id="q"
              name="q"
              type="search"
              defaultValue={filters.text}
              placeholder="Nombre o CUIT"
              maxLength={100}
              className={`${inputClass} w-72 pl-9`}
            />
            <SearchIcon />
          </div>
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="estado" className={labelClass}>
            Estado
          </label>
          <select
            id="estado"
            name="estado"
            defaultValue={statusParam(filters.status)}
            className={selectClass}
          >
            <option value="activos">Solo activos</option>
            <option value="inactivos">Solo inactivos</option>
            <option value="todos">Todos</option>
          </select>
        </div>
        <button type="submit" className={inlineButtonClass}>
          <Icon name="filter" className="size-4" />
          Buscar
        </button>
        {filtered ? (
          <Link href="/compras/proveedores" className={`${linkClass} py-2`}>
            Limpiar filtros
          </Link>
        ) : null}
      </form>

      {result.total === 0 ? (
        <div className={`mt-8 ${cardClass} p-6`}>
          <p>{filtered ? NO_SUPPLIER_RESULTS_MESSAGE : NO_SUPPLIERS_MESSAGE}</p>
          <p className="mt-3">
            {filtered ? (
              <Link href="/compras/proveedores" className={linkClass}>
                Limpiar filtros
              </Link>
            ) : (
              <Link href="/compras/proveedores/nuevo" className={linkClass}>
                Crear el primero
              </Link>
            )}
          </p>
        </div>
      ) : (
        <>
          <div className={`mt-8 hidden overflow-hidden md:block ${cardClass}`}>
            <table className="w-full border-collapse text-left text-[0.9375rem]">
              <caption className="sr-only">
                Proveedores de la organización
              </caption>
              <thead>
                <tr>
                  <th scope="col" className={tableHeadCellClass}>
                    Nombre
                  </th>
                  <th scope="col" className={tableHeadCellClass}>
                    Teléfono
                  </th>
                  <th scope="col" className={tableHeadCellClass}>
                    Email
                  </th>
                  <th scope="col" className={tableHeadCellClass}>
                    CUIT
                  </th>
                  <th scope="col" className={tableHeadCellClass}>
                    Activo
                  </th>
                  <th scope="col" className={tableHeadCellClass}>
                    Acciones
                  </th>
                </tr>
              </thead>
              <tbody>
                {result.suppliers.map((supplier) => (
                  <tr key={supplier.id}>
                    <td className={`${tableCellClass} font-semibold`}>
                      <Link
                        id={`proveedor-${supplier.id}`}
                        href={`/compras/proveedores/${supplier.id}`}
                        className={linkClass}
                      >
                        {supplier.name}
                      </Link>
                    </td>
                    <td className={`${tableCellClass} whitespace-nowrap`}>
                      {supplier.phone ?? "—"}
                    </td>
                    <td className={tableCellClass}>{supplier.email ?? "—"}</td>
                    <td className={`${tableCellClass} whitespace-nowrap`}>
                      {supplier.cuit ? formatCuit(supplier.cuit) : "—"}
                    </td>
                    <td className={tableCellClass}>
                      <span
                        className={
                          supplier.isActive
                            ? activeBadgeClass
                            : inactiveBadgeClass
                        }
                      >
                        {supplier.isActive ? "Sí" : "No"}
                      </span>
                    </td>
                    <td className={tableCellClass}>
                      <EditLink
                        href={`/compras/proveedores/${supplier.id}/editar`}
                        describedBy={`proveedor-${supplier.id}`}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <ul
            aria-label="Proveedores de la organización"
            className="mt-6 flex flex-col gap-3 md:hidden"
          >
            {result.suppliers.map((supplier) => (
              <li key={supplier.id} className={`${cardClass} p-4`}>
                <p className="font-semibold">
                  <Link
                    href={`/compras/proveedores/${supplier.id}`}
                    className={linkClass}
                  >
                    {supplier.name}
                  </Link>
                  {supplier.isActive ? null : (
                    <span className="ml-2 text-sm font-normal text-muted">
                      · Inactivo
                    </span>
                  )}
                </p>
                <p className="mt-2 text-sm">
                  {supplier.phone ?? "Sin teléfono"}
                </p>
                {supplier.cuit ? (
                  <p className="mt-1 text-sm text-muted">
                    CUIT {formatCuit(supplier.cuit)}
                  </p>
                ) : null}
              </li>
            ))}
          </ul>

          <Pagination
            page={result.page}
            pageCount={result.pageCount}
            rangeText={shownRangeText({
              page: result.page,
              pageSize: SUPPLIERS_PAGE_SIZE,
              shown: result.suppliers.length,
              total: result.total,
              singular: "proveedor",
              plural: "proveedores",
            })}
            hrefFor={(page) => supplierFiltersHref({ ...filters, page })}
          />
        </>
      )}
    </main>
  );
}

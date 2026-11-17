import type { Metadata } from "next";
import Link from "next/link";
import { hasCapability } from "@/modules/organizations";
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
  outlineButtonClass,
  primaryLinkClass,
  roleBadgeClass,
  selectClass,
  tableCellClass,
  tableHeadCellClass,
} from "@/app/_components/form-styles";
import { EmptyState } from "@/app/_components/empty-state";
import { Icon } from "@/app/_components/icons";
import { PageHeader, SearchIcon } from "@/app/_components/page-header";
import { PageNotice } from "@/app/_components/page-notice";
import { Pagination, shownRangeText } from "@/app/_components/pagination";
import { PurchasingSubNav } from "../purchasing-sub-nav";
import {
  hasActiveFilters,
  parseSupplierFilters,
  statusParam,
  supplierFiltersHref,
  typeParam,
  type SearchParams,
  type SupplierTypeFilter,
} from "./filters";
import {
  FORBIDDEN_PAGE_MESSAGE,
  INACTIVE_SUPPLIERS_NOTE,
  NO_SUPPLIER_RESULTS_MESSAGE,
  NO_SUPPLIERS_MESSAGE,
} from "./messages";

export const metadata: Metadata = {
  title: "Proveedores — AI WhatsApp Agent CRM",
};

const TITLE = "Proveedores";

// Sin datos, y no un guion: el guion no se lee en voz alta (lámina 13).
const EMPTY_CELL = "Sin datos";

const TYPE_OPTIONS: { value: SupplierTypeFilter; label: string }[] = [
  { value: "all", label: "Todos" },
  { value: "supplier", label: "Proveedores" },
  { value: "technician", label: "Técnicos" },
];

// La lista de proveedores (brief-22.2, D-9 y D-10): búsqueda por parte del nombre o por CUIT,
// filtro de estado y página en la URL. Orden alfabético. Tabla en escritorio y tarjetas en móvil,
// como clientes. Solo admin: a un viewer, purchasing le responde FORBIDDEN y la página lo dice.
// Desde la 22.3, con la navegación interna de Compras (brief-22.3, D-10).
//
// *Desde la 24.8.2-b* ([brief-24.8.2-b](../../../../../docs/decisions/brief-24.8.2-b-compras-proveedores-tecnicos-y-cuenta.md),
// lámina 13 del lote 28): **las acciones, los filtros, la tabla y el pie dentro de una sola
// tarjeta** (V-1), con «Ver cuentas a pagar» al lado del alta (V-2), la columna y el filtro
// **«Tipo»** (V-3 y V-4, D-3), «Ver» por fila en lugar del lápiz (V-8) y el pie con el aviso de los
// inactivos y el total (V-9). **Ninguna regla cambió.** Lo de técnico **solo con la capacidad
// `repairs`** (ADR 0024, punto 10): sin ella no hay técnicos, y un filtro de una sola opción no se
// dibuja, por la regla que dejó la 24.8.2. **No se adoptan** la pérdida de la columna CUIT (V-5),
// que es por donde también se busca, ni el placeholder que solo nombra el nombre (V-6).
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
  const repairs = await hasCapability(context.organizationId, "repairs");
  const filtered = hasActiveFilters(filters);
  // El filtro por tipo que trae un enlace sigue valiendo aunque la capacidad se haya apagado: la
  // lista ya está filtrada y el control no se dibuja, así que viaja en un campo oculto.
  const keepType = !repairs && filters.type !== "all";

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <PageHeader title={TITLE} subtitle="A quién le comprás mercadería." />
      <PurchasingSubNav current="proveedores" />

      <div className={`mt-6 ${cardClass} min-w-0`}>
        <div className="flex flex-wrap items-center justify-end gap-3 px-5 pt-5 sm:px-6 sm:pt-6">
          <Link href="/compras/a-pagar" className={`${linkClass} py-2`}>
            <Icon name="list" className="mr-1.5 inline size-4 align-text-top" />
            Ver cuentas a pagar
          </Link>
          <Link href="/compras/proveedores/nuevo" className={primaryLinkClass}>
            + Nuevo proveedor
          </Link>
        </div>

        <form
          key={supplierFiltersHref(filters)}
          method="get"
          action="/compras/proveedores"
          className="flex flex-wrap items-end gap-3 px-5 py-5 sm:px-6 sm:py-6"
        >
          <div className="flex min-w-0 flex-col gap-1">
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
                className={`${inputClass} w-72 max-w-full pl-9`}
              />
              <SearchIcon />
            </div>
          </div>
          <div className="flex min-w-0 flex-col gap-1">
            <label htmlFor="estado" className={labelClass}>
              Estado
            </label>
            <select
              id="estado"
              name="estado"
              defaultValue={statusParam(filters.status)}
              className={`${selectClass} w-full min-w-0`}
            >
              <option value="activos">Solo activos</option>
              <option value="inactivos">Solo inactivos</option>
              <option value="todos">Todos</option>
            </select>
          </div>
          {repairs ? (
            <fieldset className="flex min-w-0 flex-col gap-1">
              <legend className={labelClass}>Tipo</legend>
              <div className="mt-1 flex flex-wrap rounded-xl border border-border bg-surface p-1">
                {TYPE_OPTIONS.map((option) => (
                  // `relative`: el radio es `sr-only`, que es `position: absolute`, y sin un
                  // ancestro posicionado estira el documento (medido en la 24.8.2).
                  <label key={option.value} className="relative min-w-0">
                    <input
                      type="radio"
                      name="tipo"
                      value={typeParam(option.value)}
                      defaultChecked={filters.type === option.value}
                      className="peer sr-only"
                    />
                    <span className="block cursor-pointer rounded-lg px-3 py-1.5 text-sm font-semibold text-muted peer-checked:bg-primary-soft peer-checked:text-on-primary-soft peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-focus">
                      {option.label}
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>
          ) : keepType ? (
            <input type="hidden" name="tipo" value={typeParam(filters.type)} />
          ) : null}
          <button type="submit" className={inlineButtonClass}>
            <Icon name="search" className="size-4" />
            Buscar
          </button>
          {filtered ? (
            <Link href="/compras/proveedores" className={`${linkClass} py-2`}>
              Limpiar filtros
            </Link>
          ) : null}
        </form>

        {result.total === 0 ? (
          <div className="border-t border-border px-5 py-6 sm:px-6">
            <EmptyState
              icon="truck"
              title={
                filtered ? NO_SUPPLIER_RESULTS_MESSAGE : NO_SUPPLIERS_MESSAGE
              }
              description={
                filtered
                  ? "Probá con otras palabras o quitá algún filtro."
                  : "Cada proveedor que cargues aparece acá, con sus órdenes, recepciones y pagos."
              }
              actions={
                filtered
                  ? [
                      {
                        href: "/compras/proveedores",
                        label: "Limpiar filtros",
                        variant: "outline",
                      },
                    ]
                  : [
                      {
                        href: "/compras/proveedores/nuevo",
                        label: "Crear el primero",
                        variant: "primary",
                      },
                    ]
              }
            />
          </div>
        ) : (
          <>
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full border-collapse text-left text-[0.9375rem]">
                <caption className="sr-only">
                  Proveedores de la organización
                </caption>
                <thead>
                  <tr>
                    <th scope="col" className={tableHeadCellClass}>
                      {/* La flecha es adorno: el orden alfabético es fijo desde la 22.2 (V-10). */}
                      Nombre
                      <Icon
                        name="chevronDown"
                        className="ml-1.5 inline size-3.5 rotate-180 align-text-top text-muted"
                      />
                    </th>
                    <th scope="col" className={tableHeadCellClass}>
                      Estado
                    </th>
                    {repairs ? (
                      <th scope="col" className={tableHeadCellClass}>
                        Tipo
                      </th>
                    ) : null}
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
                      <td className={tableCellClass}>
                        <span
                          className={
                            supplier.isActive
                              ? activeBadgeClass
                              : inactiveBadgeClass
                          }
                        >
                          {supplier.isActive ? "Activo" : "Inactivo"}
                        </span>
                      </td>
                      {repairs ? (
                        <td className={tableCellClass}>
                          <SupplierTypeBadge
                            isTechnician={supplier.isTechnician}
                          />
                        </td>
                      ) : null}
                      <td className={`${tableCellClass} whitespace-nowrap`}>
                        {supplier.phone ?? EMPTY_CELL}
                      </td>
                      <td className={tableCellClass}>
                        {supplier.email ?? EMPTY_CELL}
                      </td>
                      <td className={`${tableCellClass} whitespace-nowrap`}>
                        {supplier.cuit ? formatCuit(supplier.cuit) : EMPTY_CELL}
                      </td>
                      <td className={tableCellClass}>
                        <Link
                          href={`/compras/proveedores/${supplier.id}`}
                          aria-describedby={`proveedor-${supplier.id}`}
                          className={outlineButtonClass}
                        >
                          Ver
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <ul
              aria-label="Proveedores de la organización"
              className="flex flex-col gap-3 border-t border-border px-5 py-5 sm:px-6 md:hidden"
            >
              {result.suppliers.map((supplier) => (
                <li key={supplier.id} className={`${cardClass} min-w-0 p-4`}>
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
                  {repairs ? (
                    <p className="mt-2">
                      <SupplierTypeBadge isTechnician={supplier.isTechnician} />
                    </p>
                  ) : null}
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

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-5 py-4 sm:px-6">
              <p className="flex min-w-0 items-start gap-2 text-sm text-muted">
                <Icon name="info" className="mt-0.5 size-4 shrink-0" />
                <span className="min-w-0">{INACTIVE_SUPPLIERS_NOTE}</span>
              </p>
              <p className="text-sm font-semibold tabular-nums">
                {result.total}{" "}
                {result.total === 1 ? "proveedor" : "proveedores"}
              </p>
            </div>
          </>
        )}
      </div>

      {result.pageCount > 1 ? (
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
      ) : null}
    </main>
  );
}

// «Proveedor» o «Técnico» (V-3). Solo se dibuja con la capacidad repairs: quien la llama decide.
function SupplierTypeBadge({ isTechnician }: { isTechnician: boolean }) {
  return isTechnician ? (
    <span className={`${roleBadgeClass} gap-1.5`}>
      <Icon name="wrench" className="size-3.5" />
      Técnico
    </span>
  ) : (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-surface-muted px-2.5 py-0.5 text-[0.8125rem] font-semibold whitespace-nowrap text-foreground">
      <Icon name="package" className="size-3.5" />
      Proveedor
    </span>
  );
}

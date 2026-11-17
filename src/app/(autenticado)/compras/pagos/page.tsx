import type { Metadata } from "next";
import Link from "next/link";
import {
  listSupplierPaymentFilterOptions,
  listSupplierPayments,
} from "@/modules/cash";
import { getOrganizationTimezone } from "@/modules/organizations";
import { getSupplier, getSupplierNames } from "@/modules/purchasing";
import { requireSession } from "@/app/_auth/session";
import {
  cardClass,
  inlineButtonClass,
  inputClass,
  labelClass,
  linkClass,
  selectClass,
} from "@/app/_components/form-styles";
import { EmptyState } from "@/app/_components/empty-state";
import { Icon } from "@/app/_components/icons";
import { PageHeader, SearchIcon } from "@/app/_components/page-header";
import { PageNotice } from "@/app/_components/page-notice";
import { Pagination, shownRangeText } from "@/app/_components/pagination";
import { UNKNOWN_SUPPLIER_TEXT } from "../ordenes/messages";
import { PurchasingSubNav } from "../purchasing-sub-nav";
import {
  hasActiveSupplierPaymentFilters,
  parseSupplierPaymentFilters,
  statusParam,
  supplierPaymentFiltersHref,
  type SearchParams,
} from "./filters";
import {
  NO_PAYMENT_RESULTS_MESSAGE,
  NO_PAYMENTS_MESSAGE,
  PAYMENT_ADMIN_ONLY_MESSAGE,
} from "./messages";
import { SupplierPaymentPanel } from "./payment-panel";
import { SupplierPaymentsTable } from "./payments-table";

export const metadata: Metadata = {
  title: "Pagos a proveedores — AI WhatsApp Agent CRM",
};

const TITLE = "Pagos a proveedores";

// Pantalla 52 (brief-22.6, D-13; rediseñada en la 24.8.2 con la lámina 08): la lista de pagos a
// proveedores, el más nuevo primero, con los filtros de proveedor, moneda y estado y la búsqueda por
// PP o APP, todos en la URL, y **el detalle en un panel que abre y cierra por la URL** (D-2). El
// nombre de cada proveedor lo compone la página con purchasing, que es su dueño. Solo admin: a un
// viewer, cash le responde FORBIDDEN y la página lo dice.
export default async function SupplierPaymentsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const context = await requireSession();
  const filters = parseSupplierPaymentFilters(await searchParams);
  const [result, optionsResult] = await Promise.all([
    listSupplierPayments(context, {
      status: filters.status,
      supplierId: filters.supplierId || null,
      currency: filters.currency || null,
      search: filters.number,
      page: filters.page,
    }),
    listSupplierPaymentFilterOptions(context),
  ]);
  if (!result.ok) {
    return <PageNotice title={TITLE} message={PAYMENT_ADMIN_ONLY_MESSAGE} />;
  }
  const { payments } = result;
  const options = optionsResult.ok
    ? optionsResult.options
    : { suppliers: { kind: "text" as const }, currencies: [] };
  // Un solo pedido de nombres para las filas y para el filtro: purchasing es el dueño de los
  // nombres y la página compone (H-3).
  const nameIds = new Set(payments.items.map((row) => row.supplierId));
  if (options.suppliers.kind === "select") {
    for (const id of options.suppliers.supplierIds) nameIds.add(id);
  }
  const [timeZone, names, filteredSupplier] = await Promise.all([
    getOrganizationTimezone(context),
    getSupplierNames(context, [...nameIds]),
    filters.supplierId ? getSupplier(context, filters.supplierId) : null,
  ]);
  const supplierNames = names.ok ? names.names : new Map<string, string>();
  const supplierName = filteredSupplier?.ok
    ? filteredSupplier.supplier.name
    : UNKNOWN_SUPPLIER_TEXT;
  // El `<select>` de proveedores, ordenado por nombre: ordenar sin los nombres no se puede, y
  // traerlos a cash sería un JOIN entre módulos. El proveedor filtrado entra aunque no tenga
  // ningún pago —se llega así desde su ficha—: si no, el filtro estaría puesto y el control diría
  // «Todos».
  const supplierOptions =
    options.suppliers.kind === "select"
      ? [
          ...options.suppliers.supplierIds,
          ...(filters.supplierId &&
          !options.suppliers.supplierIds.includes(filters.supplierId)
            ? [filters.supplierId]
            : []),
        ]
          .map((id) => ({
            id,
            name:
              supplierNames.get(id) ??
              (id === filters.supplierId ? supplierName : null) ??
              UNKNOWN_SUPPLIER_TEXT,
          }))
          .sort((a, b) => a.name.localeCompare(b.name, "es"))
      : null;
  const filtered = hasActiveSupplierPaymentFilters(filters);
  const pageCount = Math.max(1, Math.ceil(payments.total / payments.pageSize));
  const open = filters.payment;
  // Cerrar el panel devuelve al listado con los filtros y la página donde estaban (D-2).
  const closeHref = supplierPaymentFiltersHref({ ...filters, payment: "" });

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <PageHeader
        title={TITLE}
        subtitle="Lo que se le pagó a cada proveedor, contra una recepción o a cuenta."
      />
      <PurchasingSubNav current="pagos" />

      <form
        key={closeHref}
        method="get"
        action="/compras/pagos"
        className="mt-6 flex flex-wrap items-end gap-3"
      >
        {/* El `<select>` lleva `w-full min-w-0`: su ancho mínimo es el de su opción más larga y sin
            eso desborda en pantalla angosta (medido en la 24.7.1). */}
        {supplierOptions ? (
          <div className="flex min-w-0 flex-col gap-1 sm:w-64">
            <label htmlFor="proveedor" className={labelClass}>
              Proveedor
            </label>
            <select
              id="proveedor"
              name="proveedor"
              defaultValue={filters.supplierId}
              className={`${selectClass} w-full min-w-0`}
            >
              <option value="">Todos</option>
              {supplierOptions.map((supplier) => (
                <option key={supplier.id} value={supplier.id}>
                  {supplier.name}
                </option>
              ))}
            </select>
          </div>
        ) : filters.supplierId ? (
          // Pasado el tope no hay `<select>`, pero el filtro que trae un enlace desde la ficha del
          // proveedor sigue valiendo: viaja en un campo oculto, como antes de la 24.8.2.
          <input type="hidden" name="proveedor" value={filters.supplierId} />
        ) : null}
        {options.currencies.length > 1 || filters.currency ? (
          <div className="flex min-w-0 flex-col gap-1 sm:w-40">
            <label htmlFor="moneda" className={labelClass}>
              Moneda
            </label>
            <select
              id="moneda"
              name="moneda"
              defaultValue={filters.currency}
              className={`${selectClass} w-full min-w-0`}
            >
              <option value="">Todas</option>
              {[
                ...new Set([
                  ...options.currencies,
                  ...(filters.currency ? [filters.currency] : []),
                ]),
              ]
                .sort()
                .map((currency) => (
                  <option key={currency} value={currency}>
                    {currency}
                  </option>
                ))}
            </select>
          </div>
        ) : null}
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
            <option value="todos">Todos</option>
            <option value="vigente">Vigentes</option>
            <option value="anulado">Anulados</option>
          </select>
        </div>
        <div className="flex min-w-0 flex-col gap-1">
          <label htmlFor="numero" className={labelClass}>
            Número
          </label>
          <div className="relative">
            <input
              id="numero"
              name="numero"
              type="search"
              defaultValue={filters.number}
              placeholder="PP-000123 o APP-000001"
              autoComplete="off"
              className={`${inputClass} w-52 pl-9`}
            />
            <SearchIcon />
          </div>
        </div>
        {/* El panel abierto sobrevive a un cambio de filtros solo si viaja con el formulario. */}
        {open ? <input type="hidden" name="pago" value={open} /> : null}
        <button type="submit" className={inlineButtonClass}>
          <Icon name="search" className="size-4" />
          Buscar
        </button>
        {filtered ? (
          <Link
            href={supplierPaymentFiltersHref({
              supplierId: "",
              number: "",
              status: "all",
              currency: "",
              page: 1,
              payment: open,
            })}
            className={`${linkClass} py-2`}
          >
            Limpiar filtros
          </Link>
        ) : null}
      </form>

      {filters.supplierId && !supplierOptions ? (
        <p className="mt-4 text-sm">
          Pagos a <span className="font-semibold">{supplierName}</span>.{" "}
          <Link
            href={supplierPaymentFiltersHref({
              ...filters,
              supplierId: "",
              page: 1,
            })}
            className={linkClass}
          >
            Ver los de todos los proveedores
          </Link>
        </p>
      ) : null}

      {/* `flex` y no `grid`: cuando el panel no se dibuja —un `?pago=` que no existe, o de otra
          organización— la lista ocupa el ancho entero, sin la columna vacía que una grilla de dos
          columnas reservaría igual. */}
      <div className="mt-6 flex flex-col items-start gap-6 lg:flex-row">
        <div className="w-full min-w-0 lg:flex-1">
          {payments.total === 0 ? (
            <EmptyState
              icon="banknote"
              title={
                filtered ? NO_PAYMENT_RESULTS_MESSAGE : NO_PAYMENTS_MESSAGE
              }
              description={
                filtered
                  ? "Probá con otras palabras o quitá algún filtro."
                  : "Un pago se registra desde una recepción, con «Registrar un pago», o desde la ficha de un proveedor, con «Pago a cuenta»."
              }
              actions={
                filtered
                  ? [
                      {
                        href: "/compras/pagos",
                        label: "Limpiar filtros",
                        variant: "outline",
                      },
                    ]
                  : []
              }
            />
          ) : (
            <>
              <div className={`${cardClass} p-5 sm:p-6`}>
                <SupplierPaymentsTable
                  caption="Pagos a proveedores de la organización"
                  payments={payments.items}
                  timeZone={timeZone}
                  supplierNames={supplierNames}
                  layout="list"
                  hrefForPayment={(payment) =>
                    supplierPaymentFiltersHref({
                      ...filters,
                      payment: payment.id,
                    })
                  }
                />
              </div>
              <Pagination
                page={payments.page}
                pageCount={pageCount}
                rangeText={shownRangeText({
                  page: payments.page,
                  pageSize: payments.pageSize,
                  shown: payments.items.length,
                  total: payments.total,
                  singular: "pago",
                  plural: "pagos",
                })}
                hrefFor={(target) =>
                  supplierPaymentFiltersHref({ ...filters, page: target })
                }
              />
            </>
          )}
        </div>
        {/* `order-first` hasta `lg`: en pantalla angosta el panel va arriba de la tabla. */}
        <SupplierPaymentPanel
          context={context}
          paymentId={open}
          timeZone={timeZone}
          closeHref={closeHref}
        />
      </div>

      <p className="mt-6 text-sm text-muted">Fechas en {timeZone}.</p>
    </main>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { listSupplierPayments } from "@/modules/cash";
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
import { SupplierPaymentsTable } from "./payments-table";

export const metadata: Metadata = {
  title: "Pagos a proveedores — AI WhatsApp Agent CRM",
};

const TITLE = "Pagos a proveedores";

// Pantalla 52 (brief-22.6, D-13): la lista de pagos a proveedores, el más nuevo primero, con los
// filtros de estado y de proveedor y la búsqueda por PP o APP, en la URL. El nombre de cada proveedor
// lo compone la página con purchasing. Solo admin: a un viewer, cash le responde FORBIDDEN y la
// página lo dice.
export default async function SupplierPaymentsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const context = await requireSession();
  const filters = parseSupplierPaymentFilters(await searchParams);
  const result = await listSupplierPayments(context, {
    status: filters.status,
    supplierId: filters.supplierId || null,
    search: filters.number,
    page: filters.page,
  });
  if (!result.ok) {
    return <PageNotice title={TITLE} message={PAYMENT_ADMIN_ONLY_MESSAGE} />;
  }
  const { payments } = result;
  const [timeZone, names, filteredSupplier] = await Promise.all([
    getOrganizationTimezone(context),
    getSupplierNames(
      context,
      payments.items.map((row) => row.supplierId),
    ),
    filters.supplierId ? getSupplier(context, filters.supplierId) : null,
  ]);
  const supplierName = filteredSupplier?.ok
    ? filteredSupplier.supplier.name
    : UNKNOWN_SUPPLIER_TEXT;
  const filtered = hasActiveSupplierPaymentFilters(filters);
  const pageCount = Math.max(1, Math.ceil(payments.total / payments.pageSize));

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <PageHeader
        title={TITLE}
        subtitle="Lo que se le pagó a cada proveedor, contra una recepción o a cuenta."
      />
      <PurchasingSubNav current="pagos" />

      <form
        key={supplierPaymentFiltersHref(filters)}
        method="get"
        action="/compras/pagos"
        className="mt-6 flex flex-wrap items-end gap-3"
      >
        <div className="flex flex-col gap-1">
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
            <option value="todos">Todos</option>
            <option value="vigente">Vigentes</option>
            <option value="anulado">Anulados</option>
          </select>
        </div>
        {filters.supplierId ? (
          <input type="hidden" name="proveedor" value={filters.supplierId} />
        ) : null}
        <button type="submit" className={inlineButtonClass}>
          <Icon name="search" className="size-4" />
          Buscar
        </button>
        {filtered ? (
          <Link href="/compras/pagos" className={`${linkClass} py-2`}>
            Limpiar filtros
          </Link>
        ) : null}
      </form>

      {filters.supplierId ? (
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

      {payments.total === 0 ? (
        <EmptyState
          icon="banknote"
          title={filtered ? NO_PAYMENT_RESULTS_MESSAGE : NO_PAYMENTS_MESSAGE}
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
          <div className={`mt-8 ${cardClass} p-5 sm:p-6`}>
            <SupplierPaymentsTable
              caption="Pagos a proveedores de la organización"
              payments={payments.items}
              timeZone={timeZone}
              supplierNames={names.ok ? names.names : new Map()}
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

      <p className="mt-6 text-sm text-muted">Fechas en {timeZone}.</p>
    </main>
  );
}

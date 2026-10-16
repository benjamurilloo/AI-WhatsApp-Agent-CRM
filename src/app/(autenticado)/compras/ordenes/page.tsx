import type { Metadata } from "next";
import Link from "next/link";
import { getOrganizationTimezone } from "@/modules/organizations";
import {
  getSupplier,
  listPurchaseOrders,
  PURCHASE_ORDERS_PAGE_SIZE,
} from "@/modules/purchasing";
import { requireSession } from "@/app/_auth/session";
import {
  cardClass,
  inlineButtonClass,
  inputClass,
  labelClass,
  linkClass,
  selectClass,
  tableCellClass,
  tableHeadCellClass,
} from "@/app/_components/form-styles";
import { Icon } from "@/app/_components/icons";
import { PageHeader, SearchIcon } from "@/app/_components/page-header";
import { PageNotice } from "@/app/_components/page-notice";
import { Pagination, shownRangeText } from "@/app/_components/pagination";
import { formatShortDateTime } from "@/app/_format/date-time";
import { formatMoney } from "@/shared/money";
import { PurchasingSubNav } from "../purchasing-sub-nav";
import {
  hasActivePurchaseOrderFilters,
  parsePurchaseOrderFilters,
  purchaseOrderFiltersHref,
  statusParam,
  type SearchParams,
} from "./filters";
import {
  FORBIDDEN_PAGE_MESSAGE,
  NO_PURCHASE_ORDER_RESULTS_MESSAGE,
  NO_PURCHASE_ORDERS_MESSAGE,
  UNKNOWN_SUPPLIER_TEXT,
} from "./messages";
import { PurchaseOrderStatusBadge } from "./status-badge";

export const metadata: Metadata = {
  title: "Órdenes de compra — AI WhatsApp Agent CRM",
};

const TITLE = "Órdenes de compra";

// La lista de órdenes de compra (brief-22.3, D-10 y D-11): la más nueva primero, el filtro de
// estado, el de proveedor y la búsqueda por número, en la URL. El proveedor de cada fila filtra la
// lista por él, y la ficha del proveedor llega ya filtrada. Tabla en escritorio y tarjetas en móvil,
// como pedidos. Solo admin: a un viewer, purchasing le responde FORBIDDEN y la página lo dice.
export default async function PurchaseOrdersPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const context = await requireSession();
  const filters = parsePurchaseOrderFilters(await searchParams);
  const result = await listPurchaseOrders(context, {
    status: filters.status,
    supplierId: filters.supplierId || null,
    number: filters.number,
    page: filters.page,
  });
  if (!result.ok) {
    return <PageNotice title={TITLE} message={FORBIDDEN_PAGE_MESSAGE} />;
  }
  const timeZone = await getOrganizationTimezone(context);
  const filteredSupplier = filters.supplierId
    ? await getSupplier(context, filters.supplierId)
    : null;
  const supplierName = filteredSupplier?.ok
    ? filteredSupplier.supplier.name
    : UNKNOWN_SUPPLIER_TEXT;
  const filtered = hasActivePurchaseOrderFilters(filters);
  const supplierHref = (supplierId: string) =>
    purchaseOrderFiltersHref({ ...filters, supplierId, page: 1 });

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <PageHeader
        title={TITLE}
        subtitle="Lo que le pedís a cada proveedor, con su número, su total y su estado."
        action={{
          href: "/compras/ordenes/nueva",
          label: "+ Nueva orden de compra",
        }}
      />
      <PurchasingSubNav current="ordenes" />

      <form
        key={purchaseOrderFiltersHref(filters)}
        method="get"
        action="/compras/ordenes"
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
              placeholder="OC-000123"
              autoComplete="off"
              className={`${inputClass} w-48 pl-9`}
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
            <option value="todas">Todas</option>
            <option value="abiertas">Abiertas</option>
            <option value="cerradas">Cerradas</option>
            <option value="canceladas">Canceladas</option>
          </select>
        </div>
        {filters.supplierId ? (
          <input type="hidden" name="proveedor" value={filters.supplierId} />
        ) : null}
        <button type="submit" className={inlineButtonClass}>
          <Icon name="filter" className="size-4" />
          Aplicar filtros
        </button>
        {filtered ? (
          <Link href="/compras/ordenes" className={`${linkClass} py-2`}>
            Limpiar filtros
          </Link>
        ) : null}
      </form>

      {filters.supplierId ? (
        <p className="mt-4 text-sm">
          Órdenes de <span className="font-semibold">{supplierName}</span>.{" "}
          <Link
            href={purchaseOrderFiltersHref({
              ...filters,
              supplierId: "",
              page: 1,
            })}
            className={linkClass}
          >
            Ver las de todos los proveedores
          </Link>
        </p>
      ) : null}

      {result.total === 0 ? (
        <div className={`mt-8 ${cardClass} p-6`}>
          <p>
            {filtered
              ? NO_PURCHASE_ORDER_RESULTS_MESSAGE
              : NO_PURCHASE_ORDERS_MESSAGE}
          </p>
          {!filtered ? (
            <p className="mt-3">
              <Link href="/compras/ordenes/nueva" className={linkClass}>
                Crear la primera
              </Link>
            </p>
          ) : null}
        </div>
      ) : (
        <>
          <div className={`mt-8 hidden overflow-x-auto md:block ${cardClass}`}>
            <table className="w-full border-collapse text-left text-sm">
              <caption className="sr-only">
                Órdenes de compra de la organización
              </caption>
              <thead>
                <tr>
                  <th scope="col" className={tableHeadCellClass}>
                    Número
                  </th>
                  <th scope="col" className={tableHeadCellClass}>
                    Fecha
                  </th>
                  <th scope="col" className={tableHeadCellClass}>
                    Proveedor
                  </th>
                  <th
                    scope="col"
                    className={`${tableHeadCellClass} text-right`}
                  >
                    Líneas
                  </th>
                  <th
                    scope="col"
                    className={`${tableHeadCellClass} text-right`}
                  >
                    Total
                  </th>
                  <th scope="col" className={tableHeadCellClass}>
                    Estado
                  </th>
                </tr>
              </thead>
              <tbody>
                {result.orders.map((order) => (
                  <tr key={order.id}>
                    <td
                      className={`${tableCellClass} font-mono whitespace-nowrap`}
                    >
                      <Link
                        href={`/compras/ordenes/${order.id}`}
                        className={linkClass}
                      >
                        {order.displayNumber}
                      </Link>
                    </td>
                    <td className={`${tableCellClass} whitespace-nowrap`}>
                      {formatShortDateTime(order.createdAt, timeZone)}
                    </td>
                    <td className={tableCellClass}>
                      <Link
                        href={supplierHref(order.supplierId)}
                        className={linkClass}
                      >
                        {order.supplierName}
                        <span className="sr-only">: ver solo sus órdenes</span>
                      </Link>
                    </td>
                    <td className={`${tableCellClass} text-right tabular-nums`}>
                      {order.lineCount}
                    </td>
                    <td
                      className={`${tableCellClass} text-right whitespace-nowrap tabular-nums`}
                    >
                      {formatMoney(order.total, order.currency)}
                    </td>
                    <td className={tableCellClass}>
                      <PurchaseOrderStatusBadge status={order.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <ul
            aria-label="Órdenes de compra de la organización"
            className="mt-6 flex flex-col gap-3 md:hidden"
          >
            {result.orders.map((order) => (
              <li key={order.id} className={`${cardClass} p-4`}>
                <p className="flex flex-wrap items-center justify-between gap-2">
                  <Link
                    href={`/compras/ordenes/${order.id}`}
                    className={`${linkClass} font-mono`}
                  >
                    {order.displayNumber}
                  </Link>
                  <PurchaseOrderStatusBadge status={order.status} />
                </p>
                <p className="mt-1 font-semibold">
                  <Link
                    href={supplierHref(order.supplierId)}
                    className={linkClass}
                  >
                    {order.supplierName}
                    <span className="sr-only">: ver solo sus órdenes</span>
                  </Link>
                </p>
                <p className="mt-1 text-sm text-muted">
                  {formatShortDateTime(order.createdAt, timeZone)} ·{" "}
                  {order.lineCount} {order.lineCount === 1 ? "línea" : "líneas"}{" "}
                  ·{" "}
                  <span className="tabular-nums">
                    {formatMoney(order.total, order.currency)}
                  </span>
                </p>
              </li>
            ))}
          </ul>

          <Pagination
            page={result.page}
            pageCount={result.pageCount}
            rangeText={shownRangeText({
              page: result.page,
              pageSize: PURCHASE_ORDERS_PAGE_SIZE,
              shown: result.orders.length,
              total: result.total,
              singular: "orden",
              plural: "órdenes",
            })}
            hrefFor={(target) =>
              purchaseOrderFiltersHref({ ...filters, page: target })
            }
          />
        </>
      )}

      <p className="mt-6 text-sm text-muted">Fechas en {timeZone}.</p>
    </main>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { getOrganizationTimezone } from "@/modules/organizations";
import {
  getSupplier,
  GOODS_RECEIPTS_PAGE_SIZE,
  listGoodsReceipts,
} from "@/modules/purchasing";
import { requireSession } from "@/app/_auth/session";
import {
  cardClass,
  inlineButtonClass,
  inputClass,
  labelClass,
  linkClass,
  tableCellClass,
  tableHeadCellClass,
} from "@/app/_components/form-styles";
import { Icon } from "@/app/_components/icons";
import { PageHeader, SearchIcon } from "@/app/_components/page-header";
import { PageNotice } from "@/app/_components/page-notice";
import { Pagination, shownRangeText } from "@/app/_components/pagination";
import { formatShortDateTime } from "@/app/_format/date-time";
import { formatMoney } from "@/shared/money";
import {
  FORBIDDEN_PAGE_MESSAGE,
  UNKNOWN_SUPPLIER_TEXT,
} from "../ordenes/messages";
import { PurchasingSubNav } from "../purchasing-sub-nav";
import {
  goodsReceiptFiltersHref,
  hasActiveGoodsReceiptFilters,
  parseGoodsReceiptFilters,
  type SearchParams,
} from "./filters";
import {
  NO_GOODS_RECEIPT_RESULTS_MESSAGE,
  NO_GOODS_RECEIPTS_MESSAGE,
} from "./messages";

export const metadata: Metadata = {
  title: "Recepciones — AI WhatsApp Agent CRM",
};

const TITLE = "Recepciones";

// La lista de recepciones (brief-22.4, D-11 y D-12): la más nueva primero, el filtro de proveedor y
// la búsqueda por número, en la URL. El proveedor de cada fila filtra la lista por él, y la ficha
// del proveedor llega ya filtrada. Tabla en escritorio y tarjetas en móvil, como las órdenes. Solo
// admin: a un viewer, purchasing le responde FORBIDDEN y la página lo dice.
export default async function GoodsReceiptsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const context = await requireSession();
  const filters = parseGoodsReceiptFilters(await searchParams);
  const result = await listGoodsReceipts(context, {
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
  const filtered = hasActiveGoodsReceiptFilters(filters);
  const supplierHref = (supplierId: string) =>
    goodsReceiptFiltersHref({ ...filters, supplierId, page: 1 });

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <PageHeader
        title={TITLE}
        subtitle="La mercadería que llegó de cada proveedor: suma el stock y fija el costo."
        action={{
          href: "/compras/recepciones/nueva",
          label: "+ Nueva recepción",
        }}
      />
      <PurchasingSubNav current="recepciones" />

      <form
        key={goodsReceiptFiltersHref(filters)}
        method="get"
        action="/compras/recepciones"
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
              placeholder="RC-000123"
              autoComplete="off"
              className={`${inputClass} w-48 pl-9`}
            />
            <SearchIcon />
          </div>
        </div>
        {filters.supplierId ? (
          <input type="hidden" name="proveedor" value={filters.supplierId} />
        ) : null}
        <button type="submit" className={inlineButtonClass}>
          <Icon name="search" className="size-4" />
          Buscar
        </button>
        {filtered ? (
          <Link href="/compras/recepciones" className={`${linkClass} py-2`}>
            Limpiar filtros
          </Link>
        ) : null}
      </form>

      {filters.supplierId ? (
        <p className="mt-4 text-sm">
          Recepciones de <span className="font-semibold">{supplierName}</span>.{" "}
          <Link
            href={goodsReceiptFiltersHref({
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
              ? NO_GOODS_RECEIPT_RESULTS_MESSAGE
              : NO_GOODS_RECEIPTS_MESSAGE}
          </p>
          {!filtered ? (
            <p className="mt-3">
              <Link href="/compras/recepciones/nueva" className={linkClass}>
                Registrar la primera
              </Link>
            </p>
          ) : null}
        </div>
      ) : (
        <>
          <div className={`mt-8 hidden overflow-x-auto md:block ${cardClass}`}>
            <table className="w-full border-collapse text-left text-sm">
              <caption className="sr-only">
                Recepciones de la organización
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
                  <th scope="col" className={tableHeadCellClass}>
                    Orden
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
                </tr>
              </thead>
              <tbody>
                {result.receipts.map((receipt) => (
                  <tr key={receipt.id}>
                    <td
                      className={`${tableCellClass} font-mono whitespace-nowrap`}
                    >
                      <Link
                        href={`/compras/recepciones/${receipt.id}`}
                        className={linkClass}
                      >
                        {receipt.displayNumber}
                      </Link>
                    </td>
                    <td className={`${tableCellClass} whitespace-nowrap`}>
                      {formatShortDateTime(receipt.createdAt, timeZone)}
                    </td>
                    <td className={tableCellClass}>
                      <Link
                        href={supplierHref(receipt.supplierId)}
                        className={linkClass}
                      >
                        {receipt.supplierName}
                        <span className="sr-only">
                          : ver solo sus recepciones
                        </span>
                      </Link>
                    </td>
                    <td
                      className={`${tableCellClass} font-mono whitespace-nowrap`}
                    >
                      {receipt.purchaseOrderId ? (
                        <Link
                          href={`/compras/ordenes/${receipt.purchaseOrderId}`}
                          className={linkClass}
                        >
                          {receipt.purchaseOrderDisplayNumber}
                        </Link>
                      ) : (
                        <span className="font-sans text-muted">Sin orden</span>
                      )}
                    </td>
                    <td className={`${tableCellClass} text-right tabular-nums`}>
                      {receipt.lineCount}
                    </td>
                    <td
                      className={`${tableCellClass} text-right whitespace-nowrap tabular-nums`}
                    >
                      {formatMoney(receipt.total, receipt.currency)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <ul
            aria-label="Recepciones de la organización"
            className="mt-6 flex flex-col gap-3 md:hidden"
          >
            {result.receipts.map((receipt) => (
              <li key={receipt.id} className={`${cardClass} p-4`}>
                <p className="flex flex-wrap items-center justify-between gap-2">
                  <Link
                    href={`/compras/recepciones/${receipt.id}`}
                    className={`${linkClass} font-mono`}
                  >
                    {receipt.displayNumber}
                  </Link>
                  <span className="text-sm text-muted">
                    {receipt.purchaseOrderDisplayNumber ?? "Sin orden"}
                  </span>
                </p>
                <p className="mt-1 font-semibold">
                  <Link
                    href={supplierHref(receipt.supplierId)}
                    className={linkClass}
                  >
                    {receipt.supplierName}
                    <span className="sr-only">: ver solo sus recepciones</span>
                  </Link>
                </p>
                <p className="mt-1 text-sm text-muted">
                  {formatShortDateTime(receipt.createdAt, timeZone)} ·{" "}
                  {receipt.lineCount}{" "}
                  {receipt.lineCount === 1 ? "línea" : "líneas"} ·{" "}
                  <span className="tabular-nums">
                    {formatMoney(receipt.total, receipt.currency)}
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
              pageSize: GOODS_RECEIPTS_PAGE_SIZE,
              shown: result.receipts.length,
              total: result.total,
              singular: "recepción",
              plural: "recepciones",
            })}
            hrefFor={(target) =>
              goodsReceiptFiltersHref({ ...filters, page: target })
            }
          />
        </>
      )}

      <p className="mt-6 text-sm text-muted">Fechas en {timeZone}.</p>
    </main>
  );
}
